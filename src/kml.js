const KML_NAMESPACE = 'http://www.opengis.net/kml/2.2';

/** Parse a KML document into named routes with separate line segments. */
export function parseKml(kmlText) {
  const document = new DOMParser().parseFromString(kmlText, 'application/xml');
  if (document.querySelector('parsererror')) {
    throw new Error('KML 檔案格式無法解析。');
  }

  return [...document.getElementsByTagNameNS(KML_NAMESPACE, 'Placemark')]
    .map((placemark, index) => {
      const name = placemark.getElementsByTagNameNS(KML_NAMESPACE, 'name')[0]
        ?.textContent.trim() || `路線 ${index + 1}`;
      const description = placemark.getElementsByTagNameNS(KML_NAMESPACE, 'description')[0]
        ?.textContent || '';
      const segments = [...placemark.getElementsByTagNameNS(KML_NAMESPACE, 'LineString')]
        .map((line) => {
          const coordinates = line.getElementsByTagNameNS(KML_NAMESPACE, 'coordinates')[0]
            ?.textContent.trim() || '';
          return coordinates.split(/\s+/).filter(Boolean).map((coordinate) => {
            const [longitude, latitude, altitude] = coordinate.split(',').map(Number);
            return {
              lat: latitude,
              lng: longitude,
              altitude: Number.isFinite(altitude) ? altitude : null,
            };
          }).filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
        }).filter((segment) => segment.length > 0);

      return { name, description, segments };
    })
    .filter((route) => route.segments.length > 0);
}

export function getDescriptionValue(description, label) {
  const value = description.match(new RegExp(`${label}：([^<]+)`))?.[1];
  return value?.trim() || '—';
}
