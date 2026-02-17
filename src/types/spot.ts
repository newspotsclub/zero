export type Location = {
  area: string;
  mapsLink: string;
  latLng?: string;
};

export type Spot = {
  image?: string;
  name: string;
  latLng?: string;
  locations: Location[];
};

export type SpotEntry = {
  spot: Spot;
  location: Location;
};
