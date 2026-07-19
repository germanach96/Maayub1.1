"""Cliente de la API de Aviasales/Travelpayouts.

La lógica de consulta es la del script de testing masivo del repo
(testing_code_masivo.txt), reutilizada tal cual: mismos endpoint, parámetros,
3 llamadas por destino (ida / vuelta / redondo), reintentos ante 429,
link absoluto y extracción de dia_busqueda. Solo cambian dos cosas:
el token sale de la variable de entorno TP_TOKEN y el número de hilos
baja a 20 para no ahogar un servidor gratuito.
"""

import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
from requests.adapters import HTTPAdapter

URL = "https://api.travelpayouts.com/aviasales/v3/prices_for_dates"

# Dominio de Aviasales. La API devuelve el campo "link" como ruta relativa
# (ej. /search/...), así que le anteponemos esto para que sea un enlace
# completo y funcional.
BASE_AVIASALES = "https://www.aviasales.com"

# Número de llamadas en paralelo (el script original usa 50; aquí 20 porque
# el plan gratuito de Render tiene CPU compartida).
HILOS = 20

# Pausa (segundos) al inicio de cada llamada para no saturar la API.
PAUSA = 0.05

# Reintentos ante errores 429 (Too Many Requests).
MAX_REINTENTOS = 3
ESPERA_REINTENTO = 2.0

# Sesión reutilizable: mantiene viva la conexión entre llamadas.
session = requests.Session()
adaptador = HTTPAdapter(pool_connections=HILOS, pool_maxsize=HILOS)
session.mount("https://", adaptador)
session.mount("http://", adaptador)


def _base_params():
    token = os.environ.get("TP_TOKEN")
    if not token:
        raise RuntimeError(
            "Falta la variable de entorno TP_TOKEN (token de Travelpayouts)."
        )
    return {
        "currency": "EUR",
        "market": "es",
        "sorting": "price",
        "limit": 1000,
        "token": token,
    }


def consultar(origin, destination, one_way, tipo_llamada, base_params):
    """Hace una llamada a la API y devuelve una lista de dicts con los vuelos,
    añadiendo columnas de contexto para identificar la ruta y el tipo.
    Reintenta automáticamente si la API responde 429 (Too Many Requests)."""
    params = dict(base_params)
    params["origin"] = origin
    params["destination"] = destination
    params["one_way"] = "true" if one_way else "false"

    data = None
    for intento in range(1, MAX_REINTENTOS + 1):
        if PAUSA:
            time.sleep(PAUSA)
        try:
            resp = session.get(URL, params=params, timeout=30)

            if resp.status_code == 429:
                if intento < MAX_REINTENTOS:
                    time.sleep(ESPERA_REINTENTO)
                    continue
                return []

            data = resp.json()
            break
        except Exception:
            if intento < MAX_REINTENTOS:
                time.sleep(ESPERA_REINTENTO)
                continue
            return []

    filas = []
    if isinstance(data, dict) and data.get("data"):
        for vuelo in data["data"]:
            registro = dict(vuelo)

            # El "link" viene relativo (ej. /search/...); lo convertimos en
            # un enlace completo anteponiendo el dominio de Aviasales.
            link = registro.get("link")
            if isinstance(link, str) and link.startswith("/"):
                registro["link"] = BASE_AVIASALES + link

            # El día en que Aviasales cacheó este precio viene dentro del
            # link como search_date=DDMMYYYY. Lo extraemos como columna
            # propia en formato AAAA-MM-DD (solo día, sin hora).
            registro["dia_busqueda"] = ""
            if isinstance(link, str):
                m = re.search(r"search_date=(\d{2})(\d{2})(\d{4})", link)
                if m:
                    registro["dia_busqueda"] = f"{m.group(3)}-{m.group(2)}-{m.group(1)}"

            registro["ruta_origen"] = origin
            registro["ruta_destino"] = destination
            registro["one_way"] = params["one_way"]
            registro["tipo_llamada"] = tipo_llamada
            filas.append(registro)
    return filas


def buscar_grupo(origen: str, destinos: list[str]) -> list[dict]:
    """Recorre todos los destinos con las 3 llamadas del script masivo:
    OW_IDA (origen->destino), OW_VUELTA (destino->origen) y RD (redondo)."""
    base_params = _base_params()

    tareas = []
    for destino in destinos:
        tareas.append((origen, destino, True, "OW_IDA"))
        tareas.append((destino, origen, True, "OW_VUELTA"))
        tareas.append((origen, destino, False, "RD"))

    resultados = []
    with ThreadPoolExecutor(max_workers=HILOS) as executor:
        futuros = [
            executor.submit(consultar, o, d, ow, tipo, base_params)
            for (o, d, ow, tipo) in tareas
        ]
        for futuro in as_completed(futuros):
            resultados += futuro.result()

    return resultados
