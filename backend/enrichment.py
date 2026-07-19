"""Enriquecimiento de vuelos con los CSVs maestros.

Regla crítica nº 1: se enriquece SIEMPRE el aeropuerto distinto al que el
usuario dio como origen. En OW_IDA y RD eso es `destination`; en OW_VUELTA
la ruta viene invertida y es `origin`. La regla se aplica de forma explícita
comparando ambos extremos contra el input del usuario, no asumiendo el campo.

Dos casos límite reales (vistos en el CSV de ejemplo del repo):
  1. `origin`/`destination` pueden venir como código de CIUDAD (MOW, TYO,
     SHA...) aunque la consulta fuera por aeropuerto (SVO, NRT, PVG...).
     Los CSVs maestros cruzan por aeropuerto, así que se prioriza
     `origin_airport`/`destination_airport`, que traen el aeropuerto real.
  2. Aviasales puede resolver el input como ciudad: una llamada de vuelta
     LCA->BCN puede devolver un vuelo LCA->REU (Reus como aeropuerto de
     Barcelona). Ahí AMBOS extremos difieren del input; se resuelve
     priorizando el extremo "lejano" según el sentido del vuelo (origin en
     OW_VUELTA, destination en el resto).

Regla crítica nº 2: clima y turismo mensual cruzan por (iata, mes). El mes
sale de departure_at del vuelo (en RD, el mes de la ida: es cuando se llega
al destino). El resto de CSVs cruzan solo por iata.

Si algún CSV no tiene match, el vuelo NO se descarta: sus campos van a null
y el hueco queda registrado en `enrichment_gaps`.
"""

from .data import MasterData


def _mes_de(fecha_iso):
    """'2026-10-05T16:45:00+03:00' -> 10. None si no hay fecha parseable."""
    if isinstance(fecha_iso, str) and len(fecha_iso) >= 7:
        try:
            return int(fecha_iso[5:7])
        except ValueError:
            return None
    return None


def enrich_flight(vuelo: dict, origen_usuario: str, data: MasterData) -> dict:
    # Aeropuerto a enriquecer: el extremo que NO es el input del usuario.
    # En OW_VUELTA el vuelo va destino->casa, así que el extremo lejano es
    # el origen; en OW_IDA y RD es el destino. Dentro de cada extremo se
    # prefiere el campo *_airport (aeropuerto real) sobre origin/destination
    # (que pueden ser códigos de ciudad sin match en los CSVs).
    if vuelo.get("tipo_llamada") == "OW_VUELTA":
        candidatos = [vuelo.get("origin_airport"), vuelo.get("origin"),
                      vuelo.get("destination_airport"), vuelo.get("destination")]
    else:
        candidatos = [vuelo.get("destination_airport"), vuelo.get("destination"),
                      vuelo.get("origin_airport"), vuelo.get("origin")]

    enrich_airport = next(
        (c for c in candidatos if isinstance(c, str) and c and c != origen_usuario),
        None,
    )

    mes = _mes_de(vuelo.get("departure_at"))

    gaps = []
    if enrich_airport is None:
        enrichment = {"coste": None, "turismo": None, "turismo_mes": None,
                      "clima": None, "unesco": None}
        gaps = ["coste", "turismo", "turismo_mes", "clima", "unesco"]
    else:
        coste = data.coste.get(enrich_airport)
        turismo = data.turismo_ciudad.get(enrich_airport)
        unesco = data.unesco.get(enrich_airport)
        turismo_mes = data.turismo_mes.get((enrich_airport, mes)) if mes else None
        clima = data.clima.get((enrich_airport, mes)) if mes else None

        enrichment = {
            "coste": coste,
            "turismo": turismo,
            "turismo_mes": turismo_mes,
            "clima": clima,
            "unesco": unesco,
        }
        gaps = [k for k, v in enrichment.items() if v is None]

    out = dict(vuelo)
    out["enrich_airport"] = enrich_airport
    out["enrich_airport_name"] = data.airport_names.get(enrich_airport)
    out["enrich_month"] = mes
    out["enrichment"] = enrichment
    out["enrichment_gaps"] = gaps
    return out


def enrich_all(vuelos: list[dict], origen_usuario: str, data: MasterData) -> list[dict]:
    return [enrich_flight(v, origen_usuario, data) for v in vuelos]
