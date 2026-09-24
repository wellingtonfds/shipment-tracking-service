export interface GeocodingCoordinates {
  readonly latitude: number;
  readonly longitude: number;
}

export interface GeocodingPort {
  geocode(address: string): Promise<GeocodingCoordinates>;
}
