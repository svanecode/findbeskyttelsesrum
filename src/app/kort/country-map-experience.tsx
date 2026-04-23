"use client";

import dynamic from "next/dynamic";
import type { AppV2CountryShelter } from "@/lib/supabase/app-v2-queries";

function MapLoadingSkeleton() {
  return (
    <div className="relative h-[60vh] min-h-[60vh] w-full overflow-hidden rounded-lg border border-white/10 bg-[#1a1a1a] md:h-[calc(100vh-12rem)] md:min-h-[70vh]">
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-orange-500/30 border-t-orange-500" />
          <p className="text-sm text-gray-400">Indlæser kort...</p>
        </div>
      </div>
    </div>
  );
}

const CountryMap = dynamic(() => import("./country-map"), {
  ssr: false,
  loading: () => <MapLoadingSkeleton />,
});

interface Props {
  shelters: AppV2CountryShelter[];
}

export default function CountryMapExperience({ shelters }: Props) {
  return <CountryMap shelters={shelters} />;
}
