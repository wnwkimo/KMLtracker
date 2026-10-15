import { buildTrack, headingAt, nearestDistance, sampleTrack } from './track.js';

const ACCENT = '#ff7a33';
const LINE = { lineCap: 'round', lineJoin: 'round', interactive: false };
const TONES = {
  light: { casing: { color: '#ffffff', weight: 8, opacity: 0.9 }, base: { color: '#56616b', weight: 3.5, opacity: 0.75 } },
  dark: { casing: { color: '#05070a', weight: 8, opacity: 0.55 }, base: { color: '#d6dde3', weight: 3.5, opacity: 0.55 } },
};
const HALO_STYLE = { ...LINE, color: ACCENT, weight: 13, opacity: 0.22 };
const PLAYED_STYLE = { ...LINE, color: ACCENT, weight: 4.5, opacity: 1 };

/** Playback length at 1× scales gently with route length so short and long routes both feel natural. */
function baseDurationFor(distance) {
  return Math.min(80000, Math.max(24000, 20000 + distance / 1000 * 1500));
}

function shortestAngle(from, to) {
  return ((to - from + 540) % 360) - 180;
}

export class RoutePlayer {
  constructor(map, { onFrame = () => {}, onPlaybackChange = () => {}, onFollowChange = () => {}, fitPadding } = {}) {
    this.map = map;
    this.onFrame = onFrame;
    this.onPlaybackChange = onPlaybackChange;
    this.onFollowChange = onFollowChange;
    this.fitPadding = fitPadding ?? (() => ({ paddingTopLeft: [40, 40], paddingBottomRight: [40, 40] }));
    this.track = null;
    this.layers = null;
    this.distance = 0;
    this.speed = 1;
    this.isPlaying = false;
    this.follow = false;
    this.tone = 'dark';
    this.heading = 0;
    this.frame = null;
    this.previousTime = 0;
    this.zooming = false;
    this.zoomAnimating = false;

    // While Leaflet animates a zoom, the vector overlay is CSS-scaled and only re-projected at
    // zoomend; paths updated mid-animation would be scaled twice and drift off the map.
    map.on('zoomstart', () => { this.zooming = true; });
    map.on('zoomanim', () => { this.zoomAnimating = true; });
    map.on('zoomend', () => {
      this.zooming = false;
      this.zoomAnimating = false;
      if (this.layers) this.render();
    });
    map.on('dragstart', () => this.setFollow(false));
  }

  get progress() {
    return this.track?.totalDistance ? this.distance / this.track.totalDistance : 0;
  }

  setRoute(route, { animate = true } = {}) {
    this.pause();
    this.clearLayers();
    this.track = route.track ?? buildTrack(route.segments);
    this.baseDuration = baseDurationFor(this.track.totalDistance);
    this.distance = 0;

    const tone = TONES[this.tone];
    const { ranges, points } = this.track;
    const latLngs = ranges.map((range) => range.latLngs);
    const casing = L.polyline(latLngs, { ...LINE, ...tone.casing, interactive: true, className: 'route-hit' });
    casing.on('click', (event) => {
      this.seekDistance(nearestDistance(this.track, event.latlng));
    });

    this.layers = {
      casing,
      base: L.polyline(latLngs, { ...LINE, ...tone.base }),
      halo: L.polyline([], HALO_STYLE),
      played: L.polyline([], PLAYED_STYLE),
      start: L.marker([points[0].lat, points[0].lng], {
        icon: L.divIcon({ className: 'flag-icon', html: '<span class="flag flag-start"></span>', iconSize: [18, 18] }),
        interactive: false,
        keyboard: false,
      }),
      end: L.marker([points.at(-1).lat, points.at(-1).lng], {
        icon: L.divIcon({ className: 'flag-icon', html: '<span class="flag flag-end"></span>', iconSize: [18, 18] }),
        interactive: false,
        keyboard: false,
      }),
      ghost: L.circleMarker([points[0].lat, points[0].lng], {
        radius: 6, color: '#ffffff', weight: 2.5, fillColor: ACCENT, opacity: 0, fillOpacity: 0, interactive: false,
      }),
      marker: L.marker([points[0].lat, points[0].lng], {
        icon: L.divIcon({
          className: 'position-icon',
          html: '<span class="position"><span class="position-pulse"></span><span class="position-heading"></span><span class="position-dot"></span></span>',
          iconSize: [44, 44],
        }),
        interactive: false,
        keyboard: false,
        zIndexOffset: 1000,
      }),
    };
    Object.values(this.layers).forEach((layer) => layer.addTo(this.map));
    this.headingElement = this.layers.marker.getElement()?.querySelector('.position-heading');
    this.heading = headingAt(this.track, 0) ?? 0;

    // Seek before moving the camera: following pans instantly, which would cancel a flight.
    this.seekDistance(0);
    if (this.follow) this.focusMarker(animate ? 0.9 : 0);
    else this.fit({ animate });
  }

  clearLayers() {
    if (!this.layers) return;
    Object.values(this.layers).forEach((layer) => this.map.removeLayer(layer));
    this.layers = null;
  }

  setTone(tone) {
    this.tone = tone;
    if (!this.layers) return;
    this.layers.casing.setStyle(TONES[tone].casing);
    this.layers.base.setStyle(TONES[tone].base);
  }

  fit({ animate = true } = {}) {
    if (!this.track) return;
    this.setFollow(false);
    const bounds = L.latLngBounds(this.track.points.map(({ lat, lng }) => [lat, lng]));
    const options = { ...this.fitPadding(), maxZoom: 16 };
    if (animate) this.map.flyToBounds(bounds, { ...options, duration: 0.9 });
    else this.map.fitBounds(bounds, options);
  }

  setSpeed(speed) {
    this.speed = speed;
  }

  setFollow(follow) {
    if (this.follow === follow) return;
    this.follow = follow;
    this.onFollowChange(follow);
    // Zoom around the screen centre while following, so the marker stays put during zoom animations.
    const anchor = follow ? 'center' : true;
    this.map.options.scrollWheelZoom = anchor;
    this.map.options.touchZoom = anchor;
    this.map.options.doubleClickZoom = anchor;
    if (follow) this.focusMarker(0.6);
  }

  /** Toggle between following the marker and the whole-route overview. */
  toggleFollow() {
    if (this.follow) this.fit();
    else this.setFollow(true);
  }

  focusMarker(duration) {
    if (!this.layers) return;
    const zoom = Math.max(this.map.getZoom(), 15);
    if (!duration) {
      this.map.setView(this.layers.marker.getLatLng(), zoom, { animate: false });
      return;
    }
    // Following is suspended during the flight, so aim where the marker will be when it lands.
    const ahead = this.isPlaying ? this.metresPerMs * duration * 1000 : 0;
    const target = sampleTrack(this.track, Math.min(this.track.totalDistance, this.distance + ahead));
    this.map.flyTo([target.lat, target.lng], zoom, { duration });
  }

  get metresPerMs() {
    return this.track.totalDistance / this.baseDuration * this.speed;
  }

  followCamera() {
    if (!this.follow || this.zooming || !this.layers) return;
    this.map.panTo(this.layers.marker.getLatLng(), { animate: false });
  }

  seek(progress) {
    if (!this.track) return;
    this.seekDistance(progress * this.track.totalDistance);
  }

  seekDistance(distance) {
    if (!this.track) return;
    this.distance = Math.max(0, Math.min(this.track.totalDistance, distance));
    this.render(true);
  }

  skip(fraction) {
    this.seek(this.progress + fraction);
  }

  render(snapHeading = false) {
    const { track, layers } = this;
    const position = sampleTrack(track, this.distance);

    const played = [];
    for (const range of track.ranges) {
      if (position.index >= range.end) {
        played.push(range.latLngs);
        continue;
      }
      if (position.index >= range.start) {
        played.push([...range.latLngs.slice(0, position.index - range.start + 1), [position.lat, position.lng]]);
      }
      break;
    }
    if (!this.zooming) {
      layers.played.setLatLngs(played);
      layers.halo.setLatLngs(played);
    }
    // Markers follow flyTo frames fine; only a CSS zoom animation leaves them mis-projected.
    if (!this.zoomAnimating) layers.marker.setLatLng([position.lat, position.lng]);

    const heading = headingAt(track, this.distance);
    if (heading !== null) {
      this.heading = snapHeading ? heading : this.heading + shortestAngle(this.heading, heading) * 0.18;
    }
    if (this.headingElement) this.headingElement.style.transform = `rotate(${this.heading}deg)`;

    this.followCamera();
    this.onFrame({ progress: this.progress, distance: this.distance, position, track });
  }

  showGhost(progress) {
    if (!this.layers || this.zooming) return;
    if (progress === null) {
      this.layers.ghost.setStyle({ opacity: 0, fillOpacity: 0 });
      return;
    }
    const point = sampleTrack(this.track, progress * this.track.totalDistance);
    this.layers.ghost.setLatLng([point.lat, point.lng]).setStyle({ opacity: 1, fillOpacity: 1 });
  }

  toggle() {
    if (this.isPlaying) this.pause();
    else this.play();
  }

  play() {
    if (this.isPlaying || !this.track) return;
    if (this.distance >= this.track.totalDistance) this.seekDistance(0);
    this.isPlaying = true;
    this.previousTime = 0;
    this.onPlaybackChange(true);
    this.frame = requestAnimationFrame(this.animate);
  }

  pause() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    cancelAnimationFrame(this.frame);
    this.onPlaybackChange(false);
  }

  restart() {
    this.seekDistance(0);
  }

  animate = (time) => {
    if (!this.isPlaying) return;
    const elapsed = this.previousTime ? Math.min(100, time - this.previousTime) : 0;
    this.previousTime = time;
    this.distance += this.metresPerMs * elapsed;

    if (this.distance >= this.track.totalDistance) {
      this.distance = this.track.totalDistance;
      this.render();
      this.pause();
      return;
    }
    this.render();
    this.frame = requestAnimationFrame(this.animate);
  };
}
