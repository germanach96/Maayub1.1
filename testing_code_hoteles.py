import requests
import pandas as pd
import time
from datetime import date, timedelta
from google.colab import files

# =====================================================
# CONFIGURACIÓN
# =====================================================
#
# NOTA IMPORTANTE:
# La API de hoteles de Hotellook/Travelpayouts (engine.hotellook.com) fue
# CERRADA en 2025, por eso el token de vuelos ya no sirve para hoteles.
# Este script usa la API de Booking.com vía RapidAPI (booking-com15), que
# necesita SU PROPIA key (no la de vuelos).
#
# Para conseguir la key:
#   1. Crear cuenta en https://rapidapi.com
#   2. Suscribirse (plan gratis) a la API "Booking.com" de DataCrawler:
#      https://rapidapi.com/DataCrawler/api/booking-com15
#   3. Copiar aquí la "X-RapidAPI-Key" que te dan en la pestaña de la API.

RAPIDAPI_KEY = "1260627abemsh5af49300bfd82acp1ab3f6jsn88a333740fba"
RAPIDAPI_HOST = "booking-com15.p.rapidapi.com"

# --- Input del usuario (solo uno) ---
DESTINO = input("Destino (IATA o nombre de ciudad, ej: BCN o Barcelona): ").strip()

# --- Parámetros fijos (cambiar a mano si hace falta) ---
NOCHES = 3
ADULTS = 2
ROOM_QTY = 1
CURRENCY = "EUR"
LOCALE = "en-us"
# Tope de hoteles a traer. La API pagina ~20 por página y cada página = 1 request.
# OJO: el plan gratis de RapidAPI da solo 50 requests/mes, así que no te pases
# mientras exploras (40 = ~2 páginas = ~2 requests + 1 del destino por ejecución).
MAX_HOTELES = 40

# CHECK_IN: primer viernes a ~60 días vista desde hoy.
# Se calcula solo: sumamos 60 días y avanzamos hasta caer en viernes (weekday 4).
HOY = date.today()
_base = HOY + timedelta(days=60)
_dias_hasta_viernes = (4 - _base.weekday()) % 7
CHECK_IN = _base + timedelta(days=_dias_hasta_viernes)
CHECK_OUT = CHECK_IN + timedelta(days=NOCHES)

CHECK_IN_STR = CHECK_IN.isoformat()
CHECK_OUT_STR = CHECK_OUT.isoformat()

URL_DEST = f"https://{RAPIDAPI_HOST}/api/v1/hotels/searchDestination"
URL_HOTELS = f"https://{RAPIDAPI_HOST}/api/v1/hotels/searchHotels"

HEADERS = {
    "X-RapidAPI-Key": RAPIDAPI_KEY,
    "X-RapidAPI-Host": RAPIDAPI_HOST
}

print("\nConfiguración:")
print(f"  Destino    : {DESTINO}")
print(f"  Check-in   : {CHECK_IN_STR} ({CHECK_IN.strftime('%A')})")
print(f"  Check-out  : {CHECK_OUT_STR} ({NOCHES} noches)")
print(f"  Adultos    : {ADULTS}")
print(f"  Moneda     : {CURRENCY}")
print(f"  Máx hoteles: {MAX_HOTELES}")


# Imprime todas las cabeceras de rate limit que traiga la respuesta
# (RapidAPI las nombra tipo x-ratelimit-*; las mostramos todas).
def imprimir_rate_limit(resp):
    encontradas = {k: v for k, v in resp.headers.items() if "ratelimit" in k.lower()}
    print("Rate limit:")
    if encontradas:
        for k, v in encontradas.items():
            print(f"  {k}: {v}")
    else:
        print("  (la respuesta no trae cabeceras de rate limit)")


# =====================================================
# PASO 1: BUSCAR DESTINO (equivalente al viejo lookup)
# =====================================================
# Convierte el IATA/nombre en un dest_id que entiende la API de hoteles.
# Imprimimos el bloque completo de resultados para inspección (trae dest_id,
# search_type, coordenadas, país...). No se guarda en el CSV.

params_dest = {"query": DESTINO}

resp_dest = requests.get(URL_DEST, headers=HEADERS, params=params_dest)

print("\n=== SEARCH DESTINATION ===")
print("Status Code:", resp_dest.status_code)
imprimir_rate_limit(resp_dest)

data_dest = resp_dest.json()
destinos = data_dest.get("data", []) or []

print("data (destinos):")
print(destinos)

if not destinos:
    print("\nSin destinos: la API no resolvió ninguna localización para esa búsqueda.")
    raise SystemExit

# Preferimos un resultado de tipo ciudad (search_type == "CITY"); si no, el primero.
elegido = next((d for d in destinos if str(d.get("search_type", "")).upper() == "CITY"), destinos[0])
DEST_ID = elegido.get("dest_id")
SEARCH_TYPE = elegido.get("search_type", "CITY")

print(f"\nDestino elegido: {elegido.get('name')} "
      f"(dest_id={DEST_ID}, search_type={SEARCH_TYPE})")

# =====================================================
# PASO 2: BUSCAR HOTELES (cache de precios)
# =====================================================
# La API pagina los resultados; recorremos páginas hasta llegar a MAX_HOTELES
# o hasta que una página venga vacía.

hoteles = []
pagina = 1

while len(hoteles) < MAX_HOTELES:
    params_hotels = {
        "dest_id": DEST_ID,
        "search_type": SEARCH_TYPE,
        "arrival_date": CHECK_IN_STR,
        "departure_date": CHECK_OUT_STR,
        "adults": ADULTS,
        "room_qty": ROOM_QTY,
        "page_number": pagina,
        "currency_code": CURRENCY,
        "languagecode": LOCALE,
    }

    resp = requests.get(URL_HOTELS, headers=HEADERS, params=params_hotels)

    print(f"\n=== SEARCH HOTELS (página {pagina}) ===")
    print("Status Code:", resp.status_code)
    imprimir_rate_limit(resp)

    data = resp.json()
    lote = (data.get("data") or {}).get("hotels", []) or []

    print(f"Hoteles en esta página: {len(lote)}")

    if not lote:
        break

    hoteles.extend(lote)
    pagina += 1
    time.sleep(1)  # respiro entre páginas por si el plan tiene rate limit

# Recortamos por si la última página nos pasó de MAX_HOTELES.
hoteles = hoteles[:MAX_HOTELES]

# =====================================================
# RESULTADOS
# =====================================================
# Puede venir vacío para destinos/fechas poco buscados: eso NO es un error.
if hoteles:

    # Aplanamos TODO el objeto de cada hotel (incluye property.* anidado).
    df = pd.json_normalize(hoteles, sep=".")

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
    print("\nSin resultados: no se devolvieron hoteles para este destino/fechas.")
