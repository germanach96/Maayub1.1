# muuyal — Fase 1: búsqueda de vuelos + enriquecimiento

Web app personal de búsqueda de vuelos. El backend consulta la API de
Aviasales/Travelpayouts con la misma lógica del script de testing masivo
(`testing_code_masivo.txt`) y enriquece cada vuelo con los CSVs maestros del
repo. Sin scoring en esta fase: buscar → enriquecer → mostrar.

## Arquitectura

- **Backend**: FastAPI (`backend/`). Carga los CSVs una vez al arrancar y los
  mantiene en memoria. El token de Travelpayouts va SIEMPRE en la variable de
  entorno `TP_TOKEN`.
  - `GET /api/airports` — aeropuertos para el autocomplete de origen.
  - `GET /api/zones` — grupos de destinos (zonas + Top151).
  - `POST /api/search` — `{"origin": "BCN", "group": "Europe"}` → vuelos enriquecidos.
- **Frontend**: React + Vite (`frontend/`). Tabla en desktop, cards en móvil,
  loading visible durante la búsqueda.
- **Un solo deploy**: FastAPI sirve también el build estático de React
  (`frontend/dist`), sin CORS. `render.yaml` despliega todo como un único
  servicio en Render.

## Lógica de búsqueda (del script masivo)

Por cada destino del grupo elegido se hacen 3 llamadas a
`/aviasales/v3/prices_for_dates`:

1. `OW_IDA` — origen → destino, solo ida
2. `OW_VUELTA` — destino → origen, solo ida
3. `RD` — origen → destino, ida y vuelta

Con reintentos ante 429, link absoluto a Aviasales y `dia_busqueda` extraído
del link. Hilos bajados de 50 a 20 para el plan gratuito de Render.

## Enriquecimiento

**Qué aeropuerto se enriquece**: siempre el extremo DISTINTO al origen que dio
el usuario (campo `enrich_airport`). En `OW_IDA`/`RD` es el destino; en
`OW_VUELTA` la ruta viene invertida y es el origen. Se prioriza
`origin_airport`/`destination_airport` porque `origin`/`destination` pueden
venir como código de ciudad (MOW, TYO…) sin match en los CSVs.

**Cruces** (`enrich_airport` + mes de `departure_at` cuando aplica):

| CSV | Llave | Campos |
|---|---|---|
| `indice_coste_destinos.csv` | iata | índice de coste, categoría €–€€€€ |
| `turismo_ciudades.csv` | iata | popularidad 0–100 |
| `turismo_destinos.csv` | iata + mes | `turismo_idx` (>1 temporada alta) |
| `clima_destinos_2015_2024 (2).csv` | iata + mes | temperaturas, lluvia, sol |
| `unesco_destinos.csv` | iata | sitios UNESCO a 60/100 km |

Si un CSV no tiene match, el vuelo NO se descarta: sus campos van a `null` y
el hueco queda en `enrichment_gaps` (visible en la interfaz).

## Desarrollo local

```bash
pip install -r backend/requirements.txt
export TP_TOKEN=tu_token_de_travelpayouts
uvicorn backend.main:app --port 8000

# frontend con hot-reload (proxy /api -> :8000)
cd frontend && npm install && npm run dev
# o build de producción servido por FastAPI:
cd frontend && npm run build   # luego abre http://localhost:8000
```

## Deploy en Render

1. Conecta el repo en Render (Blueprint: detecta `render.yaml`).
2. En el dashboard, define la variable de entorno `TP_TOKEN`.

⚠️ El token que aparece hardcodeado en los scripts de testing antiguos del
repo está expuesto públicamente: conviene regenerarlo en Travelpayouts y usar
el nuevo solo como `TP_TOKEN`.
