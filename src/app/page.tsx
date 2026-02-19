"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import spotsData from "@/data/spots.json";
import { getStaticMapImageUrl } from "@/lib/staticMap";
import { getSupabaseClient } from "@/lib/supabase";

type Spot = {
  image?: string;
  name: string;
  city: string;
  mapsLink: string;
  latLng?: string;
};

type SpotStatus = {
  favorite: boolean;
  visited: boolean;
};

const fallbackSpots = spotsData.spots as Spot[];
const FAVORITES_FILTER = "__favorites__";
const VISITED_FILTER = "__visited__";

function parseLatLng(latLng: string): { lat: number; lng: number } | null {
  const parts = latLng.split(",").map((s) => parseFloat(s.trim()));
  if (parts.length !== 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1]))
    return null;
  return { lat: parts[0], lng: parts[1] };
}

function getSpotImageUrl(spot: Spot): string {
  if (spot.image) return spot.image;
  if (spot.latLng) {
    const coords = parseLatLng(spot.latLng);
    if (coords) {
      const mapUrl = getStaticMapImageUrl(coords.lat, coords.lng);
      if (mapUrl) return mapUrl;
    }
  }
  return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='500' viewBox='0 0 400 500'%3E%3Crect fill='%23e5e5e5' width='400' height='500'/%3E%3C/svg%3E";
}

function getSpotKey(spot: Spot): string {
  return `${spot.name}-${spot.city}`
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/(^-|-$)/g, "");
}

export default function Home() {
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  const [selectedCity, setSelectedCity] = useState<string>("All");
  const [spots, setSpots] = useState<Spot[]>(fallbackSpots);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(supabaseConfigured);
  const [statuses, setStatuses] = useState<Record<string, SpotStatus>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const cities = ["All", ...new Set(spots.map((s) => s.city).sort())];
  const hasFavoriteSpots = spots.some(
    (spot) => Boolean(userId && statuses[getSpotKey(spot)]?.favorite),
  );
  const hasVisitedSpots = spots.some(
    (spot) => Boolean(userId && statuses[getSpotKey(spot)]?.visited),
  );
  const filterOptions = [
    { label: "All", value: "All" },
    ...(userId
      ? [
          ...(hasFavoriteSpots
            ? [{ label: "Favorites", value: FAVORITES_FILTER }]
            : []),
          ...(hasVisitedSpots
            ? [{ label: "Visited", value: VISITED_FILTER }]
            : []),
        ]
      : []),
    ...cities
      .filter((city) => city !== "All")
      .map((city) => ({ label: city, value: city })),
  ];
  const activeFilter =
    !userId &&
    (selectedCity === FAVORITES_FILTER || selectedCity === VISITED_FILTER)
      ? "All"
      : selectedCity;

  const filteredSpots = spots.filter((spot) => {
    if (activeFilter === "All") return true;
    if (activeFilter === FAVORITES_FILTER) {
      return Boolean(userId && statuses[getSpotKey(spot)]?.favorite);
    }
    if (activeFilter === VISITED_FILTER) {
      return Boolean(userId && statuses[getSpotKey(spot)]?.visited);
    }
    return spot.city === activeFilter;
  });

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user ?? null;
      setUserId(user?.id ?? null);
      setUserEmail(user?.email ?? null);
      setUserRole(null);
      setSessionLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      setUserId(user?.id ?? null);
      setUserEmail(user?.email ?? null);
      if (!user) {
        setStatuses({});
        setUserRole(null);
      }
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const fetchSpots = async () => {
      const { data, error } = await supabase
        .from("spots")
        .select("name, city, maps_link, lat_lng, image")
        .order("created_at", { ascending: false });

      if (error || !data || data.length === 0) return;

      setSpots(
        data.map((row) => ({
          name: row.name,
          city: row.city,
          mapsLink: row.maps_link,
          latLng: row.lat_lng ?? undefined,
          image: row.image ?? undefined,
        })),
      );
    };

    void fetchSpots();
  }, []);

  useEffect(() => {
    if (!userId) return;

    const supabase = getSupabaseClient();
    if (!supabase) return;

    const fetchRole = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();

      setUserRole(data?.role ?? null);
    };

    void fetchRole();
  }, [userId]);

  const isAdmin = userRole === "admin";

  useEffect(() => {
    if (!userId) return;

    const fetchStatuses = async () => {
      const supabase = getSupabaseClient();
      if (!supabase) return;
      const { data, error } = await supabase
        .from("user_spot_status")
        .select("spot_key, is_favorite, is_visited")
        .eq("user_id", userId);

      if (error) return;

      const nextStatuses: Record<string, SpotStatus> = {};
      for (const row of data ?? []) {
        nextStatuses[row.spot_key] = {
          favorite: row.is_favorite,
          visited: row.is_visited,
        };
      }
      setStatuses(nextStatuses);
    };

    fetchStatuses();
  }, [userId]);

  const toggleSpotStatus = async (
    spot: Spot,
    field: keyof SpotStatus,
    value: boolean,
  ) => {
    if (!userId) return;

    const key = getSpotKey(spot);
    const previous = statuses[key] ?? { favorite: false, visited: false };
    const next = { ...previous, [field]: value };

    setSaveError(null);
    setSavingKey(`${key}:${field}`);
    setStatuses((current) => ({ ...current, [key]: next }));

    const supabase = getSupabaseClient();
    if (!supabase) {
      setSaveError("Supabase is not configured yet.");
      setStatuses((current) => ({ ...current, [key]: previous }));
      setSavingKey(null);
      return;
    }

    const { error } =
      !next.favorite && !next.visited
        ? await supabase
            .from("user_spot_status")
            .delete()
            .eq("user_id", userId)
            .eq("spot_key", key)
        : await supabase.from("user_spot_status").upsert(
            {
              user_id: userId,
              spot_key: key,
              is_favorite: next.favorite,
              is_visited: next.visited,
            },
            { onConflict: "user_id,spot_key" },
          );

    if (error) {
      setStatuses((current) => ({ ...current, [key]: previous }));
      setSaveError("Unable to update your list. Please retry.");
    }

    setSavingKey(null);
  };

  const handleSignOut = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    await supabase.auth.signOut();
  };

  return (
    <div className="min-h-screen bg-white text-black">
      <main className="px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-5 flex items-center justify-between gap-3 md:mb-7">
            <div>
              <h1 className="text-lg font-semibold">NewSpots.club</h1>
              <p className="text-xs text-neutral-600">
                Save your favorite and visited places.
              </p>
            </div>

            {sessionLoading ? (
              <p className="text-xs text-neutral-500">Checking session...</p>
            ) : userId ? (
              <div className="flex items-center gap-2">
                <p className="hidden text-xs text-neutral-600 sm:block">
                  {userEmail}
                </p>
                {isAdmin ? (
                  <Link
                    href="/admin"
                    className="rounded-full border border-neutral-300 px-3 py-1 text-xs hover:border-black"
                  >
                    Admin
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="rounded-full border border-neutral-300 px-3 py-1 text-xs hover:border-black"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {!supabaseConfigured ? (
                  <span className="text-xs text-red-600">Supabase not set</span>
                ) : null}
                <Link
                  href="/login"
                  className="rounded-full border border-black bg-black px-3 py-1 text-xs text-white"
                >
                  Login
                </Link>
              </div>
            )}
          </div>

          {saveError ? (
            <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {saveError}
            </p>
          ) : null}

          <div className="mb-6 flex gap-1.5 overflow-x-auto pb-1 md:mb-8 md:flex-wrap md:overflow-visible">
            {filterOptions.map((option, optionIndex) => (
              <button
                key={`${option.value}-${optionIndex}`}
                type="button"
                onClick={() => setSelectedCity(option.value)}
                className={`shrink-0 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  selectedCity === option.value
                    ? option.value === FAVORITES_FILTER
                      ? "border-rose-200 bg-rose-100 text-rose-700"
                      : option.value === VISITED_FILTER
                        ? "border-emerald-700 bg-emerald-700 text-white"
                        : "border-black bg-black text-white"
                    : "border-neutral-300 bg-white text-neutral-600 hover:border-neutral-400 hover:text-black"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-4">
            {filteredSpots.map((spot) => (
              <a
                key={`${getSpotKey(spot)}-${spot.mapsLink}`}
                href={spot.mapsLink}
                target="_blank"
                rel="noopener noreferrer"
                className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_4px_14px_rgba(0,0,0,0.08)] transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(0,0,0,0.12)]"
              >
                {userId ? (
                  <div className="absolute top-2 inset-x-2 z-10 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        const key = getSpotKey(spot);
                        const current = statuses[key]?.favorite ?? false;
                        void toggleSpotStatus(spot, "favorite", !current);
                      }}
                      disabled={savingKey === `${getSpotKey(spot)}:favorite`}
                      aria-label={
                        statuses[getSpotKey(spot)]?.favorite
                          ? "Remove from favorites"
                          : "Add to favorites"
                      }
                      className={`rounded-full p-2 ${
                        statuses[getSpotKey(spot)]?.favorite
                          ? "bg-rose-100 text-rose-700"
                          : "bg-white/85 text-black"
                      }`}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        className="h-5 w-5"
                        fill={
                          statuses[getSpotKey(spot)]?.favorite
                            ? "currentColor"
                            : "none"
                        }
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M11.995 21.35a.75.75 0 0 1-.522-.216l-1.884-1.792c-4.08-3.88-6.8-6.468-6.8-9.63 0-2.578 2.007-4.545 4.57-4.545 1.62 0 3.177.8 4.136 2.043.959-1.242 2.517-2.043 4.136-2.043 2.563 0 4.57 1.967 4.57 4.545 0 3.162-2.72 5.75-6.8 9.63l-1.884 1.792a.75.75 0 0 1-.522.216z" />
                      </svg>
                      <span className="sr-only">Favorite</span>
                    </button>

                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        const key = getSpotKey(spot);
                        const current = statuses[key]?.visited ?? false;
                        void toggleSpotStatus(spot, "visited", !current);
                      }}
                      disabled={savingKey === `${getSpotKey(spot)}:visited`}
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        statuses[getSpotKey(spot)]?.visited
                          ? "bg-emerald-700 text-white"
                          : "bg-white/85 text-black"
                      }`}
                    >
                      Visited
                    </button>
                  </div>
                ) : (
                  <div className="absolute top-2 right-2 z-10 rounded-full bg-white/90 px-2 py-1 text-[10px] font-medium text-neutral-700">
                    Login to save
                  </div>
                )}

                <Image
                  src={getSpotImageUrl(spot)}
                  alt={spot.name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 50vw, 33vw"
                />
                <div
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 to-transparent"
                  aria-hidden
                />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3 text-white">
                  <p className="text-sm font-medium leading-tight">{spot.name}</p>
                  <p className="text-xs text-white/85">{spot.city}</p>
                </div>
              </a>
            ))}
          </div>

          <footer className="mt-10 border-t border-neutral-200 pt-6 pb-2 text-xs text-neutral-600 md:mt-12">
            <p>A curated list of new spots to explore in and around you.</p>
            <a
              href="mailto:hello@newspots.club"
              className="mt-1 inline-block text-neutral-900 underline decoration-neutral-400 underline-offset-4 hover:decoration-neutral-900"
            >
              Add your place.
            </a>
          </footer>
        </div>
      </main>
    </div>
  );
}
