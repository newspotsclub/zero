"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getStaticMapImageUrl } from "@/lib/staticMap";
import { getSupabaseClient } from "@/lib/supabase";

type Spot = {
  id: number;
  image?: string;
  name: string;
  city: string;
  mapsLink: string;
  latLng?: string;
};

type SpotRow = {
  id: number;
  name: string;
  city: string;
  maps_link: string;
  lat_lng: string | null;
  image: string | null;
};

type ProfileList = {
  id: string;
  title: string;
  visibility: "public" | "private";
};

type ProfileListItemRow = {
  list_id: string;
  spot_id: number;
};

type HomeProfileRow = {
  role: string | null;
  display_name: string | null;
  username: string | null;
  avatar_url?: string | null;
};

const PAGE_SIZE = 15;
const MAX_PROFILE_PHOTO_BYTES = 2 * 1024 * 1024;
const PROFILE_SELECT: string = "role, display_name, username, avatar_url";
const PROFILE_SELECT_LEGACY: string = "role, display_name, username";

function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "NS";
  return (
    trimmed
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? "")
      .join("") || "NS"
  );
}

function toDefaultDisplayName(email: string | null): string {
  const local = (email ?? "").split("@")[0] ?? "";
  const cleaned = local.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return "NewSpots User";
  return cleaned
    .split(/\s+/)
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

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

function parseLatLng(latLng: string): { lat: number; lng: number } | null {
  const parts = latLng.split(",").map((part) => parseFloat(part.trim()));
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

function mapRowToSpot(row: SpotRow): Spot {
  return {
    id: row.id,
    name: row.name,
    city: row.city,
    mapsLink: row.maps_link,
    latLng: row.lat_lng ?? undefined,
    image: row.image ?? undefined,
  };
}

export default function Home() {
  const router = useRouter();
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
  const [profileLists, setProfileLists] = useState<ProfileList[]>([]);
  const [listSpotIdsByList, setListSpotIdsByList] = useState<Record<string, number[]>>(
    {},
  );
  const [sessionLoading, setSessionLoading] = useState(supabaseConfigured);
  const [openAddMenuSpotId, setOpenAddMenuSpotId] = useState<number | null>(null);
  const [addActionBusyKey, setAddActionBusyKey] = useState<string | null>(null);
  const [addActionMessage, setAddActionMessage] = useState<string | null>(null);
  const [addActionError, setAddActionError] = useState<string | null>(null);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [isOnboardingSaving, setIsOnboardingSaving] = useState(false);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [onboardingDisplayName, setOnboardingDisplayName] = useState("");
  const [onboardingUsername, setOnboardingUsername] = useState("");
  const [onboardingAvatarUrl, setOnboardingAvatarUrl] = useState("");
  const [onboardingAvatarSupported, setOnboardingAvatarSupported] = useState(true);
  const [homeToast, setHomeToast] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

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
        setUserRole(null);
        setProfileLists([]);
        setListSpotIdsByList({});
        setOpenAddMenuSpotId(null);
        setIsOnboardingOpen(false);
        setOnboardingError(null);
        setOnboardingDisplayName("");
        setOnboardingUsername("");
        setOnboardingAvatarUrl("");
      }
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!userId) return;

    const supabase = getSupabaseClient();
    if (!supabase) return;

    const fetchProfile = async () => {
      let avatarSupported = true;

      const response = await supabase
        .from("profiles")
        .select(PROFILE_SELECT)
        .eq("user_id", userId)
        .maybeSingle();
      let profileData = (response.data ?? null) as unknown as HomeProfileRow | null;
      let profileError = response.error;

      if (profileError && isAvatarColumnMissing(profileError)) {
        avatarSupported = false;
        const fallback = await supabase
          .from("profiles")
          .select(PROFILE_SELECT_LEGACY)
          .eq("user_id", userId)
          .maybeSingle();
        profileData = fallback.data
          ? {
              ...((fallback.data as unknown) as HomeProfileRow),
              avatar_url: null,
            }
          : null;
        profileError = fallback.error;
      }

      if (profileError) {
        setUserRole(null);
        return;
      }

      setOnboardingAvatarSupported(avatarSupported);
      setUserRole(profileData?.role ?? null);

      const displayName =
        profileData?.display_name?.trim() ||
        toDefaultDisplayName(userEmail);
      const username = profileData?.username?.trim() ?? "";

      setOnboardingDisplayName(displayName);
      setOnboardingUsername(username);
      setOnboardingAvatarUrl(profileData?.avatar_url ?? "");
      setOnboardingError(null);
      setIsOnboardingOpen(username.length === 0);
    };

    void fetchProfile();
  }, [userId, userEmail]);

  useEffect(() => {
    if (!userId) return;

    const supabase = getSupabaseClient();
    if (!supabase) return;

    const fetchProfileLists = async () => {
      const { data, error } = await supabase
        .from("profile_lists")
        .select("id, title, visibility")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (error) {
        setProfileLists([]);
        setListSpotIdsByList({});
        return;
      }

      const nextLists = (data ?? []) as ProfileList[];
      setProfileLists(nextLists);

      if (nextLists.length === 0) {
        setListSpotIdsByList({});
        return;
      }

      const listIds = nextLists.map((list) => list.id);
      const { data: itemRows, error: itemError } = await supabase
        .from("profile_list_items")
        .select("list_id, spot_id")
        .in("list_id", listIds);

      if (itemError) {
        setListSpotIdsByList({});
        return;
      }

      const nextListSpotIds: Record<string, number[]> = {};
      for (const row of (itemRows ?? []) as ProfileListItemRow[]) {
        if (!nextListSpotIds[row.list_id]) nextListSpotIds[row.list_id] = [];
        nextListSpotIds[row.list_id].push(row.spot_id);
      }
      setListSpotIdsByList(nextListSpotIds);
    };

    void fetchProfileLists();
  }, [userId]);

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
    const supabase = getSupabaseClient();
    if (!supabase) return;

    let cancelled = false;

    const fetchSpots = async () => {
      setIsSpotsLoading(true);
      setSpotsError(null);

      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from("spots")
        .select("id, name, city, maps_link, lat_lng, image", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);

      if (selectedCity !== "All") {
        query = query.eq("city", selectedCity);
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
  }, [selectedCity, page]);

  useEffect(() => {
    if (!homeToast) return;
    const timeout = window.setTimeout(() => setHomeToast(null), 1800);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [homeToast]);

  useEffect(() => {
    if (!spotsError) return;
    setHomeToast({
      tone: "error",
      text: spotsError,
    });
    setSpotsError(null);
  }, [spotsError]);

  useEffect(() => {
    if (!addActionError) return;
    setHomeToast({
      tone: "error",
      text: addActionError,
    });
    setAddActionError(null);
  }, [addActionError]);

  useEffect(() => {
    if (!addActionMessage) return;
    setHomeToast({
      tone: "success",
      text: addActionMessage,
    });
    setAddActionMessage(null);
  }, [addActionMessage]);

  useEffect(() => {
    if (!onboardingError) return;
    setHomeToast({
      tone: "error",
      text: onboardingError,
    });
    setOnboardingError(null);
  }, [onboardingError]);

  const isAdmin = userRole === "admin";

  const handleSignOut = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    await supabase.auth.signOut();
  };

  const handleFilterChange = (value: string) => {
    setSelectedCity(value);
    setPage(1);
    setOpenAddMenuSpotId(null);
  };

  const publicList = profileLists.find((list) => list.visibility === "public");
  const privateList = profileLists.find((list) => list.visibility === "private");

  const toggleSpotInList = async (
    spotId: number,
    list: ProfileList | undefined,
    label: string,
    isInList: boolean,
  ) => {
    if (!Number.isFinite(spotId)) {
      setAddActionError("Invalid spot selected.");
      return;
    }

    if (!userId) {
      router.push("/login");
      return;
    }

    if (!list) {
      setAddActionError(`No ${label.toLowerCase()} is available on your profile yet.`);
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      setAddActionError("Supabase is not configured yet.");
      return;
    }

    const busyKey = `${spotId}:${list.id}`;
    setAddActionBusyKey(busyKey);
    setAddActionError(null);
    setAddActionMessage(null);

    let actionError: string | null = null;
    if (isInList) {
      const { error } = await supabase
        .from("profile_list_items")
        .delete()
        .eq("list_id", list.id)
        .eq("spot_id", spotId);
      actionError = error?.message ?? null;
    } else {
      const { error } = await supabase.from("profile_list_items").insert({
        list_id: list.id,
        spot_id: spotId,
      });
      if (error) {
        const normalized = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
        const isDuplicate =
          error.code === "23505" ||
          normalized.includes("duplicate key") ||
          normalized.includes("profile_list_items_unique");
        if (isDuplicate) {
          setListSpotIdsByList((current) => {
            const existing = current[list.id] ?? [];
            if (existing.includes(spotId)) return current;
            return {
              ...current,
              [list.id]: [...existing, spotId],
            };
          });
          setAddActionMessage(`Already in ${label}.`);
          setAddActionBusyKey(null);
          setOpenAddMenuSpotId(null);
          return;
        }
        actionError = error.message || "Unable to add this spot. Please retry.";
      }
    }

    setAddActionBusyKey(null);
    setOpenAddMenuSpotId(null);

    if (actionError) {
      setAddActionError(actionError);
      return;
    }

    setListSpotIdsByList((current) => {
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
    setAddActionMessage(isInList ? `Removed from ${label}.` : `Added to ${label}.`);
  };

  const onOnboardingPhotoSelected = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setOnboardingError("Please select an image file.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_PROFILE_PHOTO_BYTES) {
      setOnboardingError("Profile photo must be 2MB or smaller.");
      event.target.value = "";
      return;
    }

    const toDataUrl = () =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === "string") {
            resolve(reader.result);
            return;
          }
          reject(new Error("Image parsing failed."));
        };
        reader.onerror = () => reject(new Error("Image parsing failed."));
        reader.readAsDataURL(file);
      });

    try {
      const dataUrl = await toDataUrl();
      setOnboardingAvatarUrl(dataUrl);
      setOnboardingError(null);
    } catch {
      setOnboardingError("Unable to read image file.");
    } finally {
      event.target.value = "";
    }
  };

  const saveOnboardingProfile = async () => {
    if (!userId) return;

    const nextDisplayName = onboardingDisplayName.trim();
    const nextUsername = onboardingUsername.trim().toLowerCase();
    const nextAvatarUrl = onboardingAvatarUrl.trim();

    if (!nextDisplayName) {
      setOnboardingError("Display name is required.");
      return;
    }

    if (!nextUsername) {
      setOnboardingError("Username is required.");
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      setOnboardingError("Supabase is not configured yet.");
      return;
    }

    setIsOnboardingSaving(true);
    setOnboardingError(null);

    let usedAvatarFallback = false;
    let updatePayload: {
      display_name: string;
      username: string;
      avatar_url?: string | null;
    } = {
      display_name: nextDisplayName,
      username: nextUsername,
    };

    if (onboardingAvatarSupported) {
      updatePayload = {
        ...updatePayload,
        avatar_url: nextAvatarUrl.length > 0 ? nextAvatarUrl : null,
      };
    }

    const response = await supabase
      .from("profiles")
      .update(updatePayload)
      .eq("user_id", userId)
      .select(onboardingAvatarSupported ? PROFILE_SELECT : PROFILE_SELECT_LEGACY)
      .maybeSingle();
    let profileData = (response.data ?? null) as unknown as HomeProfileRow | null;
    let profileError = response.error;

    if (profileError && isAvatarColumnMissing(profileError)) {
      usedAvatarFallback = true;
      setOnboardingAvatarSupported(false);
      const fallback = await supabase
        .from("profiles")
        .update({
          display_name: nextDisplayName,
          username: nextUsername,
        })
        .eq("user_id", userId)
        .select(PROFILE_SELECT_LEGACY)
        .maybeSingle();
      profileData = (fallback.data ?? null) as HomeProfileRow | null;
      profileError = fallback.error;
    }

    setIsOnboardingSaving(false);

    if (profileError) {
      const message = profileError.message ?? "";
      setOnboardingError(
        message.includes("profiles_username_unique")
          ? "That username is already taken."
          : "Unable to save profile details.",
      );
      return;
    }

    setIsOnboardingOpen(false);
    setOnboardingDisplayName(profileData?.display_name ?? nextDisplayName);
    setOnboardingUsername(profileData?.username ?? nextUsername);
    setOnboardingAvatarUrl(
      usedAvatarFallback
        ? ""
        : (profileData?.avatar_url ?? nextAvatarUrl),
    );
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
                  Explore newly added spots around your city.
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
                  <Link
                    href="/profile"
                    className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-600 underline decoration-black/25 underline-offset-4 transition hover:text-black hover:decoration-black"
                  >
                    Profile
                  </Link>
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

          <div className="mb-7 flex gap-2 overflow-x-auto pb-1 md:mb-9 md:flex-wrap md:overflow-visible">
            {cities.map((city, cityIndex) => (
              <button
                key={`${city}-${cityIndex}`}
                type="button"
                onClick={() => handleFilterChange(city)}
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
              {spots.map((spot) => {
                const isInPublicList = Boolean(
                  publicList && (listSpotIdsByList[publicList.id] ?? []).includes(spot.id),
                );
                const isInPrivateList = Boolean(
                  privateList && (listSpotIdsByList[privateList.id] ?? []).includes(spot.id),
                );

                return (
                  <a
                    key={spot.id}
                    href={spot.mapsLink}
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
                        if (!userId) {
                          router.push("/login");
                          return;
                        }
                        setAddActionError(null);
                        setAddActionMessage(null);
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
                );
              })}
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
                  onClick={() =>
                    setPage((current) => Math.min(totalPages, current + 1))
                  }
                  disabled={page >= totalPages}
                  className="border border-black/20 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-700 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
              <p className="text-right">
                Page {page} of {totalPages}
              </p>
            </div>
          ) : null}

          <footer className="mt-10 border-t border-black/20 pb-2 pt-6 text-xs text-neutral-600 md:mt-12">
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

      {isOnboardingOpen && userId ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
          <div className="w-full max-w-lg border border-black/20 bg-white p-5 shadow-xl md:p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500">
              Complete Profile
            </p>
            <h2 className="mt-2 text-xl font-medium tracking-tight text-neutral-900">
              Pick your username and display name.
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              Profile photo is optional and you can change this later.
            </p>

            <div className="mt-4 flex items-center gap-3">
              <div className="relative h-16 w-16 overflow-hidden rounded-full border border-black/20 bg-white">
                {onboardingAvatarUrl ? (
                  <Image
                    src={onboardingAvatarUrl}
                    alt={`${onboardingDisplayName || "Profile"} avatar`}
                    fill
                    className="object-cover"
                    sizes="64px"
                    unoptimized
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center font-mono text-xs uppercase tracking-[0.1em] text-neutral-600">
                    {getInitials(onboardingDisplayName || "NewSpots User")}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex cursor-pointer items-center border border-black/20 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.13em] text-neutral-700 transition hover:border-black hover:text-black">
                  Upload Photo
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => void onOnboardingPhotoSelected(event)}
                    className="hidden"
                    disabled={!onboardingAvatarSupported}
                  />
                </label>
                {onboardingAvatarUrl ? (
                  <button
                    type="button"
                    onClick={() => setOnboardingAvatarUrl("")}
                    className="border border-black/20 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.13em] text-neutral-700 transition hover:border-black hover:text-black"
                  >
                    Remove
                  </button>
                ) : null}
                {!onboardingAvatarSupported ? (
                  <p className="w-full text-xs text-neutral-500">
                    Apply latest DB migration to enable profile photo storage.
                  </p>
                ) : null}
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-500">
                  Display Name
                </span>
                <input
                  type="text"
                  value={onboardingDisplayName}
                  onChange={(event) => setOnboardingDisplayName(event.target.value)}
                  className="w-full border border-black/20 bg-transparent px-3 py-2 text-sm"
                  placeholder="Bhagat"
                />
              </label>
              <label className="block">
                <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-500">
                  Username
                </span>
                <input
                  type="text"
                  value={onboardingUsername}
                  onChange={(event) => setOnboardingUsername(event.target.value)}
                  className="w-full border border-black/20 bg-transparent px-3 py-2 text-sm"
                  placeholder="udtaa_punjabi"
                />
              </label>
            </div>

            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={() => void saveOnboardingProfile()}
                disabled={isOnboardingSaving}
                className="bg-black px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-white disabled:opacity-60"
              >
                {isOnboardingSaving ? "Saving..." : "Continue"}
              </button>
              <p className="text-xs text-neutral-600">You can edit this later in Profile.</p>
            </div>
          </div>
        </div>
      ) : null}

      {homeToast ? (
        <div className="fixed bottom-4 right-4 z-50">
          <div
            className={`rounded-sm border px-3 py-2 text-xs shadow-sm ${
              homeToast.tone === "success"
                ? "border-black/20 bg-white/90 text-neutral-800"
                : "border-red-700/30 bg-red-50/95 text-red-700"
            }`}
          >
            {homeToast.text}
          </div>
        </div>
      ) : null}
    </div>
  );
}
