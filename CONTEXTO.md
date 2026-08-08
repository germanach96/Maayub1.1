# Contexto del proyecto muuyal (handoff entre sesiones)

Documento de traspaso: resume qué está hecho, qué decisiones se tomaron y por
qué, y qué queda pendiente. Léelo antes de tocar código.

## Qué es esto

Web app personal de búsqueda de vuelos con datos enriquecidos del destino.
El repo era originalmente un conjunto de scripts de Colab; la Fase 1 lo
convirtió en una app desplegable.

**Fase 1 (COMPLETADA)**: buscar → enriquecer → mostrar. Sin scoring.

## Estado actual

Fase 1 fusionada a `main` (PRs #16 y #17) y **desplegada en Render**, donde el
usuario la ha probado y funciona. Render redespliega solo con cada push a
`main`; el trabajo nuevo va en ramas aparte y entra por PR.

```
backend/
  main.py         FastAPI: /api/airports, /api/zones, /api/search, /api/health
                  + sirve el build estático de React (un solo deploy, sin CORS)
  aviasales.py    cliente de la API, copiado del script de testing masivo
  data.py         carga de los 6 CSVs maestros en memoria al arrancar
  enrichment.py   reglas de enriquecimiento (lo más delicado del proyecto)
frontend/         React + Vite. dist/ está committeado a propósito.
render.yaml       deploy de un solo servicio en Render
```

Scripts originales (`testing_code_masivo.txt`, `generar_*.py`) se dejaron
intactos como referencia. **No** son la app.

## Decisiones ya tomadas (no volver a plantearlas sin motivo)

- **Inputs de búsqueda**: los mismos que el script masivo — aeropuerto de
  origen (IATA) + grupo de destinos (4 zonas o Top151). Sin filtro de fecha.
- **Consulta**: 3 llamadas por destino (OW_IDA, OW_VUELTA, RD), reintentos
  ante 429, link absoluto a Aviasales, `dia_busqueda` extraído del link.
  Idéntico al script masivo salvo dos cosas: token desde `TP_TOKEN` y
  `HILOS` bajado de 50 a 20 por el plan gratuito de Render.
- **Mes para clima y turismo mensual**: el de `departure_at`. En los vuelos
  de ida y vuelta NO se calcula nada con `return_at`.
- **Volumen**: se devuelven todos los vuelos, sin recortar. La paginación
  (50 por página) es solo del frontend.

## Las dos trampas del enriquecimiento (verificadas con datos reales)

`enrich_airport` es el aeropuerto DISTINTO al origen que dio el usuario. La
regla ingenua ("destination, salvo en vueltas que es origin") falla en dos
casos reales encontrados en `ejemplo resultado_BCN_Asia.csv`:

1. **Códigos de ciudad**: la API devuelve MOW, TYO, SHA, BAK… en
   `origin`/`destination` aunque consultes SVO, NRT o PVG. Esos códigos no
   existen en los CSVs maestros y dejaban 4.243 de 9.318 vuelos sin
   enriquecer. Por eso se priorizan `origin_airport`/`destination_airport`.
2. **Input resuelto como ciudad**: una llamada de vuelta LCA→BCN devolvió un
   vuelo LCA→REU (Reus como aeropuerto de Barcelona), donde *ambos* extremos
   difieren del input. Se resuelve por sentido del vuelo: en OW_VUELTA manda
   el origen, en el resto el destino.

Si tocas `enrichment.py`, re-valida contra el CSV de ejemplo. Resultado
esperado: 9.317 de 9.318 vuelos enriquecidos al 100%; el único hueco es TFU
(Chengdú Tianfu), que no está en los CSVs maestros.

## Llaves reales de cada CSV (ya verificadas, no hace falta reabrirlos)

| CSV | Separador | Llave |
|---|---|---|
| `airports_flightable_categorized.csv` | `;` | `code` (IATA) + `Zone`, `Top151` |
| `indice_coste_destinos.csv` | `;` | `iata` |
| `turismo_ciudades.csv` | `;` | `iata` |
| `turismo_destinos.csv` | `;` | `iata` + `mes` (1–12) |
| `clima_destinos_2015_2024 (2).csv` | **`,`** | `iata` + `mes` (1–12) |
| `unesco_destinos.csv` | `;` | `iata` |

Todos con `encoding="utf-8-sig"`. Ojo: el de clima es el único con coma.
Los seis cubren los mismos 575 aeropuertos.

Vuelo sin match en algún CSV: no se descarta. Sus campos van a `null` y el
hueco se lista en `enrichment_gaps`, que el frontend muestra como etiqueta.

## Verificación hecha

- Los 6 CSVs cargan y cruzan bien (575 aeropuertos, 6.900 filas mensuales).
- Enriquecimiento validado contra los 9.318 vuelos del CSV de ejemplo.
- Llamada real a la API (BCN↔LIS): 304 vuelos, enriquecidos sin huecos.
- Servidor local levantado: los 4 endpoints responden y los assets del
  frontend se sirven correctamente.
- **No verificado**: el deploy real en Render, ni la app abierta en un
  navegador de verdad (solo se comprobó que el HTML y los assets se sirven).

## Antigüedad del precio (añadido tras la Fase 1)

Los precios de Aviasales salen de su caché: `dia_busqueda` (ya se extraía del
link) es el día en que se guardó ese precio. El backend añade
`meta.fecha_consulta` (fecha UTC de la búsqueda) y el frontend calcula contra
ella la antigüedad: columna "Precio de" en la tabla, chip en móvil, filtro por
antigüedad máxima y orden "Precio más reciente".

Umbrales: ≤1 día verde, 2–3 ámbar, ≥4 rojo. Medido sobre el CSV de ejemplo,
Aviasales nunca devuelve caché de más de ~7 días, pero el 30% de los vuelos
traía precios de 4 días o más.

## Filtros (añadido tras la Fase 1)

Panel plegable "Más filtros" con 11 rangos mín/máx (precio, duración, escalas,
distancia, temperatura, horas de sol, días de lluvia, popularidad, índice
turístico del mes, índice de coste, UNESCO), más selector de país, el filtro de
antigüedad del precio y "Limpiar". Todo se filtra en el navegador: los vuelos ya
están descargados, no se vuelve a llamar a la API.

Criterio: un vuelo **sin dato** en el campo filtrado queda FUERA mientras ese
filtro esté puesto (no se puede afirmar que lo cumpla).

Dos datos que no existían y se crearon para esto:

- **`distancia_km`**: Aviasales no devuelve distancia, solo duración. Se calcula
  con el semiverseno entre las coordenadas de origen y destino, que están en
  `airports_flightable_categorized.csv` (columna `coordinates`, texto con forma
  de dict). Los 575 aeropuertos tienen coordenadas.
- **`enrich_country`**: código ISO del país del destino. El nombre en español lo
  resuelve el navegador con `Intl.DisplayNames`, sin lista que mantener.

**Trampa de pandas encontrada aquí**: el código de país de Namibia es `NA` y
pandas lo leía como nulo, dejando a Windhoek (WDH) sin país. Se lee el CSV de
aeropuertos con `keep_default_na=False, na_values=[""]`. Si alguien quita eso,
WDH vuelve a romperse.

## Pendientes

1. **Rotar el token de Travelpayouts**. El token está hardcodeado en
   `testing_code.txt` y `testing_code_masivo.txt`, que son públicos en
   GitHub. Regenerarlo y usar el nuevo solo como variable `TP_TOKEN`.
2. **Desplegar en Render** (Blueprint desde `render.yaml`, definir `TP_TOKEN`
   en el dashboard) y comprobar que una búsqueda de zona completa no muere
   por timeout ni por memoria en el plan gratuito.
3. **Fusionar la rama a `main`** cuando el usuario valide la app.

## Decisiones abiertas (el usuario aún no las ha resuelto)

- ¿Añadir un selector opcional de mes de salida (`departure_at=YYYY-MM`)?
- En los vuelos de ida y vuelta, ¿interesa también el clima del mes de
  `return_at` como campos aparte?
- ¿Limitar a los N vuelos más baratos por ruta para aligerar la respuesta?

## Fase 2 (siguiente, aún sin especificar)

Scoring de los vuelos combinando precio + clima + turismo + coste + UNESCO.
El usuario tendrá que definir los pesos. Aviso que ya dejó escrito el autor
de `generar_turismo.py`: el índice de estacionalidad turística se distorsiona
en metrópolis grandes (Barcelona, capitales) porque el artículo de Wikipedia
recibe tráfico no turístico; la popularidad absoluta sí es fiable. Conviene
que la estacionalidad pese poco en ciudades grandes.

## Cómo probar en local

```bash
pip install -r backend/requirements.txt
export TP_TOKEN=tu_token          # PowerShell: $env:TP_TOKEN = "tu_token"
uvicorn backend.main:app --port 8000
# navegador: http://localhost:8000   (API interactiva en /docs)
```

Desde la raíz del repo, no desde `backend/`. No hace falta Node: el build de
React está committeado en `frontend/dist`. Si tocas el frontend, recuerda
`cd frontend && npm install && npm run build` y committear el `dist`.
