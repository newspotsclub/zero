"use client";

import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import { useEffect, useMemo, useState } from "react";
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

type GoogleAddressComponent = {
  long_name: string;
  short_name: string;
  types: string[];
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

  const [placeSearch, setPlaceSearch] = useState("");
  const [placeSuggestions, setPlaceSuggestions] = useState<PlaceSuggestion[]>([]);
  const [placePhotos, setPlacePhotos] = useState<PlacePhotoOption[]>([]);

  const [isSaving, setIsSaving] = useState(false);
  const [isSearchingPlace, setIsSearchingPlace] = useState(false);
  const [isFetchingPlace, setIsFetchingPlace] = useState(false);
  const [mapsStatus, setMapsStatus] = useState<GoogleMapsStatus>(
    mapsApiKey ? "loading" : "idle",
  );

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
    if (!placesReady) return;

    const query = placeSearch.trim();
    if (query.length < 2) return;

    const googlePlaces = window.google?.maps?.places;
    if (!googlePlaces) return;

    const timeout = window.setTimeout(() => {
      setIsSearchingPlace(true);

      const autocomplete = new googlePlaces.AutocompleteService();
      autocomplete.getPlacePredictions({ input: query }, (results, statusCode) => {
        setIsSearchingPlace(false);

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
    }, 250);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [placeSearch, placesReady]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 1800);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [toast]);

  const saveStatusHint = useMemo(() => {
    if (!mapsApiKey) return "Google Places key not configured.";
    if (mapsStatus === "ready") return "Google Places ready.";
    if (mapsStatus === "error") return "Google Places failed to load. Check your API key.";
    return "Loading Google Places...";
  }, [mapsApiKey, mapsStatus]);

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
    setPlaceSearch("");
    setPlaceSuggestions([]);
    setPlacePhotos([]);
    setToast({
      tone: "success",
      text: "Spot added successfully.",
    });
  };

  if (status === "loading") {
    return <main className="p-6 text-sm">Checking admin access...</main>;
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
    <main className="mx-auto max-w-xl p-6">
      {mapsApiKey ? (
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${mapsApiKey}&libraries=places`}
          strategy="afterInteractive"
          onLoad={() => setMapsStatus("ready")}
          onError={() => setMapsStatus("error")}
        />
      ) : null}

      <h1 className="text-xl font-semibold">Admin: Add Spot</h1>
      <p className="mt-1 text-sm text-neutral-600">
        Search and select a Google Place to auto-fill details.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block">Search Google Place</span>
          <input
            value={placeSearch}
            onChange={(event) => setPlaceSearch(event.target.value)}
            placeholder="Search a place, e.g. Museum of Modern Art New York"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2"
            disabled={!placesReady}
          />
          <span className="mt-1 block text-xs text-neutral-500">{saveStatusHint}</span>
        </label>

        {isSearchingPlace ? (
          <p className="text-xs text-neutral-500">Searching places...</p>
        ) : null}

        {placeSearch.trim().length >= 2 && placeSuggestions.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
            {placeSuggestions.map((suggestion) => (
              <button
                key={suggestion.placeId}
                type="button"
                onClick={() => fetchPlaceDetails(suggestion.placeId, suggestion.description)}
                className="block w-full cursor-pointer border-b border-neutral-200 px-3 py-2 text-left text-sm text-neutral-900 transition-colors last:border-b-0 hover:bg-neutral-100 focus:bg-neutral-100 focus:outline-none"
              >
                {suggestion.description}
              </button>
            ))}
          </div>
        ) : null}

        {isFetchingPlace ? (
          <p className="text-xs text-neutral-500">Fetching selected place details...</p>
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
          <span className="mb-1 block">Or upload image file</span>
          <input
            type="file"
            accept="image/*"
            onChange={onImageFileSelected}
            className="block w-full rounded-lg border border-neutral-300 px-3 py-2"
          />
          <span className="mt-1 block text-xs text-neutral-500">
            Uploaded file is stored as a data URL in the image field.
          </span>
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
                  className="overflow-hidden rounded-lg border border-neutral-300"
                  title={photo.label}
                >
                  <Image
                    src={photo.url}
                    alt={photo.label}
                    width={240}
                    height={160}
                    className="h-20 w-full object-cover"
                    unoptimized
                  />
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {image ? (
          <div>
            <p className="mb-1 text-sm">Selected image preview</p>
            <Image
              src={image}
              alt="Selected preview"
              width={720}
              height={288}
              className="h-36 w-full rounded-lg border border-neutral-300 object-cover"
              unoptimized
            />
          </div>
        ) : null}

        <button
          type="submit"
          disabled={isSaving}
          className="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
        >
          {isSaving ? "Saving..." : "Add spot"}
        </button>
      </form>

      {toast ? (
        <div className="fixed bottom-4 right-4 z-50">
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
