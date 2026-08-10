"""muuyal — Fase 2: puntuación de vuelos (suma ponderada 0–100).

Qué hace: a cada vuelo ya enriquecido le pone una nota de 0 a 100 combinando
todas las señales disponibles (precio, clima, coste, turismo, UNESCO, escalas…)
con la fórmula `nota = Σ peso × valor_normalizado`.

Por qué vive aquí y no en enrichment.py: la señal más importante (el "chollo")
compara el precio de un vuelo contra la MEDIANA de precio de su mismo destino,
y esa mediana solo se conoce cuando están todos los vuelos del lote. Por eso se
puntúa el lote entero de una vez, después de enriquecer.

La idea de fondo (§1 del encargo): la nota NO es "el más barato". Un
Barcelona–Mallorca barato no es un chollo, porque todo lo de Mallorca es
barato. Lo que interesa es que un vuelo esté más barato de lo normal PARA SU
DESTINO. Por eso el precio se parte en dos señales: `oportunidad` (descuento
respecto a la mediana de ese destino, la señal estrella) y `price_abs` (barato
a secas, con peso pequeño).

Campos que añade a cada vuelo:
    score              nota 0–100 entera (None si no hay datos para puntuar)
    score_desglose     valor normalizado (0–1) de cada señal, en el mismo orden
                       que `senales_activas()`; None = señal neutra en ese vuelo
    score_flags        avisos de fiabilidad de la nota
    antiguedad_en_dias días desde que Aviasales cacheó el precio
    oportunidad_base   mediana de precio de su (destino, tipo de vuelo)

El desglose viaja como lista de números, no como lista de diccionarios: una
búsqueda grande son ~9.000 vuelos y repetir en cada uno los nombres de las 12
señales engordaba la respuesta 3,6 MB. La leyenda (nombre y peso de cada
señal) se manda UNA vez en `meta.score_senales` y la interfaz la recompone.
"""

from statistics import median

# =====================================================================
# ===============  CONFIGURACIÓN — TOCA SOLO ESTO  ====================
# =====================================================================
# Todo lo ajustable está en este bloque. No hace falta leer el resto del
# archivo para cambiar cómo puntúa muuyal.
#
# Los pesos suman 100 por comodidad de lectura, pero no es obligatorio: la
# nota se normaliza sola. Peso 0 = esa señal no entra en la nota.

PESOS = {
    # -- Precio: las dos caras --------------------------------------
    "oportunidad":       29,  # descuento respecto a la mediana de SU destino
    "price_abs":         10,  # barato a secas
    # -- Destino ----------------------------------------------------
    "popularidad_0_100":  4,  # ver DIR_POPULARIDAD
    "turismo_idx":        8,  # ver DIR_TEMPORADA
    "indice_coste":      10,  # más barato vivir allí = mejor
    "unesco_100km":       4,  # más patrimonio cerca = mejor
    # -- Clima del mes de salida ------------------------------------
    "temp_media":        15,  # cercanía a TEMP_IDEAL
    "horas_sol_dia":      8,  # más sol = mejor
    "dias_lluvia":        4,  # menos lluvia = mejor
    # -- Comodidad del vuelo ----------------------------------------
    "duration":           3,  # más corto = mejor
    "transfers":          3,  # menos escalas = mejor
    "antiguedad_en_dias": 2,  # precio más reciente = más fiable
    # -- Preparadas pero apagadas (peso 0) --------------------------
    "distancia_km":       0,
    "temp_max_media":     0,
    "unesco_cercano_km":  0,
    "precip_mm":          0,
    "duration_to":        0,
    "duration_back":      0,
    "return_transfers":   0,
}

# --- Direcciones de gusto (confirmadas por el dueño del repo) ---------
# "mas"  = premia los destinos famosos · "menos" = premia lo poco turístico
DIR_POPULARIDAD = "mas"
# "alta" = premia el mes fuerte (ambiente) · "baja" = premia el mes flojo
DIR_TEMPORADA = "alta"

# --- Clima ------------------------------------------------------------
TEMP_IDEAL = 22   # °C que puntúan 1
TEMP_TOL = 8      # °C: a ±8 del ideal la nota de clima ya es 0
SOL_FULL = 12     # h/día de sol que ya cuentan como nota 1
LLUVIA_MAX = 20   # días de lluvia al mes que ya cuentan como nota 0

# --- Chollo (señal `oportunidad`) -------------------------------------
CHOLLO_MIN_VUELOS = 10    # mínimo de vuelos a un destino para fiarse de su mediana
CHOLLO_TOPE = 0.60        # descuento máximo premiado (60%); por encima puntúa igual

# --- Freno de la temporada en metrópolis ------------------------------
# turismo_idx sale de las visitas a Wikipedia y miente en ciudades grandes
# (§5.4 del CONTEXTO: Barcelona marca enero como mes fuerte). Por encima de
# esta popularidad, la señal se apaga para ese vuelo.
FRENO_POP = 75

# --- Rangos de referencia para normalizar -----------------------------
COSTE_MIN, COSTE_MAX = 15, 120   # rango real del CSV de coste de vida
UNESCO_CAP = 8                   # nº de sitios que ya cuentan como nota 1
TRANSFERS_MAX = 3
ANTIG_MAX = 7                    # días de antigüedad del precio

# --- Cómo se reparte el peso cuando falta un dato ---------------------
# True  = una señal sin dato no penaliza: se reparte su peso entre las demás
#         (un vuelo del que no sabemos si es chollo compite por sus otros
#          méritos). Es lo recomendado.
# False = las señales sin dato cuentan como 0: solo los vuelos con todos los
#         datos pueden llegar arriba del todo.
RENORMALIZAR = True

# Si las señales presentes suman menos de este porcentaje del peso total, la
# nota se apoya en muy pocos datos y se avisa con el flag "datos_incompletos".
MIN_PESO_PRESENTE = 0.60

# =====================================================================
# =================  A PARTIR DE AQUÍ, LA MECÁNICA  ===================
# =====================================================================


def _num(v):
    """Convierte a número lo que venga (la API manda números, el CSV de
    ejemplo manda texto). Devuelve None si no hay número utilizable."""
    if v is None or v == "":
        return None
    try:
        n = float(v)
    except (TypeError, ValueError):
        return None
    return None if n != n else n  # descarta NaN


def _clamp(x, lo, hi):
    return lo if x < lo else hi if x > hi else x


def _percentil(ordenados, p):
    """Percentil (0–1) de una lista YA ordenada, con interpolación lineal."""
    if not ordenados:
        return None
    if len(ordenados) == 1:
        return ordenados[0]
    pos = p * (len(ordenados) - 1)
    bajo = int(pos)
    alto = min(bajo + 1, len(ordenados) - 1)
    return ordenados[bajo] + (ordenados[alto] - ordenados[bajo]) * (pos - bajo)


def _dias_de_antiguedad(vuelo, fecha_consulta):
    """Días entre el día en que Aviasales cacheó el precio y la búsqueda.
    Mismo cálculo que hace la interfaz para el semáforo de frescura."""
    dia = vuelo.get("dia_busqueda")
    if not dia or not fecha_consulta:
        return None
    try:
        y1, m1, d1 = (int(x) for x in str(dia)[:10].split("-"))
        y2, m2, d2 = (int(x) for x in str(fecha_consulta)[:10].split("-"))
    except (ValueError, TypeError):
        return None
    from datetime import date
    try:
        return max(0, (date(y2, m2, d2) - date(y1, m1, d1)).days)
    except ValueError:
        return None


def _rangos_robustos(vuelos, extraer):
    """Percentiles 5 y 95 de un campo, calculados POR TIPO DE LLAMADA.

    No se pueden mezclar idas y redondos: un one-way a 50 € no compite contra
    redondos a 200 €. Se usan los percentiles 5/95 en vez del mínimo y el
    máximo para que un solo precio disparatado no aplaste la escala.
    """
    por_tipo = {}
    for v in vuelos:
        x = extraer(v)
        if x is not None:
            por_tipo.setdefault(v.get("tipo_llamada"), []).append(x)
    rangos = {}
    for tipo, valores in por_tipo.items():
        valores.sort()
        rangos[tipo] = (_percentil(valores, 0.05), _percentil(valores, 0.95))
    return rangos


def _norm_robusta(x, rango):
    """0–1 donde 1 = el valor más bajo del rango (barato / corto = mejor)."""
    if x is None or rango is None:
        return None
    lo, hi = rango
    if lo is None or hi is None:
        return None
    if hi == lo:
        return 0.5
    return (hi - _clamp(x, lo, hi)) / (hi - lo)


def _medianas_por_destino(vuelos):
    """Mediana de precio de cada (aeropuerto de destino, tipo de vuelo).

    Es el "precio normal" contra el que se mide el chollo. Ida, vuelta y
    redondo van por separado. Solo se devuelven los grupos con suficientes
    vuelos: con 2 o 3 no hay precio normal fiable y no nos lo inventamos.
    """
    grupos = {}
    for v in vuelos:
        precio = _num(v.get("price"))
        destino = v.get("enrich_airport")
        if precio is None or not destino:
            continue
        grupos.setdefault((destino, v.get("tipo_llamada")), []).append(precio)
    return {
        k: median(precios)
        for k, precios in grupos.items()
        if len(precios) >= CHOLLO_MIN_VUELOS
    }


def _base_de_precio(vuelo, origen, maestro, medianas):
    """Contra qué precio se mide el chollo de este vuelo. Devuelve (base, de
    dónde sale); lo segundo viaja al navegador y se enseña en la ficha, porque
    no es lo mismo un precio normal de verdad que un apaño de una búsqueda.

    Se prueban dos referencias, por este orden:

    1. **El maestro de precios** (precios/precios_<ORIGEN>.csv), si tiene esa
       casilla: mismo origen, mismo destino, mismo sentido Y MISMO MES. Es la
       buena, porque separa la oportunidad de la temporada.
    2. **La mediana del lote**, como se ha hecho siempre: los vuelos a ese
       destino que han venido en esta misma búsqueda, con los meses mezclados.
       Peor referencia, pero está disponible desde el primer día.

    Si no hay ninguna, la señal se apaga y se avisa. Los redondos siempre caen
    en la 2: el maestro no los cubre (mes de ida y de vuelta pueden diferir).
    Mientras el maestro se llena, la web puntúa exactamente igual que antes.
    """
    destino = vuelo.get("enrich_airport")
    tipo = vuelo.get("tipo_llamada")

    if origen and maestro:
        # enrich_month ya viene como entero 1-12 (o None) del enriquecimiento,
        # y es el mes de la IDA, que es el que corresponde (§8.4 del CONTEXTO).
        casilla = maestro.get((origen, destino, tipo, vuelo.get("enrich_month")))
        if casilla and casilla.get("n_vuelos", 0) >= CHOLLO_MIN_VUELOS:
            return casilla["precio_base"], "maestro"

    base = medianas.get((destino, tipo))
    if base:
        return base, "lote"
    return None, None


def _senales(vuelo, medianas, rango_precio, rango_duracion,
             origen=None, maestro=None):
    """Valor normalizado (0–1, 1 = mejor) de cada señal para UN vuelo.

    Devuelve (valores, flags). Una señal ausente del diccionario es NEUTRA:
    no suma ni penaliza, simplemente no participa en la nota de ese vuelo.
    """
    e = vuelo.get("enrichment") or {}
    clima = e.get("clima") or {}
    turismo = e.get("turismo") or {}
    turismo_mes = e.get("turismo_mes") or {}
    coste = e.get("coste") or {}
    unesco = e.get("unesco") or {}

    val = {}
    flags = []

    # --- oportunidad: ¿está más barato de lo normal para SU destino? ---
    precio = _num(vuelo.get("price"))
    base, procedencia = _base_de_precio(vuelo, origen, maestro, medianas)
    vuelo["oportunidad_base"] = round(base, 2) if base else None
    vuelo["oportunidad_base_origen"] = procedencia
    if precio is not None and base:
        descuento = _clamp((base - precio) / base, 0, CHOLLO_TOPE)
        val["oportunidad"] = descuento / CHOLLO_TOPE
    elif precio is not None:
        # Hay precio, pero no hay suficientes vuelos a ese destino para saber
        # qué es "normal" allí. La señal se apaga y se avisa.
        flags.append("chollo_pocos_datos")

    # --- price_abs: barato a secas, dentro de su tipo de vuelo ---------
    val_precio = _norm_robusta(precio, rango_precio.get(vuelo.get("tipo_llamada")))
    if val_precio is not None:
        val["price_abs"] = val_precio

    # --- destino -------------------------------------------------------
    pop = _num(turismo.get("popularidad_0_100"))
    if pop is not None:
        x = _clamp(pop / 100, 0, 1)
        val["popularidad_0_100"] = x if DIR_POPULARIDAD == "mas" else 1 - x

    idx = _num(turismo_mes.get("turismo_idx"))
    if idx is not None:
        if pop is not None and pop >= FRENO_POP:
            # Ciudad grande: su curva de temporada está contaminada por
            # tráfico no turístico. Mejor no puntuar que puntuar mal.
            flags.append("temporada_no_fiable")
        else:
            v = _clamp(idx, 0.7, 1.3)
            val["turismo_idx"] = ((v - 0.7) if DIR_TEMPORADA == "alta"
                                  else (1.3 - v)) / 0.6

    ic = _num(coste.get("indice_coste"))
    if ic is not None:
        val["indice_coste"] = _clamp((COSTE_MAX - ic) / (COSTE_MAX - COSTE_MIN), 0, 1)

    un = _num(unesco.get("unesco_100km"))
    if un is not None:
        val["unesco_100km"] = _clamp(un / UNESCO_CAP, 0, 1)

    # --- clima del mes de salida ---------------------------------------
    t = _num(clima.get("temp_media"))
    if t is not None:
        val["temp_media"] = max(0.0, 1 - abs(t - TEMP_IDEAL) / TEMP_TOL)

    sol = _num(clima.get("horas_sol_dia"))
    if sol is not None:
        val["horas_sol_dia"] = _clamp(sol / SOL_FULL, 0, 1)

    lluvia = _num(clima.get("dias_lluvia"))
    if lluvia is not None:
        val["dias_lluvia"] = 1 - _clamp(lluvia / LLUVIA_MAX, 0, 1)

    # --- comodidad del vuelo -------------------------------------------
    val_dur = _norm_robusta(_num(vuelo.get("duration")),
                            rango_duracion.get(vuelo.get("tipo_llamada")))
    if val_dur is not None:
        val["duration"] = val_dur

    esc = _num(vuelo.get("transfers"))
    if esc is not None:
        val["transfers"] = 1 - _clamp(esc / TRANSFERS_MAX, 0, 1)

    antig = vuelo.get("antiguedad_en_dias")
    if antig is not None:
        val["antiguedad_en_dias"] = 1 - _clamp(antig / ANTIG_MAX, 0, 1)

    # --- señales apagadas (peso 0): preparadas por si se activan --------
    if PESOS.get("distancia_km"):
        d = _num(vuelo.get("distancia_km"))
        if d is not None:
            val["distancia_km"] = 1 - _clamp(d / 20000, 0, 1)

    return val, flags


def senales_activas():
    """Leyenda del desglose: [[nombre, peso], ...] de las señales que puntúan,
    en el mismo orden en que viajan los valores de `score_desglose`."""
    return [[s, p] for s, p in PESOS.items() if p > 0]


def puntuar_vuelos(vuelos, fecha_consulta=None, origen=None, maestro=None):
    """Pone `score`, `score_desglose` y `score_flags` a cada vuelo del lote.

    `maestro` es el precio normal por ruta y mes acumulado de búsquedas
    anteriores ({(origen, destino, tipo, mes): {...}}, ver precios.py). Es
    opcional: sin él, el chollo se mide como siempre, con la mediana del lote.

    Modifica los vuelos en el sitio y devuelve la misma lista.
    """
    if not vuelos:
        return vuelos

    for v in vuelos:
        v["antiguedad_en_dias"] = _dias_de_antiguedad(v, fecha_consulta)

    medianas = _medianas_por_destino(vuelos)
    rango_precio = _rangos_robustos(vuelos, lambda v: _num(v.get("price")))
    rango_duracion = _rangos_robustos(vuelos, lambda v: _num(v.get("duration")))

    activas = senales_activas()
    peso_total = sum(p for _, p in activas)

    for v in vuelos:
        val, flags = _senales(v, medianas, rango_precio, rango_duracion,
                              origen, maestro)

        desglose = []
        raw = 0.0
        peso_presente = 0
        for senal, peso in activas:
            norm = val.get(senal)
            if norm is None:
                desglose.append(None)   # señal neutra en este vuelo
                continue
            raw += peso * norm
            peso_presente += peso
            desglose.append(round(norm, 3))

        divisor = peso_presente if RENORMALIZAR else peso_total
        if peso_presente == 0 or divisor == 0:
            v["score"] = None
        else:
            v["score"] = round(100 * raw / divisor)

        if peso_total and peso_presente < MIN_PESO_PRESENTE * peso_total:
            flags.append("datos_incompletos")

        v["score_desglose"] = desglose
        v["score_flags"] = flags

    return vuelos
