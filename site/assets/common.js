// Shared helpers: theme, colours, formatting, Plotly layout and simple controls.
(function () {
  "use strict";

  // ---- Theme (OS setting by default; the toggle overrides it and is remembered if possible)
  const root = document.documentElement;
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  let saved = null;
  try { saved = localStorage.getItem("theme"); } catch (e) { /* storage blocked: follow the OS */ }
  if (saved === "light" || saved === "dark") root.setAttribute("data-theme", saved);

  function isDark() {
    const t = root.getAttribute("data-theme");
    return t ? t === "dark" : media.matches;
  }

  const listeners = [];
  function onThemeChange(fn) { listeners.push(fn); }
  function notify() { listeners.forEach((fn) => fn()); updateToggle(); }
  media.addEventListener("change", notify);

  function updateToggle() {
    const btn = document.querySelector(".theme-toggle");
    if (!btn) return;
    btn.textContent = isDark() ? "☀" : "☾";
    btn.setAttribute("aria-label", isDark() ? "Switch to light theme" : "Switch to dark theme");
  }

  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.querySelector(".theme-toggle");
    if (btn) {
      btn.addEventListener("click", () => {
        const next = isDark() ? "light" : "dark";
        root.setAttribute("data-theme", next);
        try { localStorage.setItem("theme", next); } catch (e) { /* ignore */ }
        notify();
      });
    }
    updateToggle();
  });

  // ---- Colours: one fixed colour per model (light / dark steps of the same hue)
  const HUES = {
    blue: ["#2a78d6", "#3987e5"],
    orange: ["#eb6834", "#d95926"],
    aqua: ["#1baf7a", "#199e70"],
    yellow: ["#eda100", "#c98500"],
    violet: ["#6250d6", "#9085e9"],
    gray: ["#8a8984", "#8f8e86"],
  };
  const MODEL_HUE = {
    SeasonalWeekday: "blue",
    NaiveWeekly: "orange",
    MovingAverage: "aqua",
    "1. Baseline": "orange",
    "2. + Spike GMM": "aqua",
    "3. + Holidays": "blue",
    "4. Prophet + Fourier": "yellow",
    "5. Prophet + Fourier + GMM": "violet",
    "Stage 1: moving average": "gray",
    "Stage 1: EWMA": "orange",
    "+ Ridge": "aqua",
    "+ XGBoost": "blue",
    "+ LightGBM": "violet",
  };
  function color(model) {
    const hue = HUES[MODEL_HUE[model]] || ["#8a8984", "#8f8e86"];
    return hue[isDark() ? 1 : 0];
  }
  function cssVar(name) { return getComputedStyle(root).getPropertyValue(name).trim(); }

  // ---- Formatting
  const fmtM = (v, d = 2) => (v == null ? "–" : `$${v.toFixed(d)}M`);
  const fmtPct = (v) => (v == null ? "–" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`);
  const fmtK = (v) => (v == null ? "–" : `$${Math.round(v / 1000).toLocaleString()}k`);

  // ---- Plotly
  function layout(extra = {}) {
    const ink2 = cssVar("--ink-2");
    const line = cssVar("--line");
    const base = {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: { family: cssVar("--font"), color: ink2, size: 12 },
      margin: { l: 56, r: 12, t: 12, b: 40 },
      xaxis: { gridcolor: line, linecolor: line, zeroline: false, showgrid: false },
      yaxis: { gridcolor: line, linecolor: line, zeroline: false, tickprefix: "$", ticksuffix: "M" },
      legend: { orientation: "h", x: 0, y: -0.18, font: { size: 12 } },
      hoverlabel: { bgcolor: cssVar("--surface"), bordercolor: line, font: { color: cssVar("--ink") } },
      bargap: 0.25,
      bargroupgap: 0.08,
    };
    return deepMerge(base, extra);
  }
  const CONFIG = { responsive: true, displayModeBar: false };

  function deepMerge(a, b) {
    const out = Array.isArray(a) ? a.slice() : { ...a };
    for (const [k, v] of Object.entries(b)) {
      out[k] = v && typeof v === "object" && !Array.isArray(v) && a[k] && typeof a[k] === "object"
        ? deepMerge(a[k], v) : v;
    }
    return out;
  }

  function plot(el, traces, lay) {
    const node = typeof el === "string" ? document.getElementById(el) : el;
    return Plotly.react(node, traces, layout(lay), CONFIG);
  }

  // ---- Controls
  function segmented(el, options, value, onChange) {
    const node = typeof el === "string" ? document.getElementById(el) : el;
    node.classList.add("segmented");
    node.setAttribute("role", "group");
    node.innerHTML = "";
    options.forEach(([val, label]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.setAttribute("aria-pressed", String(val === value));
      b.addEventListener("click", () => {
        node.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", "false"));
        b.setAttribute("aria-pressed", "true");
        onChange(val);
      });
      node.appendChild(b);
    });
  }

  function chips(el, models, selected, onChange, label = (m) => m) {
    const node = typeof el === "string" ? document.getElementById(el) : el;
    node.classList.add("chips");
    const render = () => {
      node.innerHTML = "";
      models.forEach((m) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "chip";
        b.setAttribute("aria-pressed", String(selected.has(m)));
        b.innerHTML = `<span class="dot" style="background:${color(m)}"></span>${label(m)}`;
        b.addEventListener("click", () => {
          if (selected.has(m)) selected.delete(m); else selected.add(m);
          b.setAttribute("aria-pressed", String(selected.has(m)));
          onChange(selected);
        });
        node.appendChild(b);
      });
    };
    render();
    onThemeChange(render);
  }

  // Date axis with a range slider pinned to the data: the slider track runs exactly from the first
  // to the last day (Plotly would otherwise pad it for the markers), and panning stops at the ends.
  function dateAxis(dates, range) {
    const lo = dates[0], hi = dates[dates.length - 1];
    return {
      type: "date", range, minallowed: lo, maxallowed: hi,
      rangeslider: { visible: true, thickness: 0.08, autorange: false, range: [lo, hi] },
    };
  }

  // Rescale the y-axis to the data inside the visible x-range (initially and while panning
  // or dragging the range slider). Plotly otherwise keeps the y-range of the whole series.
  function fitY(el, xRange) {
    const node = typeof el === "string" ? document.getElementById(el) : el;
    const [a, b] = xRange.map((d) => new Date(d).getTime());
    let lo = Infinity, hi = -Infinity;
    node.data.forEach((tr) => {
      if (tr.visible === "legendonly") return;
      tr.x.forEach((x, i) => {
        const t = new Date(x).getTime(), y = tr.y[i];
        if (t >= a && t <= b && y != null) { lo = Math.min(lo, y); hi = Math.max(hi, y); }
      });
    });
    if (!isFinite(lo)) return null;
    const pad = (hi - lo) * 0.08 || 1;
    // Don't dip below zero for series that never go negative (volumes); allow it when they do (margins).
    return [lo >= 0 ? Math.max(0, lo - pad) : lo - pad, hi + pad];
  }

  function autoscaleY(el, xRange) {
    const node = typeof el === "string" ? document.getElementById(el) : el;
    const r = fitY(node, xRange);
    if (r) Plotly.relayout(node, { "yaxis.range": r, "yaxis.autorange": false });
    if (!node._autoscaleBound) {
      node._autoscaleBound = true;
      node.on("plotly_relayout", (ev) => {
        const x0 = ev["xaxis.range[0]"] ?? (ev["xaxis.range"] || [])[0];
        const x1 = ev["xaxis.range[1]"] ?? (ev["xaxis.range"] || [])[1];
        if (x0 == null || x1 == null) return;
        const yr = fitY(node, [x0, x1]);
        if (yr) Plotly.relayout(node, { "yaxis.range": yr, "yaxis.autorange": false });
      });
    }
  }

  // Bump ASSET_VERSION (and the ?v= on each page's <script>/<link> tags) whenever the site changes,
  // so browsers fetch the new files instead of mixing cached old ones with new ones.
  const ASSET_VERSION = "2026-11-12";

  async function loadJSON(path) {
    const res = await fetch(`${path}?v=${ASSET_VERSION}`);
    if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
    return res.json();
  }

  function showError(err) {
    const box = document.createElement("p");
    box.className = "noscript";
    box.textContent = `The interactive charts could not load: ${err.message}`;
    document.querySelector("main").prepend(box);
    console.error(err);
  }

  window.Site = { isDark, onThemeChange, color, cssVar, fmtM, fmtPct, fmtK, layout, plot, dateAxis, autoscaleY, segmented, chips, loadJSON, showError };
})();
