import { sampleTrack } from './track.js';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const PADDING = { top: 10, bottom: 18 };

function svgElement(name, attributes = {}, text = '') {
  const element = document.createElementNS(SVG_NAMESPACE, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  if (text) element.textContent = text;
  return element;
}

function smooth(values, radius = 2) {
  return values.map((_, index) => {
    let sum = 0;
    let count = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const value = values[index + offset];
      if (value !== undefined) {
        sum += value;
        count += 1;
      }
    }
    return sum / count;
  });
}

function formatKm(metres) {
  const km = metres / 1000;
  return km >= 10 ? km.toFixed(0) : km.toFixed(1);
}

/** Elevation profile that doubles as the playback scrubber. */
export class ElevationChart {
  constructor(root, { onSeek = () => {}, onHover = () => {} } = {}) {
    this.root = root;
    this.svg = root.querySelector('#profileSvg');
    this.parts = Object.fromEntries(
      ['Grid', 'Area', 'Line', 'AreaPlayed', 'LinePlayed', 'Hover', 'Cursor', 'Dot', 'Axis', 'ClipRect']
        .map((name) => [name, root.querySelector(`#profile${name}`)]),
    );
    this.tip = root.querySelector('#profileTip');
    this.onSeek = onSeek;
    this.onHover = onHover;
    this.track = null;
    this.progress = 0;
    this.width = 0;
    this.height = 0;
    this.dragging = false;

    new ResizeObserver(() => this.render()).observe(this.svg);
    this.bindPointer();
  }

  bindPointer() {
    const progressFor = (event) => {
      const rect = this.svg.getBoundingClientRect();
      return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    };

    this.svg.addEventListener('pointerdown', (event) => {
      if (!this.track) return;
      this.dragging = true;
      this.svg.setPointerCapture(event.pointerId);
      this.root.classList.add('dragging');
      this.onSeek(progressFor(event));
    });
    this.svg.addEventListener('pointermove', (event) => {
      if (!this.track) return;
      const progress = progressFor(event);
      if (this.dragging) this.onSeek(progress);
      this.showHover(progress);
    });
    const endDrag = () => {
      this.dragging = false;
      this.root.classList.remove('dragging');
    };
    this.svg.addEventListener('pointerup', endDrag);
    this.svg.addEventListener('pointercancel', endDrag);
    this.svg.addEventListener('pointerleave', () => {
      if (!this.dragging) this.showHover(null);
    });
  }

  setTrack(track) {
    this.track = track;
    this.progress = 0;
    this.showHover(null);
    this.render();
  }

  yFor(altitude) {
    const plotHeight = this.height - PADDING.top - PADDING.bottom;
    if (altitude === null || this.range === null) return PADDING.top + plotHeight / 2;
    return PADDING.top + (1 - (altitude - this.range.min) / (this.range.max - this.range.min)) * plotHeight;
  }

  render() {
    const { width, height } = this.svg.getBoundingClientRect();
    if (!width || !height || !this.track) return;
    this.width = width;
    this.height = height;
    this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    const { track } = this;
    const sampleCount = Math.max(2, Math.round(width / 2));
    const altitudes = track.hasAltitude
      ? smooth(Array.from({ length: sampleCount }, (_, index) => (
        sampleTrack(track, index / (sampleCount - 1) * track.totalDistance).altitude)))
      : [];

    if (track.hasAltitude) {
      // Keep flat routes from looking dramatic: show at least a 40 m band.
      const span = Math.max(40, track.maxAltitude - track.minAltitude);
      const middle = (track.maxAltitude + track.minAltitude) / 2;
      this.range = { min: middle - span / 2 - span * 0.08, max: middle + span / 2 + span * 0.08 };
    } else {
      this.range = null;
    }

    const coordinates = track.hasAltitude
      ? altitudes.map((altitude, index) => [index / (sampleCount - 1) * width, this.yFor(altitude)])
      : [[0, this.yFor(null)], [width, this.yFor(null)]];
    const line = coordinates.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
    const floor = height - PADDING.bottom;
    const area = `${line}L${width},${floor}L0,${floor}Z`;

    this.parts.Line.setAttribute('d', line);
    this.parts.LinePlayed.setAttribute('d', line);
    this.parts.Area.setAttribute('d', area);
    this.parts.AreaPlayed.setAttribute('d', area);
    this.renderAxes(floor);
    this.setProgress(this.progress);
  }

  renderAxes(floor) {
    const { Grid, Axis } = this.parts;
    Grid.replaceChildren();
    Axis.replaceChildren();
    Grid.append(svgElement('line', { x1: 0, x2: this.width, y1: floor, y2: floor, class: 'profile-floor' }));

    if (this.track.hasAltitude) {
      [this.track.maxAltitude, this.track.minAltitude].forEach((altitude) => {
        const y = this.yFor(altitude);
        Grid.append(svgElement('line', { x1: 0, x2: this.width, y1: y, y2: y }));
        Axis.append(svgElement('text', { x: 4, y: y - 4, class: 'profile-label' }, `${Math.round(altitude)} m`));
      });
    } else {
      Axis.append(svgElement('text', { x: 4, y: PADDING.top + 10, class: 'profile-label' }, '無高度資料'));
    }

    const ticks = this.width > 520 ? 5 : 3;
    for (let index = 0; index < ticks; index += 1) {
      const fraction = index / (ticks - 1);
      const anchor = index === 0 ? 'start' : index === ticks - 1 ? 'end' : 'middle';
      Axis.append(svgElement('text', {
        x: fraction * this.width, y: this.height - 4, 'text-anchor': anchor, class: 'profile-tick',
      }, `${formatKm(fraction * this.track.totalDistance)}${index === ticks - 1 ? ' km' : ''}`));
    }
  }

  setProgress(progress) {
    this.progress = progress;
    if (!this.width || !this.track) return;
    const x = progress * this.width;
    const altitude = sampleTrack(this.track, progress * this.track.totalDistance).altitude;
    this.parts.ClipRect.setAttribute('width', Math.max(0, x));
    this.parts.Cursor.setAttribute('x1', x);
    this.parts.Cursor.setAttribute('x2', x);
    this.parts.Dot.setAttribute('cx', x);
    this.parts.Dot.setAttribute('cy', this.yFor(altitude));
    this.svg.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
  }

  showHover(progress) {
    if (progress === null || !this.track) {
      this.root.classList.remove('hovering');
      this.tip.hidden = true;
      this.onHover(null);
      return;
    }
    const x = progress * this.width;
    const distance = progress * this.track.totalDistance;
    const { altitude } = sampleTrack(this.track, distance);
    this.parts.Hover.setAttribute('x1', x);
    this.parts.Hover.setAttribute('x2', x);
    this.root.classList.add('hovering');

    this.tip.hidden = false;
    this.tip.innerHTML = `<b>${(distance / 1000).toFixed(2)} km</b>${altitude === null ? '' : `<span>${Math.round(altitude)} m</span>`}`;
    const tipWidth = this.tip.offsetWidth;
    this.tip.style.left = `${Math.max(0, Math.min(this.width - tipWidth, x - tipWidth / 2))}px`;
    this.onHover(progress);
  }
}
