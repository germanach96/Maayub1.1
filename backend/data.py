"""Carga de los CSVs maestros del repo (una sola vez, en memoria).

Cada CSV se lee con su formato real (verificado archivo por archivo):
  - airports_flightable_categorized.csv  sep=";"  utf-8-sig  llave: code (IATA)
  - indice_coste_destinos.csv            sep=";"  utf-8-sig  llave: iata
  - turismo_ciudades.csv                 sep=";"  utf-8-sig  llave: iata
  - turismo_destinos.csv                 sep=";"  utf-8-sig  llave: iata + mes (1-12)
  - clima_destinos_2015_2024 (2).csv     sep=","  utf-8-sig  llave: iata + mes (1-12)
  - unesco_destinos.csv                  sep=";"  utf-8-sig  llave: iata
"""

import ast
import math
from pathlib import Path

import pandas as pd

# Los CSVs viven en la raíz del repo (un nivel por encima de backend/)
DATA_DIR = Path(__file__).resolve().parent.parent

ZONAS = ["Europe", "Asia", "America", "Africa / Oceania"]


def _clean(value):
    """NaN de pandas -> None para que el JSON lleve null y no 'NaN'."""
    if isinstance(value, float) and math.isnan(value):
        return None
    return value


def _coords(valor):
    """La columna `coordinates` del CSV de aeropuertos viene como texto con
    forma de dict: "{'lat': 8.98, 'lon': 38.79}". Devuelve (lat, lon) o None."""
    try:
        d = ast.literal_eval(valor)
        return (float(d["lat"]), float(d["lon"]))
    except Exception:
        return None


def distancia_km(a, b):
    """Distancia en línea recta (fórmula del semiverseno) entre dos pares
    (lat, lon), en km. None si falta alguna coordenada."""
    if not a or not b:
        return None
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    h = (math.sin((lat2 - lat1) / 2) ** 2
         + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2)
    return round(2 * 6371.0 * math.asin(math.sqrt(h)))


def _records_by_key(df: pd.DataFrame, cols_llave):
    """Indexa un DataFrame como dict {llave: dict_de_campos} (sin la llave)."""
    out = {}
    resto = [c for c in df.columns if c not in cols_llave]
    for row in df.itertuples(index=False):
        d = row._asdict()
        key = tuple(d[c] for c in cols_llave)
        out[key if len(key) > 1 else key[0]] = {c: _clean(d[c]) for c in resto}
    return out


class MasterData:
    def __init__(self):
        # --- Aeropuertos / zonas (mismo tratamiento que el script masivo) ---
        # keep_default_na=False en country_code: el código de Namibia es "NA" y
        # pandas lo convertiría en nulo (Not Available), dejando a Windhoek sin
        # país. Se lee esa columna como texto tal cual.
        airports = pd.read_csv(
            DATA_DIR / "airports_flightable_categorized.csv",
            sep=";", encoding="utf-8-sig",
            keep_default_na=False, na_values=[""],
        ).dropna(subset=["code"])
        airports["code"] = airports["code"].astype(str).str.upper().str.strip()
        self.airports_df = airports

        # Listado para el autocomplete del frontend
        self.airports_list = [
            {
                "code": r.code,
                "name": _clean(r.name),
                "country_code": _clean(r.country_code),
                "zone": _clean(r.Zone),
                "top151": bool(r.Top151 == 1),
            }
            for r in airports.itertuples(index=False)
        ]
        # code -> nombre legible, para mostrar el aeropuerto enriquecido
        self.airport_names = {a["code"]: a["name"] for a in self.airports_list}

        # code -> país (ISO-2) y coordenadas, para el filtro por país y para
        # calcular la distancia origen->destino (Aviasales no la devuelve).
        self.airport_country = {
            r.code: _clean(r.country_code) for r in airports.itertuples(index=False)
        }
        self.airport_coords = {
            r.code: _coords(r.coordinates) for r in airports.itertuples(index=False)
        }

        # --- CSVs de enriquecimiento ---
        coste = pd.read_csv(DATA_DIR / "indice_coste_destinos.csv",
                            sep=";", encoding="utf-8-sig")
        self.coste = _records_by_key(coste, ["iata"])

        turismo_ciudad = pd.read_csv(DATA_DIR / "turismo_ciudades.csv",
                                     sep=";", encoding="utf-8-sig")
        self.turismo_ciudad = _records_by_key(turismo_ciudad, ["iata"])

        turismo_mes = pd.read_csv(DATA_DIR / "turismo_destinos.csv",
                                  sep=";", encoding="utf-8-sig")
        turismo_mes["mes"] = turismo_mes["mes"].astype(int)
        self.turismo_mes = _records_by_key(turismo_mes, ["iata", "mes"])

        clima = pd.read_csv(DATA_DIR / "clima_destinos_2015_2024 (2).csv",
                            sep=",", encoding="utf-8-sig")
        clima["mes"] = clima["mes"].astype(int)
        self.clima = _records_by_key(clima, ["iata", "mes"])

        unesco = pd.read_csv(DATA_DIR / "unesco_destinos.csv",
                             sep=";", encoding="utf-8-sig")
        self.unesco = _records_by_key(unesco, ["iata"])

    # ----- selección de destinos, igual que el script masivo -----

    def destinos_de_grupo(self, grupo: str, origen: str):
        a = self.airports_df
        if grupo == "Top151":
            seleccionados = a[a["Top151"] == 1]
        elif grupo in ZONAS:
            seleccionados = a[a["Zone"] == grupo]
        else:
            raise ValueError(f"Grupo no válido: {grupo!r}")
        return [c for c in seleccionados["code"].unique() if c != origen]
