"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { mapRowToSpot } from "@/lib/home-spots";
import type { HomeSpot, SpotRow } from "@/types/home";
import { PAGE_SIZE } from "@/lib/constants";

export function useSpots(selectedCity: string, page: number) {
  const [spots, setSpots] = useState<HomeSpot[]>([]);
  const [cities, setCities] = useState<string[]>(["All"]);
  const [totalCount, setTotalCount] = useState(0);
  const [isSpotsLoading, setIsSpotsLoading] = useState(true);
  const [spotsError, setSpotsError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      queueMicrotask(() => {
        setIsSpotsLoading(false);
        setSpotsError("Supabase is not configured yet.");
      });
      return;
    }

    const fetchCities = async () => {
      const { data, error } = await supabase
        .from("spots")
        .select("city")
        .order("city", { ascending: true });
      if (error) return;
      const unique = [
        "All",
        ...new Set((data ?? []).map((row) => row.city).filter(Boolean)),
      ];
      setCities(unique);
    };
    void fetchCities();
  }, []);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setIsSpotsLoading(true);
      setSpotsError(null);
    });

    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("spots")
      .select(
        "id, name, city, maps_link, lat_lng, image, image_storage_id, verified, hero_dish",
        {
        count: "exact",
        }
      )
      .order("created_at", { ascending: false })
      .range(from, to);

    if (selectedCity !== "All") query = query.eq("city", selectedCity);

    query.then(({ data, error, count }) => {
      if (cancelled) return;
      if (error) {
        setSpots([]);
        setTotalCount(0);
        setSpotsError("Unable to load spots.");
      } else {
        setSpots((data ?? []).map((row) => mapRowToSpot(row as SpotRow)));
        setTotalCount(count ?? 0);
      }
      setIsSpotsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [selectedCity, page]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  return {
    spots,
    cities,
    totalCount,
    totalPages,
    isSpotsLoading,
    spotsError,
    setSpotsError,
  };
}
