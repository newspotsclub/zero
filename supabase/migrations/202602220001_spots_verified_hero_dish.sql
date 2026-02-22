alter table public.spots
add column if not exists hero_dish text;

alter table public.spots
add column if not exists verified boolean not null default false;
