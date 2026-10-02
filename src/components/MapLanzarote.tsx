"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import { formatDateShort } from "@/lib/format";
import type { VehicleType } from "@/lib/types";

/**
 * Mapa de la isla con Leaflet y teselas de OpenStreetMap.
 *
 * Es el mismo mapa que usaba el sitio original: centro en [29.05, -13.60],
 * zoom 10, circulos de radio 10 coloreados por gravedad y control de escala en
 * metricas. Se mantiene tal cual porque es el que el usuario tenia.
 *
 * Leaflet manipula el DOM directamente, asi que no puede renderizarse en el
 * servidor: se carga sin SSR y el mapa se monta en un efecto.
 */
export type MapAccident = {
  id: string;
  slug: string;
  title: string;
  occurredAt: string;
  vehicleType: VehicleType;
  severity: string;
  category?: string | null;
  municipalitySlug: string;
  municipalityName: string;
  approxLat: number | null;
  approxLon: number | null;
  locationDescription: string | null;
};

/** Color del circulo segun la gravedad, como en el original. */
function pinColor(severity: string): string {
  if (severity === "GRAVE") return "#a61e1e";
  if (severity === "MODERADO") return "#e67700";
  return "#c92a2a";
}

const VEHICLE_TEXT: Record<VehicleType, string> = {
  COCHE: "Coche",
  MOTO: "Moto",
  CAMION: "Camión",
  BICICLETA: "Bicicleta",
  PEATON: "Peatón",
  OTROS: "Otros vehículos",
};

export function MapLanzarote({
  accidents,
  height = "450px",
}: {
  accidents: MapAccident[];
  height?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // Solo los que tienen coordenada aproximada
  const plotted = accidents.filter((a) => a.approxLat !== null && a.approxLon !== null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const container = containerRef.current;
      if (!container || mapRef.current) return;

      let L: typeof import("leaflet");
      try {
        L = await import("leaflet");
        await import("leaflet/dist/leaflet.css");
      } catch {
        if (!cancelled) setFailed(true);
        return;
      }
      if (cancelled) return;

      const map = L.map(container, {
        center: [29.05, -13.6],
        zoom: 10,
        minZoom: 9,
        maxZoom: 18,
        scrollWheelZoom: true,
        zoomControl: true,
      });
      mapRef.current = map;

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      L.control.scale({ imperial: false, metric: true }).addTo(map);

      layerRef.current = L.layerGroup().addTo(map);

      // Los marcadores se redibujan cuando llegan los datos.
      setReady(true);
    }

    init();

    return () => {
      cancelled = true;
      // map.remove() es lo que libera los listeners y el contenedor; sin esto
      // al navegar con App Router el mapa queda colgado en el DOM.
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // Marcadores: se rehacen cuando cambia la lista o cuando el mapa ya existe.
  useEffect(() => {
    if (!ready || !layerRef.current) return;

    let cancelled = false;

    async function draw() {
      const layer = layerRef.current;
      if (!layer) return;

      const L = await import("leaflet");
      if (cancelled) return;

      layer.clearLayers();

      for (const a of plotted) {
        const color = pinColor(a.severity);

        const marker = L.circleMarker([a.approxLat as number, a.approxLon as number], {
          radius: 10,
          fillColor: color,
          color: "#ffffff",
          weight: 2,
          opacity: 1,
          fillOpacity: 0.8,
        });

        // El contenido del globo se construye con DOM, no con innerHTML: el
        // titulo viene de una reescritura de IA sobre texto de terceros y
        // concatenarlo como HTML abriria la puerta a XSS.
        const popup = document.createElement("div");

        const title = document.createElement("div");
        title.className = "popup-title";
        title.textContent = a.title;
        popup.appendChild(title);

        const info = document.createElement("div");
        info.className = "popup-info";

        const zona = document.createElement("div");
        zona.textContent = `Zona: ${a.locationDescription || a.municipalityName}`;
        info.appendChild(zona);

        const fecha = document.createElement("div");
        fecha.textContent = `Fecha: ${formatDateShort(a.occurredAt)}`;
        info.appendChild(fecha);

        const tipo = document.createElement("div");
        tipo.textContent = `Tipo: ${VEHICLE_TEXT[a.vehicleType] ?? a.vehicleType}`;
        info.appendChild(tipo);

        const link = document.createElement("a");
        link.href = `/noticias/${a.slug}`;
        link.textContent = "Ver noticia completa";
        info.appendChild(link);

        popup.appendChild(info);
        marker.bindPopup(popup);
        marker.addTo(layer);
      }
    }

    draw();
    return () => {
      cancelled = true;
    };
  }, [ready, plotted]);

  if (failed) {
    return (
      <div
        className="map-container flex items-center justify-center text-center"
        style={{ height, background: "var(--bg-secondary)" }}
      >
        <p className="news-description px-6">
          No se ha podido cargar el mapa. Puedes ver las noticias en el listado.
        </p>
      </div>
    );
  }

  return (
    <>
      <div
        id="map"
        ref={containerRef}
        style={{ height }}
        role="region"
        aria-label={`Mapa de Lanzarote con ${plotted.length} accidentes registrados en ubicaciones aproximadas`}
      />
      <p className="news-description mt-3">
        Las ubicaciones se muestran de forma <strong>aproximada</strong> para no identificar el punto exacto de
        ningún accidente.
      </p>
    </>
  );
}

/** Enlace al mapa completo, para reutilizarlo desde la cabecera. */
export function MapFullscreenLink() {
  return (
    <Link href="/mapa" className="section-more">
      Mapa a pantalla completa →
    </Link>
  );
}