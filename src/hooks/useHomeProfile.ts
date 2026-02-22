"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import {
  getInitials,
  toDefaultDisplayName,
  isAvatarColumnMissing,
} from "@/lib/profile-helpers";
import { PROFILE_SELECT, PROFILE_SELECT_LEGACY } from "@/lib/constants";

type HomeProfileRow = {
  role: string | null;
  display_name: string | null;
  username: string | null;
  avatar_url?: string | null;
};

export function useHomeProfile(userId: string | null, userEmail: string | null) {
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [isOnboardingSaving, setIsOnboardingSaving] = useState(false);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [onboardingDisplayName, setOnboardingDisplayName] = useState("");
  const [onboardingUsername, setOnboardingUsername] = useState("");
  const [onboardingAvatarUrl, setOnboardingAvatarUrl] = useState("");
  const [onboardingAvatarSupported, setOnboardingAvatarSupported] = useState(true);

  useEffect(() => {
    if (!userId) {
      setUserRole(null);
      setIsOnboardingOpen(false);
      setOnboardingError(null);
      setOnboardingDisplayName("");
      setOnboardingUsername("");
      setOnboardingAvatarUrl("");
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) return;

    const fetchProfile = async () => {
      let avatarSupported = true;
      const response = await supabase
        .from("profiles")
        .select(PROFILE_SELECT)
        .eq("user_id", userId)
        .maybeSingle();
      let profileData = (response.data ?? null) as HomeProfileRow | null;
      let profileError = response.error;

      if (profileError && isAvatarColumnMissing(profileError)) {
        avatarSupported = false;
        const fallback = await supabase
          .from("profiles")
          .select(PROFILE_SELECT_LEGACY)
          .eq("user_id", userId)
          .maybeSingle();
        profileData = fallback.data
          ? { ...(fallback.data as HomeProfileRow), avatar_url: null }
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
        profileData?.display_name?.trim() || toDefaultDisplayName(userEmail);
      const username = profileData?.username?.trim() ?? "";
      setOnboardingDisplayName(displayName);
      setOnboardingUsername(username);
      setOnboardingAvatarUrl(profileData?.avatar_url ?? "");
      setOnboardingError(null);
      setIsOnboardingOpen(username.length === 0);
    };

    void fetchProfile();
  }, [userId, userEmail]);

  const saveOnboarding = async () => {
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
    } = { display_name: nextDisplayName, username: nextUsername };
    if (onboardingAvatarSupported) {
      updatePayload.avatar_url =
        nextAvatarUrl.length > 0 ? nextAvatarUrl : null;
    }

    const response = await supabase
      .from("profiles")
      .update(updatePayload)
      .eq("user_id", userId)
      .select(onboardingAvatarSupported ? PROFILE_SELECT : PROFILE_SELECT_LEGACY)
      .maybeSingle();
    let profileData = (response.data ?? null) as HomeProfileRow | null;
    let profileError = response.error;

    if (profileError && isAvatarColumnMissing(profileError)) {
      usedAvatarFallback = true;
      setOnboardingAvatarSupported(false);
      const fallback = await supabase
        .from("profiles")
        .update({ display_name: nextDisplayName, username: nextUsername })
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
          : "Unable to save profile details."
      );
      return;
    }

    setIsOnboardingOpen(false);
    setOnboardingDisplayName(profileData?.display_name ?? nextDisplayName);
    setOnboardingUsername(profileData?.username ?? nextUsername);
    setOnboardingAvatarUrl(
      usedAvatarFallback ? "" : (profileData?.avatar_url ?? nextAvatarUrl)
    );
  };

  return {
    userRole,
    isOnboardingOpen,
    setIsOnboardingOpen,
    isOnboardingSaving,
    onboardingError,
    setOnboardingError,
    onboardingDisplayName,
    setOnboardingDisplayName,
    onboardingUsername,
    setOnboardingUsername,
    onboardingAvatarUrl,
    setOnboardingAvatarUrl,
    onboardingAvatarSupported,
    saveOnboarding,
    getInitials,
  };
}
