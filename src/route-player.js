const ROUTE_STYLE = { color: '#b7c8bc', weight: 4, opacity: 0.85 };
const PLAYED_STYLE = {
  color: '#18834f', weight: 5, opacity: 0.95, lineCap: 'round', lineJoin: 'round',
};

export class RoutePlayer {
  constructor(map, onProgress = () => {}, onPlaybackChange = () => {}) {
    this.map = map;
    this.onProgress = onProgress;
    this.onPlaybackChange = onPlaybackChange;
    this.routeLayers = [];
    this.playedLine = null;
    this.marker = null;
    this.route = null;
    this.segments = [];
    this.totalDistance = 0;
    this.currentDistance = 0;
    this.speed = 1;
    this.isPlaying = false;
    this.animationFrame = null;
    this.previousFrameTime = 0;
    this.markerIcon = L.divIcon({
      className: '',
      html: '<div class="dot"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
  }

  setRoute(route) {
    this.pause();
    this.clearLayers();
    this.route = route;
    this.currentDistance = 0;
    this.totalDistance = 0;
    const bounds = [];

    this.segments = route.segments.map((segment) => {
      const segmentStartDistance = this.totalDistance;
      const points = segment.map((point) => ({ ...point, distance: 0 }));
      points[0].distance = segmentStartDistance;
      for (let index = 1; index < points.length; index += 1) {
        this.totalDistance += this.map.distance(
          [points[index - 1].lat, points[index - 1].lng],
          [points[index].lat, points[index].lng],
        );
        points[index].distance = this.totalDistance;
      }
      const latLngs = points.map(({ lat, lng }) => [lat, lng]);
      bounds.push(...latLngs);
      this.routeLayers.push(L.polyline(latLngs, ROUTE_STYLE).addTo(this.map));
      return { points, startDistance: points[0].distance, endDistance: points.at(-1).distance };
    });

    this.playedLine = L.polyline([], PLAYED_STYLE).addTo(this.map);
    const firstPoint = this.segments[0]?.points[0];
    if (firstPoint) this.marker = L.marker([firstPoint.lat, firstPoint.lng], { icon: this.markerIcon }).addTo(this.map);
    if (bounds.length) this.map.fitBounds(L.latLngBounds(bounds).pad(0.12));
    this.seek(0);
  }

  clearLayers() {
    this.routeLayers.forEach((layer) => this.map.removeLayer(layer));
    this.routeLayers = [];
    if (this.playedLine) this.map.removeLayer(this.playedLine);
    if (this.marker) this.map.removeLayer(this.marker);
    this.playedLine = null;
    this.marker = null;
  }

  setSpeed(speed) {
    this.speed = speed;
  }

  seek(progress) {
    this.currentDistance = Math.max(0, Math.min(1, progress)) * this.totalDistance;
    const playedSegments = [];
    let currentPoint = this.segments[0]?.points[0] || null;

    for (const segment of this.segments) {
      const { points, startDistance, endDistance } = segment;
      if (this.currentDistance < startDistance) break;
      const line = [[points[0].lat, points[0].lng]];
      currentPoint = points[0];

      for (let index = 1; index < points.length; index += 1) {
        const start = points[index - 1];
        const end = points[index];
        if (end.distance <= this.currentDistance) {
          line.push([end.lat, end.lng]);
          currentPoint = end;
          continue;
        }

        const segmentDistance = end.distance - start.distance;
        const ratio = segmentDistance
          ? (this.currentDistance - start.distance) / segmentDistance
          : 0;
        currentPoint = {
          lat: start.lat + (end.lat - start.lat) * ratio,
          lng: start.lng + (end.lng - start.lng) * ratio,
        };
        line.push([currentPoint.lat, currentPoint.lng]);
        playedSegments.push(line);
        this.render(playedSegments, currentPoint);
        this.onProgress(this.totalDistance ? this.currentDistance / this.totalDistance : 0);
        return;
      }

      playedSegments.push(line);
      if (this.currentDistance <= endDistance) break;
    }

    this.render(playedSegments, currentPoint);
    this.onProgress(this.totalDistance ? this.currentDistance / this.totalDistance : 0);
  }

  render(lines, point) {
    this.playedLine?.setLatLngs(lines);
    if (point && this.marker) this.marker.setLatLng([point.lat, point.lng]);
  }

  play() {
    if (this.isPlaying || !this.route) return;
    if (this.currentDistance >= this.totalDistance) this.seek(0);
    this.isPlaying = true;
    this.previousFrameTime = 0;
    this.onPlaybackChange(true);
    this.animationFrame = requestAnimationFrame(this.animate);
  }

  pause = () => {
    this.isPlaying = false;
    cancelAnimationFrame(this.animationFrame);
    this.onPlaybackChange(false);
  };

  reset() {
    this.pause();
    this.seek(0);
  }

  animate = (time) => {
    if (!this.isPlaying) return;
    if (!this.previousFrameTime) this.previousFrameTime = time;
    const elapsed = Math.min(100, time - this.previousFrameTime);
    this.previousFrameTime = time;
    const duration = Math.max(12000, this.route.segments.flat().length * 36);
    const nextDistance = this.currentDistance + this.totalDistance * elapsed / duration * this.speed;

    if (nextDistance >= this.totalDistance) {
      this.seek(1);
      this.pause();
      return;
    }
    this.seek(this.totalDistance ? nextDistance / this.totalDistance : 1);
    this.animationFrame = requestAnimationFrame(this.animate);
  };
}
