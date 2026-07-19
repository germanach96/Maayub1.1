"""muuyal — Fase 1: búsqueda de vuelos + enriquecimiento.

FastAPI sirve la API y el build estático de React (un solo deploy, sin CORS).

Endpoints:
  GET  /api/airports  -> lista de aeropuertos para el autocomplete de origen
  GET  /api/zones     -> grupos de destinos (zonas + Top151)
  POST /api/search    -> {origin, group} -> vuelos enriquecidos
"""

import time
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .aviasales import buscar_grupo
from .data import MasterData, ZONAS
from .enrichment import enrich_all

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
    vuelos = buscar_grupo(origen, destinos)
    enriquecidos = enrich_all(vuelos, origen, data)

    return {
        "meta": {
            "origin": origen,
            "group": req.group,
            "destinations_queried": len(destinos),
            "api_calls": len(destinos) * 3,
            "flights_found": len(enriquecidos),
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
