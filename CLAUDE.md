# muuyal

**Lee `CONTEXTO.md` antes de hacer nada.** Es el manual completo del proyecto:
qué es, cómo se trabaja, todas las columnas de los datos, todas las fórmulas,
todos los umbrales y todos los supuestos. Está escrito para que no haya que
explicar nada al empezar una conversación.

Tres reglas que valen siempre:

1. **No modifiques `CONTEXTO.md`** salvo que el dueño del repo lo pida
   explícitamente. Si crees que algo está desactualizado, dilo en el chat y
   espera instrucciones.
2. **El dueño del repo no programa.** Explica en castellano llano, sin jerga,
   enséñale capturas en vez de código, y no le pidas que ejecute comandos.
3. **Nunca hagas push a `main`.** Trabaja en una rama, abre un PR y déjalo
   listo para que él pulse "Merge". Render despliega solo desde `main`.

**Si te manda un archivo `valoraciones_muuyal_*.csv`** (sus notas a los vuelos,
descargadas de la web), lee `ACTUALIZAR_FORMULA.md`: ahí está paso a paso qué
hacer con él para reajustar los pesos de la puntuación.

**Si te manda un archivo `muuyal_resultados_*.csv`** (los precios de una
búsqueda, descargados de la web), lee `ACTUALIZAR_PRECIOS.md`: ahí está qué
hacer con él para actualizar el precio normal de cada ruta y mes. Son dos
tareas distintas y no se mezclan.
