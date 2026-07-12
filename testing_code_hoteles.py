import requests
import pandas as pd
from datetime import date, timedelta
from google.colab import files

# =====================================================
# CONFIGURACIÓN
# =====================================================

TOKEN = "20c5066cf5c092b6d28afd9a02032bf0"

# --- Input del usuario (solo uno) ---
DESTINO = input("Destino (IATA, ej: BKK): ").upper().strip()

# --- Parámetros fijos (cambiar a mano si hace falta) ---
NOCHES = 3
ADULTS = 2
CURRENCY = "eur"
LIMIT = 100  # máximo de hoteles a traer (el default de la API es 4)

# CHECK_IN: primer viernes a ~60 días vista desde hoy.
# Se calcula solo: sumamos 60 días y avanzamos hasta caer en viernes (weekday 4).
HOY = date.today()
_base = HOY + timedelta(days=60)
_dias_hasta_viernes = (4 - _base.weekday()) % 7
CHECK_IN = _base + timedelta(days=_dias_hasta_viernes)
CHECK_OUT = CHECK_IN + timedelta(days=NOCHES)

CHECK_IN_STR = CHECK_IN.isoformat()
CHECK_OUT_STR = CHECK_OUT.isoformat()

URL = "https://engine.hotellook.com/api/v2/cache.json"
URL_LOOKUP = "https://engine.hotellook.com/api/v2/lookup.json"

print("\nConfiguración:")
print(f"  Destino    : {DESTINO}")
print(f"  Check-in   : {CHECK_IN_STR} ({CHECK_IN.strftime('%A')})")
print(f"  Check-out  : {CHECK_OUT_STR} ({NOCHES} noches)")
print(f"  Adultos    : {ADULTS}")
print(f"  Moneda     : {CURRENCY}")
print(f"  Límite     : {LIMIT}")

# =====================================================
# EXTRA: LOOKUP (inspección de la localización)
# =====================================================
# Antes de pedir precios miramos qué localización resuelve la API para el IATA.
# Trae hotelsCount, id de la localización y coordenadas. No se guarda en el CSV.

params_lookup = {
    "query": DESTINO,
    "lookFor": "both",
    "limit": 1,
    "token": TOKEN
}

resp_lookup = requests.get(URL_LOOKUP, params=params_lookup)

print("\n=== LOOKUP ===")
print("Status Code:", resp_lookup.status_code)

data_lookup = resp_lookup.json()
locations = data_lookup.get("results", {}).get("locations", [])

print("locations:")
print(locations)

# =====================================================
# PARÁMETROS (cache de precios de hoteles)
# =====================================================

params = {
    "location": DESTINO,
    "checkIn": CHECK_IN_STR,
    "checkOut": CHECK_OUT_STR,
    "currency": CURRENCY,
    "limit": LIMIT,
    "token": TOKEN
}

print("\nParámetros enviados:")
print(params)

# =====================================================
# CONSULTA
# =====================================================

response = requests.get(URL, params=params)

print("\nStatus Code:", response.status_code)

# Cabeceras de rate limit (60 req/min). Con una sola llamada no aplica,
# pero las imprimimos igual para tenerlas a la vista.
print("\nRate limit:")
print("  X-RateLimit-Limit    :", response.headers.get("X-RateLimit-Limit"))
print("  X-RateLimit-Remaining:", response.headers.get("X-RateLimit-Remaining"))
print("  X-RateLimit-Interval :", response.headers.get("X-RateLimit-Interval"))

data = response.json()

# =====================================================
# RESULTADOS
# =====================================================

# La respuesta de cache.json es una lista de hoteles (puede venir vacía para
# destinos poco buscados: eso NO es un error, es una caché sin datos).
if isinstance(data, list) and len(data) > 0:

    # Aplanamos los campos anidados (location.geo.lat, location.country, etc.)
    df = pd.json_normalize(data, sep=".")

    # Columnas de contexto al principio.
    df.insert(0, "query_iata", DESTINO)
    df.insert(1, "check_in", CHECK_IN_STR)
    df.insert(2, "check_out", CHECK_OUT_STR)
    df.insert(3, "adults", ADULTS)
    df.insert(4, "capturado_el", pd.Timestamp.now().isoformat())

    print(f"\nSe encontraron {len(df)} hoteles.")

    print("\nColumnas encontradas:")
    print(list(df.columns))

    print("\nPreview (primeras 3 filas):")
    display(df.head(3))

    nombre_archivo = f"hotel_test_{DESTINO}_{HOY.isoformat()}.csv"

    df.to_csv(
        nombre_archivo,
        sep=",",
        index=False,
        encoding="utf-8",
        decimal="."
    )

    files.download(nombre_archivo)

else:
    print("\nSin resultados: la caché no devolvió hoteles para este destino/fechas.")
    print(data)
