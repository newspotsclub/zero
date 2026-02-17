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
      className="relative aspect-[4/5] w-full overflow-hidden"
    >
      <Image
        src={imageUrl}
        alt={entry.spot.name}
        fill
        className="object-cover"
        sizes="(max-width: 768px) 50vw, 33vw"
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 to-transparent"
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3 text-white">
        <p className="text-sm font-medium leading-tight">{entry.spot.name}</p>
        <p className="text-xs text-white/85">{entry.location.area}</p>
      </div>
    </a>
  );
}
