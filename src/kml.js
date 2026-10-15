const KML_NAMESPACE = 'http://www.opengis.net/kml/2.2';
const RIDE_PATTERN = /自行車|單車|腳踏車|騎|bike|cycl|ride/i;
const NAME_DATE_PATTERN = /^\s*(\d{3,4})-(\d{1,2})-(\d{1,2})\s*/;

function firstText(element, tag) {
  return element.getElementsByTagNameNS(KML_NAMESPACE, tag)[0]?.textContent.trim() || '';
}

function parseCoordinates(text) {
  return text.split(/\s+/).filter(Boolean).map((coordinate) => {
    const [lng, lat, altitude] = coordinate.split(',').map(Number);
    return { lat, lng, altitude: Number.isFinite(altitude) ? altitude : null };
  }).filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

function parseDurationSeconds(value) {
  if (!value) return null;
  const hours = Number(value.match(/(\d+)\s*小時/)?.[1] || 0);
  const minutes = Number(value.match(/(\d+)\s*分/)?.[1] || 0);
  const seconds = Number(value.match(/(\d+)\s*秒/)?.[1] || 0);
  const total = hours * 3600 + minutes * 60 + seconds;
  return total || null;
}

/** Read the "label：value" statistics that Google My Maps / Fit writes into descriptions. */
function parseDescription(description) {
  const text = description.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
  const field = (label) => text.match(new RegExp(`${label}\\s*[：:]\\s*([^\\n]+)`))?.[1]?.trim() ?? null;
  const number = (label) => {
    const value = Number.parseFloat(field(label)?.replace(/,/g, '') ?? '');
    return Number.isFinite(value) ? value : null;
  };

  let distanceKm = number('距離');
  if (distanceKm !== null && /公尺|\dm$|\sm$/.test(field('距離'))) distanceKm /= 1000;

  let date = null;
  const day = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (day) {
    const time = text.match(/(上午|下午)\s*(\d{1,2}):(\d{2})/);
    let hour = time ? Number(time[2]) % 12 : 0;
    if (time?.[1] === '下午') hour += 12;
    date = new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]), hour, time ? Number(time[3]) : 0);
  }

  return {
    date,
    hasTime: Boolean(day && /(上午|下午)\s*\d/.test(text)),
    distanceKm,
    durationSeconds: parseDurationSeconds(field('持續時間')),
    averageSpeed: number('平均速度'),
    minAltitude: number('海拔高度最低'),
    maxAltitude: number('海拔高度最高'),
    ascent: number('總上升'),
    descent: number('總下降'),
  };
}

function dateFromName(name) {
  const match = name.match(NAME_DATE_PATTERN);
  if (!match || match[1].length !== 4) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** Parse a KML document into routes with separate line segments and summary statistics. */
export function parseKml(kmlText) {
  const document = new DOMParser().parseFromString(kmlText, 'application/xml');
  if (document.querySelector('parsererror')) {
    throw new Error('KML 檔案格式無法解析。');
  }

  return [...document.getElementsByTagNameNS(KML_NAMESPACE, 'Placemark')]
    .map((placemark, index) => {
      const name = firstText(placemark, 'name') || `路線 ${index + 1}`;
      const description = placemark.getElementsByTagNameNS(KML_NAMESPACE, 'description')[0]?.textContent || '';
      const segments = [...placemark.getElementsByTagNameNS(KML_NAMESPACE, 'LineString')]
        .map((line) => parseCoordinates(firstText(line, 'coordinates')))
        .filter((segment) => segment.length > 1);
      const stats = parseDescription(description);

      return {
        id: index,
        name,
        title: name.replace(NAME_DATE_PATTERN, '').trim() || name,
        type: RIDE_PATTERN.test(name) ? 'ride' : 'hike',
        date: stats.date ?? dateFromName(name),
        description,
        segments,
        stats,
      };
    })
    .filter((route) => route.segments.length > 0)
    .map((route, index) => ({ ...route, id: index }));
}
