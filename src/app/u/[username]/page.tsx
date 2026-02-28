"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSpotImageUrl } from "@/lib/spots";
import { getSupabaseClient } from "@/lib/supabase";
import type { Profile } from "@/types/profile";

const PROFILE_SELECT = "user_id, display_name, username, avatar_url";
const PROFILE_SELECT_LEGACY = "user_id, display_name, username";

type SpotRecord = {
  id: number;
  name: string;
  city: string;
  maps_link: string;
  lat_lng: string | null;
  image: string | null;
  image_storage_id: string | null;
};

type ViewerProfileList = {
  id: string;
  title: string;
  visibility: "public" | "private";
};

type ViewerProfileListItemRow = {
  list_id: string;
  spot_id: number;
};

function isAvatarColumnMissing(error: {
  message?: string;
  details?: string | null;
  hint?: string | null;
} | null): boolean {
  if (!error) return false;
  const composed = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`
    .toLowerCase()
    .trim();
  return composed.includes("avatar_url") && composed.includes("column");
}

function normalizeProfileRow(row: {
  user_id: string;
  email?: string | null;
  display_name?: string | null;
  username?: string | null;
  role?: string | null;
  avatar_url?: string | null;
}): Profile {
  return {
    ...row,
    email: row.email ?? null,
    role: row.role ?? null,
    display_name: row.display_name ?? null,
    username: row.username ?? null,
    avatar_url: row.avatar_url ?? null,
  };
}

export default function PublicProfilePage() {
  const router = useRouter();
  const params = useParams<{ username: string }>();
  const usernameParam = (params?.username ?? "").toLowerCase();
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  const [isLoading, setIsLoading] = useState(supabaseConfigured);
  const [error, setError] = useState<string | null>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [spots, setSpots] = useState<SpotRecord[]>([]);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [viewerProfileLists, setViewerProfileLists] = useState<ViewerProfileList[]>([]);
  const [viewerListSpotIdsByList, setViewerListSpotIdsByList] = useState<
    Record<string, number[]>
  >({});
  const [openAddMenuSpotId, setOpenAddMenuSpotId] = useState<number | null>(null);
  const [addActionBusyKey, setAddActionBusyKey] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      setViewerUserId(data.session?.user?.id ?? null);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user?.id ?? null;
      setViewerUserId(nextUserId);
      if (!nextUserId) {
        setViewerProfileLists([]);
        setViewerListSpotIdsByList({});
        setOpenAddMenuSpotId(null);
      }
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!viewerUserId) return;

    const supabase = getSupabaseClient();
    if (!supabase) return;

    const loadViewerLists = async () => {
      const { data, error } = await supabase
        .from("profile_lists")
        .select("id, title, visibility")
        .eq("user_id", viewerUserId)
        .order("created_at", { ascending: true });

      if (error) {
        setViewerProfileLists([]);
        setViewerListSpotIdsByList({});
        return;
      }

      const nextLists = (data ?? []) as ViewerProfileList[];
      setViewerProfileLists(nextLists);

      if (nextLists.length === 0) {
        setViewerListSpotIdsByList({});
        return;
      }

      const listIds = nextLists.map((list) => list.id);
      const { data: listItemRows, error: listItemError } = await supabase
        .from("profile_list_items")
        .select("list_id, spot_id")
        .in("list_id", listIds);

      if (listItemError) {
        setViewerListSpotIdsByList({});
        return;
      }

      const nextListSpotIds: Record<string, number[]> = {};
      for (const row of (listItemRows ?? []) as ViewerProfileListItemRow[]) {
        if (!nextListSpotIds[row.list_id]) nextListSpotIds[row.list_id] = [];
        nextListSpotIds[row.list_id].push(row.spot_id);
      }
      setViewerListSpotIdsByList(nextListSpotIds);
    };

    void loadViewerLists();
  }, [viewerUserId]);

  useEffect(() => {
    if (!actionToast) return;
    const timeout = window.setTimeout(() => setActionToast(null), 1800);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [actionToast]);

  useEffect(() => {
    if (!supabaseConfigured || !usernameParam) {
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return;
    }

    const load = async () => {
      setIsLoading(true);
      setError(null);

      let { data: profileRow, error: profileError } = await supabase
        .from("profiles")
        .select(PROFILE_SELECT)
        .eq("username", usernameParam)
        .maybeSingle();

      if (profileError && isAvatarColumnMissing(profileError)) {
        const fallback = await supabase
          .from("profiles")
          .select(PROFILE_SELECT_LEGACY)
          .eq("username", usernameParam)
          .maybeSingle();
        profileRow = fallback.data
          ? {
              ...fallback.data,
              avatar_url: null,
            }
          : null;
        profileError = fallback.error;
      }

      if (profileError || !profileRow) {
        setError("Profile not found.");
        setIsLoading(false);
        return;
      }

      setProfile(normalizeProfileRow(profileRow));

      const { data: listRow, error: listError } = await supabase
        .from("profile_lists")
        .select("id, title")
        .eq("user_id", profileRow.user_id)
        .eq("visibility", "public")
        .maybeSingle();

      if (listError) {
        setError("Unable to load public list.");
        setIsLoading(false);
        return;
      }

      if (!listRow) {
        setSpots([]);
        setIsLoading(false);
        return;
      }

      const { data: listItemsRows, error: listItemsError } = await supabase
        .from("profile_list_items")
        .select("spot_id, created_at")
        .eq("list_id", listRow.id)
        .order("created_at", { ascending: false });

      if (listItemsError) {
        setError("Unable to load list spots.");
        setIsLoading(false);
        return;
      }

      const spotIds = (listItemsRows ?? []).map((row) => row.spot_id);
      if (spotIds.length === 0) {
        setSpots([]);
        setIsLoading(false);
        return;
      }

      const { data: spotRows, error: spotsError } = await supabase
        .from("spots")
        .select("id, name, city, maps_link, lat_lng, image, image_storage_id")
        .in("id", spotIds);

      if (spotsError) {
        setError("Unable to load spot details.");
        setIsLoading(false);
        return;
      }

      const spotById = new Map<number, SpotRecord>();
      for (const spot of (spotRows ?? []) as SpotRecord[]) {
        spotById.set(spot.id, spot);
      }

      const orderedSpots: SpotRecord[] = [];
      for (const row of listItemsRows ?? []) {
        const matched = spotById.get(row.spot_id);
        if (matched) orderedSpots.push(matched);
      }

      setSpots(orderedSpots);
      setIsLoading(false);
    };

    void load();
  }, [supabaseConfigured, usernameParam]);

  const publicList = viewerProfileLists.find((list) => list.visibility === "public");
  const privateList = viewerProfileLists.find((list) => list.visibility === "private");

  const toggleSpotInList = async (
    spotId: number,
    list: ViewerProfileList | undefined,
    label: string,
    isInList: boolean,
  ) => {
    if (!Number.isFinite(spotId)) {
      setActionToast({
        tone: "error",
        text: "Invalid spot selected.",
      });
      return;
    }

    if (!viewerUserId) {
      router.push("/login");
      return;
    }

    if (!list) {
      setActionToast({
        tone: "error",
        text: `No ${label.toLowerCase()} is available on your profile yet.`,
      });
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      setActionToast({
        tone: "error",
        text: "Supabase is not configured yet.",
      });
      return;
    }

    const busyKey = `${spotId}:${list.id}`;
    setAddActionBusyKey(busyKey);
    setActionToast(null);

    let actionError: string | null = null;
    if (isInList) {
      const { error } = await supabase
        .from("profile_list_items")
        .delete()
        .eq("list_id", list.id)
        .eq("spot_id", spotId);
      actionError = error?.message ?? null;
    } else {
      const { error: insertError } = await supabase.from("profile_list_items").insert({
        list_id: list.id,
        spot_id: spotId,
      });

      if (insertError) {
        const normalized =
          `${insertError.message ?? ""} ${insertError.details ?? ""}`.toLowerCase();
        const isDuplicate =
          insertError.code === "23505" ||
          normalized.includes("duplicate key") ||
          normalized.includes("profile_list_items_unique");

        if (isDuplicate) {
          setViewerListSpotIdsByList((current) => {
            const existing = current[list.id] ?? [];
            if (existing.includes(spotId)) return current;
            return {
              ...current,
              [list.id]: [...existing, spotId],
            };
          });
          setActionToast({
            tone: "success",
            text: `Already in ${label}.`,
          });
          setAddActionBusyKey(null);
          setOpenAddMenuSpotId(null);
          return;
        }

        actionError = insertError.message || "Unable to add this spot. Please retry.";
      }
    }

    setAddActionBusyKey(null);
    setOpenAddMenuSpotId(null);

    if (actionError) {
      setActionToast({
        tone: "error",
        text: actionError,
      });
      return;
    }

    setViewerListSpotIdsByList((current) => {
      const existing = current[list.id] ?? [];
      if (isInList) {
        return {
          ...current,
          [list.id]: existing.filter((currentSpotId) => currentSpotId !== spotId),
        };
      }
      if (existing.includes(spotId)) return current;
      return {
        ...current,
        [list.id]: [...existing, spotId],
      };
    });
    setActionToast({
      tone: "success",
      text: isInList ? `Removed from ${label}.` : `Added to ${label}.`,
    });
  };

  if (!supabaseConfigured) {
    return (
      <main className="min-h-screen bg-[#f5f5f2] px-4 py-10 text-neutral-900">
        <div className="mx-auto max-w-6xl border border-black/20 bg-white/70 p-6">
          <h1 className="font-mono text-lg uppercase tracking-[0.16em]">
            Public Profile
          </h1>
          <p className="mt-2 text-sm text-neutral-600">
            Supabase is not configured yet.
          </p>
        </div>
      </main>
    );
  }

  if (!usernameParam) {
    return (
      <main className="min-h-screen bg-[#f5f5f2] px-4 py-10 text-neutral-900">
        <div className="mx-auto max-w-6xl border border-black/20 bg-white/70 p-6">
          <h1 className="font-mono text-lg uppercase tracking-[0.16em]">
            Public Profile
          </h1>
          <p className="mt-2 text-sm text-neutral-600">Profile not found.</p>
          <Link
            href="/"
            className="mt-4 inline-block font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-700 underline decoration-black/25 underline-offset-4"
          >
            Back Home
          </Link>
        </div>
      </main>
    );
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#f5f5f2] px-4 py-10 text-neutral-900">
        <div className="mx-auto max-w-6xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-neutral-500">
            Loading profile...
          </p>
        </div>
      </main>
    );
  }

  if (error || !profile) {
    return (
      <main className="min-h-screen bg-[#f5f5f2] px-4 py-10 text-neutral-900">
        <div className="mx-auto max-w-6xl border border-black/20 bg-white/70 p-6">
          <h1 className="font-mono text-lg uppercase tracking-[0.16em]">
            Public Profile
          </h1>
          <p className="mt-2 text-sm text-neutral-600">{error ?? "Profile not found."}</p>
          <Link
            href="/"
            className="mt-4 inline-block font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-700 underline decoration-black/25 underline-offset-4"
          >
            Back Home
          </Link>
        </div>
      </main>
    );
  }

  const cityCount = new Set(spots.map((spot) => spot.city)).size;
  const profileName = profile.display_name || "NewSpots User";
  const profileInitials =
    profileName
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? "")
      .join("") || "NS";

  return (
    <main className="min-h-screen bg-[#f5f5f2] px-4 py-6 text-neutral-900 md:px-8 md:py-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-7 border-b border-black/20 pb-4">
          <div className="mt-3 flex flex-col gap-6 md:flex-row md:items-start">
            <div className="relative h-36 w-36 shrink-0 overflow-hidden rounded-full border border-black/20 bg-white md:h-44 md:w-44">
              {profile.avatar_url ? (
                <Image
                  src={profile.avatar_url}
                  alt={`${profileName} avatar`}
                  fill
                  className="object-cover"
                  sizes="176px"
                  unoptimized
                />
              ) : (
                <div className="grid h-full w-full place-items-center font-mono text-2xl uppercase tracking-[0.1em] text-neutral-600">
                  {profileInitials}
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <h1 className="font-mono text-3xl tracking-tight text-neutral-900">
                {profile.username}
              </h1>

              <p className="mt-2 text-xl font-medium tracking-tight">{profileName}</p>

              <div className="mt-4 flex flex-wrap gap-6 text-sm text-neutral-700">
                <p>
                  <strong className="text-xl font-semibold text-neutral-900">
                    {spots.length}
                  </strong>{" "}
                  places
                </p>
                <p>
                  <strong className="text-xl font-semibold text-neutral-900">
                    {cityCount}
                  </strong>{" "}
                  cities
                </p>
              </div>

            </div>
          </div>
        </header>

        {spots.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-4">
            {spots.map((spot) => {
              const isInPublicList = Boolean(
                publicList && (viewerListSpotIdsByList[publicList.id] ?? []).includes(spot.id),
              );
              const isInPrivateList = Boolean(
                privateList && (viewerListSpotIdsByList[privateList.id] ?? []).includes(spot.id),
              );
              const spotImageUrl = getSpotImageUrl(
                spot.lat_lng ?? undefined,
                spot.image ?? undefined,
                spot.image_storage_id ?? undefined,
              );

              return (
                <a
                  key={spot.id}
                  href={spot.maps_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative aspect-[4/5] w-full overflow-hidden rounded-md border border-black/20 bg-white/50 transition hover:border-black"
                >
                <div className="absolute right-2 top-2 z-20">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (!viewerUserId) {
                        router.push("/login");
                        return;
                      }
                      setActionToast(null);
                      setOpenAddMenuSpotId((current) =>
                        current === spot.id ? null : spot.id,
                      );
                    }}
                    className="grid h-8 w-8 place-items-center border border-black/20 bg-white/90 font-mono text-lg leading-none text-black transition hover:border-black hover:bg-white"
                    aria-label="Add to list"
                    aria-expanded={openAddMenuSpotId === spot.id}
                  >
                    +
                  </button>

                  {openAddMenuSpotId === spot.id ? (
                    <div className="absolute right-0 mt-2 w-52 border border-black/20 bg-white/95 p-1.5 shadow-sm backdrop-blur">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void toggleSpotInList(
                            spot.id,
                            publicList,
                            publicList?.title ?? "Favorites",
                            isInPublicList,
                          );
                        }}
                        disabled={
                          !publicList ||
                          addActionBusyKey === `${spot.id}:${publicList.id}`
                        }
                        className="flex w-full items-center justify-between px-2 py-1.5 text-left font-mono text-[10px] uppercase tracking-[0.13em] text-neutral-700 transition hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="inline-flex items-center gap-1.5">
                          {isInPublicList ? (
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
                          ) : (
                            <span className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          )}
                          <span>{publicList?.title ?? "Favorites"}</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void toggleSpotInList(
                            spot.id,
                            privateList,
                            privateList?.title ?? "Visited",
                            isInPrivateList,
                          );
                        }}
                        disabled={
                          !privateList ||
                          addActionBusyKey === `${spot.id}:${privateList.id}`
                        }
                        className="flex w-full items-center justify-between px-2 py-1.5 text-left font-mono text-[10px] uppercase tracking-[0.13em] text-neutral-700 transition hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="inline-flex items-center gap-1.5">
                          {isInPrivateList ? (
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
                          ) : (
                            <span className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          )}
                          <span>{privateList?.title ?? "Visited"}</span>
                        </span>
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
                      </button>
                    </div>
                  ) : null}
                </div>

                <Image
                  src={spotImageUrl}
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
              );
            })}
          </div>
        ) : (
          <div className="border border-black/20 bg-white/60 p-6 text-sm text-neutral-600">
            No places in this public list yet.
          </div>
        )}
      </div>

      {actionToast ? (
        <div className="fixed bottom-4 right-4 z-50">
          <div
            className={`rounded-sm border px-3 py-2 text-xs shadow-sm ${
              actionToast.tone === "success"
                ? "border-black/20 bg-white/90 text-neutral-800"
                : "border-red-700/30 bg-red-50/95 text-red-700"
            }`}
          >
            {actionToast.text}
          </div>
        </div>
      ) : null}
    </main>
  );
}
