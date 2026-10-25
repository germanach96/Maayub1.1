---
name: muuyal
description: Buscador de vuelos baratos con luz de atardecer, sobre un mapa del mundo plano y cálido.
colors:
  orange: "#E8731A"
  terracotta: "#B8502D"
  clay: "#8A3E20"
  earth: "#5C3520"
  gold: "#D9A441"
  surface: "#FFF9F0"
  cream: "#FAF3E7"
  sand: "#F2E4CE"
  border: "#E5D3B8"
  ink-soft: "#7A6350"
  ink: "#3A2418"
  dark: "#2C1B10"
  cost-1: "#D9A441"
  cost-2: "#E8731A"
  cost-3: "#B8502D"
  cost-4: "#6E3A21"
  cold: "#EFDDBE"
  mild: "#E9B76B"
  warm: "#DE8A34"
  hot: "#B8502D"
  success: "#6B7F3A"
  warning: "#D9A441"
  error: "#B03A2E"
  selected: "#E8731A"
  trazo: "#9C4527"
  orange-hover: "#DA6B1B"
  fila-hover: "#FCE6D2"
  fila-alterna: "#FBF3E6"
  mar: "#F5CDAA"
  txt-terracota: "#9C4829"
  txt-calido: "#9D491F"
  txt-templado: "#905728"
  txt-calor: "#B03A2E"
  txt-exito: "#5E6B32"
  material: "#FFF9F0BD"
  material-denso: "#FFF9F0E0"
  material-borde: "#E5D3B8BF"
typography:
  display:
    fontFamily: "Nordique Pro Inline, Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "2.2rem"
    fontWeight: 700
    lineHeight: 1
  title:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "0.78rem"
    fontWeight: 700
    letterSpacing: "0.08em"
  body:
    fontFamily: "Instrument Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.45
  body-table:
    fontFamily: "Instrument Sans, system-ui, sans-serif"
    fontSize: "0.87rem"
    fontWeight: 400
  label:
    fontFamily: "Instrument Sans, system-ui, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 600
  label-caps:
    fontFamily: "Instrument Sans, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    letterSpacing: "0.08em"
  badge:
    fontFamily: "Instrument Sans, system-ui, sans-serif"
    fontSize: "0.72rem"
    fontWeight: 600
rounded:
  pequeno: "6px"
  tarjeta: "16px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.5rem"
  xxl: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.orange}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pequeno}"
    padding: "0.6rem 1.4rem"
  button-primary-hover:
    backgroundColor: "{colors.orange-hover}"
    textColor: "{colors.ink}"
  button-disabled:
    backgroundColor: "{colors.sand}"
    textColor: "{colors.ink-soft}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pequeno}"
    padding: "0.55rem 0.9rem"
  button-secondary-hover:
    backgroundColor: "{colors.sand}"
  button-icon:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pequeno}"
    size: "2.75rem"
  button-cerrar:
    backgroundColor: "{colors.sand}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pequeno}"
    size: "2.75rem"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pequeno}"
    padding: "0.55rem 0.7rem"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.tarjeta}"
    padding: "1rem"
  pastilla:
    backgroundColor: "{colors.material}"
    textColor: "{colors.ink}"
    rounded: "{rounded.tarjeta}"
    padding: "0.45rem 1.1rem"
  barra-resumen-movil:
    backgroundColor: "{colors.material}"
    textColor: "{colors.ink}"
    rounded: "{rounded.tarjeta}"
    padding: "0.7rem 0.9rem"
  sugerencias:
    backgroundColor: "{colors.material-denso}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pequeno}"
  chip:
    backgroundColor: "{colors.sand}"
    rounded: "{rounded.pequeno}"
    padding: "0.15rem 0.55rem"
  coste-1:
    backgroundColor: "{colors.cost-1}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pequeno}"
  coste-4:
    backgroundColor: "{colors.cost-4}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pequeno}"
  fila-tabla-hover:
    backgroundColor: "{colors.fila-hover}"
  ficha:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.tarjeta}"
    width: "720px"
---

<!-- Propuesta escrita a partir de lo que está construido (frontend/src y las
capturas finales de escritorio 1440 y móvil 390). No sustituye al DESIGN.md de
la raíz del repo: dice en qué coincide con él y en qué la app hecha es distinta.
Los valores de arriba son los que manda; el texto de abajo explica dónde y por
qué se usan. -->

# Design System: muuyal

## Overview

**Creative North Star: "El mapa al atardecer"**

muuyal es una herramienta, no un folleto. Se abre sobre un mapa del mundo plano,
pintado en arena y naranja muy rebajado, que se desplaza despacio de este a
oeste como si el planeta pasara por delante. Encima flotan solo dos cosas: la
marca dentro de un recuadro y el buscador. Al buscar, las rutas salen del
aeropuerto de origen hacia todos los destinos y el mapa se convierte en el
indicador de que la búsqueda está viva. Después el mapa se va y queda una tabla
densa de 15 columnas (en el móvil, tarjetas), que es donde se trabaja.

Toda la luz es cálida: cremas y arenas con base ámbar, tinta marrón, y el
naranja y el terracota reservados para lo que importa (la acción principal, el
precio, la nota, las rutas del mapa). No hay grises, ni gris azulado, ni blanco
puro, ni negro. La profundidad sale de cambiar de un tono cálido a otro con un
borde fino; las sombras son pocas, marrones y translúcidas. Solo lo que flota
sobre algo que se mueve (el mapa, la lista que pasa por debajo) es un poco
translúcido, con desenfoque; todo lo demás es opaco.

El movimiento es parte del carácter: lo que se pulsa responde enseguida (se
hunde un poco), lo que llega entra con una curva que frena al final, y si el
sistema pide menos animaciones nada se desplaza, pero todo sigue apareciendo
con fundidos.

Hay **un solo tema, claro**. La app no cambia con el modo oscuro del sistema:
las capturas en "oscuro" son iguales a las de "claro".

**Key Characteristics:**
- Mapa del mundo plano en SVG como portada y como indicador de búsqueda.
- Paleta cerrada `--mu-*`; cualquier tono nuevo se mezcla con `color-mix()` a partir de dos de ella.
- Dos radios en todo el sistema: 16px para lo que contiene, 6px para lo que se pulsa o etiqueta.
- Titulares en Bricolage Grotesque 700; texto en Instrument Sans 400/600.
- Degradado de atardecer solo en las dos acciones principales.
- Movimiento con curvas propias y cinco duraciones con nombre.
- Material translúcido solo para lo que flota sobre contenido en movimiento.

### En qué se separa del DESIGN.md de la raíz

Coincide en: la paleta `--mu-*` entera, los radios 16 y 6, el degradado de
atardecer en la acción principal, el anillo de foco en `--mu-clay`, las sombras
marrones cálidas, el precio en terracota a 600, el texto oscuro sobre naranja y
dorado, el tinte de selección con barra de tierra a la izquierda, y la regla de
que el color nunca va solo.

Es distinto en:
- **Tipografía.** No se usa Matter ni Arial. Los titulares son Bricolage
  Grotesque 700 (el titular "Muuyal" pide antes Nordique Pro Inline, que solo
  ve quien la tiene instalada) y el texto es Instrument Sans 400 y 600, como
  dice `CONTEXTO.md` §9.3. Los titulares no van a 500: van a 700.
- **No hay esfera de partículas** ni dibujo de "moléculas". La imagen de la
  marca es el mapa plano del mundo (`mapas.jsx`), con los 575 aeropuertos.
- **No hay pie oscuro** ni paneles en `--mu-dark`. Ese color solo aparece
  mezclado: en el velo detrás de la ficha, en la sombra de la ficha y en los
  tonos de texto y trazo.
- **No hay escala de espaciado `--spacing-*`, ni `--text-*`, ni barra de
  navegación con enlaces.** La cabecera es solo la marca, que lleva a la portada.
- **El botón principal no va en mayúsculas** ni con 32px de alto de relleno:
  texto normal a 1rem, peso 600, relleno 0.6rem × 1.4rem.
- **No existen** el botón cuadrado con flecha ↗, el texto gigante "cinético",
  los contadores de estadística en columnas ni el degradado "horizonte".
- `--mu-shadow` no se usa; las sombras reales son `--sombra-flota`,
  `--sombra-menu` y `--sombra-ficha`.

## Colors

Atardecer y tierra sobre neutros ámbar: el color de verdad está racionado y casi
todo lo demás es crema, arena y tinta marrón.

### Primary
- **Naranja atardecer** (`--mu-orange`): relleno del botón principal, el aeropuerto elegido en el mapa y su radar, los destinos y el "cometa" de la búsqueda, el carril del deslizador de nota, el cursor de escritura. Encima, siempre texto `--mu-ink`.
- **Naranja más hondo** (`--mu-orange-hover`, mezcla 85% naranja + 15% barro): el botón principal al pasar el ratón. El texto no cambia.

### Secondary
- **Terracota** (`--mu-terracotta`): el logo, los precios (peso 600), la nota grande de la ficha, el número del deslizador, los 575 puntos del mapa, el contador de filtros activos.
- **Barro** (`--mu-clay`): todos los anillos de foco, el aro del aeropuerto bajo el ratón, el avión del mapa de la ruta, la acción "Cambiar" del buscador plegado.
- **Trazo** (`--mu-trazo`, mezcla 80% terracota + 20% oscuro): costas, fronteras y rutas de los dos mapas.

### Tertiary
- **Dorado** (`--mu-gold`): extremo claro del degradado de atardecer, coste €, tramo 2 de la nota.
- **Escalas de datos**: coste `--mu-cost-1…4` (luminosidad que baja de forma ordenada, el número de € es la señal), clima `--mu-cold…--mu-hot`, estados `--mu-success`, `--mu-warning`, `--mu-error`. El tipo de vuelo también es color + texto: Ida en naranja con tinta, Vuelta en tierra con superficie, Ida y vuelta en terracota con superficie.

### Neutral
- **Crema** (`--mu-cream`): fondo de la página.
- **Superficie** (`--mu-surface`): lo más claro del sistema. Paneles, buscador, tabla, tarjetas, campos, ficha, pastillas sobre el mapa.
- **Arena** (`--mu-sand`): la tierra del mapa, chips, botón de cerrar, botón desactivado, sugerencia activa, carril vacío de las barras.
- **Mar** (mezcla 30% naranja + 70% crema; 22% en el mapa pequeño de la ficha): el mar de los mapas.
- **Borde** (`--mu-border`): todos los bordes de 1px y la regla de 2px bajo los títulos de columna.
- **Tinta** (`--mu-ink`): texto principal y texto sobre naranja y dorado.
- **Tinta suave** (`--mu-ink-soft`): etiquetas, títulos de columna, títulos de sección, texto secundario, marcadores de campo.
- **Tierra** (`--mu-earth`): el titular "Muuyal", la barra izquierda de la fila señalada, los iconos de sol y lluvia.
- **Franja alterna** (`--fila-alterna`, 30% arena sobre superficie) y **fila señalada** (`--fila-hover`, 14% naranja sobre superficie).

### Textos de color con contraste
Cuando un dato se colorea, no se usa el naranja o el dorado puros (se quedaban
en 2-3:1). Se usan estas mezclas, que se leen sobre crema, arena y la fila
señalada: `--txt-terracota` (nota propia, índice alto, precio en fila
señalada), `--txt-calido` y `--txt-templado` (temperaturas), `--txt-calor`
(= `--mu-error`, calor fuerte), `--txt-exito` (precio reciente, índice bajo).

### Material
El material es la superficie de la paleta vuelta un poco translúcida, con
desenfoque: se adivina lo que pasa por debajo sin perder la lectura. Tokens en
`:root` de `index.css`:
- **Material** (`--material`, superficie al 74%): pastillas y botones sobre el mapa, pastilla "Consultando…", barra de búsqueda pegada del móvil.
- **Material denso** (`--material-denso`, superficie al 88%): la lista de sugerencias, que es para leer.
- **Borde de material** (`--material-borde`, borde al 75%): el borde de 1px de lo que va en material (la lista de sugerencias mantiene `--mu-border`).
- **Filtro** (`--material-filtro`: `blur(18px) saturate(1.5)`): el desenfoque que va siempre con el material.

### Named Rules
**La Regla de la Paleta Cerrada.** Ningún color se escribe a mano. Si hace falta un tono, se mezclan dos `--mu-*` con `color-mix()`, y se le da nombre en `:root` si se repite.

**La Regla de la Señal Doble.** El color nunca dice nada solo: coste lleva sus €, clima lleva icono y cifra, la nota lleva su número en tinta y el color va en la barra.

**La Regla del Texto Oscuro.** Sobre naranja y dorado, texto `--mu-ink`; sobre terracota, tierra y coste 4, texto `--mu-surface`.

**La Regla del Material Flotante.** La translucidez solo se usa en el cromo que flota sobre contenido en movimiento: la etiqueta del mapa, la pastilla de carga y la barra de búsqueda pegada del móvil llevan `--material` con desenfoque; los botones del mapa usan `--material-denso` sin desenfoque propio (tres capas filtrando el mapa en cada fotograma costaban demasiado). La lista de sugerencias es opaca: flota sobre un formulario quieto. El velo de la ficha lleva solo un desenfoque leve de 3px. Tarjetas, tabla y ficha son siempre opacas. Con `prefers-reduced-transparency: reduce` los colores de material vuelven a `--mu-surface` y `--mu-border` y se quita todo desenfoque, también el del velo (Safari en iPhone aún no entiende esta preferencia, así que allí no hace efecto).

## Typography

**Display Font:** Bricolage Grotesque 700 (el titular pide antes Nordique Pro Inline; cae en system-ui)
**Body Font:** Instrument Sans 400 y 600 (cae en system-ui, -apple-system, Segoe UI)

**Character:** Una grotesca con carácter y algo de rareza para la marca y los
números grandes, y una sans tranquila y técnica para leer una tabla de 15
columnas. Las dos se sirven desde el propio repo.

### Hierarchy
- **Display** (Bricolage 700, 2rem; 1.7rem en el móvil; interlineado 1.1; −0.02em; `--mu-earth`): solo el titular "Muuyal" junto al logo.
- **Headline** (Bricolage 700, 2.2rem, interlineado 1, `--mu-terracotta`): el número del deslizador "73/100". La nota grande de la ficha va a 2.4rem en Instrument Sans, también en terracota.
- **Title** (Bricolage 700, 0.78rem, mayúsculas, +0.08em, `--mu-ink-soft`, con regla de borde debajo): los títulos de sección de la ficha y de los grupos de filtros ("TU VALORACIÓN", "EL VUELO"). Son el título en sí, no una etiqueta encima de otro título.
- **Body** (Instrument Sans 400, 1rem, interlineado 1.45): texto general, campos, botones (a 600).
- **Body de tabla** (Instrument Sans 400, 0.87rem): celdas de la tabla de resultados.
- **Label** (Instrument Sans 600, 0.8rem, `--mu-ink-soft`): etiquetas de los campos del buscador.
- **Label en mayúsculas** (Instrument Sans, 0.72–0.75rem, +0.08em, `--mu-ink-soft`): títulos de columna de la tabla y nombre de cada dato en la ficha.
- **Badge** (Instrument Sans 600, 0.72–0.78rem): tipo de vuelo, coste, contador de filtros, chips.

### Named Rules
**La Regla de las Cifras Quietas.** Toda cifra que se compara en columna (tabla, precio, nota, cronómetro, contadores, paginación) usa números de ancho fijo (`tabular-nums`).

**La Regla de los Pesos Reales.** Instrument Sans solo tiene 400 y 600 cargados; Bricolage solo 700. No se piden otros pesos.

## Layout

- **Portada, escritorio (más de 800px):** el mapa ocupa la pantalla entera, fijo detrás. Encima, centrados, la marca en su recuadro y el buscador (hasta 860px de ancho). Los botones `− ⟲ +` y el nombre del aeropuerto elegido van abajo en el centro.
- **Portada, móvil (800px o menos):** una columna: cabecera, buscador y el mapa llenando el resto hasta el borde de abajo, a sangre por los lados.
- **Resultados:** contenido hasta 1800px de ancho (la portada se queda en 1400px). Buscador en una fila, línea de resumen, barra de filtros, tabla dentro de su propio marco con la fila de títulos fija arriba.
- **Resultados, móvil:** el buscador se pliega en una línea ("BCN · Zona: Europe · Cambiar") que se queda pegada arriba (0.5rem bajo la zona segura) mientras se baja por la lista, en material translúcido con la sombra flota; los vuelos pasan por debajo. Por encima de ella, un fundido de crema hace de borde de desplazamiento: lo que sube se desvanece en el fondo en vez de cortarse en seco. Si se toca con la lista bajada, la página sube hasta el buscador. Los filtros son una sola fila que se desliza de lado con el borde derecho desvanecido; la tabla se cambia por tarjetas apiladas.
- **Entre 801 y 1400px** la tabla aprieta el relleno de las celdas para que quepan las 15 columnas.
- **Ritmo:** márgenes y huecos en rem: 0.25, 0.5, 0.75, 1, 1.5 y 2rem. Paneles con 1rem de relleno; tarjetas del móvil 0.85rem.
- **Tamaño de dedo:** los botones de icono (mapa, cerrar, paginación) miden 2.75rem (44px).

## Elevation & Depth

Casi plano. La profundidad sale de pasar de crema a superficie con un borde de
1px en `--mu-border`. Solo lo que flota sobre otra cosa lleva sombra, y siempre
es marrón translúcida, nunca negra ni gris.

### Shadow Vocabulary
- **Flota** (`--sombra-flota`: `0 2px 10px`, tierra al 14%): pastillas sobre el mapa (nombre del aeropuerto, "Consultando…"), la barra de búsqueda pegada del móvil y el tirador del deslizador.
- **Menú** (`--sombra-menu`: `0 8px 20px`, tierra al 16%): la lista de sugerencias del aeropuerto.
- **Ficha** (`--sombra-ficha`: `0 18px 50px`, oscuro al 35%): la ficha del vuelo, sobre un velo de `--mu-dark` al 50% con un desenfoque de 3px que aparta un poco de foco la lista de detrás.
- **Barra de señalado** (`inset 3px 0 0 --mu-earth`): la fila de la tabla bajo el ratón. No es una sombra de altura, es una marca.

### Named Rules
**La Regla de la Sombra Cálida.** Si algo necesita sombra, sale de `--mu-earth` o `--mu-dark` mezclado con transparente. Nada de negro.

## Shapes

Dos radios y nada más: **16px** (`--radio-tarjeta`) para lo que contiene (paneles,
tabla, tarjetas, ficha, pastillas sobre el mapa, recuadro de la marca, mapa de
la ruta) y **6px** (`--radio-pequeno`) para lo que se pulsa o etiqueta (botones,
campos, chips, badges, sugerencias, barras). En el móvil la ficha es una hoja
con 16px solo arriba. Los únicos círculos son los puntos del mapa y el tirador
del deslizador. Bordes de 1px; 2px solo bajo los títulos de columna y en los
anillos de foco.

## Components

### Buttons
- **Shape:** esquinas suaves (6px).
- **Primary:** naranja con texto tinta, peso 600, 1rem, relleno 0.6rem × 1.4rem. Hover un paso más oscuro (`--mu-orange-hover`).
- **Las dos acciones principales** ("Buscar vuelos" y "Ver en Aviasales") llevan el degradado de atardecer, dorado a naranja; al pasar el ratón la luz se desliza hacia el naranja (400ms).
- **Al pulsar:** todo botón se hunde a 0.97 (140ms). En el móvil no hay destello gris al tocar.
- **Desactivado:** arena con tinta suave.
- **Secundario:** superficie con borde, hover arena. Variante "Borrar" en rojo arcilla, que se rellena al pasar el ratón.
- **De icono:** 44×44, superficie con borde (mapa, paginación) o arena (cerrar ficha, cuya X gira 90° al pasar el ratón).

### Chips
- **Style:** arena, borde de 1px, 6px, 0.78rem. Los de antigüedad del precio cambian solo el borde y el texto (oliva, naranja/barro, rojo).
- **Coste:** fondo de la escala de coste, sin borde.

### Cards / Containers
- **Corner Style:** 16px.
- **Background:** superficie sobre crema.
- **Shadow Strategy:** sin sombra; solo el borde.
- **Border:** 1px `--mu-border`.
- **Internal Padding:** 1rem en paneles; 0.85rem en tarjetas del móvil. Al tocar una tarjeta se hunde a 0.985 y su borde pasa a naranja.

### Inputs / Fields
- **Style:** superficie, borde 1px, 6px, relleno 0.55rem × 0.7rem, 1rem (16px en el móvil para que iOS no amplíe).
- **Focus:** anillo de 2px en barro y el borde pasa a naranja.
- **Sugerencias:** lista que crece desde el campo, en material denso con la sombra de menú; la activa en arena.

### Navigation
No hay barra de navegación. La marca (logo + "Muuyal") es el botón de volver a la portada: en la portada va dentro de un recuadro de superficie; el logo pasa a naranja y da media vuelta al pasar el ratón.

### Tabla de resultados (componente propio)
Marco de superficie con 16px. Títulos de columna fijos arriba, en mayúsculas espaciadas y regla de 2px. Filas separadas por 1px y con franja alterna. Al pasar el ratón: tinte de selección, barra de tierra a la izquierda y el precio a terracota oscuro. Toda la fila abre la ficha. La nota va en tinta con una barra corta de 44px debajo coloreada por tramo.

### Ficha del vuelo (componente propio)
En escritorio, ventana centrada de hasta 720px sobre un velo oscuro. En el móvil, hoja que sube desde abajo, con asa, que deja ver un poco de la lista por arriba y se baja con el dedo. Dentro: nota grande, mapa de la ruta, avisos, deslizador de tu nota, desglose señal a señal y datos en rejilla.

### Mapa del mundo (componente propio)
SVG plano: mar naranja rebajado, tierra arena, costas y fronteras en `--mu-trazo`, 575 puntos terracota. El elegido es un punto naranja con borde de superficie y un aro que late. Al buscar, los puntos se apagan y salen las rutas. La pastilla del nombre y los botones `− ⟲ +` van en material translúcido.

### Movimiento
Tokens en `:root` de `index.css`:

| Token | Valor | Para qué |
|---|---|---|
| `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | entradas y respuestas |
| `--ease-expo` | `cubic-bezier(0.16, 1, 0.3, 1)` | llegadas largas (barras, filas, bloques) |
| `--ease-in-out` | `cubic-bezier(0.77, 0, 0.175, 1)` | lo que viaja o se dibuja en pantalla |
| `--ease-drawer` | `cubic-bezier(0.32, 0.72, 0, 1)` | hojas que suben (como en iOS) |
| `--t-press` | 140ms | pulsar |
| `--t-hover` | 180ms | pasar el ratón, cambios de color |
| `--t-ui` | 220ms | flechas y X que giran |
| `--t-panel` | 280ms | plegables que se abren |
| `--t-ficha` | 420ms | la hoja del móvil al subir |

**Política de "menos animaciones": fundidos en vez de recorridos, nunca
quieta del todo.** Todo lo que se desplaza vive dentro de
`prefers-reduced-motion: no-preference`. Si el sistema pide menos, nada viaja,
crece ni gira, pero lo que llega sigue apareciendo con un fundido: ficha,
sugerencias, pastilla y avisos en 220ms (la ficha y su velo se van en 160ms);
resumen, filtros, barra pegada y pastilla del mapa en 300ms; filas y tarjetas
en 360ms según llegan a la pantalla, con el mismo escalonado; las rutas de la
búsqueda aparecen ya dibujadas con un fundido de 700ms; el aro del aeropuerto
late solo en opacidad (2400ms) para que la búsqueda dé señales de vida; el mapa
de la ruta entra en 300ms. Los plegables se abren al momento, el mapa no se
desplaza solo, las cifras no cuentan y no hay fundido entre pantallas.

**Ritmo de imagen.** La deriva sola del mapa se repinta a 30 imágenes por
segundo (cabe justa dos veces en 60 Hz, así el paso es regular y gasta menos);
todo lo que mueve el usuario o un viaje (arrastrar, pellizcar, viajar al
aeropuerto) va a la velocidad de la pantalla. Si el mapa sale de la pantalla
deja de derivar.

**Catálogo de movimientos:**
- **Logo:** al llegar, su trazo se dibuja (900ms) y el punto aparece con escala; al pasar el ratón da media vuelta (700ms); mientras busca, el logo de la pastilla da media vuelta en bucle (1100ms) y es el único que gira.
- **Llegada a la portada:** la marca baja 10px y el buscador sube 14px, escalonados (600–700ms, `--ease-expo`). Una vez por visita.
- **Mapa:** aparece con un fundido al cargar; se desplaza solo 2.2° por segundo a 30 imágenes por segundo; al elegir aeropuerto viaja hasta él en 1.3s y se acerca ×2.2. Durante un viaje o un pellizco se amplía el dibujo que ya hay (las costas y fronteras no engordan, y los puntos se rehacen con su radio) y al pararse se redibuja nítido; el punto elegido cae con un rebote de escala y su aro late como un radar (2.2s; 1.1s mientras busca).
- **Rutas de búsqueda:** esperan escondidas a que el mapa termine el viaje que las encuadra y entonces se dibujan de la más cercana a la más lejana en poco más de 1.5s; luego hasta 40 "cometas" (16 en el móvil) naranjas recorren rutas en bucle mientras dura la búsqueda; los destinos aparecen con un fundido.
- **Buscador:** las sugerencias crecen desde el campo (180ms); la pastilla "Consultando…" sube; un error entra con una pequeña sacudida.
- **Resultados:** fundido del navegador entre portada y resultados (320ms); la cifra de vuelos sube desde 0; las filas entran con un ascenso de 10px al llegar a la pantalla, 40ms entre una y otra, con tope en la décima; en el móvil las tarjetas suben 18px y se asientan desde 0.98 de escala (600ms, `--ease-expo`, mismo escalonado de 40ms) y la barra de búsqueda pegada baja a su sitio (520ms); la barra de la nota crece detrás. Solo la primera vez: al filtrar no se repite.
- **Filtros:** el panel se abre a su altura real (rejilla de 0 a 1); la flecha de "Más filtros" gira 180°; el contador late al cambiar.
- **Ficha:** en escritorio entra desde 0.96 con un leve ascenso (300ms) y sale más rápido (180ms); en el móvil sube como hoja (`--t-ficha`, `--ease-drawer`) y baja en 240ms. Dentro, cascada corta (80–280ms): nota, mapa, avisos, secciones. El mapa de la ruta se monta cuando la hoja ya ha subido (380ms): hasta entonces ocupa su sitio un hueco del mismo tamaño y color de mar, y el mapa entra con un fundido de 320ms. La línea de la ruta se dibuja, el destino aparece con una onda, y las barras del desglose crecen una detrás de otra.
- **Hoja arrastrable (móvil):** se coge por la cabecera; sigue al dedo 1:1 hacia abajo y con resistencia hacia arriba; el velo se aclara según se baja. Se cierra si se baja más de 120px o con un tirón rápido, y sigue bajando a la velocidad del dedo: lo que tarda sale de lo que le falta y de lo rápido que iba, entre 160 y 320ms, y el velo se va en el mismo tiempo. Si no, vuelve a su sitio con la curva de hoja (420ms).
- **Pequeños:** "Guardado" entra con un breve desenfoque; el panel del motivo se abre a su altura; el tirador del deslizador crece a 1.15 al cogerlo.

## Do's and Don'ts

### Do:
- **Do** sacar cada color de `--mu-*` o de una mezcla con nombre (`--mu-trazo`, `--txt-*`, `--fila-*`).
- **Do** usar 16px para lo que contiene y 6px para lo que se pulsa.
- **Do** reservar el degradado de atardecer para "Buscar vuelos" y "Ver en Aviasales".
- **Do** poner los precios en terracota a 600, y en `--txt-terracota` sobre la fila señalada.
- **Do** usar el anillo de foco de 2px en `--mu-clay` en todo lo que recibe foco.
- **Do** usar las curvas y duraciones con nombre; lo pulsado responde en `--t-press`.
- **Do** meter cualquier movimiento nuevo dentro de `prefers-reduced-motion: no-preference` y darle su versión reducida como fundido, no como nada.
- **Do** usar `--material` + `--material-filtro` solo en lo que flota sobre contenido en movimiento, y darle su caída opaca en `prefers-reduced-transparency`.
- **Do** acompañar cada color de dato con un número, un icono o texto.
- **Do** dar 44px a cualquier botón que solo tenga icono.

### Don't:
- **Don't** usar gris, gris azulado, blanco puro ni negro, tampoco en sombras.
- **Don't** usar naranja o dorado puros como color de texto sobre crema o arena: usar las mezclas `--txt-*`.
- **Don't** poner texto claro sobre naranja o dorado.
- **Don't** usar radios distintos de 6 y 16px.
- **Don't** hacer translúcidas las tarjetas, la tabla ni la ficha.
- **Don't** extender el degradado de atardecer a fondos, textos o bordes.
- **Don't** volver al globo terráqueo ni a una esfera de partículas: el mapa plano es la decisión (ver `CONTEXTO.md` §9.4).
- **Don't** pedir a Instrument Sans pesos que no están cargados (500, 700).
- **Don't** poner una etiqueta en mayúsculas encima de un título: el texto en mayúsculas espaciadas es el propio título de sección o de columna.
