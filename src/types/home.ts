/** Spot as used on the home page (from Supabase spots table). */
export type HomeSpot = {
  id: number;
  name: string;
  city: string;
  mapsLink: string;
  latLng?: string;
  image?: string;
  imageStorageId?: string;
  verified: boolean;
  heroDish?: string;
};

/** Row shape from Supabase spots table. */
export type SpotRow = {
  id: number;
  name: string;
  city: string;
  maps_link: string;
  lat_lng: string | null;
  image: string | null;
  image_storage_id: string | null;
  verified: boolean | null;
  hero_dish: string | null;
};
