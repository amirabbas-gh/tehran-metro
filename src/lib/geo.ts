import type { EnrichedStation, GraphStation, RawStation } from "../types/metro";

type Labelable = Pick<RawStation, "name" | "translations"> | null | undefined;

export function stationLabel(station: Labelable): string {
  return station?.translations?.fa || station?.name || "";
}

export function stationLongitude(
  station: Pick<RawStation, "longtitude"> & { longitude?: number }
): number | undefined {
  return station.longtitude ?? station.longitude;
}

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function findNearestStation(
  stations: Array<EnrichedStation | GraphStation>,
  latitude: number,
  longitude: number
): { station: EnrichedStation | GraphStation; km: number } | null {
  let best: EnrichedStation | GraphStation | null = null;
  let bestKm = Infinity;

  for (const station of stations) {
    const lon = stationLongitude(station);
    if (station.latitude == null || lon == null) continue;
    const km = haversineKm(latitude, longitude, station.latitude, lon);
    if (km < bestKm) {
      bestKm = km;
      best = station;
    }
  }

  return best ? { station: best, km: bestKm } : null;
}

export function geoErrorMessage(error: GeolocationPositionError | null): string {
  if (!error) return "موقعیت شما پیدا نشد.";
  if (error.code === 1)
    return "دسترسی به موقعیت رد شد. مبدا را دستی انتخاب کنید.";
  if (error.code === 2)
    return "موقعیت در دسترس نیست. مبدا را دستی انتخاب کنید.";
  if (error.code === 3)
    return "دریافت موقعیت طول کشید. دوباره تلاش کنید یا دستی انتخاب کنید.";
  return "موقعیت شما پیدا نشد. مبدا را دستی انتخاب کنید.";
}
