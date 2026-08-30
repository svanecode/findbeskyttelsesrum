"use client";

import { useEffect } from "react";
import L from "leaflet";
import "leaflet.markercluster";
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

type AggregateMarkerOptions = L.MarkerOptions & {
  registrationCount: number;
  registrationCapacity: number;
  registrationBounds: L.LatLngBounds;
};

function markerSummary(marker: L.Marker) {
  const options = marker.options as AggregateMarkerOptions;
  return {
    count: options.registrationCount ?? 0,
    capacity: options.registrationCapacity ?? 0,
  };
}

function clusterLabel(count: number, capacity: number) {
  const registrations = count === 1
    ? "1 BBR-registrering"
    : `${count.toLocaleString("da-DK")} BBR-registreringer`;
  const addressPrompt = count === 1 ? "Zoom ind for at se adressen." : "Zoom ind for at se adresser.";
  return `${registrations} med ${capacity.toLocaleString("da-DK")} registrerede pladser. ${addressPrompt}`;
}

function clusterIcon(count: number) {
  return L.divIcon({
    html: `<div><span>${count.toLocaleString("da-DK")}</span><span class="sr-only"> registreringer</span></div>`,
    className: `marker-cluster ${clusterSizeClass(count)}`,
    iconSize: L.point(44, 44),
  });
}

export default function ServerClusterLayer({ clusters }: Props) {
  const map = useMap();

  useEffect(() => {
    const layer = L.markerClusterGroup({
      animate: false,
      maxClusterRadius: (zoom) => {
        const mobileWidth = map.getSize().x < 640;
        if (mobileWidth) return zoom <= 8 ? 88 : 64;
        return zoom <= 8 ? 68 : 52;
      },
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: false,
      zoomToBoundsOnClick: false,
      iconCreateFunction: (cluster) => {
        const summary = cluster.getAllChildMarkers().reduce(
          (total, marker) => {
            const markerValues = markerSummary(marker);
            return {
              count: total.count + markerValues.count,
              capacity: total.capacity + markerValues.capacity,
            };
          },
          { count: 0, capacity: 0 },
        );
        const label = clusterLabel(summary.count, summary.capacity);
        cluster.options.title = label;
        cluster.options.alt = label;
        return clusterIcon(summary.count);
      },
    }).addTo(map);

    layer.on("clusterclick", (event) => {
      const clickedCluster = (event as L.LeafletEvent & {
        layer: { getAllChildMarkers(): L.Marker[] };
      }).layer;
      const combinedBounds = L.latLngBounds([]);

      for (const childMarker of clickedCluster.getAllChildMarkers()) {
        const childBounds = (childMarker.options as AggregateMarkerOptions).registrationBounds;
        if (childBounds?.isValid()) combinedBounds.extend(childBounds);
      }

      if (!combinedBounds.isValid()) return;
      const southWest = combinedBounds.getSouthWest();
      const northEast = combinedBounds.getNorthEast();

      if (southWest.equals(northEast)) {
        map.setView(southWest, Math.min(map.getZoom() + 2, 18));
        return;
      }

      map.fitBounds(combinedBounds.pad(0.25), {
        animate: true,
        maxZoom: Math.min(map.getZoom() + 3, 18),
      });
    });

    for (const cluster of clusters) {
      const label = clusterLabel(cluster.count, cluster.capacity);
      const marker = L.marker([cluster.latitude, cluster.longitude], {
        icon: clusterIcon(cluster.count),
        title: label,
        alt: label,
        keyboard: false,
        registrationCount: cluster.count,
        registrationCapacity: cluster.capacity,
        registrationBounds: L.latLngBounds(
          L.latLng(cluster.south, cluster.west),
          L.latLng(cluster.north, cluster.east),
        ),
      } as AggregateMarkerOptions);

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
      layer.addLayer(marker);
    }

    return () => {
      layer.remove();
    };
  }, [clusters, map]);

  return null;
}
