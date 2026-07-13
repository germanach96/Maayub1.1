"""
Genera un índice turístico por destino a partir de las visitas al artículo de
Wikipedia de cada ciudad. Da DOS señales para el score:
  1. Popularidad  -> cuánto "tira" el destino (media de visitas/mes). Estático por iata.
  2. Estacionalidad -> en qué meses sube/baja el interés. Por (iata, mes).

=== USO: COPIAR Y PEGAR ESTE CÓDIGO EN UNA CELDA DE COLAB Y EJECUTAR ===
Al ejecutar, el script:
  1. Monta tu Google Drive (para guardar los CSV).
  2. Mapea cada iata -> artículo de la ciudad servida (vía Wikidata).
  3. Baja las visitas mensuales de cada artículo (API oficial de Wikimedia).
  4. Escribe dos CSV y los descarga.

=== POR QUÉ WIKIPEDIA PAGEVIEWS ===
No existe gratis un "nº de visitantes por ciudad y mes" global. Las visitas al
artículo de Wikipedia son el mejor proxy accesible: API oficial sin key, cobertura
mundial, y dan popularidad + estacionalidad. Se promedian varios años (excluyendo
2020-2021 por el COVID) para suavizar picos de noticias.

=== LÍMITE HONESTO (leer) ===
Funciona muy bien en destinos turísticos "puros" (islas, costa): la curva mensual
sigue la temporada real. En METRÓPOLIS grandes (Barcelona, capitales) el artículo
recibe mucho tráfico no turístico (fútbol, noticias) y la estacionalidad se
distorsiona. La POPULARIDAD absoluta sí es fiable para todos. Para el score conviene
que la estacionalidad turística pese poco en ciudades grandes (o cruzarla con la
curva de precios de vuelo, que es otro proxy de demanda menos contaminado).

=== SALIDAS ===
1) turismo_ciudades.csv  (una fila por iata, PARA REVISAR EL MAPEO):
     iata;articulo;visitas_mes_media;popularidad_0_100;n_candidatos
2) turismo_destinos.csv  (join por iata + mes):
     iata;mes;turismo_idx    (1.00 = mes medio; >1 temporada alta; <1 baja)

REQUISITO: sube 'airports_flightable_categorized.csv' a Colab (a /content) o déjalo
en la carpeta de Drive indicada abajo.
"""

import os
import ast
import time
import math
from urllib.parse import quote, unquote
from collections import defaultdict

import requests
import pandas as pd

# =====================================================
# CONFIGURACIÓN
# =====================================================

CARPETA_DRIVE = "/content/drive/MyDrive/maayub_turismo"
INPUT_CSV_NAME = "airports_flightable_categorized.csv"
OUT_CIUDADES = "turismo_ciudades.csv"
OUT_DESTINOS = "turismo_destinos.csv"

WDQS = "https://query.wikidata.org/sparql"
PAGEVIEWS = ("https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/"
             "en.wikipedia/all-access/all-agents/{art}/monthly/{ini}/{fin}")
HTTP_HEADERS = {"User-Agent": "MaayubResearch/1.0 (germanach96@gmail.com)"}
TIMEOUT = 180

# Ventana de años y años a excluir (COVID distorsiona la estacionalidad).
ANIO_INI, ANIO_FIN = 2018, 2024
ANIOS_EXCLUIR = {2020, 2021}
MIN_MESES = 24            # mínimo de meses con datos para fiarnos de la curva

# Aeropuertos cuyo artículo no sale por Wikidata: se fija a mano.
ARTICULO_MANUAL = {"TPE": "Taipei"}

LOTE_WD = 50             # iatas por consulta a Wikidata
PAUSA_PV = 0.1           # pausa entre llamadas de pageviews


# =====================================================
# MAESTRO
# =====================================================

def cargar_iatas(ruta):
    df = pd.read_csv(ruta, sep=";", encoding="utf-8-sig")
    return [str(c).strip().upper() for c in df["code"]]


def localizar_input():
    for p in [INPUT_CSV_NAME,
              os.path.join("/content", INPUT_CSV_NAME),
              os.path.join(CARPETA_DRIVE, INPUT_CSV_NAME)]:
        if os.path.exists(p):
            return p
    return None


# =====================================================
# MAPEO iata -> artículos candidatos (Wikidata)
# =====================================================

def _wd_lote(iatas):
    values = " ".join(f'"{v}"' for v in iatas)
    q = f"""SELECT ?iata ?article WHERE {{
      VALUES ?iata {{ {values} }}
      ?airport wdt:P238 ?iata .
      OPTIONAL {{ ?airport wdt:P931 ?city .
        ?article schema:about ?city ; schema:isPartOf <https://en.wikipedia.org/> . }}
    }}"""
    for intento in range(4):
        try:
            r = requests.get(WDQS, params={"query": q, "format": "json"},
                             headers=HTTP_HEADERS, timeout=TIMEOUT)
            if r.status_code == 200:
                return r.json()["results"]["bindings"]
        except Exception:
            pass
        time.sleep(3 * (intento + 1))
    return []


def mapear_candidatos(iatas):
    """iata -> conjunto de títulos de artículo candidatos (ciudad servida)."""
    candidatos = defaultdict(set)
    for i in range(0, len(iatas), LOTE_WD):
        for b in _wd_lote(iatas[i:i + LOTE_WD]):
            ia = b["iata"]["value"]
            a = b.get("article", {}).get("value", "")
            if a:
                candidatos[ia].add(unquote(a.split("/wiki/")[-1]))
        time.sleep(1)
    # Añadir/forzar los fijados a mano.
    for ia, titulo in ARTICULO_MANUAL.items():
        if ia in iatas:
            candidatos[ia].add(titulo)
    return candidatos


# =====================================================
# PAGEVIEWS
# =====================================================

def visitas_mensuales(titulo):
    """Devuelve dict {mes: media_de_visitas} para un artículo, o None.
    Excluye años COVID y exige un mínimo de meses."""
    url = PAGEVIEWS.format(art=quote(titulo, safe=""),
                           ini=f"{ANIO_INI}010100", fin=f"{ANIO_FIN}123100")
    r = None
    for intento in range(5):
        try:
            r = requests.get(url, headers=HTTP_HEADERS, timeout=60)
        except Exception:
            time.sleep(2 * (intento + 1))
            continue
        if r.status_code == 200:
            break
        if r.status_code == 404:
            return None                       # el artículo no existe: sin dato real
        time.sleep(2 * (intento + 1))         # 429/5xx: backoff y reintento
    if r is None or r.status_code != 200:
        return None
    por_mes = defaultdict(list)
    for it in r.json().get("items", []):
        anio = int(it["timestamp"][0:4])
        if anio in ANIOS_EXCLUIR:
            continue
        mes = int(it["timestamp"][4:6])
        por_mes[mes].append(it["views"])
    if sum(len(v) for v in por_mes.values()) < MIN_MESES or len(por_mes) < 12:
        return None
    return {m: sum(v) / len(v) for m, v in por_mes.items()}


# =====================================================
# FLUJO PRINCIPAL
# =====================================================

def ejecutar():
    try:
        from google.colab import drive
        drive.mount("/content/drive")
    except Exception as e:
        print(f"(Aviso) No se pudo montar Drive, se usará disco local: {e}")

    os.makedirs(CARPETA_DRIVE, exist_ok=True)
    path_ciudades = os.path.join(CARPETA_DRIVE, OUT_CIUDADES)
    path_destinos = os.path.join(CARPETA_DRIVE, OUT_DESTINOS)

    input_path = localizar_input()
    if input_path is None:
        print(f"ERROR: no encuentro '{INPUT_CSV_NAME}'. Súbelo y reejecuta.")
        return
    iatas = cargar_iatas(input_path)
    print(f"Aeropuertos: {len(iatas)}")

    print("Mapeando iata -> artículo (Wikidata)...")
    candidatos = mapear_candidatos(iatas)

    # Cache de visitas por artículo (varios iata pueden compartir artículo).
    cache = {}
    def visitas(titulo):
        if titulo not in cache:
            cache[titulo] = visitas_mensuales(titulo)
            time.sleep(PAUSA_PV)
        return cache[titulo]

    # Por cada iata, elegir el candidato con más visitas (la ciudad real domina
    # sobre aeropuerto/provincia/ruido) y quedarnos con su curva mensual.
    elegido = {}       # iata -> (titulo, por_mes, media)
    print("Bajando pageviews y eligiendo artículo por destino...")
    for n, ia in enumerate(iatas, 1):
        mejor = None
        for titulo in candidatos.get(ia, set()):
            pm = visitas(titulo)
            if not pm:
                continue
            media = sum(pm.values()) / 12
            if mejor is None or media > mejor[2]:
                mejor = (titulo, pm, media)
        if mejor:
            elegido[ia] = mejor
        if n % 100 == 0:
            print(f"  {n}/{len(iatas)}")

    if not elegido:
        print(">>> No se obtuvo ningún dato de pageviews. Reintenta más tarde.")
        return

    # Popularidad 0-100 en escala log (el rango de visitas es enorme).
    logs = {ia: math.log10(e[2] + 1) for ia, e in elegido.items()}
    lo, hi = min(logs.values()), max(logs.values())
    def pop100(ia):
        return round(100 * (logs[ia] - lo) / (hi - lo), 1) if hi > lo else 0.0

    # CSV 1: ciudades (para revisar el mapeo).
    filas_c = []
    for ia in iatas:
        if ia in elegido:
            titulo, _, media = elegido[ia]
            filas_c.append({"iata": ia, "articulo": titulo,
                            "visitas_mes_media": int(round(media)),
                            "popularidad_0_100": pop100(ia),
                            "n_candidatos": len(candidatos.get(ia, set()))})
        else:
            filas_c.append({"iata": ia, "articulo": "", "visitas_mes_media": "",
                            "popularidad_0_100": "", "n_candidatos": len(candidatos.get(ia, set()))})
    pd.DataFrame(filas_c)[["iata", "articulo", "visitas_mes_media",
                           "popularidad_0_100", "n_candidatos"]].to_csv(
        path_ciudades, index=False, sep=";", encoding="utf-8")

    # CSV 2: destinos (iata + mes -> índice estacional, 1.00 = mes medio).
    filas_d = []
    for ia in iatas:
        if ia not in elegido:
            continue
        _, pm, media = elegido[ia]
        for mes in range(1, 13):
            idx = pm[mes] / media if media > 0 else 0
            filas_d.append({"iata": ia, "mes": mes, "turismo_idx": round(idx, 2)})
    pd.DataFrame(filas_d)[["iata", "mes", "turismo_idx"]].to_csv(
        path_destinos, index=False, sep=";", encoding="utf-8")

    # Resumen.
    print(f"\n>>> {path_ciudades}: {len(elegido)} de {len(iatas)} destinos con datos.")
    print(f">>> {path_destinos}: {len(filas_d)} filas (iata x 12 meses).")
    sin = [ia for ia in iatas if ia not in elegido]
    if sin:
        print(f">>> Sin datos ({len(sin)}): {sin[:20]}")
    _descargar(path_ciudades); _descargar(path_destinos)


def _descargar(path):
    try:
        from google.colab import files
        files.download(path)
    except Exception:
        pass


if __name__ == "__main__":
    ejecutar()
