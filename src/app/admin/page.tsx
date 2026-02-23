"use client";

import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

type AdminStatus = "loading" | "not-logged-in" | "forbidden" | "allowed";

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
                      photos?: Array<{ getUrl: (options: { maxWidth: number }) => string }>;
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
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-100">
          {loadState === "error" ? (
            <span className="px-2 text-center text-[11px] text-neutral-500">
              Image failed to load
            </span>
          ) : (
            <div className="flex items-center gap-2 text-xs text-neutral-500">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-700" />
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
  const [userId, setUserId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [mapsLink, setMapsLink] = useState("");
  const [placeId, setPlaceId] = useState("");
  const [latLng, setLatLng] = useState("");
  const [image, setImage] = useState("");
  const [heroDish, setHeroDish] = useState("");
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
  const [isSearchingPlace, setIsSearchingPlace] = useState(false);
  const [isFetchingPlace, setIsFetchingPlace] = useState(false);
  const [isReadingImageFile, setIsReadingImageFile] = useState(false);
  const [mapsStatus, setMapsStatus] = useState<GoogleMapsStatus>(
    mapsApiKey ? "loading" : "idle",
  );
  const debouncedPlaceSearch = useDebouncedValue(placeSearch, 350);
  const autocompleteRequestIdRef = useRef(0);
  const skipNextAutocompleteRef = useRef(false);

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
            url: photo.getUrl({ maxWidth: 1200 }),
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
        if (!image && photos[0]?.url) setImage(photos[0].url);

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
      setImage(dataUrl);
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

    const { error: insertError } = await supabase.from("spots").insert({
      name,
      city,
      maps_link: mapsLink,
      place_id: placeId || null,
      lat_lng: latLng || null,
      image: image || null,
      hero_dish: heroDish.trim() || null,
      verified,
      created_by: userId,
    });

    setIsSaving(false);

    if (insertError) {
      setToast({
        tone: "error",
        text: insertError.message,
      });
      return;
    }

    setName("");
    setCity("");
    setMapsLink("");
    setPlaceId("");
    setLatLng("");
    setImage("");
    setHeroDish("");
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
        <div className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-700" />
          <span>Checking admin access...</span>
        </div>
      </main>
    );
  }

  if (status === "not-logged-in") {
    return (
      <main className="p-6">
        <p className="text-sm text-neutral-700">Please login to access admin page.</p>
        <Link href="/login" className="mt-2 inline-block text-sm underline">
          Go to login
        </Link>
      </main>
    );
  }

  if (status !== "allowed") {
    return (
      <main className="p-6">
        <p className="text-sm text-red-700">
          Access denied. This page is available only for admins.
        </p>
        <Link href="/" className="mt-2 inline-block text-sm underline">
          Back to home
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      {mapsApiKey ? (
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${mapsApiKey}&libraries=places`}
          strategy="afterInteractive"
          onLoad={() => setMapsStatus("ready")}
          onError={() => setMapsStatus("error")}
        />
      ) : null}

      <h1 className="text-xl font-semibold">Admin Dashboard</h1>
      <p className="mt-1 text-sm text-neutral-600">
        Manage admin access and add spots.
      </p>

      <section className="mt-6 rounded-xl border border-neutral-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">Admin Access</h2>
            <p className="mt-1 text-xs text-neutral-600">
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
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 disabled:bg-neutral-100"
              disabled={isPromotingAdmin}
              required
            />
            <span className="mt-1 block text-xs text-neutral-500">
              The user must already have an account/profile row.
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={isPromotingAdmin}
              className="rounded-lg border border-neutral-900 bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-60"
            >
              {isPromotingAdmin ? "Updating access..." : "Make admin"}
            </button>

            {lastPromotedAdmin?.email ? (
              <p className="text-xs text-neutral-600" aria-live="polite">
                Last updated:{" "}
                <span className="font-medium text-neutral-900">
                  {lastPromotedAdmin.email}
                </span>
                {lastPromotedAdmin.changed === false ? " (already admin)" : " (promoted)"}
              </p>
            ) : null}
          </div>
        </form>
      </section>

      <section className="mt-6 rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-neutral-900">Add Spot</h2>
        <p className="mt-1 text-sm text-neutral-600">
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
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 disabled:bg-neutral-100"
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
                className="shrink-0 rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-100"
              >
                Clear
              </button>
            ) : null}
          </div>
          <span className="mt-1 block text-xs text-neutral-500">{saveStatusHint}</span>
        </label>

        {isSearchDebouncing ? (
          <p className="text-xs text-neutral-500" aria-live="polite">
            Waiting for typing to pause...
          </p>
        ) : null}

        {isSearchingPlace ? (
          <p className="text-xs text-neutral-500" aria-live="polite">
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
          <p className="rounded-lg border border-dashed border-neutral-300 px-3 py-2 text-xs text-neutral-600">
            No places found. Try a more specific query (name + city).
          </p>
        ) : null}

        {isFetchingPlace ? (
          <p className="text-xs text-neutral-500" aria-live="polite">
            Fetching selected place details...
          </p>
        ) : null}

        <label className="block text-sm">
          <span className="mb-1 block">Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            className="w-full rounded-lg border border-neutral-300 px-3 py-2"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block">City</span>
          <input
            value={city}
            onChange={(event) => setCity(event.target.value)}
            required
            className="w-full rounded-lg border border-neutral-300 px-3 py-2"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block">Google Maps link</span>
          <input
            type="url"
            value={mapsLink}
            onChange={(event) => setMapsLink(event.target.value)}
            required
            className="w-full rounded-lg border border-neutral-300 px-3 py-2"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block">Place ID (optional)</span>
          <input
            value={placeId}
            onChange={(event) => setPlaceId(event.target.value)}
            placeholder="ChIJN1t_tDeuEmsRUsoyG83frY4"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block">Lat/Lng (optional)</span>
          <input
            value={latLng}
            onChange={(event) => setLatLng(event.target.value)}
            placeholder="12.9628, 77.6373"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block">Image URL (optional)</span>
          <input
            type="text"
            value={image}
            onChange={(event) => setImage(event.target.value)}
            placeholder="https://... or data:image/..."
            className="w-full rounded-lg border border-neutral-300 px-3 py-2"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block">Hero dish (optional)</span>
          <input
            type="text"
            value={heroDish}
            onChange={(event) => setHeroDish(event.target.value)}
            placeholder="Spicy vodka rigatoni"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2"
          />
        </label>

        <label className="flex items-center gap-2 rounded-lg border border-neutral-300 px-3 py-2 text-sm">
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
            className="block w-full rounded-lg border border-neutral-300 px-3 py-2 disabled:bg-neutral-100"
            disabled={isSaving || isReadingImageFile}
          />
          <span className="mt-1 block text-xs text-neutral-500">
            Uploaded file is stored as a data URL in the image field.
          </span>
          {isReadingImageFile ? (
            <span className="mt-1 inline-flex items-center gap-2 text-xs text-neutral-500">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-700" />
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
                  onClick={() => setImage(photo.url)}
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

        {image ? (
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-sm">Selected image preview</p>
              <p className="text-xs text-neutral-500">Preview shows a loader while the image resolves</p>
            </div>
            <LoadingImage
              src={image}
              alt="Selected preview"
              width={720}
              height={288}
              imageClassName="h-36 w-full object-cover"
              containerClassName="h-36 w-full rounded-lg border border-neutral-300"
            />
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={isSaving || isReadingImageFile || isFetchingPlace}
            className="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            {isSaving
              ? "Saving..."
              : isFetchingPlace
                ? "Fetching place..."
                : isReadingImageFile
                  ? "Processing image..."
                  : "Add spot"}
          </button>
          {(isFetchingPlace || isReadingImageFile) && !isSaving ? (
            <p className="text-xs text-neutral-500">
              Finish current loading step before saving.
            </p>
          ) : null}
        </div>
        </form>
      </section>

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
