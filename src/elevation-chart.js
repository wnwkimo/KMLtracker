const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const CHART = { left: 8, right: 272, top: 8, bottom: 70, baseline: 82 };

function distanceBetween(start, end) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const latitudeDelta = radians(end.lat - start.lat);
  const longitudeDelta = radians(end.lng - start.lng);
  const latitude1 = radians(start.lat);
  const latitude2 = radians(end.lat);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NAMESPACE, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

export class ElevationChart {
  constructor(container) {
    this.container = container;
    this.value = container.querySelector('#elevationValue');
    this.range = container.querySelector('#elevationRange');
    this.profile = container.querySelector('#elevationProfile');
    this.cursor = container.querySelector('#elevationCursor');
    this.marker = container.querySelector('#elevationMarker');
    this.points = [];
    this.minAltitude = null;
    this.maxAltitude = null;
  }

  setRoute(route) {
    let cumulativeDistance = 0;
    const profileSegments = route.segments.map((segment) => segment.map((point, index) => {
      if (index > 0) cumulativeDistance += distanceBetween(segment[index - 1], point);
      return { distance: cumulativeDistance, altitude: point.altitude };
    }));

    this.points = profileSegments.flat();
    const altitudes = this.points.map((point) => point.altitude).filter(Number.isFinite);
    this.minAltitude = altitudes.length ? Math.min(...altitudes) : null;
    this.maxAltitude = altitudes.length ? Math.max(...altitudes) : null;
    this.totalDistance = cumulativeDistance;
    this.drawProfile(profileSegments);
    this.update(0, this.points.find((point) => Number.isFinite(point.altitude))?.altitude);
  }

  drawProfile(segments) {
    this.profile.replaceChildren();
    if (this.minAltitude === null) {
      this.range.textContent = '無高度資料';
      return;
    }

    this.range.textContent = `${Math.round(this.minAltitude)}–${Math.round(this.maxAltitude)} m`;
    const altitudeSpan = this.maxAltitude - this.minAltitude || 1;
    const distanceSpan = this.totalDistance || 1;
    const paths = segments.map((segment) => {
      const validPoints = segment.filter((point) => Number.isFinite(point.altitude));
      if (!validPoints.length) return '';
      return validPoints.map((point, index) => {
        const x = CHART.left + point.distance / distanceSpan * (CHART.right - CHART.left);
        const y = CHART.bottom - (point.altitude - this.minAltitude) / altitudeSpan
          * (CHART.bottom - CHART.top);
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
      }).join(' ');
    }).filter(Boolean);

    paths.forEach((pathData) => {
      const firstPoint = pathData.match(/^M([\d.]+),([\d.]+)/);
      const lastPoint = pathData.match(/([\d.]+),([\d.]+)$/);
      if (firstPoint && lastPoint) {
        const area = `${pathData} L${lastPoint[1]},${CHART.baseline} L${firstPoint[1]},${CHART.baseline} Z`;
        this.profile.append(svgElement('path', { d: area, class: 'elevation-area' }));
      }
      this.profile.append(svgElement('path', { d: pathData, class: 'elevation-line' }));
    });
  }

  update(progress, altitude) {
    if (Number.isFinite(altitude)) {
      this.value.textContent = `${Math.round(altitude)} m`;
    } else {
      this.value.textContent = '— m';
    }

    const x = CHART.left + Math.max(0, Math.min(1, progress)) * (CHART.right - CHART.left);
    this.cursor.setAttribute('x1', x);
    this.cursor.setAttribute('x2', x);
    this.marker.setAttribute('cx', x);
    if (Number.isFinite(altitude) && this.minAltitude !== null) {
      const altitudeSpan = this.maxAltitude - this.minAltitude || 1;
      const y = CHART.bottom - (altitude - this.minAltitude) / altitudeSpan
        * (CHART.bottom - CHART.top);
      this.marker.setAttribute('cy', Math.max(CHART.top, Math.min(CHART.bottom, y)));
      this.marker.classList.remove('is-hidden');
    } else {
      this.marker.classList.add('is-hidden');
    }
  }

  setVisible(isVisible) {
    this.container.classList.toggle('visible', isVisible);
    this.container.setAttribute('aria-hidden', String(!isVisible));
  }
}
