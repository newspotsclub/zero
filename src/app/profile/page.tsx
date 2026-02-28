"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatListTitleForViewer } from "@/lib/profile-list-title";
import { getSpotImageUrl } from "@/lib/spots";
import { getSupabaseClient } from "@/lib/supabase";
import type {
  ListVisibility,
  Profile,
  ProfileList,
  ProfileListItem,
} from "@/types/profile";

type SpotRecord = {
  id: number;
  name: string;
  city: string;
  maps_link: string;
  lat_lng: string | null;
  image: string | null;
  image_storage_id: string | null;
};

type ProfileListWithSpots = ProfileList & {
  spots: SpotRecord[];
};

const MAX_PROFILE_PHOTO_BYTES = 2 * 1024 * 1024;
const PROFILE_SELECT = "user_id, email, role, display_name, username, avatar_url";
const PROFILE_SELECT_LEGACY = "user_id, email, role, display_name, username";

function slugifyTitle(title: string): string {
  const normalized = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return normalized || "list";
}

function getDefaultListTitle(visibility: ListVisibility): string {
  return visibility === "public" ? "Favorites" : "Visited";
}

function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "NS";
  const words = trimmed.split(/\s+/).slice(0, 2);
  return words.map((word) => word[0]?.toUpperCase() ?? "").join("") || "NS";
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

function normalizeProfileRow(row: {
  user_id: string;
  email: string | null;
  display_name: string | null;
  username: string | null;
  role?: string | null;
  avatar_url?: string | null;
}): Profile {
  return {
    ...row,
    avatar_url: row.avatar_url ?? null,
  };
}

export default function ProfilesPage() {
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  const [sessionLoading, setSessionLoading] = useState(supabaseConfigured);
  const [isLoading, setIsLoading] = useState(supabaseConfigured);
  const [userId, setUserId] = useState<string | null>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [usernameDraft, setUsernameDraft] = useState("");
  const [avatarUrlDraft, setAvatarUrlDraft] = useState("");

  const [lists, setLists] = useState<ProfileListWithSpots[]>([]);
  const [spotCatalog, setSpotCatalog] = useState<SpotRecord[]>([]);
  const [spotSelectionByList, setSpotSelectionByList] = useState<
    Record<string, string>
  >({});

  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editingListIds, setEditingListIds] = useState<Record<string, boolean>>({});
  const [savedListTitles, setSavedListTitles] = useState<Record<string, string>>({});
  const [busyListId, setBusyListId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    supabaseConfigured ? null : "Supabase is not configured yet.",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [copyToast, setCopyToast] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const shareUrl = useMemo(() => {
    if (!profile?.username) return null;
    if (typeof window === "undefined") return `/u/${profile.username}`;
    return `${window.location.origin}/u/${profile.username}`;
  }, [profile?.username]);

  const handleSignOut = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    await supabase.auth.signOut();
  };

  const loadProfileData = async (activeUserId: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    setIsLoading(true);
    setError(null);

    try {
      let { data: profileRow, error: profileError } = await supabase
        .from("profiles")
        .select(PROFILE_SELECT)
        .eq("user_id", activeUserId)
        .maybeSingle();

      if (profileError && isAvatarColumnMissing(profileError)) {
        const fallback = await supabase
          .from("profiles")
          .select(PROFILE_SELECT_LEGACY)
          .eq("user_id", activeUserId)
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
        setError("Unable to load your profile.");
        setIsLoading(false);
        return;
      }

      const nextProfile = normalizeProfileRow(profileRow);
      const displayName = nextProfile.display_name?.trim() || "NewSpots User";

      setProfile(nextProfile);
      setDisplayNameDraft(displayName);
      setUsernameDraft(nextProfile.username ?? "");
      setAvatarUrlDraft(nextProfile.avatar_url ?? "");

      const { data: rawLists, error: listsError } = await supabase
        .from("profile_lists")
        .select("id, user_id, title, visibility, slug, created_at, updated_at")
        .eq("user_id", activeUserId)
        .order("created_at", { ascending: true });

      if (listsError) {
        setError("Unable to load your lists.");
        setIsLoading(false);
        return;
      }

      let listRows = (rawLists ?? []) as ProfileList[];

      const publicList = listRows.find((list) => list.visibility === "public");
      const privateList = listRows.find((list) => list.visibility === "private");

      const listsToCreate: Array<{
        user_id: string;
        title: string;
        visibility: ListVisibility;
        slug: string;
      }> = [];

      if (!publicList) {
        listsToCreate.push({
          user_id: activeUserId,
          title: getDefaultListTitle("public"),
          visibility: "public",
          slug: "favorites",
        });
      }

      if (!privateList) {
        listsToCreate.push({
          user_id: activeUserId,
          title: getDefaultListTitle("private"),
          visibility: "private",
          slug: "visited",
        });
      }

      if (listsToCreate.length > 0) {
        const { error: insertError } = await supabase
          .from("profile_lists")
          .insert(listsToCreate);

        if (!insertError) {
          const { data: refreshedLists, error: refreshedError } = await supabase
            .from("profile_lists")
            .select("id, user_id, title, visibility, slug, created_at, updated_at")
            .eq("user_id", activeUserId)
            .order("created_at", { ascending: true });

          if (!refreshedError) {
            listRows = (refreshedLists ?? []) as ProfileList[];
          }
        }
      }

      const ownerDisplayName = nextProfile.display_name ?? null;
      const ownerUsername = nextProfile.username ?? null;
      listRows = listRows.map((list) => ({
        ...list,
        title: formatListTitleForViewer({
          title: list.title,
          displayName: ownerDisplayName,
          username: ownerUsername,
        }),
      }));

      const listIds = listRows.map((list) => list.id);

      const [{ data: listItemsRows, error: listItemsError }, { data: allSpotsRows, error: allSpotsError }] =
        await Promise.all([
          listIds.length > 0
            ? supabase
                .from("profile_list_items")
                .select("id, list_id, spot_id, created_at")
                .in("list_id", listIds)
                .order("created_at", { ascending: false })
            : Promise.resolve({ data: [], error: null }),
          supabase
            .from("spots")
            .select("id, name, city, maps_link, lat_lng, image, image_storage_id")
            .order("created_at", { ascending: false }),
        ]);

      if (listItemsError || allSpotsError) {
        setError("Unable to load list spots.");
        setIsLoading(false);
        return;
      }

      const spotRows = (allSpotsRows ?? []) as SpotRecord[];
      const spotById = new Map<number, SpotRecord>();
      for (const spot of spotRows) {
        spotById.set(spot.id, spot);
      }

      const itemsByList = new Map<string, SpotRecord[]>();
      for (const list of listRows) {
        itemsByList.set(list.id, []);
      }

      for (const row of (listItemsRows ?? []) as ProfileListItem[]) {
        const spot = spotById.get(row.spot_id);
        if (!spot) continue;
        const existing = itemsByList.get(row.list_id);
        if (!existing) continue;
        existing.push(spot);
      }

      const nextLists: ProfileListWithSpots[] = listRows.map((list) => ({
        ...list,
        spots: itemsByList.get(list.id) ?? [],
      }));

      setLists(nextLists);
      setSavedListTitles(
        nextLists.reduce<Record<string, string>>((acc, list) => {
          acc[list.id] = list.title;
          return acc;
        }, {}),
      );
      setSpotCatalog(spotRows);
      setSpotSelectionByList((current) => {
        const next = { ...current };
        for (const list of nextLists) {
          if (!next[list.id]) {
            const existing = new Set(list.spots.map((spot) => spot.id));
            const firstAvailable = spotRows.find((spot) => !existing.has(spot.id));
            if (firstAvailable) next[list.id] = String(firstAvailable.id);
          }
        }
        return next;
      });
    } catch {
      setError("Unable to load your profile data.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user ?? null;
      setUserId(user?.id ?? null);
      setSessionLoading(false);
      if (user) {
        void loadProfileData(user.id);
      } else {
        setIsLoading(false);
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      setUserId(user?.id ?? null);
      if (user) {
        void loadProfileData(user.id);
      } else {
        setProfile(null);
        setLists([]);
        setSavedListTitles({});
        setSpotCatalog([]);
      }
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!copyToast) return;
    const timeout = window.setTimeout(() => setCopyToast(null), 1800);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [copyToast]);

  useEffect(() => {
    if (!error) return;
    setCopyToast({
      tone: "error",
      text: error,
    });
    setError(null);
  }, [error]);

  useEffect(() => {
    if (!message) return;
    setCopyToast({
      tone: "success",
      text: message,
    });
    setMessage(null);
  }, [message]);

  const saveProfile = async () => {
    if (!userId) return;

    const supabase = getSupabaseClient();
    if (!supabase) return;

    const nextDisplayName = displayNameDraft.trim();
    const nextUsername = usernameDraft.trim().toLowerCase();
    const nextAvatarUrl = avatarUrlDraft.trim();

    if (!nextDisplayName) {
      setError("Display name is required.");
      return;
    }

    if (!nextUsername) {
      setError("Username is required.");
      return;
    }

    setIsSavingProfile(true);
    setError(null);
    setMessage(null);

    let usedLegacyAvatarFallback = false;

    let { data, error: updateError } = await supabase
      .from("profiles")
      .update({
        display_name: nextDisplayName,
        username: nextUsername,
        avatar_url: nextAvatarUrl.length > 0 ? nextAvatarUrl : null,
      })
      .eq("user_id", userId)
      .select(PROFILE_SELECT)
      .maybeSingle();

    if (updateError && isAvatarColumnMissing(updateError)) {
      const fallback = await supabase
        .from("profiles")
        .update({
          display_name: nextDisplayName,
          username: nextUsername,
        })
        .eq("user_id", userId)
        .select(PROFILE_SELECT_LEGACY)
        .maybeSingle();

      data = fallback.data
        ? {
            ...fallback.data,
            avatar_url: profile?.avatar_url ?? null,
          }
        : null;
      updateError = fallback.error;

      if (!updateError) {
        usedLegacyAvatarFallback = true;
      }
    }

    setIsSavingProfile(false);

    if (updateError) {
      setError(updateError.message.includes("profiles_username_unique")
        ? "That username is already taken."
        : "Unable to save profile details.");
      return;
    }

    if (data) {
      setProfile(normalizeProfileRow(data));
      setIsEditingProfile(false);
      setMessage(
        usedLegacyAvatarFallback
          ? "Profile saved. Apply the latest DB migration to enable profile photos."
          : "Profile details saved.",
      );
    }
  };

  const startEditingProfile = () => {
    setIsEditingProfile(true);
    setError(null);
    setMessage(null);
  };

  const cancelEditingProfile = () => {
    const name = profile?.display_name?.trim() || "NewSpots User";
    setDisplayNameDraft(name);
    setUsernameDraft(profile?.username ?? "");
    setAvatarUrlDraft(profile?.avatar_url ?? "");
    setIsEditingProfile(false);
    setError(null);
    setMessage(null);
  };

  const onProfilePhotoSelected = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please select an image file.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_PROFILE_PHOTO_BYTES) {
      setError("Profile photo must be 2MB or smaller.");
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
      setAvatarUrlDraft(dataUrl);
      setError(null);
      setMessage("Photo selected. Save profile to publish it.");
    } catch {
      setError("Unable to read image file.");
    } finally {
      event.target.value = "";
    }
  };

  const copyProfileUrl = async () => {
    if (!shareUrl) {
      setCopyToast({
        tone: "error",
        text: "Save a username to generate your profile URL.",
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyToast({
        tone: "success",
        text: "Profile URL copied",
      });
    } catch {
      setCopyToast({
        tone: "error",
        text: "Unable to copy profile URL.",
      });
    }
  };

  const headerDisplayName =
    isEditingProfile
      ? displayNameDraft || "NewSpots User"
      : profile?.display_name?.trim() || "NewSpots User";
  const headerUsername =
    isEditingProfile ? usernameDraft || "username" : profile?.username || "username";
  const headerAvatarUrl = isEditingProfile
    ? avatarUrlDraft
    : (profile?.avatar_url ?? avatarUrlDraft);

  const saveListTitle = async (listId: string, title: string): Promise<boolean> => {
    const supabase = getSupabaseClient();
    if (!supabase) return false;

    const trimmed = title.trim();
    if (!trimmed) {
      setError("List title cannot be empty.");
      return false;
    }

    if (savedListTitles[listId] === trimmed) {
      return true;
    }

    setBusyListId(listId);
    setError(null);
    setMessage(null);

    const { error: updateError } = await supabase
      .from("profile_lists")
      .update({
        title: trimmed,
        slug: slugifyTitle(trimmed),
      })
      .eq("id", listId);

    setBusyListId(null);

    if (updateError) {
      setError(updateError.message);
      return false;
    }

    setLists((current) =>
      current.map((list) =>
        list.id === listId
          ? { ...list, title: trimmed, slug: slugifyTitle(trimmed) }
          : list,
        ),
    );
    setSavedListTitles((current) => ({ ...current, [listId]: trimmed }));
    setMessage("List title updated.");
    return true;
  };

  const toggleListEditing = async (list: ProfileListWithSpots) => {
    const currentlyEditing = Boolean(editingListIds[list.id]);
    if (!currentlyEditing) {
      setEditingListIds((current) => ({ ...current, [list.id]: true }));
      return;
    }

    const saved = await saveListTitle(list.id, list.title);
    if (!saved) return;

    setEditingListIds((current) => ({ ...current, [list.id]: false }));
  };

  const toggleListVisibility = async (listId: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    setBusyListId(listId);
    setError(null);
    setMessage(null);

    const { error: toggleError } = await supabase.rpc(
      "toggle_profile_list_visibility",
      { target_list_id: listId },
    );

    setBusyListId(null);

    if (toggleError) {
      setError(toggleError.message || "Unable to toggle list visibility.");
      return;
    }

    if (userId) {
      await loadProfileData(userId);
    }

    setMessage("List visibility updated.");
  };

  const addSpotToList = async (listId: string, selectedSpotIdFromUi?: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const selectedSpotId = selectedSpotIdFromUi ?? spotSelectionByList[listId];
    if (!selectedSpotId) {
      setError("Select a spot to add.");
      return;
    }

    setBusyListId(listId);
    setError(null);
    setMessage(null);

    const { error: insertError } = await supabase.from("profile_list_items").insert({
      list_id: listId,
      spot_id: Number(selectedSpotId),
    });

    setBusyListId(null);

    if (insertError) {
      setError("Unable to add this spot to the list.");
      return;
    }

    if (userId) {
      await loadProfileData(userId);
    }

    setMessage("Spot added to list.");
  };

  const removeSpotFromList = async (listId: string, spotId: number) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    setBusyListId(listId);
    setError(null);
    setMessage(null);

    const { error: deleteError } = await supabase
      .from("profile_list_items")
      .delete()
      .eq("list_id", listId)
      .eq("spot_id", spotId);

    setBusyListId(null);

    if (deleteError) {
      setError("Unable to remove this spot from the list.");
      return;
    }

    if (userId) {
      await loadProfileData(userId);
    }

    setMessage("Spot removed from list.");
  };

  if (sessionLoading || isLoading) {
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

  if (!userId) {
    return (
      <main className="min-h-screen bg-[#f5f5f2] px-4 py-10 text-neutral-900">
        <div className="mx-auto max-w-6xl border border-black/20 bg-white/70 p-6">
          <Link
            href="/"
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-700 underline decoration-black/25 underline-offset-4"
          >
            Back Home
          </Link>
          <p className="mt-2 text-sm text-neutral-600">
            You need to log in to manage public/private profile lists.
          </p>
          <div className="mt-5 flex gap-3">
            <Link
              href="/login"
              className="border border-black bg-black px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-white"
            >
              Login
            </Link>
            <Link
              href="/"
              className="border border-black/20 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-700"
            >
              Back Home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f5f2] px-4 py-6 text-neutral-900 md:px-8 md:py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/"
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-700 underline decoration-black/25 underline-offset-4"
          >
            Back Home
          </Link>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-700 underline decoration-black/25 underline-offset-4 transition hover:text-black hover:decoration-black"
          >
            Logout
          </button>
        </div>

        <section className="mb-8 mx-auto w-full max-w-4xl border border-black/20 bg-white/70 p-4 md:p-6">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-center">
            <div className="relative h-36 w-36 shrink-0 overflow-hidden rounded-full border border-black/20 bg-white md:h-44 md:w-44">
              {headerAvatarUrl ? (
                <Image
                  src={headerAvatarUrl}
                  alt={`${headerDisplayName || "Profile"} avatar`}
                  fill
                  className="object-cover"
                  sizes="176px"
                  unoptimized
                />
              ) : (
                <div className="grid h-full w-full place-items-center font-mono text-2xl uppercase tracking-[0.1em] text-neutral-600">
                  {getInitials(headerDisplayName)}
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                {isEditingProfile ? (
                  <input
                    type="text"
                    value={usernameDraft}
                    onChange={(event) => setUsernameDraft(event.target.value)}
                    className="min-w-[180px] border border-black/20 bg-transparent px-2.5 py-1.5 font-mono text-2xl tracking-tight text-neutral-900"
                    placeholder="username"
                    aria-label="Username"
                  />
                ) : (
                  <p className="font-mono text-2xl tracking-tight text-neutral-900">
                    {headerUsername}
                  </p>
                )}
                {isEditingProfile ? (
                  <>
                    <label className="inline-flex cursor-pointer items-center border border-black/20 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-700 transition hover:border-black hover:text-black">
                      Upload Photo
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => void onProfilePhotoSelected(event)}
                        className="hidden"
                      />
                    </label>
                    {avatarUrlDraft ? (
                      <button
                        type="button"
                        onClick={() => setAvatarUrlDraft("")}
                        className="border border-black/20 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-700 transition hover:border-black hover:text-black"
                      >
                        Remove
                      </button>
                    ) : null}
                  </>
                ) : null}
              </div>

              {isEditingProfile ? (
                <input
                  type="text"
                  value={displayNameDraft}
                  onChange={(event) => setDisplayNameDraft(event.target.value)}
                  className="mt-2 w-full max-w-md border border-black/20 bg-transparent px-2.5 py-1.5 text-xl font-medium tracking-tight text-neutral-900"
                  placeholder="Display name"
                  aria-label="Display name"
                />
              ) : (
                <p className="mt-2 text-xl font-medium tracking-tight text-neutral-900">
                  {headerDisplayName}
                </p>
              )}

              {shareUrl ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <a
                    href={shareUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 truncate text-sm font-semibold text-[#2f47d6] underline decoration-[#2f47d6]/45 underline-offset-4"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M10.5 13.5l3-3" />
                      <path d="M7.5 16.5l-1.2 1.2a3 3 0 1 1-4.24-4.24l3-3a3 3 0 0 1 4.24 0" />
                      <path d="M16.5 7.5l1.2-1.2a3 3 0 1 1 4.24 4.24l-3 3a3 3 0 0 1-4.24 0" />
                    </svg>
                    {shareUrl}
                  </a>
                  <button
                    type="button"
                    onClick={() => void copyProfileUrl()}
                    aria-label="Copy profile URL"
                    title="Copy profile URL"
                    className="inline-flex items-center justify-center p-1.5 text-neutral-700 transition hover:text-black"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="9" y="9" width="11" height="11" rx="2" />
                      <rect x="4" y="4" width="11" height="11" rx="2" />
                    </svg>
                  </button>
                </div>
              ) : null}

              {!isEditingProfile ? (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={startEditingProfile}
                    className="border border-black/20 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-700 transition hover:border-black hover:text-black"
                  >
                    Edit
                  </button>
                </div>
              ) : (
                <p className="mt-2 text-sm text-neutral-600">
                  JPG, PNG, or WEBP up to 2MB.
                </p>
              )}

              {isEditingProfile ? (
                <>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={saveProfile}
                      disabled={isSavingProfile}
                      className="bg-black px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-white disabled:opacity-60"
                    >
                      {isSavingProfile ? "Saving..." : "Save Profile"}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEditingProfile}
                      disabled={isSavingProfile}
                      className="border border-black/20 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-700 transition hover:border-black hover:text-black disabled:opacity-60"
                    >
                      Cancel
                    </button>
                    <p className="text-xs text-neutral-600">
                      Save profile changes before sharing or copying your link.
                    </p>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-4">
            {lists.map((list) => {
              const spotIds = new Set(list.spots.map((spot) => spot.id));
              const availableSpots = spotCatalog.filter((spot) => !spotIds.has(spot.id));
              const selectedSpotId =
                spotSelectionByList[list.id] ??
                (availableSpots.length > 0 ? String(availableSpots[0].id) : "");
              const isEditingThisList = Boolean(editingListIds[list.id]);
              const collagePreviewSpots = list.spots.slice(0, 6);
              const primaryCollageSpot = collagePreviewSpots[0];
              const secondaryCollageSpots = collagePreviewSpots.slice(1);
              const primaryCollageImageSrc = primaryCollageSpot
                ? getSpotImageUrl(
                    primaryCollageSpot.lat_lng ?? undefined,
                    primaryCollageSpot.image ?? undefined,
                    primaryCollageSpot.image_storage_id ?? undefined,
                  )
                : "";

              return (
                <article key={list.id} className="space-y-3">
                  <div className="group relative aspect-[4/5] w-full overflow-hidden rounded-md border border-black/20 bg-white/50 transition hover:border-black">
                    <div className="absolute left-2 top-2 z-20">
                      {list.visibility === "private" ? (
                        <span
                          title="Private list"
                          className="inline-flex items-center border border-black/20 bg-white/90 px-2 py-1 text-neutral-800"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                            className="h-3.5 w-3.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.75"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <rect x="4.5" y="10.5" width="15" height="9" rx="1.5" />
                            <path d="M8.5 10.5V8a3.5 3.5 0 1 1 7 0v2.5" />
                          </svg>
                        </span>
                      ) : null}
                    </div>
                    <div className="absolute inset-0 bg-black/10">
                      {primaryCollageSpot ? (
                        secondaryCollageSpots.length === 0 ? (
                          <Image
                            src={primaryCollageImageSrc}
                            alt={primaryCollageSpot.name}
                            fill
                            className="object-cover transition duration-300 group-hover:scale-[1.03]"
                            sizes="(max-width: 768px) 50vw, 33vw"
                          />
                        ) : (
                          <div className="grid h-full grid-cols-[4fr_1fr]">
                            <div className="relative border-r border-black/20">
                              <Image
                                src={primaryCollageImageSrc}
                                alt={primaryCollageSpot.name}
                                fill
                                className="object-cover transition duration-300 group-hover:scale-[1.03]"
                                sizes="(max-width: 768px) 50vw, 33vw"
                              />
                            </div>

                            <div
                              className="grid"
                              style={{
                                gridTemplateRows: `repeat(${secondaryCollageSpots.length}, minmax(0, 1fr))`,
                              }}
                            >
                              {secondaryCollageSpots.map((collageSpot, index) => {
                                const collageImageSrc = getSpotImageUrl(
                                  collageSpot.lat_lng ?? undefined,
                                  collageSpot.image ?? undefined,
                                  collageSpot.image_storage_id ?? undefined,
                                );

                                return (
                                <div
                                  key={`${list.id}-collage-${collageSpot.id}`}
                                  className={`relative ${
                                    index < secondaryCollageSpots.length - 1
                                      ? "border-b border-black/20"
                                      : ""
                                  }`}
                                >
                                  <Image
                                    src={collageImageSrc}
                                    alt={collageSpot.name}
                                    fill
                                    className="object-cover transition duration-300 group-hover:scale-[1.03]"
                                    sizes="(max-width: 768px) 14vw, 8vw"
                                  />
                                </div>
                                );
                              })}
                            </div>
                          </div>
                        )
                      ) : (
                        <div className="h-full w-full bg-white/30" aria-hidden />
                      )}
                    </div>
                    <div
                      className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/80 to-transparent"
                      aria-hidden
                    />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3 text-white">
                      <p className="text-sm font-medium leading-tight">{list.title}</p>
                      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/90">
                        {list.spots.length} places · {list.visibility}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-neutral-900">
                      {list.title}
                    </p>
                    <button
                      type="button"
                      onClick={() => void toggleListEditing(list)}
                      disabled={busyListId === list.id}
                      className="border border-black/20 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-700 transition hover:border-black hover:text-black"
                    >
                      {busyListId === list.id && isEditingThisList
                        ? "Saving..."
                        : isEditingThisList
                          ? "Done"
                          : "Edit"}
                    </button>
                  </div>

                  {isEditingThisList ? (
                    <div className="border border-black/20 bg-white/70 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p
                          className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-neutral-500"
                          title={list.visibility === "public" ? "Public list" : "Private list"}
                        >
                          {list.visibility === "private" ? (
                            <svg
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                              className="h-3.5 w-3.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.75"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <rect x="4.5" y="10.5" width="15" height="9" rx="1.5" />
                              <path d="M8.5 10.5V8a3.5 3.5 0 1 1 7 0v2.5" />
                            </svg>
                          ) : null}
                          List
                        </p>
                        <button
                          type="button"
                          onClick={() => void toggleListVisibility(list.id)}
                          disabled={busyListId === list.id}
                          className="border border-black/20 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-700 disabled:opacity-60"
                        >
                          {busyListId === list.id
                            ? "Updating..."
                            : `Toggle to ${list.visibility === "public" ? "Private" : "Public"}`}
                        </button>
                      </div>

                      <div className="mt-3">
                        <label className="flex-1">
                          <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-500">
                            List Title
                          </span>
                          <input
                            type="text"
                            value={list.title}
                            onChange={(event) => {
                              const value = event.target.value;
                              setLists((current) =>
                                current.map((item) =>
                                  item.id === list.id ? { ...item, title: value } : item,
                                ),
                              );
                            }}
                            className="w-full border border-black/20 bg-transparent px-3 py-2 text-sm"
                          />
                        </label>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-neutral-600">
                        <span>
                          Visibility:{" "}
                          <strong className="text-neutral-900">{list.visibility}</strong>
                        </span>
                        {list.visibility === "public" && profile?.username ? (
                          <Link
                            href={`/u/${profile.username}`}
                            className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-700 underline decoration-black/25 underline-offset-4"
                          >
                            View Public Profile
                          </Link>
                        ) : null}
                      </div>

                      <div className="mt-3 flex flex-wrap items-end gap-2">
                        <label className="min-w-[220px] flex-1">
                          <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-500">
                            Add Spot
                          </span>
                          <select
                            value={selectedSpotId}
                            onChange={(event) =>
                              setSpotSelectionByList((current) => ({
                                ...current,
                                [list.id]: event.target.value,
                              }))
                            }
                            className="w-full border border-black/20 bg-transparent px-3 py-2 text-sm"
                            disabled={availableSpots.length === 0}
                          >
                            {availableSpots.length === 0 ? (
                              <option value="">All spots already added</option>
                            ) : (
                              availableSpots.map((spot) => (
                                <option key={spot.id} value={String(spot.id)}>
                                  {spot.name} ({spot.city})
                                </option>
                              ))
                            )}
                          </select>
                        </label>
                        <button
                          type="button"
                          onClick={() => void addSpotToList(list.id, selectedSpotId)}
                          disabled={busyListId === list.id || availableSpots.length === 0}
                          className="border border-black/20 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-700 disabled:opacity-60"
                        >
                          Add Spot
                        </button>
                      </div>

                      {list.spots.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {list.spots.slice(0, 12).map((spot) => (
                            <button
                              key={`${list.id}-remove-${spot.id}`}
                              type="button"
                              onClick={() => void removeSpotFromList(list.id, spot.id)}
                              className="border border-black/20 bg-white/90 px-2.5 py-1.5 text-left text-xs text-neutral-700 transition hover:border-black hover:text-black"
                            >
                              <span className="font-medium">{spot.name}</span>
                              <span className="ml-1 text-neutral-500">({spot.city})</span>
                            </button>
                          ))}
                          {list.spots.length > 12 ? (
                            <span className="self-center text-xs text-neutral-500">
                              +{list.spots.length - 12} more
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      </div>

      {copyToast ? (
        <div className="fixed bottom-4 right-4 z-50">
          <div
            className={`rounded-sm border px-3 py-2 text-xs shadow-sm ${
              copyToast.tone === "success"
                ? "border-black/20 bg-white/90 text-neutral-800"
                : "border-red-700/30 bg-red-50/95 text-red-700"
            }`}
          >
            {copyToast.text}
          </div>
        </div>
      ) : null}
    </main>
  );
}
