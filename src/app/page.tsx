"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

type SpotRow = {
  name: string;
  city: string;
  maps_link: string;
  lat_lng: string | null;
  image: string | null;
};

const FAVORITES_FILTER = "__favorites__";
const VISITED_FILTER = "__visited__";
const PAGE_SIZE = 15;

function parseLatLng(latLng: string): { lat: number; lng: number } | null {
  const parts = latLng.split(",").map((s) => parseFloat(s.trim()));
  if (parts.length !== 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) {
    return null;
  }
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

function mapRowToSpot(row: SpotRow): Spot {
  return {
    name: row.name,
    city: row.city,
    mapsLink: row.maps_link,
    latLng: row.lat_lng ?? undefined,
    image: row.image ?? undefined,
  };
}

export default function Home() {
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  const [selectedCity, setSelectedCity] = useState<string>("All");
  const [spots, setSpots] = useState<Spot[]>([]);
  const [cities, setCities] = useState<string[]>(["All"]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [isSpotsLoading, setIsSpotsLoading] = useState(supabaseConfigured);
  const [spotsError, setSpotsError] = useState<string | null>(
    supabaseConfigured ? null : "Supabase is not configured yet.",
  );

  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(supabaseConfigured);
  const [statuses, setStatuses] = useState<Record<string, SpotStatus>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const hasFavoriteSpots = useMemo(
    () => Object.values(statuses).some((status) => status.favorite),
    [statuses],
  );
  const hasVisitedSpots = useMemo(
    () => Object.values(statuses).some((status) => status.visited),
    [statuses],
  );

  const activeFilter =
    !userId &&
    (selectedCity === FAVORITES_FILTER || selectedCity === VISITED_FILTER)
      ? "All"
      : selectedCity;

  const filterOptions = [
    { label: "All", value: "All" },
    ...(userId
      ? [
          ...(hasFavoriteSpots
            ? [{ label: "Favorites", value: FAVORITES_FILTER }]
            : []),
          ...(hasVisitedSpots ? [{ label: "Visited", value: VISITED_FILTER }] : []),
        ]
      : []),
    ...cities
      .filter((city) => city !== "All")
      .map((city) => ({ label: city, value: city })),
  ];

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

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

    const fetchCities = async () => {
      const { data, error } = await supabase
        .from("spots")
        .select("city")
        .order("city", { ascending: true });

      if (error) return;

      const uniqueCities = [
        "All",
        ...new Set((data ?? []).map((row) => row.city).filter(Boolean)),
      ];
      setCities(uniqueCities);
    };

    void fetchCities();
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

    void fetchStatuses();
  }, [userId]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    let cancelled = false;

    const fetchSpots = async () => {
      setIsSpotsLoading(true);
      setSpotsError(null);

      if (activeFilter === FAVORITES_FILTER || activeFilter === VISITED_FILTER) {
        const wantedKeys = new Set(
          Object.entries(statuses)
            .filter(([, status]) =>
              activeFilter === FAVORITES_FILTER ? status.favorite : status.visited,
            )
            .map(([spotKey]) => spotKey),
        );

        if (wantedKeys.size === 0) {
          if (!cancelled) {
            setSpots([]);
            setTotalCount(0);
            setIsSpotsLoading(false);
          }
          return;
        }

        const { data, error } = await supabase
          .from("spots")
          .select("name, city, maps_link, lat_lng, image")
          .order("created_at", { ascending: false });

        if (cancelled) return;

        if (error) {
          setSpots([]);
          setTotalCount(0);
          setSpotsError("Unable to load spots.");
          setIsSpotsLoading(false);
          return;
        }

        const matched = (data ?? [])
          .map((row) => mapRowToSpot(row as SpotRow))
          .filter((spot) => wantedKeys.has(getSpotKey(spot)));

        const from = (page - 1) * PAGE_SIZE;
        const to = from + PAGE_SIZE;

        setTotalCount(matched.length);
        setSpots(matched.slice(from, to));
        setIsSpotsLoading(false);
        return;
      }

      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from("spots")
        .select("name, city, maps_link, lat_lng, image", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);

      if (activeFilter !== "All") {
        query = query.eq("city", activeFilter);
      }

      const { data, error, count } = await query;

      if (cancelled) return;

      if (error) {
        setSpots([]);
        setTotalCount(0);
        setSpotsError("Unable to load spots.");
        setIsSpotsLoading(false);
        return;
      }

      setSpots((data ?? []).map((row) => mapRowToSpot(row as SpotRow)));
      setTotalCount(count ?? 0);
      setIsSpotsLoading(false);
    };

    void fetchSpots();

    return () => {
      cancelled = true;
    };
  }, [activeFilter, page, statuses]);

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

  const handleFilterChange = (value: string) => {
    setSelectedCity(value);
    setPage(1);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f5f5f2] text-neutral-900">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,0,0,0.04),transparent_45%),linear-gradient(to_bottom,rgba(255,255,255,0.45),rgba(0,0,0,0.015))]" />
      <main className="relative px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 border-b border-black/20 pb-4 md:mb-10">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
              <div>
                <h1 className="font-mono text-base uppercase tracking-[0.22em]">
                  NewSpots.club
                </h1>
                <p className="mt-1 text-xs text-neutral-600">
                  Save favorites and visited places.
                </p>
              </div>

              {sessionLoading ? (
                <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-neutral-500">
                  Checking session...
                </p>
              ) : userId ? (
                <div className="flex items-center gap-3">
                  <p className="hidden max-w-44 truncate font-mono text-[10px] uppercase tracking-[0.12em] text-neutral-500 sm:block">
                    {userEmail}
                  </p>
                  {isAdmin ? (
                    <Link
                      href="/admin"
                      className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-600 underline decoration-black/25 underline-offset-4 transition hover:text-black hover:decoration-black"
                    >
                      Admin
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-600 underline decoration-black/25 underline-offset-4 transition hover:text-black hover:decoration-black"
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  {!supabaseConfigured ? (
                    <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-red-700">
                      Supabase not set
                    </span>
                  ) : null}
                  <Link
                    href="/login"
                    className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-700 underline decoration-black/25 underline-offset-4 transition hover:text-black hover:decoration-black"
                  >
                    Login
                  </Link>
                </div>
              )}
            </div>
          </div>

          {saveError ? (
            <p className="mb-4 border border-red-700/35 bg-red-50/70 px-3 py-2 text-xs text-red-700">
              {saveError}
            </p>
          ) : null}

          {spotsError ? (
            <p className="mb-4 border border-red-700/35 bg-red-50/70 px-3 py-2 text-xs text-red-700">
              {spotsError}
            </p>
          ) : null}

          <div className="mb-7 flex gap-2 overflow-x-auto pb-1 md:mb-9 md:flex-wrap md:overflow-visible">
            {filterOptions.map((option, optionIndex) => (
              <button
                key={`${option.value}-${optionIndex}`}
                type="button"
                onClick={() => handleFilterChange(option.value)}
                className={`shrink-0 border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition ${
                  option.value === FAVORITES_FILTER ||
                  option.value === VISITED_FILTER
                    ? "animate-pill-enter"
                    : ""
                } ${
                  activeFilter === option.value
                    ? option.value === FAVORITES_FILTER
                      ? "border-red-700/30 bg-red-50 text-red-700"
                      : option.value === VISITED_FILTER
                        ? "border-emerald-700 bg-emerald-700 text-white"
                        : "border-black bg-black text-white"
                    : "border-black/20 bg-white/60 text-neutral-600 hover:border-black hover:text-black"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {isSpotsLoading ? (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-4">
              {Array.from({ length: PAGE_SIZE }).map((_, index) => (
                <div
                  key={`spot-loader-${index}`}
                  className="aspect-[4/5] animate-pulse border border-black/15 bg-white/60"
                />
              ))}
            </div>
          ) : spots.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-4">
              {spots.map((spot) => (
                <a
                  key={`${getSpotKey(spot)}-${spot.mapsLink}`}
                  href={spot.mapsLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative aspect-[4/5] w-full overflow-hidden border border-black/20 bg-white/50 transition hover:border-black"
                >
                  {userId ? (
                    <div className="absolute inset-x-2 top-2 z-10 flex items-center justify-between">
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
                        className={`grid h-8 w-8 place-items-center border transition ${
                          statuses[getSpotKey(spot)]?.favorite
                            ? "border-red-700/60 bg-red-50 text-red-700"
                            : "border-black/20 bg-white/85 text-black"
                        }`}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                          className="h-4 w-4"
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
                        className={`px-2 py-1 font-mono text-[10px] uppercase tracking-[0.13em] ${
                          statuses[getSpotKey(spot)]?.visited
                            ? "bg-emerald-700 text-white"
                            : "bg-white/85 text-black"
                        }`}
                      >
                        Visited
                      </button>
                    </div>
                  ) : (
                    <div className="absolute right-2 top-2 z-10 bg-white/90 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.13em] text-neutral-700">
                      Login to save
                    </div>
                  )}

                  <Image
                    src={getSpotImageUrl(spot)}
                    alt={spot.name}
                    fill
                    className="object-cover transition duration-300 group-hover:scale-[1.02]"
                    sizes="(max-width: 768px) 50vw, 33vw"
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
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <div className="border border-black/20 bg-white/60 p-6 text-sm text-neutral-600">
              No spots found for this filter.
            </div>
          )}

          {!isSpotsLoading && totalCount > PAGE_SIZE ? (
            <div className="mt-7 grid grid-cols-2 items-center gap-2 text-xs text-neutral-600 md:grid-cols-4">
              <p className="md:col-span-2">
                Showing {(page - 1) * PAGE_SIZE + 1}-
                {Math.min(page * PAGE_SIZE, totalCount)} of {totalCount}
              </p>
              <div className="flex items-center gap-2 md:justify-end">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1}
                  className="border border-black/20 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-700 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={page >= totalPages}
                  className="border border-black/20 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-700 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
              <p className="text-right">Page {page} of {totalPages}</p>
            </div>
          ) : null}

          <footer className="mt-10 border-t border-black/20 pt-6 pb-2 text-xs text-neutral-600 md:mt-12">
            <p>A curated list of new spots to explore in and around you.</p>
            <a
              href="mailto:hello@newspots.club"
              className="mt-1 inline-block font-mono text-[11px] uppercase tracking-[0.13em] text-neutral-900 underline decoration-black/35 underline-offset-4 hover:decoration-black"
            >
              Add your place.
            </a>
          </footer>
        </div>
      </main>
    </div>
  );
}
