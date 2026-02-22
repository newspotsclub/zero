"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import type { ListVisibility } from "@/types/profile";

export type ProfileListSummary = { id: string; title: string; visibility: ListVisibility };
type ListItemRow = { list_id: string; spot_id: number };

export function useProfileLists(userId: string | null) {
  const [profileLists, setProfileLists] = useState<ProfileListSummary[]>([]);
  const [listSpotIdsByList, setListSpotIdsByList] = useState<
    Record<string, number[]>
  >({});

  useEffect(() => {
    if (!userId) {
      setProfileLists([]);
      setListSpotIdsByList({});
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) return;

    const fetchLists = async () => {
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

      const lists = (data ?? []) as ProfileListSummary[];
      setProfileLists(lists);

      if (lists.length === 0) {
        setListSpotIdsByList({});
        return;
      }

      const listIds = lists.map((l) => l.id);
      const { data: itemRows, error: itemError } = await supabase
        .from("profile_list_items")
        .select("list_id, spot_id")
        .in("list_id", listIds);

      if (itemError) {
        setListSpotIdsByList({});
        return;
      }

      const map: Record<string, number[]> = {};
      for (const row of (itemRows ?? []) as ListItemRow[]) {
        if (!map[row.list_id]) map[row.list_id] = [];
        map[row.list_id].push(row.spot_id);
      }
      setListSpotIdsByList(map);
    };

    void fetchLists();
  }, [userId]);

  return { profileLists, listSpotIdsByList, setListSpotIdsByList };
}
