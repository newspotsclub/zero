"use client";

import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SPOT_IMAGE_BUCKET,
  SPOT_IMAGE_MAX_HEIGHT,
  SPOT_IMAGE_MAX_WIDTH,
  SPOT_IMAGE_OUTPUT_MIME,
  SPOT_IMAGE_OUTPUT_QUALITY,
} from "@/lib/spot-image-storage";
import { getSupabaseClient } from "@/lib/supabase";

type AdminStatus = "loading" | "not-logged-in" | "forbidden" | "allowed";

type AdminSection = "add-spot" | "edit-spot" | "migrate-images" | "backfill-addresses" | "admin-access";

const ADMIN_SECTIONS: { key: AdminSection; label: string }[] = [
  { key: "add-spot", label: "Add Spot" },
  { key: "edit-spot", label: "Edit Spot" },
  { key: "migrate-images", label: "Migrate Images" },
  { key: "backfill-addresses", label: "Backfill Addresses" },
  { key: "admin-access", label: "Admin Access" },
];

type GoogleMapsStatus = "idle" | "loading" | "ready" | "error";

type PlaceSuggestion = {
  description: string;
  placeId: string;
};

type PlacePhotoOption = {
  label: string;
  url: string;
};

type PromoteAdminResult = {
  changed?: boolean;
  email?: string | null;
  role?: string | null;
  user_id?: string | null;
};

type ImageLoadState = "loading" | "loaded" | "error";

type LegacySpot = {
  id: number;
  name: string;
  city: string;
  image: string;
};

type AddressBackfillSpot = {
  id: number;
  name: string;
  city: string;
  place_id: string;
};

type BackfillResult = {
  spotId: number;
  name: string;
  status: "success" | "error" | "skipped";
  address?: string;
  error?: string;
};

type MigrationResult = {
  spotId: number;
  name: string;
  status: "success" | "error";
  error?: string;
};

type EditableSpot = {
  id: number;
  name: string;
  city: string;
  maps_link: string;
  place_id: string | null;
  lat_lng: string | null;
  image: string | null;
  image_storage_id: string | null;
  hero_dish: string | null;
  address: string | null;
  verified: boolean;
};

type GoogleAddressComponent = {
  long_name: string;
  short_name: string;
  types: string[];
};

type LoadingImageProps = {
  src: string;
  alt: string;
  width: number;
  height: number;
  imageClassName: string;
  containerClassName?: string;
};

const MAX_SOURCE_IMAGE_BYTES = 8 * 1024 * 1024;

declare global {
  interface Window {
    google?: {
      maps?: {
        places?: {
          AutocompleteService: new () => {
            getPlacePredictions: (
              request: { input: string },
              callback: (
                results:
                  | Array<{ description: string; place_id: string }>
                  | null,
                status: string,
              ) => void,
            ) => void;
          };
          PlacesService: new (
            attrContainer: HTMLDivElement,
          ) => {
            getDetails: (
              request: { placeId: string; fields: string[] },
              callback: (
                place:
                  | {
                      address_components?: GoogleAddressComponent[];
                      geometry?: {
                        location?: { lat: () => number; lng: () => number };
                      };
                      name?: string;
                      formatted_address?: string;
                      photos?: Array<{ getUrl: (options: { maxWidth: number; maxHeight?: number }) => string }>;
                      place_id?: string;
                      url?: string;
                    }
                  | null,
                status: string,
              ) => void,
            ) => void;
          };
          PlacesServiceStatus: {
            OK: string;
          };
        };
      };
    };
  }
}

function getCityFromAddress(components: GoogleAddressComponent[] | undefined): string {
  if (!components?.length) return "";
  const cityCandidate = components.find((component) =>
    component.types.includes("locality"),
  );
  if (cityCandidate?.long_name) return cityCandidate.long_name;

  const adminAreaCandidate = components.find((component) =>
    component.types.includes("administrative_area_level_1"),
  );
  return adminAreaCandidate?.long_name ?? "";
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [value, delayMs]);

  return debouncedValue;
}

function createSpotImageStoragePath(userId: string): string {
  return `${userId}/${crypto.randomUUID()}.webp`;
}

async function loadImageElement(sourceBlob: Blob): Promise<HTMLImageElement> {
  const sourceUrl = URL.createObjectURL(sourceBlob);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new window.Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Unable to decode image."));
      image.src = sourceUrl;
    });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

async function optimizeSpotImageBlob(sourceBlob: Blob): Promise<Blob> {
  const image = await loadImageElement(sourceBlob);
  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;

  if (naturalWidth <= 0 || naturalHeight <= 0) {
    throw new Error("Invalid image dimensions.");
  }

  const scale = Math.min(
    SPOT_IMAGE_MAX_WIDTH / naturalWidth,
    SPOT_IMAGE_MAX_HEIGHT / naturalHeight,
    1
  );
  const targetWidth = Math.max(1, Math.round(naturalWidth * scale));
  const targetHeight = Math.max(1, Math.round(naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to prepare image canvas.");
  }

  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  const optimizedBlob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob),
      SPOT_IMAGE_OUTPUT_MIME,
      SPOT_IMAGE_OUTPUT_QUALITY
    );
  });

  if (!optimizedBlob) {
    throw new Error("Unable to optimize image.");
  }

  return optimizedBlob;
}

function LoadingImage({
  src,
  alt,
  width,
  height,
  imageClassName,
  containerClassName = "",
}: LoadingImageProps) {
  const [imageOutcome, setImageOutcome] = useState<{
    src: string;
    status: Exclude<ImageLoadState, "loading">;
  } | null>(null);
  const loadState: ImageLoadState =
    imageOutcome?.src === src ? imageOutcome.status : "loading";

  return (
    <div className={`relative overflow-hidden ${containerClassName}`}>
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        className={`${imageClassName} transition-opacity duration-200 ${
          loadState === "loaded" ? "opacity-100" : "opacity-0"
        }`}
        unoptimized
        onLoad={() => setImageOutcome({ src, status: "loaded" })}
        onError={() => setImageOutcome({ src, status: "error" })}
      />

      {loadState !== "loaded" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-100 dark:bg-neutral-800">
          {loadState === "error" ? (
            <span className="px-2 text-center text-[11px] text-neutral-500 dark:text-neutral-400">
              Image failed to load
            </span>
          ) : (
            <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-700 dark:border-neutral-600 dark:border-t-neutral-100" />
              <span>Loading image</span>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function AdminPage() {
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  const [status, setStatus] = useState<AdminStatus>(
    supabaseConfigured ? "loading" : "forbidden",
  );
  const [activeSection, setActiveSection] = useState<AdminSection>("add-spot");
  const [userId, setUserId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [mapsLink, setMapsLink] = useState("");
  const [placeId, setPlaceId] = useState("");
  const [latLng, setLatLng] = useState("");
  const [image, setImage] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [heroDish, setHeroDish] = useState("");
  const [address, setAddress] = useState("");
  const [verified, setVerified] = useState(false);

  const [placeSearch, setPlaceSearch] = useState("");
  const [placeSuggestions, setPlaceSuggestions] = useState<PlaceSuggestion[]>([]);
  const [placePhotos, setPlacePhotos] = useState<PlacePhotoOption[]>([]);
  const [hasCompletedPlaceSearch, setHasCompletedPlaceSearch] = useState(false);
  const [adminEmailToPromote, setAdminEmailToPromote] = useState("");
  const [isPromotingAdmin, setIsPromotingAdmin] = useState(false);
  const [lastPromotedAdmin, setLastPromotedAdmin] = useState<PromoteAdminResult | null>(
    null,
  );

  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSearchingPlace, setIsSearchingPlace] = useState(false);
  const [isFetchingPlace, setIsFetchingPlace] = useState(false);
  const [isReadingImageFile, setIsReadingImageFile] = useState(false);
  const [mapsStatus, setMapsStatus] = useState<GoogleMapsStatus>(
    mapsApiKey ? "loading" : "idle",
  );
  const debouncedPlaceSearch = useDebouncedValue(placeSearch, 350);
  const autocompleteRequestIdRef = useRef(0);
  const skipNextAutocompleteRef = useRef(false);

  const [editSearchQuery, setEditSearchQuery] = useState("");
  const [editSearchResults, setEditSearchResults] = useState<EditableSpot[]>([]);
  const [isSearchingSpots, setIsSearchingSpots] = useState(false);
  const [editingSpot, setEditingSpot] = useState<EditableSpot | null>(null);
  const [editName, setEditName] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editMapsLink, setEditMapsLink] = useState("");
  const [editPlaceId, setEditPlaceId] = useState("");
  const [editLatLng, setEditLatLng] = useState("");
  const [editImage, setEditImage] = useState("");
  const [editImagePreview, setEditImagePreview] = useState("");
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editHeroDish, setEditHeroDish] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editVerified, setEditVerified] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isUploadingEditImage, setIsUploadingEditImage] = useState(false);
  const [isReadingEditImageFile, setIsReadingEditImageFile] = useState(false);
  const [editPlaceSearch, setEditPlaceSearch] = useState("");
  const [editPlaceSuggestions, setEditPlaceSuggestions] = useState<PlaceSuggestion[]>([]);
  const [editPlacePhotos, setEditPlacePhotos] = useState<PlacePhotoOption[]>([]);
  const [isFetchingEditPlace, setIsFetchingEditPlace] = useState(false);
  const debouncedEditPlaceSearch = useDebouncedValue(editPlaceSearch, 350);
  const editAutocompleteRequestIdRef = useRef(0);
  const skipNextEditAutocompleteRef = useRef(false);
  const [hasCompletedEditPlaceSearch, setHasCompletedEditPlaceSearch] = useState(false);
  const [isSearchingEditPlace, setIsSearchingEditPlace] = useState(false);

  const [legacySpots, setLegacySpots] = useState<LegacySpot[]>([]);
  const [isFetchingLegacy, setIsFetchingLegacy] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [migrationResults, setMigrationResults] = useState<MigrationResult[]>(
    [],
  );

  const [addressBackfillSpots, setAddressBackfillSpots] = useState<AddressBackfillSpot[]>([]);
  const [isFetchingBackfillSpots, setIsFetchingBackfillSpots] = useState(false);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [backfillProgress, setBackfillProgress] = useState<{ current: number; total: number } | null>(null);
  const [backfillResults, setBackfillResults] = useState<BackfillResult[]>([]);

  const [toast, setToast] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(
    supabaseConfigured
      ? null
      : {
          tone: "error",
          text: "Supabase is not configured.",
        },
  );

  const placesReady = mapsStatus === "ready";
  const placeSearchValue = placeSearch.trim();
  const debouncedPlaceSearchValue = debouncedPlaceSearch.trim();

  useEffect(() => {
    if (!supabaseConfigured) return;

    const supabase = getSupabaseClient();
    if (!supabase) return;

    const load = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user ?? null;

      if (!user) {
        setStatus("not-logged-in");
        return;
      }

      setUserId(user.id);

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      setStatus(profile?.role === "admin" ? "allowed" : "forbidden");
    };

    void load();
  }, [supabaseConfigured]);

  useEffect(() => {
    autocompleteRequestIdRef.current += 1;
  }, [placeSearch]);

  useEffect(() => {
    if (placeSearchValue.length >= 2) return;
    setPlaceSuggestions([]);
    setHasCompletedPlaceSearch(false);
    setIsSearchingPlace(false);
  }, [placeSearchValue]);

  useEffect(() => {
    if (!placesReady) return;

    const query = debouncedPlaceSearchValue;
    if (query.length < 2) return;
    if (skipNextAutocompleteRef.current) {
      skipNextAutocompleteRef.current = false;
      return;
    }

    const googlePlaces = window.google?.maps?.places;
    if (!googlePlaces) return;

    let isCancelled = false;
    const requestId = autocompleteRequestIdRef.current + 1;
    autocompleteRequestIdRef.current = requestId;

    setIsSearchingPlace(true);
    setHasCompletedPlaceSearch(false);

    const autocomplete = new googlePlaces.AutocompleteService();
    autocomplete.getPlacePredictions({ input: query }, (results, statusCode) => {
      if (isCancelled || requestId !== autocompleteRequestIdRef.current) return;

      setIsSearchingPlace(false);
      setHasCompletedPlaceSearch(true);

      if (statusCode !== googlePlaces.PlacesServiceStatus.OK || !results) {
        setPlaceSuggestions([]);
        return;
      }

      setPlaceSuggestions(
        results.slice(0, 6).map((result) => ({
          description: result.description,
          placeId: result.place_id,
        })),
      );
    });

    return () => {
      isCancelled = true;
    };
  }, [debouncedPlaceSearchValue, placesReady]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 1800);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [toast]);

  const fetchLegacySpots = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setIsFetchingLegacy(true);
    const { data, error } = await supabase
      .from("spots")
      .select("id, name, city, image")
      .not("image", "is", null)
      .is("image_storage_id", null)
      .order("created_at", { ascending: true });
    setIsFetchingLegacy(false);
    if (error) {
      setToast({ tone: "error", text: "Unable to load legacy spots." });
      return;
    }
    setLegacySpots(
      (data ?? []).filter(
        (s): s is LegacySpot => typeof s.image === "string" && s.image.trim().length > 0,
      ),
    );
  };

  useEffect(() => {
    if (status === "allowed") {
      void fetchLegacySpots();
      void fetchAddressBackfillSpots();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const migrateSpot = async (
    supabase: SupabaseClient,
    spot: LegacySpot,
    activeUserId: string,
  ): Promise<MigrationResult> => {
    try {
      const sourceBlob = await fetchSourceImageBlobFromUrl(spot.image);
      if (sourceBlob.size > MAX_SOURCE_IMAGE_BYTES) {
        return { spotId: spot.id, name: spot.name, status: "error", error: "Source image too large." };
      }
      const optimizedBlob = await optimizeSpotImageBlob(sourceBlob);
      const objectPath = createSpotImageStoragePath(activeUserId);
      const { error: uploadError } = await supabase.storage
        .from(SPOT_IMAGE_BUCKET)
        .upload(objectPath, optimizedBlob, {
          contentType: SPOT_IMAGE_OUTPUT_MIME,
          cacheControl: "31536000",
          upsert: false,
        });
      if (uploadError) {
        return { spotId: spot.id, name: spot.name, status: "error", error: uploadError.message };
      }
      const { error: updateError } = await supabase
        .from("spots")
        .update({ image_storage_id: objectPath })
        .eq("id", spot.id);
      if (updateError) {
        await supabase.storage.from(SPOT_IMAGE_BUCKET).remove([objectPath]);
        return { spotId: spot.id, name: spot.name, status: "error", error: updateError.message };
      }
      return { spotId: spot.id, name: spot.name, status: "success" };
    } catch (error) {
      return {
        spotId: spot.id,
        name: spot.name,
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error.",
      };
    }
  };

  const migrateAllLegacySpots = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !userId || legacySpots.length === 0) return;
    setIsMigrating(true);
    setMigrationResults([]);
    setMigrationProgress({ current: 0, total: legacySpots.length });
    const results: MigrationResult[] = [];
    for (let i = 0; i < legacySpots.length; i++) {
      setMigrationProgress({ current: i + 1, total: legacySpots.length });
      const result = await migrateSpot(supabase, legacySpots[i], userId);
      results.push(result);
      setMigrationResults([...results]);
    }
    setIsMigrating(false);
    setMigrationProgress(null);
    const succeeded = results.filter((r) => r.status === "success").length;
    setToast({
      tone: succeeded > 0 ? "success" : "error",
      text: `Migration complete: ${succeeded}/${results.length} succeeded.`,
    });
    await fetchLegacySpots();
  };

  const fetchAddressBackfillSpots = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setIsFetchingBackfillSpots(true);
    const { data } = await supabase
      .from("spots")
      .select("id, name, city, place_id")
      .not("place_id", "is", null)
      .is("address", null)
      .order("created_at", { ascending: false });
    setIsFetchingBackfillSpots(false);
    setAddressBackfillSpots(
      (data ?? []).filter(
        (s): s is AddressBackfillSpot => typeof s.place_id === "string" && s.place_id.trim().length > 0,
      ),
    );
  };

  const backfillAllAddresses = async () => {
    const supabase = getSupabaseClient();
    const googlePlaces = window.google?.maps?.places;
    if (!supabase || !googlePlaces || addressBackfillSpots.length === 0) return;
    setIsBackfilling(true);
    setBackfillResults([]);
    setBackfillProgress({ current: 0, total: addressBackfillSpots.length });
    const service = new googlePlaces.PlacesService(document.createElement("div"));
    const results: BackfillResult[] = [];
    for (let i = 0; i < addressBackfillSpots.length; i++) {
      const spot = addressBackfillSpots[i];
      setBackfillProgress({ current: i + 1, total: addressBackfillSpots.length });
      const result = await new Promise<BackfillResult>((resolve) => {
        service.getDetails(
          { placeId: spot.place_id, fields: ["formatted_address"] },
          async (place, statusCode) => {
            if (statusCode !== googlePlaces.PlacesServiceStatus.OK || !place?.formatted_address) {
              resolve({ spotId: spot.id, name: spot.name, status: "skipped", error: "No address returned." });
              return;
            }
            const { error } = await supabase
              .from("spots")
              .update({ address: place.formatted_address })
              .eq("id", spot.id);
            if (error) {
              resolve({ spotId: spot.id, name: spot.name, status: "error", error: error.message });
            } else {
              resolve({ spotId: spot.id, name: spot.name, status: "success", address: place.formatted_address });
            }
          },
        );
      });
      results.push(result);
      setBackfillResults([...results]);
    }
    setIsBackfilling(false);
    setBackfillProgress(null);
    const succeeded = results.filter((r) => r.status === "success").length;
    setToast({
      tone: succeeded > 0 ? "success" : "error",
      text: `Backfill complete: ${succeeded}/${results.length} updated.`,
    });
    await fetchAddressBackfillSpots();
  };

  const debouncedEditSearchQuery = useDebouncedValue(editSearchQuery, 350);

  useEffect(() => {
    if (debouncedEditSearchQuery.trim().length < 2) {
      setEditSearchResults([]);
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    setIsSearchingSpots(true);
    supabase
      .from("spots")
      .select("id, name, city, maps_link, place_id, lat_lng, image, image_storage_id, hero_dish, address, verified")
      .ilike("name", `%${debouncedEditSearchQuery.trim()}%`)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (cancelled) return;
        setIsSearchingSpots(false);
        if (error) {
          setToast({ tone: "error", text: "Unable to search spots." });
          return;
        }
        setEditSearchResults((data ?? []) as EditableSpot[]);
      });
    return () => { cancelled = true; };
  }, [debouncedEditSearchQuery]);

  useEffect(() => {
    editAutocompleteRequestIdRef.current += 1;
  }, [editPlaceSearch]);

  useEffect(() => {
    if (editPlaceSearch.trim().length >= 2) return;
    setEditPlaceSuggestions([]);
    setHasCompletedEditPlaceSearch(false);
    setIsSearchingEditPlace(false);
  }, [editPlaceSearch]);

  useEffect(() => {
    if (!placesReady) return;
    const query = debouncedEditPlaceSearch.trim();
    if (query.length < 2) return;
    if (skipNextEditAutocompleteRef.current) {
      skipNextEditAutocompleteRef.current = false;
      return;
    }
    const googlePlaces = window.google?.maps?.places;
    if (!googlePlaces) return;
    let isCancelled = false;
    const requestId = editAutocompleteRequestIdRef.current + 1;
    editAutocompleteRequestIdRef.current = requestId;
    setIsSearchingEditPlace(true);
    setHasCompletedEditPlaceSearch(false);
    const autocomplete = new googlePlaces.AutocompleteService();
    autocomplete.getPlacePredictions({ input: query }, (results, statusCode) => {
      if (isCancelled || requestId !== editAutocompleteRequestIdRef.current) return;
      setIsSearchingEditPlace(false);
      setHasCompletedEditPlaceSearch(true);
      if (statusCode !== googlePlaces.PlacesServiceStatus.OK || !results) {
        setEditPlaceSuggestions([]);
        return;
      }
      setEditPlaceSuggestions(
        results.slice(0, 6).map((r) => ({ description: r.description, placeId: r.place_id }))
      );
    });
    return () => { isCancelled = true; };
  }, [debouncedEditPlaceSearch, placesReady]);

  const selectSpotForEditing = (spot: EditableSpot) => {
    setEditingSpot(spot);
    setEditName(spot.name);
    setEditCity(spot.city);
    setEditMapsLink(spot.maps_link);
    setEditPlaceId(spot.place_id ?? "");
    setEditLatLng(spot.lat_lng ?? "");
    setEditImage("");
    setEditImagePreview("");
    setEditImageFile(null);
    setEditHeroDish(spot.hero_dish ?? "");
    setEditAddress(spot.address ?? "");
    setEditVerified(spot.verified);
    setEditPlaceSearch("");
    setEditPlaceSuggestions([]);
    setEditPlacePhotos([]);
    setHasCompletedEditPlaceSearch(false);
  };

  const fetchEditPlaceDetails = (selectedPlaceId: string, description: string) => {
    const googlePlaces = window.google?.maps?.places;
    if (!googlePlaces) return;
    setIsFetchingEditPlace(true);
    const service = new googlePlaces.PlacesService(document.createElement("div"));
    service.getDetails(
      { placeId: selectedPlaceId, fields: ["place_id", "name", "url", "geometry", "address_components", "photos"] },
      (place, statusCode) => {
        setIsFetchingEditPlace(false);
        if (statusCode !== googlePlaces.PlacesServiceStatus.OK || !place) {
          setToast({ tone: "error", text: "Unable to fetch details for this place." });
          return;
        }
        const nextPlaceId = place.place_id ?? selectedPlaceId;
        const lat = place.geometry?.location?.lat();
        const lng = place.geometry?.location?.lng();
        const nextLatLng = typeof lat === "number" && typeof lng === "number" ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : "";
        const nextCity = getCityFromAddress(place.address_components);
        const photos = place.photos?.slice(0, 5).map((photo, index) => ({
          label: `Photo ${index + 1}`,
          url: photo.getUrl({ maxWidth: SPOT_IMAGE_MAX_WIDTH, maxHeight: SPOT_IMAGE_MAX_HEIGHT }),
        })) ?? [];
        skipNextEditAutocompleteRef.current = true;
        setEditPlaceSearch(description);
        setEditPlaceSuggestions([]);
        setEditPlacePhotos(photos);
        setEditPlaceId(nextPlaceId);
        if (!editName.trim() && place.name) setEditName(place.name);
        if (!editCity.trim() && nextCity) setEditCity(nextCity);
        if (place.url) setEditMapsLink(place.url);
        if (nextLatLng) setEditLatLng(nextLatLng);
        if (!editImage && !editImageFile && photos[0]?.url) {
          setEditImage(photos[0].url);
          setEditImagePreview(photos[0].url);
          setEditImageFile(null);
        }
        setToast({ tone: "success", text: "Place selected. Fields updated." });
      }
    );
  };

  const onEditImageFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_SOURCE_IMAGE_BYTES) {
      setToast({ tone: "error", text: "Image file must be 8MB or smaller." });
      event.currentTarget.value = "";
      return;
    }
    setIsReadingEditImageFile(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Invalid file data."));
        reader.onerror = () => reject(new Error("Unable to read file."));
        reader.readAsDataURL(file);
      });
      setEditImage("");
      setEditImagePreview(dataUrl);
      setEditImageFile(file);
    } catch {
      setToast({ tone: "error", text: "Unable to load selected image file." });
    } finally {
      setIsReadingEditImageFile(false);
      event.currentTarget.value = "";
    }
  };

  const onUpdateSpot = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setToast(null);
    if (!editingSpot || !userId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;

    setIsUpdating(true);
    let newImageStorageId: string | null = null;
    const hasNewImage = editImage.trim() || editImageFile;

    if (hasNewImage) {
      setIsUploadingEditImage(true);
      try {
        let sourceBlob: Blob;
        if (editImageFile) {
          sourceBlob = editImageFile;
        } else if (editImage.startsWith("data:image/")) {
          sourceBlob = await (await fetch(editImage, { cache: "no-store" })).blob();
        } else {
          sourceBlob = await fetchSourceImageBlobFromUrl(editImage);
        }
        if (sourceBlob.size > MAX_SOURCE_IMAGE_BYTES) throw new Error("Source image is too large.");
        const optimizedBlob = await optimizeSpotImageBlob(sourceBlob);
        const objectPath = createSpotImageStoragePath(userId);
        const { error: uploadError } = await supabase.storage
          .from(SPOT_IMAGE_BUCKET)
          .upload(objectPath, optimizedBlob, { contentType: SPOT_IMAGE_OUTPUT_MIME, cacheControl: "31536000", upsert: false });
        if (uploadError) throw new Error(uploadError.message);
        newImageStorageId = objectPath;
      } catch (error) {
        setToast({ tone: "error", text: error instanceof Error ? error.message : "Unable to upload image." });
        setIsUploadingEditImage(false);
        setIsUpdating(false);
        return;
      } finally {
        setIsUploadingEditImage(false);
      }
    }

    const updates: Record<string, unknown> = {
      name: editName,
      city: editCity,
      maps_link: editMapsLink,
      place_id: editPlaceId || null,
      lat_lng: editLatLng || null,
      hero_dish: editHeroDish.trim() || null,
      address: editAddress.trim() || null,
      verified: editVerified,
    };
    if (newImageStorageId) {
      updates.image_storage_id = newImageStorageId;
      updates.image = null;
    }

    const { error: updateError } = await supabase
      .from("spots")
      .update(updates)
      .eq("id", editingSpot.id);

    if (updateError && newImageStorageId) {
      await supabase.storage.from(SPOT_IMAGE_BUCKET).remove([newImageStorageId]);
    }

    setIsUpdating(false);

    if (updateError) {
      setToast({ tone: "error", text: updateError.message });
      return;
    }

    if (newImageStorageId && editingSpot.image_storage_id) {
      await supabase.storage.from(SPOT_IMAGE_BUCKET).remove([editingSpot.image_storage_id]);
    }

    setToast({ tone: "success", text: `"${editName}" updated successfully.` });
    setEditingSpot(null);
    setEditSearchQuery("");
    setEditSearchResults([]);
  };

  const saveStatusHint = (() => {
    if (!mapsApiKey) return "Google Places key not configured.";
    if (mapsStatus === "ready") return "Google Places ready.";
    if (mapsStatus === "error") return "Google Places failed to load. Check your API key.";
    return "Loading Google Places...";
  })();
  const isSearchDebouncing =
    placeSearchValue.length >= 2 &&
    placeSearchValue !== debouncedPlaceSearchValue &&
    placesReady;
  const showNoPlaceResults =
    placeSearchValue.length >= 2 &&
    !isSearchDebouncing &&
    !isSearchingPlace &&
    !isFetchingPlace &&
    hasCompletedPlaceSearch &&
    placeSuggestions.length === 0;

  const fetchPlaceDetails = (selectedPlaceId: string, description: string) => {
    const googlePlaces = window.google?.maps?.places;
    if (!googlePlaces) {
      setToast({
        tone: "error",
        text: "Google Places is not loaded yet.",
      });
      return;
    }

    setToast(null);
    setIsFetchingPlace(true);

    const service = new googlePlaces.PlacesService(document.createElement("div"));
    service.getDetails(
      {
        placeId: selectedPlaceId,
        fields: ["place_id", "name", "url", "geometry", "address_components", "photos"],
      },
      (place, statusCode) => {
        setIsFetchingPlace(false);

        if (statusCode !== googlePlaces.PlacesServiceStatus.OK || !place) {
          setToast({
            tone: "error",
            text: "Unable to fetch details for this place.",
          });
          return;
        }

        const nextPlaceId = place.place_id ?? selectedPlaceId;
        const lat = place.geometry?.location?.lat();
        const lng = place.geometry?.location?.lng();
        const nextLatLng =
          typeof lat === "number" && typeof lng === "number"
            ? `${lat.toFixed(6)}, ${lng.toFixed(6)}`
            : "";
        const nextCity = getCityFromAddress(place.address_components);
        const photos =
          place.photos?.slice(0, 5).map((photo, index) => ({
            label: `Photo ${index + 1}`,
            url: photo.getUrl({
              maxWidth: SPOT_IMAGE_MAX_WIDTH,
              maxHeight: SPOT_IMAGE_MAX_HEIGHT,
            }),
          })) ?? [];

        skipNextAutocompleteRef.current = true;
        setPlaceSearch(description);
        setPlaceSuggestions([]);
        setPlaceId(nextPlaceId);
        setPlacePhotos(photos);

        if (!name.trim() && place.name) setName(place.name);
        if (!city.trim() && nextCity) setCity(nextCity);
        if (place.url) setMapsLink(place.url);
        if (nextLatLng) setLatLng(nextLatLng);
        if (!image && photos[0]?.url) {
          setImage(photos[0].url);
          setImagePreview(photos[0].url);
          setImageFile(null);
        }

        setToast({
          tone: "success",
          text: "Place selected. Coordinates and details have been filled in.",
        });
      },
    );
  };

  const onImageFileSelected = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_SOURCE_IMAGE_BYTES) {
      setToast({
        tone: "error",
        text: "Image file must be 8MB or smaller.",
      });
      event.currentTarget.value = "";
      return;
    }

    const toDataUrl = () =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === "string") resolve(reader.result);
          else reject(new Error("Invalid file data."));
        };
        reader.onerror = () => reject(new Error("Unable to read file."));
        reader.readAsDataURL(file);
      });

    setIsReadingImageFile(true);

    try {
      const dataUrl = await toDataUrl();
      setImage("");
      setImagePreview(dataUrl);
      setImageFile(file);
      setToast({
        tone: "success",
        text: `Image selected: ${file.name}`,
      });
    } catch {
      setToast({
        tone: "error",
        text: "Unable to load selected image file.",
      });
    } finally {
      setIsReadingImageFile(false);
      event.currentTarget.value = "";
    }
  };

  const fetchSourceImageBlobFromUrl = async (sourceUrl: string): Promise<Blob> => {
    const response = await fetch(
      `/api/admin/spot-image-proxy?url=${encodeURIComponent(sourceUrl)}`,
      { cache: "no-store" },
    );

    if (!response.ok) {
      let message = "Unable to fetch source image.";
      const payload = await response
        .json()
        .catch(() => null) as { error?: string } | null;
      if (payload?.error) message = payload.error;
      throw new Error(message);
    }

    return response.blob();
  };

  const uploadSelectedImage = async (
    supabase: SupabaseClient,
    activeUserId: string,
  ): Promise<string | null> => {
    const imageSource = image.trim();
    if (!imageSource && !imageFile) return null;

    let sourceBlob: Blob;
    if (imageFile) {
      sourceBlob = imageFile;
    } else if (imageSource.startsWith("data:image/")) {
      const dataResponse = await fetch(imageSource, { cache: "no-store" });
      sourceBlob = await dataResponse.blob();
    } else {
      sourceBlob = await fetchSourceImageBlobFromUrl(imageSource);
    }

    if (sourceBlob.size > MAX_SOURCE_IMAGE_BYTES) {
      throw new Error("Source image is too large. Please keep it under 8MB.");
    }

    const optimizedBlob = await optimizeSpotImageBlob(sourceBlob);
    const objectPath = createSpotImageStoragePath(activeUserId);
    const { error: uploadError } = await supabase.storage
      .from(SPOT_IMAGE_BUCKET)
      .upload(objectPath, optimizedBlob, {
        contentType: SPOT_IMAGE_OUTPUT_MIME,
        cacheControl: "31536000",
        upsert: false,
      });

    if (uploadError) {
      throw new Error(uploadError.message || "Unable to upload image to storage.");
    }

    return objectPath;
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setToast(null);

    if (status !== "allowed" || !userId) {
      setToast({
        tone: "error",
        text: "You are not allowed to perform this action.",
      });
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      setToast({
        tone: "error",
        text: "Supabase is not configured.",
      });
      return;
    }

    setIsSaving(true);
    let imageStorageId: string | null = null;
    try {
      if (image.trim() || imageFile) {
        setIsUploadingImage(true);
        imageStorageId = await uploadSelectedImage(supabase, userId);
      }
    } catch (error) {
      setToast({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to prepare and upload image.",
      });
      setIsUploadingImage(false);
      setIsSaving(false);
      return;
    } finally {
      setIsUploadingImage(false);
    }

    const { error: insertError } = await supabase.from("spots").insert({
      name,
      city,
      maps_link: mapsLink,
      place_id: placeId || null,
      lat_lng: latLng || null,
      image: null,
      image_storage_id: imageStorageId,
      hero_dish: heroDish.trim() || null,
      address: address.trim() || null,
      verified,
      created_by: userId,
    });

    if (insertError && imageStorageId) {
      await supabase.storage.from(SPOT_IMAGE_BUCKET).remove([imageStorageId]);
    }

    setIsSaving(false);

    if (insertError) {
      const normalized = `${insertError.message ?? ""} ${insertError.details ?? ""}`
        .toLowerCase()
        .trim();
      const migrationMissing =
        normalized.includes("image_storage_id") && normalized.includes("column");
      setToast({
        tone: "error",
        text: migrationMissing
          ? "Apply latest DB migration to enable Supabase Storage-backed spot images."
          : insertError.message,
      });
      return;
    }

    setName("");
    setCity("");
    setMapsLink("");
    setPlaceId("");
    setLatLng("");
    setImage("");
    setImagePreview("");
    setImageFile(null);
    setHeroDish("");
    setAddress("");
    setVerified(false);
    setPlaceSearch("");
    setPlaceSuggestions([]);
    setPlacePhotos([]);
    setHasCompletedPlaceSearch(false);
    setToast({
      tone: "success",
      text: "Spot added successfully.",
    });
  };

  const onPromoteAdmin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setToast(null);
    setLastPromotedAdmin(null);

    if (status !== "allowed" || !userId) {
      setToast({
        tone: "error",
        text: "You are not allowed to perform this action.",
      });
      return;
    }

    const normalizedEmail = adminEmailToPromote.trim().toLowerCase();
    if (!normalizedEmail) {
      setToast({
        tone: "error",
        text: "Please enter an email address.",
      });
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      setToast({
        tone: "error",
        text: "Supabase is not configured.",
      });
      return;
    }

    setIsPromotingAdmin(true);

    const { data, error } = await supabase.rpc(
      "promote_profile_to_admin_by_email",
      {
        target_email: normalizedEmail,
      },
    );

    setIsPromotingAdmin(false);

    if (error) {
      setToast({
        tone: "error",
        text: error.message,
      });
      return;
    }

    const payload =
      data && typeof data === "object" && !Array.isArray(data)
        ? (data as PromoteAdminResult)
        : null;
    const promotedEmail =
      typeof payload?.email === "string" && payload.email.trim()
        ? payload.email
        : normalizedEmail;
    const changed = payload?.changed !== false;

    setLastPromotedAdmin(payload ?? { email: promotedEmail, changed });
    setAdminEmailToPromote("");
    setToast({
      tone: "success",
      text: changed
        ? `Granted admin access to ${promotedEmail}.`
        : `${promotedEmail} is already an admin.`,
    });
  };

  if (status === "loading") {
    return (
      <main className="p-6">
        <div className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700 dark:border-white/10 dark:bg-white/5 dark:text-neutral-200">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-700 dark:border-neutral-600 dark:border-t-neutral-100" />
          <span>Checking admin access...</span>
        </div>
      </main>
    );
  }

  if (status === "not-logged-in") {
    return (
      <main className="p-6">
        <p className="text-sm text-neutral-700 dark:text-neutral-300">Please login to access admin page.</p>
        <Link href="/login" className="mt-2 inline-block text-sm underline">
          Go to login
        </Link>
      </main>
    );
  }

  if (status !== "allowed") {
    return (
      <main className="p-6">
        <p className="text-sm text-red-700 dark:text-red-400">
          Access denied. This page is available only for admins.
        </p>
        <Link href="/" className="mt-2 inline-block text-sm underline">
          Back to home
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      {mapsApiKey ? (
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${mapsApiKey}&libraries=places`}
          strategy="afterInteractive"
          onLoad={() => setMapsStatus("ready")}
          onError={() => setMapsStatus("error")}
        />
      ) : null}

      <h1 className="text-xl font-semibold">Admin Dashboard</h1>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        Manage admin access and add spots.
      </p>

      <div className="mt-6 flex flex-col gap-6 md:flex-row">
        <nav className="flex shrink-0 flex-row gap-1 md:w-48 md:flex-col">
          {ADMIN_SECTIONS.map((section) => (
            <button
              key={section.key}
              type="button"
              onClick={() => setActiveSection(section.key)}
              className={`rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                activeSection === section.key
                  ? "bg-neutral-900 font-medium text-white dark:bg-white dark:text-black"
                  : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-white/5"
              }`}
            >
              {section.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1">

      {activeSection === "admin-access" ? (
      <section className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-white/10 dark:bg-white/5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Admin Access</h2>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Promote an existing signed-up user to admin using their email address.
            </p>
          </div>
        </div>

        <form onSubmit={onPromoteAdmin} className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block">User email</span>
            <input
              type="email"
              value={adminEmailToPromote}
              onChange={(event) => setAdminEmailToPromote(event.target.value)}
              placeholder="name@example.com"
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 placeholder:text-neutral-400 disabled:bg-neutral-100 dark:border-white/15 dark:bg-black/20 dark:placeholder:text-neutral-500 dark:disabled:bg-white/5"
              disabled={isPromotingAdmin}
              required
            />
            <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">
              The user must already have an account/profile row.
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={isPromotingAdmin}
              className="rounded-lg border border-neutral-900 bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:border-white/20 dark:bg-white dark:text-black"
            >
              {isPromotingAdmin ? "Updating access..." : "Make admin"}
            </button>

            {lastPromotedAdmin?.email ? (
              <p className="text-xs text-neutral-500 dark:text-neutral-300" aria-live="polite">
                Last updated:{" "}
                <span className="font-medium text-neutral-900 dark:text-neutral-100">
                  {lastPromotedAdmin.email}
                </span>
                {lastPromotedAdmin.changed === false ? " (already admin)" : " (promoted)"}
              </p>
            ) : null}
          </div>
        </form>
      </section>
      ) : null}

      {activeSection === "migrate-images" ? (
      <section className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-white/10 dark:bg-white/5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">
              Migrate Legacy Images
            </h2>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Spots with external image URLs that haven&apos;t been moved to
              Supabase Storage yet.
            </p>
          </div>
        </div>

        {isFetchingLegacy ? (
          <div className="mt-4 inline-flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-700 dark:border-neutral-600 dark:border-t-neutral-100" />
            Loading legacy spots...
          </div>
        ) : legacySpots.length === 0 ? (
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              All spots are using Supabase Storage. Nothing to migrate.
            </p>
            <button
              type="button"
              onClick={() => void fetchLegacySpots()}
              disabled={isFetchingLegacy}
              className="shrink-0 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-60 dark:border-white/15 dark:text-neutral-200 dark:hover:bg-white/10"
            >
              Refresh
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void migrateAllLegacySpots()}
                disabled={isMigrating}
                className="rounded-lg border border-neutral-900 bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:border-white/20 dark:bg-white dark:text-black"
              >
                {isMigrating
                  ? `Migrating ${migrationProgress?.current ?? 0}/${migrationProgress?.total ?? 0}...`
                  : `Migrate all (${legacySpots.length} spots)`}
              </button>
              <button
                type="button"
                onClick={() => void fetchLegacySpots()}
                disabled={isFetchingLegacy || isMigrating}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-60 dark:border-white/15 dark:text-neutral-200 dark:hover:bg-white/10"
              >
                Refresh
              </button>
            </div>

            <div className="max-h-48 space-y-1 overflow-y-auto">
              {legacySpots.map((spot) => {
                const result = migrationResults.find(
                  (r) => r.spotId === spot.id,
                );
                return (
                  <div
                    key={spot.id}
                    className="flex items-center justify-between gap-2 rounded border border-neutral-200 px-2 py-1.5 text-xs dark:border-white/10"
                  >
                    <span className="truncate text-neutral-700 dark:text-neutral-200">
                      {spot.name}{" "}
                      <span className="text-neutral-400 dark:text-neutral-500">({spot.city})</span>
                    </span>
                    {result ? (
                      <span
                        className={
                          result.status === "success"
                            ? "shrink-0 text-green-400"
                            : "shrink-0 text-red-400"
                        }
                        title={result.error}
                      >
                        {result.status === "success" ? "Done" : "Failed"}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
      ) : null}

      {activeSection === "backfill-addresses" ? (
      <section className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-white/10 dark:bg-white/5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Backfill Addresses</h2>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Spots with a Google Place ID but no address yet. Uses the Places API to fetch and save <code className="rounded bg-neutral-200 px-1 dark:bg-white/10">formatted_address</code> for each.
            </p>
          </div>
        </div>

        {!placesReady ? (
          <p className="mt-4 text-xs text-neutral-500 dark:text-neutral-400">
            Google Places must be loaded to run backfill. {saveStatusHint}
          </p>
        ) : isFetchingBackfillSpots ? (
          <div className="mt-4 inline-flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-700 dark:border-neutral-600 dark:border-t-neutral-100" />
            Loading spots...
          </div>
        ) : addressBackfillSpots.length === 0 ? (
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              All spots with a Place ID already have an address.
            </p>
            <button
              type="button"
              onClick={() => void fetchAddressBackfillSpots()}
              disabled={isFetchingBackfillSpots}
              className="shrink-0 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-60 dark:border-white/15 dark:text-neutral-200 dark:hover:bg-white/10"
            >
              Refresh
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void backfillAllAddresses()}
                disabled={isBackfilling}
                className="rounded-lg border border-neutral-900 bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:border-white/20 dark:bg-white dark:text-black"
              >
                {isBackfilling
                  ? `Backfilling ${backfillProgress?.current ?? 0}/${backfillProgress?.total ?? 0}...`
                  : `Backfill all (${addressBackfillSpots.length} spots)`}
              </button>
              <button
                type="button"
                onClick={() => void fetchAddressBackfillSpots()}
                disabled={isFetchingBackfillSpots || isBackfilling}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-60 dark:border-white/15 dark:text-neutral-200 dark:hover:bg-white/10"
              >
                Refresh
              </button>
            </div>

            <div className="max-h-48 space-y-1 overflow-y-auto">
              {addressBackfillSpots.map((spot) => {
                const result = backfillResults.find((r) => r.spotId === spot.id);
                return (
                  <div
                    key={spot.id}
                    className="flex items-center justify-between gap-2 rounded border border-neutral-200 px-2 py-1.5 text-xs dark:border-white/10"
                  >
                    <span className="truncate text-neutral-700 dark:text-neutral-200">
                      {spot.name}{" "}
                      <span className="text-neutral-400 dark:text-neutral-500">({spot.city})</span>
                    </span>
                    {result ? (
                      <span
                        className={
                          result.status === "success"
                            ? "shrink-0 text-green-400"
                            : result.status === "skipped"
                              ? "shrink-0 text-yellow-500"
                              : "shrink-0 text-red-400"
                        }
                        title={result.address ?? result.error}
                      >
                        {result.status === "success" ? "Done" : result.status === "skipped" ? "Skipped" : "Failed"}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
      ) : null}

      {activeSection === "add-spot" ? (
      <section className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-white/10 dark:bg-white/5">
        <h2 className="text-sm font-semibold">Add Spot</h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Search and select a Google Place to auto-fill details.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block">Search Google Place</span>
          <div className="flex gap-2">
            <input
              type="search"
              value={placeSearch}
              onChange={(event) => {
                skipNextAutocompleteRef.current = false;
                setPlaceSearch(event.target.value);
                setPlaceSuggestions([]);
                setHasCompletedPlaceSearch(false);
              }}
              placeholder="Search a place, e.g. Museum of Modern Art New York"
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 placeholder:text-neutral-400 disabled:bg-neutral-100 dark:border-white/15 dark:bg-black/20 dark:placeholder:text-neutral-500 dark:disabled:bg-white/5"
              disabled={!placesReady}
            />
            {placeSearch ? (
              <button
                type="button"
                onClick={() => {
                  skipNextAutocompleteRef.current = false;
                  setPlaceSearch("");
                  setPlaceSuggestions([]);
                  setHasCompletedPlaceSearch(false);
                }}
                className="shrink-0 rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-white/15 dark:text-neutral-200 dark:hover:bg-white/10"
              >
                Clear
              </button>
            ) : null}
          </div>
          <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">{saveStatusHint}</span>
        </label>

        {isSearchDebouncing ? (
          <p className="text-xs text-neutral-500 dark:text-neutral-400" aria-live="polite">
            Waiting for typing to pause...
          </p>
        ) : null}

        {isSearchingPlace ? (
          <p className="text-xs text-neutral-500 dark:text-neutral-400" aria-live="polite">
            Searching places...
          </p>
        ) : null}

        {placeSearchValue.length >= 2 && placeSuggestions.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
            {placeSuggestions.map((suggestion) => (
              <button
                key={suggestion.placeId}
                type="button"
                onClick={() => fetchPlaceDetails(suggestion.placeId, suggestion.description)}
                disabled={isFetchingPlace}
                className="block w-full cursor-pointer border-b border-neutral-200 px-3 py-2 text-left text-sm text-neutral-900 transition-colors last:border-b-0 hover:bg-neutral-100 focus:bg-neutral-100 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                {suggestion.description}
              </button>
            ))}
          </div>
        ) : null}

        {showNoPlaceResults ? (
          <p className="rounded-lg border border-dashed border-neutral-300 px-3 py-2 text-xs text-neutral-500 dark:border-white/15 dark:text-neutral-300">
            No places found. Try a more specific query (name + city).
          </p>
        ) : null}

        {isFetchingPlace ? (
          <p className="text-xs text-neutral-500 dark:text-neutral-400" aria-live="polite">
            Fetching selected place details...
          </p>
        ) : null}

        <label className="block text-sm">
          <span className="mb-1 block">Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 placeholder:text-neutral-400 dark:border-white/15 dark:bg-black/20 dark:placeholder:text-neutral-500"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block">City</span>
          <input
            value={city}
            onChange={(event) => setCity(event.target.value)}
            required
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 placeholder:text-neutral-400 dark:border-white/15 dark:bg-black/20 dark:placeholder:text-neutral-500"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block">Google Maps link</span>
          <input
            type="url"
            value={mapsLink}
            onChange={(event) => setMapsLink(event.target.value)}
            required
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 placeholder:text-neutral-400 dark:border-white/15 dark:bg-black/20 dark:placeholder:text-neutral-500"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block">Place ID (optional)</span>
          <input
            value={placeId}
            onChange={(event) => setPlaceId(event.target.value)}
            placeholder="ChIJN1t_tDeuEmsRUsoyG83frY4"
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 placeholder:text-neutral-400 dark:border-white/15 dark:bg-black/20 dark:placeholder:text-neutral-500"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block">Lat/Lng (optional)</span>
          <input
            value={latLng}
            onChange={(event) => setLatLng(event.target.value)}
            placeholder="12.9628, 77.6373"
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 placeholder:text-neutral-400 dark:border-white/15 dark:bg-black/20 dark:placeholder:text-neutral-500"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block">Image URL (optional)</span>
          <input
            type="text"
            value={image}
            onChange={(event) => {
              setImage(event.target.value);
              setImagePreview(event.target.value);
              setImageFile(null);
            }}
            placeholder="https://..."
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 placeholder:text-neutral-400 dark:border-white/15 dark:bg-black/20 dark:placeholder:text-neutral-500"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block">Hero dish (optional)</span>
          <input
            type="text"
            value={heroDish}
            onChange={(event) => setHeroDish(event.target.value)}
            placeholder="Spicy vodka rigatoni"
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 placeholder:text-neutral-400 dark:border-white/15 dark:bg-black/20 dark:placeholder:text-neutral-500"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block">Address (optional)</span>
          <input
            type="text"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="123 Main St, New York, NY 10001"
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 placeholder:text-neutral-400 dark:border-white/15 dark:bg-black/20 dark:placeholder:text-neutral-500"
          />
        </label>

        <label className="flex items-center gap-2 rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm dark:border-white/15 dark:bg-black/10">
          <input
            type="checkbox"
            checked={verified}
            onChange={(event) => setVerified(event.target.checked)}
            className="h-4 w-4"
          />
          <span>Mark as verified</span>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block">Or upload image file</span>
          <input
            type="file"
            accept="image/*"
            onChange={onImageFileSelected}
            className="block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-700 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-900 file:px-3 file:py-1 file:text-white disabled:bg-neutral-100 dark:border-white/15 dark:bg-black/20 dark:text-neutral-200 dark:file:bg-white dark:file:text-black dark:disabled:bg-white/5"
            disabled={isSaving || isReadingImageFile || isUploadingImage}
          />
          <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">
            Uploaded image is resized to fit within 1080x1350 and stored in Supabase Storage.
          </span>
          {isReadingImageFile ? (
            <span className="mt-1 inline-flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-700 dark:border-neutral-600 dark:border-t-neutral-100" />
              Reading image file...
            </span>
          ) : null}
        </label>

        {placePhotos.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm">Choose a photo from selected place</p>
            <div className="grid grid-cols-3 gap-2">
              {placePhotos.map((photo) => (
                <button
                  key={photo.url}
                  type="button"
                  onClick={() => {
                    setImage(photo.url);
                    setImagePreview(photo.url);
                    setImageFile(null);
                  }}
                  className={`overflow-hidden rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-black/20 ${
                    image === photo.url
                      ? "border-neutral-900 ring-1 ring-neutral-900/20"
                      : "border-neutral-300 hover:border-neutral-400"
                  }`}
                  title={photo.label}
                  aria-pressed={image === photo.url}
                >
                  <LoadingImage
                    src={photo.url}
                    alt={photo.label}
                    width={240}
                    height={160}
                    imageClassName="h-20 w-full object-cover"
                    containerClassName="h-20 w-full"
                  />
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {imagePreview ? (
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-sm">Selected image preview</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">Preview shows a loader while the image resolves</p>
            </div>
            <LoadingImage
              src={imagePreview}
              alt="Selected preview"
              width={720}
              height={288}
              imageClassName="h-36 w-full object-cover"
              containerClassName="h-36 w-full rounded-lg border border-neutral-300 dark:border-neutral-700"
            />
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={isSaving || isReadingImageFile || isFetchingPlace || isUploadingImage}
            className="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            {isSaving
              ? "Saving..."
              : isUploadingImage
                ? "Uploading image..."
              : isFetchingPlace
                ? "Fetching place..."
                : isReadingImageFile
                  ? "Processing image..."
                  : "Add spot"}
          </button>
          {(isFetchingPlace || isReadingImageFile || isUploadingImage) && !isSaving ? (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Finish current loading step before saving.
            </p>
          ) : null}
        </div>
        </form>
      </section>
      ) : null}

      {activeSection === "edit-spot" ? (
      <section className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-white/10 dark:bg-white/5">
        <h2 className="text-sm font-semibold">Edit Spot</h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Search for a spot by name to edit its details.
        </p>

        {!editingSpot ? (
          <div className="mt-4 space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block">Search spots</span>
              <input
                type="search"
                value={editSearchQuery}
                onChange={(e) => setEditSearchQuery(e.target.value)}
                placeholder="Type spot name..."
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 placeholder:text-neutral-400 dark:border-white/15 dark:bg-black/20 dark:placeholder:text-neutral-500"
              />
            </label>

            {isSearchingSpots ? (
              <div className="inline-flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-700 dark:border-neutral-600 dark:border-t-neutral-100" />
                Searching...
              </div>
            ) : null}

            {editSearchQuery.trim().length >= 2 && !isSearchingSpots && editSearchResults.length === 0 ? (
              <p className="text-xs text-neutral-500 dark:text-neutral-400">No spots found.</p>
            ) : null}

            {editSearchResults.length > 0 ? (
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {editSearchResults.map((spot) => (
                  <button
                    key={spot.id}
                    type="button"
                    onClick={() => selectSpotForEditing(spot)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-left text-sm transition-colors hover:bg-neutral-100 dark:border-white/10 dark:hover:bg-white/5"
                  >
                    <span className="truncate font-medium text-neutral-900 dark:text-neutral-100">{spot.name}</span>
                    <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400">{spot.city}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                Editing: {editingSpot.name}
              </p>
              <button
                type="button"
                onClick={() => {
                  setEditingSpot(null);
                  setEditPlaceSearch("");
                  setEditPlaceSuggestions([]);
                  setEditPlacePhotos([]);
                }}
                className="shrink-0 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-white/15 dark:text-neutral-200 dark:hover:bg-white/10"
              >
                Back to search
              </button>
            </div>

            <form onSubmit={onUpdateSpot} className="space-y-4">
              <label className="block text-sm">
                <span className="mb-1 block">Re-link to Google Place (optional)</span>
                <div className="flex gap-2">
                  <input
                    type="search"
                    value={editPlaceSearch}
                    onChange={(e) => {
                      skipNextEditAutocompleteRef.current = false;
                      setEditPlaceSearch(e.target.value);
                      setEditPlaceSuggestions([]);
                      setHasCompletedEditPlaceSearch(false);
                    }}
                    placeholder="Search a place to update coords/photos..."
                    className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 placeholder:text-neutral-400 disabled:bg-neutral-100 dark:border-white/15 dark:bg-black/20 dark:placeholder:text-neutral-500 dark:disabled:bg-white/5"
                    disabled={!placesReady}
                  />
                  {editPlaceSearch ? (
                    <button
                      type="button"
                      onClick={() => { setEditPlaceSearch(""); setEditPlaceSuggestions([]); setHasCompletedEditPlaceSearch(false); }}
                      className="shrink-0 rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-white/15 dark:text-neutral-200 dark:hover:bg-white/10"
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
              </label>

              {isSearchingEditPlace ? (
                <p className="text-xs text-neutral-500 dark:text-neutral-400">Searching places...</p>
              ) : null}

              {editPlaceSearch.trim().length >= 2 && editPlaceSuggestions.length > 0 ? (
                <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
                  {editPlaceSuggestions.map((s) => (
                    <button
                      key={s.placeId}
                      type="button"
                      onClick={() => fetchEditPlaceDetails(s.placeId, s.description)}
                      disabled={isFetchingEditPlace}
                      className="block w-full cursor-pointer border-b border-neutral-200 px-3 py-2 text-left text-sm text-neutral-900 transition-colors last:border-b-0 hover:bg-neutral-100 focus:bg-neutral-100 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {s.description}
                    </button>
                  ))}
                </div>
              ) : null}

              {editPlaceSearch.trim().length >= 2 && !isSearchingEditPlace && !isFetchingEditPlace && hasCompletedEditPlaceSearch && editPlaceSuggestions.length === 0 ? (
                <p className="rounded-lg border border-dashed border-neutral-300 px-3 py-2 text-xs text-neutral-500 dark:border-white/15 dark:text-neutral-300">
                  No places found.
                </p>
              ) : null}

              {isFetchingEditPlace ? (
                <p className="text-xs text-neutral-500 dark:text-neutral-400">Fetching place details...</p>
              ) : null}

              <label className="block text-sm">
                <span className="mb-1 block">Name</span>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 placeholder:text-neutral-400 dark:border-white/15 dark:bg-black/20 dark:placeholder:text-neutral-500"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block">City</span>
                <input
                  value={editCity}
                  onChange={(e) => setEditCity(e.target.value)}
                  required
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 placeholder:text-neutral-400 dark:border-white/15 dark:bg-black/20 dark:placeholder:text-neutral-500"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block">Google Maps link</span>
                <input
                  type="url"
                  value={editMapsLink}
                  onChange={(e) => setEditMapsLink(e.target.value)}
                  required
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 placeholder:text-neutral-400 dark:border-white/15 dark:bg-black/20 dark:placeholder:text-neutral-500"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block">Place ID (optional)</span>
                <input
                  value={editPlaceId}
                  onChange={(e) => setEditPlaceId(e.target.value)}
                  placeholder="ChIJN1t_tDeuEmsRUsoyG83frY4"
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 placeholder:text-neutral-400 dark:border-white/15 dark:bg-black/20 dark:placeholder:text-neutral-500"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block">Lat/Lng (optional)</span>
                <input
                  value={editLatLng}
                  onChange={(e) => setEditLatLng(e.target.value)}
                  placeholder="12.9628, 77.6373"
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 placeholder:text-neutral-400 dark:border-white/15 dark:bg-black/20 dark:placeholder:text-neutral-500"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block">New image URL (optional, replaces current)</span>
                <input
                  type="text"
                  value={editImage}
                  onChange={(e) => { setEditImage(e.target.value); setEditImagePreview(e.target.value); setEditImageFile(null); }}
                  placeholder="https://..."
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 placeholder:text-neutral-400 dark:border-white/15 dark:bg-black/20 dark:placeholder:text-neutral-500"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block">Hero dish (optional)</span>
                <input
                  type="text"
                  value={editHeroDish}
                  onChange={(e) => setEditHeroDish(e.target.value)}
                  placeholder="Spicy vodka rigatoni"
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 placeholder:text-neutral-400 dark:border-white/15 dark:bg-black/20 dark:placeholder:text-neutral-500"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block">Address (optional)</span>
                <input
                  type="text"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  placeholder="123 Main St, New York, NY 10001"
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 placeholder:text-neutral-400 dark:border-white/15 dark:bg-black/20 dark:placeholder:text-neutral-500"
                />
              </label>

              <label className="flex items-center gap-2 rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm dark:border-white/15 dark:bg-black/10">
                <input
                  type="checkbox"
                  checked={editVerified}
                  onChange={(e) => setEditVerified(e.target.checked)}
                  className="h-4 w-4"
                />
                <span>Mark as verified</span>
              </label>

              <label className="block text-sm">
                <span className="mb-1 block">Or upload new image file</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={onEditImageFileSelected}
                  className="block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-700 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-900 file:px-3 file:py-1 file:text-white disabled:bg-neutral-100 dark:border-white/15 dark:bg-black/20 dark:text-neutral-200 dark:file:bg-white dark:file:text-black dark:disabled:bg-white/5"
                  disabled={isUpdating || isReadingEditImageFile || isUploadingEditImage}
                />
                {isReadingEditImageFile ? (
                  <span className="mt-1 inline-flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-700 dark:border-neutral-600 dark:border-t-neutral-100" />
                    Reading image file...
                  </span>
                ) : null}
              </label>

              {editPlacePhotos.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm">Choose a photo from selected place</p>
                  <div className="grid grid-cols-3 gap-2">
                    {editPlacePhotos.map((photo) => (
                      <button
                        key={photo.url}
                        type="button"
                        onClick={() => { setEditImage(photo.url); setEditImagePreview(photo.url); setEditImageFile(null); }}
                        className={`overflow-hidden rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-black/20 ${
                          editImage === photo.url
                            ? "border-neutral-900 ring-1 ring-neutral-900/20"
                            : "border-neutral-300 hover:border-neutral-400"
                        }`}
                        title={photo.label}
                        aria-pressed={editImage === photo.url}
                      >
                        <LoadingImage
                          src={photo.url}
                          alt={photo.label}
                          width={240}
                          height={160}
                          imageClassName="h-20 w-full object-cover"
                          containerClassName="h-20 w-full"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {editImagePreview ? (
                <div>
                  <p className="mb-1 text-sm">New image preview</p>
                  <LoadingImage
                    src={editImagePreview}
                    alt="Edit preview"
                    width={720}
                    height={288}
                    imageClassName="h-36 w-full object-cover"
                    containerClassName="h-36 w-full rounded-lg border border-neutral-300 dark:border-neutral-700"
                  />
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={isUpdating || isReadingEditImageFile || isFetchingEditPlace || isUploadingEditImage}
                  className="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-60 dark:bg-white dark:text-black"
                >
                  {isUpdating
                    ? "Saving..."
                    : isUploadingEditImage
                      ? "Uploading image..."
                      : "Update spot"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingSpot(null);
                    setEditPlaceSearch("");
                    setEditPlaceSuggestions([]);
                    setEditPlacePhotos([]);
                  }}
                  disabled={isUpdating}
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-60 dark:border-white/15 dark:text-neutral-200 dark:hover:bg-white/10"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </section>
      ) : null}

        </div>
      </div>

      {toast ? (
        <div className="fixed bottom-4 right-4 z-50" aria-live="polite" aria-atomic="true">
          <div
            className={`rounded-sm border px-3 py-2 text-xs shadow-sm ${
              toast.tone === "success"
                ? "border-black/20 bg-white/90 text-neutral-800"
                : "border-red-700/30 bg-red-50/95 text-red-700"
            }`}
          >
            {toast.text}
          </div>
        </div>
      ) : null}
    </main>
  );
}
