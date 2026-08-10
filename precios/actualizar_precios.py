"""muuyal — actualiza el maestro de precios con los resultados de una búsqueda.

QUÉ HACE
--------
El dueño del repo busca en muuyal, pulsa "Descargar resultados" y manda el CSV.
Este script lo mete en el maestro de SU aeropuerto de origen y recalcula el
precio normal de cada destino en cada mes.

    python3 precios/actualizar_precios.py muuyal_resultados_BCN_Top151_2026-08-10.csv

Se le pueden pasar varios archivos de golpe. Con `--dry-run` enseña lo que haría
sin tocar nada.

DOS ARCHIVOS POR ORIGEN, Y POR QUÉ HACEN FALTA LOS DOS
-----------------------------------------------------
    precios/precios_BCN.csv   EL MAESTRO. Una línea por destino y mes, con el
                              precio de ida y el de vuelta. Es el que lee la web.
    precios/vuelos_BCN.csv    La memoria: qué vuelos concretos se han contado ya.

El segundo existe por la regla de no contar nada dos veces. Un promedio no
puede responder "¿ya tenía yo este vuelo?"; hace falta recordar cuáles se han
contado. Es la misma razón por la que `valoraciones_maestro.csv` guarda todas
las valoraciones en vez de solo su media.

Un origen no toca a otro: buscar desde MEX crea `precios_MEX.csv` y
`vuelos_MEX.csv` y no roza los de BCN.

LOS REDONDOS NO ENTRAN
----------------------
Un billete de ida y vuelta tiene mes de ida y mes de vuelta, y pueden ser
distintos: no se le puede asignar "su mes" sin mentir. Se exportan igualmente
por si algún día sirven, pero el maestro solo cuenta `OW_IDA` y `OW_VUELTA`.

CÓMO SE RECONOCE UN VUELO YA CONTADO
------------------------------------
Por `id_vuelo`, que es la identidad de contenido que ya usan las valoraciones:
tipo, origen, destino, salida, vuelta, aerolínea y número.

El enlace de Aviasales NO vale como identificador, aunque lo parezca: lleva
dentro `search_date` (que cambia cada día) y `expected_price_uuid` (que cambia
en cada consulta). Comprobado sobre los 9.318 vuelos del CSV de ejemplo: salen
9.318 enlaces distintos. Identificando por enlace, el mismo vuelo contaría como
nuevo cada vez y los promedios se inflarían solos.

Si un vuelo ya contado vuelve con OTRO precio, no se añade: se actualiza el que
había. El precio bueno es el más reciente, y así una ruta que buscas mucho no
pesa más solo por buscarla mucho.
"""

import argparse
import csv
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path
from statistics import mean, median

CARPETA = Path(__file__).resolve().parent

# Solo estos tipos entran en el maestro. Ver "LOS REDONDOS NO ENTRAN".
TIPOS = ("OW_IDA", "OW_VUELTA")

# Vuelos que hacen falta en una casilla (destino + mes + sentido) para publicar
# su precio. Con menos no hay "precio normal" y preferimos el hueco declarado.
# Es el mismo número que usa scoring.CHOLLO_MIN_VUELOS.
MIN_VUELOS = 10

COLS_VUELOS = ["id_vuelo", "destino", "tipo", "mes", "price", "dia_busqueda",
               "busqueda_id"]

COLS_MAESTRO = ["origen", "destino", "mes",
                "ida_mediana", "ida_media", "ida_n",
                "vuelta_mediana", "vuelta_media", "vuelta_n",
                "actualizado"]


def leer_csv(ruta):
    if not Path(ruta).exists():
        return []
    with open(ruta, encoding="utf-8-sig", newline="") as fh:
        return list(csv.DictReader(fh, delimiter=";"))


def escribir_csv(ruta, filas, columnas):
    with open(ruta, "w", encoding="utf-8-sig", newline="") as fh:
        escritor = csv.DictWriter(fh, fieldnames=columnas, delimiter=";",
                                  lineterminator="\n")
        escritor.writeheader()
        for fila in filas:
            escritor.writerow({c: fila.get(c, "") for c in columnas})


def num(v):
    try:
        n = float(v)
    except (TypeError, ValueError):
        return None
    return n if n > 0 else None


def cargar_export(ruta):
    """Lee un CSV exportado de la web y lo deja en filas de memoria.

    Devuelve (origen, filas, descartes). Solo pasan los vuelos con todo lo
    imprescindible: identidad, destino, mes, sentido útil y precio.
    """
    crudas = leer_csv(ruta)
    if not crudas:
        raise SystemExit(f"{ruta}: está vacío o no se puede leer")

    origenes = {f.get("busqueda_origen", "").strip().upper() for f in crudas}
    origenes.discard("")
    if len(origenes) != 1:
        raise SystemExit(
            f"{ruta}: esperaba un solo aeropuerto de origen y hay {sorted(origenes)}"
        )
    origen = origenes.pop()

    filas, descartes = [], defaultdict(int)
    for f in crudas:
        if f.get("tipo_llamada") not in TIPOS:
            descartes["redondos (no tienen un solo mes)"] += 1
            continue
        precio = num(f.get("price"))
        if precio is None:
            descartes["sin precio"] += 1
            continue
        if not f.get("id_vuelo") or not f.get("destino") or not f.get("mes"):
            descartes["sin identidad, destino o mes"] += 1
            continue
        filas.append({
            "id_vuelo": f["id_vuelo"],
            "destino": f["destino"],
            "tipo": f["tipo_llamada"],
            "mes": str(int(f["mes"])),
            "price": round(precio, 2),
            "dia_busqueda": f.get("dia_busqueda", ""),
            "busqueda_id": f.get("busqueda_id", ""),
        })
    return origen, filas, dict(descartes)


def fusionar(memoria, nuevas):
    """Añade a la memoria los vuelos que no estuvieran ya contados.

    Devuelve (filas, resumen). Un vuelo ya contado que vuelve con otro precio
    actualiza el suyo en vez de añadir una línea nueva.
    """
    por_id = {f["id_vuelo"]: f for f in memoria}
    resumen = defaultdict(int)
    resumen["ya_estaban"] = 0

    for fila in nuevas:
        previo = por_id.get(fila["id_vuelo"])
        if previo is None:
            por_id[fila["id_vuelo"]] = fila
            resumen["nuevos"] += 1
        elif num(previo["price"]) != fila["price"]:
            # Mismo vuelo, precio distinto: manda el más reciente.
            if fila["dia_busqueda"] >= previo.get("dia_busqueda", ""):
                por_id[fila["id_vuelo"]] = fila
                resumen["precio_actualizado"] += 1
            else:
                resumen["ya_estaban"] += 1
        else:
            resumen["ya_estaban"] += 1

    filas = sorted(por_id.values(),
                   key=lambda f: (f["destino"], f["tipo"], int(f["mes"]),
                                  f["id_vuelo"]))
    resumen["total"] = len(filas)
    return filas, dict(resumen)


def calcular_maestro(origen, memoria, hoy=None):
    """Del listado de vuelos al precio normal por destino y mes.

    Una línea por (destino, mes) con las dos direcciones al lado, que es como
    se lee de un vistazo. Una dirección con menos de MIN_VUELOS sale vacía; si
    ninguna de las dos llega, la línea no se escribe.
    """
    hoy = hoy or date.today().isoformat()
    grupos = defaultdict(lambda: {"OW_IDA": [], "OW_VUELTA": []})
    for f in memoria:
        precio = num(f["price"])
        if precio is None or f["tipo"] not in TIPOS:
            continue
        grupos[(f["destino"], int(f["mes"]))][f["tipo"]].append(precio)

    maestro = []
    for (destino, mes), precios in sorted(grupos.items()):
        fila = {"origen": origen, "destino": destino, "mes": mes,
                "actualizado": hoy}
        publicada = False
        for tipo, prefijo in (("OW_IDA", "ida"), ("OW_VUELTA", "vuelta")):
            valores = precios[tipo]
            if len(valores) >= MIN_VUELOS:
                # La mediana es la que usa la web: no se la lleva por delante
                # un billete de business de 4.000 €. La media va al lado
                # porque es la que se pidió y sirve para comparar.
                fila[f"{prefijo}_mediana"] = round(median(valores), 2)
                fila[f"{prefijo}_media"] = round(mean(valores), 2)
                fila[f"{prefijo}_n"] = len(valores)
                publicada = True
            else:
                fila[f"{prefijo}_mediana"] = ""
                fila[f"{prefijo}_media"] = ""
                fila[f"{prefijo}_n"] = len(valores)
        if publicada:
            maestro.append(fila)
    return maestro


def procesar(rutas, dry_run=False):
    por_origen = defaultdict(list)
    for ruta in rutas:
        origen, filas, descartes = cargar_export(ruta)
        print(f"\n{Path(ruta).name}")
        print(f"  origen: {origen} · {len(filas)} vuelos utilizables")
        for motivo, n in sorted(descartes.items()):
            print(f"  fuera: {n} {motivo}")
        por_origen[origen] += filas

    for origen, nuevas in sorted(por_origen.items()):
        ruta_memoria = CARPETA / f"vuelos_{origen}.csv"
        ruta_maestro = CARPETA / f"precios_{origen}.csv"
        memoria = leer_csv(ruta_memoria)

        # Aviso si ya se había metido esta misma búsqueda: no rompe nada
        # (la deduplicación lo resuelve igual), pero conviene saberlo.
        ya_vistas = {f.get("busqueda_id") for f in memoria}
        repetidas = {f["busqueda_id"] for f in nuevas} & ya_vistas
        if repetidas:
            print(f"\n  ⚠ estas búsquedas ya estaban metidas: {sorted(repetidas)}")

        filas, resumen = fusionar(memoria, nuevas)
        maestro = calcular_maestro(origen, filas)

        print(f"\n{origen}")
        print(f"  vuelos nuevos:        {resumen.get('nuevos', 0)}")
        print(f"  precios actualizados: {resumen.get('precio_actualizado', 0)}")
        print(f"  ya estaban contados:  {resumen.get('ya_estaban', 0)}")
        print(f"  memoria total:        {resumen['total']} vuelos "
              f"(antes {len(memoria)})")
        print(f"  maestro:              {len(maestro)} líneas destino+mes")
        con_ida = sum(1 for f in maestro if f["ida_n"] and f["ida_mediana"] != "")
        con_vuelta = sum(1 for f in maestro if f["vuelta_mediana"] != "")
        print(f"     con precio de ida:    {con_ida}")
        print(f"     con precio de vuelta: {con_vuelta}")

        if dry_run:
            print("  (--dry-run: no se ha escrito nada)")
            continue
        escribir_csv(ruta_memoria, filas, COLS_VUELOS)
        escribir_csv(ruta_maestro, maestro, COLS_MAESTRO)
        print(f"  escritos {ruta_memoria.name} y {ruta_maestro.name}")


def main():
    p = argparse.ArgumentParser(
        description="Mete los resultados de una búsqueda en el maestro de precios."
    )
    p.add_argument("csv", nargs="+",
                   help="CSV(s) descargados con 'Descargar resultados'")
    p.add_argument("--dry-run", action="store_true",
                   help="enseña lo que haría sin escribir nada")
    args = p.parse_args()
    procesar(args.csv, args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
