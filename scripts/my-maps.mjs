import { readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const ROUTES_FILE = process.env.ROUTES_FILE ?? fileURLToPath(new URL('../data/routes.kml', import.meta.url));

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
export const MAP_ID = process.env.MY_MAPS_ID ?? packageJson.myMaps?.mapId;
export const REFRESH_MINUTES = Number(process.env.MY_MAPS_REFRESH_MINUTES ?? packageJson.myMaps?.refreshMinutes ?? 5);

const escapeXml = (text) => text.replace(/[<>&]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[char]);

/**
 * Download the map's KML and keep only placemarks that contain lines.
 * Point layers (places, restaurants, hotels) are left out so they never end up in the project.
 */
export async function fetchRoutesKml({ timeoutMs = 15000 } = {}) {
  if (!MAP_ID) throw new Error('package.json 尚未設定 myMaps.mapId');
  const url = `https://www.google.com/maps/d/kml?mid=${encodeURIComponent(MAP_ID)}&forcekml=1`;
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`我的地圖回應 HTTP ${response.status}（地圖需設為「知道連結的使用者皆可檢視」）`);

  const text = await response.text();
  if (!/<kml[\s>]/.test(text)) throw new Error('我的地圖回傳的不是 KML（可能需要登入，請確認分享設定）');

  const routes = (text.match(/<Placemark[\s>][\s\S]*?<\/Placemark>/g) ?? [])
    .filter((placemark) => placemark.includes('<LineString'));
  // Refuse to replace good data with nothing, e.g. if the routes layer was renamed or emptied by mistake.
  if (!routes.length) throw new Error('我的地圖中找不到任何路線（LineString）');

  const title = text.match(/<Document>\s*<name>([^<]*)<\/name>/)?.[1] ?? 'My Maps';
  const kml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<kml xmlns="http://www.opengis.net/kml/2.2">',
    '  <Document>',
    `    <name>${title}</name>`,
    `    <description>${escapeXml(`同步自 Google 我的地圖 ${new Date().toISOString()}`)}</description>`,
    ...routes.map((placemark) => `    ${placemark}`),
    '  </Document>',
    '</kml>',
    '',
  ].join('\n');
  return { kml, count: routes.length };
}

/** Write via a temp file so a reader never sees a half-written KML. */
export async function saveRoutesKml(kml) {
  const temporary = `${ROUTES_FILE}.tmp`;
  await writeFile(temporary, kml, 'utf8');
  await rename(temporary, ROUTES_FILE);
}
