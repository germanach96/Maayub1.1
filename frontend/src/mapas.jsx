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

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { geoEquirectangular, geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";
import { ArrowCounterClockwise, Minus, Plus } from "./iconos";

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
// Mientras busca, de cuántas rutas sale además un "cometa" que las recorre.
// Las 186 de Europa a la vez serían demasiadas para un móvil: con las más
// cercanas basta para que se vea que la búsqueda está viva.
const MAX_COMETAS = 40;
// Radio (en píxeles de pantalla) en el que el ratón "encuentra" un aeropuerto
// al pasar por encima. Es el mismo que el de acierto al pulsar.
const RADIO_RATON = 14;
// Lista vacía fija: un `[]` nuevo en cada render haría que el mapa creyera
// que las rutas han cambiado y rehiciera su bucle de dibujo cada vez.
const SIN_RUTAS = [];

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
 *
 * Mientras se busca, `rutas` trae los destinos que se están consultando: el
 * mapa se aleja hasta que caben todos y dibuja una línea del origen a cada
 * uno, de la más cercana a la más lejana. Es lo que está pasando de verdad
 * (una consulta por destino), así que mirar el mapa explica la espera.
 */
export function MapaMundo({ destino, etiqueta, aeropuertos, onElegir, rutas = SIN_RUTAS }) {
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
  const rutasRef = useRef(null);
  const destinosRef = useRef(null);
  const hoverRef = useRef(null);
  const hoverTextoRef = useRef(null);

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

  // Al empezar a buscar, el mapa se aleja lo justo para que quepan el origen y
  // todos los destinos consultados. El zoom nunca pasa del de "aeropuerto
  // elegido": si los destinos están cerca (un vuelo por Europa), se queda
  // donde estaba y solo se recoloca.
  useEffect(() => {
    if (!destino || destino.lat == null || !rutas.length) return;
    const { w, h } = tamRef.current;
    if (!w || !h) return;
    const lons = [0, ...rutas.map((r) => difCorta(destino.lon, r.lon))];
    const lats = [destino.lat, ...rutas.map((r) => r.lat)];
    const lonMin = Math.min(...lons), lonMax = Math.max(...lons);
    const latMin = Math.min(...lats), latMax = Math.max(...lats);
    const kb = escalaBase(w, h);
    // en escritorio el buscador tapa la franja de arriba del mapa: se deja
    // menos alto útil y el centro se baja para que las rutas no queden debajo
    const tapa = w > 800 ? 230 : 0;
    const zoomLon = w / (Math.max(lonMax - lonMin, 8) * 1.2 * RAD * kb);
    const zoomLat = (h - tapa) / (Math.max(latMax - latMin, 6) * 1.35 * RAD * kb);
    const z = acotar(Math.min(zoomLon, zoomLat), 1, Math.max(zoom.current, ZOOM_ELEGIDO));
    const k = kb * z;
    viaje.current = {
      desde: [lonCentro.current, latCentro.current, zoom.current],
      hasta: [
        destino.lon + (lonMin + lonMax) / 2,
        (latMin + latMax) / 2 + (tapa / 2) / k / RAD,
        z,
      ],
      t0: null,
    };
    if (menosAnimaciones()) {
      [lonCentro.current, latCentro.current, zoom.current] = viaje.current.hasta;
      viaje.current = null;
    }
    tocado.current = false;
    repintar.current = true;
  }, [rutas, destino]);

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

      // Rutas de la búsqueda en curso: el arco real sobre la esfera, del origen
      // a cada destino. Se recalculan con la cámara (al viajar, arrastrar o
      // acercar); quietas, no se tocan. `pathLength=1` en el JSX hace que la
      // animación de dibujado mida lo mismo aunque cambie la forma.
      if (rutasRef.current && destino && destino.lat != null && rutas.length) {
        const camino = geoPath(proyeccionRef.current);
        const lineas = rutasRef.current.querySelectorAll("[data-ruta]");
        lineas.forEach((el) => {
          const r = rutas[Number(el.dataset.ruta)];
          if (!r) return;
          el.setAttribute("d", camino({
            type: "LineString",
            coordinates: [[destino.lon, destino.lat], [r.lon, r.lat]],
          }) || "");
        });
        destinosRef.current?.setAttribute("d", camino.pointRadius(3)({
          type: "MultiPoint",
          coordinates: rutas.map((r) => [r.lon, r.lat]),
        }) || "");
      }

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
  }, [mundo, tam, destino, puntos, rutas]);

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

  // El aeropuerto más cercano a un punto de la pantalla, si cae dentro del
  // radio. Lo usan el clic (para elegir) y el ratón (para enseñar cuál es).
  const masCercano = (x, y, radio) => {
    const proyeccion = proyeccionRef.current;
    if (!proyeccion) return null;
    let mejorDist = radio;
    let mejor = null;
    for (const ap of aeropuertos || []) {
      if (ap.lat == null || ap.lon == null) continue;
      const p = proyeccion([ap.lon, ap.lat]);
      if (!p) continue;
      const d = Math.hypot(p[0] - x, p[1] - y);
      if (d < mejorDist) { mejorDist = d; mejor = { ap, p }; }
    }
    return mejor;
  };

  // Con ratón, el aeropuerto que está bajo el cursor se marca con un aro y su
  // código antes de pulsar: así se ve a qué se va a dar. Se pinta escribiendo
  // atributos, sin pasar por React, porque llega un evento por píxel movido.
  const ocultarHover = () => {
    hoverRef.current?.setAttribute("data-visible", "false");
    if (svgRef.current) svgRef.current.style.cursor = "";
  };
  const mostrarHover = (ev) => {
    if (ev.pointerType !== "mouse" || gesto.current) { ocultarHover(); return; }
    const [x, y] = enPantalla(ev);
    const hit = masCercano(x, y, RADIO_RATON);
    if (!hit || !hoverRef.current) { ocultarHover(); return; }
    hoverRef.current.setAttribute("transform", `translate(${hit.p[0]},${hit.p[1]})`);
    hoverRef.current.setAttribute("data-visible", "true");
    if (hoverTextoRef.current) hoverTextoRef.current.textContent = hit.ap.code;
    svgRef.current.style.cursor = "pointer";
  };

  // Un clic (arrastre de casi nada) elige el aeropuerto más cercano al dedo.
  const soltarGesto = (ev) => {
    const g = gesto.current;
    punteros.current.delete(ev.pointerId);
    if (punteros.current.size === 0) gesto.current = null;
    if (!g || g.tipo !== "arrastre" || g.movidoPx > 8 || !onElegir) return;
    const [x, y] = enPantalla(ev);
    // Se acierta un aeropuerto si el dedo cae a menos de esta distancia en
    // pantalla; con el dedo la zona de acierto es más ancha que con el ratón.
    const hit = masCercano(x, y, ev.pointerType === "touch" ? 26 : RADIO_RATON);
    if (hit) onElegir(hit.ap);
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

  const buscando = rutas.length > 0 && destino != null;

  return (
    <div className="mapa-mundo" ref={cajaRef}>
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        role="img"
        className={(mundo ? "listo" : "") + (buscando ? " buscando" : "")}
        aria-label={buscando
          ? `Mapa con las rutas desde ${destino.code} a los ${rutas.length} destinos que se están consultando`
          : destino ? `Mapa del mundo centrado en ${destino.code}` : "Mapa del mundo en movimiento"}
        onPointerDown={(ev) => { ocultarHover(); empezarGesto(ev); }}
        onPointerMove={(ev) => { moverGesto(ev); mostrarHover(ev); }}
        onPointerUp={soltarGesto}
        onPointerCancel={cancelarGesto}
        onPointerLeave={ocultarHover}
      >
        <rect x="0" y="0" width={tam.w} height={tam.h} className="mundo-mar" />
        {/* la tira: el mundo dibujado dos veces, una detrás de otra, para que
            al desplazarse nunca aparezca un borde */}
        <g ref={stripRef} className="mundo-tira">
          {[0, 1].map((i) => (
            <g key={i} ref={(el) => { copiasRef.current[i] = el; }}>
              <path className="mundo-tierra" />
              <path className="mundo-costa" />
              <path className="mundo-fronteras" />
              <path className="mundo-puntos" />
            </g>
          ))}
        </g>
        {buscando && (
          <g ref={rutasRef} className="mundo-rutas" aria-hidden="true">
            {/* `--i` va en cada línea (no en el grupo): así el retraso de su
                dibujado no obliga a recalcular el estilo de todas las demás */}
            {rutas.map((r, i) => (
              <path key={r.code} data-ruta={i} className="mundo-ruta" pathLength="1"
                    style={{ "--i": i / rutas.length }} />
            ))}
            {rutas.slice(0, MAX_COMETAS).map((r, i) => (
              <path key={"c" + r.code} data-ruta={i} className="mundo-cometa" pathLength="1"
                    style={{ "--i": i / Math.min(rutas.length, MAX_COMETAS) }} />
            ))}
            <path ref={destinosRef} className="mundo-destinos" />
          </g>
        )}
        <circle ref={anilloRef} r="11" className="mundo-anillo" style={{ display: "none" }} />
        <circle ref={marcaRef} r="5" className="mundo-marca" style={{ display: "none" }} />
        <g ref={hoverRef} className="mundo-hover" data-visible="false" aria-hidden="true">
          <circle r="7" />
          <text ref={hoverTextoRef} y="-12" />
        </g>
      </svg>
      <div className="mapa-mundo-pie">
        {/* la `key` hace que el texto nuevo entre con su propia animación en
            vez de cambiar de golpe dentro de la misma pastilla */}
        {etiqueta && <div className="mapa-mundo-etiqueta" key={etiqueta}>{etiqueta}</div>}
        <div className="mapa-mundo-controles">
          <button type="button" onClick={() => acercar(1 / 1.4)} aria-label="Alejar" title="Alejar">
            <Minus aria-hidden="true" />
          </button>
          <button type="button" onClick={recentrar} aria-label="Recentrar y volver al movimiento" title="Recentrar">
            <ArrowCounterClockwise aria-hidden="true" />
          </button>
          <button type="button" onClick={() => acercar(1.4)} aria-label="Acercar" title="Acercar">
            <Plus aria-hidden="true" />
          </button>
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
  // Ids únicos para la máscara y el recorte: si dos fichas convivieran un
  // instante (al cerrar una y abrir otra), no se pisarían.
  const uid = useId().replace(/:/g, "");
  const quieto = menosAnimaciones();

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
  const dRuta = dibujo(ruta) || "";
  // Si la ruta cruza el borde del mapa, d3 la parte en dos trozos ("M…M…") y
  // un punto que la recorriera saltaría de un lado al otro: solo se anima
  // cuando es un único trazo.
  const deUnTrazo = dRuta.lastIndexOf("M") === 0;

  return (
    <div className="mapa-ruta">
      <svg viewBox={`0 0 ${ancho} ${alto}`} role="img"
           aria-label={`Ruta de ${origen.code} a ${destino.code}`}>
        <defs>
          {/* el recorte evita que la tierra se salga del marco al acercarse */}
          <clipPath id={`marco-${uid}`}>
            <rect width={ancho} height={alto} rx="6" />
          </clipPath>
          {/* La línea es punteada, así que no se puede "dibujar" con su propio
              trazo: se dibuja una máscara continua encima del mismo camino y
              la línea punteada va apareciendo por debajo. */}
          <mask id={`trazo-${uid}`} maskUnits="userSpaceOnUse">
            <path d={dRuta} className="mapa-linea-mascara" pathLength="1" />
          </mask>
        </defs>
        <g clipPath={`url(#marco-${uid})`}>
        <rect width={ancho} height={alto} className="mapa-mar" />
        <path d={dibujo(mundo.tierra)} className="mapa-tierra" />
        <path d={dibujo(mundo.fronteras)} className="mapa-fronteras" />
        <path id={`ruta-${uid}`} d={dRuta} className="mapa-linea" mask={`url(#trazo-${uid})`} />
        {/* un avión-punto que recorre la ruta en el sentido del vuelo: dice
            sin palabras si es la ida o la vuelta */}
        {!quieto && deUnTrazo && (
          <circle r="2.6" className="mapa-avion">
            <animateMotion dur="3.2s" begin="1.1s" repeatCount="indefinite"
                           keyPoints="0;1" keyTimes="0;1" calcMode="spline"
                           keySplines="0.77 0 0.175 1">
              <mpath href={`#ruta-${uid}`} />
            </animateMotion>
          </circle>
        )}
        <circle cx={a[0]} cy={a[1]} r="3.5" className="mapa-punto origen" />
        <g className="mapa-llegada" style={{ transformOrigin: `${b[0]}px ${b[1]}px` }}>
          <circle cx={b[0]} cy={b[1]} r="4.5" className="mapa-punto destino" />
          <circle cx={b[0]} cy={b[1]} r="4.5" className="mapa-onda" />
        </g>
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
