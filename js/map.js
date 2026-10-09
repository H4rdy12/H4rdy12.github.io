// Geospatial portfolio map
// Loads projects from data/projects.geojson and shows them as clustered
// points on a CARTO Positron basemap, with a synced list in the sidebar.

const BASEMAP = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
const DATA_URL = 'data/projects.geojson';
const ACCENT = '#0f766e';

const map = new maplibregl.Map({
  container: 'map',
  style: BASEMAP,
  center: [-3.8, 52.4], // initial view; fitted to the data once loaded
  zoom: 6.5,
  attributionControl: { compact: true }
});

map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

let allFeatures = [];
let popup = null;

map.on('load', async () => {
  const res = await fetch(DATA_URL);
  const geojson = await res.json();
  allFeatures = geojson.features;

  map.addSource('projects', {
    type: 'geojson',
    data: geojson,
    cluster: true,
    clusterRadius: 40,
    clusterMaxZoom: 12
  });

  // Clusters
  map.addLayer({
    id: 'clusters',
    type: 'circle',
    source: 'projects',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': ACCENT,
      'circle-opacity': 0.85,
      'circle-radius': ['step', ['get', 'point_count'], 16, 5, 22, 10, 28],
      'circle-stroke-width': 3,
      'circle-stroke-color': '#ffffff'
    }
  });
  map.addLayer({
    id: 'cluster-count',
    type: 'symbol',
    source: 'projects',
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['get', 'point_count_abbreviated'],
      'text-font': ['Montserrat Medium', 'Open Sans Bold'],
      'text-size': 13
    },
    paint: { 'text-color': '#ffffff' }
  });

  // Individual projects
  map.addLayer({
    id: 'project-points',
    type: 'circle',
    source: 'projects',
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': ACCENT,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 6, 12, 10],
      'circle-stroke-width': 2.5,
      'circle-stroke-color': '#ffffff'
    }
  });

  // Click a cluster: zoom in to expand it
  map.on('click', 'clusters', async (e) => {
    const feature = map.queryRenderedFeatures(e.point, { layers: ['clusters'] })[0];
    const zoom = await map.getSource('projects').getClusterExpansionZoom(feature.properties.cluster_id);
    map.easeTo({ center: feature.geometry.coordinates, zoom });
  });

  // Click a project: show popup and highlight its card
  map.on('click', 'project-points', (e) => {
    const f = e.features[0];
    showPopup(f.geometry.coordinates.slice(), f.properties);
    highlightCard(f.properties.id);
  });

  for (const layer of ['clusters', 'project-points']) {
    map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''));
  }

  buildToolFilter(allFeatures);
  renderList(allFeatures);
  fitToFeatures(allFeatures);
});

// GeoJSON properties that are arrays come back from MapLibre as JSON strings
function parseTools(tools) {
  if (Array.isArray(tools)) return tools;
  try { return JSON.parse(tools); } catch { return []; }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function tagsHtml(tools) {
  return `<div class="tags">${parseTools(tools).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>`;
}

function showPopup(coords, p) {
  if (popup) popup.remove();
  popup = new maplibregl.Popup({ offset: 12, maxWidth: '280px' })
    .setLngLat(coords)
    .setHTML(`
      <div class="popup">
        <h3>${escapeHtml(p.title)}</h3>
        <p>${escapeHtml(p.summary)}</p>
        ${tagsHtml(p.tools)}
        <a href="${escapeHtml(p.url)}">View project →</a>
      </div>`)
    .addTo(map);
}

function renderList(features) {
  const list = document.getElementById('project-list');
  list.innerHTML = '';
  const sorted = [...features].sort((a, b) => b.properties.year - a.properties.year);

  for (const f of sorted) {
    const p = f.properties;
    const li = document.createElement('li');
    li.className = 'project-card';
    li.dataset.id = p.id;
    li.tabIndex = 0;
    li.innerHTML = `
      <h3>${escapeHtml(p.title)}</h3>
      <div class="meta">${escapeHtml(p.category)} · ${escapeHtml(p.year)}</div>
      <p>${escapeHtml(p.summary)}</p>
      ${tagsHtml(p.tools)}`;

    const select = () => {
      map.flyTo({ center: f.geometry.coordinates, zoom: 13, speed: 1.4 });
      map.once('moveend', () => showPopup(f.geometry.coordinates.slice(), p));
      highlightCard(p.id);
    };
    li.addEventListener('click', select);
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter') select(); });
    list.appendChild(li);
  }
}

function highlightCard(id) {
  document.querySelectorAll('.project-card').forEach((el) => {
    el.classList.toggle('active', el.dataset.id === id);
  });
  const active = document.querySelector(`.project-card[data-id="${id}"]`);
  if (active) active.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function buildToolFilter(features) {
  const tools = new Set(features.flatMap((f) => parseTools(f.properties.tools)));
  const select = document.getElementById('tool-filter');
  [...tools].sort().forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    select.appendChild(opt);
  });

  select.addEventListener('change', () => {
    const tool = select.value;
    const filtered = tool
      ? features.filter((f) => parseTools(f.properties.tools).includes(tool))
      : features;
    map.getSource('projects').setData({ type: 'FeatureCollection', features: filtered });
    renderList(filtered);
    if (popup) popup.remove();
    fitToFeatures(filtered);
  });
}

function fitToFeatures(features) {
  if (!features.length) return;
  const bounds = new maplibregl.LngLatBounds();
  features.forEach((f) => bounds.extend(f.geometry.coordinates));
  map.fitBounds(bounds, { padding: 80, maxZoom: 11, duration: 800 });
}
