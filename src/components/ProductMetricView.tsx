"use client";

import { useEffect, useRef } from "react";

import { trackProductMetric, type ProductMetricEventName } from "@/lib/analytics/product-metrics";

export default function ProductMetricView({ eventName }: { eventName: ProductMetricEventName }) {
  const recorded = useRef(false);

  useEffect(() => {
    if (recorded.current) return;
    recorded.current = true;
    trackProductMetric(eventName);
  }, [eventName]);

  return null;
}
