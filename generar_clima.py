"""
Genera un CSV maestro de clima mensual histórico (normales de 10 años) para una
lista de aeropuertos, usando la API gratuita de Open-Meteo (Archive / Historical
Weather). No requiere API key.

El proceso tiene dos fases independientes:
  1) fetch_raw()  -> descarga el crudo de cada aeropuerto a raw_weather/{IATA}.json
  2) aggregate()  -> lee esos JSON y calcula las normales mensuales -> clima_destinos.csv

Se pueden ejecutar por separado: si ya descargaste el crudo, puedes re-agregar
sin volver a descargar. La descarga es REANUDABLE (salta lo ya bajado).

Esta versión está pensada para ser LENTA pero FIABLE: descarga un aeropuerto
por petición (llamadas ligeras) y, si topa el límite del tier gratuito (HTTP
429), espera con paciencia y reintenta en vez de rendirse. Tarda ~2 horas.
"""

import os
import ast
import time
import json
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
START_DATE = "2015-01-01"
END_DATE = "2024-12-31"          # 10 años completos, sin 2025/2026 parciales
DAILY_VARS = "temperature_2m_mean,temperature_2m_max,precipitation_sum,sunshine_duration"

# Descargamos UN aeropuerto por petición: la llamada es mucho más ligera y, si
# algo falla, solo afecta a ese aeropuerto (no a un lote entero).
PAUSA_ENTRE_PETICIONES = 12      # segundos entre peticiones (~2h para los 575)
TIMEOUT = 120                    # segundos por petición HTTP

# Reintentos ante errores normales (timeouts, 5xx, red): pocos y con backoff.
MAX_REINTENTOS_ERROR = 5
BACKOFFS_ERROR = [30, 60, 120, 240, 480]

# Manejo del límite de peticiones (HTTP 429): en vez de rendirse, ESPERAMOS y
# reintentamos con paciencia hasta que el límite se libere.
ESPERA_429_BASE = 60             # primera espera ante un 429 (segundos)
ESPERA_429_MAX = 600             # tope de espera (10 min)
MAX_RONDAS_429 = 10              # cuántas veces aguantamos un 429 antes de rendirnos

UMBRAL_LLUVIA_MM = 1.0           # un día "de lluvia" si precip > 1.0 mm
UMBRAL_NULLS = 0.20              # avisar si una variable tiene >20% de nulos


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


# =====================================================
# FASE 1: DESCARGA DEL CRUDO (REANUDABLE)
# =====================================================

def pedir_localizacion(lat, lon):
    """Descarga los datos de UN aeropuerto. Devuelve el objeto JSON o None si
    falla definitivamente. Ante un 429 (límite) espera con paciencia y reintenta;
    ante otros errores, reintenta unas pocas veces con backoff."""
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

    intentos_error = 0     # cuenta de errores "normales" (timeout, 5xx, red)
    rondas_429 = 0         # cuenta de veces que hemos aguantado un 429
    espera_429 = ESPERA_429_BASE

    while True:
        try:
            resp = requests.get(ARCHIVE_URL, params=params, timeout=TIMEOUT)
        except Exception as e:
            intentos_error += 1
            if intentos_error > MAX_REINTENTOS_ERROR:
                print(f"  Excepción persistente, se abandona: {e}")
                return None
            espera = BACKOFFS_ERROR[intentos_error - 1]
            print(f"  Excepción: {e} -> reintento {intentos_error}/{MAX_REINTENTOS_ERROR} en {espera}s")
            time.sleep(espera)
            continue

        # Éxito
        if resp.status_code == 200:
            data = resp.json()
            # Con una sola coordenada la API devuelve un dict (no una lista).
            if isinstance(data, list):
                data = data[0] if data else None
            return data

        # Límite de peticiones: esperar (respetando Retry-After si viene) y reintentar.
        if resp.status_code == 429:
            rondas_429 += 1
            if rondas_429 > MAX_RONDAS_429:
                print(f"  429 persistente tras {MAX_RONDAS_429} esperas, se abandona")
                return None
            retry_after = resp.headers.get("Retry-After")
            if retry_after and str(retry_after).isdigit():
                espera = int(retry_after)
            else:
                espera = espera_429
                espera_429 = min(espera_429 * 2, ESPERA_429_MAX)  # escalar la próxima
            print(f"  429 (límite) -> espera {espera}s y reintento (ronda {rondas_429}/{MAX_RONDAS_429})")
            time.sleep(espera)
            continue

        # Otros códigos HTTP: reintentar unas pocas veces.
        intentos_error += 1
        if intentos_error > MAX_REINTENTOS_ERROR:
            print(f"  HTTP {resp.status_code} persistente, se abandona")
            return None
        espera = BACKOFFS_ERROR[intentos_error - 1]
        print(f"  HTTP {resp.status_code} -> reintento {intentos_error}/{MAX_REINTENTOS_ERROR} en {espera}s")
        time.sleep(espera)


def fetch_raw():
    """Descarga el crudo de todos los aeropuertos, UNO POR UNO, guardando cada
    uno en raw_weather/{IATA}.json inmediatamente. Salta los ya descargados."""
    os.makedirs(RAW_DIR, exist_ok=True)

    aeropuertos = cargar_aeropuertos()

    # REANUDABLE: nos quedamos solo con los que no tienen ya su JSON guardado.
    pendientes = [
        a for a in aeropuertos
        if not os.path.exists(os.path.join(RAW_DIR, f"{a['iata']}.json"))
    ]
    ya_bajados = len(aeropuertos) - len(pendientes)
    print(f"Total: {len(aeropuertos)} | Ya descargados: {ya_bajados} | Pendientes: {len(pendientes)}")

    total = len(pendientes)
    for idx, aeropuerto in enumerate(pendientes, start=1):
        iata = aeropuerto["iata"]
        objeto = pedir_localizacion(aeropuerto["lat"], aeropuerto["lon"])

        if objeto is None:
            print(f"[{idx}/{total}] {iata} - FALLO")
        else:
            ruta = os.path.join(RAW_DIR, f"{iata}.json")
            with open(ruta, "w", encoding="utf-8") as f:
                json.dump(objeto, f)
            print(f"[{idx}/{total}] {iata} - OK")

        # Pausa entre peticiones (no hace falta tras la última).
        if idx < total:
            time.sleep(PAUSA_ENTRE_PETICIONES)

    # Registro de los que aún faltan (se recalcula mirando qué JSON existen,
    # así el fichero siempre refleja la realidad, sin duplicados entre corridas).
    faltan = [
        a["iata"] for a in aeropuertos
        if not os.path.exists(os.path.join(RAW_DIR, f"{a['iata']}.json"))
    ]
    if faltan:
        with open(FAILED_FILE, "w", encoding="utf-8") as f:
            f.write("\n".join(faltan) + "\n")
        print(f"\nDescarga terminada. Faltan {len(faltan)} aeropuertos (ver {FAILED_FILE}).")
        print("Vuelve a ejecutar fetch_raw() para reintentar solo los que faltan.")
    else:
        # Si ya están todos, limpiamos el fichero de fallos si existía.
        if os.path.exists(FAILED_FILE):
            os.remove(FAILED_FILE)
        print(f"\nDescarga terminada. Los {len(aeropuertos)} aeropuertos están descargados.")


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

    # Fase 2: normal mensual = media de los ~10 valores de cada mes calendario.
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

    # Orden final de columnas.
    maestro = maestro[["iata", "mes"] + cols_num]

    maestro.to_csv(OUTPUT_CSV, index=False, encoding="utf-8")
    print(f"\nGuardado {OUTPUT_CSV}")

    # -------------------------------------------------
    # VALIDACIÓN
    # -------------------------------------------------
    n_filas = len(maestro)
    n_aeropuertos = maestro["iata"].nunique()
    print(f"\n--- Validación ---")
    print(f"Filas: {n_filas} (esperado 6900 = 575 x 12)")
    print(f"Aeropuertos en el CSV: {n_aeropuertos}")

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
# En Colab puedes llamar a las funciones por separado en celdas distintas:
#   fetch_raw()     # descarga (reanudable)
#   aggregate()     # agrega y genera el CSV
# Aquí se ejecutan las dos en orden por comodidad.

if __name__ == "__main__":
    fetch_raw()
    aggregate()
