type Props = {
  latitude: number;
  longitude: number;
  title: string;
};

/** Small bbox around a point for OSM embed (lon,lat order in bbox). */
function osmEmbedSrc(latitude: number, longitude: number) {
  const pad = 0.012;
  const bbox = `${longitude - pad},${latitude - pad},${longitude + pad},${latitude + pad}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${latitude}%2C${longitude}`;
}

export default function ShelterOsmEmbedMap({ latitude, longitude, title }: Props) {
  const src = osmEmbedSrc(latitude, longitude);

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0f0f0f]/40">
      <iframe
        title={title}
        src={src}
        className="aspect-[4/3] min-h-[17rem] w-full border-0 sm:min-h-[22rem]"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
      <p className="border-t border-white/10 px-3 py-2 text-xs text-gray-400">
        Kort:{" "}
        <a
          href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-200 underline decoration-white/30 underline-offset-2 hover:text-white"
        >
          OpenStreetMap
        </a>
      </p>
    </div>
  );
}
