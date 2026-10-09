import { getDescriptionValue, parseKml } from './kml.js';
import { RoutePlayer } from './route-player.js';

const elements = {
  routeList: document.querySelector('#routeList'),
  routeCount: document.querySelector('#routeCount'),
  selectedRouteName: document.querySelector('#selectedRouteName'),
  segmentCount: document.querySelector('#segmentCount'),
  distance: document.querySelector('#distance'),
  duration: document.querySelector('#duration'),
  averageSpeed: document.querySelector('#averageSpeed'),
  elevation: document.querySelector('#elevation'),
  playButton: document.querySelector('#playBtn'),
  resetButton: document.querySelector('#resetBtn'),
  progress: document.querySelector('#progress'),
  progressText: document.querySelector('#progressText'),
  speedText: document.querySelector('#speedText'),
  mapBadge: document.querySelector('#mapBadge'),
};

function initializeMap() {
  const map = L.map('map').setView([24.8, 121.2], 9);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  return map;
}

function formatDuration(value) {
  const hours = Number(value.match(/(\d+)\s*小時/)?.[1] || 0);
  const minutes = Number(value.match(/(\d+)\s*分/)?.[1] || 0);
  if (hours && minutes) return `${hours} 小時 ${minutes} 分`;
  if (hours) return `${hours} 小時`;
  if (minutes) return `${minutes} 分`;
  return value;
}

function updateRouteDetails(route) {
  const lowest = getDescriptionValue(route.description, '海拔高度最低');
  const highest = getDescriptionValue(route.description, '海拔高度最高');
  const elevation = lowest !== '—' && highest !== '—'
    ? `${lowest.replace(/\s*公尺$/, '')}–${highest.replace(/\s*公尺$/, '')} m`
    : '—';

  elements.selectedRouteName.textContent = route.name;
  elements.segmentCount.textContent = route.segments.length > 1 ? `${route.segments.length} 段` : '';
  elements.distance.textContent = getDescriptionValue(route.description, '距離');
  elements.duration.textContent = formatDuration(getDescriptionValue(route.description, '持續時間'));
  elements.averageSpeed.textContent = getDescriptionValue(route.description, '平均速度');
  elements.elevation.textContent = elevation;
  elements.mapBadge.textContent = `${elements.routeCount.textContent} · ${route.segments.length} 段軌跡`;
}

function renderRouteList(routes, selectRoute) {
  elements.routeCount.textContent = `${routes.length} 條`;
  const fragment = document.createDocumentFragment();

  routes.forEach((route, index) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'route-item';
    button.dataset.routeIndex = String(index);
    button.setAttribute('aria-pressed', 'false');

    const number = document.createElement('span');
    number.className = 'route-number';
    number.textContent = String(index + 1).padStart(2, '0');
    const name = document.createElement('span');
    name.className = 'route-name';
    name.textContent = route.name;
    button.append(number, name);
    button.addEventListener('click', () => selectRoute(index));
    item.append(button);
    fragment.append(item);
  });

  elements.routeList.replaceChildren(fragment);
}

function setPlaybackButton(isPlaying) {
  elements.playButton.textContent = isPlaying ? '❚❚　暫停' : '▶　播放軌跡';
}

async function start() {
  const map = initializeMap();
  const player = new RoutePlayer(map, (progress) => {
    elements.progress.value = Math.round(progress * 1000);
    elements.progressText.textContent = `${Math.round(progress * 100)}%`;
  }, setPlaybackButton);

  try {
    const response = await fetch('./data/routes.kml');
    if (!response.ok) throw new Error(`無法載入 KML（HTTP ${response.status}）。`);
    const routes = parseKml(await response.text());
    if (!routes.length) throw new Error('KML 中找不到可播放的路線。');

    const selectRoute = (index) => {
      const route = routes[index];
      player.setRoute(route);
      updateRouteDetails(route);
      elements.progress.value = '0';
      elements.progressText.textContent = '0%';
      elements.routeList.querySelectorAll('.route-item').forEach((button) => {
        const isSelected = Number(button.dataset.routeIndex) === index;
        button.classList.toggle('selected', isSelected);
        button.setAttribute('aria-pressed', String(isSelected));
      });
    };

    renderRouteList(routes, selectRoute);
    elements.playButton.addEventListener('click', () => {
      if (player.isPlaying) player.pause();
      else player.play();
    });
    elements.resetButton.addEventListener('click', () => player.reset());
    elements.progress.addEventListener('input', (event) => {
      player.pause();
      player.seek(Number(event.target.value) / 1000);
    });
    document.querySelectorAll('.speed').forEach((button) => {
      button.addEventListener('click', () => {
        player.setSpeed(Number(button.dataset.speed));
        elements.speedText.textContent = `${button.dataset.speed}×`;
        document.querySelectorAll('.speed').forEach((item) => {
          item.classList.toggle('active', item === button);
        });
      });
    });

    selectRoute(0);
  } catch (error) {
    elements.mapBadge.textContent = '載入失敗';
    const message = document.createElement('li');
    message.className = 'route-empty';
    message.textContent = `${error.message} 請透過本機伺服器開啟。`;
    elements.routeList.replaceChildren(message);
    console.error(error);
  }
}

start();
