import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { MapaMundo, MapaRuta } from "./mapas";

// Colores de la paleta de marca. Cada par cumple el contraste AA indicado en
// handoff/CONTEXT.md: texto oscuro sobre naranja, texto crema sobre
// terracota y tierra.
const TIPOS = {
  OW_IDA: { label: "Ida", color: "var(--mu-orange)", texto: "var(--mu-ink)" },
  OW_VUELTA: { label: "Vuelta", color: "var(--mu-earth)", texto: "var(--mu-surface)" },
  RD: { label: "Ida y vuelta", color: "var(--mu-terracotta)", texto: "var(--mu-surface)" },
};

const GAP_LABELS = {
  coste: "coste",
  turismo: "turismo",
  turismo_mes: "turismo/mes",
  clima: "clima",
  unesco: "unesco",
};

// Avisos sobre la fiabilidad de la nota (los pone backend/scoring.py). En la
// lista se enseña la versión corta, para no comerse el ancho de la tabla; la
// explicación entera sale al pasar el ratón y en la ficha del vuelo.
const FLAG_LABELS = {
  chollo_pocos_datos: "chollo: pocos datos",
  temporada_no_fiable: "temporada dudosa",
  datos_incompletos: "datos incompletos",
};

const FLAG_TITULOS = {
  chollo_pocos_datos: "pocos vuelos a ese destino para saber si es chollo",
  temporada_no_fiable: "temporada poco fiable (ciudad grande)",
  datos_incompletos: "puntuación calculada con datos incompletos",
};

// Nombre en castellano llano de cada señal de la puntuación. El backend manda
// los nombres técnicos en meta.score_senales; aquí se traducen para el
// desglose que se ve al abrir un vuelo.
const SENAL_LABELS = {
  oportunidad: "Chollo: más barato de lo normal para ese destino",
  price_abs: "Precio bajo",
  popularidad_0_100: "Destino conocido",
  turismo_idx: "Temporada alta allí",
  temp_media: "Temperatura agradable",
  indice_coste: "Vida barata en el destino",
  horas_sol_dia: "Horas de sol",
  dias_lluvia: "Pocos días de lluvia",
  unesco_100km: "Patrimonio UNESCO cerca",
  duration: "Vuelo corto",
  transfers: "Pocas escalas",
  antiguedad_en_dias: "Precio reciente",
  distancia_km: "Destino cercano",
  temp_max_media: "Máximas agradables",
  unesco_cercano_km: "UNESCO muy cerca",
  precip_mm: "Poca lluvia acumulada",
  duration_to: "Ida corta",
  duration_back: "Vuelta corta",
  return_transfers: "Pocas escalas de vuelta",
};

// Cuando tu nota se separa de la de muuyal por esto o más, se te pregunta por
// qué. Por debajo se entiende que estás de acuerdo y no se pregunta nada.
const DIFERENCIA_MOTIVO = 10;

// Motivos por los que corriges la nota. El `senales` de cada uno dice con qué
// parte de la fórmula tiene que ver; lista vacía = algo que la fórmula no
// puede saber (y que por eso el ajustador de pesos deja fuera del cálculo).
const MOTIVOS_SUBE = [
  { id: "destino_me_atrae", texto: "Ese destino me llama, mire lo que mire", senales: [] },
  { id: "precio_chollo", texto: "Está muy bien de precio para ese destino",
    senales: ["oportunidad", "price_abs"] },
  { id: "clima_ideal", texto: "El clima de ese mes es el que busco",
    senales: ["temp_media", "horas_sol_dia", "dias_lluvia"] },
  { id: "barato_alli", texto: "Allí se vive barato", senales: ["indice_coste"] },
  { id: "mucho_que_ver", texto: "Hay mucho que ver cerca", senales: ["unesco_100km"] },
  { id: "poco_turistico", texto: "Es poco turístico, y eso me gusta",
    senales: ["popularidad_0_100", "turismo_idx"] },
  { id: "vuelo_comodo", texto: "El vuelo es cómodo: corto o sin escalas",
    senales: ["duration", "transfers"] },
  { id: "fechas_bien", texto: "Las fechas me vienen bien", senales: [] },
  { id: "otro", texto: "Otro motivo", senales: [] },
];

const MOTIVOS_BAJA = [
  { id: "destino_no_interesa", texto: "Ese destino no me interesa", senales: [] },
  { id: "ya_estuve", texto: "Ya he estado y no quiero repetir", senales: [] },
  { id: "caro_para_lo_que_es", texto: "Caro para lo que es",
    senales: ["oportunidad", "price_abs"] },
  { id: "clima_malo", texto: "El clima de ese mes no me convence",
    senales: ["temp_media", "horas_sol_dia", "dias_lluvia"] },
  { id: "caro_alli", texto: "Estar allí sale caro", senales: ["indice_coste"] },
  { id: "masificado", texto: "Demasiado turístico o masificado",
    senales: ["popularidad_0_100", "turismo_idx"] },
  { id: "vuelo_incomodo", texto: "El vuelo es incómodo: largo, con escalas o a malas horas",
    senales: ["duration", "transfers"] },
  { id: "precio_dudoso", texto: "No me fío de ese precio", senales: ["antiguedad_en_dias"] },
  { id: "fechas_mal", texto: "Las fechas no me vienen bien", senales: [] },
  { id: "otro", texto: "Otro motivo", senales: [] },
];

const PAGE_SIZE = 50;

// Dónde guarda el navegador tus valoraciones. Quedan en este dispositivo:
// no se pierden aunque el servidor se duerma, y salen del navegador solo
// cuando pulsas "Descargar mis valoraciones".
// v2 = tu nota va de 0 a 100, igual que la de muuyal. En v1 iba de 0 a 10;
// las que estuvieran guardadas así se convierten solas al abrir la página.
const LS_VALORACIONES = "muuyal_valoraciones_v2";
const LS_VALORACIONES_V1 = "muuyal_valoraciones_v1";

// Nombre del país en español a partir del código ISO ("ES" -> "España").
// Lo resuelve el propio navegador; si no soporta la API, se enseña el código.
const NOMBRES_PAIS = (() => {
  try {
    const dn = new Intl.DisplayNames(["es"], { type: "region" });
    return (c) => (c ? dn.of(c) || c : "");
  } catch {
    return (c) => c || "";
  }
})();

function num(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

// Filtros de rango: se declaran una vez y la interfaz se dibuja sola a partir
// de aquí. `get` extrae el valor de un vuelo (null = ese vuelo no tiene dato).
const RANGOS = [
  { id: "precio", grupo: "Vuelo", label: "Precio", unidad: "€", paso: 10,
    get: (f) => num(f.price) },
  { id: "duracion", grupo: "Vuelo", label: "Duración", unidad: "h", paso: 1,
    get: (f) => (num(f.duration) == null ? null : num(f.duration) / 60) },
  { id: "escalas", grupo: "Vuelo", label: "Escalas", unidad: "", paso: 1,
    get: (f) => num(f.transfers) },
  { id: "distancia", grupo: "Vuelo", label: "Distancia", unidad: "km", paso: 500,
    get: (f) => num(f.distancia_km) },
  // Único filtro de tipo fecha: se compara como texto AAAA-MM-DD, que ordena
  // igual que la fecha real y no depende de la zona horaria del navegador.
  { id: "salida", grupo: "Vuelo", label: "Fecha de salida", tipo: "fecha",
    get: (f) => (typeof f.departure_at === "string" && f.departure_at.length >= 10
      ? f.departure_at.slice(0, 10) : null) },
  { id: "temp", grupo: "Clima del mes de salida", label: "Temperatura media", unidad: "°C", paso: 1,
    get: (f) => num(f.enrichment?.clima?.temp_media) },
  { id: "sol", grupo: "Clima del mes de salida", label: "Horas de sol al día", unidad: "h", paso: 1,
    get: (f) => num(f.enrichment?.clima?.horas_sol_dia) },
  { id: "lluvia", grupo: "Clima del mes de salida", label: "Días de lluvia al mes", unidad: "d", paso: 1,
    get: (f) => num(f.enrichment?.clima?.dias_lluvia) },
  { id: "popularidad", grupo: "Destino", label: "Popularidad", unidad: "/100", paso: 5,
    get: (f) => num(f.enrichment?.turismo?.popularidad_0_100) },
  { id: "estacional", grupo: "Destino", label: "Índice turístico del mes", unidad: "×", paso: 0.1,
    get: (f) => num(f.enrichment?.turismo_mes?.turismo_idx) },
  { id: "coste", grupo: "Destino", label: "Índice de coste", unidad: "", paso: 5,
    get: (f) => num(f.enrichment?.coste?.indice_coste) },
  { id: "unesco", grupo: "Destino", label: "Sitios UNESCO (100 km)", unidad: "", paso: 1,
    get: (f) => num(f.enrichment?.unesco?.unesco_100km) },
];

const GRUPOS_RANGO = ["Vuelo", "Clima del mes de salida", "Destino"];

function fmtFecha(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDuracion(min) {
  if (min == null || min === "") return "—";
  const m = Number(min);
  if (isNaN(m)) return "—";
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

function fmtNum(v, dec = 0, suffix = "") {
  if (v == null || v === "" || isNaN(Number(v))) return "—";
  return Number(v).toFixed(dec) + suffix;
}

// "2026-07-07" -> "07 jul 2026". Se construye la fecha en horario local para
// que no se desplace un día en zonas horarias negativas.
function fmtDia(d) {
  if (!d) return "—";
  const [y, m, dd] = String(d).split("-");
  if (!y || !m || !dd) return d;
  return new Date(Number(y), Number(m) - 1, Number(dd))
    .toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

// Antigüedad del precio: los precios de Aviasales salen de su caché, y
// `dia_busqueda` es el día en que ese precio se guardó. Cuanto más viejo,
// menos fiable. Se compara contra la fecha de la consulta (la da el backend).
function diasCache(f, fechaConsulta) {
  if (!f.dia_busqueda || !fechaConsulta) return null;
  const guardado = Date.parse(f.dia_busqueda + "T00:00:00Z");
  const consulta = Date.parse(fechaConsulta + "T00:00:00Z");
  if (isNaN(guardado) || isNaN(consulta)) return null;
  return Math.max(0, Math.round((consulta - guardado) / 86400000));
}

function nivelCache(dias) {
  if (dias == null) return "";
  if (dias <= 1) return "fresco";
  if (dias <= 3) return "medio";
  return "viejo";
}

function textoCache(dias) {
  if (dias == null) return "—";
  if (dias === 0) return "hoy";
  if (dias === 1) return "ayer";
  return `hace ${dias} días`;
}

function Frescura({ f, fechaConsulta, chip = false }) {
  const dias = diasCache(f, fechaConsulta);
  if (dias == null) return <span className="muted">—</span>;
  return (
    <span
      className={(chip ? "chip cache " : "cache ") + nivelCache(dias)}
      title={`Aviasales guardó este precio el ${fmtDia(f.dia_busqueda)}`}
    >
      {chip ? "precio " : ""}{textoCache(dias)}
    </span>
  );
}

function Cronometro({ desde }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const s = Math.floor((Date.now() - desde) / 1000);
  return <span>{Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}</span>;
}

function GapsBadges({ gaps }) {
  if (!gaps || gaps.length === 0) return null;
  return (
    <span className="gaps">
      {gaps.map((g) => (
        <span key={g} className="gap-badge" title={`Sin datos de ${GAP_LABELS[g] || g}`}>
          sin {GAP_LABELS[g] || g}
        </span>
      ))}
    </span>
  );
}

function TipoBadge({ tipo }) {
  const t = TIPOS[tipo] || { label: tipo, color: "var(--mu-ink-soft)", texto: "var(--mu-surface)" };
  return (
    <span className="tipo-badge" style={{ background: t.color, color: t.texto }}>
      {t.label}
    </span>
  );
}

// Rampa de temperatura de la paleta. Los cortes siguen los cuartiles reales
// del CSV de clima (11.6 / 19.0 / 25.5 °C).
function nivelTemp(t) {
  if (t == null) return null;
  if (t < 12) return "frio";
  if (t < 19) return "templado";
  if (t < 26) return "calido";
  return "calor";
}

function Clima({ c }) {
  if (!c) return <span className="muted">—</span>;
  const nivel = nivelTemp(num(c.temp_media));
  return (
    <span className="clima">
      <span className={"temp " + (nivel || "")}>🌡 {fmtNum(c.temp_media, 0, "°")}</span>
      {" · "}
      <span className="lluvia">☔ {fmtNum(c.dias_lluvia, 0)}d</span>
      {" · "}
      <span className="sol">☀ {fmtNum(c.horas_sol_dia, 1)}h</span>
    </span>
  );
}

// Escala de coste de la paleta. El número de símbolos € ya distingue los
// niveles por sí solo, así que el color es información redundante (y por eso
// sigue leyéndose bien en daltonismo).
function Coste({ c }) {
  if (!c) return <span className="muted">—</span>;
  return (
    <>
      <span className={"coste-badge n" + String(c.categoria || "").length}>
        {c.categoria}
      </span>
      <span className="muted small"> {fmtNum(c.indice_coste, 0)}</span>
    </>
  );
}

// ---------------------------------------------------------------------------
// Puntuación (la calcula backend/scoring.py; aquí solo se pinta)
// ---------------------------------------------------------------------------

// Tramos de la nota. El color acompaña al número, nunca lo sustituye.
function nivelNota(s) {
  if (s == null) return "";
  if (s >= 65) return "n4";
  if (s >= 50) return "n3";
  if (s >= 35) return "n2";
  return "n1";
}

function Nota({ score, chip = false }) {
  if (score == null) {
    return <span className="muted" title="Sin datos suficientes para puntuar">—</span>;
  }
  return (
    <span className={(chip ? "chip nota " : "nota ") + nivelNota(score)}>
      <b>{score}</b>
      <span className="nota-de">/100</span>
      {!chip && (
        <span className="nota-barra" aria-hidden="true">
          <span style={{ width: `${score}%` }} />
        </span>
      )}
    </span>
  );
}

// Recompone el desglose legible. El backend manda los valores sueltos
// (`score_desglose`) y la leyenda una sola vez (`meta.score_senales`), para no
// repetir los nombres de las señales en cada uno de los miles de vuelos.
function desgloseDe(f, senales) {
  if (!f.score_desglose || !senales) return [];
  return senales
    .map(([senal, peso], i) => {
      const norm = f.score_desglose[i];
      return norm == null
        ? null
        : { senal, peso, norm, aporte: peso * norm,
            label: SENAL_LABELS[senal] || senal };
    })
    .filter(Boolean)
    .sort((a, b) => b.aporte - a.aporte);
}

function FlagsBadges({ flags, largo = false }) {
  if (!flags || flags.length === 0) return null;
  return (
    <span className="gaps">
      {flags.map((g) => (
        <span key={g} className="gap-badge flag-badge" title={FLAG_TITULOS[g] || g}>
          {(largo ? FLAG_TITULOS[g] : FLAG_LABELS[g]) || g}
        </span>
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Valoraciones manuales (se guardan en este navegador y se descargan en CSV)
// ---------------------------------------------------------------------------

// Identifica una oferta concreta. No entra el precio: si Aviasales refresca el
// precio del mismo vuelo, tu valoración sigue siendo la de ese vuelo.
function idVuelo(f) {
  return [
    f.tipo_llamada, f.origin_airport || f.origin, f.destination_airport || f.destination,
    (f.departure_at || "").slice(0, 16), (f.return_at || "").slice(0, 16),
    f.airline, f.flight_number,
  ].join("|");
}

function leerValoraciones() {
  try {
    const guardado = localStorage.getItem(LS_VALORACIONES);
    if (guardado) return JSON.parse(guardado);
    // Valoraciones de cuando la nota iba de 0 a 10: se pasan a 100 para que no
    // se pierdan al cambiar la escala (un 7,5 de entonces es un 75 de ahora).
    const viejas = JSON.parse(localStorage.getItem(LS_VALORACIONES_V1) || "{}");
    const migradas = {};
    for (const [id, r] of Object.entries(viejas)) {
      migradas[id] = { ...r, nota_usuario: String(Math.round(Number(r.nota_usuario) * 10)) };
    }
    if (Object.keys(migradas).length) {
      localStorage.setItem(LS_VALORACIONES, JSON.stringify(migradas));
    }
    return migradas;
  } catch {
    return {};
  }
}

// Todo lo que hace falta para reajustar los pesos más adelante. Se guardan los
// datos del vuelo TAL Y COMO ESTABAN al valorarlo: el "chollo" depende de la
// búsqueda concreta en la que salió y no se puede reconstruir después.
// Si corriges la nota de muuyal, ¿hacia dónde y con qué lista de motivos?
function correccion(f, nota) {
  if (f.score == null) return { hace_falta: false, sentido: "", lista: [] };
  const dif = Math.round(nota) - f.score;
  if (Math.abs(dif) < DIFERENCIA_MOTIVO) return { hace_falta: false, sentido: "", lista: [] };
  return {
    hace_falta: true,
    dif,
    sentido: dif > 0 ? "sube" : "baja",
    lista: dif > 0 ? MOTIVOS_SUBE : MOTIVOS_BAJA,
  };
}

function registroValoracion(f, nota, motivo, meta, senales) {
  const e = f.enrichment || {};
  const clima = e.clima || {};
  const turismo = e.turismo || {};
  const turismoMes = e.turismo_mes || {};
  const coste = e.coste || {};
  const unesco = e.unesco || {};
  const reg = {
    id_vuelo: idVuelo(f),
    fecha_valoracion: new Date().toISOString(),
    nota_usuario: String(Math.round(nota)),   // 0–100, igual que score_muuyal
    score_muuyal: f.score ?? "",
    // Por qué corriges la nota. Vacío = tu nota y la de muuyal se parecen y no
    // se preguntó nada. `motivo_senales` dice con qué parte de la fórmula tiene
    // que ver: vacío significa "esto la fórmula no puede saberlo".
    motivo: motivo?.id ?? "",
    motivo_texto: motivo?.texto ?? "",
    motivo_sentido: motivo ? correccion(f, nota).sentido : "",
    motivo_senales: (motivo?.senales || []).join("|"),
    score_flags: (f.score_flags || []).join("|"),
    enrichment_gaps: (f.enrichment_gaps || []).join("|"),
    busqueda_origen: meta?.origin ?? "",
    busqueda_grupo: meta?.group ?? "",
    busqueda_fecha: meta?.fecha_consulta ?? "",
    tipo_llamada: f.tipo_llamada ?? "",
    origen: f.origin_airport || f.origin || "",
    destino: f.destination_airport || f.destination || "",
    enrich_airport: f.enrich_airport ?? "",
    enrich_country: f.enrich_country ?? "",
    enrich_month: f.enrich_month ?? "",
    departure_at: f.departure_at ?? "",
    return_at: f.return_at ?? "",
    airline: f.airline ?? "",
    flight_number: f.flight_number ?? "",
    price: f.price ?? "",
    oportunidad_base: f.oportunidad_base ?? "",
    duration: f.duration ?? "",
    transfers: f.transfers ?? "",
    return_transfers: f.return_transfers ?? "",
    distancia_km: f.distancia_km ?? "",
    dia_busqueda: f.dia_busqueda ?? "",
    antiguedad_en_dias: f.antiguedad_en_dias ?? "",
    temp_media: clima.temp_media ?? "",
    temp_max_media: clima.temp_max_media ?? "",
    dias_lluvia: clima.dias_lluvia ?? "",
    horas_sol_dia: clima.horas_sol_dia ?? "",
    precip_mm: clima.precip_mm ?? "",
    popularidad_0_100: turismo.popularidad_0_100 ?? "",
    turismo_idx: turismoMes.turismo_idx ?? "",
    indice_coste: coste.indice_coste ?? "",
    categoria_coste: coste.categoria ?? "",
    unesco_100km: unesco.unesco_100km ?? "",
    link: f.link ?? "",
  };
  // Valor normalizado (0–1) de cada señal en el momento de valorar: es lo que
  // permite recalcular los pesos con estos datos y sin volver a buscar.
  (senales || []).forEach(([senal, peso], i) => {
    reg[`norm_${senal}`] = f.score_desglose?.[i] ?? "";
    reg[`peso_${senal}`] = peso;
  });
  return reg;
}

// CSV con ";" (como los CSVs maestros del repo) y BOM, para que Excel lo abra
// bien en español sin tener que importar nada a mano.
function csvDeValoraciones(registros) {
  const cols = [];
  for (const r of registros) {
    for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k);
  }
  const celda = (v) => {
    const s = v == null ? "" : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [
    cols.join(";"),
    ...registros.map((r) => cols.map((c) => celda(r[c])).join(";")),
  ].join("\r\n");
}

function descargarTexto(nombre, texto) {
  const url = URL.createObjectURL(new Blob([texto], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Subpantalla de un vuelo: todos sus datos, el desglose de la nota, el enlace
// a Aviasales y el deslizador para ponerle tu nota del 0 al 10.
function DetalleVuelo({ f, meta, senales, fechaConsulta, valoracion, aeropuerto, onGuardar, onBorrar, onCerrar }) {
  // El deslizador arranca donde lo dejaste, o en la nota de muuyal si es la
  // primera vez: así valorar es "corregirle". Al abrir otro vuelo, el padre
  // remonta esta pantalla (le pasa una `key` distinta) y el estado se rehace.
  const [nota, setNota] = useState(
    valoracion ? Number(valoracion.nota_usuario) : (f.score ?? 50));
  const [motivo, setMotivo] = useState(valoracion?.motivo || "");
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    const esc = (ev) => { if (ev.key === "Escape") onCerrar(); };
    document.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", esc);
      document.body.style.overflow = "";
    };
  }, [onCerrar]);

  const e = f.enrichment || {};
  const corrijo = correccion(f, nota);
  const desglose = desgloseDe(f, senales);
  // Extremos de la ruta. Se usan el origen de la búsqueda y el aeropuerto
  // enriquecido (no `origin`/`destination` del vuelo, que a veces vienen como
  // código de ciudad y no están en el maestro), girados según el sentido:
  // en las vueltas el vuelo va del destino a casa.
  const ida = f.tipo_llamada !== "OW_VUELTA";
  const casa = aeropuerto?.(meta?.origin);
  const lejos = aeropuerto?.(f.enrich_airport);
  const rutaA = ida ? casa : lejos;
  const rutaB = ida ? lejos : casa;
  const pesoPresente = desglose.reduce((s, d) => s + d.peso, 0);
  const dato = (label, valor) => (
    <div className="dato">
      <span className="dato-label">{label}</span>
      <span className="dato-valor">{valor}</span>
    </div>
  );

  return (
    <div className="modal-fondo" onClick={onCerrar} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Detalle del vuelo"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="modal-cabecera">
          <div>
            <TipoBadge tipo={f.tipo_llamada} />{" "}
            <span className="ruta">
              {f.origin_airport || f.origin} → {f.destination_airport || f.destination}
            </span>
            <div className="modal-dest">
              <b>{f.enrich_airport}</b> {f.enrich_airport_name || ""}
              {f.enrich_country && (
                <span className="muted"> · {NOMBRES_PAIS(f.enrich_country)}</span>
              )}
            </div>
          </div>
          <button type="button" className="btn-cerrar" onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="modal-cuerpo">
          <section className="modal-nota">
            <div className="modal-nota-num">
              <span className={"nota grande " + nivelNota(f.score)}>
                {f.score == null ? "—" : f.score}
                <span className="nota-de">/100</span>
              </span>
              <span className="muted small">puntuación muuyal</span>
            </div>
            <a href={f.link} target="_blank" rel="noreferrer" className="btn-aviasales">
              Ver en Aviasales · {fmtNum(f.price, 0)} €
            </a>
          </section>

          <MapaRuta origen={rutaA} destino={rutaB} />

          {(f.score_flags?.length > 0 || f.enrichment_gaps?.length > 0) && (
            <div className="modal-avisos">
              <FlagsBadges flags={f.score_flags} largo />
              <GapsBadges gaps={f.enrichment_gaps} />
            </div>
          )}

          <section>
            <h3>Tu valoración</h3>
            <p className="muted small">
              Mueve la barra y pulsa Guardar. Se queda en este dispositivo hasta
              que la descargues.
            </p>
            <div className="valorar">
              <span className="valorar-num">
                {Math.round(nota)}<span className="nota-de">/100</span>
              </span>
              <input
                type="range" min="0" max="100" step="1" value={nota}
                aria-label="Tu nota del 0 al 100"
                onChange={(ev) => {
                  const nueva = Number(ev.target.value);
                  // Al cruzar de subir a bajar (o al dejar de corregir), el
                  // motivo elegido ya no vale: la lista es otra.
                  if (correccion(f, nueva).sentido !== corrijo.sentido) setMotivo("");
                  setNota(nueva);
                  setGuardado(false);
                }}
              />
              <div className="valorar-escala muted small"><span>0</span><span>100</span></div>
            </div>

            {/* Solo se pregunta el motivo cuando de verdad estás corrigiendo:
                a menos de 10 puntos de diferencia se entiende que coincides. */}
            {corrijo.hace_falta && (
              <div className="motivo">
                <label htmlFor="motivo-correccion">
                  Le pones <b>{Math.abs(corrijo.dif)} puntos {corrijo.sentido === "sube" ? "más" : "menos"}</b>
                  {" "}que muuyal ({f.score}/100). ¿Por qué?
                </label>
                <select
                  id="motivo-correccion"
                  value={motivo}
                  onChange={(ev) => { setMotivo(ev.target.value); setGuardado(false); }}
                >
                  <option value="">— elige el motivo —</option>
                  {corrijo.lista.map((m) => (
                    <option key={m.id} value={m.id}>{m.texto}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="valorar-acciones">
              <button
                type="button"
                disabled={corrijo.hace_falta && !motivo}
                onClick={() => {
                  onGuardar(f, nota, corrijo.lista.find((m) => m.id === motivo) || null);
                  setGuardado(true);
                }}
              >
                {guardado ? "Guardado ✓" : "Guardar valoración"}
              </button>
              {valoracion && (
                <button type="button" className="btn-sec" onClick={() => { onBorrar(f); onCerrar(); }}>
                  Borrar
                </button>
              )}
            </div>
            {valoracion && !guardado && (
              <p className="muted small">
                Ya la valoraste con un {Math.round(Number(valoracion.nota_usuario))}/100
                {" "}el {fmtDia(valoracion.fecha_valoracion.slice(0, 10))}
                {valoracion.motivo_texto && <> · «{valoracion.motivo_texto}»</>}.
              </p>
            )}
          </section>

          <section>
            <h3>Por qué puntúa lo que puntúa</h3>
            {desglose.length === 0 ? (
              <p className="muted">No hay datos suficientes para puntuar este vuelo.</p>
            ) : (
              <>
                <table className="desglose">
                  <thead>
                    <tr><th>Señal</th><th>Peso</th><th>Nota (0–1)</th><th>Aporta</th></tr>
                  </thead>
                  <tbody>
                    {desglose.map((d) => (
                      <tr key={d.senal}>
                        <td>{d.label}</td>
                        <td>{d.peso}</td>
                        <td>{d.norm.toFixed(2).replace(".", ",")}</td>
                        <td className="nowrap">
                          <span className="aporte-barra" aria-hidden="true">
                            <span style={{ width: `${(d.aporte / d.peso) * 100}%` }} />
                          </span>
                          {" "}{d.aporte.toFixed(1).replace(".", ",")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="muted small">
                  Suma de lo aportado ÷ suma de pesos con dato ({pesoPresente}) × 100 = {f.score}.
                  Las señales sin dato no penalizan: se reparte su peso entre las demás.
                </p>
              </>
            )}
          </section>

          <section>
            <h3>El vuelo</h3>
            <div className="datos">
              {dato("Salida", fmtFecha(f.departure_at))}
              {dato("Vuelta", f.tipo_llamada === "RD" ? fmtFecha(f.return_at) : "—")}
              {dato("Aerolínea", `${f.airline || "—"} ${f.flight_number || ""}`)}
              {dato("Duración", fmtDuracion(f.duration))}
              {dato("Escalas", `${f.transfers ?? "—"}${f.tipo_llamada === "RD" ? ` + ${f.return_transfers ?? "—"}` : ""}`)}
              {dato("Distancia", f.distancia_km != null ? `${f.distancia_km.toLocaleString("es-ES")} km` : "—")}
              {dato("Precio", `${fmtNum(f.price, 0)} €`)}
              {dato("Precio guardado", <Frescura f={f} fechaConsulta={fechaConsulta} />)}
              {dato("Normal a ese destino",
                f.oportunidad_base != null
                  ? `${fmtNum(f.oportunidad_base, 0)} € (mediana)`
                  : <span className="muted">pocos vuelos para saberlo</span>)}
              {dato("Vendido por", f.gate || "—")}
            </div>
          </section>

          <section>
            <h3>El destino en el mes de salida</h3>
            <div className="datos">
              {dato("Temperatura media", e.clima ? fmtNum(e.clima.temp_media, 1, " °C") : "—")}
              {dato("Máximas", e.clima ? fmtNum(e.clima.temp_max_media, 1, " °C") : "—")}
              {dato("Horas de sol al día", e.clima ? fmtNum(e.clima.horas_sol_dia, 1, " h") : "—")}
              {dato("Días de lluvia al mes", e.clima ? fmtNum(e.clima.dias_lluvia, 0, " d") : "—")}
              {dato("Lluvia acumulada", e.clima ? fmtNum(e.clima.precip_mm, 0, " mm") : "—")}
              {dato("Coste de vida", e.coste ? <Coste c={e.coste} /> : "—")}
              {dato("Popularidad", e.turismo ? `${fmtNum(e.turismo.popularidad_0_100, 0)}/100` : "—")}
              {dato("Turismo ese mes", e.turismo_mes ? `×${fmtNum(e.turismo_mes.turismo_idx, 2)}` : "—")}
              {dato("UNESCO a 100 km", e.unesco ? e.unesco.unesco_100km : "—")}
              {dato("UNESCO a 60 km", e.unesco ? e.unesco.unesco_60km : "—")}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Logo({ className }) {
  return (
    <svg className={className} viewBox="0 0 200 140" role="img" aria-label="Muuyal">
      <g fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round">
        <path d="M 100 70 C 116 50 142 46 154 58 C 164 68 160 82 148 84 C 139 85.5 133 78 137 71" />
        <path
          d="M 100 70 C 116 50 142 46 154 58 C 164 68 160 82 148 84 C 139 85.5 133 78 137 71"
          transform="rotate(180 100 70)"
        />
      </g>
      <g fill="currentColor">
        <circle cx="100" cy="32" r="9" />
        <circle cx="100" cy="108" r="9" />
      </g>
    </svg>
  );
}

export default function App() {
  const [airports, setAirports] = useState([]);
  const [zones, setZones] = useState([]);
  const [origin, setOrigin] = useState("");
  const [originQuery, setOriginQuery] = useState("");
  const [showSugerencias, setShowSugerencias] = useState(false);
  const [group, setGroup] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingDesde, setLoadingDesde] = useState(null);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  // filtros / orden / paginación de resultados
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroDestino, setFiltroDestino] = useState("");
  const [maxCache, setMaxCache] = useState("");
  const [pais, setPais] = useState("");
  const [rangos, setRangos] = useState({});
  const [panelAbierto, setPanelAbierto] = useState(false);
  // Por defecto se ordena por la puntuación de muuyal, de mayor a menor.
  const [orden, setOrden] = useState("score");
  const [page, setPage] = useState(0);

  // vuelo abierto en la subpantalla y valoraciones guardadas en este navegador
  const [detalle, setDetalle] = useState(null);
  const [valoraciones, setValoraciones] = useState({});

  const inputRef = useRef(null);
  const peticionRef = useRef(null);

  useEffect(() => {
    fetch("/api/airports").then((r) => r.json()).then(setAirports).catch(() => {});
    fetch("/api/zones").then((r) => r.json()).then(setZones).catch(() => {});
    setValoraciones(leerValoraciones());
  }, []);

  // Sugerencias del buscador de origen, ordenadas por lo bien que encajan.
  // Antes salían en el orden del CSV, así que al escribir "MAD" el primero era
  // Doha: su nombre, "Hamad International", contiene esas tres letras.
  const sugerencias = useMemo(() => {
    const q = originQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    const puntua = (a) => {
      const code = a.code.toLowerCase();
      const nombre = (a.name || "").toLowerCase();
      if (code === q) return 0;                      // el código exacto, primero
      if (code.startsWith(q)) return 1;
      if (nombre.startsWith(q)) return 2;            // "Barcelona-El Prat"
      // una palabra del nombre que empiece igual ("Madrid" dentro de su nombre)
      if (nombre.split(/[\s\-—/(),.]+/).some((p) => p.startsWith(q))) return 3;
      if (nombre.includes(q)) return 4;              // "Ha-mad": lo último
      return 9;
    };
    return airports
      .map((a) => ({ a, p: puntua(a) }))
      .filter((x) => x.p < 9)
      .sort((x, y) => x.p - y.p || x.a.code.localeCompare(y.a.code))
      .slice(0, 8)
      .map((x) => x.a);
  }, [originQuery, airports]);

  async function buscar(e) {
    e.preventDefault();
    if (!origin || !group) return;
    setLoading(true);
    setLoadingDesde(Date.now());
    setError(null);
    setResult(null);
    setPage(0);
    setFiltroTipo("");
    setFiltroDestino("");
    setMaxCache("");
    setPais("");
    setRangos({});
    const control = new AbortController();
    peticionRef.current = control;
    try {
      const resp = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin, group }),
        signal: control.signal,
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.detail || `Error ${resp.status}`);
      }
      setResult(await resp.json());
    } catch (err) {
      // Si la búsqueda se cortó al volver a la portada, no es un error que
      // haya que enseñar: es lo que el usuario acaba de pedir.
      if (err.name !== "AbortError") setError(err.message);
    } finally {
      if (peticionRef.current === control) {
        peticionRef.current = null;
        setLoading(false);
      }
    }
  }

  // El logo devuelve a la portada: se corta la búsqueda en curso si la hay y
  // se deja todo como recién abierta la página (el mapa vuelve a moverse).
  function volverAPortada() {
    peticionRef.current?.abort();
    peticionRef.current = null;
    setLoading(false);
    setResult(null);
    setError(null);
    setDetalle(null);
    setOrigin("");
    setOriginQuery("");
    setGroup("");
    setPanelAbierto(false);
    setFiltroTipo(""); setFiltroDestino(""); setMaxCache("");
    setPais(""); setRangos({}); setPage(0); setOrden("score");
    window.scrollTo({ top: 0 });
  }

  const fechaConsulta = result?.meta?.fecha_consulta;
  const senales = result?.meta?.score_senales;

  // Búsqueda rápida de aeropuerto por código: lo usan el mapa de la portada
  // (para saber adónde viajar) y el mapa de ruta de la ficha de cada vuelo.
  const porCodigo = useMemo(() => {
    const m = new Map();
    for (const a of airports) m.set(a.code, a);
    return m;
  }, [airports]);
  const aeropuerto = (code) => (code ? porCodigo.get(code) || null : null);
  const aeropuertoOrigen = aeropuerto(origin);

  // --- valoraciones manuales ------------------------------------------
  const guardarValoracion = (f, nota, motivo) => {
    const reg = registroValoracion(f, nota, motivo, result?.meta, senales);
    setValoraciones((prev) => {
      const next = { ...prev, [reg.id_vuelo]: reg };
      try { localStorage.setItem(LS_VALORACIONES, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const borrarValoracion = (f) => {
    setValoraciones((prev) => {
      const next = { ...prev };
      delete next[idVuelo(f)];
      try { localStorage.setItem(LS_VALORACIONES, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const descargarValoraciones = () => {
    const regs = Object.values(valoraciones)
      .sort((a, b) => a.fecha_valoracion.localeCompare(b.fecha_valoracion));
    if (regs.length === 0) return;
    const hoy = new Date().toISOString().slice(0, 10);
    descargarTexto(`valoraciones_muuyal_${hoy}.csv`, csvDeValoraciones(regs));
  };

  // Borrar es irreversible y las valoraciones cuestan tiempo: se pregunta
  // antes, y se avisa si aún no se han descargado.
  const borrarTodasLasValoraciones = () => {
    const n = Object.keys(valoraciones).length;
    if (n === 0) return;
    const aviso = `Vas a borrar tus ${n} valoraciones guardadas en este dispositivo.\n\n`
      + "No se pueden recuperar. Si aún no las has descargado, cancela y "
      + "descárgalas primero.\n\n¿Seguro que quieres borrarlas?";
    if (!window.confirm(aviso)) return;
    setValoraciones({});
    try {
      localStorage.removeItem(LS_VALORACIONES);
      localStorage.removeItem(LS_VALORACIONES_V1);
    } catch {}
  };

  const nValoraciones = Object.keys(valoraciones).length;

  // Los mismos dos botones valen en la portada y en la barra de filtros.
  const BotonesValoraciones = () => (
    <>
      <button
        type="button"
        className="btn-sec"
        onClick={descargarValoraciones}
        title="Descarga un CSV con tus valoraciones para afinar la fórmula"
      >
        ⭳ Descargar mis valoraciones
        <span className="badge-filtros">{nValoraciones}</span>
      </button>
      <button
        type="button"
        className="btn-sec btn-borrar"
        onClick={borrarTodasLasValoraciones}
        title="Borra tus valoraciones de este dispositivo (descárgalas antes)"
      >
        Borrar
      </button>
    </>
  );

  // Países presentes en los resultados, con su número de vuelos.
  const paises = useMemo(() => {
    if (!result) return [];
    const cuenta = new Map();
    for (const f of result.flights) {
      if (f.enrich_country) cuenta.set(f.enrich_country, (cuenta.get(f.enrich_country) || 0) + 1);
    }
    return [...cuenta.entries()]
      .map(([code, n]) => ({ code, nombre: NOMBRES_PAIS(code), n }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [result]);

  const setRango = (id, extremo, valor) => {
    setRangos((r) => ({ ...r, [`${id}_${extremo}`]: valor }));
    setPage(0);
  };

  const nFiltrosActivos =
    (filtroTipo ? 1 : 0) + (filtroDestino.trim() ? 1 : 0) + (maxCache ? 1 : 0) +
    (pais ? 1 : 0) + Object.values(rangos).filter((x) => x !== "" && x != null).length;

  const limpiarFiltros = () => {
    setFiltroTipo(""); setFiltroDestino(""); setMaxCache("");
    setPais(""); setRangos({}); setPage(0);
  };

  const vuelosFiltrados = useMemo(() => {
    if (!result) return [];
    let v = result.flights;
    if (filtroTipo) v = v.filter((f) => f.tipo_llamada === filtroTipo);
    if (pais) v = v.filter((f) => f.enrich_country === pais);
    if (filtroDestino.trim()) {
      const q = filtroDestino.trim().toLowerCase();
      v = v.filter(
        (f) =>
          (f.enrich_airport || "").toLowerCase().includes(q) ||
          (f.enrich_airport_name || "").toLowerCase().includes(q)
      );
    }
    if (maxCache) {
      const tope = Number(maxCache);
      v = v.filter((f) => {
        const d = diasCache(f, fechaConsulta);
        return d != null && d <= tope;
      });
    }
    // Filtros de rango. Un vuelo sin dato en ese campo queda FUERA mientras el
    // filtro esté puesto: no se puede afirmar que cumpla lo que se pide.
    for (const r of RANGOS) {
      // Las fechas se comparan como texto AAAA-MM-DD; el resto, como números.
      const conv = r.tipo === "fecha" ? (x) => x || null : num;
      const min = conv(rangos[`${r.id}_min`]);
      const max = conv(rangos[`${r.id}_max`]);
      if (min == null && max == null) continue;
      v = v.filter((f) => {
        const x = r.get(f);
        if (x == null) return false;
        if (min != null && x < min) return false;
        if (max != null && x > max) return false;
        return true;
      });
    }

    const key = {
      price: (f) => Number(f.price) || Infinity,
      duration: (f) => Number(f.duration) || Infinity,
      distancia: (f) => f.distancia_km ?? Infinity,
      temp: (f) => -(f.enrichment?.clima?.temp_media ?? -Infinity),
      popularidad: (f) => -(f.enrichment?.turismo?.popularidad_0_100 ?? -Infinity),
      cache: (f) => diasCache(f, fechaConsulta) ?? Infinity,
      // Mejor puntuación primero. Los vuelos sin nota (null) van al final.
      score: (f) => (f.score == null ? Infinity : -f.score),
    }[orden];
    return [...v].sort((a, b) => key(a) - key(b));
  }, [result, filtroTipo, filtroDestino, maxCache, pais, rangos, orden, fechaConsulta]);

  const totalPages = Math.max(1, Math.ceil(vuelosFiltrados.length / PAGE_SIZE));
  const pagina = vuelosFiltrados.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className={"app" + (result ? "" : " en-portada")}>
      <header>
        {/* La marca entera es el botón de volver a la portada. */}
        <a
          href="/"
          className="marca"
          title="Volver a la portada"
          onClick={(ev) => { ev.preventDefault(); volverAPortada(); }}
        >
          <Logo className="logo" />
          <h1>Muuyal</h1>
        </a>
      </header>

      {/* Portada: el buscador encima y el mapa del mundo detrás. En cuanto hay
          resultados el mapa desaparece y la lista se queda toda la anchura. */}
      <div className={result ? "" : "portada"}>
      <form className="search-form" onSubmit={buscar}>
        <div className="field origen-field">
          <label>Aeropuerto de origen</label>
          <input
            ref={inputRef}
            type="text"
            placeholder="Ej.: BCN o Barcelona"
            value={originQuery}
            onChange={(e) => {
              setOriginQuery(e.target.value);
              setOrigin("");
              setShowSugerencias(true);
            }}
            onFocus={() => setShowSugerencias(true)}
            onBlur={() => setTimeout(() => setShowSugerencias(false), 150)}
          />
          {showSugerencias && sugerencias.length > 0 && !origin && (
            <ul className="sugerencias">
              {sugerencias.map((a) => (
                <li
                  key={a.code}
                  onMouseDown={() => {
                    setOrigin(a.code);
                    setOriginQuery(`${a.code} — ${a.name}`);
                    setShowSugerencias(false);
                  }}
                >
                  <b>{a.code}</b> {a.name} <span className="muted">({a.country_code})</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="field">
          <label>Grupo de destinos</label>
          <select value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">— elige —</option>
            {zones.map((z) => (
              <option key={z} value={z}>{z === "Top151" ? "Top 151 mundial" : `Zona: ${z}`}</option>
            ))}
          </select>
        </div>

        <button type="submit" disabled={!origin || !group || loading}>
          {loading ? "Buscando…" : "Buscar vuelos"}
        </button>
      </form>

      {/* Descargar no debería obligar a repetir una búsqueda de varios
          minutos: si hay valoraciones guardadas, el botón también está aquí. */}
      {!result && nValoraciones > 0 && (
        <div className="descarga-portada">
          <BotonesValoraciones />
        </div>
      )}

      {!result && (
        <MapaMundo
          destino={aeropuertoOrigen}
          aeropuertos={airports}
          onElegir={(a) => {
            setOrigin(a.code);
            setOriginQuery(`${a.code} — ${a.name}`);
          }}
          etiqueta={aeropuertoOrigen
            ? `${aeropuertoOrigen.code} — ${aeropuertoOrigen.name}`
            : "Arrastra el mapa y pulsa un aeropuerto"}
        />
      )}
      </div>

      {/* Mientras busca, solo el cronómetro, en una pastilla legible por encima
          del mapa: el texto suelto quedaba detrás y no se leía. */}
      {loading && (
        <div className="loading">
          <div className="loading-pastilla">
            <div className="spinner" />
            <span>Buscando vuelos… <Cronometro desde={loadingDesde} /></span>
          </div>
        </div>
      )}

      {error && <div className="error">⚠ {error}</div>}

      {result && (
        <>
          <div className="meta">
            <b>{result.meta.flights_found.toLocaleString("es-ES")}</b> vuelos ·{" "}
            {result.meta.destinations_queried} destinos consultados desde{" "}
            <b>{result.meta.origin}</b> ({result.meta.group}) ·{" "}
            {result.meta.elapsed_seconds}s
            {fechaConsulta && <> · búsqueda del {fmtDia(fechaConsulta)}</>}
            {/* Decir siempre de qué no fiarse: aquí, lo que se ha dejado fuera */}
            {result.meta.descartados_sin_datos > 0 && (
              <> · <span title="Aviasales devolvió vuelos a aeropuertos que no están en los datos de destino: se dejan fuera porque no se puede saber nada de ellos">
                {result.meta.descartados_sin_datos} fuera por no tener datos del destino
              </span></>
            )}
            {nFiltrosActivos > 0 && (
              <> · <b>{vuelosFiltrados.length.toLocaleString("es-ES")}</b> tras filtrar</>
            )}
          </div>

          <div className="filtros">
            <select value={filtroTipo} onChange={(e) => { setFiltroTipo(e.target.value); setPage(0); }}>
              <option value="">Todos los tipos</option>
              <option value="OW_IDA">Solo ida</option>
              <option value="OW_VUELTA">Solo vuelta</option>
              <option value="RD">Ida y vuelta</option>
            </select>
            <input
              type="text"
              placeholder="Filtrar destino…"
              value={filtroDestino}
              onChange={(e) => { setFiltroDestino(e.target.value); setPage(0); }}
            />
            <select value={maxCache} onChange={(e) => { setMaxCache(e.target.value); setPage(0); }}>
              <option value="">Precio de cualquier fecha</option>
              <option value="0">Solo precios de hoy</option>
              <option value="1">Precios de hoy o ayer</option>
              <option value="3">Precios de 3 días o menos</option>
            </select>
            <select value={orden} onChange={(e) => setOrden(e.target.value)}>
              <option value="score">Mejor puntuación</option>
              <option value="price">Más baratos</option>
              <option value="duration">Más cortos</option>
              <option value="temp">Más cálidos</option>
              <option value="popularidad">Más populares</option>
              <option value="cache">Precio más reciente</option>
              <option value="distancia">Más cerca</option>
            </select>
            <select value={pais} onChange={(e) => { setPais(e.target.value); setPage(0); }}>
              <option value="">Todos los países ({paises.length})</option>
              {paises.map((p) => (
                <option key={p.code} value={p.code}>{p.nombre} ({p.n})</option>
              ))}
            </select>
            <button type="button" className="btn-sec" onClick={() => setPanelAbierto(!panelAbierto)}>
              {panelAbierto ? "▲" : "▼"} Más filtros
              {nFiltrosActivos > 0 && <span className="badge-filtros">{nFiltrosActivos}</span>}
            </button>
            {nFiltrosActivos > 0 && (
              <button type="button" className="btn-sec" onClick={limpiarFiltros}>
                Limpiar
              </button>
            )}
            {nValoraciones > 0 && <BotonesValoraciones />}
          </div>

          {panelAbierto && (
            <div className="panel-filtros">
              {GRUPOS_RANGO.map((g) => (
                <div className="grupo-filtros" key={g}>
                  <h3>{g}</h3>
                  {RANGOS.filter((r) => r.grupo === g).map((r) => (
                    <div className="rango" key={r.id}>
                      <label>{r.label}{r.unidad && <span className="muted"> ({r.unidad})</span>}</label>
                      <div className="rango-inputs">
                        {["min", "max"].map((extremo, i) => (
                          <Fragment key={extremo}>
                            {i === 1 && <span className="muted">–</span>}
                            {r.tipo === "fecha" ? (
                              <input
                                type="date"
                                aria-label={`${r.label} ${extremo === "min" ? "desde" : "hasta"}`}
                                value={rangos[`${r.id}_${extremo}`] ?? ""}
                                onChange={(e) => setRango(r.id, extremo, e.target.value)}
                              />
                            ) : (
                              <input
                                type="number" inputMode="decimal" step={r.paso}
                                placeholder={extremo === "min" ? "mín" : "máx"}
                                value={rangos[`${r.id}_${extremo}`] ?? ""}
                                onChange={(e) => setRango(r.id, extremo, e.target.value)}
                              />
                            )}
                          </Fragment>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              <p className="nota-filtros muted small">
                Deja una casilla vacía para no poner tope por ese lado. Si un vuelo
                no tiene el dato que estás filtrando (por ejemplo, un destino sin
                clima), queda fuera mientras ese filtro esté puesto.
              </p>
            </div>
          )}

          {vuelosFiltrados.length === 0 && (
            <div className="vacio">
              <p><b>Ningún vuelo cumple los filtros.</b></p>
              <p className="muted">Prueba a aflojar alguno o a limpiarlos todos.</p>
              <button type="button" onClick={limpiarFiltros}>Limpiar filtros</button>
            </div>
          )}

          {vuelosFiltrados.length > 0 && (<>
          {/* Desktop: tabla */}
          <div className="tabla-wrap">
            <table>
              <thead>
                <tr>
                  <th>Puntuación</th>
                  <th>Vuelo</th>
                  <th>Salida</th>
                  <th>Vuelta</th>
                  <th>Aerolínea</th>
                  <th>Escalas</th>
                  <th>Duración</th>
                  <th>Destino</th>
                  <th>Distancia</th>
                  <th>Clima (mes)</th>
                  <th>Turismo</th>
                  <th>Coste</th>
                  <th>UNESCO</th>
                  <th>Precio de</th>
                  <th>Precio</th>
                </tr>
              </thead>
              <tbody>
                {pagina.map((f, i) => {
                  const e = f.enrichment || {};
                  const mia = valoraciones[idVuelo(f)];
                  return (
                    <tr
                      key={i}
                      className="fila-vuelo"
                      onClick={() => setDetalle(f)}
                      tabIndex={0}
                      role="button"
                      aria-label="Ver detalle y valorar este vuelo"
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setDetalle(f); }
                      }}
                    >
                      <td className="nota-cell">
                        <Nota score={f.score} />
                        {mia && (
                          <div className="mi-nota" title="Tu valoración">
                            ★ {Math.round(Number(mia.nota_usuario))}
                          </div>
                        )}
                      </td>
                      <td>
                        <TipoBadge tipo={f.tipo_llamada} />
                        <div className="ruta">{f.origin_airport || f.origin} → {f.destination_airport || f.destination}</div>
                        {/* los avisos de la nota van con los de los datos que
                            faltan: juntos ocupan menos que en su propia columna */}
                        <GapsBadges gaps={f.enrichment_gaps} />
                        <FlagsBadges flags={f.score_flags} />
                      </td>
                      <td>{fmtFecha(f.departure_at)}</td>
                      <td>{f.tipo_llamada === "RD" ? fmtFecha(f.return_at) : "—"}</td>
                      <td>{f.airline || "—"} {f.flight_number || ""}</td>
                      <td>{f.transfers ?? "—"}{f.tipo_llamada === "RD" ? ` + ${f.return_transfers ?? "—"}` : ""}</td>
                      <td>{fmtDuracion(f.duration)}</td>
                      <td className="dest-cell">
                        <b>{f.enrich_airport}</b>
                        {f.enrich_country && (
                          <span className="muted small"> · {NOMBRES_PAIS(f.enrich_country)}</span>
                        )}
                        <div className="muted small">{f.enrich_airport_name || ""}</div>
                      </td>
                      <td className="nowrap">
                        {f.distancia_km != null
                          ? `${f.distancia_km.toLocaleString("es-ES")} km`
                          : <span className="muted">—</span>}
                      </td>
                      <td><Clima c={e.clima} /></td>
                      <td>
                        {e.turismo ? (
                          <>
                            {fmtNum(e.turismo.popularidad_0_100, 0)}/100
                            {e.turismo_mes && (
                              <span className={"idx " + (e.turismo_mes.turismo_idx > 1.1 ? "alta" : e.turismo_mes.turismo_idx < 0.9 ? "baja" : "")}>
                                {" "}×{fmtNum(e.turismo_mes.turismo_idx, 2)}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td><Coste c={e.coste} /></td>
                      <td>
                        {e.unesco ? (
                          <>
                            {e.unesco.unesco_100km} <span className="muted small">a 100 km</span>
                          </>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        <Frescura f={f} fechaConsulta={fechaConsulta} />
                      </td>
                      <td className="precio-cell">
                        {/* El enlace a Aviasales no debe abrir además el detalle */}
                        <a
                          href={f.link} target="_blank" rel="noreferrer" className="precio"
                          onClick={(ev) => ev.stopPropagation()}
                        >
                          {fmtNum(f.price, 0)} €
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Móvil: cards */}
          <div className="cards">
            {pagina.map((f, i) => {
              const e = f.enrichment || {};
              const mia = valoraciones[idVuelo(f)];
              return (
                <div
                  className="card" key={i}
                  onClick={() => setDetalle(f)}
                  role="button" tabIndex={0}
                  aria-label="Ver detalle y valorar este vuelo"
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setDetalle(f); }
                  }}
                >
                  <div className="card-top">
                    <div>
                      <TipoBadge tipo={f.tipo_llamada} />
                      <span className="ruta">
                        {" "}{f.origin_airport || f.origin} → {f.destination_airport || f.destination}
                      </span>
                    </div>
                    <a
                      href={f.link} target="_blank" rel="noreferrer" className="precio"
                      onClick={(ev) => ev.stopPropagation()}
                    >
                      {fmtNum(f.price, 0)} €
                    </a>
                  </div>
                  <div className="card-dest">
                    <b>{f.enrich_airport}</b> {f.enrich_airport_name || ""}
                    {f.enrich_country && (
                      <span className="muted"> · {NOMBRES_PAIS(f.enrich_country)}</span>
                    )}
                  </div>
                  <div className="card-fechas muted">
                    {fmtFecha(f.departure_at)}
                    {f.tipo_llamada === "RD" && <> → {fmtFecha(f.return_at)}</>}
                    {" · "}{fmtDuracion(f.duration)}
                    {" · "}{f.transfers ?? "?"} escala(s)
                    {f.distancia_km != null && <> · {f.distancia_km.toLocaleString("es-ES")} km</>}
                  </div>
                  <div className="card-chips">
                    <Nota score={f.score} chip />
                    {mia && (
                      <span className="chip mi-nota-chip">
                        ★ tu nota {Math.round(Number(mia.nota_usuario))}
                      </span>
                    )}
                    <Frescura f={f} fechaConsulta={fechaConsulta} chip />
                    {e.clima && (
                      <span className="chip">🌡 {fmtNum(e.clima.temp_media, 0, "°")} · ☀ {fmtNum(e.clima.horas_sol_dia, 1)}h</span>
                    )}
                    {e.coste && (
                      <span className={"chip coste-badge n" + String(e.coste.categoria || "").length}>
                        {e.coste.categoria}
                      </span>
                    )}
                    {e.turismo && <span className="chip">★ {fmtNum(e.turismo.popularidad_0_100, 0)}/100</span>}
                    {e.turismo_mes && <span className="chip">turismo ×{fmtNum(e.turismo_mes.turismo_idx, 2)}</span>}
                    {e.unesco && <span className="chip">🏛 {e.unesco.unesco_100km} UNESCO</span>}
                  </div>
                  <GapsBadges gaps={f.enrichment_gaps} />
                  <FlagsBadges flags={f.score_flags} />
                </div>
              );
            })}
          </div>
          </>)}

          {totalPages > 1 && (
            <div className="paginacion">
              <button disabled={page === 0} onClick={() => setPage(page - 1)}>←</button>
              <span>
                Página {page + 1} de {totalPages} · {vuelosFiltrados.length.toLocaleString("es-ES")} vuelos
              </span>
              <button disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>→</button>
            </div>
          )}
        </>
      )}

      {detalle && (
        <DetalleVuelo
          key={idVuelo(detalle)}
          f={detalle}
          meta={result?.meta}
          senales={senales}
          fechaConsulta={fechaConsulta}
          valoracion={valoraciones[idVuelo(detalle)]}
          aeropuerto={aeropuerto}
          onGuardar={guardarValoracion}
          onBorrar={borrarValoracion}
          onCerrar={() => setDetalle(null)}
        />
      )}
    </div>
  );
}
