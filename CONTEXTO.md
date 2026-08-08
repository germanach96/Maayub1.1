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
frontend/
  src/App.jsx     toda la interfaz (un solo componente grande)
  src/index.css   estilos; todos los colores salen de palette.css
  src/palette.css copia de handoff/palette.css
  src/fonts.css   @font-face de las tipografías locales
  public/         favicon, apple-touch-icon, logo, fonts/
  dist/           BUILD COMMITTEADO A PROPÓSITO
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
| `GET` | `/api/airports` | Los 575 aeropuertos: `code`, `name`, `country_code`, `zone`, `top151` |
| `GET` | `/api/zones` | `["Europe","Asia","America","Africa / Oceania","Top151"]` |
| `POST` | `/api/search` | `{origin, group}` → `{meta, flights}` |
| `GET` | `/*` | El build de React (catch-all SPA) |

`meta` contiene: `origin`, `group`, `fecha_consulta` (fecha UTC del servidor),
`destinations_queried`, `api_calls`, `flights_found`, `elapsed_seconds`.

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

**Vuelo sin match en algún CSV: no se descarta.** Sus campos van a `null` y el
hueco se lista en `enrichment_gaps`, que la interfaz muestra como etiqueta.

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

## 8.2 El único hueco conocido

**TFU** (Chengdú Tianfu) no está en los CSVs maestros. Sale sin datos, sin
país y sin distancia. **Es correcto, no lo persigas.**

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

## 9.1 Columnas de la tabla (escritorio)

`Vuelo` (tipo + ruta + huecos) · `Salida` · `Vuelta` · `Aerolínea` · `Escalas` ·
`Duración` · `Destino` (IATA + país + nombre) · `Distancia` · `Clima (mes)` ·
`Turismo` · `Coste` · `UNESCO` · `Precio de` · `Precio`

En móvil la tabla se sustituye por tarjetas con la misma información en chips.

## 9.2 Filtros

Barra superior: tipo de vuelo, texto libre de destino, antigüedad del precio,
orden, país, botón "Más filtros" con contador, botón "Limpiar".

Panel plegable con **11 rangos mín/máx**:

| Grupo | Filtros |
|---|---|
| Vuelo | Precio (€), Duración (h), Escalas, Distancia (km) |
| Clima del mes de salida | Temperatura media (°C), Horas de sol al día, Días de lluvia al mes |
| Destino | Popularidad (/100), Índice turístico del mes (×), Índice de coste, Sitios UNESCO (100 km) |

**Los rangos se declaran en la constante `RANGOS` de `App.jsx`. Añadir un
filtro nuevo es añadir una fila ahí**: la interfaz se dibuja sola a partir de
esa lista.

Órdenes disponibles: más baratos, más cortos, más cálidos, más populares,
precio más reciente, más cerca.

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
  **9.317 al 100%**, único hueco TFU.
- Llamada real a la API (BCN↔LIS): 304 vuelos, sin huecos.
- App abierta en **navegador real**, escritorio y móvil: filtros, marca,
  fuentes, iconos y colores comprobados. Sin errores de JavaScript.
- **Desplegada en Render y en uso desde el móvil.**
- **No verificado:** que una zona grande (`Europe`, `Asia`) aguante el plan
  gratuito sin morir por tiempo o memoria.

---

# 11. Pendientes

1. **Rotar el token de Travelpayouts.** Sigue hardcodeado en
   `testing_code.txt` y `testing_code_masivo.txt`, que son **públicos en
   GitHub**. Hay que regenerarlo y usar el nuevo solo como `TP_TOKEN` en el
   panel de Render. *Lleva pendiente desde el principio.*
2. **Comprobar que una zona grande no muere** en el plan gratuito de Render.

# 12. Decisiones abiertas (el usuario aún no las ha resuelto)

- ¿Añadir un selector opcional de mes de salida (`departure_at=YYYY-MM`)?
- En los `RD`, ¿interesa también el clima del mes de `return_at` como campos
  aparte?
- ¿Limitar a los N vuelos más baratos por ruta para aligerar la respuesta?
- ¿Los vuelos sin dato deberían colarse al filtrar, en vez de quedar fuera?

# 13. Fase 2 (siguiente, aún sin especificar)

**Scoring**: puntuar los vuelos combinando precio + clima + turismo + coste +
UNESCO. **El usuario tendrá que definir los pesos.**

> ⚠️ Aviso para cuando llegue: **la estacionalidad turística debe pesar poco en
> ciudades grandes**, por lo explicado en §5.4 — en metrópolis la curva está
> contaminada por tráfico no turístico. Una alternativa apuntada por el autor
> de `generar_turismo.py` es cruzarla con la curva de precios de vuelo, que es
> otro indicador de demanda y no está contaminado.
