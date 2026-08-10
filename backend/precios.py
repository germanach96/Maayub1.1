"""muuyal — el maestro de precios por ruta y mes.

Séptimo CSV maestro, con una diferencia respecto a los otros seis: este no
viene de una fuente externa, lo fabricas tú usando la web. Buscas, pulsas
"Descargar resultados", mandas el archivo, y `precios/actualizar_precios.py`
lo mete en `precios/precios_<ORIGEN>.csv`. El manual es ACTUALIZAR_PRECIOS.md.

PARA QUÉ SIRVE
--------------
Para saber si un vuelo es un chollo hay que compararlo con lo que cuesta
normalmente esa ruta. Hasta ahora esa referencia era la mediana de los vuelos
de la misma búsqueda, con todos los meses mezclados. Medido sobre el CSV de
ejemplo, un redondo a Bangkok vale 660 € en agosto y 840 € en diciembre, y la
mediana global sale 670 €: con esa referencia, un vuelo de diciembre a 700 €
parecía caro siendo de los baratos de su mes. La señal medía temporada, no
oportunidad.

UN ARCHIVO POR AEROPUERTO DE ORIGEN
-----------------------------------
`precios_BCN.csv` no tiene nada que ver con `precios_MEX.csv`: el precio normal
de Tokio depende de desde dónde salgas. Se cargan todos los que haya.

Solo hay precios de ida (`OW_IDA`) y de vuelta (`OW_VUELTA`). Los redondos no
entran: tienen mes de ida y mes de vuelta, y pueden ser distintos, así que no
se les puede asignar "su mes". Un redondo se sigue puntuando con la mediana del
lote, como siempre.
"""

import csv
from pathlib import Path

CARPETA = Path(__file__).resolve().parent.parent / "precios"

# Columnas del maestro que escribe precios/actualizar_precios.py.
COLUMNAS = ["origen", "destino", "mes",
            "ida_mediana", "ida_media", "ida_n",
            "vuelta_mediana", "vuelta_media", "vuelta_n",
            "actualizado"]

# Qué columna del maestro le corresponde a cada tipo de vuelo.
POR_TIPO = {"OW_IDA": "ida", "OW_VUELTA": "vuelta"}


def _num(v):
    try:
        n = float(v)
    except (TypeError, ValueError):
        return None
    return n if n > 0 else None


def cargar(carpeta=None):
    """Lee todos los `precios_*.csv` y devuelve el índice que usa la
    puntuación: (origen, destino, tipo, mes) -> {precio_base, n_vuelos}.

    Si no hay carpeta ni archivos, devuelve un diccionario vacío y la web
    puntúa como siempre. El maestro es una mejora, nunca un requisito.
    """
    carpeta = Path(carpeta) if carpeta else CARPETA
    indice = {}
    if not carpeta.is_dir():
        return indice

    for ruta in sorted(carpeta.glob("precios_*.csv")):
        with open(ruta, encoding="utf-8-sig", newline="") as fh:
            for fila in csv.DictReader(fh, delimiter=";"):
                origen = (fila.get("origen") or "").strip().upper()
                destino = (fila.get("destino") or "").strip().upper()
                try:
                    mes = int(fila.get("mes"))
                except (TypeError, ValueError):
                    continue
                if not origen or not destino or not 1 <= mes <= 12:
                    continue
                for tipo, prefijo in POR_TIPO.items():
                    # Se usa la mediana, no la media: un billete de business
                    # de 4.000 € desplaza la media y no la mediana. La media
                    # está en el archivo para poder mirarla, no para puntuar.
                    precio = _num(fila.get(f"{prefijo}_mediana"))
                    n = _num(fila.get(f"{prefijo}_n"))
                    if precio is None:
                        continue
                    indice[(origen, destino, tipo, mes)] = {
                        "precio_base": precio,
                        "n_vuelos": int(n) if n else 0,
                    }
    return indice
