"""
Genera un CSV de clima mensual histórico (normales) para una lista de aeropuertos,
usando la API gratuita de Open-Meteo (Archive). No requiere API key.

=== USO: COPIAR Y PEGAR ESTE CÓDIGO EN UNA CELDA DE COLAB Y EJECUTAR ===
No hay que llamar a ninguna función a mano. Al ejecutar, el script:
  1. Monta tu Google Drive (un clic la primera vez) para que el progreso no se pierda.
  2. Mira el CSV que va creando y baja SOLO los aeropuertos que aún no tienen datos.
  3. Va guardando cada aeropuerto en el CSV según lo descarga.
  4. PARA solo cuando se agota la cuota diaria de Open-Meteo.
La próxima vez que lo ejecutes, continúa con los que falten. Cuando estén todos,
el CSV queda completo y se descarga.

=== LÍMITES DEL TIER GRATUITO ===
Open-Meteo pesa cada petición como (días/14) x (variables/10) por localización,
con un tope de 10.000 llamadas/día. A 10 años y 4 variables, cada aeropuerto pesa
~104 llamadas -> ~96 aeropuertos/día -> los 575 tardan ~6 ejecuciones (una por día).
Para terminar en UNA sola ejecución, cambia START_DATE a "2024-01-01" (1 año).

REQUISITO: sube 'airports_flightable_categorized.csv' a Colab (a /content) o déjalo
en la carpeta de Drive indicada abajo. El CSV de salida se guarda en esa carpeta de
Drive, así que sobrevive entre sesiones.
"""

import os
import ast
import time
import json
import datetime
import requests
import pandas as pd

# =====================================================
# CONFIGURACIÓN
# =====================================================

# Carpeta en tu Drive donde se guardan el CSV de salida (y donde puedes dejar el
# CSV de aeropuertos). Se crea sola si no existe.
CARPETA_DRIVE = "/content/drive/MyDrive/maayub_clima"

INPUT_CSV_NAME = "airports_flightable_categorized.csv"

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"

# --- Ventana de años (cámbiala aquí) ---
# 10 años = normal climática de verdad, pero ~6 ejecuciones (una por día).
# Para terminar en 1 sola ejecución, pon START_DATE = "2024-01-01".
START_DATE = "2015-01-01"
END_DATE = "2024-12-31"

DAILY_VARS = "temperature_2m_mean,temperature_2m_max,precipitation_sum,sunshine_duration"
N_VARIABLES = 4

TIMEOUT = 120                    # segundos por petición HTTP
PAUSA_MINIMA = 6                 # pausa mínima entre peticiones (segundos)

# Reintentos ante errores puntuales (timeout, 5xx, red).
BACKOFFS_ERROR = [30, 60, 120]
# Ante 429: unos pocos reintentos cortos; si sigue, asumimos cuota diaria agotada.
BACKOFFS_429 = [30, 60, 120]

UMBRAL_LLUVIA_MM = 1.0           # un día "de lluvia" si precip > 1.0 mm
UMBRAL_NULLS = 0.20              # avisar si una variable tiene >20% de nulos

# Columnas del CSV de salida (en orden).
COLS = ["iata", "mes", "temp_media", "temp_max_media",
        "precip_mm", "dias_lluvia", "horas_sol_dia"]
COLS_NUM = ["temp_media", "temp_max_media", "precip_mm", "dias_lluvia", "horas_sol_dia"]


class CuotaAgotada(Exception):
    """Se lanza cuando el 429 persiste: probablemente se agotó la cuota diaria."""
    pass


# =====================================================
# UTILIDADES
# =====================================================

def _dias_del_rango():
    d0 = datetime.date.fromisoformat(START_DATE)
    d1 = datetime.date.fromisoformat(END_DATE)
    return (d1 - d0).days + 1


def _pausa_entre_peticiones():
    """Pausa para ir justo por debajo del límite de 5.000 llamadas/hora.
    peso = (días/14) x (variables/10); pausa >= 0.8 x peso segundos."""
    peso = (_dias_del_rango() / 14.0) * (N_VARIABLES / 10.0)
    return max(PAUSA_MINIMA, round(0.8 * peso, 1))


def _nombre_csv_salida():
    """El CSV lleva los años en el nombre. Así, si cambias la ventana de años,
    se crea un archivo nuevo (no se mezclan datos de rangos distintos) y el
    reanudado sigue funcionando por sí solo."""
    anio_ini = START_DATE[:4]
    anio_fin = END_DATE[:4]
    return f"clima_destinos_{anio_ini}_{anio_fin}.csv"


def cargar_aeropuertos(ruta):
    """Lee el CSV de aeropuertos y devuelve una lista de dicts {iata, lat, lon}.
    El campo 'coordinates' es un dict de Python en texto (comillas simples)."""
    df = pd.read_csv(ruta, sep=";", encoding="utf-8-sig")
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


def iatas_ya_en_csv(csv_path):
    """Devuelve el conjunto de IATA que YA tienen datos en el CSV de salida.
    Es el registro de progreso: la próxima ejecución salta estos."""
    if not os.path.exists(csv_path):
        return set()
    try:
        df = pd.read_csv(csv_path)
        return set(df["iata"].astype(str).str.upper().unique())
    except Exception:
        return set()


def localizar_input():
    """Busca el CSV de aeropuertos en /content o en la carpeta de Drive."""
    candidatos = [
        INPUT_CSV_NAME,
        os.path.join("/content", INPUT_CSV_NAME),
        os.path.join(CARPETA_DRIVE, INPUT_CSV_NAME),
    ]
    for p in candidatos:
        if os.path.exists(p):
            return p
    return None


# =====================================================
# DESCARGA DE UN AEROPUERTO
# =====================================================

def pedir_localizacion(lat, lon):
    """Descarga los datos de UN aeropuerto. Devuelve el objeto JSON, None si
    falla por un error puntual, o lanza CuotaAgotada si el 429 persiste."""
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": START_DATE,
        "end_date": END_DATE,
        "daily": DAILY_VARS,
        "timezone": "auto",
        # No se especifica "models" a propósito (el default funciona en costa/isla).
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

        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list):
                data = data[0] if data else None
            return data

        if resp.status_code == 429:
            if ronda >= len(BACKOFFS_429):
                raise CuotaAgotada()
            retry_after = resp.headers.get("Retry-After")
            if retry_after and str(retry_after).isdigit():
                espera = int(retry_after)
            else:
                espera = BACKOFFS_429[ronda]
            print(f"  429 (límite) -> espera {espera}s y reintento")
            time.sleep(espera)
            continue

        if intentos_error >= len(BACKOFFS_ERROR):
            print(f"  HTTP {resp.status_code} persistente, se salta")
            return None
        espera = BACKOFFS_ERROR[intentos_error]
        intentos_error += 1
        print(f"  HTTP {resp.status_code} -> reintento en {espera}s")
        time.sleep(espera)

    return None


def normales_de_aeropuerto(iata, daily):
    """A partir de la serie diaria de un aeropuerto, calcula sus 12 normales
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
    df["sol_horas"] = df["sun"] / 3600.0            # segundos -> horas
    df["es_lluvia"] = df["precip"] > UMBRAL_LLUVIA_MM

    for col, nombre in [("tmean", "temp_media"), ("tmax", "temp_max_media"),
                        ("precip", "precip"), ("sun", "sunshine")]:
        frac_nulos = df[col].isna().mean()
        if frac_nulos > UMBRAL_NULLS:
            avisos.append(f"{iata}: {nombre} {frac_nulos * 100:.1f}% nulos")

    # Fase 1: valor por (año, mes).
    por_mes_anio = df.groupby(["anio", "mes"]).agg(
        temp_media=("tmean", "mean"),
        temp_max_media=("tmax", "mean"),
        precip_mm=("precip", "sum"),
        dias_lluvia=("es_lluvia", "sum"),
        horas_sol_dia=("sol_horas", "mean"),
    ).reset_index()

    # Fase 2: normal mensual = media de cada mes calendario.
    normal = por_mes_anio.groupby("mes").agg(
        temp_media=("temp_media", "mean"),
        temp_max_media=("temp_max_media", "mean"),
        precip_mm=("precip_mm", "mean"),
        dias_lluvia=("dias_lluvia", "mean"),
        horas_sol_dia=("horas_sol_dia", "mean"),
    ).reset_index()
    normal.insert(0, "iata", iata)
    return normal, avisos


# =====================================================
# FLUJO PRINCIPAL (se ejecuta solo al pegar y correr)
# =====================================================

def ejecutar():
    # 1) Montar Drive para que el CSV persista entre sesiones.
    try:
        from google.colab import drive
        drive.mount("/content/drive")
    except Exception as e:
        print(f"(Aviso) No se pudo montar Drive, se usará disco local: {e}")

    os.makedirs(CARPETA_DRIVE, exist_ok=True)
    csv_path = os.path.join(CARPETA_DRIVE, _nombre_csv_salida())

    # 2) Localizar el CSV de aeropuertos.
    input_path = localizar_input()
    if input_path is None:
        print(f"ERROR: no encuentro '{INPUT_CSV_NAME}'.")
        print(f"Súbelo a /content o déjalo en {CARPETA_DRIVE} y vuelve a ejecutar.")
        return
    aeropuertos = cargar_aeropuertos(input_path)

    # 3) Ver qué falta (los que aún no están en el CSV de salida).
    hechos = iatas_ya_en_csv(csv_path)
    pendientes = [a for a in aeropuertos if a["iata"] not in hechos]

    pausa = _pausa_entre_peticiones()
    peso = (_dias_del_rango() / 14.0) * (N_VARIABLES / 10.0)

    print(f"CSV de salida: {csv_path}")
    print(f"Ventana: {START_DATE} a {END_DATE} | peso ~{peso:.1f} llamadas/aeropuerto | pausa {pausa}s")
    print(f"Aeropuertos: {len(aeropuertos)} | ya con datos: {len(hechos)} | pendientes: {len(pendientes)}")

    if not pendientes:
        print("\n¡Ya están todos! El CSV está completo.")
        _descargar(csv_path)
        return

    print(f"Cuota diaria: ~10.000 llamadas -> ~{int(10000 / peso)} aeropuertos por ejecución.\n")

    # 4) Descargar los pendientes, guardando cada uno en el CSV al momento.
    nuevos = 0
    total = len(pendientes)
    for idx, aeropuerto in enumerate(pendientes, start=1):
        iata = aeropuerto["iata"]
        try:
            objeto = pedir_localizacion(aeropuerto["lat"], aeropuerto["lon"])
        except CuotaAgotada:
            print(f"\n*** Límite diario alcanzado (bajados {nuevos} nuevos hoy). ***")
            print("Vuelve a ejecutar este mismo código mañana y seguirá con los que falten.")
            break

        daily = objeto.get("daily") if objeto else None
        if not daily or not daily.get("time"):
            print(f"[{idx}/{total}] {iata} - sin datos (se salta)")
        else:
            normal, avisos = normales_de_aeropuerto(iata, daily)
            normal[COLS_NUM] = normal[COLS_NUM].round(1)
            normal = normal[COLS]
            # Añadir al CSV (cabecera solo si el archivo aún no existe).
            escribir_cabecera = not os.path.exists(csv_path)
            normal.to_csv(csv_path, mode="a", header=escribir_cabecera,
                          index=False, encoding="utf-8")
            nuevos += 1
            extra = "  (aviso nulos)" if avisos else ""
            print(f"[{idx}/{total}] {iata} - OK{extra}")

        if idx < total:
            time.sleep(pausa)

    # 5) Resumen.
    hechos = iatas_ya_en_csv(csv_path)
    faltan = len(aeropuertos) - len(hechos)
    print(f"\nProgreso: {len(hechos)}/{len(aeropuertos)} aeropuertos en el CSV.")
    if faltan == 0:
        print("¡COMPLETO! Se descarga el CSV.")
        _descargar(csv_path)
    else:
        print(f"Faltan {faltan}. Vuelve a ejecutar el código (mañana) para continuar.")


def _descargar(csv_path):
    """Ofrece el CSV para descargar si estamos en Colab."""
    try:
        from google.colab import files
        files.download(csv_path)
    except Exception:
        pass


# Al pegar y ejecutar en Colab, esto arranca todo el proceso automáticamente.
if __name__ == "__main__":
    ejecutar()
