/* Globo de la portada y mapa de la ruta de un vuelo.
 *
 * Los dos son SVG de verdad (formas con contorno, no imágenes), así que todos
 * los colores salen de las variables --mu-* de la paleta, igual que el resto
 * de la app, y se ven nítidos en cualquier pantalla.
 *
 * El mapa del mundo está guardado en el repo (public/mapa/countries-110m.json,
 * ver su FUENTE.txt): la página no debe depender de ningún servidor de fuera.
 *
 * Rendimiento: el globo gira redibujándose muchas veces por segundo, así que
 * NO se repinta con React. El bucle escribe directamente el atributo `d` de
 * tres rutas (tierra, fronteras y aeropuertos), que es lo único que cambia.
 * Además se para solo cuando la pestaña no se ve o cuando el sistema pide
 * menos animaciones.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { geoOrthographic, geoEquirectangular, geoPath, geoDistance } from "d3-geo";
import { feature, mesh } from "topojson-client";

// El radio con el que se proyecta es fijo y el tamaño real lo pone el CSS:
// así no hay que recalcular nada cuando cambia el tamaño de la ventana.
const R = 100;
const LADO = R * 2;

// Vueltas por minuto del globo: lento a propósito, se nota poco el gasto.
const GRADOS_POR_SEGUNDO = 6;
const FPS = 24;
const DURACION_VIAJE = 1300;   // ms que tarda en girar hasta el aeropuerto
const ZOOM_MAX = 8;            // cuánto se puede acercar el globo

let promesaMundo = null;

// Se descarga una sola vez y se reparte entre el globo y el mapa de ruta.
function cargarMundo() {
  if (!promesaMundo) {
    promesaMundo = fetch("/mapa/countries-110m.json")
      .then((r) => r.json())
      .then((topo) => ({
        tierra: feature(topo, topo.objects.countries),
        // `mesh` con este filtro devuelve solo las fronteras interiores: las
        // líneas compartidas se dibujan una vez, no dos.
        fronteras: mesh(topo, topo.objects.countries, (a, b) => a !== b),
      }))
      .catch(() => null);
  }
  return promesaMundo;
}

function menosAnimaciones() {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Diferencia de longitud más corta (girar 10° a la derecha, no 350° a la izquierda)
function difCorta(a, b) {
  let d = (b - a) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

const suave = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Globo giratorio. Si `destino` trae un aeropuerto ({code, lat, lon}), deja de
 * girar y viaja hasta dejarlo en el centro.
 */
export function Globo({ destino, etiqueta, aeropuertos, onElegir }) {
  const [mundo, setMundo] = useState(null);
  const svgRef = useRef(null);
  const tierraRef = useRef(null);
  const fronterasRef = useRef(null);
  const puntosRef = useRef(null);
  const marcaRef = useRef(null);
  const anilloRef = useRef(null);
  const proyeccionRef = useRef(null);
  const zoom = useRef(1);
  const arrastre = useRef(null);
  // En cuanto tocas el globo deja de girar solo: si no, pelearía contigo
  // mientras lo mueves. Vuelve a girar con el botón de recentrar.
  const tocado = useRef(false);
  const repintar = useRef(true);

  // Los 575 aeropuertos, como un solo grupo de puntos. Dibujarlos así deja que
  // d3 se encargue de esconder los que caen en la cara oculta del globo.
  const puntos = useMemo(() => ({
    type: "MultiPoint",
    coordinates: (aeropuertos || [])
      .filter((a) => a.lat != null && a.lon != null)
      .map((a) => [a.lon, a.lat]),
  }), [aeropuertos]);
  // [longitud, latitud] que mira la cámara. Arranca sobre el Atlántico, con
  // el norte ligeramente inclinado hacia el espectador.
  const rot = useRef([-20, -20]);
  const viaje = useRef(null);

  useEffect(() => { cargarMundo().then(setMundo); }, []);

  // Al elegir aeropuerto se programa el viaje; al soltarlo, vuelve a girar.
  useEffect(() => {
    if (destino && destino.lat != null && destino.lon != null) {
      const objetivo = [-destino.lon, -destino.lat];
      if (menosAnimaciones()) {
        rot.current = objetivo;
        viaje.current = null;
      } else {
        viaje.current = { desde: [...rot.current], hasta: objetivo, t0: null };
      }
    } else {
      viaje.current = null;
    }
  }, [destino]);

  useEffect(() => {
    if (!mundo) return;
    const proyeccion = geoOrthographic().translate([R, R]).precision(1);
    proyeccionRef.current = proyeccion;
    const dibujo = geoPath(proyeccion);
    const dibujoPuntos = geoPath(proyeccion).pointRadius(0.9);
    const quieto = menosAnimaciones();

    let animacion = 0;
    let ultimo = 0;
    let anterior = performance.now();

    const pintar = (ahora) => {
      animacion = requestAnimationFrame(pintar);
      const dt = Math.min(ahora - anterior, 100) / 1000;
      anterior = ahora;

      const v = viaje.current;
      if (v) {
        if (v.t0 == null) v.t0 = ahora;
        const t = Math.min(1, (ahora - v.t0) / DURACION_VIAJE);
        const k = suave(t);
        rot.current = [
          v.desde[0] + difCorta(v.desde[0], v.hasta[0]) * k,
          v.desde[1] + (v.hasta[1] - v.desde[1]) * k,
        ];
        if (t >= 1) viaje.current = null;
      } else if (!destino && !tocado.current && !quieto && !document.hidden) {
        rot.current = [rot.current[0] + GRADOS_POR_SEGUNDO * dt, rot.current[1]];
      } else if (!repintar.current && ultimo) {
        return;   // nada que mover: no se repinta
      }

      if (ahora - ultimo < 1000 / FPS) return;
      ultimo = ahora;
      repintar.current = false;

      proyeccion.scale((R - 0.5) * zoom.current);
      proyeccion.rotate(rot.current);
      tierraRef.current?.setAttribute("d", dibujo(mundo.tierra) || "");
      fronterasRef.current?.setAttribute("d", dibujo(mundo.fronteras) || "");
      if (puntos.coordinates.length) {
        puntosRef.current?.setAttribute("d", dibujoPuntos(puntos) || "");
      }

      // El marcador solo se pinta si el aeropuerto cae en la cara visible.
      if (destino && destino.lat != null && marcaRef.current) {
        const punto = [destino.lon, destino.lat];
        const centro = [-rot.current[0], -rot.current[1]];
        const p = geoDistance(punto, centro) < Math.PI / 2 ? proyeccion(punto) : null;
        for (const ref of [marcaRef, anilloRef]) {
          if (!ref.current) continue;
          ref.current.style.display = p ? "" : "none";
          if (p) {
            ref.current.setAttribute("cx", p[0]);
            ref.current.setAttribute("cy", p[1]);
          }
        }
      } else if (marcaRef.current) {
        marcaRef.current.style.display = "none";
        if (anilloRef.current) anilloRef.current.style.display = "none";
      }
    };

    animacion = requestAnimationFrame(pintar);
    const despertar = () => { ultimo = 0; anterior = performance.now(); repintar.current = true; };
    document.addEventListener("visibilitychange", despertar);
    return () => {
      cancelAnimationFrame(animacion);
      document.removeEventListener("visibilitychange", despertar);
    };
  }, [mundo, destino, puntos]);

  // --- manejar el globo con el ratón o el dedo -------------------------

  // Píxeles de pantalla -> unidades del dibujo (el viewBox mide 200x200).
  const aUnidades = (ev) => {
    const r = svgRef.current.getBoundingClientRect();
    return [(ev.clientX - r.left) * (LADO / r.width),
            (ev.clientY - r.top) * (LADO / r.height)];
  };

  const empezarArrastre = (ev) => {
    svgRef.current.setPointerCapture(ev.pointerId);
    arrastre.current = {
      desde: aUnidades(ev),
      cliente: [ev.clientX, ev.clientY],
      rot: [...rot.current],
      movidoPx: 0,
    };
    tocado.current = true;
    viaje.current = null;
  };

  const moverArrastre = (ev) => {
    const a = arrastre.current;
    if (!a) return;
    const [x, y] = aUnidades(ev);
    const dx = x - a.desde[0];
    const dy = y - a.desde[1];
    // El movimiento para distinguir "clic" de "arrastre" se mide en píxeles de
    // pantalla, no en unidades del dibujo: así se comporta igual en el móvil.
    a.movidoPx = Math.max(a.movidoPx,
      Math.hypot(ev.clientX - a.cliente[0], ev.clientY - a.cliente[1]));
    // Cuántos grados gira cada unidad del dibujo. Cuanto más cerca (más zoom),
    // menos gira: si no, con el globo ampliado se iría de las manos.
    const grados = 57.3 / ((R - 0.5) * zoom.current);
    rot.current = [
      a.rot[0] + dx * grados,
      Math.max(-90, Math.min(90, a.rot[1] - dy * grados)),
    ];
    repintar.current = true;
  };

  // Un clic (arrastre de casi nada) elige el aeropuerto más cercano al dedo.
  const soltarArrastre = (ev) => {
    const a = arrastre.current;
    arrastre.current = null;
    if (!a || a.movidoPx > 8 || !onElegir) return;
    const proyeccion = proyeccionRef.current;
    if (!proyeccion) return;
    const [x, y] = aUnidades(ev);
    const centro = [-rot.current[0], -rot.current[1]];
    // Se acierta un aeropuerto si el dedo cae a menos de esta distancia EN
    // PANTALLA, no en el mapa: así la zona de acierto es la misma se vea el
    // globo grande o pequeño, y con el dedo es más ancha que con el ratón.
    const px = ev.pointerType === "touch" ? 26 : 14;
    const rect = svgRef.current.getBoundingClientRect();
    let mejor = null;
    let mejorDist = px * (LADO / rect.width);
    for (const ap of aeropuertos || []) {
      if (ap.lat == null || ap.lon == null) continue;
      if (geoDistance([ap.lon, ap.lat], centro) >= Math.PI / 2) continue;  // cara oculta
      const p = proyeccion([ap.lon, ap.lat]);
      if (!p) continue;
      const d = Math.hypot(p[0] - x, p[1] - y);
      if (d < mejorDist) { mejorDist = d; mejor = ap; }
    }
    if (mejor) onElegir(mejor);
  };

  const acercar = (factor) => {
    zoom.current = Math.max(1, Math.min(ZOOM_MAX, zoom.current * factor));
    tocado.current = true;
    repintar.current = true;
  };

  const recentrar = () => {
    zoom.current = 1;
    tocado.current = false;      // vuelve a girar solo
    arrastre.current = null;
    repintar.current = true;
  };

  // La rueda se engancha a mano y no con onWheel: React la escucha en modo
  // "pasivo" y ahí no se puede evitar que la página se desplace a la vez.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const rueda = (ev) => {
      ev.preventDefault();
      zoom.current = Math.max(1, Math.min(ZOOM_MAX,
        zoom.current * Math.exp(-ev.deltaY * 0.0015)));
      tocado.current = true;
      repintar.current = true;
    };
    svg.addEventListener("wheel", rueda, { passive: false });
    return () => svg.removeEventListener("wheel", rueda);
  }, []);

  return (
    <div className="globo">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${LADO} ${LADO}`}
        role="img"
        aria-label={destino ? `Globo terráqueo centrado en ${destino.code}` : "Globo terráqueo girando"}
        onPointerDown={empezarArrastre}
        onPointerMove={moverArrastre}
        onPointerUp={soltarArrastre}
        onPointerCancel={() => { arrastre.current = null; }}
      >
        {/* Al ampliar, el planeta crece pero la ventana redonda no: se recorta
            para que no se salga del disco. */}
        <clipPath id="globo-disco"><circle cx={R} cy={R} r={R} /></clipPath>
        <g clipPath="url(#globo-disco)">
          <circle cx={R} cy={R} r={R} className="globo-mar" />
          <path ref={tierraRef} className="globo-tierra" />
          <path ref={fronterasRef} className="globo-fronteras" />
          <path ref={puntosRef} className="globo-puntos" />
          <circle ref={anilloRef} r="7" className="globo-anillo" style={{ display: "none" }} />
          <circle ref={marcaRef} r="3.2" className="globo-marca" style={{ display: "none" }} />
        </g>
        {/* borde del planeta, del mismo grosor que las fronteras. Va fuera del
            recorte y con el radio medio trazo hacia dentro, para que no se
            coma la mitad de la línea el propio recorte. */}
        <circle cx={R} cy={R} r={R - 0.175} className="globo-borde" />
      </svg>
      <div className="globo-pie">
        {etiqueta && <div className="globo-etiqueta">{etiqueta}</div>}
        <div className="globo-controles">
          <button type="button" onClick={() => acercar(1 / 1.4)} aria-label="Alejar" title="Alejar">−</button>
          <button type="button" onClick={recentrar} aria-label="Recentrar y volver a girar" title="Recentrar">⟲</button>
          <button type="button" onClick={() => acercar(1.4)} aria-label="Acercar" title="Acercar">+</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Mapa plano con la ruta de un vuelo: una línea punteada de origen a destino.
 * Es la línea directa entre los dos aeropuertos; las escalas no se dibujan.
 */
export function MapaRuta({ origen, destino }) {
  const [mundo, setMundo] = useState(null);
  useEffect(() => { cargarMundo().then(setMundo); }, []);

  if (!mundo || !origen || !destino ||
      origen.lat == null || destino.lat == null) return null;

  const ancho = 360, alto = 160, margen = 26;

  // Dos puntos y d3 dibuja el arco real entre ellos (la ruta más corta sobre
  // la esfera), cortándolo bien si cruza el borde del mapa.
  const ruta = {
    type: "LineString",
    coordinates: [[origen.lon, origen.lat], [destino.lon, destino.lat]],
  };

  // El mapa se acerca a la ruta para que se vea, pero con un tope: en un vuelo
  // corto no queremos quedarnos sin contexto alrededor. Un vuelo largo acaba
  // enseñando medio mundo, que es justo lo que se quiere ver.
  const proyeccion = geoEquirectangular();
  proyeccion.fitExtent([[margen, margen], [ancho - margen, alto - margen]], ruta);
  const tope = 3 * (alto / Math.PI);
  if (proyeccion.scale() > tope) {
    proyeccion.scale(tope);
    const [[x0, y0], [x1, y1]] = geoPath(proyeccion).bounds(ruta);
    const [tx, ty] = proyeccion.translate();
    proyeccion.translate([
      tx + (ancho - (x1 - x0)) / 2 - x0,
      ty + (alto - (y1 - y0)) / 2 - y0,
    ]);
  }
  const dibujo = geoPath(proyeccion);
  const a = proyeccion([origen.lon, origen.lat]);
  const b = proyeccion([destino.lon, destino.lat]);

  return (
    <div className="mapa-ruta">
      <svg viewBox={`0 0 ${ancho} ${alto}`} role="img"
           aria-label={`Ruta de ${origen.code} a ${destino.code}`}>
        {/* el recorte evita que la tierra se salga del marco al acercarse */}
        <clipPath id="mapa-marco">
          <rect width={ancho} height={alto} rx="6" />
        </clipPath>
        <g clipPath="url(#mapa-marco)">
        <rect width={ancho} height={alto} className="mapa-mar" />
        <path d={dibujo(mundo.tierra)} className="mapa-tierra" />
        <path d={dibujo(mundo.fronteras)} className="mapa-fronteras" />
        <path d={dibujo(ruta)} className="mapa-linea" />
        <circle cx={a[0]} cy={a[1]} r="3.5" className="mapa-punto origen" />
        <circle cx={b[0]} cy={b[1]} r="4.5" className="mapa-punto destino" />
        <text x={a[0]} y={a[1] - 7} className="mapa-texto">{origen.code}</text>
        <text x={b[0]} y={b[1] - 9} className="mapa-texto destino">{destino.code}</text>
        </g>
      </svg>
      <p className="muted small">
        Línea directa entre los dos aeropuertos. Las escalas no se dibujan.
      </p>
    </div>
  );
}
