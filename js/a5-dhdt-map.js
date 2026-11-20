/*
 * Interactive dh/dt map on A5 cells (MapLibre GL JS).
 *
 * Reads the files written by export_dhdt_tiles.py from the folder given in data-base:
 *   dhdt_meta.json        levels, zoom ranges, cell areas, colour range
 *   dhdt_a5.pmtiles       all resolutions as vector tiles (data-mode="pmtiles", default)
 *   dhdt_res{R}.geojson   per-resolution files (data-mode="geojson": quick tests, coarse levels)
 *
 * Each A5 resolution is its own layer, visible only in its zoom range, so the grid gets
 * finer as you zoom in. The finest level stays on when zooming further.
 *
 * Markup:
 *   <div id="dhdt-map" class="dq-map" data-base="a5_content/" data-mode="pmtiles"></div>
 * Scripts (after maplibre-gl.js):
 *   <script src="https://unpkg.com/pmtiles@3.2.0/dist/pmtiles.js"></script>
 *   <script src="../js/a5-dhdt-map.js"></script>
 */
(function () {
  "use strict";
  const el = document.getElementById("dhdt-map");
  if (!el) return;
  if (!window.maplibregl) { el.textContent = "MapLibre isn't loaded, so the map can't start."; return; }
  if ((el.dataset.mode || "pmtiles") === "pmtiles" && !window.pmtiles) {
    el.textContent = "The PMTiles plugin isn't loaded, so the map can't start."; return;
  }
  if (location.protocol === "file:") {
    el.textContent = "Open this page through a web server (e.g. python -m http.server), not as a file."; return;
  }

  const base = el.dataset.base || "a5_content/";
  const mode = el.dataset.mode || "pmtiles";
  const url = (f) => new URL(base + f, window.location.href).href;
  const IMAGERY = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

  fetch(url("dhdt_meta.json"))
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(init)
    .catch((e) => { el.textContent = "Map data not available yet (" + e.message + ")."; });

  function niceLimit(v) {                     // 1.37 -> 1.5, 0.42 -> 0.5, 2.6 -> 3
    const steps = [0.1, 0.2, 0.25, 0.5, 1, 1.5, 2, 3, 5, 10];
    return steps.find((s) => s >= v) || Math.ceil(v);
  }

  function init(meta) {
    el.textContent = "";
    el.classList.add("is-live");
    const lim = meta.dhdt_lim || niceLimit(meta.dhdt_p98);
    const color = ["interpolate", ["linear"], ["get", "dhdt"],
      -lim, "#b2182b", -lim / 2, "#ef8a62", 0, "#f7f7f7", lim / 2, "#67a9cf", lim, "#2166ac"];

    // which levels can we draw, and over which zooms?
    let levels = meta.levels.slice();
    if (mode === "geojson") levels = levels.filter((r) => meta.geojson_levels.includes(r));
    const finest = Math.max(...levels);
    const zoomRange = {};
    levels.forEach((r) => {
      const [zmin, zmax] = meta.zoom_for_res[r];
      zoomRange[r] = [zmin, r === finest ? 24 : zmax + 1];    // layer maxzoom is exclusive
    });

    const sources = {
      imagery: { type: "raster", tiles: [IMAGERY], tileSize: 256, maxzoom: 17,
                 attribution: "Imagery © Esri, Maxar, Earthstar Geographics" },
    };
    const layers = [
      { id: "bg", type: "background", paint: { "background-color": "#1d2a33" } },
      { id: "imagery", type: "raster", source: "imagery", paint: { "raster-opacity": 0.9 } },
    ];
    if (mode === "pmtiles") {
      const protocol = new pmtiles.Protocol();
      maplibregl.addProtocol("pmtiles", protocol.tile);
      sources.dhdt = { type: "vector", url: "pmtiles://" + url("dhdt_a5.pmtiles") };
    }
    levels.forEach((r) => {
      const src = mode === "pmtiles"
        ? { source: "dhdt", "source-layer": "res" + r }
        : { source: "res" + r };
      if (mode === "geojson") sources["res" + r] = { type: "geojson", data: url("dhdt_res" + r + ".geojson") };
      layers.push({
        id: "res" + r, type: "fill", ...src,
        minzoom: zoomRange[r][0], maxzoom: zoomRange[r][1],
        paint: { "fill-color": color, "fill-opacity": 0.82,
                 "fill-outline-color": "rgba(0,0,0,0.18)" },
      });
    });

    const map = new maplibregl.Map({
      container: el,
      style: { version: 8, projection: { type: "globe" }, sources, layers },
      center: [-42, 71.5], zoom: 2.1, minZoom: 1.5, maxZoom: 13,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");

    // legend + live "which A5 resolution am I looking at"
    const legend = document.createElement("div");
    legend.className = "dq-legend";
    legend.innerHTML =
      '<div class="dq-legend-t">dh/dt (m yr⁻¹)</div>' +
      '<div class="dq-legend-bar"></div>' +
      '<div class="dq-legend-l"><span>−' + lim + '</span><span>0</span><span>+' + lim + "</span></div>" +
      '<div class="dq-legend-res"></div>';
    legend.querySelector(".dq-legend-bar").style.background =
      "linear-gradient(90deg,#b2182b,#ef8a62,#f7f7f7,#67a9cf,#2166ac)";
    el.appendChild(legend);
    const resLabel = legend.querySelector(".dq-legend-res");
    const resAt = (z) => levels.find((r) => z >= zoomRange[r][0] && z < zoomRange[r][1]) ?? levels[0];
    const updateRes = () => {
      const r = resAt(map.getZoom());
      const km2 = meta.cell_km2[r];
      resLabel.textContent = "A5 res " + r + " · " + (km2 >= 10 ? Math.round(km2).toLocaleString() : km2) +
        " km² cells" + (r === meta.fit_res ? " (individual fits)" : " (median of fits)");
    };
    map.on("zoom", updateRes);
    updateRes();

    // click a cell for details
    const ids = levels.map((r) => "res" + r);
    map.on("click", (e) => {
      const f = map.queryRenderedFeatures(e.point, { layers: ids })[0];
      if (!f) return;
      const p = f.properties;
      const se = p.se == null ? "" : " ± " + Number(p.se).toFixed(2);
      new maplibregl.Popup({ closeButton: false, maxWidth: "240px" })
        .setLngLat(e.lngLat)
        .setHTML("<b>" + (p.dhdt > 0 ? "+" : "") + Number(p.dhdt).toFixed(2) + se + " m yr⁻¹</b><br>" +
                 "A5 res " + p.res + (p.n_fits > 1 ? " · median of " + p.n_fits + " fits" : "") +
                 "<br>" + Number(p.n_pts).toLocaleString() + " altimetry points")
        .addTo(map);
    });
    ids.forEach((id) => {
      map.on("mouseenter", id, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", id, () => { map.getCanvas().style.cursor = ""; });
    });
    window.__dhdtMap = map;                                    // handy for debugging
  }
})();
