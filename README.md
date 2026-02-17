# Zero

**NewSpots Club**: A curated list of new spots to explore in and around you. Browse places by city, see map previews, and open them in Google Maps.

## About the project

- **Curated spots** — Places are stored in `src/data/spots.json`. Each spot has a name, city, Google Maps link, and optional coordinates or image URL.
- **City filter** — Filter the list by city with pill buttons (All + one per city in the data).
- **Map thumbnails** — If a spot has `latLng`, the card shows a static map image (requires a Google Maps API key). Otherwise it uses `image` or a placeholder.
- **Links to Maps** — Each card links to the spot’s Google Maps URL in a new tab.
- **Responsive grid** — Two columns on mobile, three on larger screens; cards use a 4:5 aspect ratio.

Want to add a place? The footer links to **hello@newspots.club**.
