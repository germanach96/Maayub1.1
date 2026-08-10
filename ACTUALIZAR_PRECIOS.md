# Qué hacer cuando llega un `muuyal_resultados_*.csv`

> **Para Claude.** Si el dueño del repo manda un archivo que se llama
> `muuyal_resultados_<ORIGEN>_<GRUPO>_<FECHA>.csv`, esta es la tarea. Léelo
> entero antes de tocar nada. El equivalente para las notas a los vuelos es
> `ACTUALIZAR_FORMULA.md`; son dos cosas distintas y no se mezclan.

---

## Para qué sirve todo esto

Para saber si un vuelo es un chollo hay que compararlo con **lo que cuesta
normalmente esa ruta ese mes**. Hasta ahora la referencia era la mediana de la
propia búsqueda, mezclando todos los meses. Medido sobre
`ejemplo resultado_BCN_Asia.csv`:

```
Bangkok, ida y vuelta:   agosto 660 €   ·   diciembre 840 €
mediana de la búsqueda:  670 €  (mezcla los dos)
```

Con esa referencia, un vuelo a Bangkok en diciembre por 700 € salía como caro
cuando es **de los baratos de diciembre**. La señal medía temporada, no
oportunidad. El maestro de precios lo arregla.

## El flujo, entero

```
él busca en muuyal  →  pulsa "Descargar resultados"  →  te manda el CSV
   →  tú corres el script  →  abres un PR  →  él pulsa Merge
```

La web **nunca escribe nada**. Los archivos entran por PR, como el resto de
maestros del repo.

---

## Los pasos

**1. Guarda el archivo que te ha mandado** en cualquier sitio temporal.

**2. Míralo antes de correr nada.** Comprueba que tiene las columnas
`busqueda_origen`, `id_vuelo`, `tipo_llamada`, `destino`, `mes` y `price`, y
que `busqueda_origen` es un solo aeropuerto. Si no, no sigas: pregúntale.

**3. Enséñale lo que va a pasar, sin escribir nada todavía:**

```bash
python3 precios/actualizar_precios.py ARCHIVO.csv --dry-run
```

**4. Si pinta bien, aplícalo:**

```bash
python3 precios/actualizar_precios.py ARCHIVO.csv
```

Se pueden pasar varios archivos de golpe. Escribe dos archivos por aeropuerto
de origen:

| Archivo | Qué es |
|---|---|
| `precios/precios_BCN.csv` | **El maestro.** Una línea por destino y mes, con el precio de ida y el de vuelta. Es el que lee la web |
| `precios/vuelos_BCN.csv` | La memoria: qué vuelos concretos se han contado ya |

**5. Abre el PR** y cuéntale en castellano llano qué ha cambiado: cuántos
vuelos nuevos han entrado, cuántos ya estaban, y cuántos destinos tienen ya
precio propio. Los números te los da el propio script.

---

## Lo que NO puedes cambiar sin preguntarle

**El identificador de un vuelo.** Es `id_vuelo`, la identidad de contenido que
ya usan las valoraciones: tipo, origen, destino, salida, vuelta, aerolínea y
número.

> ⚠️ **El enlace de Aviasales no vale como identificador**, aunque parezca el
> candidato obvio. Lleva dentro `search_date` (cambia cada día) y
> `expected_price_uuid` (cambia en cada consulta). Comprobado sobre los 9.318
> vuelos del CSV de ejemplo: **9.318 enlaces distintos**. Identificando por
> enlace, el mismo vuelo contaría como nuevo cada vez y los promedios se
> inflarían solos. Si alguien vuelve a proponerlo, que sepa que ya se miró.

**Los redondos no entran.** Un billete de ida y vuelta tiene mes de ida y mes
de vuelta, y pueden ser distintos: no se le puede asignar "su mes" sin mentir.
Se exportan igualmente, por si algún día sirven, pero el maestro solo cuenta
`OW_IDA` y `OW_VUELTA`. Un redondo se sigue puntuando con la mediana del lote.

**Hacen falta 10 vuelos** en una casilla (destino + mes + sentido) para
publicar su precio. Con menos no hay precio normal y preferimos el hueco
declarado. Es el mismo número que `scoring.CHOLLO_MIN_VUELOS`.

**Un origen no toca a otro.** `precios_MEX.csv` no roza `precios_BCN.csv`: el
precio normal de Tokio depende de desde dónde salgas.

---

## Las tres reglas de la fusión

1. **Un vuelo, una línea.** Si ya estaba contado, no se añade otra vez.
2. **Manda el precio más reciente.** Si el mismo vuelo vuelve más caro o más
   barato, se actualiza el suyo en vez de sumar otra observación. Así una ruta
   que él busca mucho no pesa más solo por buscarla mucho.
3. **Reenviar el mismo archivo es inofensivo.** El script avisa si esa búsqueda
   ya estaba metida, y aunque se aplique no cambia nada.

## Media y mediana: están las dos

El maestro guarda `ida_mediana` / `ida_media` (y las de vuelta). **La web usa
la mediana**, porque un solo billete de business de 4.000 € desplaza la media y
no la mediana. La media está al lado porque es la que él pidió y sirve para
comparar de un vistazo si una ruta tiene precios muy dispares.

---

## Qué comprobar antes de decir que funciona

Todo esto se verificó al montarlo, sobre los 9.318 vuelos del CSV de ejemplo,
simulando dos búsquedas que se solapan (Top151 y Asia, con una semana de
diferencia y precios un 10% más altos). Si tocas el script, repítelo:

| Comprobación | Resultado esperado |
|---|---|
| Vuelos repetidos entre las dos búsquedas | La memoria es **exactamente la unión**, ni uno de más |
| El mismo vuelo con precio nuevo | Se actualiza (3.743 de 3.743), no se suma |
| Medianas y medias del maestro | Calculadas aparte, **0 discrepancias** |
| Casillas con menos de 10 vuelos | Ninguna publicada |
| Redondos en la memoria | Ninguno |
| Reenviar el mismo CSV | Archivos byte a byte idénticos |
| Otro origen | `precios_BCN.csv` intacto |
| Nota con el maestro vacío | **9.318 de 9.318 idénticas** a las de antes |

Esa última fila es la importante: mientras el maestro se llena, la web puntúa
exactamente igual que hoy. Esto no puede empeorar nada.

---

## Lo que hay que decirle, y no callarse

- **Es una bola de nieve.** Los primeros envíos no cambian casi nada.
- **Solo se llena de lo que busca.** Si siempre prueba con `Africa / Oceania`,
  tendrá Oceanía perfecta y Europa vacía.
- **Los meses lejanos van a costar.** Aviasales guarda muchos vuelos del mes que
  viene y poquísimos de dentro de diez. Medido en sus datos: 2.530 vuelos para
  agosto y 90 para abril. Esos meses tardarán mucho, o no se llenarán.
- **El precio envejece.** Cada línea del maestro lleva su fecha `actualizado`.
