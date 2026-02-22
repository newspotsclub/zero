"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { CityFilter } from "@/components/CityFilter";
import { HomeSpotCard } from "@/components/HomeSpotCard";
import { SpotDetailModal } from "@/components/SpotDetailModal";
import { OnboardingModal } from "@/components/OnboardingModal";
import { Toast } from "@/components/Toast";
import { Pagination } from "@/components/Pagination";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useHomeProfile } from "@/hooks/useHomeProfile";
import { useProfileLists } from "@/hooks/useProfileLists";
import { useSpots } from "@/hooks/useSpots";
import { getSupabaseClient } from "@/lib/supabase";
import { PAGE_SIZE } from "@/lib/constants";
import { MAX_PROFILE_PHOTO_BYTES } from "@/lib/constants";

export default function Home() {
  const router = useRouter();
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const { userId, userEmail, sessionLoading, signOut } = useAuthSession();
  const profile = useHomeProfile(userId, userEmail);
  const { profileLists, listSpotIdsByList, setListSpotIdsByList } =
    useProfileLists(userId);

  const [selectedCity, setSelectedCity] = useState("All");
  const [page, setPage] = useState(1);
  const [selectedSpot, setSelectedSpot] = useState<import("@/types/home").HomeSpot | null>(null);
  const [openAddMenuSpotId, setOpenAddMenuSpotId] = useState<number | null>(null);
  const [addActionBusyKey, setAddActionBusyKey] = useState<string | null>(null);
  const [addActionMessage, setAddActionMessage] = useState<string | null>(null);
  const [addActionError, setAddActionError] = useState<string | null>(null);
  const [homeToast, setHomeToast] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const {
    spots,
    cities,
    totalCount,
    totalPages,
    isSpotsLoading,
    spotsError,
    setSpotsError,
  } = useSpots(selectedCity, page);

  const isAdmin = profile.userRole === "admin";
  const publicList = profileLists.find((l) => l.visibility === "public");
  const privateList = profileLists.find((l) => l.visibility === "private");

  useEffect(() => {
    if (!userId) {
      setOpenAddMenuSpotId(null);
      setSelectedSpot(null);
    }
  }, [userId]);

  useEffect(() => {
    if (!homeToast) return;
    const t = window.setTimeout(() => setHomeToast(null), 1800);
    return () => window.clearTimeout(t);
  }, [homeToast]);

  useEffect(() => {
    if (!selectedSpot) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedSpot(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedSpot]);

  useEffect(() => {
    if (spotsError) {
      setHomeToast({ tone: "error", text: spotsError });
      setSpotsError(null);
    }
  }, [spotsError, setSpotsError]);

  useEffect(() => {
    if (addActionError) {
      setHomeToast({ tone: "error", text: addActionError });
      setAddActionError(null);
    }
  }, [addActionError]);

  useEffect(() => {
    if (addActionMessage) {
      setHomeToast({ tone: "success", text: addActionMessage });
      setAddActionMessage(null);
    }
  }, [addActionMessage]);

  useEffect(() => {
    if (profile.onboardingError) {
      setHomeToast({ tone: "error", text: profile.onboardingError });
      profile.setOnboardingError(null);
    }
  }, [profile.onboardingError]);

  const handleFilterChange = (city: string) => {
    setSelectedCity(city);
    setPage(1);
    setOpenAddMenuSpotId(null);
    setSelectedSpot(null);
  };

  const toggleSpotInList = async (
    spotId: number,
    list: import("@/hooks/useProfileLists").ProfileListSummary | undefined,
    label: string,
    isInList: boolean
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
      const { error } = await supabase
        .from("profile_list_items")
        .insert({ list_id: list.id, spot_id: spotId });
      if (error) {
        const norm = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
        const isDup =
          error.code === "23505" ||
          norm.includes("duplicate key") ||
          norm.includes("profile_list_items_unique");
        if (isDup) {
          setListSpotIdsByList((prev) => {
            const existing = prev[list.id] ?? [];
            if (existing.includes(spotId)) return prev;
            return { ...prev, [list.id]: [...existing, spotId] };
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

    setListSpotIdsByList((prev) => {
      const existing = prev[list.id] ?? [];
      if (isInList) {
        return {
          ...prev,
          [list.id]: existing.filter((id) => id !== spotId),
        };
      }
      if (existing.includes(spotId)) return prev;
      return { ...prev, [list.id]: [...existing, spotId] };
    });
    setAddActionMessage(isInList ? `Removed from ${label}.` : `Added to ${label}.`);
  };

  const onOnboardingPhotoSelected = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      profile.setOnboardingError("Please select an image file.");
      event.target.value = "";
      return;
    }
    if (file.size > MAX_PROFILE_PHOTO_BYTES) {
      profile.setOnboardingError("Profile photo must be 2MB or smaller.");
      event.target.value = "";
      return;
    }
    const toDataUrl = () =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === "string") resolve(reader.result);
          else reject(new Error("Image parsing failed."));
        };
        reader.onerror = () => reject(new Error("Image parsing failed."));
        reader.readAsDataURL(file);
      });
    try {
      const dataUrl = await toDataUrl();
      profile.setOnboardingAvatarUrl(dataUrl);
      profile.setOnboardingError(null);
    } catch {
      profile.setOnboardingError("Unable to read image file.");
    } finally {
      event.target.value = "";
    }
  };

  return (
    <div className="relative min-h-screen bg-[#f5f5f2] text-neutral-900">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,0,0,0.04),transparent_45%),linear-gradient(to_bottom,rgba(255,255,255,0.45),rgba(0,0,0,0.015))]" />
      <main className="relative px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-6xl">
          <Header
            sessionLoading={sessionLoading}
            userId={userId}
            userEmail={userEmail}
            isAdmin={isAdmin}
            supabaseConfigured={supabaseConfigured}
            onSignOut={signOut}
          />

          <CityFilter
            cities={cities}
            selectedCity={selectedCity}
            onSelect={handleFilterChange}
          />

          {isSpotsLoading ? (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-4">
              {Array.from({ length: PAGE_SIZE }).map((_, i) => (
                <div
                  key={`loader-${i}`}
                  className="aspect-[4/5] animate-pulse border border-black/15 bg-white/60"
                />
              ))}
            </div>
          ) : spots.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-4">
              {spots.map((spot) => (
                <HomeSpotCard
                  key={spot.id}
                  spot={spot}
                  isInPublicList={Boolean(
                    publicList && (listSpotIdsByList[publicList.id] ?? []).includes(spot.id)
                  )}
                  isInPrivateList={Boolean(
                    privateList && (listSpotIdsByList[privateList.id] ?? []).includes(spot.id)
                  )}
                  publicList={publicList}
                  privateList={privateList}
                  isAddMenuOpen={openAddMenuSpotId === spot.id}
                  addActionBusyKey={addActionBusyKey}
                  onOpenDetail={() => {
                    setOpenAddMenuSpotId(null);
                    setSelectedSpot(spot);
                  }}
                  onToggleAddMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!userId) {
                      router.push("/login");
                      return;
                    }
                    setAddActionError(null);
                    setAddActionMessage(null);
                    setOpenAddMenuSpotId((cur) => (cur === spot.id ? null : spot.id));
                  }}
                  onAddToPublicList={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void toggleSpotInList(
                      spot.id,
                      publicList,
                      publicList?.title ?? "Favorites",
                      Boolean(publicList && (listSpotIdsByList[publicList.id] ?? []).includes(spot.id))
                    );
                  }}
                  onAddToPrivateList={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void toggleSpotInList(
                      spot.id,
                      privateList,
                      privateList?.title ?? "Visited",
                      Boolean(privateList && (listSpotIdsByList[privateList.id] ?? []).includes(spot.id))
                    );
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="border border-black/20 bg-white/60 p-6 text-sm text-neutral-600">
              No spots found for this filter.
            </div>
          )}

          {!isSpotsLoading && totalCount > PAGE_SIZE ? (
            <Pagination
              page={page}
              totalPages={totalPages}
              totalCount={totalCount}
              onPrevious={() => {
                window.scrollTo({ top: 0, behavior: "smooth" });
                setPage((p) => Math.max(1, p - 1));
              }}
              onNext={() => {
                window.scrollTo({ top: 0, behavior: "smooth" });
                setPage((p) => Math.min(totalPages, p + 1));
              }}
            />
          ) : null}

          <Footer />
        </div>
      </main>

      {selectedSpot ? (
        <SpotDetailModal spot={selectedSpot} onClose={() => setSelectedSpot(null)} />
      ) : null}

      {profile.isOnboardingOpen && userId ? (
        <OnboardingModal
          displayName={profile.onboardingDisplayName}
          username={profile.onboardingUsername}
          avatarUrl={profile.onboardingAvatarUrl}
          avatarSupported={profile.onboardingAvatarSupported}
          isSaving={profile.isOnboardingSaving}
          error={profile.onboardingError}
          getInitials={profile.getInitials}
          onDisplayNameChange={profile.setOnboardingDisplayName}
          onUsernameChange={profile.setOnboardingUsername}
          onAvatarUrlChange={profile.setOnboardingAvatarUrl}
          onPhotoSelected={onOnboardingPhotoSelected}
          onSave={() => void profile.saveOnboarding()}
        />
      ) : null}

      {homeToast ? (
        <Toast tone={homeToast.tone} text={homeToast.text} />
      ) : null}
    </div>
  );
}
