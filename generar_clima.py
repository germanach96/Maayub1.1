"""
Genera un CSV maestro de clima mensual histórico (normales) para una lista de
aeropuertos, usando la API gratuita de Open-Meteo (Archive / Historical Weather).
No requiere API key.

Dos fases independientes:
  1) fetch_raw()  -> descarga el crudo de cada aeropuerto a raw_weather/{IATA}.json
  2) aggregate()  -> lee esos JSON y calcula las normales mensuales -> clima_destinos.csv

--- IMPORTANTE: LÍMITES DEL TIER GRATUITO ---
Open-Meteo pesa cada petición así:  llamadas = (días / 14) x (variables / 10)
y el plan gratuito permite 10.000 llamadas/día (5.000/hora, 600/minuto).

Con 4 variables, cada aeropuerto pesa (días/14) x 0.4. Por eso NO se pueden bajar
575 aeropuertos a 10 años en un día (serían ~60.000 llamadas = ~6 días).

Este script:
  - Descarga UN aeropuerto por petición.
  - Calcula SOLO la pausa entre peticiones para ir justo por debajo del límite/hora.
  - Si agota la cuota DIARIA (429 sostenido), se detiene limpio en ~3 min (no se
    cuelga horas) y te dice que lo relances más tarde. Es REANUDABLE: al relanzar
    salta lo ya descargado.

Ajusta la ventana de años con START_DATE / END_DATE según cuánto quieras esperar:
  - 1 año  (2024)      -> ~6.000 llamadas -> 1 sola sesión (~1.5h)
  - 3 años (2022-2024) -> ~18.000        -> 2 sesiones (relanzar 1 día después)
  - 5 años (2020-2024) -> ~30.000        -> 3 sesiones
  - 10 años(2015-2024) -> ~60.000        -> ~6 sesiones
"""

import os
import ast
import time
import json
import shutil
import datetime
import requests
import pandas as pd

# =====================================================
# CONFIGURACIÓN
# =====================================================

INPUT_CSV = "airports_flightable_categorized.csv"
RAW_DIR = "raw_weather"          # carpeta con el crudo por aeropuerto
OUTPUT_CSV = "clima_destinos.csv"
FAILED_FILE = "failed_airports.txt"

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"

# --- Ventana de años (cámbiala aquí) ---
START_DATE = "2022-01-01"
END_DATE = "2024-12-31"          # 3 años completos por defecto (balance calidad/tiempo)

DAILY_VARS = "temperature_2m_mean,temperature_2m_max,precipitation_sum,sunshine_duration"
N_VARIABLES = 4                  # nº de variables en DAILY_VARS (para calcular el peso)

TIMEOUT = 120                    # segundos por petición HTTP
PAUSA_MINIMA = 6                 # pausa mínima entre peticiones (segundos)

# Reintentos ante errores normales (timeout, 5xx, red): pocos, con backoff.
BACKOFFS_ERROR = [30, 60, 120]

# Ante 429 hacemos unos pocos reintentos cortos. Si AUN ASÍ sigue fallando,
# asumimos que se agotó la cuota diaria y PARAMOS (no tiene sentido esperar horas).
BACKOFFS_429 = [30, 60, 120]

UMBRAL_LLUVIA_MM = 1.0           # un día "de lluvia" si precip > 1.0 mm
UMBRAL_NULLS = 0.20              # avisar si una variable tiene >20% de nulos


class CuotaAgotada(Exception):
    """Se lanza cuando el 429 persiste: probablemente se agotó la cuota diaria."""
    pass


def _dias_del_rango():
    """Número de días (inclusive) entre START_DATE y END_DATE."""
    d0 = datetime.date.fromisoformat(START_DATE)
    d1 = datetime.date.fromisoformat(END_DATE)
    return (d1 - d0).days + 1


def _pausa_entre_peticiones():
    """Calcula la pausa para ir justo por debajo del límite de 5.000 llamadas/hora.
    peso_por_aeropuerto = (días/14) x (variables/10). Para no pasar de 5.000/hora
    necesitamos >= 0.72 x peso segundos entre peticiones; usamos 0.8 x peso de margen."""
    peso = (_dias_del_rango() / 14.0) * (N_VARIABLES / 10.0)
    return max(PAUSA_MINIMA, round(0.8 * peso, 1))


# =====================================================
# LECTURA DEL LISTADO DE AEROPUERTOS
# =====================================================

def cargar_aeropuertos():
    """Lee el CSV de entrada y devuelve una lista de dicts {iata, lat, lon}.
    El campo 'coordinates' es un dict de Python en texto (comillas simples),
    así que se parsea con ast.literal_eval, NO con json.loads."""
    df = pd.read_csv(INPUT_CSV, sep=";", encoding="utf-8-sig")

    aeropuertos = []
    for _, fila in df.iterrows():
        iata = str(fila["code"]).strip().upper()
        try:
            coords = ast.literal_eval(str(fila["coordinates"]))
            lat = float(coords["lat"])
            lon = float(coords["lon"])
        except (ValueError, SyntaxError, KeyError, TypeError) as e:
            print(f"  Coordenadas inválidas en {iata}, se omite: {e}")
            continue
        aeropuertos.append({"iata": iata, "lat": lat, "lon": lon})

    return aeropuertos


def reset_raw():
    """Borra la carpeta raw_weather/ y el registro de fallos para empezar de cero.
    Útil si cambias la ventana de años (los JSON viejos serían de otro rango)."""
    if os.path.isdir(RAW_DIR):
        shutil.rmtree(RAW_DIR)
    if os.path.exists(FAILED_FILE):
        os.remove(FAILED_FILE)
    print("raw_weather/ y failed_airports.txt borrados. Empezarás desde cero.")


# =====================================================
# FASE 1: DESCARGA DEL CRUDO (REANUDABLE)
# =====================================================

def pedir_localizacion(lat, lon):
    """Descarga los datos de UN aeropuerto. Devuelve el objeto JSON, o None si
    falla por un error puntual (se salta ese aeropuerto). Si el 429 persiste,
    lanza CuotaAgotada para que la descarga se detenga limpiamente."""
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": START_DATE,
        "end_date": END_DATE,
        "daily": DAILY_VARS,
        "timezone": "auto",
        # OJO: no se especifica "models" a propósito (el default funciona en
        # aeropuertos costeros/isla donde era5_land falla).
    }

    intentos_error = 0

    for ronda in range(len(BACKOFFS_429) + 1):
        try:
            resp = requests.get(ARCHIVE_URL, params=params, timeout=TIMEOUT)
        except Exception as e:
            if intentos_error >= len(BACKOFFS_ERROR):
                print(f"  Excepción persistente, se salta: {e}")
                return None
            espera = BACKOFFS_ERROR[intentos_error]
            intentos_error += 1
            print(f"  Excepción: {e} -> reintento en {espera}s")
            time.sleep(espera)
            continue

        # Éxito
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list):
                data = data[0] if data else None
            return data

        # Límite de peticiones
        if resp.status_code == 429:
            if ronda >= len(BACKOFFS_429):
                # Ya reintentamos varias veces y sigue: cuota diaria agotada.
                raise CuotaAgotada()
            retry_after = resp.headers.get("Retry-After")
            if retry_after and str(retry_after).isdigit():
                espera = int(retry_after)
            else:
                espera = BACKOFFS_429[ronda]
            print(f"  429 (límite) -> espera {espera}s y reintento")
            time.sleep(espera)
            continue

        # Otros códigos HTTP
        if intentos_error >= len(BACKOFFS_ERROR):
            print(f"  HTTP {resp.status_code} persistente, se salta")
            return None
        espera = BACKOFFS_ERROR[intentos_error]
        intentos_error += 1
        print(f"  HTTP {resp.status_code} -> reintento en {espera}s")
        time.sleep(espera)

    return None


def fetch_raw():
    """Descarga el crudo de todos los aeropuertos, uno por uno, guardando cada
    uno en raw_weather/{IATA}.json. Salta los ya descargados. Si se agota la
    cuota diaria, se detiene limpiamente (relanzar más tarde para continuar)."""
    os.makedirs(RAW_DIR, exist_ok=True)

    aeropuertos = cargar_aeropuertos()
    pendientes = [
        a for a in aeropuertos
        if not os.path.exists(os.path.join(RAW_DIR, f"{a['iata']}.json"))
    ]
    ya_bajados = len(aeropuertos) - len(pendientes)

    pausa = _pausa_entre_peticiones()
    peso = (_dias_del_rango() / 14.0) * (N_VARIABLES / 10.0)
    coste_total = len(pendientes) * peso

    print(f"Ventana: {START_DATE} a {END_DATE} ({_dias_del_rango()} días)")
    print(f"Peso por aeropuerto: ~{peso:.1f} llamadas | Pausa entre peticiones: {pausa}s")
    print(f"Total: {len(aeropuertos)} | Ya descargados: {ya_bajados} | Pendientes: {len(pendientes)}")
    print(f"Coste de lo pendiente: ~{coste_total:.0f} llamadas (tope diario: 10.000)")
    if coste_total > 10000:
        print("  -> No entra en la cuota de un solo día: se descargará en varias sesiones.")
    print()

    descargados = 0
    total = len(pendientes)
    for idx, aeropuerto in enumerate(pendientes, start=1):
        iata = aeropuerto["iata"]
        try:
            objeto = pedir_localizacion(aeropuerto["lat"], aeropuerto["lon"])
        except CuotaAgotada:
            print(f"\n*** Cuota diaria agotada tras {descargados} aeropuertos en esta sesión. ***")
            print("La cuota de Open-Meteo se reinicia cada día. Vuelve a ejecutar")
            print("fetch_raw() más tarde (o mañana) y continuará donde se quedó.")
            break

        if objeto is None:
            print(f"[{idx}/{total}] {iata} - FALLO (se salta)")
        else:
            with open(os.path.join(RAW_DIR, f"{iata}.json"), "w", encoding="utf-8") as f:
                json.dump(objeto, f)
            descargados += 1
            print(f"[{idx}/{total}] {iata} - OK")

        if idx < total:
            time.sleep(pausa)

    # Recalcular qué falta mirando el disco (sin duplicados entre corridas).
    faltan = [
        a["iata"] for a in aeropuertos
        if not os.path.exists(os.path.join(RAW_DIR, f"{a['iata']}.json"))
    ]
    if faltan:
        with open(FAILED_FILE, "w", encoding="utf-8") as f:
            f.write("\n".join(faltan) + "\n")
        print(f"\nAún faltan {len(faltan)} aeropuertos (ver {FAILED_FILE}).")
        print("Vuelve a ejecutar fetch_raw() para continuar.")
    else:
        if os.path.exists(FAILED_FILE):
            os.remove(FAILED_FILE)
        print(f"\n¡Completo! Los {len(aeropuertos)} aeropuertos están descargados.")
        print("Ya puedes ejecutar aggregate().")


# =====================================================
# FASE 2: AGREGACIÓN A NORMALES MENSUALES
# =====================================================

def normales_de_aeropuerto(iata, daily):
    """A partir de la serie diaria de un aeropuerto, calcula las 12 normales
    mensuales. Devuelve (DataFrame de 12 filas, lista de avisos de nulos)."""
    avisos = []

    df = pd.DataFrame({
        "time": daily.get("time"),
        "tmean": daily.get("temperature_2m_mean"),
        "tmax": daily.get("temperature_2m_max"),
        "precip": daily.get("precipitation_sum"),
        "sun": daily.get("sunshine_duration"),
    })
    df["time"] = pd.to_datetime(df["time"])
    df["anio"] = df["time"].dt.year
    df["mes"] = df["time"].dt.month

    # sunshine_duration viene en SEGUNDOS por día -> pasar a horas.
    df["sol_horas"] = df["sun"] / 3600.0
    # Día de lluvia: precip > umbral. Los nulos (NaN > x = False) no cuentan.
    df["es_lluvia"] = df["precip"] > UMBRAL_LLUVIA_MM

    # Aviso si alguna variable tiene demasiados nulos (se incluye igualmente).
    for col, nombre in [("tmean", "temp_media"), ("tmax", "temp_max_media"),
                        ("precip", "precip"), ("sun", "sunshine")]:
        frac_nulos = df[col].isna().mean()
        if frac_nulos > UMBRAL_NULLS:
            avisos.append(f"{iata}: {nombre} tiene {frac_nulos * 100:.1f}% de nulos")

    # Fase 1: valor por (año, mes). Las medias ignoran nulos por defecto en pandas.
    por_mes_anio = df.groupby(["anio", "mes"]).agg(
        temp_media=("tmean", "mean"),
        temp_max_media=("tmax", "mean"),
        precip_mm=("precip", "sum"),
        dias_lluvia=("es_lluvia", "sum"),
        horas_sol_dia=("sol_horas", "mean"),
    ).reset_index()

    # Fase 2: normal mensual = media de los valores de cada mes calendario.
    normal = por_mes_anio.groupby("mes").agg(
        temp_media=("temp_media", "mean"),
        temp_max_media=("temp_max_media", "mean"),
        precip_mm=("precip_mm", "mean"),
        dias_lluvia=("dias_lluvia", "mean"),
        horas_sol_dia=("horas_sol_dia", "mean"),
    ).reset_index()

    normal.insert(0, "iata", iata)
    return normal, avisos


def aggregate():
    """Lee todos los JSON de raw_weather/, calcula las normales mensuales de
    cada aeropuerto y guarda clima_destinos.csv. Luego valida el resultado."""
    if not os.path.isdir(RAW_DIR):
        print(f"No existe la carpeta {RAW_DIR}. Ejecuta fetch_raw() primero.")
        return

    archivos = sorted(f for f in os.listdir(RAW_DIR) if f.endswith(".json"))
    print(f"Agregando {len(archivos)} aeropuertos desde {RAW_DIR}/ ...")

    tablas = []
    avisos_nulos = []

    for archivo in archivos:
        iata = archivo[:-5]  # quitar ".json"
        with open(os.path.join(RAW_DIR, archivo), encoding="utf-8") as f:
            data = json.load(f)

        daily = data.get("daily")
        if not daily or not daily.get("time"):
            avisos_nulos.append(f"{iata}: sin datos diarios, se omite")
            continue

        normal, avisos = normales_de_aeropuerto(iata, daily)
        tablas.append(normal)
        avisos_nulos.extend(avisos)

    if not tablas:
        print("No se pudo agregar ningún aeropuerto.")
        return

    maestro = pd.concat(tablas, ignore_index=True)

    # Redondear todas las métricas a 1 decimal (dias_lluvia incluido, ej. 4.3).
    cols_num = ["temp_media", "temp_max_media", "precip_mm", "dias_lluvia", "horas_sol_dia"]
    maestro[cols_num] = maestro[cols_num].round(1)
    maestro = maestro[["iata", "mes"] + cols_num]

    maestro.to_csv(OUTPUT_CSV, index=False, encoding="utf-8")
    print(f"\nGuardado {OUTPUT_CSV}")

    # -------------------------------------------------
    # VALIDACIÓN
    # -------------------------------------------------
    n_aeropuertos = maestro["iata"].nunique()
    n_filas = len(maestro)
    print(f"\n--- Validación ---")
    print(f"Aeropuertos: {n_aeropuertos} | Filas: {n_filas} (esperado {n_aeropuertos} x 12 = {n_aeropuertos * 12})")

    meses_por_iata = maestro.groupby("iata")["mes"].nunique()
    incompletos = meses_por_iata[meses_por_iata < 12]
    if len(incompletos) > 0:
        print(f"Aeropuertos con menos de 12 meses ({len(incompletos)}):")
        for iata, n in incompletos.items():
            print(f"  {iata}: {n} meses")
    else:
        print("Todos los aeropuertos tienen sus 12 meses.")

    if avisos_nulos:
        print(f"\n--- Avisos de datos ({len(avisos_nulos)}) ---")
        for aviso in avisos_nulos:
            print(f"  {aviso}")

    # Descarga automática si estamos en Google Colab.
    try:
        from google.colab import files
        files.download(OUTPUT_CSV)
    except Exception:
        pass


# =====================================================
# EJECUCIÓN
# =====================================================
# En Colab, en celdas separadas:
#   reset_raw()     # (opcional) empezar de cero si cambiaste la ventana de años
#   fetch_raw()     # descarga; si agota la cuota diaria para solo, relánzalo luego
#   aggregate()     # cuando estén los 575, genera el CSV

if __name__ == "__main__":
    fetch_raw()
    aggregate()
