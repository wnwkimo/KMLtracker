const EARTH_RADIUS = 6371000;
const toRadians = (degrees) => degrees * Math.PI / 180;

export function distanceBetween(start, end) {
  const latitudeDelta = toRadians(end.lat - start.lat);
  const longitudeDelta = toRadians(end.lng - start.lng);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(start.lat)) * Math.cos(toRadians(end.lat)) * Math.sin(longitudeDelta / 2) ** 2;
  return EARTH_RADIUS * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

/** Compass bearing in degrees (0 = north, clockwise). */
export function bearingBetween(start, end) {
  const latitude1 = toRadians(start.lat);
  const latitude2 = toRadians(end.lat);
  const longitudeDelta = toRadians(end.lng - start.lng);
  const y = Math.sin(longitudeDelta) * Math.cos(latitude2);
  const x = Math.cos(latitude1) * Math.sin(latitude2)
    - Math.sin(latitude1) * Math.cos(latitude2) * Math.cos(longitudeDelta);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

/** Fill gaps in altitude data from the nearest known neighbour so sampling never returns holes. */
function fillAltitudes(points) {
  let last = null;
  points.forEach((point) => {
    if (point.altitude === null) point.altitude = last;
    else last = point.altitude;
  });
  let next = null;
  for (let index = points.length - 1; index >= 0; index -= 1) {
    if (points[index].altitude === null) points[index].altitude = next;
    else next = points[index].altitude;
  }
}

/**
 * Flatten a route's segments into one distance-indexed point list.
 * Gaps between segments add no distance, so playback jumps across them.
 */
export function buildTrack(segments) {
  const points = [];
  const ranges = [];
  let totalDistance = 0;

  segments.forEach((segment) => {
    const start = points.length;
    segment.forEach((point, index) => {
      if (index > 0) totalDistance += distanceBetween(segment[index - 1], point);
      points.push({ lat: point.lat, lng: point.lng, altitude: point.altitude, distance: totalDistance });
    });
    ranges.push({ start, end: points.length - 1 });
  });

  const hasAltitude = points.some((point) => point.altitude !== null);
  if (hasAltitude) fillAltitudes(points);
  const altitudes = hasAltitude ? points.map((point) => point.altitude) : [];

  return {
    points,
    ranges,
    totalDistance,
    hasAltitude,
    minAltitude: hasAltitude ? Math.min(...altitudes) : null,
    maxAltitude: hasAltitude ? Math.max(...altitudes) : null,
  };
}

/** Interpolated position at a distance (metres) along the track. */
export function sampleTrack(track, distance) {
  const { points } = track;
  const target = Math.max(0, Math.min(track.totalDistance, distance));
  let low = 0;
  let high = points.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (points[middle].distance <= target) low = middle;
    else high = middle - 1;
  }

  const start = points[low];
  const end = points[low + 1];
  if (!end || end.distance === start.distance) {
    return { lat: start.lat, lng: start.lng, altitude: start.altitude, index: low };
  }
  const ratio = (target - start.distance) / (end.distance - start.distance);
  return {
    lat: start.lat + (end.lat - start.lat) * ratio,
    lng: start.lng + (end.lng - start.lng) * ratio,
    altitude: start.altitude === null ? null : start.altitude + (end.altitude - start.altitude) * ratio,
    index: low,
  };
}

/** Direction of travel, measured over a short window to smooth out GPS jitter. */
export function headingAt(track, distance, window = 25) {
  const behind = sampleTrack(track, distance - window);
  const ahead = sampleTrack(track, distance + window);
  if (behind.lat === ahead.lat && behind.lng === ahead.lng) return null;
  return bearingBetween(behind, ahead);
}

/** Grade in percent over a window centred on the distance. */
export function gradeAt(track, distance, window = 100) {
  if (!track.hasAltitude) return null;
  const from = Math.max(0, distance - window / 2);
  const to = Math.min(track.totalDistance, distance + window / 2);
  if (to - from < 50) return null;
  return (sampleTrack(track, to).altitude - sampleTrack(track, from).altitude) / (to - from) * 100;
}
