"""Reajusta los pesos de la puntuación a partir de las valoraciones manuales.

Uso (desde la raíz del repo):

    python3 valoraciones/ajustar_pesos.py ruta/al/valoraciones_muuyal_AAAA-MM-DD.csv

Qué hace:
  1. Junta el CSV (o CSVs) que le pases con `valoraciones/valoraciones_maestro.csv`,
     quitando repetidos: si el mismo vuelo se valoró dos veces, gana la más
     reciente.
  2. Busca los pesos que mejor reproducen las notas del dueño del repo.
  3. Imprime un informe: pesos actuales vs. propuestos, cuánto mejora la
     predicción y de qué NO fiarse.

NO toca `backend/scoring.py`: los pesos los aplica una persona (o Claude)
después de leer el informe. Ver `ACTUALIZAR_FORMULA.md`.

Opciones:
  --solo-informe   no reescribe el maestro (útil para probar)
"""

import sys
from pathlib import Path

import numpy as np
import pandas as pd

RAIZ = Path(__file__).resolve().parent.parent
MAESTRO = RAIZ / "valoraciones" / "valoraciones_maestro.csv"
SEP = ";"

# Con menos valoraciones que esto, ajustar los pesos es inventar: hay 12
# señales que estimar. Se informa igual, pero no se propone cambio.
MIN_VALORACIONES = 40
# Por debajo de este número el ajuste tira mucho hacia los pesos actuales
# (regularización fuerte); por encima, se deja hablar a los datos.
SUELTA_DEL_TODO = 150
# Porcentaje de valoraciones que se reserva para medir si mejora de verdad.
RESERVA = 0.25

# Motivos por los que el dueño corrige la nota de muuyal. Los que NO apuntan a
# ninguna señal son cosas que la fórmula no puede saber jamás (que le apetezca
# ese destino, que las fechas le vengan bien, que ya haya estado). Esas
# valoraciones se dejan FUERA del ajuste: no hay nada que aprender de ellas y
# solo meterían ruido. Siguen guardadas en el maestro, eso sí.
MOTIVOS = {
    # --- suben la nota ---
    "destino_me_atrae":     [],
    "precio_chollo":        ["oportunidad", "price_abs"],
    "clima_ideal":          ["temp_media", "horas_sol_dia", "dias_lluvia"],
    "barato_alli":          ["indice_coste"],
    "mucho_que_ver":        ["unesco_100km"],
    "poco_turistico":       ["popularidad_0_100", "turismo_idx"],
    "vuelo_comodo":         ["duration", "transfers"],
    "fechas_bien":          [],
    # --- bajan la nota ---
    "destino_no_interesa":  [],
    "ya_estuve":            [],
    "caro_para_lo_que_es":  ["oportunidad", "price_abs"],
    "clima_malo":           ["temp_media", "horas_sol_dia", "dias_lluvia"],
    "caro_alli":            ["indice_coste"],
    "masificado":           ["popularidad_0_100", "turismo_idx"],
    "vuelo_incomodo":       ["duration", "transfers"],
    "precio_dudoso":        ["antiguedad_en_dias"],
    "fechas_mal":           [],
    "otro":                 [],
}


def leer(ruta):
    return pd.read_csv(ruta, sep=SEP, encoding="utf-8-sig", dtype=str,
                       keep_default_na=False, na_values=[""])


def juntar(nuevos):
    """Maestro + CSVs nuevos, sin repetidos (gana la valoración más reciente)."""
    partes = []
    if MAESTRO.exists():
        m = leer(MAESTRO)
        if len(m):
            partes.append(m)
    for r in nuevos:
        partes.append(leer(r))
    if not partes:
        raise SystemExit("No hay ninguna valoración que juntar.")
    todo = pd.concat(partes, ignore_index=True, sort=False)
    antes = len(todo)
    todo = (todo.sort_values("fecha_valoracion")
                .drop_duplicates(subset="id_vuelo", keep="last")
                .reset_index(drop=True))
    return todo, antes


def señales_de(df):
    """Nombres de las señales presentes en el CSV, en orden estable."""
    return [c[len("norm_"):] for c in df.columns if c.startswith("norm_")]


def pesos_actuales(df, señales):
    """Los pesos con los que se calculó la nota, tal y como quedaron
    guardados en cada valoración (la última manda)."""
    out = {}
    for s in señales:
        col = pd.to_numeric(df.get(f"peso_{s}"), errors="coerce").dropna()
        out[s] = float(col.iloc[-1]) if len(col) else 0.0
    return out


def utilizables(df):
    """Máscara de las valoraciones que SÍ se pueden usar para ajustar.

    Se caen las que el dueño corrigió por un motivo que la fórmula no mira
    (le apetece ese destino, las fechas, ya estuvo allí, "otro"): por mucho que
    se muevan los pesos, esa nota no se puede reproducir con los datos que hay.
    """
    if "motivo" not in df.columns:
        return pd.Series(True, index=df.index)
    motivo = df["motivo"].fillna("")
    fuera = [m for m, s in MOTIVOS.items() if not s]
    return ~motivo.isin(fuera)


def matriz(df, señales):
    """X (valores normalizados, NaN = señal neutra) e y (nota 0–100).

    La nota del dueño ya viene de 0 a 100, la misma escala que la de muuyal:
    se comparan directamente, sin convertir nada."""
    X = np.column_stack([pd.to_numeric(df[f"norm_{s}"], errors="coerce").to_numpy()
                         for s in señales])
    y = pd.to_numeric(df["nota_usuario"], errors="coerce").to_numpy()
    ok = ~np.isnan(y)
    return X[ok], y[ok]


def informe_motivos(df, señales, actuales, nuevos):
    """Qué dicen los motivos y si el ajuste les da la razón.

    Si el dueño sube la nota diciendo "el clima", el peso del clima debería
    subir. Si el ajuste hace lo contrario, no se aplica a ciegas: se avisa.
    """
    if "motivo" not in df.columns:
        return
    usados = df[df["motivo"].fillna("") != ""]
    if usados.empty:
        print("\nNo hay ningún motivo apuntado todavía.")
        return

    print("\nPor qué corriges la nota")
    cuenta = usados["motivo"].value_counts()
    for motivo, n in cuenta.items():
        etiqueta = (usados.loc[usados["motivo"] == motivo, "motivo_texto"].iloc[0]
                    if "motivo_texto" in usados.columns else motivo)
        cuenta_señales = MOTIVOS.get(motivo, [])
        marca = "" if cuenta_señales else "   (la fórmula no puede saberlo: fuera del ajuste)"
        print(f"  {n:>4} × {etiqueta}{marca}")

    print("\n¿El ajuste le da la razón a tus motivos?")
    # Para cada señal: cuántas veces pediste subirla y cuántas bajarla.
    votos = {s: [0, 0] for s in señales}
    for _, fila in usados.iterrows():
        for s in MOTIVOS.get(fila["motivo"], []):
            if s in votos:
                votos[s][0 if fila.get("motivo_sentido") == "sube" else 1] += 1
    algo = False
    for s, (sube, baja) in votos.items():
        if sube + baja < 3:
            continue
        algo = True
        pedido = "subir" if sube > baja else "bajar" if baja > sube else "ni fu ni fa"
        hizo = ("sube" if nuevos[s] > actuales[s] else
                "baja" if nuevos[s] < actuales[s] else "no la mueve")
        encaja = ((pedido == "subir" and nuevos[s] > actuales[s]) or
                  (pedido == "bajar" and nuevos[s] < actuales[s]))
        print(f"  {s:<22} pediste {pedido:<11} ({sube}↑ {baja}↓) · el ajuste la "
              f"{hizo:<11} {'✓' if encaja else '⚠ no encaja'}")
    if not algo:
        print("  (aún no hay ninguna señal con 3 motivos o más; hacen falta más "
              "valoraciones para poder cruzarlo)")


def predecir(X, w):
    """Misma fórmula que scoring.py: 100 × Σ peso×valor ÷ Σ pesos con dato."""
    presente = ~np.isnan(X)
    Xz = np.nan_to_num(X)
    num = Xz @ w
    den = presente @ w
    with np.errstate(divide="ignore", invalid="ignore"):
        return np.where(den > 0, 100 * num / den, np.nan)


def ajustar(X, y, w0, lam):
    """Pesos >= 0 que mejor reproducen las notas, sin alejarse de los actuales
    más de lo que digan los datos (`lam` = cuánto tira hacia `w0`).

    La nota es un cociente (se reparte el peso de las señales sin dato), así
    que no se puede resolver de un tirón: se repite un ajuste lineal fijando
    el denominador con los pesos de la vuelta anterior, hasta que deja de
    moverse. Con 12 incógnitas converge en pocas vueltas.
    """
    presente = ~np.isnan(X)
    Xz = np.nan_to_num(X)
    w = w0.copy()
    for _ in range(60):
        den = presente @ w
        den = np.where(den > 0, den, 1.0)
        objetivo = y * den / 100.0          # y ≈ 100·Xw/den  ->  y·den/100 ≈ Xw
        w_nuevo = _minimos_cuadrados_positivos(Xz, objetivo, w0, lam, w)
        if np.max(np.abs(w_nuevo - w)) < 1e-4:
            w = w_nuevo
            break
        w = w_nuevo
    return w


def _minimos_cuadrados_positivos(X, y, w0, lam, inicio, iters=4000):
    """min ||Xw - y||² + lam·||w - w0||²  con w >= 0 (descenso proyectado)."""
    A = X.T @ X + lam * np.eye(X.shape[1])
    b = X.T @ y + lam * w0
    paso = 1.0 / (np.linalg.eigvalsh(A).max() + 1e-9)
    w = np.maximum(inicio, 0)
    for _ in range(iters):
        w_next = np.maximum(w - paso * (A @ w - b), 0)
        if np.max(np.abs(w_next - w)) < 1e-9:
            return w_next
        w = w_next
    return w


def a_enteros_que_suman_100(w, señales):
    """Escala a suma 100 y redondea, cuadrando el resto en la señal más gorda."""
    total = w.sum()
    if total <= 0:
        return {s: 0 for s in señales}
    esc = w * 100 / total
    ent = np.floor(esc).astype(int)
    resto = 100 - ent.sum()
    for i in np.argsort(-(esc - ent))[:max(resto, 0)]:
        ent[i] += 1
    return dict(zip(señales, ent.tolist()))


def correlacion(a, b):
    ok = ~(np.isnan(a) | np.isnan(b))
    if ok.sum() < 3:
        return float("nan")
    return float(np.corrcoef(a[ok], b[ok])[0, 1])


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    solo_informe = "--solo-informe" in sys.argv

    todo, antes = juntar([Path(a) for a in args])
    señales = señales_de(todo)
    if not señales:
        raise SystemExit("El CSV no trae columnas norm_*: no se puede ajustar.")

    print(f"Valoraciones: {len(todo)} únicas (de {antes} filas leídas)")
    print(f"Señales en juego: {len(señales)}")

    if not solo_informe:
        todo.to_csv(MAESTRO, sep=SEP, index=False, encoding="utf-8-sig",
                    lineterminator="\r\n")
        print(f"Maestro actualizado: {MAESTRO.relative_to(RAIZ)}")

    # Fuera las corregidas por algo que la fórmula no puede aprender.
    sirven = utilizables(todo)
    descartadas = int((~sirven).sum())
    X, y = matriz(todo[sirven], señales)
    print(f"Valoraciones utilizables: {len(y)}")
    if descartadas:
        print(f"  ({descartadas} apartadas del cálculo: las corregiste por algo "
              f"que la fórmula no mira. Siguen guardadas en el maestro.)")

    actuales = pesos_actuales(todo, señales)
    w0 = np.array([actuales[s] for s in señales], dtype=float)

    print("\nNotas del dueño (sobre 100): "
          f"media={y.mean():.0f}  min={y.min():.0f}  max={y.max():.0f}  "
          f"desviación={y.std():.1f}")
    if y.std() < 5:
        print("  ⚠ Las notas casi no varían: con todo puntuado parecido no hay "
              "de dónde sacar los pesos. Hacen falta valoraciones repartidas.")

    if len(y) < MIN_VALORACIONES:
        print(f"\n⚠ Solo hay {len(y)} valoraciones y hacen falta al menos "
              f"{MIN_VALORACIONES} para ajustar 12 pesos sin inventar.")
        print("  No se propone ningún cambio. Sigue valorando vuelos.")
        return

    # Cuanto menos datos, más se agarra a los pesos actuales.
    lam = max(0.0, (SUELTA_DEL_TODO - len(y)) / SUELTA_DEL_TODO) * len(y) * 0.5

    rng = np.random.default_rng(0)
    orden = rng.permutation(len(y))
    corte = int(len(y) * (1 - RESERVA))
    tr, te = orden[:corte], orden[corte:]

    w_tr = ajustar(X[tr], y[tr], w0, lam)
    antes_te = correlacion(predecir(X[te], w0), y[te])
    despues_te = correlacion(predecir(X[te], w_tr), y[te])

    w = ajustar(X, y, w0, lam)
    nuevos = a_enteros_que_suman_100(w, señales)

    print("\n¿Predice mejor? (sobre el 25% de valoraciones que NO se usaron para ajustar)")
    print(f"  correlación con los pesos actuales:   {antes_te:+.2f}")
    print(f"  correlación con los pesos propuestos: {despues_te:+.2f}")
    if not (despues_te > antes_te + 0.02):
        print("  ⚠ No mejora de forma clara. Mejor NO cambiar los pesos todavía.")

    print("\nPesos (actual → propuesto)")
    print(f"  {'señal':<22} {'ahora':>6} {'nuevo':>6}   {'variación de esa señal':<22}")
    for i, s in enumerate(señales):
        col = X[:, i]
        var = np.nanstd(col)
        con_dato = int((~np.isnan(col)).sum())
        aviso = ""
        if con_dato < len(y) * 0.3:
            aviso = "pocos vuelos con este dato"
        elif var < 0.05:
            aviso = "casi no varía: su peso es poco fiable"
        print(f"  {s:<22} {actuales[s]:>6.0f} {nuevos[s]:>6}   {aviso:<22}")
        if actuales[s] >= 4 and nuevos[s] == 0 and var >= 0.05:
            print("      ↳ el ajuste la apaga del todo. O no le importa, o su "
                  "DIRECCIÓN está al revés: pregúntaselo antes de tocarla.")

    informe_motivos(todo, señales, actuales, nuevos)

    print("\nQué hacer ahora: ver ACTUALIZAR_FORMULA.md (paso 4 en adelante).")


if __name__ == "__main__":
    main()
