"""
Genera indice_coste_destinos.csv: índice de coste de vida por aeropuerto.

Fuentes (se descargan solas al ejecutar; se cachean en ./fuentes_indice_coste):
  1. WhereNext cost-of-living (país, actual, CC BY 4.0)   -> indice_pais
     Atribución requerida en la interfaz: "WhereNext (getwherenext.com)".
  2. Banco Mundial PPP + tipo de cambio (país, fallback)  -> indice_pais
  3. Snapshot Numbeo 2022 (Kaggle mvieira101, ciudad)     -> ratio_ciudad
     y también árbitro/repuesto del índice de país cuando el dato del Banco
     Mundial sale absurdo (países con tipo de cambio oficial ficticio).
  4. Travelpayouts cities.json                             -> city_code IATA -> nombre

Lógica: indice_coste = indice_pais (actual) x ratio_ciudad (estable en el tiempo).
El ratio ciudad/país apenas cambia con los años, así que el snapshot de 2022
sirve para el ajuste fino aunque sus precios absolutos estén desfasados.
Escala: EE.UU. = 82 (la de WhereNext).

REQUISITO: airports_flightable_categorized.csv en la misma carpeta.
"""

import csv
import io
import json
import os
import re
import statistics
import unicodedata
import zipfile

import requests

CARPETA_FUENTES = "fuentes_indice_coste"
AIRPORTS_CSV = "airports_flightable_categorized.csv"
OUT_CSV = "indice_coste_destinos.csv"

URL_WHERENEXT = "https://getwherenext.com/api/data/cost-of-living"
URL_WB_PPP = ("https://api.worldbank.org/v2/country/all/indicator/PA.NUS.PPP"
              "?format=json&mrnev=1&per_page=400")
URL_WB_FX = ("https://api.worldbank.org/v2/country/all/indicator/PA.NUS.FCRF"
             "?format=json&mrnev=1&per_page=400")
URL_TP_CITIES = "https://api.travelpayouts.com/data/en/cities.json"
URL_KAGGLE = "https://www.kaggle.com/api/v1/datasets/download/mvieira101/global-cost-of-living"

RATIO_MIN, RATIO_MAX = 0.6, 1.6   # tope de distorsión del snapshot
MIN_ITEMS_RATIO = 8               # mínimo de precios válidos para aceptar un ratio
ITEM_COLS = [f"x{i}" for i in range(1, 54)]  # x54=salario, x55=hipoteca: fuera

# Fuera de este rango, un índice de país es sospechoso de cambio oficial roto
IDX_MIN, IDX_MAX = 12, 140
DESVIO_MAX = 1.8  # discrepancia máxima tolerada entre Banco Mundial y snapshot

# Territorios sin dato propio -> heredan el índice del país soberano
HEREDADOS = {"GG": "GB", "JE": "GB", "GP": "FR", "MQ": "FR", "RE": "FR",
             "YT": "FR", "PF": "FR", "GU": "US"}

# Nombres de país del snapshot que no salen en WhereNext/Banco Mundial
ALIAS_PAIS = {
    "south korea": "KR", "north korea": "KP", "russia": "RU", "vietnam": "VN",
    "iran": "IR", "syria": "SY", "venezuela": "VE", "bolivia": "BO",
    "tanzania": "TZ", "turkey": "TR", "czech republic": "CZ", "laos": "LA",
    "macedonia": "MK", "north macedonia": "MK", "ivory coast": "CI",
    "cote d'ivoire": "CI", "democratic republic of the congo": "CD",
    "republic of the congo": "CG", "congo": "CG", "brunei": "BN",
    "taiwan": "TW", "hong kong": "HK", "macao": "MO", "macau": "MO",
    "palestine": "PS", "kosovo": "XK", "kosovo (disputed territory)": "XK",
    "cape verde": "CV", "east timor": "TL", "swaziland": "SZ",
    "eswatini": "SZ", "myanmar": "MM", "burma": "MM", "moldova": "MD",
    "egypt": "EG", "gambia": "GM", "curacao": "CW", "aruba": "AW",
    "puerto rico": "PR", "us virgin islands": "VI", "guam": "GU",
    "french polynesia": "PF", "reunion": "RE", "guadeloupe": "GP",
    "martinique": "MQ", "new caledonia": "NC", "saint lucia": "LC",
    "trinidad and tobago": "TT", "antigua and barbuda": "AG",
    "saint kitts and nevis": "KN", "bosnia and herzegovina": "BA",
    "isle of man": "IM", "jersey": "JE", "guernsey": "GG", "bermuda": "BM",
    "cayman islands": "KY", "turks and caicos islands": "TC",
    "sint maarten": "SX", "bahamas": "BS", "kyrgyzstan": "KG",
    "slovakia": "SK", "united states": "US", "united kingdom": "GB",
}

# Nombre Travelpayouts -> nombre en el snapshot Numbeo (ya normalizados).
# Solo casos donde las dos fuentes llaman distinto a la MISMA ciudad.
ALIAS_CIUDAD = {
    "bengaluru": "bangalore",
    "kuwait": "kuwait city",
    "xian": "xi an",
    "krakow": "cracow krakow",
    "kerkyra": "corfu",
    "mikonos": "mykonos",
    "berne": "bern",
    "quebec": "quebec city",
    "zakinthos": "zakynthos",
    "thira": "santorini",
    "ujung pandang": "makassar",
    "macau": "macao",
    "tenerife": "santa cruz de tenerife",
    "las palmas": "las palmas de gran canaria",
}

# Ajustes manuales para ciudades notables AUSENTES del snapshot. El ratio es
# coste_ciudad / media_de_su_pais, estimado de Numbeo actual (julio 2026).
# Solo se aplican si no hubo match con el snapshot.
RATIO_MANUAL = {
    # city_code: (ratio, etiqueta)
    "SFO": (1.50, "San Francisco"),        # nivel Nueva York o superior
    "LED": (1.10, "San Petersburgo"),      # algo menos que Moscú (1.27)
    "PMI": (1.05, "Palma de Mallorca"),    # turístico, algo sobre la media ES
    "DAD": (0.90, "Da Nang"),              # más barata que Hanói/HCMC
    "PUJ": (1.25, "Punta Cana"),           # zona resort vs media dominicana
    "USM": (1.25, "Koh Samui"),            # isla resort vs media tailandesa
    "SSH": (1.15, "Sharm el Sheikh"),      # zona turística vs media egipcia
    "JMK": (1.40, "Mykonos"),              # isla resort cara vs media griega
    "JTR": (1.35, "Santorini"),            # isla resort cara vs media griega
}


def norm(texto):
    """minúsculas, sin acentos, solo alfanumérico y espacios."""
    t = unicodedata.normalize("NFD", str(texto))
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = re.sub(r"[^a-z0-9 ]", " ", t.lower())
    return re.sub(r"\s+", " ", t).strip()


def variantes_nombre(nombre):
    """Variantes razonables de un nombre de ciudad para intentar el match:
    tal cual, sin paréntesis, lo de dentro del paréntesis, primer tramo de
    'A/B' o 'A, B', y equivalencia Saint<->St."""
    brutas = {nombre}
    m = re.match(r"^(.*?)\s*\((.*?)\)\s*$", nombre)
    if m:
        brutas |= {m.group(1), m.group(2)}
    brutas |= {re.split(r"[/,]", b)[0] for b in set(brutas)}
    normalizadas = set()
    for b in brutas:
        n = norm(b)
        if not n:
            continue
        normalizadas.add(n)
        if n.startswith("saint "):
            normalizadas.add("st " + n[6:])
        if n.startswith("st "):
            normalizadas.add("saint " + n[3:])
        normalizadas.add(ALIAS_CIUDAD.get(n, n))
    return normalizadas


# =====================================================
# 0) DESCARGA DE FUENTES (con caché local)
# =====================================================

def descargar(nombre, url, binario=False):
    ruta = os.path.join(CARPETA_FUENTES, nombre)
    if not os.path.exists(ruta):
        print(f"Descargando {nombre}...")
        r = requests.get(url, timeout=120)
        r.raise_for_status()
        with open(ruta, "wb") as f:
            f.write(r.content)
    return ruta


os.makedirs(CARPETA_FUENTES, exist_ok=True)
ruta_wn = descargar("wherenext_col.json", URL_WHERENEXT)
ruta_ppp = descargar("wb_ppp.json", URL_WB_PPP)
ruta_fx = descargar("wb_fx.json", URL_WB_FX)
ruta_tp = descargar("tp_cities.json", URL_TP_CITIES)
ruta_zip = descargar("kaggle_numbeo_2022.zip", URL_KAGGLE, binario=True)

with zipfile.ZipFile(ruta_zip) as z:
    with z.open("cost-of-living_v2.csv") as f:
        snapshot_filas = list(csv.DictReader(io.TextIOWrapper(f, encoding="utf-8")))

# =====================================================
# 1) ÍNDICE DE PAÍS: WhereNext + Banco Mundial
# =====================================================

wn = json.load(open(ruta_wn))["data"]
wn_index = {p["country_code"]: p["cost_index"] for p in wn}
wn_mensual = {p["country_code"]: p["monthly_estimate_usd"] for p in wn}


def cargar_wb(path):
    out = {}
    for r in json.load(open(path))[1]:
        iso2 = (r.get("country") or {}).get("id")
        if r.get("value") is not None and iso2 and len(iso2) == 2:
            out.setdefault(iso2, r["value"])  # mrnev=1: ya viene el más reciente
    return out


ppp = cargar_wb(ruta_ppp)
fx = cargar_wb(ruta_fx)
pli = {cc: ppp[cc] / fx[cc] for cc in ppp if cc in fx and fx[cc]}

# Calibración: el PLI*82 del Banco Mundial corre más bajo que WhereNext
# (años base distintos). Se corrige con la mediana del cociente entre ambos
# en los países que están en las dos fuentes.
comunes = [wn_index[c] / (pli[c] * 82) for c in wn_index if c in pli and pli[c] > 0]
FACTOR_WB = statistics.median(comunes)

# =====================================================
# 2) SNAPSHOT NUMBEO: ratios por ciudad y nivel por país
# =====================================================

# Mapa nombre-de-país -> ISO2 construido con WhereNext + Banco Mundial + alias
nombre_a_iso = {}
for p in wn:
    nombre_a_iso[norm(p["country"])] = p["country_code"]
for r in json.load(open(ruta_ppp))[1]:
    iso2 = (r.get("country") or {}).get("id")
    nombre = (r.get("country") or {}).get("value")
    if iso2 and nombre and len(iso2) == 2:
        nombre_a_iso.setdefault(norm(nombre), iso2)
for nombre, iso2 in ALIAS_PAIS.items():
    nombre_a_iso[norm(nombre)] = iso2

filas_snap = []
for row in snapshot_filas:
    cc = nombre_a_iso.get(norm(row["country"]))
    if not cc:
        continue
    precios = {}
    for col in ITEM_COLS:
        v = row.get(col)
        if v not in (None, "", "NaN"):
            try:
                x = float(v)
                if x > 0:
                    precios[col] = x
            except ValueError:
                pass
    if precios:
        filas_snap.append((cc, row["city"], precios))

# Mediana de cada artículo por país (la "cesta media" del país)
por_pais = {}
for cc, ciudad, precios in filas_snap:
    por_pais.setdefault(cc, []).append(precios)

mediana_pais = {}
for cc, lista in por_pais.items():
    med = {}
    for col in ITEM_COLS:
        vals = [p[col] for p in lista if col in p]
        if vals:
            med[col] = statistics.median(vals)
    mediana_pais[cc] = med

# Ratio de cada ciudad = mediana de (precio ciudad / mediana país) por artículo
ratios = {}  # (cc, nombre_normalizado) -> (ratio, nombre_original)
for cc, ciudad, precios in filas_snap:
    med = mediana_pais[cc]
    rs = [precios[c] / med[c] for c in precios if c in med and med[c] > 0]
    if len(rs) < MIN_ITEMS_RATIO:
        continue
    ratio = min(max(statistics.median(rs), RATIO_MIN), RATIO_MAX)
    for k in variantes_nombre(ciudad):
        ratios.setdefault((cc, k), (round(ratio, 2), ciudad))


# Nivel de precios de cada país según el snapshot: su cesta mediana comparada
# con la de EE.UU., artículo a artículo. Sirve de árbitro cuando el dato del
# Banco Mundial es absurdo (tipo de cambio oficial ficticio).
def _snap_pli(cc):
    med, med_us = mediana_pais.get(cc), mediana_pais.get("US")
    if not med or not med_us:
        return None
    rs = [med[c] / med_us[c] for c in med if c in med_us and med_us[c] > 0]
    return statistics.median(rs) if len(rs) >= 10 else None


# Calibración de la deriva 2022->hoy, con los países que tienen WhereNext
_pares = [wn_index[c] / (_snap_pli(c) * 82) for c in wn_index
          if _snap_pli(c) and _snap_pli(c) > 0]
FACTOR_SNAP = statistics.median(_pares)

snap_index = {}
for cc in mediana_pais:
    p = _snap_pli(cc)
    if p:
        snap_index[cc] = round(p * 82 * FACTOR_SNAP)


def _indice_wb(cc):
    """Índice Banco Mundial con red de seguridad del snapshot."""
    idx = round(pli[cc] * 82 * FACTOR_WB)
    snap = snap_index.get(cc)
    roto = idx < IDX_MIN or idx > IDX_MAX
    if snap and (roto or idx > snap * DESVIO_MAX or idx < snap / DESVIO_MAX):
        return snap, "numbeo2022"
    if roto:
        return min(max(idx, IDX_MIN), IDX_MAX), "worldbank"
    return idx, "worldbank"


def indice_pais(cc):
    """Devuelve (indice, fuente, mensual_usd) para un ISO-2, o (None, '', None)."""
    if cc in wn_index:
        return wn_index[cc], "wherenext", wn_mensual.get(cc)
    if cc in pli:
        idx, fuente = _indice_wb(cc)
        return idx, fuente, None
    if cc in snap_index:
        return snap_index[cc], "numbeo2022", None
    padre = HEREDADOS.get(cc)
    if padre:
        idx, fuente, _ = indice_pais(padre)
        if idx is not None:
            return idx, "heredado", wn_mensual.get(padre)
    return None, "", None


# =====================================================
# 3) AEROPUERTOS: city_code IATA -> nombre de ciudad
# =====================================================

tp = json.load(open(ruta_tp))
ciudad_por_codigo = {}
for c in tp:
    code = c.get("code")
    nombre = (c.get("name_translations") or {}).get("en") or c.get("name")
    if code and nombre:
        ciudad_por_codigo[code] = nombre

# =====================================================
# 4) CRUCE FINAL Y CSV
# =====================================================


def categoria(indice):
    if indice < 35:
        return "€"
    if indice < 60:
        return "€€"
    if indice < 85:
        return "€€€"
    return "€€€€"


salida = []
stats = {"wherenext": 0, "worldbank": 0, "numbeo2022": 0, "heredado": 0,
         "sin_indice": 0, "con_ratio": 0, "ratio_manual": 0}

with open(AIRPORTS_CSV, encoding="utf-8-sig") as f:
    for row in csv.DictReader(f, delimiter=";"):
        iata = row["code"].strip().upper()
        cc = row["country_code"].strip().upper()
        city_code = row["city_code"].strip().upper()
        idx, fuente, mensual = indice_pais(cc)

        ciudad_snap, ratio = "", 1.0
        nombre_ciudad = ciudad_por_codigo.get(city_code)
        if nombre_ciudad:
            for variante in variantes_nombre(nombre_ciudad):
                hit = ratios.get((cc, variante))
                if hit:
                    ratio, ciudad_snap = hit[0], hit[1]
                    break
        if not ciudad_snap and city_code in RATIO_MANUAL:
            ratio, etiqueta = RATIO_MANUAL[city_code]
            ciudad_snap = f"{etiqueta} (ajuste manual)"
            stats["ratio_manual"] += 1

        if idx is None:
            stats["sin_indice"] += 1
            salida.append([iata, cc, "", "", ciudad_snap, ratio, "", "", ""])
            continue

        stats[fuente] += 1
        if ciudad_snap:
            stats["con_ratio"] += 1
        final = round(idx * ratio)
        mensual_out = round(mensual * ratio) if mensual else ""
        salida.append([iata, cc, idx, fuente, ciudad_snap, ratio,
                       final, categoria(final), mensual_out])

with open(OUT_CSV, "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f, delimiter=";")
    w.writerow(["iata", "country_code", "indice_pais", "fuente_pais",
                "ciudad_snapshot", "ratio_ciudad", "indice_coste",
                "categoria", "coste_mensual_usd"])
    w.writerows(salida)

print(f"\nGenerado {OUT_CSV}")
print(f"Aeropuertos procesados: {len(salida)}")
print(f"Calibración: Banco Mundial x{FACTOR_WB:.3f} | snapshot 2022 x{FACTOR_SNAP:.3f}")
print(f"Fuente del índice: {stats['wherenext']} wherenext | "
      f"{stats['worldbank']} worldbank | {stats['numbeo2022']} numbeo2022 | "
      f"{stats['heredado']} heredado | {stats['sin_indice']} SIN ÍNDICE")
print(f"Con ajuste de ciudad: {stats['con_ratio']} "
      f"({stats['con_ratio'] * 100 // len(salida)}%), de los cuales "
      f"{stats['ratio_manual']} manuales")
