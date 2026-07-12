"""
Genera un CSV con datos "fijos" de hoteles por ciudad (total de hoteles, precio
medio por noche y desglose por estrellas), usando la API de Booking.com vía
RapidAPI (booking-com15). Requiere la X-RapidAPI-Key (plan gratis: 50 llamadas/mes).

=== USO: COPIAR Y PEGAR ESTE CÓDIGO EN UNA CELDA DE COLAB Y EJECUTAR ===
No hay que llamar a ninguna función a mano. Al ejecutar, el script:
  1. Monta tu Google Drive (un clic la primera vez) para que el progreso no se pierda.
  2. Mira el CSV que va creando y baja SOLO las ciudades que aún no tienen datos.
  3. Va guardando cada ciudad en el CSV según la descarga.
  4. PARA solo cuando la cuota mensual de RapidAPI se acerca a la reserva.
La próxima vez que lo ejecutes (p. ej. el mes que viene, cuando se renueve la
cuota), continúa con las que falten. Cuando estén todas, el CSV queda completo
y se descarga.

=== LÍMITES DEL PLAN GRATIS ===
50 llamadas/mes y cada ciudad cuesta 2 (buscar destino + 1 página de precios):
~19-23 ciudades por mes. El script procesa PRIMERO las ciudades Top151 (139) y
después el resto (533 en total). El freno de cuota se lee de las cabeceras
x-ratelimit-* de cada respuesta, así que si algún mes te pasas a un plan de
pago con más llamadas, este mismo script lo aprovecha entero sin cambiar nada.

REQUISITO: sube 'airports_flightable_categorized.csv' a Colab (a /content) o
déjalo en la carpeta de Drive indicada abajo. El CSV de salida se guarda en esa
carpeta de Drive, así que sobrevive entre sesiones.
"""

import os
import re
import time
import datetime
import requests
import pandas as pd

# =====================================================
# CONFIGURACIÓN
# =====================================================

# Carpeta en tu Drive donde se guardan el CSV de salida (y donde puedes dejar el
# CSV de aeropuertos). Se crea sola si no existe.
CARPETA_DRIVE = "/content/drive/MyDrive/maayub_hoteles"

INPUT_CSV_NAME = "airports_flightable_categorized.csv"
OUTPUT_CSV_NAME = "hoteles_destinos.csv"

RAPIDAPI_KEY = "1260627abemsh5af49300bfd82acp1ab3f6jsn88a333740fba"
RAPIDAPI_HOST = "booking-com15.p.rapidapi.com"

URL_DEST = f"https://{RAPIDAPI_HOST}/api/v1/hotels/searchDestination"
URL_HOTELS = f"https://{RAPIDAPI_HOST}/api/v1/hotels/searchHotels"

HEADERS = {
    "X-RapidAPI-Key": RAPIDAPI_KEY,
    "X-RapidAPI-Host": RAPIDAPI_HOST,
}

# --- Parámetros de la búsqueda de precios ---
# CHECK_IN: primer viernes a ~60 días vista (se calcula solo en cada ejecución).
# Como los datos se recogen a lo largo de varios meses, cada fila guarda las
# fechas con las que se consultó.
NOCHES = 3
ADULTS = 2
ROOM_QTY = 1
CURRENCY = "EUR"
LOCALE = "en-us"

# --- Freno de cuota (¡NO tocar a la ligera!) ---
# La cuota real se lee de la cabecera x-ratelimit-requests-remaining de cada
# respuesta. Cuando quedan <= RESERVA_LLAMADAS, el script para limpiamente.
RESERVA_LLAMADAS = 4
# Cinturón extra por si algún día la API dejara de mandar cabeceras: tope local
# de llamadas por ejecución (50 = un mes entero de plan gratis).
MAX_LLAMADAS_EJECUCION = 50

TIMEOUT = 60          # segundos por petición HTTP
PAUSA = 1.5           # pausa entre peticiones (segundos)
BACKOFFS_ERROR = [15, 30]   # reintentos ante errores puntuales (cada uno gasta cuota)

# Columnas del CSV de salida (en orden).
COLS = (["iata", "top151", "nombre_booking", "pais_booking", "dest_id",
         "hoteles_total", "propiedades_en_fechas",
         "check_in", "check_out", "adults", "n_muestra", "precio_noche_medio"]
        + [f"n_{e}e" for e in range(1, 6)] + ["n_sin_estrellas"]
        + [f"precio_noche_{e}e" for e in range(1, 6)] + ["precio_noche_sin_estrellas"]
        + ["capturado_el"])


class CuotaAgotada(Exception):
    """Se lanza cuando la cuota mensual de RapidAPI se acerca a la reserva."""
    pass


# =====================================================
# UTILIDADES
# =====================================================

def _fechas_consulta():
    """Check-in el primer viernes a ~60 días vista; check-out NOCHES después."""
    base = datetime.date.today() + datetime.timedelta(days=60)
    dias_hasta_viernes = (4 - base.weekday()) % 7
    check_in = base + datetime.timedelta(days=dias_hasta_viernes)
    check_out = check_in + datetime.timedelta(days=NOCHES)
    return check_in.isoformat(), check_out.isoformat()


def cargar_ciudades(ruta):
    """Lee el CSV de aeropuertos y devuelve una lista de ciudades únicas
    (por city_code), con las Top151 PRIMERO. Una ciudad es top si cualquiera
    de sus aeropuertos lo es."""
    df = pd.read_csv(ruta, sep=";", encoding="utf-8-sig")
    vistas = {}
    for _, fila in df.iterrows():
        code = str(fila["city_code"]).strip().upper()
        top = str(fila.get("Top151", "0")).strip() == "1"
        pais = str(fila.get("country_code", "")).strip().lower()
        if code in vistas:
            vistas[code]["top151"] = vistas[code]["top151"] or top
        else:
            vistas[code] = {"iata": code, "top151": top, "pais_csv": pais}
    ciudades = list(vistas.values())
    ciudades.sort(key=lambda c: (not c["top151"], c["iata"]))
    return ciudades


def iatas_ya_en_csv(csv_path):
    """Devuelve el conjunto de ciudades que YA tienen datos en el CSV de salida.
    Es el registro de progreso: la próxima ejecución salta estas."""
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
# PETICIONES CON FRENO DE CUOTA
# =====================================================

# Estado de cuota compartido entre peticiones (se actualiza con cada respuesta).
_estado = {"llamadas_ejecucion": 0, "restantes": None, "reset_seg": None}


def _peticion(url, params):
    """Hace UNA petición vigilando la cuota. Devuelve el JSON o None si falla
    por un error puntual. Lanza CuotaAgotada si la cuota mensual se acaba."""
    if _estado["llamadas_ejecucion"] >= MAX_LLAMADAS_EJECUCION:
        raise CuotaAgotada()

    intentos = 0
    while True:
        try:
            resp = requests.get(url, headers=HEADERS, params=params, timeout=TIMEOUT)
        except Exception as e:
            if intentos >= len(BACKOFFS_ERROR):
                print(f"  Excepción persistente, se salta: {e}")
                return None
            espera = BACKOFFS_ERROR[intentos]
            intentos += 1
            print(f"  Excepción: {e} -> reintento en {espera}s")
            time.sleep(espera)
            continue

        _estado["llamadas_ejecucion"] += 1

        # Actualizar la cuota real con las cabeceras de esta respuesta.
        restantes = resp.headers.get("x-ratelimit-requests-remaining")
        reset_seg = resp.headers.get("x-ratelimit-requests-reset")
        if restantes is not None and str(restantes).lstrip("-").isdigit():
            _estado["restantes"] = int(restantes)
        if reset_seg is not None and str(reset_seg).isdigit():
            _estado["reset_seg"] = int(reset_seg)

        if resp.status_code == 429:
            # Cuota mensual agotada de verdad: no insistir (gastaría más).
            raise CuotaAgotada()

        if resp.status_code in (401, 403):
            print(f"  HTTP {resp.status_code}: revisa la RAPIDAPI_KEY / suscripción.")
            raise CuotaAgotada()

        if resp.status_code != 200:
            if intentos >= len(BACKOFFS_ERROR):
                print(f"  HTTP {resp.status_code} persistente, se salta")
                return None
            espera = BACKOFFS_ERROR[intentos]
            intentos += 1
            print(f"  HTTP {resp.status_code} -> reintento en {espera}s")
            time.sleep(espera)
            continue

        return resp.json()


def _cuota_para_una_ciudad_mas():
    """True si queda cuota para las 2 llamadas de una ciudad + la reserva."""
    if _estado["restantes"] is not None:
        return _estado["restantes"] - 2 >= RESERVA_LLAMADAS
    return _estado["llamadas_ejecucion"] + 2 <= MAX_LLAMADAS_EJECUCION


def _fecha_renovacion():
    """Fecha aproximada en que se renueva la cuota mensual (por la cabecera
    x-ratelimit-requests-reset, en segundos)."""
    if _estado["reset_seg"] is None:
        return None
    return datetime.datetime.now() + datetime.timedelta(seconds=_estado["reset_seg"])


# =====================================================
# DESCARGA DE UNA CIUDAD (2 llamadas)
# =====================================================

def buscar_destino(iata, pais_csv):
    """Llamada 1: resuelve el IATA en Booking. Devuelve el destino elegido
    (dict) o None. Prefiere resultados de tipo ciudad y, entre ellos, el que
    coincide en país con nuestro CSV (para no llevarnos otra ciudad homónima)."""
    data = _peticion(URL_DEST, {"query": iata})
    if not data:
        return None
    destinos = data.get("data", []) or []
    if not destinos:
        return None
    ciudades = [d for d in destinos if str(d.get("search_type", "")).lower() == "city"]
    if ciudades:
        mismo_pais = [d for d in ciudades if str(d.get("cc1", "")).lower() == pais_csv]
        return (mismo_pais or ciudades)[0]
    return destinos[0]


def pedir_precios(dest_id, search_type, check_in, check_out):
    """Llamada 2: primera página de hoteles con precios para las fechas.
    Devuelve (lista_hoteles, propiedades_en_fechas) o (None, None) si falla."""
    params = {
        "dest_id": dest_id,
        "search_type": search_type,
        "arrival_date": check_in,
        "departure_date": check_out,
        "adults": ADULTS,
        "room_qty": ROOM_QTY,
        "page_number": 1,
        "currency_code": CURRENCY,
        "languagecode": LOCALE,
    }
    data = _peticion(URL_HOTELS, params)
    if not data:
        return None, None
    bloque = data.get("data") or {}
    hoteles = bloque.get("hotels", []) or []

    # El total de propiedades disponibles para las fechas viene en meta,
    # como texto tipo "1757 properties".
    propiedades = None
    for m in bloque.get("meta", []) or []:
        encontrado = re.search(r"[\d.,]+", str(m.get("title", "")))
        if encontrado:
            propiedades = int(re.sub(r"[.,]", "", encontrado.group()))
            break
    return hoteles, propiedades


def resumen_precios(hoteles):
    """A partir de la muestra de hoteles (~20), calcula el precio medio por
    noche global y por estrellas. Estrellas 0 = sin clasificar en Booking."""
    filas = []
    for h in hoteles:
        prop = h.get("property", {}) or {}
        bruto = ((prop.get("priceBreakdown") or {}).get("grossPrice") or {}).get("value")
        if bruto is None:
            continue
        estrellas = prop.get("accuratePropertyClass") or prop.get("propertyClass") or 0
        filas.append({"estrellas": int(estrellas), "noche": float(bruto) / NOCHES})

    resumen = {"n_muestra": len(filas), "precio_noche_medio": None}
    for e in list(range(1, 6)) + [0]:
        clave = f"{e}e" if e else "sin_estrellas"
        resumen[f"n_{clave}"] = 0
        resumen[f"precio_noche_{clave}"] = None
    if not filas:
        return resumen

    df = pd.DataFrame(filas)
    resumen["precio_noche_medio"] = round(df["noche"].mean(), 2)
    for e, grupo in df.groupby("estrellas"):
        clave = f"{e}e" if e else "sin_estrellas"
        if f"n_{clave}" in resumen:
            resumen[f"n_{clave}"] = len(grupo)
            resumen[f"precio_noche_{clave}"] = round(grupo["noche"].mean(), 2)
    return resumen


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
    csv_path = os.path.join(CARPETA_DRIVE, OUTPUT_CSV_NAME)

    # 2) Localizar el CSV de aeropuertos y quedarnos con ciudades únicas.
    input_path = localizar_input()
    if input_path is None:
        print(f"ERROR: no encuentro '{INPUT_CSV_NAME}'.")
        print(f"Súbelo a /content o déjalo en {CARPETA_DRIVE} y vuelve a ejecutar.")
        return
    ciudades = cargar_ciudades(input_path)

    # 3) Ver qué falta (las que aún no están en el CSV de salida).
    Y = len(ciudades)
    primera_vez = not os.path.exists(csv_path)
    hechas = iatas_ya_en_csv(csv_path)
    pendientes = [c for c in ciudades if c["iata"] not in hechas]

    check_in, check_out = _fechas_consulta()

    print(f"CSV de hoteles: {csv_path}")
    print(f"Fechas de consulta: {check_in} a {check_out} | {ADULTS} adultos | {CURRENCY}")
    print(f"Coste: 2 llamadas/ciudad | reserva de seguridad: {RESERVA_LLAMADAS} llamadas")

    if primera_vez:
        print(f"\n>>> Primera vez: se creará un CSV nuevo de hoteles. 0 de {Y} ciudades con info.")
    else:
        print(f"\n>>> {len(hechas)} de {Y} ciudades con info.")

    if not pendientes:
        print(f">>> Ya tienes TODA la info completa ({Y} de {Y} ciudades). Nada que descargar.")
        _descargar(csv_path)
        return

    n_top = sum(1 for c in pendientes if c["top151"])
    print(f">>> Faltan {len(pendientes)} (de ellas {n_top} Top151, que van primero).")
    print(f">>> Con el plan gratis (50/mes) se completan ~20 ciudades por mes.\n")

    # 4) Descargar las pendientes, guardando cada una en el CSV al momento.
    nuevas = 0
    corte_por_cuota = False
    total = len(pendientes)
    for idx, ciudad in enumerate(pendientes, start=1):
        if not _cuota_para_una_ciudad_mas():
            corte_por_cuota = True
            break

        iata = ciudad["iata"]
        try:
            destino = buscar_destino(iata, ciudad["pais_csv"])
            if destino is None:
                print(f"[{idx}/{total}] {iata} - Booking no resuelve el destino (se salta)")
                time.sleep(PAUSA)
                continue

            hoteles, propiedades = pedir_precios(
                destino.get("dest_id"),
                destino.get("search_type", "city"),
                check_in, check_out,
            )
        except CuotaAgotada:
            corte_por_cuota = True
            break

        if hoteles is None:
            # Falló la 2ª llamada: no se escribe la fila, se reintenta otro día.
            print(f"[{idx}/{total}] {iata} - sin precios (se reintentará)")
            time.sleep(PAUSA)
            continue

        fila = {
            "iata": iata,
            "top151": int(ciudad["top151"]),
            "nombre_booking": destino.get("name"),
            "pais_booking": destino.get("country"),
            "dest_id": destino.get("dest_id"),
            "hoteles_total": destino.get("nr_hotels"),
            "propiedades_en_fechas": propiedades,
            "check_in": check_in,
            "check_out": check_out,
            "adults": ADULTS,
            "capturado_el": pd.Timestamp.now().isoformat(),
        }
        fila.update(resumen_precios(hoteles))

        df_fila = pd.DataFrame([fila])[COLS]
        escribir_cabecera = not os.path.exists(csv_path)
        df_fila.to_csv(csv_path, mode="a", header=escribir_cabecera,
                       index=False, encoding="utf-8")
        nuevas += 1

        precio = fila["precio_noche_medio"]
        precio_txt = f"{precio}/noche" if precio is not None else "sin precios"
        cuota_txt = f" | cuota restante: {_estado['restantes']}" if _estado["restantes"] is not None else ""
        print(f"[{idx}/{total}] {iata} - {fila['nombre_booking']}: "
              f"{fila['hoteles_total']} hoteles, {precio_txt} "
              f"(muestra {fila['n_muestra']}){cuota_txt}")

        if idx < total:
            time.sleep(PAUSA)

    # 5) Resumen final.
    hechas = iatas_ya_en_csv(csv_path)
    faltan = Y - len(hechas)
    print(f"\n>>> Bajadas {nuevas} nuevas en esta ejecución. Ahora: {len(hechas)} de {Y} ciudades con info.")

    if faltan == 0:
        print(">>> ¡COMPLETO! Ya tienes la info de las", Y, "ciudades. Se descarga el CSV.")
        _descargar(csv_path)
    elif corte_por_cuota:
        print(">>> CUOTA MENSUAL AGOTADA (o en reserva).")
        renovacion = _fecha_renovacion()
        if renovacion:
            print(f">>> La cuota se renueva hacia el {renovacion.strftime('%Y-%m-%d')}. "
                  f"Vuelve a ejecutar este código entonces.")
        else:
            print(">>> Vuelve a ejecutar este código cuando se renueve la cuota mensual de RapidAPI.")
        _descargar(csv_path)
    else:
        print(f">>> Faltan {faltan} (se saltaron por errores puntuales). Vuelve a ejecutar para reintentarlas.")
        _descargar(csv_path)


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
