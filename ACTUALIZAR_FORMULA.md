# Cómo actualizar la fórmula de puntuación con las valoraciones del dueño

> **Para quién es esto:** para la conversación de Claude (o quien sea) a la que
> el dueño del repo le manda un archivo `valoraciones_muuyal_AAAA-MM-DD.csv`.
> Si acabas de recibir uno de esos archivos, o te han dicho "actualiza la
> fórmula / los pesos / el scoring", **estas son tus instrucciones**. Síguelas
> enteras y en orden.

## 0. Antes de nada

1. Lee `CONTEXTO.md` (el manual del proyecto) y `CLAUDE.md`. Mandan sobre este
   archivo en todo lo que sea convención de trabajo.
2. **No edites `CONTEXTO.md`.**
3. **Nunca hagas push a `main`.** Trabaja en una rama, abre un PR y déjalo listo
   para que él pulse "Merge".
4. **El dueño no programa.** Todo lo que le expliques, en castellano llano.
5. Esta tarea **solo toca el bloque de pesos de `backend/scoring.py` y el CSV
   maestro**. No toques `enrichment.py`, ni los filtros, ni cómo se normaliza
   cada señal.

## 1. De dónde sale el archivo que te mandan

En la web, al pulsar un vuelo se abre su ficha, y ahí hay una barra de 0 a 100
para puntuarlo (la misma escala que la nota de muuyal, para poder compararlas
de un vistazo). Esas notas se guardan **en su navegador** (no en el servidor:
el disco de Render se borra al dormirse). Cuando pulsa **"Descargar mis
valoraciones"** se baja un CSV con una fila por vuelo valorado, y ese es el
archivo que te manda.

Cada fila lleva su nota **y los números del vuelo tal y como estaban en el
momento de valorarlo**. Eso es lo que permite reajustar los pesos sin volver a
buscar nada: el "chollo" depende de la búsqueda concreta en la que salió el
vuelo y no se puede reconstruir después.

Columnas que importan:

| Columna | Qué es |
|---|---|
| `nota_usuario` | **Su nota, de 0 a 100. Es lo que hay que aprender a predecir.** |
| `score_muuyal` | La nota 0–100 que le puso la fórmula en ese momento |
| `norm_<señal>` | Valor normalizado (0–1) de cada señal en ese vuelo. Vacío = señal neutra ahí |
| `peso_<señal>` | El peso que tenía esa señal cuando valoró |
| `id_vuelo` | Identifica la oferta; sirve para no duplicar |
| `fecha_valoracion` | Si el mismo vuelo se valoró dos veces, gana la más reciente |

El resto de columnas (precio, clima, coste, turismo, UNESCO, enlace…) están
para poder revisar casos a mano y para futuros análisis.

## 2. Junta el archivo con el maestro y mira qué dicen los datos

En el repo hay un archivo maestro con **todas** las valoraciones acumuladas:
`valoraciones/valoraciones_maestro.csv`. El script hace la mezcla, quita
repetidos y propone pesos nuevos:

```bash
pip install -r backend/requirements.txt        # si hiciera falta
python3 valoraciones/ajustar_pesos.py ruta/al/valoraciones_muuyal_AAAA-MM-DD.csv
```

El script:

- reescribe `valoraciones/valoraciones_maestro.csv` con todo junto y sin
  duplicados (usa `--solo-informe` si quieres verlo sin escribir);
- imprime los pesos actuales frente a los propuestos;
- dice **si predice mejor de verdad**, midiéndolo sobre un 25% de valoraciones
  que no se han usado para ajustar (si no mejora ahí, no vale de nada);
- avisa de las señales de las que no fiarse (pocos datos, casi sin variación,
  o que el ajuste querría apagar del todo).

**Cómo funciona el ajuste, por si tienes que defenderlo:** busca los pesos
`w ≥ 0` que minimizan la diferencia entre `nota_usuario` y la fórmula real
`100 × Σ w·valor ÷ Σ w_con_dato`. Como es un cociente (las señales sin dato
reparten su peso), no se resuelve de un tirón: se repite un ajuste lineal
fijando el denominador con los pesos de la vuelta anterior hasta que deja de
moverse. Con pocas valoraciones el ajuste tira hacia los pesos actuales, para
no dar bandazos con cuatro datos.

## 3. Cuándo NO hay que cambiar nada

Dilo claramente en vez de tocar los pesos igualmente:

- **Menos de 40 valoraciones.** Hay 12 pesos que estimar; con menos datos que
  eso, el ajuste es ruido. El script se planta solo.
- **Sus notas casi no varían** (todo 70 y 80). Si no distingue, no hay nada que
  aprender: pídele que valore también vuelos que le parezcan malos.
- **La predicción no mejora** sobre las valoraciones reservadas. Mejor quedarse
  como está.
- **Todas las valoraciones vienen de una sola búsqueda.** Los pesos saldrían
  ajustados a ese origen y esa zona. Avísale y pídele valoraciones de otras
  búsquedas.

## 4. Aplica los pesos

Si el informe da luz verde, edita **solo** el diccionario `PESOS` del bloque de
configuración de `backend/scoring.py`. Nada más de ese archivo.

**No cambies por tu cuenta** `DIR_POPULARIDAD`, `DIR_TEMPORADA`, `TEMP_IDEAL`,
`CHOLLO_MIN_VUELOS` ni ningún otro umbral: son gustos suyos, no resultados del
ajuste. Si los datos sugieren que una dirección está al revés (el ajuste quiere
apagar una señal que él dijo que le importaba), **pregúntaselo**, no lo decidas.

Después:

```bash
python3 -c "from backend import scoring; print(sum(p for p in scoring.PESOS.values() if p>0))"
```

Los pesos no tienen por qué sumar 100 (la nota se normaliza sola), pero
mantenerlos en 100 hace que se lean como porcentajes. Si has tocado el
frontend —cosa que aquí no hace falta— hay que reconstruir y committear
`frontend/dist`.

Comprueba que la puntuación sigue funcionando con el CSV de ejemplo, sin token
(patrón del §10.1 de `CONTEXTO.md`), y mira que la distribución de notas siga
teniendo sentido (que no se aplasten todas en el mismo valor).

## 5. Qué contarle en el PR

En castellano llano y sin jerga:

- cuántas valoraciones suyas se han usado y de cuántas búsquedas;
- **qué pesos suben y cuáles bajan**, y qué significa eso en cristiano
  ("ahora te pesa más el clima y menos que el vuelo sea corto");
- cuánto mejora la predicción de sus notas (el número de antes y el de después);
- de qué **no** fiarse: señales con pocos datos o que apenas varían;
- si hay alguna decisión que tenga que tomar él (una dirección que parece del
  revés, una señal que el ajuste apaga del todo).

Y recuérdale que el maestro `valoraciones/valoraciones_maestro.csv` queda
actualizado en el repo con todas sus valoraciones acumuladas, así que puede
seguir valorando y volver a mandar el archivo cuando quiera.

## 6. Lo que nunca hay que hacer

- Inventar valoraciones o rellenar notas que él no ha puesto.
- Borrar filas del maestro (salvo duplicados exactos del mismo `id_vuelo`).
- Cambiar cómo se normaliza una señal para que "cuadre" mejor el ajuste.
- Tocar `enrichment.py`, los filtros o la paginación.
- Hacer push a `main` o fusionar el PR tú.
