"""
Genera un CSV con el número de sitios Patrimonio de la Humanidad (UNESCO) cerca
de cada aeropuerto del maestro, como proxy de "cosas que ver" para el score.

=== USO: COPIAR Y PEGAR ESTE CÓDIGO EN UNA CELDA DE COLAB Y EJECUTAR ===
No hay que llamar a ninguna función a mano. Al ejecutar, el script:
  1. Monta tu Google Drive (un clic la primera vez) para guardar el resultado.
  2. Descarga la lista de UNESCO desde Wikidata (todos los sitios WHC, con TODOS
     sus componentes y los criterios de inscripción).
  3. Cruza esos puntos contra las coordenadas de tu maestro con haversine.
  4. Escribe un CSV con los conteos por aeropuerto y lo descarga.

=== POR QUÉ WIKIDATA Y NO EL XML OFICIAL ===
La web oficial (whc.unesco.org) está detrás de Cloudflare con un reto de
JavaScript, así que un script recibe 403. Wikidata tiene los mismos sitios
(cruzados por el "World Heritage Site ID", P757), con coordenadas y criterios, y
su endpoint SPARQL sí es accesible por programa. El total (~1.250 sitios) y el
reparto por categoría coinciden con las cifras oficiales de UNESCO.

=== CÓMO CUENTA (todos los componentes) ===
Muchos sitios son "en serie": varios lugares bajo un mismo id (p. ej. las cuevas
de arte rupestre del norte de España). Usamos TODOS esos puntos: un sitio cuenta
como cercano si CUALQUIERA de sus componentes cae dentro del radio, y se cuenta
UNA sola vez (por whc_id). Así un sitio en serie que se extiende hasta el
aeropuerto suma aunque su punto "principal" esté lejos.

=== ES RÁPIDO ===
UNESCO se baja en dos consultas (no una por aeropuerto). El cruce es local:
575 aeropuertos x ~8.400 puntos se resuelve en unos segundos. No hay cuotas ni
lógica de "reanudar" como en generar_clima.py.

REQUISITO: sube 'airports_flightable_categorized.csv' a Colab (a /content) o déjalo
en la carpeta de Drive indicada abajo.
"""

import os
import re
import ast
import math
from collections import defaultdict

import requests
import pandas as pd

# =====================================================
# CONFIGURACIÓN
# =====================================================

CARPETA_DRIVE = "/content/drive/MyDrive/maayub_unesco"
INPUT_CSV_NAME = "airports_flightable_categorized.csv"
OUTPUT_CSV_NAME = "unesco_destinos.csv"

# Fuente: endpoint SPARQL de Wikidata.
WDQS = "https://query.wikidata.org/sparql"
HTTP_HEADERS = {"User-Agent": "MaayubResearch/1.0 (germanach96@gmail.com)"}
TIMEOUT = 180

# --- Radios (km). El checklist pide 60; 100 añade el "excursión de día". ---
RADIOS_KM = [60, 100]

# Criterios de inscripción: i-vi = cultural, vii-x = natural. Ambos -> mixto.
CULTURALES = {"i", "ii", "iii", "iv", "v", "vi"}
NATURALES = {"vii", "viii", "ix", "x"}

# Unos pocos sitios no tienen los criterios en Wikidata, así que su categoría
# saldría vacía. Los rellenamos a mano (todos culturales, verificado en la ficha
# oficial de UNESCO). Nota: 1156 (Dresden Elbe Valley) fue RETIRADO de la lista
# en 2009; se deja como cultural por coherencia, pero ver aviso al ejecutar.
CATEGORIA_MANUAL = {
    "291": "cultural",   # Jesuit Missions of the Guaranis (São Miguel das Missões)
    "678": "cultural",   # Complex of Hué Monuments
    "1156": "cultural",  # Dresden Elbe Valley (retirado en 2009)
    "1671": "cultural",  # Cosmological Axis of Yogyakarta
}

# Todos los componentes (un punto por localización) con su whc_id.
Q_COMPONENTES = """
SELECT ?whcid ?lat ?lon WHERE {
  ?item wdt:P757 ?whcid .
  ?item p:P625 [ psv:P625 [ wikibase:geoLatitude ?lat ; wikibase:geoLongitude ?lon ] ] .
}
"""
# Criterios de inscripción por sitio (para la categoría cultural/natural/mixto).
Q_CRITERIOS = """
SELECT ?whcid ?critLabel WHERE {
  ?item wdt:P757 ?whcid .
  ?item wdt:P2614 ?c .
  ?c rdfs:label ?critLabel . FILTER(LANG(?critLabel)="en")
}
"""


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


def id_base(whcid):
    """El id oficial es numérico; Wikidata añade sufijos (bis/ter) en extensiones
    y reusa el id del sitio en sus componentes. Nos quedamos con el nº base para
    que todos los componentes de un mismo sitio compartan clave."""
    m = re.match(r"^(\d+)", whcid.strip())
    return m.group(1) if m else None


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
    for p in [INPUT_CSV_NAME,
              os.path.join("/content", INPUT_CSV_NAME),
              os.path.join(CARPETA_DRIVE, INPUT_CSV_NAME)]:
        if os.path.exists(p):
            return p
    return None


# =====================================================
# LISTA DE SITIOS UNESCO (Wikidata)
# =====================================================

def _sparql(query):
    r = requests.get(WDQS, params={"query": query, "format": "json"},
                     headers=HTTP_HEADERS, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()["results"]["bindings"]


def categoria_de(criterios):
    cult = bool(criterios & CULTURALES)
    nat = bool(criterios & NATURALES)
    if cult and nat:
        return "mixto"
    if nat:
        return "natural"
    if cult:
        return "cultural"
    return ""


def descargar_componentes():
    """Devuelve (lista de componentes, categoría_por_sitio).
    Cada componente es un dict {whc_id, lat, lon}. categoría_por_sitio mapea
    whc_id -> 'cultural'/'natural'/'mixto'/''."""
    print("Descargando UNESCO desde Wikidata (componentes)...")
    filas = _sparql(Q_COMPONENTES)
    print("Descargando UNESCO desde Wikidata (criterios)...")
    filas_crit = _sparql(Q_CRITERIOS)

    crit_por_sitio = defaultdict(set)
    for b in filas_crit:
        bid = id_base(b["whcid"]["value"])
        if bid:
            crit_por_sitio[bid].add(b["critLabel"]["value"].strip("()").lower())

    categoria_por_sitio = {}
    componentes = []
    for b in filas:
        bid = id_base(b["whcid"]["value"])
        if not bid:
            continue
        try:
            lat = float(b["lat"]["value"])
            lon = float(b["lon"]["value"])
        except (ValueError, KeyError):
            continue
        componentes.append({"whc_id": bid, "lat": lat, "lon": lon})
        if bid not in categoria_por_sitio:
            cat = categoria_de(crit_por_sitio.get(bid, set()))
            categoria_por_sitio[bid] = cat or CATEGORIA_MANUAL.get(bid, "")

    print(f"  {len(componentes)} puntos | {len(categoria_por_sitio)} sitios únicos")
    return componentes, categoria_por_sitio


# =====================================================
# CÁLCULO POR AEROPUERTO
# =====================================================

def contar_para_aeropuerto(aeropuerto, componentes, categoria_por_sitio):
    """Cuenta sitios ÚNICOS cuya distancia mínima (sobre todos sus componentes)
    cae dentro de cada radio, con split cultural/natural, más el más próximo."""
    alat, alon = aeropuerto["lat"], aeropuerto["lon"]

    # Distancia mínima aeropuerto -> sitio (sobre todos los componentes del sitio).
    min_por_sitio = {}
    nearest = math.inf
    for cp in componentes:
        d = haversine_km(alat, alon, cp["lat"], cp["lon"])
        if d < nearest:
            nearest = d
        w = cp["whc_id"]
        if w not in min_por_sitio or d < min_por_sitio[w]:
            min_por_sitio[w] = d

    fila = {"iata": aeropuerto["iata"]}
    for r in RADIOS_KM:
        dentro = [w for w, d in min_por_sitio.items() if d <= r]
        cats = [categoria_por_sitio.get(w, "") for w in dentro]
        fila[f"unesco_{r}km"] = len(dentro)
        # 'mixto' cuenta en ambos (es a la vez cultural y natural).
        fila[f"unesco_cultural_{r}km"] = sum(1 for c in cats if c in ("cultural", "mixto"))
        fila[f"unesco_natural_{r}km"] = sum(1 for c in cats if c in ("natural", "mixto"))
    fila["unesco_cercano_km"] = round(nearest, 1) if nearest != math.inf else ""
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

    # 3) Bajar la lista de UNESCO (con todos los componentes).
    try:
        componentes, categoria_por_sitio = descargar_componentes()
    except Exception as e:
        print(f"\n>>> No se pudo descargar UNESCO de Wikidata: {e}")
        print(">>> Reintenta en un minuto (el endpoint a veces va cargado).")
        return
    if not componentes:
        print("\n>>> Wikidata no devolvió puntos. Reintenta más tarde.")
        return

    print(f"\nAeropuertos: {len(aeropuertos)} | Radios: "
          f"{', '.join(str(r) + ' km' for r in RADIOS_KM)}")

    # 4) Calcular y escribir. Es rápido, se genera de una y se sobrescribe.
    filas = [contar_para_aeropuerto(a, componentes, categoria_por_sitio)
             for a in aeropuertos]
    df = pd.DataFrame(filas)[_cols_salida()]
    df.to_csv(csv_path, index=False, sep=";", encoding="utf-8")

    # 5) Resumen.
    r0 = RADIOS_KM[0]
    con_algo = (df[f"unesco_{r0}km"] > 0).sum()
    print(f"\n>>> CSV escrito: {csv_path} ({len(df)} aeropuertos).")
    print(f">>> {con_algo} de {len(df)} tienen al menos un sitio a <= {r0} km.")
    print(f">>> Media a {r0} km: {df[f'unesco_{r0}km'].mean():.1f} sitios/aeropuerto.")
    _descargar(csv_path)


def _descargar(csv_path):
    try:
        from google.colab import files
        files.download(csv_path)
    except Exception:
        pass


# Al pegar y ejecutar en Colab, esto arranca todo el proceso automáticamente.
if __name__ == "__main__":
    ejecutar()
