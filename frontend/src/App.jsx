import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  ArrowLeft, ArrowRight, Bank, CaretDown, Check, CloudRain, DownloadSimple,
  Star, Sun, Thermometer, UsersThree, Warning, X,
} from "./iconos";
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

// ---------------------------------------------------------------------------
// Movimiento. Todo lo que se mueve pregunta antes si el sistema pide menos
// animaciones; si lo pide, el cambio ocurre igual pero sin desplazamientos.
// ---------------------------------------------------------------------------

function menosMovimiento() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

// Cambia de pantalla (portada ⇄ resultados) con un fundido del propio
// navegador entre lo que había y lo nuevo, donde exista; si no, cambia sin más.
// `flushSync` hace que React pinte el cambio dentro de la transición y no
// después, que es cuando el navegador hace la "foto" del estado nuevo.
function conTransicion(cambio) {
  if (typeof document === "undefined" || !document.startViewTransition || menosMovimiento()) {
    cambio();
    return;
  }
  document.startViewTransition(() => flushSync(cambio));
}

// Una cifra que sube desde 0 hasta su valor la primera vez que se enseña
// (el total de vuelos, la nota de la ficha). Escribe en el DOM directamente,
// fuera de React: un render por fotograma sería carísimo. El valor real está
// siempre en el texto oculto, para los lectores de pantalla.
function NumeroQueSube({ valor, duracion = 750, formato = (n) => n.toLocaleString("es-ES") }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || valor == null) return;
    if (menosMovimiento()) { el.textContent = formato(valor); return; }
    let raf = 0;
    const t0 = performance.now();
    const paso = (t) => {
      const p = Math.min(1, (t - t0) / duracion);
      const k = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);   // sale rápido y frena al llegar
      el.textContent = formato(Math.round(valor * k));
      if (p < 1) raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [valor]);
  if (valor == null) return <span>—</span>;
  return (
    <span className="cifra">
      <span className="sr-only">{formato(valor)}</span>
      <span aria-hidden="true" ref={ref}>{formato(valor)}</span>
    </span>
  );
}

// Las filas y tarjetas entran con un pequeño ascenso al llegar a la pantalla,
// una detrás de otra. Solo las nuevas: las que ya se vieron no se vuelven a
// animar al filtrar, porque filtrar se hace decenas de veces por sesión y ahí
// el cambio tiene que ser instantáneo. El estado "visto" va en un atributo
// que React no gestiona, así que un re-render no lo borra.
function useRevelar(contenedorRef, deps) {
  useEffect(() => {
    const raiz = contenedorRef.current;
    if (!raiz) return;
    const nuevos = [...raiz.querySelectorAll("[data-revelar]:not([data-visto])")];
    if (!nuevos.length) return;
    if (menosMovimiento() || !("IntersectionObserver" in window)) {
      nuevos.forEach((el) => { el.dataset.visto = "1"; });
      return;
    }
    const io = new IntersectionObserver((entradas) => {
      let k = 0;
      for (const e of entradas) {
        if (!e.isIntersecting) continue;
        // escalonado corto y con tope: la décima fila ya no espera más
        e.target.style.setProperty("--retraso", `${Math.min(k++, 10) * 32}ms`);
        e.target.dataset.visto = "1";
        io.unobserve(e.target);
      }
    }, { rootMargin: "0px 0px -4% 0px" });
    nuevos.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}

// Claves estables para las filas: la identidad del vuelo, no su posición.
// Así, al filtrar, cada fila sigue siendo "la misma" y no se re-anima. Si dos
// vuelos coincidieran en todo, el segundo lleva un sufijo.
function clavesDe(vuelos) {
  const vistas = new Map();
  return vuelos.map((f) => {
    const id = idVuelo(f);
    const n = vistas.get(id) || 0;
    vistas.set(id, n + 1);
    return n ? `${id}#${n}` : id;
  });
}

function textoEscalas(n) {
  if (n == null || n === "") return "escalas: —";
  const e = Number(n);
  if (e === 0) return "directo";
  return e === 1 ? "1 escala" : `${e} escalas`;
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

// Los iconos son dibujos de una sola familia (Phosphor), no emojis: un emoji
// lo pinta cada sistema a su manera (el paraguas salía azul en Windows) y se
// salía de la paleta.
function Clima({ c }) {
  if (!c) return <span className="muted">—</span>;
  const nivel = nivelTemp(num(c.temp_media));
  return (
    <span className="clima">
      <span className="sr-only">
        {fmtNum(c.temp_media, 0, " °C")} de media, {fmtNum(c.dias_lluvia, 0)} días de lluvia
        y {fmtNum(c.horas_sol_dia, 1)} horas de sol al día
      </span>
      <span aria-hidden="true">
        <span className={"temp " + (nivel || "")}><Thermometer className="ico" /> {fmtNum(c.temp_media, 0, "°")}</span>
        {" · "}
        <span className="lluvia"><CloudRain className="ico" /> {fmtNum(c.dias_lluvia, 0)}d</span>
        {" · "}
        <span className="sol"><Sun className="ico" /> {fmtNum(c.horas_sol_dia, 1)}h</span>
      </span>
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

// El número va siempre en tinta (el naranja y el dorado como texto no se
// leen sobre crema); el color del tramo vive en la barra, que crece desde
// cero cuando la fila entra en pantalla.
function Nota({ score, chip = false }) {
  if (score == null) {
    return <span className="muted" title="Sin datos suficientes para puntuar">—</span>;
  }
  return (
    <span className={(chip ? "chip nota " : "nota ") + nivelNota(score)}>
      <b>{score}</b>
      <span className="nota-de">/100</span>
      <span className="nota-barra" aria-hidden="true">
        <span style={{ "--v": score / 100 }} />
      </span>
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
// Construye un CSV a partir de una lista de objetos: las columnas salen de
// las claves. Lo usan la descarga de valoraciones y la de resultados.
function csvDeFilas(registros) {
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
function DetalleVuelo({ f, meta, senales, fechaConsulta, valoracion, aeropuerto, onGuardar, onBorrar, onCerrar, cerrarRef }) {
  // El deslizador arranca donde lo dejaste, o en la nota de muuyal si es la
  // primera vez: así valorar es "corregirle". Al abrir otro vuelo, el padre
  // remonta esta pantalla (le pasa una `key` distinta) y el estado se rehace.
  const [nota, setNota] = useState(
    valoracion ? Number(valoracion.nota_usuario) : (f.score ?? 50));
  const [motivo, setMotivo] = useState(valoracion?.motivo || "");
  const [guardado, setGuardado] = useState(false);
  // "saliendo": la ficha está haciendo su animación de salida; al acabar se
  // desmonta de verdad. Sin este paso, cerrar sería un corte seco.
  const [saliendo, setSaliendo] = useState(false);
  const fondoRef = useRef(null);
  const modalRef = useRef(null);
  const arrastre = useRef(null);
  // La ficha avisa de que se ha cerrado una sola vez, llegue el aviso por el
  // final de la animación, por el temporizador de seguridad o por el gesto.
  const cerrada = useRef(false);
  const fin = () => {
    if (cerrada.current) return;
    cerrada.current = true;
    onCerrar();
  };

  const cerrar = () => {
    if (saliendo) return;
    if (menosMovimiento()) { fin(); return; }
    setSaliendo(true);
    // por si el navegador no avisa del final de la animación (pestaña oculta)
    setTimeout(fin, 420);
  };
  // el botón Atrás del móvil también la cierra con su animación, no de golpe
  if (cerrarRef) cerrarRef.current = cerrar;

  useEffect(() => {
    const previo = document.activeElement;
    // El foco entra en la ficha al abrirla (para el teclado y los lectores de
    // pantalla) y vuelve a la fila de la que salió al cerrarla.
    modalRef.current?.focus({ preventScroll: true });
    const teclas = (ev) => {
      if (ev.key === "Escape") { cerrar(); return; }
      if (ev.key !== "Tab" || !modalRef.current) return;
      // el tabulador da vueltas dentro de la ficha en vez de escaparse detrás
      // solo lo que se ve y se puede usar: nada desactivado, oculto o plegado
      const enfocables = [...modalRef.current.querySelectorAll(
        "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), " +
        "textarea:not([disabled]), [tabindex]:not([tabindex='-1'])")]
        .filter((el) => el.offsetParent !== null && !el.closest("[inert]"));
      if (!enfocables.length) return;
      const primero = enfocables[0];
      const ultimo = enfocables[enfocables.length - 1];
      if (ev.shiftKey && (document.activeElement === primero || document.activeElement === modalRef.current)) {
        ev.preventDefault(); ultimo.focus();
      } else if (!ev.shiftKey && document.activeElement === ultimo) {
        ev.preventDefault(); primero.focus();
      }
    };
    document.addEventListener("keydown", teclas);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", teclas);
      document.body.style.overflow = "";
      if (cerrarRef) cerrarRef.current = null;
      if (previo && typeof previo.focus === "function") previo.focus({ preventScroll: true });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // --- En el móvil la ficha es una hoja que se baja con el dedo -------------
  // Se coge por la cabecera. Sigue al dedo 1:1 hacia abajo y, hacia arriba,
  // ofrece resistencia en vez de un tope seco. Al soltar se cierra si se ha
  // bajado bastante o si el gesto ha sido un tirón rápido, aunque sea corto.
  const empezarArrastre = (ev) => {
    if (arrastre.current || saliendo) return;          // un solo dedo manda
    if (!window.matchMedia("(max-width: 800px)").matches) return;
    if (ev.target.closest("button, a, input, select")) return;
    arrastre.current = {
      id: ev.pointerId, y0: ev.clientY, dy: 0, capturado: false,
      // últimas posiciones del dedo: la velocidad que cuenta es la del final
      // del gesto, no la media desde que empezó
      muestras: [{ y: ev.clientY, t: performance.now() }],
    };
  };
  const moverArrastre = (ev) => {
    const a = arrastre.current;
    if (!a || ev.pointerId !== a.id) return;
    const dy = ev.clientY - a.y0;
    if (!a.capturado) {
      if (Math.abs(dy) < 6) return;                      // aún puede ser un toque
      ev.currentTarget.setPointerCapture(ev.pointerId);
      a.capturado = true;
    }
    // hacia arriba, cuanto más se tira menos se mueve
    const y = dy >= 0 ? dy : -(Math.abs(dy) * 40) / (40 + Math.abs(dy));
    a.dy = dy;
    const ahora = performance.now();
    a.muestras.push({ y: ev.clientY, t: ahora });
    while (a.muestras.length > 2 && ahora - a.muestras[0].t > 100) a.muestras.shift();
    const m = modalRef.current;
    m.style.transition = "none";
    m.style.transform = `translateY(${y}px)`;
    const alto = m.getBoundingClientRect().height || 1;
    fondoRef.current.style.opacity = String(1 - Math.min(Math.max(dy, 0) / alto, 1) * 0.85);
  };
  const soltarArrastre = (ev) => {
    const a = arrastre.current;
    if (!a || ev.pointerId !== a.id) return;
    arrastre.current = null;
    if (!a.capturado) return;
    const m = modalRef.current;
    // px por ms en los últimos ~100 ms: un tirón rápido cierra aunque sea
    // corto; bajar despacio y pararse devuelve la hoja a su sitio
    const ahora = performance.now();
    const ref = a.muestras.find((m) => ahora - m.t <= 100) || a.muestras[a.muestras.length - 1];
    const velocidad = (ev.clientY - ref.y) / Math.max(16, ahora - ref.t);
    if (a.dy > 120 || velocidad > 0.11) {
      m.style.transition = "transform 260ms cubic-bezier(0.23, 1, 0.32, 1)";
      m.style.transform = "translateY(100%)";
      fondoRef.current.style.transition = "opacity 260ms ease";
      fondoRef.current.style.opacity = "0";
      setTimeout(fin, 260);
    } else {
      m.style.transition = "transform 420ms cubic-bezier(0.32, 0.72, 0, 1)";
      m.style.transform = "";
      fondoRef.current.style.transition = "opacity 300ms ease";
      fondoRef.current.style.opacity = "";
    }
  };

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
    <div className={"modal-fondo" + (saliendo ? " saliendo" : "")} onClick={cerrar} role="presentation">
      {/* El velo oscuro va en su propia capa, detrás de la ficha: así se puede
          aclarar mientras se baja la hoja con el dedo sin volver transparente
          la ficha, que va encima. */}
      <div className="modal-velo" ref={fondoRef} aria-hidden="true" />
      <div
        className={"modal" + (saliendo ? " saliendo" : "")}
        role="dialog"
        aria-modal="true"
        aria-label="Detalle del vuelo"
        tabIndex={-1}
        ref={modalRef}
        onClick={(ev) => ev.stopPropagation()}
        onAnimationEnd={(ev) => { if (saliendo && ev.target === modalRef.current) fin(); }}
      >
        <div
          className="modal-cabecera"
          onPointerDown={empezarArrastre}
          onPointerMove={moverArrastre}
          onPointerUp={soltarArrastre}
          onPointerCancel={soltarArrastre}
        >
          <span className="modal-asa" aria-hidden="true" />
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
          <button type="button" className="btn-cerrar" onClick={cerrar} aria-label="Cerrar">
            <X aria-hidden="true" />
          </button>
        </div>

        <div className="modal-cuerpo">
          <section className="modal-nota">
            <div className="modal-nota-num">
              <span className={"nota grande " + nivelNota(f.score)}>
                <NumeroQueSube valor={f.score} duracion={800} formato={(n) => String(n)} />
                <span className="nota-de">/100</span>
                {f.score != null && (
                  <span className="nota-barra" aria-hidden="true">
                    <span style={{ "--v": f.score / 100 }} />
                  </span>
                )}
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
            <h2 className="titulo-seccion">Tu valoración</h2>
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
                style={{ "--p": `${nota}%` }}
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
              <div className="motivo-plegable"><div className="motivo">
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
              </div></div>
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
                {/* la `key` hace que el texto nuevo entre con un breve
                    desenfoque en vez de cambiar de golpe */}
                <span className="morfo" key={guardado ? "si" : "no"}>
                  {guardado ? <><Check aria-hidden="true" /> Guardado</> : "Guardar valoración"}
                </span>
              </button>
              {valoracion && (
                <button type="button" className="btn-sec" onClick={() => { onBorrar(f); cerrar(); }}>
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
            <h2 className="titulo-seccion">Por qué puntúa lo que puntúa</h2>
            {desglose.length === 0 ? (
              <p className="muted">No hay datos suficientes para puntuar este vuelo.</p>
            ) : (
              <>
                <table className="desglose">
                  <thead>
                    <tr><th>Señal</th><th>Peso</th><th>Nota (0–1)</th><th>Aporta</th></tr>
                  </thead>
                  <tbody>
                    {desglose.map((d, i) => (
                      <tr key={d.senal}>
                        <td>{d.label}</td>
                        <td>{d.peso}</td>
                        <td>{d.norm.toFixed(2).replace(".", ",")}</td>
                        <td className="nowrap">
                          <span className="aporte-barra" aria-hidden="true">
                            <span style={{ "--v": d.aporte / d.peso, "--i": i }} />
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
            <h2 className="titulo-seccion">El vuelo</h2>
            <div className="datos">
              {dato("Salida", fmtFecha(f.departure_at))}
              {dato("Vuelta", f.tipo_llamada === "RD" ? fmtFecha(f.return_at) : "—")}
              {dato("Aerolínea", `${f.airline || "—"} ${f.flight_number || ""}`)}
              {dato("Duración", fmtDuracion(f.duration))}
              {dato("Escalas", f.tipo_llamada === "RD"
                ? `${f.transfers ?? "—"} + ${f.return_transfers ?? "—"}`
                : textoEscalas(f.transfers))}
              {dato("Distancia", f.distancia_km != null ? `${f.distancia_km.toLocaleString("es-ES")} km` : "—")}
              {dato("Precio", `${fmtNum(f.price, 0)} €`)}
              {dato("Precio guardado", <Frescura f={f} fechaConsulta={fechaConsulta} />)}
              {/* De dónde sale este número importa: no es lo mismo el precio
                  normal del destino EN SU MES (maestro de precios) que la
                  mediana de esta búsqueda, que mezcla todos los meses y por
                  temporada puede quedarse corta o larga. */}
              {dato("Normal a ese destino",
                f.oportunidad_base != null
                  ? `${fmtNum(f.oportunidad_base, 0)} € ${
                      f.oportunidad_base_origen === "maestro"
                        ? "(su mes, histórico)"
                        : "(mediana de esta búsqueda)"}`
                  : <span className="muted">pocos vuelos para saberlo</span>)}
              {dato("Vendido por", f.gate || "—")}
            </div>
          </section>

          <section>
            <h2 className="titulo-seccion">El destino en el mes de salida</h2>
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

// El logo es simétrico al girarlo media vuelta: por eso puede dar media vuelta
// (al pasar el ratón, o en bucle mientras busca) y quedar exactamente igual.
// `pathLength` deja que los trazos se "dibujen" al cargar la página.
function Logo({ className, titulo = "Muuyal" }) {
  return (
    <svg className={className} viewBox="0 0 200 140" role="img" aria-label={titulo}>
      <g className="logo-giro">
        <g fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round">
          <path className="logo-trazo" pathLength="1"
                d="M 100 70 C 116 50 142 46 154 58 C 164 68 160 82 148 84 C 139 85.5 133 78 137 71" />
          <path
            className="logo-trazo" pathLength="1"
            d="M 100 70 C 116 50 142 46 154 58 C 164 68 160 82 148 84 C 139 85.5 133 78 137 71"
            transform="rotate(180 100 70)"
          />
        </g>
        <g fill="currentColor">
          <circle className="logo-punto" cx="100" cy="32" r="9" />
          <circle className="logo-punto" cx="100" cy="108" r="9" />
        </g>
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
  // sugerencia marcada con las flechas del teclado (-1 = ninguna)
  const [activa, setActiva] = useState(-1);
  // cuántas búsquedas han llegado: cambia la "identidad" de la lista, y con
  // ella vuelve a jugarse la entrada escalonada de las filas
  const [nBusqueda, setNBusqueda] = useState(0);
  // en el móvil, con resultados, el buscador se pliega en una línea
  const [formAbierto, setFormAbierto] = useState(false);
  const metaRef = useRef(null);
  const listaRef = useRef(null);

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
    setFormAbierto(false);
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
      const datos = await resp.json();
      // la portada (el mapa) da paso a los resultados con un fundido, no con
      // un corte; en navegadores sin esa función, el cambio es directo
      conTransicion(() => {
        setResult(datos);
        setNBusqueda((n) => n + 1);
      });
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
    // Una búsqueda grande tarda minutos: no se tira por un toque sin querer
    // en el logo.
    if (peticionRef.current &&
        !window.confirm("Hay una búsqueda en marcha. ¿Cortarla y volver a la portada?")) return;
    peticionRef.current?.abort();
    peticionRef.current = null;
    conTransicion(() => {
      setLoading(false);
      setResult(null);
      setError(null);
      setDetalle(null);
      setOrigin("");
      setOriginQuery("");
      setGroup("");
      setPanelAbierto(false);
      setFormAbierto(false);
      setFiltroTipo(""); setFiltroDestino(""); setMaxCache("");
      setPais(""); setRangos({}); setPage(0); setOrden("score");
    });
    window.scrollTo({ top: 0 });
  }

  // Elegir una sugerencia del buscador de origen (con el ratón, el dedo o
  // Intro sobre la marcada con las flechas).
  function elegirSugerencia(a) {
    setOrigin(a.code);
    setOriginQuery(`${a.code} — ${a.name}`);
    setShowSugerencias(false);
    setActiva(-1);
  }

  // Ir a otra página de resultados te deja al principio de la lista, no en
  // el sitio donde pulsaste la flecha (que es el final).
  // El salto es inmediato a propósito: un desplazamiento suave desde el final
  // de una lista larga tardaba más de un segundo; las filas de la página nueva
  // ya entran con su propia animación.
  function irAPagina(n) {
    setPage(n);
    metaRef.current?.scrollIntoView({ block: "start" });
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

  // Los destinos que se consultan en la búsqueda en curso, con la misma regla
  // que el servidor (backend/data.py, destinos_de_grupo): los de la zona, o
  // los del Top 151, menos el propio origen. Ordenados del más cercano al más
  // lejano, que es el orden en que el mapa dibuja sus rutas.
  const rutasBusqueda = useMemo(() => {
    if (!loading || !aeropuertoOrigen || !group) return [];
    const o = aeropuertoOrigen;
    const lejania = (a) => {
      // distancia angular sobre la esfera; solo hace falta para ordenar
      const p = Math.PI / 180;
      const c = Math.sin(o.lat * p) * Math.sin(a.lat * p) +
        Math.cos(o.lat * p) * Math.cos(a.lat * p) * Math.cos((a.lon - o.lon) * p);
      return Math.acos(Math.max(-1, Math.min(1, c)));
    };
    return airports
      .filter((a) => a.code !== o.code && a.lat != null && a.lon != null &&
        (group === "Top151" ? a.top151 : a.zone === group))
      .map((a) => ({ a, d: lejania(a) }))
      .sort((x, y) => x.d - y.d)
      .map((x) => x.a);
  }, [loading, aeropuertoOrigen, group, airports]);

  // --- La ficha de un vuelo y el botón "Atrás" del móvil ------------------
  // Abrir una ficha deja una entrada en el historial del navegador, así que
  // el gesto o el botón de Atrás la cierra en vez de sacarte de la web.
  const abrirFicha = (f) => {
    if (!detalle) window.history.pushState({ muuyalFicha: true }, "");
    setDetalle(f);
  };
  // La ficha ya ha hecho su animación de salida (X, Escape, dedo o Atrás):
  // falta quitar su entrada del historial, si sigue ahí, y desmontarla.
  const cerrarFicha = () => {
    if (window.history.state?.muuyalFicha) {
      yaCerrada.current = true;
      window.history.back();   // lo remata el popstate
    } else setDetalle(null);
  };
  const cerrarFichaRef = useRef(null);   // el "cerrar con animación" de la ficha abierta
  const yaCerrada = useRef(false);
  useEffect(() => {
    const atras = () => {
      if (yaCerrada.current || !cerrarFichaRef.current) {
        yaCerrada.current = false;
        setDetalle(null);
      } else cerrarFichaRef.current();     // Atrás del móvil: que se vaya bajando
    };
    window.addEventListener("popstate", atras);
    return () => window.removeEventListener("popstate", atras);
  }, []);

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
    descargarTexto(`valoraciones_muuyal_${hoy}.csv`, csvDeFilas(regs));
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

  // Descarga TODOS los vuelos de esta búsqueda con sus precios. Ese archivo es
  // el que alimenta el maestro de precios por ruta y mes (ACTUALIZAR_PRECIOS.md):
  // buscas, descargas, mandas el archivo, y el precio normal de cada destino
  // mejora. Se exportan también los redondos aunque el maestro no los use, para
  // no tirar datos que quizá sirvan más adelante.
  const descargarResultados = () => {
    if (!result || !result.flights.length) return;
    const m = result.meta;
    // Identifica la búsqueda entera. Si vuelves a mandar el mismo archivo, el
    // script lo reconoce por aquí y no lo cuenta dos veces.
    const busquedaId = `${m.origin}|${m.group}|${m.fecha_consulta}`;
    const filas = result.flights.map((f) => ({
      busqueda_id: busquedaId,
      busqueda_origen: m.origin,
      busqueda_grupo: m.group,
      busqueda_fecha: m.fecha_consulta,
      // La misma identidad que usan las valoraciones: es de contenido, así que
      // el mismo vuelo se reconoce entre búsquedas distintas. El enlace de
      // Aviasales NO sirve: lleva dentro la fecha de búsqueda y un
      // identificador de un solo uso, y cambia cada vez.
      id_vuelo: idVuelo(f),
      tipo_llamada: f.tipo_llamada ?? "",
      destino: f.enrich_airport ?? "",
      mes: f.enrich_month ?? "",
      departure_at: f.departure_at ?? "",
      return_at: f.return_at ?? "",
      airline: f.airline ?? "",
      flight_number: f.flight_number ?? "",
      price: f.price ?? "",
      dia_busqueda: f.dia_busqueda ?? "",
      gate: f.gate ?? "",
    }));
    const nombre = `muuyal_resultados_${m.origin}_`
      + `${m.group.replace(/[^A-Za-z0-9]+/g, "-")}_${m.fecha_consulta}.csv`;
    descargarTexto(nombre, csvDeFilas(filas));
  };

  // Los mismos dos botones valen en la portada y en la barra de filtros.
  const BotonesValoraciones = () => (
    <>
      <button
        type="button"
        className="btn-sec"
        onClick={descargarValoraciones}
        title="Descarga un CSV con tus valoraciones para afinar la fórmula"
      >
        <DownloadSimple aria-hidden="true" /> Descargar mis valoraciones
        <span className="badge-filtros" key={nValoraciones}>{nValoraciones}</span>
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
  const pagina = useMemo(
    () => vuelosFiltrados.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [vuelosFiltrados, page]);
  const claves = useMemo(() => clavesDe(pagina), [pagina]);
  // La lista "cambia de identidad" con cada búsqueda, página u orden: ahí las
  // filas vuelven a entrar escalonadas. Al filtrar no cambia (ver useRevelar).
  const identidadLista = `${nBusqueda}|${page}|${orden}`;
  useRevelar(listaRef, [pagina, identidadLista]);

  const nombreGrupo = (z) => (z === "Top151" ? "Top 151 mundial" : `Zona: ${z}`);
  const listaSugerencias = showSugerencias && sugerencias.length > 0 && !origin;

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
      {/* En el móvil, con resultados, el buscador se queda en una línea que
          se despliega al tocarla: los vuelos empiezan mucho más arriba. */}
      {result && (
        <button
          type="button"
          className="resumen-busqueda"
          aria-expanded={formAbierto}
          aria-controls="buscador"
          onClick={() => setFormAbierto(!formAbierto)}
        >
          <span>
            <b>{result.meta.origin}</b> · {nombreGrupo(result.meta.group)}
          </span>
          <span className="resumen-accion">
            {formAbierto ? "Cerrar" : "Cambiar"} <CaretDown className="ico giro" aria-hidden="true" />
          </span>
        </button>
      )}
      <div className="plegable buscador-plegable" data-abierto={!result || formAbierto ? "true" : "false"}>
      <div>
      <form className="search-form" id="buscador" onSubmit={buscar}>
        <div className="field origen-field">
          <label htmlFor="origen">Aeropuerto de origen</label>
          <input
            id="origen"
            ref={inputRef}
            type="text"
            autoComplete="off"
            placeholder="Ej.: BCN o Barcelona"
            role="combobox"
            aria-expanded={listaSugerencias}
            aria-controls="sugerencias-origen"
            aria-autocomplete="list"
            aria-activedescendant={listaSugerencias && activa >= 0 ? `sugerencia-${activa}` : undefined}
            value={originQuery}
            onChange={(e) => {
              setOriginQuery(e.target.value);
              setOrigin("");
              setShowSugerencias(true);
              setActiva(-1);
            }}
            onKeyDown={(e) => {
              if (!listaSugerencias) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiva((i) => Math.min(i + 1, sugerencias.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiva((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter" && activa >= 0) {
                e.preventDefault();
                elegirSugerencia(sugerencias[activa]);
              } else if (e.key === "Escape") {
                setShowSugerencias(false);
              }
            }}
            onFocus={() => setShowSugerencias(true)}
            onBlur={() => setTimeout(() => setShowSugerencias(false), 150)}
          />
          {listaSugerencias && (
            <ul className="sugerencias" id="sugerencias-origen" role="listbox" aria-label="Aeropuertos">
              {sugerencias.map((a, i) => (
                <li
                  key={a.code}
                  id={`sugerencia-${i}`}
                  role="option"
                  aria-selected={i === activa}
                  className={i === activa ? "activa" : ""}
                  onMouseDown={() => elegirSugerencia(a)}
                  onMouseEnter={() => setActiva(i)}
                >
                  <b>{a.code}</b> {a.name} <span className="muted">({a.country_code})</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="field">
          <label htmlFor="grupo">Grupo de destinos</label>
          <select id="grupo" value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">— elige —</option>
            {zones.map((z) => (
              <option key={z} value={z}>{nombreGrupo(z)}</option>
            ))}
          </select>
        </div>

        <button type="submit" className="btn-buscar" disabled={!origin || !group || loading}>
          {loading ? "Buscando…" : "Buscar vuelos"}
        </button>
      </form>
      </div>
      </div>

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
          rutas={rutasBusqueda}
          onElegir={(a) => {
            setOrigin(a.code);
            setOriginQuery(`${a.code} — ${a.name}`);
          }}
          etiqueta={loading ? null : aeropuertoOrigen
            ? `${aeropuertoOrigen.code} — ${aeropuertoOrigen.name}`
            : "Arrastra el mapa y pulsa un aeropuerto"}
        />
      )}
      </div>

      {/* Mientras busca: cuántos destinos se están consultando y cuánto lleva,
          en una pastilla legible por encima del mapa. En el móvil se coloca
          sobre el mapa, donde está la etiqueta del aeropuerto, y no debajo. */}
      {loading && (
        <div className="loading" role="status">
          <div className="loading-pastilla">
            <Logo className="logo-cargando" titulo="" />
            <span>
              {rutasBusqueda.length > 0
                ? <>Consultando {rutasBusqueda.length} destinos… </>
                : <>Buscando vuelos… </>}
              <span className="cronometro" aria-hidden="true"><Cronometro desde={loadingDesde} /></span>
            </span>
          </div>
        </div>
      )}

      {error && (
        <div className="error" role="alert">
          <Warning className="ico" aria-hidden="true" /> {error}
        </div>
      )}

      {result && (
        <>
          <div className="meta" ref={metaRef}>
            <b><NumeroQueSube valor={result.meta.flights_found} /></b> vuelos ·{" "}
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

          {/* En el móvil, una sola fila que se desliza de lado: antes eran
              siete controles apilados y el primer vuelo quedaba fuera. */}
          <div className="filtros">
            <select aria-label="Tipo de vuelo" value={filtroTipo} onChange={(e) => { setFiltroTipo(e.target.value); setPage(0); }}>
              <option value="">Todos los tipos</option>
              <option value="OW_IDA">Solo ida</option>
              <option value="OW_VUELTA">Solo vuelta</option>
              <option value="RD">Ida y vuelta</option>
            </select>
            <input
              type="text"
              aria-label="Filtrar destino"
              placeholder="Filtrar destino…"
              value={filtroDestino}
              onChange={(e) => { setFiltroDestino(e.target.value); setPage(0); }}
            />
            <select aria-label="Antigüedad del precio" value={maxCache} onChange={(e) => { setMaxCache(e.target.value); setPage(0); }}>
              <option value="">Precio de cualquier fecha</option>
              <option value="0">Solo precios de hoy</option>
              <option value="1">Precios de hoy o ayer</option>
              <option value="3">Precios de 3 días o menos</option>
            </select>
            <select aria-label="Orden" value={orden} onChange={(e) => setOrden(e.target.value)}>
              <option value="score">Mejor puntuación</option>
              <option value="price">Más baratos</option>
              <option value="duration">Más cortos</option>
              <option value="temp">Más cálidos</option>
              <option value="popularidad">Más populares</option>
              <option value="cache">Precio más reciente</option>
              <option value="distancia">Más cerca</option>
            </select>
            <select aria-label="País" value={pais} onChange={(e) => { setPais(e.target.value); setPage(0); }}>
              <option value="">Todos los países ({paises.length})</option>
              {paises.map((p) => (
                <option key={p.code} value={p.code}>{p.nombre} ({p.n})</option>
              ))}
            </select>
            <button
              type="button"
              className="btn-sec"
              aria-expanded={panelAbierto}
              aria-controls="panel-filtros"
              onClick={() => setPanelAbierto(!panelAbierto)}
            >
              <CaretDown className="ico giro" aria-hidden="true" /> Más filtros
              {nFiltrosActivos > 0 && <span className="badge-filtros" key={nFiltrosActivos}>{nFiltrosActivos}</span>}
            </button>
            {nFiltrosActivos > 0 && (
              <button type="button" className="btn-sec aparece" onClick={limpiarFiltros}>
                Limpiar
              </button>
            )}
            <button
              type="button"
              className="btn-sec"
              onClick={descargarResultados}
              title="Descarga un CSV con los precios de esta búsqueda, para mejorar el precio normal de cada destino"
            >
              <DownloadSimple aria-hidden="true" /> Descargar resultados
              <span className="badge-filtros">{result.flights.length}</span>
            </button>
            {nValoraciones > 0 && <BotonesValoraciones />}
          </div>

          {/* El panel siempre está en la página y se despliega a su altura
              real; cerrado, `inert` lo saca del tabulador y de los lectores. */}
          <div className="plegable" data-abierto={panelAbierto ? "true" : "false"}>
            <div {...(panelAbierto ? {} : { inert: "" })}>
            <div className="panel-filtros" id="panel-filtros">
              {GRUPOS_RANGO.map((g) => (
                <div className="grupo-filtros" key={g}>
                  <h2 className="titulo-seccion">{g}</h2>
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
                                aria-label={`${r.label} ${extremo === "min" ? "mínimo" : "máximo"}`}
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
            </div>
          </div>

          {vuelosFiltrados.length === 0 && (
            <div className="vacio">
              <p><b>Ningún vuelo cumple los filtros.</b></p>
              <p className="muted">Prueba a aflojar alguno o a limpiarlos todos.</p>
              <button type="button" onClick={limpiarFiltros}>Limpiar filtros</button>
            </div>
          )}

          {vuelosFiltrados.length > 0 && (<div ref={listaRef}>
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
                  <th className="precio-cell">Precio</th>
                </tr>
              </thead>
              {/* la `key` cambia con cada búsqueda, página u orden: la lista
                  se monta de nuevo y sus filas vuelven a entrar escalonadas */}
              <tbody key={identidadLista}>
                {pagina.map((f, i) => {
                  const e = f.enrichment || {};
                  const mia = valoraciones[idVuelo(f)];
                  return (
                    <tr
                      key={claves[i]}
                      data-revelar=""
                      className="fila-vuelo"
                      onClick={() => abrirFicha(f)}
                      tabIndex={0}
                      role="button"
                      aria-label={`Ver y valorar el vuelo a ${f.enrich_airport_name || f.enrich_airport}, ${fmtNum(f.price, 0)} €`}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); abrirFicha(f); }
                      }}
                    >
                      <td className="nota-cell">
                        <Nota score={f.score} />
                        {mia && (
                          <div className="mi-nota" title="Tu valoración">
                            <Star className="ico" aria-hidden="true" /> {Math.round(Number(mia.nota_usuario))}
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
          <div className="cards" key={identidadLista}>
            {pagina.map((f, i) => {
              const e = f.enrichment || {};
              const mia = valoraciones[idVuelo(f)];
              return (
                <div
                  className="card" key={claves[i]}
                  data-revelar=""
                  onClick={() => abrirFicha(f)}
                  role="button" tabIndex={0}
                  aria-label={`Ver y valorar el vuelo a ${f.enrich_airport_name || f.enrich_airport}, ${fmtNum(f.price, 0)} €`}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); abrirFicha(f); }
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
                    {" · "}{f.tipo_llamada === "RD"
                      ? `${f.transfers ?? "—"} + ${f.return_transfers ?? "—"} escalas`
                      : textoEscalas(f.transfers)}
                    {f.distancia_km != null && <> · {f.distancia_km.toLocaleString("es-ES")} km</>}
                  </div>
                  <div className="card-chips">
                    <Nota score={f.score} chip />
                    {mia && (
                      <span className="chip mi-nota-chip">
                        <Star className="ico" aria-hidden="true" /> tu nota {Math.round(Number(mia.nota_usuario))}
                      </span>
                    )}
                    <Frescura f={f} fechaConsulta={fechaConsulta} chip />
                    {e.clima && (
                      <span className="chip">
                        <Thermometer className="ico" aria-hidden="true" /> {fmtNum(e.clima.temp_media, 0, "°")}
                        {" · "}<Sun className="ico" aria-hidden="true" /> {fmtNum(e.clima.horas_sol_dia, 1)}h
                      </span>
                    )}
                    {e.coste && (
                      <span className={"chip coste-badge n" + String(e.coste.categoria || "").length}>
                        {e.coste.categoria}
                      </span>
                    )}
                    {e.turismo && (
                      <span className="chip" title="Popularidad del destino">
                        <UsersThree className="ico" aria-hidden="true" /> {fmtNum(e.turismo.popularidad_0_100, 0)}/100
                      </span>
                    )}
                    {e.turismo_mes && <span className="chip">turismo ×{fmtNum(e.turismo_mes.turismo_idx, 2)}</span>}
                    {e.unesco && (
                      <span className="chip">
                        <Bank className="ico" aria-hidden="true" /> {e.unesco.unesco_100km} UNESCO
                      </span>
                    )}
                  </div>
                  <GapsBadges gaps={f.enrichment_gaps} />
                  <FlagsBadges flags={f.score_flags} />
                </div>
              );
            })}
          </div>
          </div>)}

          {totalPages > 1 && (
            <div className="paginacion">
              <button disabled={page === 0} onClick={() => irAPagina(page - 1)} aria-label="Página anterior">
                <ArrowLeft aria-hidden="true" />
              </button>
              <span>
                Página {page + 1} de {totalPages} · {vuelosFiltrados.length.toLocaleString("es-ES")} vuelos
              </span>
              <button disabled={page >= totalPages - 1} onClick={() => irAPagina(page + 1)} aria-label="Página siguiente">
                <ArrowRight aria-hidden="true" />
              </button>
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
          onCerrar={cerrarFicha}
          cerrarRef={cerrarFichaRef}
        />
      )}
    </div>
  );
}
