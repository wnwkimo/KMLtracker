const ACCENT = '#ff7a33';
const TONES = {
  light: { casing: ['rgb(255 255 255 / 90%)', 8], base: ['rgb(86 97 107 / 75%)', 3.5] },
  dark: { casing: ['rgb(5 7 10 / 55%)', 8], base: ['rgb(214 221 227 / 55%)', 3.5] },
};
const HALO = ['rgb(255 122 51 / 22%)', 13];
const PLAYED = [ACCENT, 4.5];
const HIT_RADIUS = 14;

/**
 * Draws the route on a canvas from the map's live state on every move/zoom frame.
 * Leaflet's SVG renderer is CSS-scaled during zoom animations and only re-projected at the end,
 * so anything updated mid-animation drifts; redrawing from the current view keeps the route
 * glued to the tiles at every frame.
 */
export class TrackCanvas {
  constructor(map) {
    this.map = map;
    this.track = null;
    this.tone = TONES.dark;
    this.position = null;
    this.ghost = null;

    const pane = map.getPane('trackPane') ?? map.createPane('trackPane');
    pane.style.zIndex = 450;
    pane.style.pointerEvents = 'none';
    this.canvas = L.DomUtil.create('canvas', 'track-canvas', pane);
    this.context = this.canvas.getContext('2d');

    map.on('resize', this.resize, this);
    map.on('move zoom viewreset moveend zoomend', this.draw, this);
    this.resize();
  }

  setTrack(track) {
    this.track = track;
    // Web-Mercator pixels at zoom 0; any zoom is a uniform scale of these.
    this.projected = track.points.map(({ lat, lng }) => this.map.project([lat, lng], 0));
    this.position = null;
    this.ghost = null;
    this.draw();
  }

  setTone(tone) {
    this.tone = TONES[tone];
    this.draw();
  }

  /** `position` is a sampled track point: { lat, lng, index }. */
  setPosition(position) {
    this.position = position;
    this.draw();
  }

  setGhost(point) {
    this.ghost = point;
    this.draw();
  }

  resize() {
    const size = this.map.getSize();
    const ratio = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(size.x * ratio);
    this.canvas.height = Math.round(size.y * ratio);
    this.canvas.style.width = `${size.x}px`;
    this.canvas.style.height = `${size.y}px`;
    this.ratio = ratio;
    this.draw();
  }

  /** Maps zoom-0 projected points to container pixels for the current view. */
  transform() {
    const { map } = this;
    const anchor = this.track.points[0];
    const origin = map.latLngToContainerPoint([anchor.lat, anchor.lng]);
    const scale = map.getZoomScale(map.getZoom(), 0);
    const first = this.projected[0];
    return (point) => [origin.x + (point.x - first.x) * scale, origin.y + (point.y - first.y) * scale];
  }

  draw() {
    const { canvas, context, map } = this;
    L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));
    context.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!this.track) return;

    const toScreen = this.transform();
    const screen = this.projected.map(toScreen);
    this.lastOrigin = screen[0];

    const full = new Path2D();
    this.track.ranges.forEach(({ start, end }) => {
      full.moveTo(...screen[start]);
      for (let index = start + 1; index <= end; index += 1) full.lineTo(...screen[index]);
    });

    const played = new Path2D();
    if (this.position) {
      const current = toScreen(this.map.project([this.position.lat, this.position.lng], 0));
      this.lastPosition = current;
      for (const { start, end } of this.track.ranges) {
        if (this.position.index < start) break;
        played.moveTo(...screen[start]);
        const last = Math.min(end, this.position.index);
        for (let index = start + 1; index <= last; index += 1) played.lineTo(...screen[index]);
        if (this.position.index < end) {
          played.lineTo(...current);
          break;
        }
      }
    }

    context.lineCap = 'round';
    context.lineJoin = 'round';
    const stroke = (path, [color, width]) => {
      context.strokeStyle = color;
      context.lineWidth = width;
      context.stroke(path);
    };
    stroke(full, this.tone.casing);
    stroke(full, this.tone.base);
    stroke(played, HALO);
    stroke(played, PLAYED);

    if (this.ghost) {
      const [x, y] = toScreen(this.map.project([this.ghost.lat, this.ghost.lng], 0));
      context.beginPath();
      context.arc(x, y, 6, 0, Math.PI * 2);
      context.fillStyle = ACCENT;
      context.fill();
      context.lineWidth = 2.5;
      context.strokeStyle = '#fff';
      context.stroke();
    }
  }

  /** Track distance (metres) under a container point, or null when the point is off the line. */
  hitTest(containerPoint) {
    if (!this.track) return null;
    const screen = this.projected.map(this.transform());
    const { points } = this.track;
    let best = null;
    let bestDistance = HIT_RADIUS ** 2;
    for (const { start, end } of this.track.ranges) {
      for (let index = start; index < end; index += 1) {
        const [ax, ay] = screen[index];
        const [bx, by] = screen[index + 1];
        const length = (bx - ax) ** 2 + (by - ay) ** 2;
        const t = length
          ? Math.max(0, Math.min(1, ((containerPoint.x - ax) * (bx - ax) + (containerPoint.y - ay) * (by - ay)) / length))
          : 0;
        const distance = (ax + (bx - ax) * t - containerPoint.x) ** 2 + (ay + (by - ay) * t - containerPoint.y) ** 2;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = points[index].distance + (points[index + 1].distance - points[index].distance) * t;
        }
      }
    }
    return best;
  }
}
