"use client";

import Image from "next/image";
import type { HomeSpot } from "@/types/home";
import { getHomeSpotImageUrl } from "@/lib/home-spots";

type SpotDetailModalProps = {
  spot: HomeSpot;
  onClose: () => void;
};

export function SpotDetailModal({ spot, onClose }: SpotDetailModalProps) {
  return (
    <div
      className="fixed inset-0 z-40 bg-black/45 p-4 md:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="spot-details-title"
    >
      <div className="mx-auto grid h-full w-full max-w-4xl place-items-center">
        <div
          className="w-full max-w-3xl overflow-hidden border border-black/20 bg-[#f7f6f1] shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="grid md:grid-cols-[1.05fr_0.95fr]">
            <div className="relative overflow-hidden aspect-[4/3] border-b border-black/10 md:aspect-auto md:min-h-[420px] md:border-b-0 md:border-r">
              <div className="absolute inset-0 bg-neutral-200" aria-hidden />
              <Image
                key={spot.id}
                src={getHomeSpotImageUrl(spot)}
                alt={spot.name}
                width={1200}
                height={900}
                className="relative z-0 block h-full w-full object-cover"
                sizes="(max-width: 768px) 100vw, 50vw"
                priority
                unoptimized
              />
              {!spot.verified ? (
                <div className="absolute left-3 top-3">
                  <span className="inline-flex items-center border border-black/20 bg-white/90 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-neutral-700">
                    Yet to Try
                  </span>
                </div>
              ) : null}
            </div>

            <div className="flex flex-col p-4 md:p-5">
              <div className="flex items-start gap-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500">
                    Place Details
                  </p>
                  <h2
                    id="spot-details-title"
                    className="mt-2 text-2xl font-medium tracking-tight text-neutral-900"
                  >
                    {spot.name}
                  </h2>
                  <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-neutral-600">
                    {spot.city}
                  </p>
                </div>
              </div>

              {spot.heroDish ? (
                <div className="mt-5 space-y-3 border-y border-black/10 py-4">
                  <div className="grid grid-cols-[96px_1fr] gap-3 text-sm">
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-500">
                      Hero Dish
                    </p>
                    <p className="text-neutral-800">{spot.heroDish}</p>
                  </div>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <a
                  href={spot.mapsLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center border border-black bg-black px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-white transition hover:bg-neutral-900"
                >
                  Navigate
                </a>
              </div>

              <p className="mt-3 text-xs text-neutral-500">
                Opens Google Maps in a new tab.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
