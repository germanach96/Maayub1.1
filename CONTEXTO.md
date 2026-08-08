# muuyal — contexto del proyecto

Documento de traspaso entre sesiones. Explica qué es el proyecto, cómo se
trabaja en él, qué decisiones ya están tomadas y por qué, y qué queda
pendiente. **Léelo entero antes de tocar nada.**

---

## 1. Qué es muuyal

Web app personal de **búsqueda de vuelos con datos del destino**. No compite
con Skyscanner: la gracia no es encontrar el vuelo más barato, sino ver, junto
al precio, **cómo es el destino** — qué tiempo hará ese mes, cuánto cuesta la
vida allí, cuánto turismo tiene y cuántos sitios UNESCO hay cerca.

La pregunta que responde no es *"¿cuánto cuesta ir a Tokio?"* sino
*"¿a dónde me puedo ir, y cuál de esas opciones me conviene?"*.

*muuyal* significa **nube** en maya yucateco.

**Cómo funciona una búsqueda:** eliges un aeropuerto de origen y un **grupo de
destinos** (una de las 4 zonas, o el Top151). No se busca un destino suelto:
se consultan todos los del grupo de golpe, 3 llamadas por destino (ida,
vuelta, ida y vuelta). Cada vuelo que vuelve se cruza con los CSVs maestros
del repo para añadirle los datos del destino. El resultado son miles de
vuelos, que se filtran y ordenan en el navegador.

| Grupo | Destinos | Llamadas a la API |
|---|---|---|
| Africa / Oceania | 74 | 222 |
| America | 147 | 441 |
| Top151 | 151 | 453 |
| Asia | 168 | 504 |
| Europe | 186 | 558 |

Para probar, **usa siempre Africa / Oceania**: es el grupo más barato y ejerce
el flujo entero igual.

---

## 2. Con quién estás trabajando (importante)

**El dueño del repo no programa.** Venía de ejecutar estos scripts en Google
Colab y no había publicado una web nunca. Esto cambia cómo hay que trabajar:

- **Explica en castellano llano, sin jerga.** Nada de "hacer merge del PR a
  main": di "aprieta el botón verde y tu web se actualiza sola". Cuando uses
  un término técnico, explícalo la primera vez.
- **No le pidas que ejecute comandos** salvo que no haya alternativa. Prueba
  tú, y enséñale capturas.
- **Él revisa la web, no el código.** Manda capturas de pantalla de lo que
  cambia — móvil y escritorio — antes de que apruebe nada.
- **Verifica de verdad antes de decir que algo funciona.** Es la única forma
  de que confíe en lo que le entregas. Ver §8.
- Usa la app **desde el móvil**. Cualquier cambio visual tiene que probarse a
  390 px de ancho, no solo en escritorio.

---

## 3. Flujo de trabajo y despliegue

La app está **desplegada en Render** (plan gratuito) y funcionando.

```
tú trabajas en una rama  →  abres un PR  →  ÉL aprieta "Merge"  →  Render
                                                                  despliega solo
```

- **Nunca hagas push a `main`.** Trabaja en la rama que te indiquen y abre un
  PR. El botón de fusionar es suyo: nada llega a su web sin que él lo apruebe.
- **Render vigila `main`** y redespliega solo con cada push ahí. No hay que
  tocar nada en Render. Tarda 5–10 minutos.
- **Si tu rama ya se fusionó**, no acumules encima: reinicia desde `main`
  (`git checkout -B <rama> origin/main`) y abre un PR nuevo.
- **Deja el PR creado**, no solo la rama subida. Él espera un enlace donde solo
  tenga que pulsar "Merge".

Dos cosas del plan gratuito que hay que saber (y recordarle, porque parecen
fallos y no lo son):

- **Si nadie entra en 15 minutos, la app se duerme.** La siguiente visita tarda
  casi un minuto en cargar. No está rota.
- **Las búsquedas de zonas grandes son lentas** (CPU compartida). Europe puede
  irse a varios minutos y no está descartado que el navegador se canse antes.

Si un despliegue sale mal, Render mantiene viva la versión anterior y tiene un
botón **Rollback**.

---

## 4. Arquitectura

```
backend/
  main.py         FastAPI: /api/airports, /api/zones, /api/search, /api/health
                  + sirve el build de React (un solo servicio, sin CORS)
  aviasales.py    cliente de la API de Travelpayouts
  data.py         carga los 6 CSVs maestros en memoria al arrancar
  enrichment.py   cruce vuelo → datos del destino (lo más delicado del repo)
frontend/         React + Vite. `dist/` está committeado A PROPÓSITO.
handoff/          paquete de marca: logo, paleta y su propio CONTEXT.md
render.yaml       despliegue de un solo servicio en Render
```

**El `dist/` committeado es deliberado**: permite desplegar sin Node. Si tocas
el frontend, tienes que reconstruirlo y committearlo, o el cambio no se verá:

```bash
cd frontend && npm install && npm run build   # y committear frontend/dist
```

Los scripts originales de Colab (`testing_code*.txt`, `generar_*.py`,
`descargar_unesco_lista.py`) se dejaron **intactos como referencia**. No son la
app y no se ejecutan. Sirven para saber de dónde salió cada CSV.

---

## 5. Los datos

Seis CSVs maestros en la raíz, que cubren **los mismos 575 aeropuertos**:

| CSV | Separador | Llave |
|---|---|---|
| `airports_flightable_categorized.csv` | `;` | `code` (IATA) + `Zone`, `Top151`, `coordinates`, `country_code` |
| `indice_coste_destinos.csv` | `;` | `iata` |
| `turismo_ciudades.csv` | `;` | `iata` |
| `turismo_destinos.csv` | `;` | `iata` + `mes` (1–12) |
| `clima_destinos_2015_2024 (2).csv` | **`,`** | `iata` + `mes` (1–12) |
| `unesco_destinos.csv` | `;` | `iata` |

Todos con `encoding="utf-8-sig"`. **Ojo: el de clima es el único con coma.**

Un vuelo sin match en algún CSV **no se descarta**: sus campos van a `null` y
el hueco se lista en `enrichment_gaps`, que el frontend enseña como etiqueta.

### Qué significan los datos de turismo (pregunta recurrente)

Son **dos números distintos**, no una multiplicación, aunque se pinten juntos
(`83/100 ×0.99`):

- **`popularidad_0_100`** — cómo de conocida es la ciudad. Fija, no cambia con
  el mes. Escala **logarítmica**: cada 10 puntos son ×2.4 en visitas, así que
  un 80 no es "el doble" que un 40, es muchísimo más. Va de 0 (Sept-Îles) a
  100 (Nueva York).
- **`turismo_idx`** — si ese mes concreto es temporada alta o baja **para esa
  misma ciudad**. 1.00 = mes normal, 1.30 = 30% más movimiento, 0.70 = 30%
  menos. Es relativo a cada ciudad, no comparable entre ciudades.

**De dónde salen y su límite honesto:** no existe gratis un dato mundial de
visitantes por ciudad y mes, así que se usan las **visitas al artículo de
Wikipedia** de cada ciudad (API de Wikimedia, promediando varios años y
saltándose 2020–2021 por el COVID).

Funciona muy bien en destinos turísticos puros. **Falla en metrópolis**: el
artículo de Barcelona recibe tráfico por fútbol y noticias, y su curva sale
plana y sin sentido (marca enero como mes fuerte y junio como flojo). La
popularidad absoluta sí es fiable en todas. Lo dejó escrito el autor de
`generar_turismo.py` y se confirma con los datos.

---

## 6. Las tres trampas verificadas (no las redescubras)

### 6.1 y 6.2 — Qué aeropuerto enriquecer

`enrich_airport` es el aeropuerto **distinto** al origen que dio el usuario. La
regla ingenua ("destination, salvo en vueltas que es origin") falla en dos
casos reales encontrados en `ejemplo resultado_BCN_Asia.csv`:

1. **Códigos de ciudad.** La API devuelve MOW, TYO, SHA, BAK… en
   `origin`/`destination` aunque consultes SVO, NRT o PVG. Esos códigos no
   existen en los CSVs maestros y dejaban **4.243 de 9.318 vuelos sin
   enriquecer**. Por eso se priorizan `origin_airport`/`destination_airport`.
2. **Input resuelto como ciudad.** Una llamada de vuelta LCA→BCN devolvió un
   vuelo LCA→REU (Reus como aeropuerto de Barcelona), donde *ambos* extremos
   difieren del input. Se resuelve por sentido del vuelo: en `OW_VUELTA` manda
   el origen, en el resto el destino.

**Si tocas `enrichment.py`, revalida contra el CSV de ejemplo.** Resultado
esperado, comprobado: **9.317 de 9.318 al 100%**; el único hueco es **TFU**
(Chengdú Tianfu), que no está en los CSVs maestros.

### 6.3 — Namibia y pandas

El código de país de Namibia es **`NA`**, y pandas lo lee como nulo (*Not
Available*), dejando a Windhoek (WDH) sin país. El CSV de aeropuertos se lee
con **`keep_default_na=False, na_values=[""]`**. Si alguien quita eso, WDH
vuelve a romperse en silencio.

---

## 7. Decisiones ya tomadas (no volver a plantearlas sin motivo)

- **Inputs de búsqueda**: aeropuerto de origen (IATA) + grupo de destinos.
  Sin filtro de fecha, igual que el script original.
- **Consulta**: 3 llamadas por destino (`OW_IDA`, `OW_VUELTA`, `RD`),
  reintentos ante 429, link absoluto a Aviasales, `dia_busqueda` extraído del
  link. Idéntico al script masivo salvo dos cosas: el token sale de `TP_TOKEN`
  y `HILOS` bajó de 50 a 20 por el plan gratuito de Render.
- **Mes para clima y turismo mensual**: el de `departure_at`. En los vuelos de
  ida y vuelta **no** se calcula nada con `return_at`.
- **Volumen**: se devuelven todos los vuelos, sin recortar. La paginación (50
  por página) es solo del frontend.
- **Filtrado en el navegador**: los vuelos ya están descargados; filtrar no
  vuelve a llamar a la API.
- **Vuelo sin dato en el campo filtrado → queda FUERA** mientras ese filtro
  esté puesto (no se puede afirmar que lo cumpla). Se avisa en el panel.

### Antigüedad del precio

Los precios de Aviasales salen de **su caché**: `dia_busqueda` es el día en que
se guardó ese precio, y cuanto más viejo, menos fiable. `meta.fecha_consulta`
(fecha UTC del servidor) es la referencia para calcular la antigüedad — no el
reloj del navegador. Umbrales: **≤1 día verde, 2–3 ámbar, ≥4 rojo**.

Medido sobre el CSV de ejemplo: Aviasales nunca devuelve caché de más de ~7
días, pero **el 30% de los vuelos traía precios de 4 días o más**.

### Filtros

Panel plegable con 11 rangos mín/máx (precio, duración, escalas, distancia,
temperatura, horas de sol, días de lluvia, popularidad, índice turístico del
mes, índice de coste, UNESCO), selector de país, antigüedad del precio y
"Limpiar". Se declaran en la tabla `RANGOS` de `App.jsx`: **añadir un filtro
nuevo es añadir una fila ahí**, la interfaz se dibuja sola.

Dos datos que **no existían** y se crearon para esto:

- **`distancia_km`** — Aviasales no devuelve distancia, solo duración. Se
  calcula con el semiverseno entre las coordenadas de origen y destino
  (columna `coordinates`, texto con forma de dict). Los 575 la tienen.
  Contrastado: BCN–MAD 484 km, BCN–NRT 10.449 km, BCN–SYD 17.190 km.
- **`enrich_country`** — código ISO del país del destino. El nombre en español
  lo resuelve el navegador con `Intl.DisplayNames`, sin lista que mantener.

**Cuidado con "días de sol":** ese dato no existe. Lo que hay es
`horas_sol_dia` (horas de sol al día, media del mes). `dias_lluvia` sí son
días de lluvia al mes.

---

## 8. Marca

El paquete vive en `handoff/` (logo SVG, `palette.css`, `palette.json` y su
propio `CONTEXT.md`, **que fija el alcance: aplicar solo logo y paleta, sin
pantallas ni funcionalidades nuevas**). Dirección visual: atardecer y tierra,
neutros con base ámbar, **nunca gris azulado**.

- `frontend/src/palette.css` — copia de `handoff/palette.css`. **Todos** los
  colores de `index.css` salen de estas variables `--mu-*`; no hay ni un color
  escrito a mano. Si cambia la paleta, se sustituye ese archivo y ya está.
- `frontend/public/favicon.svg` — icono de pestaña. Es una versión **cuadrada
  y con fondo crema** del logo, con el trazo engrosado (12 en vez de 9): el
  logo original es apaisado (~1.5:1) y en trazo fino se pierde a 16 px sobre
  una barra de pestañas oscura.
- `frontend/public/apple-touch-icon.png` — 180×180, para "añadir a pantalla de
  inicio" en iOS, que no admite SVG. Generado renderizando el favicon.
- El logo de la cabecera va **inline** en `App.jsx` (componente `Logo`) con
  `currentColor`, así lo tiñe el CSS.
- **Tipografías servidas desde el repo** (`frontend/public/fonts/`, ~200 KB):
  Bricolage Grotesque 700 para titulares y wordmark, Instrument Sans 400/600
  para el texto. Descargadas de Google Fonts (SIL OFL) en vez de enlazadas,
  para que la página no dependa de Google en cada visita. El subconjunto
  `latin-ext` solo lo baja el navegador si algún texto lo necesita.
- Rampa de temperatura: cortes en **12 / 19 / 26 °C**, que son los cuartiles
  reales del CSV de clima. Escala de coste €→€€€€ con los colores de la
  paleta. **El color nunca es la única señal**: siempre lo acompaña un icono o
  el número de símbolos (requisito de daltonismo del `CONTEXT.md`).

---

## 9. Cómo probar (sin token y sin molestar al usuario)

Este es el punto que más valor ha dado. **Se puede verificar casi todo sin el
token de Travelpayouts**, sustituyendo la llamada a la API por vuelos reales
del CSV de ejemplo:

```python
# servidor_demo.py — levanta la app real con datos simulados
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

Y encima, **Playwright con el Chromium ya instalado** en el entorno
(`executablePath: '/opt/pw-browsers/chromium'`, no ejecutes
`playwright install`). Node está disponible.

**El patrón que funciona**: no comprobar a ojo. Calcular por tu cuenta, sobre
los datos crudos, cuántos vuelos *deberían* quedar tras cada filtro, y
comparar con lo que muestra la web. Así se verificaron los 14 filtros, la
escala de coste, las fuentes cargadas y los colores por valor RGB exacto.

### Probar de verdad, con token

```bash
pip install -r backend/requirements.txt
export TP_TOKEN=tu_token          # PowerShell: $env:TP_TOKEN = "tu_token"
uvicorn backend.main:app --port 8000
# navegador: http://localhost:8000   (API interactiva en /docs)
```

Desde la raíz del repo, **no** desde `backend/`. Sin `TP_TOKEN` la página
carga igual y el autocompletado funciona; solo falla la búsqueda.

### Estado de la verificación

- Los 6 CSVs cargan y cruzan bien (575 aeropuertos, 168 países, coordenadas
  completas).
- Enriquecimiento revalidado contra los **9.318 vuelos** del CSV de ejemplo:
  9.317 al 100%, único hueco TFU.
- Llamada real a la API (BCN↔LIS): 304 vuelos, sin huecos.
- App abierta en **navegador real**, escritorio y móvil: filtros, marca,
  fuentes, iconos y colores comprobados. Sin errores de JavaScript.
- **Desplegada en Render y usada por el dueño desde el móvil.**

---

## 10. Pendientes

1. **Rotar el token de Travelpayouts.** Sigue hardcodeado en
   `testing_code.txt` y `testing_code_masivo.txt`, que son **públicos en
   GitHub**. Regenerarlo y usar el nuevo solo como variable `TP_TOKEN` en el
   panel de Render. *Esto lleva pendiente desde el principio.*
2. **Comprobar que una zona grande (Europe, Asia) no muere** por tiempo o
   memoria en el plan gratuito de Render. Solo se ha probado en local y con
   grupos pequeños.

## 11. Decisiones abiertas (el usuario aún no las ha resuelto)

- ¿Añadir un selector opcional de mes de salida (`departure_at=YYYY-MM`)?
- En los vuelos de ida y vuelta, ¿interesa también el clima del mes de
  `return_at` como campos aparte?
- ¿Limitar a los N vuelos más baratos por ruta para aligerar la respuesta?
- ¿Los vuelos sin dato deberían colarse en vez de quedar fuera al filtrar?

## 12. Fase 2 (siguiente, aún sin especificar)

**Scoring**: puntuar los vuelos combinando precio + clima + turismo + coste +
UNESCO. El usuario tendrá que definir los pesos.

Aviso importante para cuando llegue: **la estacionalidad turística debe pesar
poco en ciudades grandes**, por lo explicado en §5 — en metrópolis la curva
está contaminada por tráfico no turístico. Una alternativa apuntada por el
autor de `generar_turismo.py` es cruzarla con la curva de precios de vuelo,
que es otro indicador de demanda y no está contaminado.
