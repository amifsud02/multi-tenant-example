"use client";

import { useEffect, useMemo, useRef } from "react";
import type {
  Map as MapboxMap,
  GeoJSONSource,
  Popup,
  MapMouseEvent,
} from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  FALLBACK_COLOR,
  categoryMeta,
  colorForCategory,
  type BusinessListing,
  type CategoryInfo,
} from "@/lib/businesses";

// Roughly centered on the Maltese islands.
const MALTA_CENTER: [number, number] = [14.42, 35.92];
const SRC = "businesses";

type Props = {
  businesses: BusinessListing[];
  categories: CategoryInfo[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  token: string | null;
};

type FC = GeoJSON.FeatureCollection<GeoJSON.Point>;

function toFeatureCollection(businesses: BusinessListing[]): FC {
  return {
    type: "FeatureCollection",
    features: businesses.map((b) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [b.lon, b.lat] },
      properties: {
        id: b.id,
        name: b.name,
        category: b.category,
        city: b.city ?? "",
      },
    })),
  };
}

export default function BusinessMap({
  businesses,
  categories,
  selectedId,
  onSelect,
  token,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const readyRef = useRef(false);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // Data-driven circle color: ['match', ['get','category'], cat, color, …, fallback]
  const colorExpr = useMemo(() => {
    const stops = categories.flatMap((c) => [c.name, colorForCategory(c.name)]);
    return ["match", ["get", "category"], ...stops, FALLBACK_COLOR];
  }, [categories]);

  // --- Create the map once (dynamic import keeps mapbox-gl out of SSR). ---
  useEffect(() => {
    if (!token || !containerRef.current) return;
    let map: MapboxMap | undefined;
    let ro: ResizeObserver | undefined;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      mapboxgl.accessToken = token;
      map = new mapboxgl.Map({
        container: containerRef.current!,
        style: "mapbox://styles/mapbox/light-v11",
        center: MALTA_CENTER,
        zoom: 10.2,
      });
      map.addControl(new mapboxgl.NavigationControl(), "top-right");
      mapRef.current = map;

      map.on("load", () => {
        map!.addSource(SRC, {
          type: "geojson",
          data: toFeatureCollection(businesses),
          cluster: true,
          clusterRadius: 50,
          clusterMaxZoom: 15,
        });

        // Clusters: neutral circles sized by point count.
        map!.addLayer({
          id: "clusters",
          type: "circle",
          source: SRC,
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#18181b",
            "circle-opacity": 0.85,
            "circle-radius": [
              "step",
              ["get", "point_count"],
              16,
              25,
              22,
              100,
              30,
            ],
          },
        });
        map!.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: SRC,
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-size": 12,
          },
          paint: { "text-color": "#ffffff" },
        });

        // Individual businesses: colored by category.
        map!.addLayer({
          id: "unclustered",
          type: "circle",
          source: SRC,
          filter: ["!", ["has", "point_count"]],
          paint: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            "circle-color": colorExpr as any,
            "circle-radius": 7,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          },
        });

        // Zoom into a cluster on click.
        map!.on("click", "clusters", (e: MapMouseEvent) => {
          const feature = map!.queryRenderedFeatures(e.point, {
            layers: ["clusters"],
          })[0];
          const clusterId = feature?.properties?.cluster_id;
          const source = map!.getSource(SRC) as GeoJSONSource;
          source.getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (err || zoom == null) return;
            const geom = feature.geometry as GeoJSON.Point;
            map!.easeTo({
              center: geom.coordinates as [number, number],
              zoom,
            });
          });
        });

        // Select an individual business on click.
        map!.on("click", "unclustered", (e: MapMouseEvent) => {
          const id = e.features?.[0]?.properties?.id;
          if (typeof id === "string") onSelectRef.current(id);
        });

        for (const layer of ["clusters", "unclustered"]) {
          map!.on("mouseenter", layer, () => {
            map!.getCanvas().style.cursor = "pointer";
          });
          map!.on("mouseleave", layer, () => {
            map!.getCanvas().style.cursor = "";
          });
        }

        map!.resize();
        readyRef.current = true;
      });

      // The map sits low on the page, so its container often isn't at its final
      // height when Mapbox measures it — keep the canvas in sync with the box.
      ro = new ResizeObserver(() => map?.resize());
      ro.observe(containerRef.current!);
    })();

    return () => {
      readyRef.current = false;
      ro?.disconnect();
      popupRef.current?.remove();
      map?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // --- Push new data whenever the filtered set changes. ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const source = map.getSource(SRC) as GeoJSONSource | undefined;
    source?.setData(toFeatureCollection(businesses));
  }, [businesses]);

  // --- Fly to + open a popup for the selected business. ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const biz = businesses.find((b) => b.id === selectedId);
    if (!biz) return;

    let cancelled = false;
    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled || !mapRef.current) return;
      map.flyTo({ center: [biz.lon, biz.lat], zoom: 16, speed: 1.2 });
      popupRef.current?.remove();
      const meta = categoryMeta(biz.category);
      const html = `
        <div class="biz-popup">
          <span class="biz-popup-icon" style="background:linear-gradient(140deg, ${
            meta.from
          }, ${meta.to})">${meta.icon}</span>
          <span class="biz-popup-text">
            <strong>${escapeHtml(biz.name)}</strong>
            <span>${escapeHtml(biz.category)}${
              biz.city ? ` · ${escapeHtml(biz.city)}` : ""
            }</span>
          </span>
        </div>`;
      popupRef.current = new mapboxgl.Popup({ offset: 14, closeButton: false })
        .setLngLat([biz.lon, biz.lat])
        .setHTML(html)
        .addTo(map);
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedId, businesses]);

  if (!token) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-zinc-100 p-8 text-center dark:bg-zinc-900">
        <div className="max-w-sm text-sm text-zinc-600 dark:text-zinc-400">
          <p className="font-medium text-zinc-800 dark:text-zinc-200">
            Map unavailable
          </p>
          <p className="mt-1">
            Set{" "}
            <code className="font-mono text-xs">NEXT_PUBLIC_MAPBOX_TOKEN</code>{" "}
            in <code className="font-mono text-xs">.env.local</code> to enable
            the interactive map.
          </p>
        </div>
      </div>
    );
  }

  return <div ref={containerRef} className="h-full w-full" />;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
