const DURATION = 260;
const easeOut = (t) => 1 - (1 - t) ** 3;

/**
 * Frame-driven zoom for wheel, trackpad, double-click and the zoom buttons.
 *
 * Leaflet's own zoom animation jumps the map state to the target and CSS-scales the layers in
 * between, so nothing can be drawn correctly mid-animation. This drives the zoom one frame at a
 * time the way Leaflet's flyTo does (via its internal _move/_moveStart/_moveEnd, stable in the
 * pinned 1.9.x), so every frame has a real map state for the route, markers and tiles.
 *
 * `getAnchor()` may return { latLng, point } to pin a moving location to a screen point
 * (used to keep the followed marker in place); otherwise the zoom is anchored at the cursor.
 */
export function installSmoothZoom(map, { getAnchor = () => null } = {}) {
  let animation = null;
  let ownMoveStart = false;

  const anchorAt = (point) => getAnchor() ?? { latLng: map.containerPointToLatLng(point), point };

  function frame(now) {
    const t = Math.min(1, (now - animation.start) / DURATION);
    const zoom = animation.from + (animation.to - animation.from) * easeOut(t);
    const { latLng, point } = animation.anchor();
    const offset = map.getSize().divideBy(2).subtract(point);
    const center = map.unproject(map.project(latLng, zoom).add(offset), zoom);

    if (t < 1) {
      map._move(center, zoom, { flyTo: true });
      animation.frame = requestAnimationFrame(frame);
    } else {
      animation = null;
      map._move(center, zoom)._moveEnd(true);
    }
  }

  function zoomTo(targetZoom, containerPoint = map.getSize().divideBy(2)) {
    const to = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), targetZoom));
    const fixed = anchorAt(containerPoint);
    const anchor = () => getAnchor() ?? fixed;

    if (animation) {
      cancelAnimationFrame(animation.frame);
    } else {
      if (to === map.getZoom()) return;
      map._stop();
      ownMoveStart = true;
      map._moveStart(true, false);
      ownMoveStart = false;
    }
    animation = { from: map.getZoom(), to, start: performance.now(), anchor };
    animation.frame = requestAnimationFrame(frame);
  }

  const targetZoom = () => animation?.to ?? map.getZoom();

  // Anything else that moves the map (drag, flyTo, fitBounds) takes over from an in-flight zoom.
  const cancel = () => {
    if (!animation) return;
    cancelAnimationFrame(animation.frame);
    animation = null;
  };
  map.on('movestart', () => { if (!ownMoveStart) cancel(); });
  map.on('dragstart', cancel);

  const container = map.getContainer();
  container.addEventListener('wheel', (event) => {
    event.preventDefault();
    const pixels = event.deltaY * (event.deltaMode === 1 ? 32 : event.deltaMode === 2 ? 600 : 1);
    // Trackpad pinch arrives as ctrl+wheel with small deltas; give it a stronger response.
    const delta = -pixels / (event.ctrlKey ? 100 : 220);
    zoomTo(targetZoom() + Math.max(-1.5, Math.min(1.5, delta)), map.mouseEventToContainerPoint(event));
  }, { passive: false });

  map.on('dblclick', (event) => {
    zoomTo(targetZoom() + (event.originalEvent.shiftKey ? -1 : 1), event.containerPoint);
  });

  return {
    zoomBy: (delta) => zoomTo(Math.round(targetZoom() + delta)),
  };
}
