"use client";

import Image from "next/image";
import type { HomeSpot } from "@/types/home";
import type { ProfileListSummary } from "@/hooks/useProfileLists";
import { getHomeSpotImageUrl } from "@/lib/home-spots";
import { shouldBypassNextImageOptimization } from "@/lib/image-optimization";

type HomeSpotCardProps = {
  spot: HomeSpot;
  isInPublicList: boolean;
  isInPrivateList: boolean;
  publicList: ProfileListSummary | undefined;
  privateList: ProfileListSummary | undefined;
  isAddMenuOpen: boolean;
  addActionBusyKey: string | null;
  onOpenDetail: () => void;
  onToggleAddMenu: (e: React.MouseEvent) => void;
  onAddToPublicList: (e: React.MouseEvent) => void;
  onAddToPrivateList: (e: React.MouseEvent) => void;
};

export function HomeSpotCard({
  spot,
  isInPublicList,
  isInPrivateList,
  publicList,
  privateList,
  isAddMenuOpen,
  addActionBusyKey,
  onOpenDetail,
  onToggleAddMenu,
  onAddToPublicList,
  onAddToPrivateList,
}: HomeSpotCardProps) {
  const imageSrc = getHomeSpotImageUrl(spot);
  const bypassOptimization = shouldBypassNextImageOptimization(imageSrc);

  return (
    <div className="group relative aspect-[4/5] w-full overflow-hidden rounded-md border border-black/20 bg-white/50 transition hover:border-black">
      <button
        type="button"
        onClick={onOpenDetail}
        className="absolute inset-0 z-10 cursor-pointer"
        aria-label={`Open details for ${spot.name}`}
      />
      {!spot.verified ? (
        <div className="absolute left-2 top-2 z-20">
          <span className="inline-flex items-center border border-black/20 bg-white/90 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-neutral-700">
            Yet to Try
          </span>
        </div>
      ) : null}
      <div className="absolute right-2 top-2 z-20">
        <button
          type="button"
          onClick={onToggleAddMenu}
          className="grid h-8 w-8 place-items-center border border-black/20 bg-white/90 font-mono text-lg leading-none text-black transition hover:border-black hover:bg-white"
          aria-label="Add to list"
          aria-expanded={isAddMenuOpen}
        >
          +
        </button>

        {isAddMenuOpen ? (
          <div className="absolute right-0 mt-2 w-52 border border-black/20 bg-white/95 p-1.5 shadow-sm backdrop-blur">
            <button
              type="button"
              onClick={onAddToPublicList}
              disabled={
                !publicList ||
                addActionBusyKey === `${spot.id}:${publicList.id}`
              }
              className="flex w-full items-center justify-between px-2 py-1.5 text-left font-mono text-[10px] uppercase tracking-[0.13em] text-neutral-700 transition hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="inline-flex items-center gap-1.5">
                {isInPublicList ? (
                  <CheckIcon />
                ) : (
                  <span className="h-3.5 w-3.5 shrink-0" aria-hidden />
                )}
                <span>{publicList?.title ?? "Favorites"}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={onAddToPrivateList}
              disabled={
                !privateList ||
                addActionBusyKey === `${spot.id}:${privateList.id}`
              }
              className="flex w-full items-center justify-between px-2 py-1.5 text-left font-mono text-[10px] uppercase tracking-[0.13em] text-neutral-700 transition hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="inline-flex items-center gap-1.5">
                {isInPrivateList ? (
                  <CheckIcon />
                ) : (
                  <span className="h-3.5 w-3.5 shrink-0" aria-hidden />
                )}
                <span>{privateList?.title ?? "Visited"}</span>
              </span>
              <LockIcon />
            </button>
          </div>
        ) : null}
      </div>

      <Image
        src={imageSrc}
        alt={spot.name}
        fill
        className="object-cover transition duration-300 group-hover:scale-[1.02]"
        sizes="(max-width: 768px) 50vw, 33vw"
        unoptimized={bypassOptimization}
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 to-transparent"
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3 text-white">
        <p className="text-sm font-medium leading-tight">{spot.name}</p>
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/90">
          {spot.city}
        </p>
        {spot.heroDish ? (
          <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-[0.1em] text-white/80">
            Hero dish: {spot.heroDish}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12.5l4 4 10-10" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4.5" y="10.5" width="15" height="9" rx="1.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 1 1 7 0v2.5" />
    </svg>
  );
}
