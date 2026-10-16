import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fetchRoutesKml, MAP_ID, REFRESH_MINUTES, ROOT, ROUTES_FILE, saveRoutesKml } from './my-maps.mjs';

const PORT = Number(process.env.PORT ?? 8000);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.kml': 'application/vnd.google-earth.kml+xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

let lastSync = 0;
let syncing = null;
let lastStatus = { source: 'local', syncedAt: null, error: null };

/** Refresh data/routes.kml from My Maps at most once per REFRESH_MINUTES; fall back to the local copy. */
async function refreshRoutes() {
  if (!MAP_ID) return lastStatus;
  if (Date.now() - lastSync < REFRESH_MINUTES * 60_000) return lastStatus;
  syncing ??= (async () => {
    try {
      const { kml, count } = await fetchRoutesKml({ timeoutMs: 8000 });
      await saveRoutesKml(kml);
      lastStatus = { source: 'my-maps', syncedAt: new Date().toISOString(), error: null };
      console.log(`[sync] 我的地圖 → ${count} 條路線`);
    } catch (error) {
      lastStatus = { ...lastStatus, source: 'local', error: error.message };
      console.warn(`[sync] 失敗，改用本機資料：${error.message}`);
    } finally {
      lastSync = Date.now();
      syncing = null;
    }
    return lastStatus;
  })();
  return syncing;
}

function send(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end(body);
}

const server = createServer(async (request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    return send(response, 400, 'Bad request');
  }
  let path = normalize(join(ROOT, pathname));
  // Stay inside the project and never serve dotfiles such as .git.
  if (!path.startsWith(ROOT)) return send(response, 403, 'Forbidden');
  if (pathname.split('/').some((part) => part.startsWith('.'))) return send(response, 404, 'Not found');

  const headers = {};
  if (pathname === '/data/routes.kml') {
    const status = await refreshRoutes();
    path = ROUTES_FILE;
    Object.assign(headers, {
      'Cache-Control': 'no-store',
      'X-Routes-Source': status.source,
      ...(status.syncedAt && { 'X-Routes-Synced-At': status.syncedAt }),
    });
  }

  try {
    let info = await stat(path);
    if (info.isDirectory()) {
      path = join(path, 'index.html');
      info = await stat(path);
    }
    response.writeHead(200, {
      'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream',
      'Content-Length': info.size,
      ...headers,
    });
    if (request.method === 'HEAD') return response.end();
    createReadStream(path).pipe(response);
  } catch {
    send(response, 404, 'Not found');
  }
});

server.listen(PORT, () => {
  console.log(`軌跡播放器：http://localhost:${PORT}`);
  console.log(MAP_ID
    ? `路線會從我的地圖自動同步（最多每 ${REFRESH_MINUTES} 分鐘一次）`
    : '未設定 myMaps.mapId，只使用本機 data/routes.kml');
});
