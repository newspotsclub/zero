"use client";

import Image from "next/image";
import { useState } from "react";
import spotsData from "@/data/spots.json";
import { getStaticMapImageUrl } from "@/lib/staticMap";

type Spot = {
  image?: string;
  name: string;
  city: string;
  mapsLink: string;
  latLng?: string;
};
const spots = spotsData.spots as Spot[];
const cities = ["All", ...new Set(spots.map((s) => s.city).sort())];

function parseLatLng(latLng: string): { lat: number; lng: number } | null {
  const parts = latLng.split(",").map((s) => parseFloat(s.trim()));
  if (parts.length !== 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1]))
    return null;
  return { lat: parts[0], lng: parts[1] };
}

function getSpotImageUrl(spot: Spot): string {
  if (spot.latLng) {
    const coords = parseLatLng(spot.latLng);
    if (coords) {
      const mapUrl = getStaticMapImageUrl(coords.lat, coords.lng);
      if (mapUrl) return mapUrl;
    }
  }
  if (spot.image) return spot.image;
  return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='500' viewBox='0 0 400 500'%3E%3Crect fill='%23e5e5e5' width='400' height='500'/%3E%3C/svg%3E";
}

export default function Home() {
  const [selectedCity, setSelectedCity] = useState<string>("All");

  const filteredSpots =
    selectedCity === "All"
      ? spots
      : spots.filter((s) => s.city === selectedCity);

  return (
    <div className="min-h-screen bg-white text-black">
      <main className="px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 flex gap-1.5 overflow-x-auto pb-1 md:mb-8 md:flex-wrap md:overflow-visible">
            {cities.map((city) => (
              <button
                key={city}
                type="button"
                onClick={() => setSelectedCity(city)}
                className={`shrink-0 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  selectedCity === city
                    ? "border-black bg-black text-white"
                    : "border-neutral-300 bg-white text-neutral-600 hover:border-neutral-400 hover:text-black"
                }`}
              >
                {city}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-4">
            {filteredSpots.map((spot, i) => (
              <a
                key={`${spot.city}-${i}`}
                href={spot.mapsLink}
                target="_blank"
                rel="noopener noreferrer"
                className="relative aspect-[4/5] w-full overflow-hidden"
              >
                <Image
                  src={getSpotImageUrl(spot)}
                  alt={spot.name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 50vw, 33vw"
                />
              </a>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
