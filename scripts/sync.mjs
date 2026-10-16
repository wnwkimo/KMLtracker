import { relative } from 'node:path';
import { fetchRoutesKml, ROOT, ROUTES_FILE, saveRoutesKml } from './my-maps.mjs';

try {
  const { kml, count } = await fetchRoutesKml();
  await saveRoutesKml(kml);
  console.log(`已從我的地圖同步 ${count} 條路線 → ${relative(ROOT, ROUTES_FILE)}`);
} catch (error) {
  console.error(`同步失敗：${error.message}`);
  process.exitCode = 1;
}
