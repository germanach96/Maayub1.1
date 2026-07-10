"""
Genera un CSV maestro de clima mensual histórico (normales de 10 años) para una
lista de aeropuertos, usando la API gratuita de Open-Meteo (Archive / Historical
Weather). No requiere API key.

El proceso tiene dos fases independientes:
  1) fetch_raw()  -> descarga el crudo de cada aeropuerto a raw_weather/{IATA}.json
  2) aggregate()  -> lee esos JSON y calcula las normales mensuales -> clima_destinos.csv

Se pueden ejecutar por separado: si ya descargaste el crudo, puedes re-agregar
sin volver a descargar. La descarga es REANUDABLE (salta lo ya bajado).
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

TAM_LOTE = 15                    # aeropuertos por petición
PAUSA_ENTRE_PETICIONES = 10      # segundos entre peticiones (límite del tier gratuito)
BACKOFFS = [30, 60, 120]         # espera antes de cada reintento (3 reintentos)
TIMEOUT = 120                    # segundos por petición HTTP

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

def pedir_lote(params, n_esperados):
    """Hace la petición de un lote con reintentos (3) y backoff exponencial.
    Devuelve la lista de objetos JSON (uno por coordenada, en el mismo orden)
    o None si el lote falla definitivamente."""
    for intento in range(len(BACKOFFS) + 1):  # 1 intento inicial + 3 reintentos
        try:
            resp = requests.get(ARCHIVE_URL, params=params, timeout=TIMEOUT)
            if resp.status_code == 200:
                data = resp.json()
                # Con una sola coordenada la API devuelve un dict, no una lista.
                if isinstance(data, dict):
                    data = [data]
                # La respuesta debe traer un objeto por coordenada, en orden.
                if len(data) != n_esperados:
                    print(f"  Respuesta con {len(data)} objetos, esperaba {n_esperados} (intento {intento + 1})")
                else:
                    return data
            else:
                print(f"  HTTP {resp.status_code} (intento {intento + 1})")
        except Exception as e:
            print(f"  Excepción: {e} (intento {intento + 1})")

        # Si aún quedan reintentos, esperar el backoff correspondiente.
        if intento < len(BACKOFFS):
            time.sleep(BACKOFFS[intento])

    return None


def fetch_raw():
    """Descarga el crudo de todos los aeropuertos en lotes, guardando cada uno
    en raw_weather/{IATA}.json inmediatamente. Salta los ya descargados."""
    os.makedirs(RAW_DIR, exist_ok=True)

    aeropuertos = cargar_aeropuertos()

    # REANUDABLE: nos quedamos solo con los que no tienen ya su JSON guardado.
    pendientes = [
        a for a in aeropuertos
        if not os.path.exists(os.path.join(RAW_DIR, f"{a['iata']}.json"))
    ]
    ya_bajados = len(aeropuertos) - len(pendientes)
    print(f"Total: {len(aeropuertos)} | Ya descargados: {ya_bajados} | Pendientes: {len(pendientes)}")

    # Partimos los pendientes en lotes de TAM_LOTE.
    lotes = [pendientes[i:i + TAM_LOTE] for i in range(0, len(pendientes), TAM_LOTE)]
    total_lotes = len(lotes)

    for idx, lote in enumerate(lotes, start=1):
        lats = ",".join(str(a["lat"]) for a in lote)
        lons = ",".join(str(a["lon"]) for a in lote)
        iatas = [a["iata"] for a in lote]
        etiqueta = f"{iatas[0]}...{iatas[-1]}" if len(iatas) > 1 else iatas[0]

        params = {
            "latitude": lats,
            "longitude": lons,
            "start_date": START_DATE,
            "end_date": END_DATE,
            "daily": DAILY_VARS,
            "timezone": "auto",
            # OJO: no se especifica "models" a propósito (el default funciona en
            # aeropuertos costeros/isla donde era5_land falla).
        }

        resultado = pedir_lote(params, len(lote))

        if resultado is None:
            # Fallo definitivo: registrar los IATA y continuar con el siguiente lote.
            with open(FAILED_FILE, "a", encoding="utf-8") as f:
                for it in iatas:
                    f.write(it + "\n")
            print(f"Lote {idx}/{total_lotes} ({etiqueta}) - FALLO (registrado en {FAILED_FILE})")
        else:
            # Guardar el crudo de cada aeropuerto inmediatamente (reanudable).
            for aeropuerto, objeto in zip(lote, resultado):
                ruta = os.path.join(RAW_DIR, f"{aeropuerto['iata']}.json")
                with open(ruta, "w", encoding="utf-8") as f:
                    json.dump(objeto, f)
            print(f"Lote {idx}/{total_lotes} ({etiqueta}) - OK")

        # Pausa entre peticiones (no hace falta tras la última).
        if idx < total_lotes:
            time.sleep(PAUSA_ENTRE_PETICIONES)

    print("\nDescarga terminada.")


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
