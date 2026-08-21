"use client";

import { useMemo, useRef } from "react";
import { TileLayer } from "react-leaflet";

import {
  osmTileAttribution,
  osmTileMaxZoom,
  osmTileUrl,
} from "@/lib/maps/provider";

export type MapTileStatus = "loading" | "ready" | "error";

type Props = {
  onStatusChange: (status: MapTileStatus) => void;
};

const failureThreshold = 3;

export default function ResilientMapTileLayer({ onStatusChange }: Props) {
  const failureCountRef = useRef(0);
  const failedRef = useRef(false);

  const eventHandlers = useMemo(
    () => ({
      loading: () => {
        if (failedRef.current) return;
        failureCountRef.current = 0;
        onStatusChange("loading");
      },
      load: () => {
        if (failedRef.current) return;
        failureCountRef.current = 0;
        onStatusChange("ready");
      },
      tileerror: () => {
        failureCountRef.current += 1;
        if (failedRef.current || failureCountRef.current < failureThreshold) return;
        failedRef.current = true;
        onStatusChange("error");
      },
    }),
    [onStatusChange],
  );

  return (
    <TileLayer
      url={osmTileUrl}
      attribution={osmTileAttribution}
      maxZoom={osmTileMaxZoom}
      keepBuffer={1}
      updateWhenIdle
      updateWhenZooming={false}
      eventHandlers={eventHandlers}
    />
  );
}
