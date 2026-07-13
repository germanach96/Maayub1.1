"""
Descarga la lista completa de sitios Patrimonio de la Humanidad (UNESCO) y la
vuelca a un CSV (separado por ';') para INSPECCIONARLA. Es el paso previo al
enriquecimiento por aeropuerto: aquí solo generamos la lista maestra de sitios.

=== POR QUÉ WIKIDATA Y NO EL XML OFICIAL ===
La web oficial (whc.unesco.org) está detrás de Cloudflare con un reto de
JavaScript ("Just a moment..."), así que un script normal recibe 403. Wikidata
tiene TODOS los sitios WHC (los cruza por el "World Heritage Site ID", P757),
con coordenadas y los criterios de inscripción, y su endpoint SPARQL sí es
accesible por programa. El total y el reparto por categoría coinciden con las
cifras oficiales de UNESCO.

=== QUÉ PRODUCE ===
unesco_sitios.csv con una fila por sitio (deduplicado por whc_id):
  whc_id;nombre;pais;categoria;criterios;lat;lon;n_componentes
- categoria: cultural (criterios i-vi), natural (vii-x) o mixto (ambos).
- n_componentes: nº de puntos que Wikidata tiene para ese sitio (los sitios en
  serie tienen varios; aquí guardamos el primero como representativo).

=== CAVEATS (para tenerlos presentes al mirar el CSV) ===
- En sitios en serie, nombre/coordenada son los de UNO de los componentes, no
  siempre el nombre oficial del conjunto.
- Unos pocos sitios no tienen criterio en Wikidata -> categoria vacía.
Ambos se pueden afinar después; para revisar el contenido sirve tal cual.
"""

import re
import csv
import requests
from collections import defaultdict, Counter

WDQS = "https://query.wikidata.org/sparql"
HEADERS = {"User-Agent": "MaayubResearch/1.0 (germanach96@gmail.com)"}
TIMEOUT = 180
OUTPUT_CSV = "unesco_sitios.csv"

# Criterios: i-vi = cultural, vii-x = natural. Con ambos -> mixto.
CULTURALES = {"i", "ii", "iii", "iv", "v", "vi"}
NATURALES = {"vii", "viii", "ix", "x"}
ORDEN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"]

# Un punto por sitio + país + nombre.
Q_SITIOS = """
SELECT ?whcid ?name ?countryLabel ?lat ?lon WHERE {
  ?item wdt:P757 ?whcid .
  ?item p:P625 [ psv:P625 [ wikibase:geoLatitude ?lat ; wikibase:geoLongitude ?lon ] ] .
  OPTIONAL { ?item rdfs:label ?name . FILTER(LANG(?name)="en") }
  OPTIONAL { ?item wdt:P17 ?country . ?country rdfs:label ?countryLabel . FILTER(LANG(?countryLabel)="en") }
}
"""

# Criterios de inscripción por sitio.
Q_CRITERIOS = """
SELECT ?whcid ?critLabel WHERE {
  ?item wdt:P757 ?whcid .
  ?item wdt:P2614 ?c .
  ?c rdfs:label ?critLabel . FILTER(LANG(?critLabel)="en")
}
"""


def sparql(query):
    r = requests.get(WDQS, params={"query": query, "format": "json"},
                     headers=HEADERS, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()["results"]["bindings"]


def id_base(whcid):
    """El id oficial es numérico; Wikidata añade sufijos (bis/ter) en extensiones
    y reusa el id del sitio en sus componentes. Nos quedamos con el nº base."""
    m = re.match(r"^(\d+)", whcid.strip())
    return m.group(1) if m else None


def categoria(criterios):
    cult = bool(criterios & CULTURALES)
    nat = bool(criterios & NATURALES)
    if cult and nat:
        return "mixto"
    if nat:
        return "natural"
    if cult:
        return "cultural"
    return ""


def ejecutar():
    print("Consultando Wikidata (sitios)...")
    filas = sparql(Q_SITIOS)
    print("Consultando Wikidata (criterios)...")
    filas_crit = sparql(Q_CRITERIOS)
    print(f"  {len(filas)} componentes con coordenadas | {len(filas_crit)} criterios")

    # Criterios agregados por sitio.
    crit_por_sitio = defaultdict(set)
    for b in filas_crit:
        bid = id_base(b["whcid"]["value"])
        if bid:
            crit_por_sitio[bid].add(b["critLabel"]["value"].strip("()").lower())

    # Deduplicar a un registro por sitio; contar componentes.
    sitios = {}
    n_componentes = defaultdict(int)
    for b in filas:
        g = lambda k: b[k]["value"] if k in b else ""
        bid = id_base(g("whcid"))
        if not bid:
            continue
        n_componentes[bid] += 1
        if bid not in sitios:
            sitios[bid] = {"whc_id": bid, "nombre": g("name"), "pais": g("countryLabel"),
                           "lat": g("lat"), "lon": g("lon")}

    salida = []
    for bid, s in sitios.items():
        cs = crit_por_sitio.get(bid, set())
        salida.append({
            **s,
            "categoria": categoria(cs),
            "criterios": " ".join(f"({c})" for c in ORDEN if c in cs),
            "n_componentes": n_componentes[bid],
        })
    salida.sort(key=lambda r: int(r["whc_id"]))

    cols = ["whc_id", "nombre", "pais", "categoria", "criterios", "lat", "lon", "n_componentes"]
    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols, delimiter=";")
        w.writeheader()
        w.writerows(salida)

    reparto = Counter(r["categoria"] or "sin_categoria" for r in salida)
    print(f"\n>>> {OUTPUT_CSV}: {len(salida)} sitios únicos con coordenadas.")
    print(f">>> Por categoría: {dict(reparto)}")
    print(f">>> Sitios en serie (>1 componente): {sum(1 for r in salida if r['n_componentes'] > 1)}")


if __name__ == "__main__":
    ejecutar()
