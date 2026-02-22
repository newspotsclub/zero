"use client";

type CityFilterProps = {
  cities: string[];
  selectedCity: string;
  onSelect: (city: string) => void;
};

export function CityFilter({
  cities,
  selectedCity,
  onSelect,
}: CityFilterProps) {
  return (
    <div className="mb-7 flex gap-2 overflow-x-auto pb-1 md:mb-9 md:flex-wrap md:overflow-visible">
      {cities.map((city, cityIndex) => (
        <button
          key={`${city}-${cityIndex}`}
          type="button"
          onClick={() => onSelect(city)}
          className={`shrink-0 border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition ${
            selectedCity === city
              ? "border-black bg-black text-white"
              : "border-black/20 bg-white/60 text-neutral-600 hover:border-black hover:text-black"
          }`}
        >
          {city}
        </button>
      ))}
    </div>
  );
}
