type AreaFilterProps = {
  areas: string[];
  selectedArea: string;
  onSelect: (area: string) => void;
};

export function AreaFilter({ areas, selectedArea, onSelect }: AreaFilterProps) {
  return (
    <div className="mb-6 flex gap-2 overflow-x-auto pb-1 md:mb-8 md:flex-wrap md:overflow-visible">
      {areas.map((area) => (
        <button
          key={area}
          type="button"
          onClick={() => onSelect(area)}
          className={`shrink-0 border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition ${
            selectedArea === area
              ? "border-black bg-black text-white"
              : "border-black/20 bg-white/60 text-neutral-600 hover:border-black hover:text-black"
          }`}
        >
          {area}
        </button>
      ))}
    </div>
  );
}
