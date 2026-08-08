# Muuyal — Contexto de marca para el frontend

**Alcance:** aplicar SOLO el logo y la paleta a la página actual (cabecera con
buscador + lista de resultados). **No agregar features ni pantallas nuevas.**
La app tiene un menú de inicio y una lista, nada más.

## Qué es Muuyal
Buscador de destinos de viaje: cruza clima, coste de vida y precio de vuelo.
"muuyal" = *nube* en maya yucateco.

## Dirección visual
Atardecer y tierra. Naranjas, terracotas y marrones cálidos; neutros
crema/arena (nunca gris azulado). La página debe sentirse **envuelta por luz
cálida y dorada**: sin blancos ni grises puros — todos los neutros tienen base
ámbar; sombras marrón cálido translúcido, no negras.

## Archivos del paquete
- `logo/muuyal-logo.svg` — logo final, monocolor terracota (`#B8502D`).
  Escalable; recolorable con `fill`/`stroke` = `currentColor` si se necesita.
  Ratio ~1.5:1. En cabecera usar ~40–56px de alto junto al wordmark "Muuyal".
- `palette.css` — custom properties `--mu-*`. Importar una vez en el root.
- `palette.json` — misma paleta en datos (por si se generan tokens/tema).

## Cómo aplicar a la página actual
- **Fondo de página:** `--mu-cream`. **Tarjetas/paneles y filas:** `--mu-surface`.
- **Texto:** principal `--mu-ink`, secundario `--mu-ink-soft`. Bordes `--mu-border`.
- **Botón "Buscar vuelos" (CTA):** fondo `--mu-orange`, texto `--mu-ink`
  (contraste 4.8:1 AA); hover un paso más oscuro.
- **Tabla de resultados:** cabecera de columnas en `--mu-ink-soft` mayúsculas;
  zebra opcional con `--mu-sand`; línea divisoria `--mu-border`.
- **Precio:** `--mu-terracotta`, peso 600.
- **Badges de COSTE (€…€€€€):** usar la escala `cost` (fondo + texto indicados).
  El número de símbolos € es codificación redundante, no depender solo del color.
- **CLIMA:** temperatura con la rampa `weather`; sol = `--mu-gold`,
  lluvia = `--mu-rain`; **siempre acompañar de icono**, no solo color.
- **Fila seleccionada / hover:** `--mu-selected` con borde `--mu-earth`.
- **Tipografía sugerida:** títulos/wordmark *Bricolage Grotesque* (600/700),
  texto *Instrument Sans*. Si se prefiere solo el stack del sistema, mantener
  jerarquía por peso/tamaño; evitar Inter/Roboto/Arial como voz de marca.

## Accesibilidad (WCAG AA, ya verificado)
Pares seguros para texto normal (≥4.5:1): ink/cream 13.2 · ink/orange 4.8 ·
ink/gold 6.5 · surface/terracotta 4.8 · surface/earth 10.1 · inkSoft/cream 5.1.
Regla: **texto oscuro** sobre gold/orange; **texto crema** sobre terracotta/
earth/dark. La escala de coste es monotónica en luminosidad → legible en
daltonismo. `success` (#6B7F3A, 4.3:1) solo para texto grande o iconos.
