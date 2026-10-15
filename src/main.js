import { parseKml } from './kml.js';
import { RoutePlayer } from './route-player.js';
import { ElevationChart } from './elevation-chart.js';
import { buildTrack, gradeAt } from './track.js';

const $ = (selector) => document.querySelector(selector);
const SPEEDS = [0.5, 1, 2, 4, 8];
const SKIP_FRACTION = 0.05;
const TYPE_LABELS = { ride: '自行車', hike: '健行' };
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

const BASEMAPS = {
  dark: {
    label: '暗色',
    tone: 'dark',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    labels: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
    options: { maxNativeZoom: 16, maxZoom: 19, attribution: 'Tiles &copy; Esri' },
  },
  streets: {
    label: '街道',
    tone: 'light',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' },
  },
  terrain: {
    label: '地形',
    tone: 'light',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    options: { subdomains: 'abc', maxNativeZoom: 17, maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://opentopomap.org">OpenTopoMap</a>' },
  },
  satellite: {
    label: '衛星',
    tone: 'dark',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    options: { maxZoom: 19, attribution: 'Imagery &copy; Esri' },
  },
};

const elements = {
  libraryStats: $('#libraryStats'),
  search: $('#search'),
  routeList: $('#routeList'),
  routeCard: $('#routeCard'),
  routeType: $('#routeType'),
  routeTitle: $('#routeTitle'),
  routeMeta: $('#routeMeta'),
  statDistance: $('#statDistance'),
  statDuration: $('#statDuration'),
  statSpeed: $('#statSpeed'),
  statAscent: $('#statAscent'),
  statHighest: $('#statHighest'),
  basemaps: $('#basemaps'),
  basemapToggle: $('#basemapToggle'),
  basemapOptions: $('#basemapOptions'),
  followButton: $('#followBtn'),
  dock: $('#dock'),
  playButton: $('#playBtn'),
  playIcon: $('#playIcon'),
  liveDistance: $('#liveDistance'),
  liveTotal: $('#liveTotal'),
  liveTime: $('#liveTime'),
  liveAltitude: $('#liveAltitude'),
  liveGrade: $('#liveGrade'),
  loader: $('#loader'),
  loaderText: $('#loaderText'),
};

const storage = {
  get(key, fallback) {
    try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
  },
};

/* ---------- formatting ---------- */

const formatNumber = (value, digits = 0) => value.toLocaleString('zh-TW', {
  minimumFractionDigits: digits, maximumFractionDigits: digits,
});

function formatDate(date, withWeekday = false) {
  if (!date) return '日期不明';
  const text = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
  return withWeekday ? `${text} 週${WEEKDAYS[date.getDay()]}` : text;
}

function formatTimeOfDay(date) {
  const hours = date.getHours();
  return `${hours < 12 ? '上午' : '下午'} ${hours % 12 || 12}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatDuration(seconds) {
  if (!seconds) return '—';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours ? `${hours}h ${String(minutes).padStart(2, '0')}m` : `${minutes}m`;
}

function formatClock(seconds) {
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function routeDistanceKm(route) {
  return route.stats.distanceKm ?? route.track.totalDistance / 1000;
}

/* ---------- map ---------- */

function initializeMap() {
  const map = L.map('map', { zoomControl: false, zoomSnap: 0.25, wheelPxPerZoomLevel: 90 });
  map.attributionControl.setPrefix(false);
  map.setView([24.8, 121.2], 9);
  $('#zoomInBtn').addEventListener('click', () => map.zoomIn());
  $('#zoomOutBtn').addEventListener('click', () => map.zoomOut());
  return map;
}

function setupBasemaps(map, player) {
  let current = null;
  let layers = [];
  const buttons = Object.entries(BASEMAPS).map(([key, basemap]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.role = 'radio';
    button.dataset.basemap = key;
    button.textContent = basemap.label;
    button.addEventListener('click', () => apply(key));
    return button;
  });
  elements.basemapOptions.replaceChildren(...buttons);

  function apply(key) {
    if (key === current || !BASEMAPS[key]) return;
    const basemap = BASEMAPS[key];
    layers.forEach((layer) => map.removeLayer(layer));
    layers = [basemap.url, basemap.labels].filter(Boolean)
      .map((url) => L.tileLayer(url, basemap.options).addTo(map));
    current = key;
    document.documentElement.dataset.mapTone = basemap.tone;
    player.setTone(basemap.tone);
    buttons.forEach((button) => {
      const active = button.dataset.basemap === key;
      button.classList.toggle('active', active);
      button.setAttribute('aria-checked', String(active));
    });
    storage.set('kml-player:basemap', key);
    elements.basemaps.classList.remove('open');
  }

  elements.basemapToggle.addEventListener('click', () => {
    const open = elements.basemaps.classList.toggle('open');
    elements.basemapToggle.setAttribute('aria-expanded', String(open));
  });

  apply(storage.get('kml-player:basemap', 'dark'));
}

/** Keep fitted routes clear of the floating card and dock. */
function fitPadding() {
  const map = $('#map').getBoundingClientRect();
  const card = elements.routeCard.getBoundingClientRect();
  const dock = elements.dock.getBoundingClientRect();
  const floating = getComputedStyle(elements.dock).position === 'absolute';
  if (!floating) return { paddingTopLeft: [28, 28], paddingBottomRight: [28, 28] };
  return {
    paddingTopLeft: [48, Math.max(48, card.bottom - map.top + 28)],
    paddingBottomRight: [72, Math.max(48, map.bottom - dock.top + 28)],
  };
}

/* ---------- sidebar ---------- */

function routeIcon(type) {
  return `<svg aria-hidden="true"><use href="#i-${type}" /></svg>`;
}

function createRouteItem(route) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `route-item type-${route.type}`;
  button.dataset.routeId = String(route.id);

  const ascent = route.stats.ascent;
  button.innerHTML = `
    <span class="route-icon">${routeIcon(route.type)}</span>
    <span class="route-body">
      <span class="route-name"></span>
      <span class="route-sub">
        <span>${formatDate(route.date)}</span>
        <span>${formatNumber(routeDistanceKm(route), 1)} km</span>
        ${ascent ? `<span>↗ ${formatNumber(ascent)} m</span>` : ''}
      </span>
    </span>`;
  button.querySelector('.route-name').textContent = route.title;
  return button;
}

function renderLibraryStats(routes) {
  const totalKm = routes.reduce((sum, route) => sum + routeDistanceKm(route), 0);
  const totalAscent = routes.reduce((sum, route) => sum + (route.stats.ascent ?? 0), 0);
  elements.libraryStats.textContent = `${routes.length} 條軌跡 · ${formatNumber(totalKm)} km · ↗ ${formatNumber(totalAscent)} m`;

  const counts = { all: routes.length, ride: 0, hike: 0 };
  routes.forEach((route) => { counts[route.type] += 1; });
  document.querySelectorAll('[data-count]').forEach((element) => {
    element.textContent = counts[element.dataset.count];
  });
}

function renderRouteList(routes, { query, filter, selectedId }) {
  const normalized = query.trim().toLowerCase();
  const visible = routes
    .filter((route) => filter === 'all' || route.type === filter)
    .filter((route) => !normalized || route.name.toLowerCase().includes(normalized))
    .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));

  if (!visible.length) {
    const empty = document.createElement('p');
    empty.className = 'route-empty';
    empty.textContent = '沒有符合條件的路線';
    elements.routeList.replaceChildren(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  let currentYear = null;
  let group = null;
  visible.forEach((route) => {
    const year = route.date?.getFullYear() ?? '其他';
    if (year !== currentYear) {
      currentYear = year;
      const heading = document.createElement('h3');
      heading.className = 'route-year';
      heading.textContent = String(year);
      group = document.createElement('div');
      group.className = 'route-group';
      fragment.append(heading, group);
    }
    const item = createRouteItem(route);
    const selected = route.id === selectedId;
    item.classList.toggle('selected', selected);
    item.setAttribute('aria-current', selected ? 'true' : 'false');
    group.append(item);
  });
  elements.routeList.replaceChildren(fragment);
}

/* ---------- route card & live readouts ---------- */

function renderRouteCard(route, track) {
  const { stats } = route;
  elements.routeType.className = `type-badge type-${route.type}`;
  elements.routeType.innerHTML = routeIcon(route.type);
  elements.routeType.title = TYPE_LABELS[route.type];
  elements.routeTitle.textContent = route.title;
  const meta = [formatDate(route.date, true)];
  if (route.stats.hasTime && route.date) meta.push(formatTimeOfDay(route.date));
  meta.push(TYPE_LABELS[route.type]);
  if (route.segments.length > 1) meta.push(`${route.segments.length} 段`);
  elements.routeMeta.textContent = meta.join(' · ');

  const distanceKm = stats.distanceKm ?? track.totalDistance / 1000;
  const highest = stats.maxAltitude ?? track.maxAltitude;
  const speed = stats.averageSpeed ?? (stats.durationSeconds ? distanceKm / (stats.durationSeconds / 3600) : null);
  elements.statDistance.innerHTML = `${formatNumber(distanceKm, 1)}<small>km</small>`;
  elements.statDuration.textContent = formatDuration(stats.durationSeconds);
  elements.statSpeed.innerHTML = speed ? `${formatNumber(speed, 1)}<small>km/h</small>` : '—';
  elements.statAscent.innerHTML = stats.ascent !== null ? `${formatNumber(stats.ascent)}<small>m</small>` : '—';
  elements.statHighest.innerHTML = highest !== null ? `${formatNumber(Math.round(highest))}<small>m</small>` : '—';

  elements.liveTotal.textContent = ` / ${(track.totalDistance / 1000).toFixed(2)} km`;
  elements.routeCard.hidden = false;
  elements.dock.hidden = false;
}

function renderLive(route, { progress, distance, position, track }) {
  elements.liveDistance.textContent = (distance / 1000).toFixed(2);
  elements.liveTime.textContent = route.stats.durationSeconds
    ? formatClock(progress * route.stats.durationSeconds)
    : '—';
  elements.liveAltitude.textContent = position.altitude === null ? '—' : formatNumber(Math.round(position.altitude));

  const grade = gradeAt(track, distance);
  if (grade === null) {
    elements.liveGrade.textContent = '—';
    elements.liveGrade.dataset.trend = '';
  } else {
    const clamped = Math.max(-40, Math.min(40, grade));
    elements.liveGrade.textContent = `${clamped >= 0 ? '+' : '−'}${Math.abs(clamped).toFixed(1)}%`;
    elements.liveGrade.dataset.trend = Math.abs(clamped) < 1 ? 'flat' : clamped > 0 ? 'up' : 'down';
  }
}

/* ---------- app ---------- */

async function start() {
  const map = initializeMap();
  let routes = [];
  let currentRoute = null;
  const ui = { query: '', filter: 'all', selectedId: null };

  const chart = new ElevationChart($('#profile'), {
    onSeek: (progress) => player.seek(progress),
    onHover: (progress) => player.showGhost(progress),
  });

  const player = new RoutePlayer(map, {
    fitPadding,
    onFrame: (state) => {
      chart.setProgress(state.progress);
      if (currentRoute) renderLive(currentRoute, state);
    },
    onPlaybackChange: (playing) => {
      elements.playIcon.setAttribute('href', playing ? '#i-pause' : '#i-play');
      elements.playButton.setAttribute('aria-label', playing ? '暫停' : '播放');
      elements.playButton.title = playing ? '暫停 (Space)' : '播放 (Space)';
      document.body.classList.toggle('is-playing', playing);
    },
    onFollowChange: (follow) => {
      elements.followButton.classList.toggle('active', follow);
      elements.followButton.setAttribute('aria-pressed', String(follow));
    },
  });

  setupBasemaps(map, player);

  const setSpeed = (speed) => {
    player.setSpeed(speed);
    document.querySelectorAll('[data-speed]').forEach((button) => {
      const active = Number(button.dataset.speed) === speed;
      button.classList.toggle('active', active);
      button.setAttribute('aria-checked', String(active));
    });
  };
  setSpeed(1);

  const refreshList = () => renderRouteList(routes, ui);

  const selectRoute = (id, { animate = true, scroll = false } = {}) => {
    const route = routes.find((item) => item.id === id);
    if (!route) return;
    currentRoute = route;
    ui.selectedId = id;
    renderRouteCard(route, route.track);
    player.setRoute(route, { animate });
    chart.setTrack(player.track);
    elements.routeList.querySelectorAll('.route-item').forEach((item) => {
      const selected = Number(item.dataset.routeId) === id;
      item.classList.toggle('selected', selected);
      item.setAttribute('aria-current', selected ? 'true' : 'false');
      if (selected && scroll) item.scrollIntoView({ block: 'nearest' });
    });
    history.replaceState(null, '', `#route-${id + 1}`);
  };

  /* controls */
  elements.playButton.addEventListener('click', () => player.toggle());
  $('#restartBtn').addEventListener('click', () => player.restart());
  $('#backBtn').addEventListener('click', () => player.skip(-SKIP_FRACTION));
  $('#forwardBtn').addEventListener('click', () => player.skip(SKIP_FRACTION));
  $('#fitBtn').addEventListener('click', () => player.fit());
  elements.followButton.addEventListener('click', () => player.toggleFollow());
  document.querySelectorAll('[data-speed]').forEach((button) => {
    button.addEventListener('click', () => setSpeed(Number(button.dataset.speed)));
  });

  elements.search.addEventListener('input', () => {
    ui.query = elements.search.value;
    refreshList();
  });
  document.querySelectorAll('[data-filter]').forEach((chip) => {
    chip.addEventListener('click', () => {
      ui.filter = chip.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach((item) => {
        const active = item === chip;
        item.classList.toggle('active', active);
        item.setAttribute('aria-checked', String(active));
      });
      refreshList();
    });
  });
  elements.routeList.addEventListener('click', (event) => {
    const item = event.target.closest('.route-item');
    if (item) selectRoute(Number(item.dataset.routeId));
  });

  document.addEventListener('keydown', (event) => {
    if (!currentRoute || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target.closest('input, textarea, select')) {
      if (event.key === 'Escape') event.target.blur();
      return;
    }
    const speedIndex = SPEEDS.indexOf(player.speed);
    const actions = {
      ' ': () => player.toggle(),
      k: () => player.toggle(),
      ArrowLeft: () => player.skip(event.shiftKey ? -SKIP_FRACTION * 4 : -SKIP_FRACTION),
      ArrowRight: () => player.skip(event.shiftKey ? SKIP_FRACTION * 4 : SKIP_FRACTION),
      Home: () => player.restart(),
      End: () => player.seek(1),
      '[': () => setSpeed(SPEEDS[Math.max(0, speedIndex - 1)]),
      ']': () => setSpeed(SPEEDS[Math.min(SPEEDS.length - 1, speedIndex + 1)]),
      f: () => player.toggleFollow(),
      '/': () => elements.search.focus(),
    };
    const action = actions[event.key.length === 1 ? event.key.toLowerCase() : event.key];
    if (!action) return;
    event.preventDefault();
    if (event.target.closest('button') && event.key === ' ') event.target.blur();
    action();
  });

  /* data */
  try {
    const response = await fetch('./data/routes.kml');
    if (!response.ok) throw new Error(`無法載入 KML（HTTP ${response.status}）`);
    routes = parseKml(await response.text());
    if (!routes.length) throw new Error('KML 中找不到可播放的路線');

    routes.forEach((route) => { route.track = buildTrack(route.segments); });

    renderLibraryStats(routes);
    refreshList();

    const hashId = Number(location.hash.match(/^#route-(\d+)$/)?.[1]) - 1;
    const newest = [...routes].sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))[0];
    selectRoute(routes.some((route) => route.id === hashId) ? hashId : newest.id, { animate: false, scroll: true });
    elements.loader.hidden = true;
  } catch (error) {
    console.error(error);
    elements.loader.classList.add('error');
    elements.loaderText.textContent = location.protocol === 'file:'
      ? '請透過本機伺服器開啟（npm start），瀏覽器無法以 file:// 讀取 KML。'
      : `${error.message}`;
    elements.libraryStats.textContent = '載入失敗';
  }
}

start();
