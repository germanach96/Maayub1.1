"""muuyal — Fase 1: búsqueda de vuelos + enriquecimiento.

FastAPI sirve la API y el build estático de React (un solo deploy, sin CORS).

Endpoints:
  GET  /api/airports  -> lista de aeropuertos para el autocomplete de origen
  GET  /api/zones     -> grupos de destinos (zonas + Top151)
  POST /api/search    -> {origin, group} -> vuelos enriquecidos
"""

import time
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .aviasales import buscar_grupo
from .data import MasterData, ZONAS
from .enrichment import descartar_no_mapeados, enrich_all
from .scoring import puntuar_vuelos, senales_activas

app = FastAPI(title="muuyal", version="0.1.0")

# Los CSVs se cargan una vez al arrancar y se mantienen en memoria.
data = MasterData()

GRUPOS = ZONAS + ["Top151"]


class SearchRequest(BaseModel):
    origin: str
    group: str


@app.get("/api/airports")
def get_airports():
    return data.airports_list


@app.get("/api/zones")
def get_zones():
    return GRUPOS


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/search")
def search(req: SearchRequest):
    origen = req.origin.upper().strip()
    if origen not in data.airport_names:
        raise HTTPException(400, f"Aeropuerto de origen desconocido: {origen}")
    if req.group not in GRUPOS:
        raise HTTPException(400, f"Grupo no válido: {req.group}")

    destinos = data.destinos_de_grupo(req.group, origen)
    t0 = time.time()
    # Día en que se lanza esta búsqueda. Sirve de referencia para la antigüedad
    # de cada precio cacheado (dia_busqueda), en vez del reloj del navegador.
    fecha_consulta = datetime.now(timezone.utc).date().isoformat()
    vuelos = buscar_grupo(origen, destinos)
    enriquecidos = enrich_all(vuelos, origen, data)
    # Fuera los vuelos a aeropuertos que no están en los CSVs maestros: de esos
    # no se sabe nada del destino y la nota les salía altísima con lo poco que
    # quedaba. Se quitan antes de puntuar para que no ensucien las medianas.
    con_datos = descartar_no_mapeados(enriquecidos, data)
    descartados = len(enriquecidos) - len(con_datos)
    # La puntuación va DESPUÉS del enriquecimiento y sobre el lote entero: la
    # señal del chollo compara cada precio con la mediana de su destino, y esa
    # mediana solo se conoce con todos los vuelos delante.
    enriquecidos = puntuar_vuelos(con_datos, fecha_consulta)

    return {
        "meta": {
            "origin": origen,
            "group": req.group,
            "fecha_consulta": fecha_consulta,
            # Leyenda del desglose de la nota: [[señal, peso], ...]. Viaja una
            # sola vez aquí; cada vuelo solo lleva los valores, en este orden.
            "score_senales": senales_activas(),
            "destinations_queried": len(destinos),
            "api_calls": len(destinos) * 3,
            "flights_found": len(enriquecidos),
            # Vuelos a aeropuertos fuera del maestro, que no se devuelven.
            "descartados_sin_datos": descartados,
            "elapsed_seconds": round(time.time() - t0, 1),
        },
        "flights": enriquecidos,
    }


# --- Frontend estático (build de React en frontend/dist) ---

FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

if FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        candidate = (FRONTEND_DIST / full_path).resolve()
        if (full_path and candidate.is_file()
                and candidate.is_relative_to(FRONTEND_DIST)):
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")
