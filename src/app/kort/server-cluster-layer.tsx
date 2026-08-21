"use client";

import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

import type { CountryMapClusterFeature } from "@/types/country-map";

type Props = {
  clusters: CountryMapClusterFeature[];
};

function clusterSizeClass(count: number) {
  if (count < 10) return "marker-cluster-small";
  if (count < 50) return "marker-cluster-medium";
  return "marker-cluster-large";
}

export default function ServerClusterLayer({ clusters }: Props) {
  const map = useMap();

  useEffect(() => {
    const layer = L.layerGroup().addTo(map);

    for (const cluster of clusters) {
      const label = `${cluster.count.toLocaleString("da-DK")} BBR-registreringer med ${cluster.capacity.toLocaleString("da-DK")} registrerede pladser. Zoom ind for at se adresser.`;
      const marker = L.marker([cluster.latitude, cluster.longitude], {
        icon: L.divIcon({
          html: `<div><span>${cluster.count}</span><span class="sr-only"> registreringer</span></div>`,
          className: `marker-cluster ${clusterSizeClass(cluster.count)}`,
          iconSize: L.point(40, 40),
        }),
        title: label,
        alt: label,
        keyboard: true,
      });

      marker.on("click", () => {
        const southWest = L.latLng(cluster.south, cluster.west);
        const northEast = L.latLng(cluster.north, cluster.east);

        if (southWest.equals(northEast)) {
          map.setView([cluster.latitude, cluster.longitude], Math.min(map.getZoom() + 2, 18));
          return;
        }

        map.fitBounds(L.latLngBounds(southWest, northEast).pad(0.25), {
          animate: true,
          maxZoom: Math.min(map.getZoom() + 3, 18),
        });
      });

      marker.bindTooltip(label, { direction: "top", opacity: 0.95 });
      marker.addTo(layer);
    }

    return () => {
      layer.remove();
    };
  }, [clusters, map]);

  return null;
}
