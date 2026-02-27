import Image from "next/image";
import type { SpotEntry } from "@/types/spot";
import { getSpotImageUrl } from "@/lib/spots";

type SpotCardProps = {
  entry: SpotEntry;
};

export function SpotCard({ entry }: SpotCardProps) {
  const imageUrl = getSpotImageUrl(
    entry.location.latLng ?? entry.spot.latLng,
    entry.spot.image
  );

  return (
    <a
      href={entry.location.mapsLink}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative aspect-[4/5] w-full overflow-hidden border border-black/20 bg-white/50 transition hover:border-black"
    >
      <Image
        src={imageUrl}
        alt={entry.spot.name}
        fill
        className="object-cover transition duration-300 group-hover:scale-[1.02]"
        sizes="(max-width: 768px) 50vw, 33vw"
        unoptimized
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 to-transparent"
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3 text-white">
        <p className="text-sm font-medium leading-tight">{entry.spot.name}</p>
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/90">
          {entry.location.area}
        </p>
      </div>
    </a>
  );
}
