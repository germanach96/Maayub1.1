"""
Genera un CSV con el número de sitios Patrimonio de la Humanidad (UNESCO) cerca
de cada aeropuerto del maestro, como proxy de "cosas que ver" para el score.

=== USO: COPIAR Y PEGAR ESTE CÓDIGO EN UNA CELDA DE COLAB Y EJECUTAR ===
No hay que llamar a ninguna función a mano. Al ejecutar, el script:
  1. Monta tu Google Drive (un clic la primera vez) para guardar el resultado.
  2. Descarga la lista OFICIAL completa de UNESCO (un solo XML con ~1.220 sitios).
  3. Cruza esa lista contra las coordenadas de tu maestro con haversine.
  4. Escribe un CSV con los conteos por aeropuerto y lo descarga.

=== POR QUÉ ESTE ES MUCHO MÁS RÁPIDO QUE EL DE CLIMA ===
UNESCO no es una API por localización: publica TODA la lista en un único archivo
estático. Se baja una sola vez (archivo pequeño) y el resto del cálculo es local.
No hay API key, ni cuotas, ni reintentos: 575 aeropuertos x ~1.220 sitios se
resuelve en menos de un segundo. Por eso no lleva la lógica de "reanudar" que sí
necesita generar_clima.py.

=== SI LA DESCARGA FALLA (UNESCO a veces bloquea con 403) ===
El script lo intenta con un User-Agent de navegador. Si aun así falla, te lo dice:
entra a https://whc.unesco.org/en/syndication con tu navegador, baja "All the
sites in one XML file", súbelo a la carpeta de Drive indicada abajo (o a /content)
con el nombre 'whc_sites.xml' y vuelve a ejecutar.

REQUISITO: sube 'airports_flightable_categorized.csv' a Colab (a /content) o déjalo
en la carpeta de Drive indicada abajo.
"""

import os
import ast
import math
import xml.etree.ElementTree as ET

import requests
import pandas as pd

# =====================================================
# CONFIGURACIÓN
# =====================================================

# Carpeta en tu Drive donde se guarda el CSV de salida (y donde puedes dejar el
# XML de UNESCO y/o el CSV de aeropuertos). Se crea sola si no existe.
CARPETA_DRIVE = "/content/drive/MyDrive/maayub_unesco"

INPUT_CSV_NAME = "airports_flightable_categorized.csv"
XML_NAME = "whc_sites.xml"                 # nombre local del XML de UNESCO
OUTPUT_CSV_NAME = "unesco_destinos.csv"

# Fuente oficial: World Heritage Centre. "All the sites in one XML file".
UNESCO_XML_URL = "https://whc.unesco.org/en/list/xml/"
# User-Agent de navegador: sin esto UNESCO suele responder 403 a los scripts.
HTTP_HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) "
                   "Chrome/124.0 Safari/537.36"),
}
TIMEOUT = 120

# --- Radios (km). El checklist pide 60; 100 añade el "excursión de día". ---
RADIOS_KM = [60, 100]

# Columnas del CSV de salida (en orden). Se generan por cada radio:
#   unesco_<r>km, unesco_cultural_<r>km, unesco_natural_<r>km
# más la distancia al sitio más próximo.
def _cols_salida():
    cols = ["iata"]
    for r in RADIOS_KM:
        cols += [f"unesco_{r}km", f"unesco_cultural_{r}km", f"unesco_natural_{r}km"]
    cols += ["unesco_cercano_km"]
    return cols


# =====================================================
# UTILIDADES
# =====================================================

def haversine_km(lat1, lon1, lat2, lon2):
    """Distancia en km sobre la esfera entre dos puntos (grados decimales)."""
    R = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


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


def localizar_input():
    """Busca el CSV de aeropuertos en /content o en la carpeta de Drive."""
    for p in [INPUT_CSV_NAME,
              os.path.join("/content", INPUT_CSV_NAME),
              os.path.join(CARPETA_DRIVE, INPUT_CSV_NAME)]:
        if os.path.exists(p):
            return p
    return None


def localizar_xml():
    """Busca un XML de UNESCO ya descargado a mano (en /content o en Drive)."""
    for p in [XML_NAME,
              os.path.join("/content", XML_NAME),
              os.path.join(CARPETA_DRIVE, XML_NAME)]:
        if os.path.exists(p):
            return p
    return None


# =====================================================
# LISTA DE SITIOS UNESCO
# =====================================================

def obtener_xml():
    """Devuelve el texto del XML de UNESCO. Primero mira si ya lo tienes bajado
    a mano; si no, lo intenta descargar. Devuelve None si no hay forma."""
    ruta_local = localizar_xml()
    if ruta_local:
        print(f"Usando XML local: {ruta_local}")
        with open(ruta_local, "r", encoding="utf-8", errors="replace") as f:
            return f.read()

    print(f"Descargando lista oficial de UNESCO: {UNESCO_XML_URL}")
    try:
        resp = requests.get(UNESCO_XML_URL, headers=HTTP_HEADERS, timeout=TIMEOUT)
    except Exception as e:
        print(f"  Fallo de red al descargar: {e}")
        return None

    if resp.status_code != 200:
        print(f"  UNESCO respondió HTTP {resp.status_code} (a veces bloquean scripts).")
        return None

    # Guardar copia en Drive para no volver a depender de la descarga.
    try:
        os.makedirs(CARPETA_DRIVE, exist_ok=True)
        with open(os.path.join(CARPETA_DRIVE, XML_NAME), "w", encoding="utf-8") as f:
            f.write(resp.text)
    except Exception:
        pass
    return resp.text


def _texto(row, tag):
    el = row.find(tag)
    return el.text if el is not None and el.text is not None else ""


def parsear_sitios(xml_text):
    """Convierte el XML en una lista de dicts {lat, lon, categoria}.
    categoria es 'cultural', 'natural' o 'mixed'. Salta filas sin coordenadas."""
    raiz = ET.fromstring(xml_text)
    sitios = []
    for row in raiz.iter("row"):
        lat_txt = _texto(row, "latitude").strip()
        lon_txt = _texto(row, "longitude").strip()
        if not lat_txt or not lon_txt:
            continue
        try:
            lat = float(lat_txt)
            lon = float(lon_txt)
        except ValueError:
            continue
        cat = _texto(row, "category").strip().lower()   # Cultural/Natural/Mixed
        sitios.append({"lat": lat, "lon": lon, "categoria": cat})
    return sitios


# =====================================================
# CÁLCULO POR AEROPUERTO
# =====================================================

def contar_para_aeropuerto(aeropuerto, sitios):
    """Devuelve un dict con los conteos por radio (total/cultural/natural) y la
    distancia al sitio más próximo, para un aeropuerto dado."""
    fila = {"iata": aeropuerto["iata"]}
    conteos = {r: {"total": 0, "cultural": 0, "natural": 0} for r in RADIOS_KM}
    minimo = math.inf

    alat, alon = aeropuerto["lat"], aeropuerto["lon"]
    for s in sitios:
        d = haversine_km(alat, alon, s["lat"], s["lon"])
        if d < minimo:
            minimo = d
        for r in RADIOS_KM:
            if d <= r:
                conteos[r]["total"] += 1
                # 'mixed' cuenta en ambos porque es a la vez cultural y natural.
                if s["categoria"] in ("cultural", "mixed"):
                    conteos[r]["cultural"] += 1
                if s["categoria"] in ("natural", "mixed"):
                    conteos[r]["natural"] += 1

    for r in RADIOS_KM:
        fila[f"unesco_{r}km"] = conteos[r]["total"]
        fila[f"unesco_cultural_{r}km"] = conteos[r]["cultural"]
        fila[f"unesco_natural_{r}km"] = conteos[r]["natural"]
    fila["unesco_cercano_km"] = round(minimo, 1) if minimo != math.inf else ""
    return fila


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

    # 2) Localizar el CSV de aeropuertos.
    input_path = localizar_input()
    if input_path is None:
        print(f"ERROR: no encuentro '{INPUT_CSV_NAME}'.")
        print(f"Súbelo a /content o déjalo en {CARPETA_DRIVE} y vuelve a ejecutar.")
        return
    aeropuertos = cargar_aeropuertos(input_path)

    # 3) Conseguir la lista de UNESCO (descarga o XML subido a mano).
    xml_text = obtener_xml()
    if xml_text is None:
        print("\n>>> NO SE PUDO OBTENER LA LISTA DE UNESCO.")
        print(">>> Entra en https://whc.unesco.org/en/syndication con el navegador,")
        print(">>> baja 'All the sites in one XML file', renómbralo a 'whc_sites.xml'")
        print(f">>> y súbelo a /content o a {CARPETA_DRIVE}. Luego vuelve a ejecutar.")
        return

    try:
        sitios = parsear_sitios(xml_text)
    except ET.ParseError as e:
        print(f"\n>>> El XML de UNESCO no se pudo leer (¿archivo corrupto?): {e}")
        print(">>> Bórralo y vuelve a descargarlo o súbelo a mano.")
        return

    if not sitios:
        print("\n>>> El XML no tenía sitios con coordenadas. Revisa el archivo.")
        return

    print(f"\nAeropuertos: {len(aeropuertos)} | Sitios UNESCO con coordenadas: {len(sitios)}")
    print(f"Radios: {', '.join(str(r) + ' km' for r in RADIOS_KM)}")

    # 4) Calcular y escribir. Es rápido, así que se genera de una y se sobrescribe.
    filas = [contar_para_aeropuerto(a, sitios) for a in aeropuertos]
    df = pd.DataFrame(filas)[_cols_salida()]
    df.to_csv(csv_path, index=False, encoding="utf-8")

    # 5) Resumen.
    r0 = RADIOS_KM[0]
    con_algo = (df[f"unesco_{r0}km"] > 0).sum()
    print(f"\n>>> CSV escrito: {csv_path} ({len(df)} aeropuertos).")
    print(f">>> {con_algo} de {len(df)} tienen al menos un sitio a <= {r0} km.")
    print(f">>> Media a {r0} km: {df[f'unesco_{r0}km'].mean():.1f} sitios/aeropuerto.")
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
