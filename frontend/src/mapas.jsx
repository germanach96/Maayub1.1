/* Mapa del mundo de la portada y mapa de la ruta de un vuelo.
 *
 * Los dos son SVG de verdad (formas con contorno, no imágenes), así que todos
 * los colores salen de las variables --mu-* de la paleta, igual que el resto
 * de la app, y se ven nítidos en cualquier pantalla.
 *
 * El mapa del mundo está guardado en el repo (public/mapa/countries-110m.json,
 * ver su FUENTE.txt): la página no debe depender de ningún servidor de fuera.
 *
 * Rendimiento: el mapa de la portada se desplaza continuamente, así que NO se
 * repinta con React. El truco es que un mapa plano girando de lado es
 * exactamente el mismo dibujo movido en horizontal: se dibuja el mundo dos
 * veces, una al lado de la otra, y el bucle solo escribe un `transform`. Las
 * formas únicamente se vuelven a calcular cuando cambia el zoom o el tamaño de
 * la ventana. Además se para solo cuando la pestaña no se ve o cuando el
 * sistema pide menos animaciones.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { geoEquirectangular, geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";

const RAD = Math.PI / 180;

// Grados de longitud que se desplaza el mapa por segundo: lento a propósito.
const GRADOS_POR_SEGUNDO = 2.2;
const FPS = 24;
const DURACION_VIAJE = 1300;   // ms que tarda en viajar hasta el aeropuerto
const ZOOM_MAX = 8;            // cuánto se puede acercar
// Al elegir un aeropuerto el mapa se acerca hasta aquí: enseña su región y,
// de paso, deja sitio para bajar el punto elegido por debajo del buscador
// (sin acercar, un aeropuerto muy al norte se queda pegado al techo).
const ZOOM_ELEGIDO = 2.2;
// El mapa se dibuja un 30% más grande que el hueco que ocupa. Con eso NUNCA se
// ve la Tierra entera a la vez —que enseñaría el mismo sitio dos veces— y el
// corte del mapa (el antimeridiano) queda siempre fuera de la pantalla.
const HOLGURA = 1.3;
const LAT_INICIAL = 12;        // el centro arranca un poco al norte del ecuador
const LON_INICIAL = -20;       // ...y sobre el Atlántico

let promesaMundo = null;

// Se descarga una sola vez y se reparte entre el mapa de portada y el de ruta.
function cargarMundo() {
  if (!promesaMundo) {
    promesaMundo = fetch("/mapa/countries-110m.json")
      .then((r) => r.json())
      .then((topo) => ({
        tierra: feature(topo, topo.objects.countries),
        // Las costas van como líneas sueltas, no como borde del relleno: al
        // cortar el mapa por el Pacífico, el relleno se cierra por ahí y ese
        // cierre se pintaría como una raya recta cruzando la Antártida.
        costa: mesh(topo, topo.objects.countries, (a, b) => a === b),
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

// Diferencia de longitud más corta (girar 10° a la derecha, no 350° a la izq.)
function difCorta(a, b) {
  let d = (b - a) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

const suave = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const acotar = (v, min, max) => Math.max(min, Math.min(max, v));

/**
 * Mapa del mundo apaisado que se desplaza solo de este a oeste, como si el
 * planeta pasara por delante. Se puede arrastrar, acercar y pulsar un
 * aeropuerto. Si `destino` trae uno ({code, lat, lon}), deja de moverse y
 * viaja hasta dejarlo en el centro.
 */
export function MapaMundo({ destino, etiqueta, aeropuertos, onElegir }) {
  const [mundo, setMundo] = useState(null);
  const [tam, setTam] = useState({ w: 0, h: 0 });
  const cajaRef = useRef(null);
  const svgRef = useRef(null);
  const stripRef = useRef(null);
  const copiasRef = useRef([]);
  const marcaRef = useRef(null);
  const anilloRef = useRef(null);
  const proyeccionRef = useRef(null);
  const tamRef = useRef({ w: 0, h: 0 });
  const zoom = useRef(1);
  // Cámara: qué longitud y qué latitud quedan en el centro de la pantalla.
  const lonCentro = useRef(LON_INICIAL);
  const latCentro = useRef(LAT_INICIAL);
  const punteros = useRef(new Map());
  const gesto = useRef(null);
  // En cuanto tocas el mapa deja de moverse solo: si no, pelearía contigo
  // mientras lo mueves. Vuelve a moverse con el botón de recentrar.
  const tocado = useRef(false);
  const repintar = useRef(true);
  const viaje = useRef(null);

  // Los 575 aeropuertos, como un solo grupo de puntos: un único trazo.
  const puntos = useMemo(() => ({
    type: "MultiPoint",
    coordinates: (aeropuertos || [])
      .filter((a) => a.lat != null && a.lon != null)
      .map((a) => [a.lon, a.lat]),
  }), [aeropuertos]);

  useEffect(() => { cargarMundo().then(setMundo); }, []);

  // El mapa se dibuja en píxeles de verdad (sin viewBox), así que hay que
  // saber cuánto mide su hueco: en escritorio es la pantalla entera y en el
  // móvil lo que sobra por debajo del buscador.
  useEffect(() => {
    const caja = cajaRef.current;
    if (!caja) return;
    const medir = () => {
      const r = caja.getBoundingClientRect();
      const w = Math.round(r.width);
      const h = Math.round(r.height);
      if (w !== tamRef.current.w || h !== tamRef.current.h) {
        tamRef.current = { w, h };
        setTam({ w, h });
        repintar.current = true;
      }
    };
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(caja);
    return () => obs.disconnect();
  }, []);

  // Al elegir aeropuerto se programa el viaje; al soltarlo, vuelve a moverse.
  useEffect(() => {
    if (destino && destino.lat != null && destino.lon != null) {
      const cerca = Math.max(zoom.current, ZOOM_ELEGIDO);
      if (menosAnimaciones()) {
        lonCentro.current = destino.lon;
        latCentro.current = destino.lat;
        zoom.current = cerca;
        viaje.current = null;
        repintar.current = true;
      } else {
        viaje.current = {
          desde: [lonCentro.current, latCentro.current, zoom.current],
          hasta: [destino.lon, destino.lat, cerca],
          t0: null,
        };
      }
    } else {
      viaje.current = null;
    }
  }, [destino]);

  // Escala del mapa: la que hace que cubra el hueco por completo (como una
  // foto de fondo "cover") y un poco más, la holgura de arriba.
  const escalaBase = (w, h) => Math.max(h / Math.PI, w / (2 * Math.PI)) * HOLGURA;

  // Hasta qué latitud puede subir o bajar el centro sin que asome un hueco
  // blanco por arriba o por abajo.
  const topeLat = (k, h) => Math.max(0, (Math.PI * k - h) / 2) / k / RAD;

  // Deja la proyección lista para preguntarle dónde cae un punto en pantalla.
  const configurar = (w, h) => {
    const k = escalaBase(w, h) * zoom.current;
    const tope = topeLat(k, h);
    latCentro.current = acotar(latCentro.current, -tope, tope);
    const p = proyeccionRef.current;
    p.scale(k)
      .translate([w / 2, h / 2 + k * latCentro.current * RAD])
      .rotate([-lonCentro.current, 0]);
    return k;
  };

  useEffect(() => {
    if (!mundo || !tam.w || !tam.h) return;
    const { w, h } = tam;
    proyeccionRef.current = geoEquirectangular().precision(0.7);

    // Proyección "plana" (sin girar ni centrar) con la que se calculan las
    // formas una sola vez: el movimiento es luego un simple desplazamiento.
    const plana = geoEquirectangular().translate([0, 0]).rotate([0, 0]).precision(0.7);
    const dibujo = geoPath(plana);
    const dibujoPuntos = geoPath(plana).pointRadius(1.7);
    const quieto = menosAnimaciones();

    let kDibujada = 0;
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
        lonCentro.current = v.desde[0] + difCorta(v.desde[0], v.hasta[0]) * k;
        latCentro.current = v.desde[1] + (v.hasta[1] - v.desde[1]) * k;
        // el acercamiento se interpola multiplicando, no sumando: así el
        // último tramo no parece que frene de golpe
        zoom.current = v.desde[2] * Math.pow(v.hasta[2] / v.desde[2], k);
        if (t >= 1) viaje.current = null;
      } else if (!destino && !tocado.current && !quieto && !document.hidden) {
        lonCentro.current += GRADOS_POR_SEGUNDO * dt;
      } else if (!repintar.current && ultimo) {
        return;   // nada que mover: no se repinta
      }

      if (ahora - ultimo < 1000 / FPS) return;
      ultimo = ahora;
      repintar.current = false;

      const k = configurar(w, h);
      const anchoMundo = 2 * Math.PI * k;

      // Las formas solo se recalculan si ha cambiado el zoom (o el tamaño).
      if (k !== kDibujada) {
        kDibujada = k;
        plana.scale(k);
        const formas = {
          ".mundo-tierra": dibujo(mundo.tierra) || "",
          ".mundo-costa": dibujo(mundo.costa) || "",
          ".mundo-fronteras": dibujo(mundo.fronteras) || "",
          ".mundo-puntos": puntos.coordinates.length ? (dibujoPuntos(puntos) || "") : "",
        };
        copiasRef.current.forEach((g, i) => {
          if (!g) return;
          g.setAttribute("transform", `translate(${i * anchoMundo},0)`);
          for (const [clase, d] of Object.entries(formas)) {
            g.querySelector(clase)?.setAttribute("d", d);
          }
        });
      }

      // Desplazamiento horizontal, dejado siempre entre -1 y 0 mundos: con las
      // dos copias, la pantalla queda cubierta sea cual sea el giro.
      let dx = (-lonCentro.current * RAD * k) % anchoMundo;
      if (dx > 0) dx -= anchoMundo;
      stripRef.current?.setAttribute(
        "transform",
        `translate(${w / 2 + dx},${h / 2 + k * latCentro.current * RAD})`,
      );

      // Marcador del aeropuerto elegido.
      if (destino && destino.lat != null && marcaRef.current) {
        const p = proyeccionRef.current([destino.lon, destino.lat]);
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
  }, [mundo, tam, destino, puntos]);

  // --- manejar el mapa con el ratón o el dedo ---------------------------

  const enPantalla = (ev) => {
    const r = svgRef.current.getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top];
  };

  // Cuántos grados se mueve la cámara por píxel arrastrado. Cuanto más cerca
  // (más zoom), menos: si no, con el mapa ampliado se iría de las manos.
  const gradosPorPixel = () => {
    const { w, h } = tamRef.current;
    return 180 / (Math.PI * escalaBase(w, h) * zoom.current);
  };

  const arrastreDe = (ev) => {
    const [x, y] = enPantalla(ev);
    return {
      tipo: "arrastre",
      desde: [x, y],
      cliente: [ev.clientX, ev.clientY],
      camara: [lonCentro.current, latCentro.current],
      movidoPx: 0,
    };
  };

  const distancia = () => {
    const [a, b] = [...punteros.current.values()];
    return Math.hypot(a[0] - b[0], a[1] - b[1]);
  };

  const empezarGesto = (ev) => {
    svgRef.current.setPointerCapture(ev.pointerId);
    punteros.current.set(ev.pointerId, [ev.clientX, ev.clientY]);
    tocado.current = true;
    viaje.current = null;
    if (punteros.current.size === 2) {
      // dos dedos: pellizcar para acercar
      gesto.current = { tipo: "pinza", d0: distancia(), zoom0: zoom.current };
    } else if (punteros.current.size === 1) {
      gesto.current = arrastreDe(ev);
    } else {
      gesto.current = null;
    }
  };

  const moverGesto = (ev) => {
    if (!punteros.current.has(ev.pointerId)) return;
    punteros.current.set(ev.pointerId, [ev.clientX, ev.clientY]);
    const g = gesto.current;
    if (!g) return;
    if (g.tipo === "pinza") {
      if (punteros.current.size < 2) return;
      zoom.current = acotar(g.zoom0 * (distancia() / g.d0), 1, ZOOM_MAX);
      repintar.current = true;
      return;
    }
    const [x, y] = enPantalla(ev);
    // El movimiento que distingue "clic" de "arrastre" se mide en píxeles de
    // pantalla: así se comporta igual con el dedo que con el ratón.
    g.movidoPx = Math.max(g.movidoPx,
      Math.hypot(ev.clientX - g.cliente[0], ev.clientY - g.cliente[1]));
    const grados = gradosPorPixel();
    // Arrastrar a la derecha lleva el mapa a la derecha: se mira más al oeste.
    lonCentro.current = g.camara[0] - (x - g.desde[0]) * grados;
    latCentro.current = g.camara[1] + (y - g.desde[1]) * grados;
    repintar.current = true;
  };

  // Un clic (arrastre de casi nada) elige el aeropuerto más cercano al dedo.
  const soltarGesto = (ev) => {
    const g = gesto.current;
    punteros.current.delete(ev.pointerId);
    if (punteros.current.size === 0) gesto.current = null;
    if (!g || g.tipo !== "arrastre" || g.movidoPx > 8 || !onElegir) return;
    const proyeccion = proyeccionRef.current;
    if (!proyeccion) return;
    const [x, y] = enPantalla(ev);
    // Se acierta un aeropuerto si el dedo cae a menos de esta distancia en
    // pantalla; con el dedo la zona de acierto es más ancha que con el ratón.
    let mejorDist = ev.pointerType === "touch" ? 26 : 14;
    let mejor = null;
    for (const ap of aeropuertos || []) {
      if (ap.lat == null || ap.lon == null) continue;
      const p = proyeccion([ap.lon, ap.lat]);
      if (!p) continue;
      const d = Math.hypot(p[0] - x, p[1] - y);
      if (d < mejorDist) { mejorDist = d; mejor = ap; }
    }
    if (mejor) onElegir(mejor);
  };

  const cancelarGesto = (ev) => {
    punteros.current.delete(ev.pointerId);
    if (punteros.current.size === 0) gesto.current = null;
  };

  // Acerca o aleja dejando quieto el punto del mapa que hay bajo el cursor.
  const acercar = (factor, px, py) => {
    const { w, h } = tamRef.current;
    const proyeccion = proyeccionRef.current;
    if (!w || !h || !proyeccion) return;
    const nuevo = acotar(zoom.current * factor, 1, ZOOM_MAX);
    if (nuevo === zoom.current) return;
    const x = px == null ? w / 2 : px;
    const y = py == null ? h / 2 : py;
    const antes = proyeccion.invert([x, y]);   // qué punto del mapa hay ahí
    zoom.current = nuevo;
    if (antes) {
      // se recoloca la cámara para que ese mismo punto siga bajo el cursor
      const k = escalaBase(w, h) * zoom.current;
      const tope = topeLat(k, h);
      lonCentro.current = antes[0] - (x - w / 2) / k / RAD;
      latCentro.current = acotar(antes[1] + (y - h / 2) / k / RAD, -tope, tope);
    }
    tocado.current = true;
    repintar.current = true;
  };

  const recentrar = () => {
    zoom.current = 1;
    lonCentro.current = LON_INICIAL;
    latCentro.current = LAT_INICIAL;
    tocado.current = false;      // vuelve a moverse solo
    gesto.current = null;
    punteros.current.clear();
    viaje.current = null;
    repintar.current = true;
  };

  // La rueda se engancha a mano y no con onWheel: React la escucha en modo
  // "pasivo" y ahí no se puede evitar que la página se desplace a la vez.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const rueda = (ev) => {
      ev.preventDefault();
      const r = svg.getBoundingClientRect();
      acercar(Math.exp(-ev.deltaY * 0.0015), ev.clientX - r.left, ev.clientY - r.top);
    };
    svg.addEventListener("wheel", rueda, { passive: false });
    return () => svg.removeEventListener("wheel", rueda);
  }, []);

  return (
    <div className="mapa-mundo" ref={cajaRef}>
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        role="img"
        aria-label={destino ? `Mapa del mundo centrado en ${destino.code}` : "Mapa del mundo en movimiento"}
        onPointerDown={empezarGesto}
        onPointerMove={moverGesto}
        onPointerUp={soltarGesto}
        onPointerCancel={cancelarGesto}
      >
        <rect x="0" y="0" width={tam.w} height={tam.h} className="mundo-mar" />
        {/* la tira: el mundo dibujado dos veces, una detrás de otra, para que
            al desplazarse nunca aparezca un borde */}
        <g ref={stripRef}>
          {[0, 1].map((i) => (
            <g key={i} ref={(el) => { copiasRef.current[i] = el; }}>
              <path className="mundo-tierra" />
              <path className="mundo-costa" />
              <path className="mundo-fronteras" />
              <path className="mundo-puntos" />
            </g>
          ))}
        </g>
        <circle ref={anilloRef} r="11" className="mundo-anillo" style={{ display: "none" }} />
        <circle ref={marcaRef} r="5" className="mundo-marca" style={{ display: "none" }} />
      </svg>
      <div className="mapa-mundo-pie">
        {etiqueta && <div className="mapa-mundo-etiqueta">{etiqueta}</div>}
        <div className="mapa-mundo-controles">
          <button type="button" onClick={() => acercar(1 / 1.4)} aria-label="Alejar" title="Alejar">−</button>
          <button type="button" onClick={recentrar} aria-label="Recentrar y volver al movimiento" title="Recentrar">⟲</button>
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
