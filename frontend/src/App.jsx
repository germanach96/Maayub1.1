import { useEffect, useMemo, useRef, useState } from "react";

const TIPOS = {
  OW_IDA: { label: "Ida", color: "#2563eb" },
  OW_VUELTA: { label: "Vuelta", color: "#7c3aed" },
  RD: { label: "Ida y vuelta", color: "#059669" },
};

const GAP_LABELS = {
  coste: "coste",
  turismo: "turismo",
  turismo_mes: "turismo/mes",
  clima: "clima",
  unesco: "unesco",
};

const PAGE_SIZE = 50;

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
  const t = TIPOS[tipo] || { label: tipo, color: "#6b7280" };
  return (
    <span className="tipo-badge" style={{ background: t.color }}>
      {t.label}
    </span>
  );
}

function Clima({ c }) {
  if (!c) return <span className="muted">—</span>;
  return (
    <span className="clima">
      🌡 {fmtNum(c.temp_media, 0, "°")} · ☔ {fmtNum(c.dias_lluvia, 0)}d · ☀ {fmtNum(c.horas_sol_dia, 1)}h
    </span>
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
  const [orden, setOrden] = useState("price");
  const [page, setPage] = useState(0);

  const inputRef = useRef(null);

  useEffect(() => {
    fetch("/api/airports").then((r) => r.json()).then(setAirports).catch(() => {});
    fetch("/api/zones").then((r) => r.json()).then(setZones).catch(() => {});
  }, []);

  const sugerencias = useMemo(() => {
    const q = originQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return airports
      .filter(
        (a) =>
          a.code.toLowerCase().startsWith(q) ||
          (a.name || "").toLowerCase().includes(q)
      )
      .slice(0, 8);
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
    try {
      const resp = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin, group }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.detail || `Error ${resp.status}`);
      }
      setResult(await resp.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const fechaConsulta = result?.meta?.fecha_consulta;

  const vuelosFiltrados = useMemo(() => {
    if (!result) return [];
    let v = result.flights;
    if (filtroTipo) v = v.filter((f) => f.tipo_llamada === filtroTipo);
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
    const key = {
      price: (f) => Number(f.price) || Infinity,
      duration: (f) => Number(f.duration) || Infinity,
      temp: (f) => -(f.enrichment?.clima?.temp_media ?? -Infinity),
      popularidad: (f) => -(f.enrichment?.turismo?.popularidad_0_100 ?? -Infinity),
      cache: (f) => diasCache(f, fechaConsulta) ?? Infinity,
    }[orden];
    return [...v].sort((a, b) => key(a) - key(b));
  }, [result, filtroTipo, filtroDestino, maxCache, orden, fechaConsulta]);

  const totalPages = Math.max(1, Math.ceil(vuelosFiltrados.length / PAGE_SIZE));
  const pagina = vuelosFiltrados.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="app">
      <header>
        <h1>muuyal</h1>
        <p className="subtitle">búsqueda de vuelos con datos de destino</p>
      </header>

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

      {loading && (
        <div className="loading">
          <div className="spinner" />
          <p>
            Consultando la API de Aviasales… <Cronometro desde={loadingDesde} />
          </p>
          <p className="muted">
            Se lanzan cientos de consultas (3 por destino). En el servidor gratuito
            la primera búsqueda puede tardar 1–3 minutos, y más si estaba dormido.
          </p>
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
              <option value="price">Más baratos</option>
              <option value="duration">Más cortos</option>
              <option value="temp">Más cálidos</option>
              <option value="popularidad">Más populares</option>
              <option value="cache">Precio más reciente</option>
            </select>
          </div>

          {/* Desktop: tabla */}
          <div className="tabla-wrap">
            <table>
              <thead>
                <tr>
                  <th>Vuelo</th>
                  <th>Salida</th>
                  <th>Vuelta</th>
                  <th>Aerolínea</th>
                  <th>Escalas</th>
                  <th>Duración</th>
                  <th>Destino</th>
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
                  return (
                    <tr key={i}>
                      <td>
                        <TipoBadge tipo={f.tipo_llamada} />
                        <div className="ruta">{f.origin_airport || f.origin} → {f.destination_airport || f.destination}</div>
                        <GapsBadges gaps={f.enrichment_gaps} />
                      </td>
                      <td>{fmtFecha(f.departure_at)}</td>
                      <td>{f.tipo_llamada === "RD" ? fmtFecha(f.return_at) : "—"}</td>
                      <td>{f.airline || "—"} {f.flight_number || ""}</td>
                      <td>{f.transfers ?? "—"}{f.tipo_llamada === "RD" ? ` + ${f.return_transfers ?? "—"}` : ""}</td>
                      <td>{fmtDuracion(f.duration)}</td>
                      <td>
                        <b>{f.enrich_airport}</b>
                        <div className="muted small">{f.enrich_airport_name || ""}</div>
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
                      <td>
                        {e.coste ? (
                          <>
                            <b>{e.coste.categoria}</b>{" "}
                            <span className="muted small">({fmtNum(e.coste.indice_coste, 0)})</span>
                          </>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
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
                        <a href={f.link} target="_blank" rel="noreferrer" className="precio">
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
              return (
                <div className="card" key={i}>
                  <div className="card-top">
                    <div>
                      <TipoBadge tipo={f.tipo_llamada} />
                      <span className="ruta">
                        {" "}{f.origin_airport || f.origin} → {f.destination_airport || f.destination}
                      </span>
                    </div>
                    <a href={f.link} target="_blank" rel="noreferrer" className="precio">
                      {fmtNum(f.price, 0)} €
                    </a>
                  </div>
                  <div className="card-dest">
                    <b>{f.enrich_airport}</b> {f.enrich_airport_name || ""}
                  </div>
                  <div className="card-fechas muted">
                    {fmtFecha(f.departure_at)}
                    {f.tipo_llamada === "RD" && <> → {fmtFecha(f.return_at)}</>}
                    {" · "}{fmtDuracion(f.duration)}
                    {" · "}{f.transfers ?? "?"} escala(s)
                  </div>
                  <div className="card-chips">
                    <Frescura f={f} fechaConsulta={fechaConsulta} chip />
                    {e.clima && (
                      <span className="chip">🌡 {fmtNum(e.clima.temp_media, 0, "°")} · ☀ {fmtNum(e.clima.horas_sol_dia, 1)}h</span>
                    )}
                    {e.coste && <span className="chip">{e.coste.categoria}</span>}
                    {e.turismo && <span className="chip">★ {fmtNum(e.turismo.popularidad_0_100, 0)}/100</span>}
                    {e.turismo_mes && <span className="chip">turismo ×{fmtNum(e.turismo_mes.turismo_idx, 2)}</span>}
                    {e.unesco && <span className="chip">🏛 {e.unesco.unesco_100km} UNESCO</span>}
                  </div>
                  <GapsBadges gaps={f.enrichment_gaps} />
                </div>
              );
            })}
          </div>

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
    </div>
  );
}
