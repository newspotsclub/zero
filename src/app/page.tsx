"use client";

import { useState, useMemo } from "react";
import spotsData from "@/data/spots.json";
import type { Spot } from "@/types/spot";
import {
  flattenSpotEntries,
  getAreasFromEntries,
  filterEntriesByArea,
} from "@/lib/spots";
import { Header } from "@/components/Header";
import { AreaFilter } from "@/components/AreaFilter";
import { SpotCard } from "@/components/SpotCard";
import { Footer } from "@/components/Footer";

const spots = spotsData.spots as Spot[];
const allEntries = flattenSpotEntries(spots);
const areas = getAreasFromEntries(allEntries);

export default function Home() {
  const [selectedArea, setSelectedArea] = useState<string>("All");

  const filteredEntries = useMemo(
    () => filterEntriesByArea(allEntries, selectedArea),
    [selectedArea]
  );

  return (
    <div className="bg-white text-black">
      <Header />
      <main className="px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-6xl">
          <AreaFilter
            areas={areas}
            selectedArea={selectedArea}
            onSelect={setSelectedArea}
          />
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-4">
            {filteredEntries.map((entry, i) => (
              <SpotCard
                key={`${entry.spot.name}-${entry.location.area}-${i}`}
                entry={entry}
              />
            ))}
          </div>
          <Footer />
        </div>
      </main>
    </div>
  );
}
