# muuyal — manual de referencia del proyecto

> ## ⛔ REGLA 1: NO MODIFIQUES ESTE ARCHIVO
>
> Este documento **solo se actualiza cuando el dueño del repo lo pide
> explícitamente**. No lo "pongas al día" por tu cuenta al terminar una tarea,
> ni añadas secciones sobre lo que acabas de hacer, ni corrijas su redacción.
> Si crees que algo aquí está desactualizado o es incorrecto, **dilo en el chat
> y espera instrucciones**. No lo edites.
>
> Existe para que ninguna conversación tenga que empezar explicando el
> proyecto desde cero. Si cada sesión lo reescribe, deja de servir para eso.

**Qué es esto:** el manual completo de muuyal. Contiene el producto, cómo se
trabaja en él, todas las columnas de todos los datos, todas las fórmulas,
todos los umbrales y todos los supuestos. Léelo entero una vez y ya sabes
todo lo necesario: no hace falta abrir los CSVs ni los scripts de Colab para
averiguar qué significa un campo.

---

# 1. Qué es muuyal

Web app personal de **búsqueda de vuelos con datos del destino**.

No compite con Skyscanner. La gracia no es encontrar el vuelo más barato, sino
ver **junto al precio cómo es el destino**: qué tiempo hará ese mes, cuánto
cuesta la vida allí, cuánto turismo tiene, cuántos sitios UNESCO hay cerca y a
qué distancia está.

La pregunta que responde no es *"¿cuánto cuesta ir a Tokio?"* sino
**"¿a dónde me puedo ir, y cuál de esas opciones me conviene?"**

*muuyal* significa **nube** en maya yucateco.

## 1.1 Cómo funciona una búsqueda

1. El usuario elige un **aeropuerto de origen** (IATA) y un **grupo de
   destinos**. No se busca un destino suelto: se consulta el grupo entero.
2. Por cada destino se hacen **3 llamadas** a la API de Aviasales:
   `OW_IDA` (origen→destino, solo ida), `OW_VUELTA` (destino→origen, solo
   ida) y `RD` (redondo, ida y vuelta).
3. Cada vuelo devuelto se **enriquece**: se identifica el aeropuerto del
   destino y se le pegan los datos de los 6 CSVs maestros.
4. Se devuelven **todos** los vuelos, sin recortar. El navegador los filtra,
   ordena y pagina (50 por página).

| Grupo | Destinos | Llamadas a la API |
|---|---|---|
| `Africa / Oceania` | 74 | 222 |
| `America` | 147 | 441 |
| `Top151` | 151 | 453 |
| `Asia` | 168 | 504 |
| `Europe` | 186 | 558 |

**Para probar usa siempre `Africa / Oceania`**: es el grupo más barato y
ejerce el flujo entero igual.

---

# 2. Con quién trabajas (léelo antes de responder nada)

**El dueño del repo no programa.** Venía de ejecutar estos scripts en Google
Colab y no había publicado una web nunca. Esto cambia cómo hay que trabajar:

- **Explica en castellano llano, sin jerga.** Nada de "hacer merge del PR a
  main": di "aprieta el botón verde y tu web se actualiza sola". Si usas un
  término técnico, explícalo la primera vez.
- **No le pidas que ejecute comandos** salvo que no haya alternativa. Prueba
  tú y enséñale el resultado.
- **Él revisa la web, no el código.** Manda **capturas de pantalla** —móvil y
  escritorio— de todo lo que cambie visualmente, antes de que apruebe nada.
- **Verifica de verdad antes de afirmar que algo funciona.** Ver §9. Es la
  razón por la que confía en lo que se le entrega.
- **Usa la app desde el móvil.** Todo cambio visual se prueba también a
  390 px de ancho, no solo en escritorio.
- Cuando le expliques un dato, **di también en qué no confiar**. Ejemplo real:
  el índice turístico mensual miente en las metrópolis (§5.4).

---

# 3. Flujo de trabajo y despliegue

La app está **desplegada en Render** (plan gratuito) y en uso.

```
trabajas en una rama  →  abres un PR  →  ÉL aprieta "Merge"  →  Render
                                                                despliega solo
```

- **Nunca hagas push a `main`.** El botón de fusionar es suyo: nada llega a su
  web sin que él lo apruebe.
- **Deja el PR creado**, no solo la rama subida. Él espera un enlace donde
  solo tenga que pulsar "Merge".
- **Render vigila `main`** y redespliega solo con cada push ahí. Tarda 5–10
  minutos. No hay que tocar nada en Render.
- **Si tu rama ya se fusionó**, no acumules commits encima: reinicia desde
  `main` con `git checkout -B <rama> origin/main` y abre un PR nuevo.
- Si un despliegue falla, Render **mantiene viva la versión anterior** y tiene
  botón de **Rollback**.

## 3.1 Dos rarezas del plan gratuito (parecen fallos y no lo son)

- **Se duerme a los 15 minutos sin visitas.** La siguiente carga tarda casi un
  minuto. No está rota. Pasa también después de cada despliegue.
- **Las zonas grandes son lentas** (CPU compartida). `Europe` puede irse a
  varios minutos y no está descartado que el navegador se canse antes.

## 3.2 Variables de entorno

| Variable | Dónde | Para qué |
|---|---|---|
| `TP_TOKEN` | Panel de Render (`sync: false`) | Token de Travelpayouts. **Nunca en el repo.** |
| `PYTHON_VERSION` | `render.yaml` | 3.11.10 |

Sin `TP_TOKEN` la app arranca igual: la página carga y el autocompletado
funciona. Solo falla `/api/search`.

---

# 4. Arquitectura

```
backend/
  main.py         FastAPI: /api/airports, /api/zones, /api/search, /api/health
                  + sirve el build de React (un solo servicio, sin CORS)
  aviasales.py    cliente de la API de Travelpayouts
  data.py         carga los 6 CSVs maestros en memoria al arrancar
  enrichment.py   cruce vuelo → datos del destino (lo más delicado del repo)
  scoring.py      puntuación 0–100 de cada vuelo (§7.5). Toda la configuración
                  (pesos y umbrales) está en un bloque al principio del archivo
frontend/
  src/App.jsx     casi toda la interfaz (un solo componente grande)
  src/mapas.jsx   el mapa de la portada y el de la ruta de la ficha (§9.4)
  src/index.css   estilos; todos los colores salen de palette.css
  src/palette.css copia de handoff/palette.css
  src/fonts.css   @font-face de las tipografías locales
  public/         favicon, apple-touch-icon, logo, fonts/
  public/mapa/    contorno de países del mundo (TopoJSON), guardado en el repo
                  por lo mismo que las tipografías: no depender de nadie
  dist/           BUILD COMMITTEADO A PROPÓSITO
valoraciones/
  valoraciones_maestro.csv  todas las notas manuales del dueño, acumuladas
  ajustar_pesos.py          junta un CSV nuevo con el maestro y propone pesos
ACTUALIZAR_FORMULA.md       QUÉ HACER cuando el dueño manda un CSV de notas
handoff/          paquete de marca: logo SVG, palette.css, palette.json y su
                  propio CONTEXT.md (alcance: solo logo y paleta)
render.yaml       despliegue de un solo servicio
```

**El `dist/` committeado es deliberado**: permite desplegar sin Node. Si tocas
el frontend **tienes que reconstruirlo y committearlo**, o el cambio no se ve:

```bash
cd frontend && npm install && npm run build   # y committear frontend/dist
```

Los scripts originales de Colab (`testing_code*.txt`, `generar_*.py`,
`descargar_unesco_lista.py`) se dejaron **intactos como referencia**. No son la
app y no se ejecutan. Sirven para saber de dónde salió cada CSV.

## 4.1 Endpoints

| Método | Ruta | Devuelve |
|---|---|---|
| `GET` | `/api/health` | `{"status":"ok"}` |
| `GET` | `/api/airports` | Los 575 aeropuertos: `code`, `name`, `country_code`, `zone`, `top151`, `lat`, `lon` |
| `GET` | `/api/zones` | `["Europe","Asia","America","Africa / Oceania","Top151"]` |
| `POST` | `/api/search` | `{origin, group}` → `{meta, flights}` |
| `GET` | `/*` | El build de React (catch-all SPA) |

`lat` / `lon` van redondeadas a 3 decimales (~100 m) y salen del maestro de
aeropuertos. Las usa el mapa de la portada (§9.4) para saber dónde cae cada
aeropuerto y hacia dónde viajar al elegirlo.

`meta` contiene: `origin`, `group`, `fecha_consulta` (fecha UTC del servidor),
`destinations_queried`, `api_calls`, `flights_found`, `elapsed_seconds`,
`descartados_sin_datos` (§8.2) y `score_senales` (§7.5).

## 4.2 Parámetros de la llamada a Aviasales

Endpoint: `https://api.travelpayouts.com/aviasales/v3/prices_for_dates`

| Parámetro | Valor |
|---|---|
| `currency` | `EUR` |
| `market` | `es` |
| `sorting` | `price` |
| `limit` | `1000` |
| `token` | de `TP_TOKEN` |
| `origin` / `destination` / `one_way` | según la llamada |

Concurrencia y reintentos: **20 hilos** (el script original usaba 50; se bajó
por la CPU compartida de Render), pausa de **0,05 s** antes de cada llamada,
**3 reintentos** con espera de **2 s** ante error 429, `timeout` de 30 s.
Si una llamada agota los reintentos devuelve lista vacía: **no rompe la
búsqueda**, simplemente ese destino aporta menos vuelos.

---

# 5. Referencia de datos: los 6 CSVs maestros

Están en la raíz del repo y **cubren los mismos 575 aeropuertos**. Se cargan en
memoria una sola vez al arrancar.

| CSV | Sep. | Llave |
|---|---|---|
| `airports_flightable_categorized.csv` | `;` | `code` |
| `indice_coste_destinos.csv` | `;` | `iata` |
| `turismo_ciudades.csv` | `;` | `iata` |
| `turismo_destinos.csv` | `;` | `iata` + `mes` |
| `clima_destinos_2015_2024 (2).csv` | **`,`** | `iata` + `mes` |
| `unesco_destinos.csv` | `;` | `iata` |

Todos con `encoding="utf-8-sig"`. **El de clima es el único con coma.**

**Vuelo al que le falta ALGÚN dato: no se descarta.** Sus campos van a `null` y
el hueco se lista en `enrichment_gaps`, que la interfaz muestra como etiqueta.
Ejemplo: un aeropuerto que está en el maestro pero no tiene fila de coste.

**Vuelo a un aeropuerto que NO está en el maestro: sí se descarta**, y no se
devuelve. Es un cambio de criterio de la fase 2, explicado en §8.2.

## 5.1 `airports_flightable_categorized.csv` — maestro de aeropuertos

| Columna | Qué es |
|---|---|
| `code` | **Código IATA del aeropuerto. Es la llave de todo.** |
| `name` | Nombre del aeropuerto |
| `name_translations` | Texto con forma de dict: `{'en': '...'}` |
| `city_code` | Código IATA de la **ciudad** (ojo: distinto del aeropuerto) |
| `country_code` | País, ISO-2 |
| `time_zone` | Zona horaria IANA |
| `iata_type` | `airport` |
| `coordinates` | **Texto con forma de dict**: `{'lat': 8.98, 'lon': 38.79}` |
| `flightable` | `TRUE` |
| `Zone` | `Europe` / `Asia` / `America` / `Africa / Oceania` |
| `Top151` | `1` si está en el Top151 |

Se lee con **`keep_default_na=False, na_values=[""]`** — ver la trampa §8.3.

## 5.2 `indice_coste_destinos.csv` — coste de vida

| Columna | Qué es |
|---|---|
| `iata` | Llave |
| `country_code` | País, ISO-2 |
| `indice_pais` | Índice de coste del país |
| `fuente_pais` | `wherenext`, `worldbank` o `numbeo` |
| `ciudad_snapshot` | Ciudad usada para el ajuste |
| `ratio_ciudad` | Ratio ciudad/país (p. ej. 1.06 = 6% más cara que su país) |
| **`indice_coste`** | **`indice_pais × ratio_ciudad`. Es el número que se usa.** |
| **`categoria`** | `€` / `€€` / `€€€` / `€€€€` |
| `coste_mensual_usd` | A menudo vacío. **No usar.** |

**Escala: EE.UU. = 82.** Rango real del CSV ≈ 15–120.

**Cortes de `categoria`:**

| Categoría | Índice |
|---|---|
| `€` | < 35 |
| `€€` | 35 – 59 |
| `€€€` | 60 – 84 |
| `€€€€` | ≥ 85 |

**Fuentes:** WhereNext cost-of-living (actual, CC BY 4.0) como principal;
Banco Mundial PPP como respaldo; snapshot Numbeo 2022 (Kaggle) para el
`ratio_ciudad` y como árbitro cuando el dato del Banco Mundial sale absurdo
(países con tipo de cambio oficial ficticio). *La atribución "WhereNext
(getwherenext.com)" es requisito de su licencia.*

**Supuesto declarado:** el ratio ciudad/país apenas cambia con los años, así que
el snapshot de 2022 sirve para el ajuste fino aunque sus precios absolutos
estén desfasados.

## 5.3 `clima_destinos_2015_2024 (2).csv` — clima mensual

Una fila por `iata` + `mes` (1–12). **6.900 filas** (575 × 12).

| Columna | Qué es | Unidad |
|---|---|---|
| `temp_media` | Temperatura media | °C |
| `temp_max_media` | Media de las máximas diarias | °C |
| `precip_mm` | Precipitación acumulada del mes | mm |
| `dias_lluvia` | **Días con más de 1,0 mm** de precipitación | días/mes |
| `horas_sol_dia` | **Horas de sol al día**, media del mes | h/día |

> ⚠️ **"Días de sol" no existe.** El dato es `horas_sol_dia` = horas de sol al
> día. `dias_lluvia` sí son días al mes. No los confundas al etiquetar.

**Fuente:** Open-Meteo Archive (gratuita, sin API key). **Normales de 10 años:
2015-01-01 a 2024-12-31.** Variables diarias descargadas:
`temperature_2m_mean`, `temperature_2m_max`, `precipitation_sum`,
`sunshine_duration`.

Rango real de `temp_media`: **−20,9 a 40,5 °C**. Cuartiles: **11,6 / 19,0 /
25,5**.

## 5.4 `turismo_ciudades.csv` y `turismo_destinos.csv` — turismo

**Son dos números distintos, no una multiplicación**, aunque la interfaz los
pinte juntos (`83/100 ×0.99`).

### `turismo_ciudades.csv` (fijo por ciudad)

| Columna | Qué es |
|---|---|
| `iata` | Llave |
| `articulo` | Artículo de Wikipedia usado (sirve para revisar el mapeo) |
| `visitas_mes_media` | Visitas mensuales medias al artículo |
| **`popularidad_0_100`** | **Cómo de conocida es la ciudad** |
| `n_candidatos` | Cuántos artículos candidatos había (control de calidad) |

**Fórmula de `popularidad_0_100`:** normalización min-max de
`log10(visitas_mes_media + 1)` sobre los 575 aeropuertos.

- **Escala logarítmica**: cada **10 puntos ≈ ×2,4 en visitas**. Un 80 no es
  "el doble" que un 40, es muchísimo más.
- **0/100** = Sept-Îles, Canadá (121 visitas/mes). **100/100** = Nueva York
  (729.488 visitas/mes).
- Regla mental: **>80 muy conocida · ~50 destino normal · <30 poco turística**.

### `turismo_destinos.csv` (por ciudad y mes)

| Columna | Qué es |
|---|---|
| `iata` + `mes` | Llave |
| **`turismo_idx`** | **Si ese mes es temporada alta o baja para esa ciudad** |

**Fórmula:** `visitas_del_mes / media_mensual_de_esa_ciudad`.

| Valor | Significa |
|---|---|
| `1.00` | Mes normal |
| `1.30` | 30% más movimiento → temporada alta |
| `0.70` | 30% menos → temporada baja |

Es **relativo a cada ciudad**, no comparable entre ciudades: un `1.30` en Ibiza
y un `1.30` en Reikiavik significan lo mismo ("su mes fuerte").

### De dónde salen y su límite honesto

No existe gratis un dato mundial de visitantes por ciudad y mes. Se usan las
**visitas al artículo de Wikipedia** de cada ciudad (API oficial de Wikimedia),
promediando varios años, **excluyendo 2020 y 2021 por el COVID**, y exigiendo
al menos **24 meses** de datos para fiarse de la curva.

> ⚠️ **Funciona bien en destinos turísticos puros y falla en metrópolis.** El
> artículo de Barcelona recibe tráfico por fútbol y noticias: su curva sale
> plana y absurda (marca enero como mes fuerte y junio como flojo). Mallorca,
> en cambio, es un libro de texto: 1.39 en agosto, 0.71 en febrero.
>
> **`popularidad_0_100` sí es fiable en todas.** Lo que no es fiable en
> ciudades grandes es `turismo_idx`.

## 5.5 `unesco_destinos.csv` — patrimonio cerca del destino

| Columna | Qué es |
|---|---|
| `iata` | Llave |
| `unesco_60km` | Sitios UNESCO a menos de 60 km |
| `unesco_cultural_60km` / `unesco_natural_60km` | Desglose |
| **`unesco_100km`** | **Sitios a menos de 100 km — el que usa la interfaz** |
| `unesco_cultural_100km` / `unesco_natural_100km` | Desglose |
| `unesco_cercano_km` | Distancia al sitio más cercano |

**Fuente:** Wikidata (SPARQL). La web oficial de UNESCO está tras Cloudflare y
devuelve 403 a un script. Wikidata tiene los mismos ~1.250 sitios cruzados por
el *World Heritage Site ID* (P757), y sus totales coinciden con las cifras
oficiales.

**Cómo cuenta:** muchos sitios son "en serie" (varios lugares bajo un mismo
id). Se usan **todos los componentes** (~8.400 puntos): un sitio cuenta si
**cualquiera** de sus componentes cae dentro del radio, y se cuenta **una sola
vez** por `whc_id`. Cruce con haversine.

**Radios:** 60 km (el destino en sí) y 100 km (añade la excursión de un día).

---

# 6. Referencia de campos de un vuelo

## 6.1 Lo que devuelve Aviasales

| Campo | Qué es |
|---|---|
| `price` | Precio en EUR |
| `airline` | Código de aerolínea (2 letras) |
| `flight_number` | Número de vuelo |
| `departure_at` | Salida, ISO con zona horaria |
| `return_at` | Vuelta (**solo en `RD`**; vacío en las de ida) |
| `duration` | Duración total en **minutos** |
| `duration_to` / `duration_back` | Duración de cada tramo, minutos |
| `transfers` | Escalas de ida |
| `return_transfers` | Escalas de vuelta |
| `origin` / `destination` | **Pueden ser códigos de CIUDAD** (ver §8.1) |
| `origin_airport` / `destination_airport` | Aeropuertos reales. **Preferir estos.** |
| `gate` | Agencia que vende (p. ej. `Flightnetwork`) |
| `link` | Enlace a Aviasales |

## 6.2 Lo que añade `aviasales.py`

| Campo | Qué es |
|---|---|
| `ruta_origen` / `ruta_destino` | Lo que se pidió en esa llamada |
| `one_way` | `"true"` / `"false"` |
| **`tipo_llamada`** | **`OW_IDA` / `OW_VUELTA` / `RD`** |
| `link` | Se reescribe a absoluto anteponiendo `https://www.aviasales.com` |
| **`dia_busqueda`** | **Día en que Aviasales cacheó ese precio** (`AAAA-MM-DD`) |

`dia_busqueda` se extrae del propio link con la expresión
`search_date=(\d{2})(\d{2})(\d{4})` (viene como `DDMMYYYY`).

## 6.3 Lo que añade `enrichment.py`

| Campo | Qué es |
|---|---|
| **`enrich_airport`** | IATA del aeropuerto **distinto al origen del usuario** (§8.1) |
| `enrich_airport_name` | Su nombre |
| `enrich_country` | Su país, ISO-2 |
| `enrich_month` | Mes de `departure_at` (1–12) |
| **`distancia_km`** | Distancia en línea recta (§7.1) |
| `enrichment` | Dict con `coste`, `turismo`, `turismo_mes`, `clima`, `unesco` |
| `enrichment_gaps` | Lista de los que salieron `null` |

---

# 7. Todos los cálculos, en un solo sitio

## 7.1 Distancia (`distancia_km`)

**Aviasales no devuelve distancia, solo duración.** Se calcula con la fórmula
del **semiverseno (haversine)** entre las coordenadas del aeropuerto de origen
y las del `enrich_airport`, ambas del maestro. **R = 6.371 km**, redondeado a
km entero.

Es **línea recta**, no ruta real de vuelo. Contrastado: BCN–MAD 484 km,
BCN–JFK 6.150 km, BCN–NRT 10.449 km, BCN–SYD 17.190 km.

Los 575 aeropuertos tienen coordenadas, así que solo sale `null` si el
`enrich_airport` no está en el maestro (caso TFU, §8.2).

## 7.2 Antigüedad del precio

```
antigüedad_en_días = meta.fecha_consulta − dia_busqueda
```

`fecha_consulta` es la **fecha UTC del servidor** al lanzar la búsqueda, no el
reloj del navegador (evita desfases si se abre de madrugada o desde otro país).

| Antigüedad | Color |
|---|---|
| ≤ 1 día | Verde |
| 2 – 3 días | Ámbar |
| ≥ 4 días | Rojo |

**Medido sobre el CSV de ejemplo (9.318 vuelos):** Aviasales nunca devuelve
caché de más de ~7 días, pero **el 30% traía precios de 4 días o más**.

## 7.3 Rampa de temperatura (solo visual)

| Nivel | Rango |
|---|---|
| Frío | < 12 °C |
| Templado | 12 – 19 °C |
| Cálido | 19 – 26 °C |
| Calor | ≥ 26 °C |

Los cortes son los **cuartiles reales** del CSV de clima (11,6 / 19,0 / 25,5),
redondeados.

## 7.4 Otros

- `popularidad_0_100` → §5.4
- `turismo_idx` → §5.4
- `indice_coste` y `categoria` → §5.2
- Conteo UNESCO → §5.5

## 7.5 La puntuación de un vuelo (0–100)

**Dónde vive:** `backend/scoring.py`. Se llama desde `/api/search` **después**
del enriquecimiento y **después** de descartar los no mapeados (§8.2), sobre el
lote entero. No puede ir en `enrichment.py` porque la señal más importante
compara cada precio con la mediana de su destino, y esa mediana solo se conoce
con todos los vuelos delante.

**Toda la configuración está en un bloque al principio del archivo**, bien
señalado. Para cambiar los pesos no hace falta leer el resto.

### La idea, y por qué el precio cuenta dos veces

La nota **no** es "el más barato". Un Barcelona–Mallorca barato no es un chollo,
porque todo lo de Mallorca es barato. Lo que interesa es que un vuelo esté **más
barato de lo normal para su destino**. Por eso el precio se parte en dos:

- **`oportunidad`** (peso 29): descuento respecto a la **mediana de precio de su
  mismo destino y su mismo tipo de vuelo**. Es la señal estrella.
- **`price_abs`** (peso 10): barato a secas, con poco peso, para que un destino
  barato de por sí sume algo sin arrasar.

### Pesos actuales

| Señal | Peso | Dirección |
|---|---|---|
| `oportunidad` | 29 | más descuento = mejor |
| `temp_media` | 15 | cercanía a `TEMP_IDEAL` |
| `price_abs` | 10 | más barato = mejor |
| `indice_coste` | 10 | más barato = mejor |
| `turismo_idx` | 8 | premia el **mes fuerte** (`DIR_TEMPORADA="alta"`) |
| `horas_sol_dia` | 8 | más = mejor |
| `dias_lluvia` | 4 | menos = mejor |
| `unesco_100km` | 4 | más = mejor |
| `popularidad_0_100` | 4 | premia lo **famoso** (`DIR_POPULARIDAD="mas"`) |
| `duration` | 3 | menos = mejor |
| `transfers` | 3 | menos = mejor |
| `antiguedad_en_dias` | 2 | precio más reciente = mejor |

Preparadas con peso 0: `distancia_km`, `temp_max_media`, `unesco_cercano_km`,
`precip_mm`, `duration_to`, `duration_back`, `return_transfers`.

Las dos **direcciones** las eligió el dueño: son gusto, no técnica. No las
cambies por tu cuenta.

### Parámetros

```
TEMP_IDEAL = 22 · TEMP_TOL = 8        clima: nota 1 a 22 °C, nota 0 a ±8
SOL_FULL = 12 · LLUVIA_MAX = 20       h/día de sol que valen 1 · días de lluvia que valen 0
COSTE_MIN, COSTE_MAX = 15, 120        rango real del CSV de coste
UNESCO_CAP = 8 · TRANSFERS_MAX = 3 · ANTIG_MAX = 7
CHOLLO_MIN_VUELOS = 10                mínimo de vuelos para fiarse de una mediana
CHOLLO_TOPE = 0.60                    descuento máximo premiado (60%)
FRENO_POP = 75                        por encima, turismo_idx se apaga (§5.4)
RENORMALIZAR = True                   ver más abajo
MIN_PESO_PRESENTE = 0.60              por debajo, avisa de "datos incompletos"
```

### Cómo se suma

1. Cada señal se lleva a **0–1, donde 1 = mejor**.
2. Una señal queda **NEUTRA** si su dato es `null` o si una regla la apaga. Una
   señal neutra **no penaliza**: se excluye de la suma y su peso se reparte
   entre las demás (eso es `RENORMALIZAR`).
3. `score = round(100 × Σ(peso × valor) ÷ Σ(pesos con dato))`.
4. Si los pesos con dato no llegan al 60% del total, se añade el aviso
   `datos_incompletos`.

Un vuelo del que no sabemos si es chollo compite por sus otros méritos en vez
de quedar penalizado por nuestra falta de datos. **Es una decisión de diseño**:
poniendo `RENORMALIZAR = False`, las señales sin dato cuentan como 0 y solo los
vuelos con todos los datos pueden llegar arriba del todo.

### Normalización de cada señal

- **`oportunidad`**: agrupa por (`enrich_airport`, `tipo_llamada`). Si el grupo
  tiene ≥ `CHOLLO_MIN_VUELOS`, `base = mediana(price)`;
  `descuento = clamp((base − price) / base, 0, CHOLLO_TOPE)`;
  `norm = descuento / CHOLLO_TOPE`. Solo se premia estar por debajo.
- **`price_abs`** y **`duration`**: percentiles 5 y 95 **de su mismo
  `tipo_llamada`** en el lote; `norm = (hi − x) / (hi − lo)`. Percentiles y no
  mínimo/máximo, para que un precio disparatado no aplaste la escala.
- **`temp_media`**: `max(0, 1 − |temp − 22| / 8)`.
- **`indice_coste`**: `clamp((120 − coste) / 105, 0, 1)`.
- **`horas_sol_dia`**: `clamp(sol / 12, 0, 1)` · **`dias_lluvia`**: `1 − clamp(d / 20, 0, 1)`.
- **`unesco_100km`**: `clamp(n / 8, 0, 1)` · **`transfers`**: `1 − clamp(n / 3, 0, 1)`.
- **`popularidad_0_100`**: `pop / 100` (con `DIR_POPULARIDAD="mas"`).
- **`turismo_idx`**: `v = clamp(idx, 0.7, 1.3)`; `(v − 0.7) / 0.6` con `"alta"`.
- **`antiguedad_en_dias`**: `1 − clamp(días / 7, 0, 1)`. Ese dato lo calcula
  ahora **el servidor** (antes solo lo hacía el navegador para el semáforo).

### Las dos reglas especiales

1. **Chollo con pocos datos.** Con menos de 10 vuelos a ese destino no hay
   "precio normal" fiable: `oportunidad` queda neutra y se marca
   `chollo_pocos_datos`. **No nos lo inventamos.** Medido en el CSV de ejemplo:
   117 de 234 grupos llegan a 10 vuelos, y solo 391 vuelos de 9.318 (4%) se
   quedan sin la señal.
2. **Freno de temporada en metrópolis.** Si `popularidad_0_100 >= 75`,
   `turismo_idx` queda neutra y se marca `temporada_no_fiable`, por lo del §5.4.
   `popularidad_0_100` **no** se frena: esa sí es fiable en todas.

### Ida, vuelta y redondo: cada uno compite con los suyos

**No hay ningún promedio ni ninguna división entre dos.** Tanto el chollo como
el precio bajo y la duración se calculan **dentro de cada `tipo_llamada`**. Un
redondo se mide contra otros redondos; un billete suelto, contra otros sueltos.
Rangos reales del CSV de ejemplo:

| Tipo | p5 | mediana | p95 |
|---|---|---|---|
| `OW_IDA` | 80 € | 257 € | 522 € |
| `OW_VUELTA` | 89 € | 228 € | 431 € |
| `RD` | 231 € | 607 € | 1.103 € |

Consecuencia: un redondo de 182 € y una ida de 67 €, ambos a Antalya, sacan
**la misma nota de precio (1,00)**, porque cada uno es de lo más barato de su
clase. Luego esas notas ya sí compiten juntas en la lista, y el reparto no se
descompensa (los redondos son el 41% de los vuelos y el 46% del top 100).

> ⚠️ **Límite conocido: una ida no sabe que hay que volver.** Puntúa "qué buena
> oferta es este billete dentro de lo que es", no "cuánto me cuesta el viaje
> entero". Quien quiera comparar viajes completos tiene el filtro de tipo.

### Campos que añade a cada vuelo

| Campo | Qué es |
|---|---|
| `score` | 0–100 entero. `null` si no hay ninguna señal con dato |
| `score_desglose` | Lista de valores 0–1, **en el orden de `meta.score_senales`**; `null` = señal neutra |
| `score_flags` | `chollo_pocos_datos`, `temporada_no_fiable`, `datos_incompletos` |
| `antiguedad_en_dias` | Días desde que Aviasales cacheó ese precio |
| `oportunidad_base` | Mediana de precio de su (destino, tipo). `null` si no había suficientes |

El desglose viaja como **lista de números**, y la leyenda (`[[señal, peso], …]`)
una sola vez en `meta.score_senales`. Repetir los nombres en cada vuelo
engordaba la respuesta 3,6 MB con 9.000 vuelos; así son 75 bytes por vuelo en
vez de 398. **Si añades o quitas señales, el orden de las dos listas tiene que
seguir cuadrando.**

---

# 8. Supuestos y reglas de decisión

Estas son decisiones ya tomadas. **No las replantees sin motivo.**

## 8.1 Qué aeropuerto se enriquece — y las dos trampas

`enrich_airport` es el aeropuerto **distinto al que el usuario dio como
origen**. La regla ingenua ("`destination`, salvo en las vueltas que es
`origin`") **falla**, por dos casos reales encontrados en
`ejemplo resultado_BCN_Asia.csv`:

> **Trampa 1 — Códigos de ciudad.** La API devuelve `MOW`, `TYO`, `SHA`, `BAK`…
> en `origin`/`destination` aunque consultes `SVO`, `NRT` o `PVG`. Esos códigos
> **no existen en los CSVs maestros** y dejaban **4.243 de 9.318 vuelos sin
> enriquecer**. Por eso se priorizan `origin_airport`/`destination_airport`.

> **Trampa 2 — Input resuelto como ciudad.** Una llamada de vuelta LCA→BCN
> devolvió un vuelo **LCA→REU** (Reus como aeropuerto de Barcelona), donde
> *ambos* extremos difieren del input. Se resuelve **por sentido del vuelo**.

**Regla implementada:** se prueban candidatos en orden y se coge el primero que
no sea el origen del usuario.

| `tipo_llamada` | Orden de candidatos |
|---|---|
| `OW_VUELTA` | `origin_airport`, `origin`, `destination_airport`, `destination` |
| `OW_IDA` y `RD` | `destination_airport`, `destination`, `origin_airport`, `origin` |

**Si tocas `enrichment.py`, revalida contra el CSV de ejemplo.** Resultado
esperado, comprobado: **9.317 de 9.318 al 100%**.

## 8.2 Los vuelos a aeropuertos que no están en el maestro

Aviasales devuelve a veces vuelos a aeropuertos que no están entre los 575 del
maestro: **TFU** (Chengdú Tianfu), **NLU** (el aeropuerto nuevo de Ciudad de
México), códigos de ciudad sin resolver… De esos no se sabe **nada** del
destino: ni clima, ni coste, ni turismo, ni patrimonio.

**Desde la fase 2 se descartan**: `descartar_no_mapeados()` en `enrichment.py`
los quita de la respuesta, y `meta.descartados_sin_datos` dice cuántos eran.
La interfaz lo enseña en la línea de resumen de la búsqueda.

> ⚠️ **Esto cambia el criterio de la fase 1**, donde estos vuelos salían con
> los campos vacíos y su etiqueta. El motivo del cambio: con la puntuación por
> medio, la nota se calculaba solo con lo poco que quedaba (precio, duración,
> escalas) y a los baratos y cortos les salía altísima. Un PVR→NLU llegó a
> sacar **94/100 con siete etiquetas de "sin datos"**: los vuelos de los que
> menos sabemos encabezaban la lista. Se quitan **antes de puntuar**, para que
> además sus precios no ensucien las medianas por destino del chollo (§7.5).

Medido sobre `ejemplo resultado_BCN_Asia.csv`: se descarta **1 de 9.318** (el
TFU de siempre). En una búsqueda a América salen bastantes más.

## 8.3 Trampa 3 — Namibia y pandas

El código de país de Namibia es **`NA`**, y pandas lo lee como nulo (*Not
Available*), dejando a Windhoek (`WDH`) sin país. Por eso el maestro se lee con
**`keep_default_na=False, na_values=[""]`**. Si alguien quita eso, WDH se rompe
en silencio.

## 8.4 Mes usado para clima y turismo mensual

**El mes de `departure_at`**, extraído de las posiciones 5:7 del ISO. En los
vuelos de ida y vuelta (`RD`) se usa el mes de la **ida** — es cuando se llega
al destino. **No se calcula nada con `return_at`.**

## 8.5 Filtrado

- **Se filtra en el navegador.** Los vuelos ya están descargados; filtrar no
  vuelve a llamar a la API.
- **Un vuelo sin dato en el campo filtrado queda FUERA** mientras ese filtro
  esté puesto: no se puede afirmar que lo cumpla. Se avisa en el panel.
- Se devuelven **todos** los vuelos, sin recortar. La paginación (50) es solo
  visual.

## 8.6 Inputs de búsqueda

Aeropuerto de origen + grupo de destinos. **Sin filtro de fecha**, igual que el
script original de Colab.

---

# 9. La interfaz

La web tiene **dos pantallas**: la **portada** (el mapa y el buscador, §9.4) y
los **resultados**. Se pasa de una a otra buscando, y se vuelve pulsando la
marca, que lo limpia todo y corta la búsqueda si estaba en marcha.

## 9.1 Columnas de la tabla (escritorio)

`Puntuación` (nota + barra + tu nota si la has puesto) · `Vuelo` (tipo + ruta +
huecos + avisos) · `Salida` · `Vuelta` · `Aerolínea` · `Escalas` · `Duración` ·
`Destino` (IATA + país + nombre) · `Distancia` · `Clima (mes)` · `Turismo` ·
`Coste` · `UNESCO` · `Precio de` · `Precio`

En móvil la tabla se sustituye por tarjetas con la misma información en chips.

**Al pulsar un vuelo (fila o tarjeta) se abre su ficha**: la nota grande, el
mapa de la ruta (§9.4), los avisos, tu valoración (§14), el desglose de la nota
señal a señal, y todos los datos del vuelo y del destino. El enlace a Aviasales
no abre la ficha: es el único clic que se escapa.

## 9.2 Filtros

Barra superior: tipo de vuelo, texto libre de destino, antigüedad del precio,
orden, país, botón "Más filtros" con contador, botón "Limpiar".

Panel plegable con **11 rangos mín/máx**:

| Grupo | Filtros |
|---|---|
| Vuelo | Precio (€), Duración (h), Escalas, Distancia (km), **Fecha de salida** |
| Clima del mes de salida | Temperatura media (°C), Horas de sol al día, Días de lluvia al mes |
| Destino | Popularidad (/100), Índice turístico del mes (×), Índice de coste, Sitios UNESCO (100 km) |

**Los rangos se declaran en la constante `RANGOS` de `App.jsx`. Añadir un
filtro nuevo es añadir una fila ahí**: la interfaz se dibuja sola a partir de
esa lista. La fecha de salida es el único de tipo `fecha`: se dibuja con dos
calendarios y se compara como texto `AAAA-MM-DD`, que ordena igual que la fecha
real y no depende de la zona horaria del navegador.

Órdenes disponibles: **mejor puntuación (el que viene puesto)**, más baratos,
más cortos, más cálidos, más populares, precio más reciente, más cerca. Los
vuelos sin nota van al final.

El **buscador de aeropuerto de origen** ordena sus sugerencias por lo bien que
encajan: código exacto, códigos que empiezan igual, nombres que empiezan igual,
palabras del nombre, y por último coincidencias sueltas dentro del nombre. Sin
ese orden, al escribir `MAD` el primero era Doha, porque "Ha**mad**
International" contiene esas letras.

## 9.3 Marca

El paquete está en `handoff/` (logo SVG, `palette.css`, `palette.json` y su
propio `CONTEXT.md`, **cuyo alcance es: aplicar solo logo y paleta, sin
pantallas ni funcionalidades nuevas**). Dirección visual: atardecer y tierra,
neutros con base ámbar, **nunca gris azulado**.

- **Todos** los colores de `index.css` salen de las variables `--mu-*`. **No
  hay ni un color escrito a mano.** Si cambia la paleta, se sustituye
  `src/palette.css` y ya está.
- `public/favicon.svg` es una versión **cuadrada y con fondo crema** del logo,
  con el trazo engrosado (12 en vez de 9): el logo original es apaisado
  (~1,5:1) y en trazo fino se pierde a 16 px sobre una barra de pestañas
  oscura.
- `public/apple-touch-icon.png` (180×180) para "añadir a pantalla de inicio" en
  iOS, que no admite SVG.
- El logo de la cabecera va **inline** en `App.jsx` con `currentColor`.
- **Tipografías servidas desde el repo** (`public/fonts/`, ~200 KB): Bricolage
  Grotesque 700 para titulares, Instrument Sans 400/600 para texto.
  Descargadas de Google Fonts (SIL OFL) en vez de enlazadas, para que la página
  no dependa de Google en cada visita.
- **El color nunca es la única señal**: siempre lo acompaña un icono o el
  número de símbolos (requisito de daltonismo del `CONTEXT.md` de marca).
- El titular pide **"Nordique Pro Inline"** como primera opción y cae en
  Bricolage Grotesque. Esa tipografía **no está en el repo y no puede estarlo**:
  es comercial (Leksen Design) y su licencia no permite repartirla. Ver
  `frontend/public/fonts/NORDIQUE.txt`.
- Los trazos de los mapas usan `--mu-trazo`, un terracota oscuro que **no está
  escrito a mano**: sale de mezclar dos colores de la paleta con `color-mix`.
  Si cambia `palette.css`, cambia con ella.

## 9.4 La portada: el mapa del mundo

Vive en `frontend/src/mapas.jsx` (componente `MapaMundo`) y es **SVG de verdad**
(formas con contorno), así que todos los colores salen de las variables `--mu-*`
y se ve nítido en cualquier pantalla.

> **Antes fue un globo terráqueo.** Se sustituyó por un mapa plano apaisado
> porque el globo se acercaba mal: al ampliarlo, la esfera deformaba los bordes
> y costaba apuntar a un aeropuerto. Si alguien vuelve a proponer el globo, que
> sepa que ya se probó y por qué se cambió.

- Al entrar **se desplaza solo de este a oeste**, muy despacio (2,2° de longitud
  por segundo), como si el planeta pasara por delante. En escritorio ocupa toda
  la pantalla; en el móvil, todo lo que queda por debajo del buscador.
- **Nunca se ve la Tierra entera a la vez.** El mapa se dibuja un 30% más grande
  que su hueco (`HOLGURA = 1.3`), así que no aparecen zonas repetidas y el corte
  del mapa (el antimeridiano) queda siempre fuera de la pantalla.
- Los **575 aeropuertos** salen marcados con un circulito, como un único
  `MultiPoint`: un solo trazo para los 575.
- **Se maneja con la mano**: arrastrar lo mueve, la rueda, el **pellizco** y los
  botones `+ − ⟲` acercan hasta 8 aumentos, y **pulsar un aeropuerto lo elige
  como origen**. Se acierta el más cercano dentro de un radio medido **en
  píxeles de pantalla**, no en kilómetros: así la zona de acierto se siente
  igual con el mapa alejado y con el mapa cerca.
- Al elegir aeropuerto (pulsándolo o escribiéndolo) **deja de moverse y viaja**
  hasta centrarlo, acercándose hasta `ZOOM_ELEGIDO = 2.2` para enseñar su
  región. Al tocarlo también deja de moverse, para no pelear con el usuario; el
  botón `⟲` recentra y lo devuelve a su sitio.
- El centro no puede subir ni bajar más allá de donde asomaría un hueco blanco
  por arriba o por abajo (`topeLat`).
- **Desaparece en cuanto hay resultados.**
- El logo va **dentro de un recuadro**, para que no se pierda sobre el mapa.

**Rendimiento, que es lo que condiciona el diseño.** El mapa **no se repinta con
React**, y además **no recalcula las formas al moverse**: un mapa plano que gira
de lado es exactamente el mismo dibujo desplazado en horizontal, así que **se
dibuja el mundo dos veces, una al lado de la otra**, y el bucle solo escribe un
`transform`. Las formas únicamente se rehacen al cambiar el zoom o el tamaño de
la ventana. Va a **24 imágenes por segundo**, no a 60, y se para solo cuando la
pestaña no se ve o cuando el sistema pide menos animaciones.

**Un detalle que parece un capricho y no lo es:** las costas se dibujan como
líneas sueltas (`mesh` con `a === b`), no como borde del relleno. Al cortar el
mapa por el Pacífico, el relleno se cierra por ahí, y ese cierre se pintaría
como una raya recta cruzando la Antártida.

**El mapa del mundo** (`public/mapa/countries-110m.json`, 108 KB) es Natural
Earth vía el paquete `world-atlas`, dominio público. Está guardado en el repo
por lo mismo que las tipografías. En TopoJSON pesa la mitad que en GeoJSON, y
el servidor de Render no comprime lo que envía.

**El mapa de la ruta** de la ficha del vuelo usa el mismo archivo y los mismos
tonos: una línea punteada del origen al destino, con el arco real sobre la
esfera. Se acerca a la ruta con un tope, para que un vuelo corto no se quede sin
contexto. Sus dos extremos salen del **origen de la búsqueda** y del
**`enrich_airport`**, nunca de `origin`/`destination` del vuelo, que a veces son
códigos de ciudad que no existen en el maestro (trampa 1 del §8.1).

---

# 10. Cómo probar

## 10.1 Sin token (lo que más valor ha dado)

**Se puede verificar casi todo sin el token**, sustituyendo la llamada a la API
por vuelos reales del CSV de ejemplo:

```python
# servidor_demo.py
import csv, sys, datetime
sys.path.insert(0, "/ruta/al/repo")
import backend.main as m

hoy = datetime.date.today()
filas = []
with open("ejemplo resultado_BCN_Asia.csv", encoding="utf-8-sig") as fh:
    for i, row in enumerate(csv.DictReader(fh, delimiter=";")):
        r = dict(row)
        r["dia_busqueda"] = (hoy - datetime.timedelta(days=i % 8)).isoformat()
        filas.append(r)
        if i >= 300:
            break

m.buscar_grupo = lambda origen, destinos: filas   # sustituye la API
app = m.app
```

```bash
PYTHONPATH=. python3 -m uvicorn servidor_demo:app --port 8011
```

Desplazar `dia_busqueda` así hace que aparezcan los tres niveles de frescura a
la vez en pantalla.

**Navegador:** Playwright con el Chromium **ya instalado** en el entorno
(`executablePath: '/opt/pw-browsers/chromium'`). **No ejecutes
`playwright install`.** Node está disponible.

> **El patrón que funciona: no comprobar a ojo.** Calcula por tu cuenta, sobre
> los datos crudos, cuántos vuelos *deberían* quedar tras cada filtro, y
> compáralo con lo que muestra la web. Así se verificaron los 14 filtros, los
> 4 niveles de la escala de coste, que las fuentes cargan de verdad y que los
> colores son los de la paleta **por valor RGB exacto**.

## 10.2 Con token, de verdad

```bash
pip install -r backend/requirements.txt
export TP_TOKEN=tu_token          # PowerShell: $env:TP_TOKEN = "tu_token"
uvicorn backend.main:app --port 8000
# navegador: http://localhost:8000   (API interactiva en /docs)
```

**Desde la raíz del repo, no desde `backend/`.**

## 10.3 Estado de la verificación

- Los 6 CSVs cargan y cruzan (575 aeropuertos, 168 países, coordenadas al 100%).
- Enriquecimiento revalidado sobre los **9.318 vuelos** del CSV de ejemplo:
  **9.317 al 100%**, único hueco TFU (que ahora se descarta, §8.2).
- Llamada real a la API (BCN↔LIS): 304 vuelos, sin huecos.
- App abierta en **navegador real**, escritorio y móvil: filtros, marca,
  fuentes, iconos y colores comprobados. Sin errores de JavaScript.
- **Desplegada en Render y en uso desde el móvil.**
- **Puntuación (§7.5)** comprobada sobre los 9.318 vuelos calculando cada número
  esperado por separado con pandas: medianas por destino al céntimo, los dos
  avisos con el recuento exacto, 0 discrepancias en la suma, y la "prueba de
  Mallorca" (un destino barato pero uniforme no copa la parte alta; un vuelo a
  mitad de la mediana de su destino sí sube). De los 50 mejores por nota, solo 7
  están entre los 50 más baratos: **no es el ranking de precio disfrazado**.
- **Mapa de portada y ficha del vuelo** comprobados en navegador real
  calculando por separado dónde debe caer cada aeropuerto en pantalla.
- **Reajuste de pesos** comprobado al revés: con 200 valoraciones inventadas a
  partir de unos pesos conocidos, los recupera con ~1 punto de error de media.
- **No verificado:** que una zona grande (`Europe`, `Asia`) aguante el plan
  gratuito sin morir por tiempo o memoria.
- **No verificado:** cómo se comporta la puntuación con pocos vuelos (una zona
  pequeña o un origen con poca oferta): con menos de 10 vuelos por destino,
  casi todo saldrá con `chollo_pocos_datos`.

---

# 11. Pendientes

1. **Rotar el token de Travelpayouts.** Sigue hardcodeado en
   `testing_code.txt` y `testing_code_masivo.txt`, que son **públicos en
   GitHub**. Hay que regenerarlo y usar el nuevo solo como `TP_TOKEN` en el
   panel de Render. *Lleva pendiente desde el principio.*
2. **Comprobar que una zona grande no muere** en el plan gratuito de Render.
3. **Afinar los pesos con valoraciones de verdad.** Los de §7.5 son un punto de
   partida; el dueño tiene que valorar unos 40 vuelos y mandar el CSV (§14).
4. **La tipografía del titular** espera a que el dueño compre la licencia de web
   de Nordique Pro Inline (`frontend/public/fonts/NORDIQUE.txt`).

# 12. Decisiones abiertas (el usuario aún no las ha resuelto)

- ¿Añadir un selector opcional de mes de salida (`departure_at=YYYY-MM`)?
- En los `RD`, ¿interesa también el clima del mes de `return_at` como campos
  aparte?
- ¿Limitar a los N vuelos más baratos por ruta para aligerar la respuesta?
- ¿Los vuelos sin dato deberían colarse al filtrar, en vez de quedar fuera?
  (Ojo: distinto de §8.2, que es sobre descartarlos de la respuesta entera.)
- ¿Comparar los billetes sueltos con los redondos en precio de **viaje
  completo**, en vez de cada uno con los suyos? Ver el límite conocido del §7.5.
- ¿Debería el tipo de vuelo (ida / vuelta / redondo) ser una señal más de la
  fórmula, con su peso?

# 13. Fase 2: hecha

**Scoring**: cada vuelo lleva una nota de 0 a 100 que combina precio, clima,
turismo, coste y UNESCO. La fórmula entera está en **§7.5**; cómo se ve, en
**§9.1** y **§9.4**.

El aviso que dejó la fase 1 —que la estacionalidad turística miente en las
metrópolis (§5.4)— **está resuelto**: `turismo_idx` se apaga sola por encima de
`FRENO_POP = 75` y el vuelo se marca con `temporada_no_fiable`. La alternativa
que apuntaba el autor de `generar_turismo.py` (cruzarla con la curva de precios
de vuelo) sigue sin explorar.

**Los pesos actuales son un punto de partida, no una verdad.** Se afinan con
las valoraciones del dueño: §14.

---

# 14. Valoraciones manuales y reajuste de la fórmula

El dueño puntúa vuelos a mano y con esas notas se recalculan los pesos, en vez
de adivinarlos.

## 14.1 Cómo valora

En la ficha de cada vuelo hay una barra **de 0 a 100** —la misma escala que la
nota de muuyal, para poder compararlas— que **arranca en la nota de muuyal**:
valorar es corregirle.

Si su nota se separa **10 puntos o más**, la web **le obliga a decir por qué**,
eligiendo de una lista (una para subir, otra para bajar). Sin motivo no deja
guardar. Ese motivo es lo más valioso del archivo, por lo del §14.3.

> ⚠️ **Coste conocido de que la barra arranque en la nota de muuyal:** ancla.
> Al partir de su nota se tiende a quedarse cerca, y el ajuste aprende menos.
> Se eligió así a petición del dueño. Si se ve que casi nunca aparece el
> desplegable del motivo, hay que planteárselo otra vez.

## 14.2 Dónde se guardan

**En el navegador**, no en el servidor: el disco de Render se borra al dormirse
(§3.1), así que ahí se perderían. Clave de `localStorage`:
`muuyal_valoraciones_v2` (la `v1` iba de 0 a 10 y se convierte sola al abrir).

Dos botones, presentes tanto en la portada como en la lista: **descargar** un
CSV con todas, y **borrar** las de ese dispositivo (pregunta antes). El flujo es:
valorar → descargar → mandarle el archivo a Claude → nuevos pesos en un PR.

Cada fila guarda **los números del vuelo tal y como estaban al valorarlo**
(incluido el `norm_` de cada señal y el peso que tenía). Sin eso no se podrían
recalcular los pesos: el chollo depende de la búsqueda concreta en la que salió
ese vuelo y no se puede reconstruir después.

`valoraciones/valoraciones_maestro.csv` acumula todas, sin duplicados: si el
mismo vuelo se valoró dos veces, gana la más reciente.

## 14.3 Qué se hace con todo eso

`valoraciones/ajustar_pesos.py` junta el CSV nuevo con el maestro y propone
pesos. Busca los `w ≥ 0` que minimizan la diferencia entre `nota_usuario` y la
fórmula real; como la nota es un cociente (§7.5), se resuelve repitiendo un
ajuste lineal hasta que deja de moverse.

Tres cosas que hace y conviene no romper:

1. **Aparta del cálculo** las correcciones cuyo motivo no apunta a ninguna
   señal ("ese destino me llama", "las fechas no me vienen bien", "ya he
   estado", "otro"). La fórmula no puede aprenderlas con los datos que tiene.
   No se borran del maestro, solo se apartan.
2. **Mide si predice mejor de verdad**, sobre un 25% de valoraciones que no ha
   usado para ajustar. Si no mejora ahí, no vale.
3. **Comprueba que el ajuste le da la razón a los motivos**: si corrigió al
   alza 15 veces diciendo "el clima", el peso del clima debería subir. Si baja,
   sale un `⚠ no encaja` y hay que contárselo en vez de aplicar los pesos.

Hacen falta **al menos 40 valoraciones** (hay 12 pesos que estimar) y que sus
notas varíen: si todo lo puntúa 70-80, no hay nada que aprender.

> **`ACTUALIZAR_FORMULA.md` es el manual de esta tarea.** Si te llega un archivo
> `valoraciones_muuyal_*.csv`, léelo entero antes de tocar nada.
