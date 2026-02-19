-- Store Google Place ID for spots.

alter table public.spots
add column if not exists place_id text;
