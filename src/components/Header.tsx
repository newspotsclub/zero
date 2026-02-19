export function Header() {
  return (
    <header className="border-b border-black/20 bg-white/70 px-4 py-4 backdrop-blur-[2px] md:px-8">
      <div className="mx-auto max-w-6xl">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-neutral-500">
          New Spots Club
        </p>
        <h1 className="mt-2 font-mono text-sm tracking-tight text-neutral-900">
          NewSpots Club
        </h1>
        <p className="mt-1 text-xs text-neutral-700">
          Coffee, biryani and stuff worth getting out for in Bengaluru.
        </p>
      </div>
    </header>
  );
}
