// Project 3 page: two-stage FX margin forecaster.
(async function () {
  "use strict";
  const S = window.Site;
  let data;
  try { data = await S.loadJSON("data/fxmargin.json"); } catch (e) { S.showError(e); return; }

  const MODELS = data.models;  // display names, in ladder order
  const FINAL = "+ XGBoost";
  const FEATURE_NAMES = {
    markup_gap: "Markup gap (today's markup − stage 1)", markup_now: "Today's markup",
    ret_10: "FX move, last 10 days", ret_5: "FX move, last 5 days", ret_2: "FX move, last 2 days",
    ret_1: "FX move, last day", vol_20: "Volatility, 20 days", vol_5: "Volatility, 5 days",
    vol_ratio: "Volatility ratio (5 vs 20 days)", dxy_ret_5: "Dollar index, 5-day move",
    dxy_ret_1: "Dollar index, 1-day move", corr_MX: "Mexico corridor", corr_BR: "Brazil corridor",
    corr_IN: "India corridor", dow: "Weekday", trend_slope: "Trend slope",
  };
  const CORRIDOR = { MX: "Mexico", IN: "India", BR: "Brazil", All: "All corridors" };
  const state = { h: 1, corridor: "BR", models: new Set(["Stage 1: EWMA", FINAL]), range: ["2026-08-01", "2026-11-05"] };
  const res = (m, h) => data.results.find((r) => r.model === m && r.horizon === h);
  const risk = (c, h) => data.risk.find((r) => r.corridor === c && r.horizon === h);

  // ---- KPI tiles (1 day ahead)
  const s1 = res("Stage 1: EWMA", 1), fin = res(FINAL, 1), all = risk("All", 1);
  document.getElementById("kpis").innerHTML = [
    [`${s1.MAE_bps.toFixed(1)} → ${fin.MAE_bps.toFixed(1)} bps`, "margin-rate error, 1 day ahead, from stage 1 to + XGBoost"],
    [`${Math.round(fin.captured * 100)}%`, "of the error that can be predicted at all, captured by stage 2"],
    [`${(all.breach_rate * 100).toFixed(1)}%`, "of days below the 5% margin-at-risk band (target: 5%)"],
    [`${S.fmtK(s1.MAE_usd)} → ${S.fmtK(fin.MAE_usd)}`, "average absolute error per corridor-day, in USD"],
  ].map(([v, l]) => `<div class="kpi"><div class="value">${v}</div><div class="label">${l}</div></div>`).join("");

  // ---- Controls
  S.segmented("horizon", [[1, "1 day ahead"], [5, "5 days ahead"]], state.h, (h) => {
    state.h = h; drawLadder(); drawExplorer(); drawRisk(); drawTable();
  });
  S.chips("models", MODELS, state.models, drawExplorer);
  const corridorSelect = document.getElementById("corridor");
  corridorSelect.value = state.corridor;
  corridorSelect.addEventListener("change", () => { state.corridor = corridorSelect.value; drawExplorer(); });
  const PRESETS = {
    brl: ["BR", ["2026-08-01", "2026-11-05"]],
    mxn: ["MX", ["2025-02-15", "2025-05-31"]],
    year: [null, ["2025-11-05", "2026-11-05"]],
    all: [null, ["2024-11-05", "2026-11-05"]],
  };
  S.segmented("presets", [["brl", "BRL swings, Oct 2026"], ["mxn", "MXN, spring 2025"],
                          ["year", "Last 12 months"], ["all", "Full 2 years"]], "brl", (p) => {
    const [c, range] = PRESETS[p];
    if (c) { state.corridor = c; corridorSelect.value = c; }
    state.range = range;
    drawExplorer();
  });

  // ---- Charts
  function drawLadder() {
    const rows = MODELS.map((m) => res(m, state.h));
    const oracle = res("Oracle", state.h);
    S.plot("ladder", [{
      type: "bar", x: MODELS, y: rows.map((r) => r.MAE_bps), marker: { color: MODELS.map((m) => S.color(m)) },
      text: rows.map((r) => `${r.MAE_bps.toFixed(1)} bps` +
        (r.model.startsWith("+") ? `<br>${Math.round(r.captured * 100)}% captured` : "")),
      textposition: "outside", cliponaxis: false, hovertemplate: "%{x}: %{y:.1f} bps<extra></extra>",
    }], {
      showlegend: false,
      yaxis: { tickprefix: "", ticksuffix: " bps", range: [oracle.MAE_bps - 3, Math.max(...rows.map((r) => r.MAE_bps)) + 1.8] },
      shapes: [{ type: "line", xref: "paper", x0: 0, x1: 1, y0: oracle.MAE_bps, y1: oracle.MAE_bps,
                 line: { color: S.cssVar("--ink"), width: 1.5, dash: "dash" } }],
      margin: { t: 24 },
    });
    document.getElementById("ladder-sub").textContent =
      `Mean absolute error of the margin rate, ${state.h} day${state.h > 1 ? "s" : ""} ahead, in basis points. ` +
      `The dashed line is the oracle floor (${oracle.MAE_bps.toFixed(1)} bps): a forecast that knows the markup but not ` +
      "the FX move during settlement. No model can beat it. The y-axis starts near the floor so the differences are visible.";
  }

  function drawExplorer() {
    const s = data.series[state.corridor][String(state.h)];
    const ink = S.cssVar("--ink");
    const bandColor = S.isDark() ? "rgba(57,135,229,0.22)" : "rgba(42,120,214,0.16)";
    document.getElementById("band-swatch").style.background = bandColor;
    const fin = s.forecasts[FINAL];
    const traces = [
      { x: s.dates, y: s.band, type: "scatter", mode: "lines", line: { width: 0 }, hoverinfo: "skip", showlegend: false },
      { x: s.dates, y: fin, type: "scatter", mode: "lines", fill: "tonexty", fillcolor: bandColor,
        line: { width: 0 }, hoverinfo: "skip", showlegend: false },
      { x: s.dates, y: s.band, name: "5% margin-at-risk level", type: "scatter", mode: "lines",
        line: { color: S.color(FINAL), width: 1, dash: "dot" }, hovertemplate: "%{y:.0f} bps<extra>5% level</extra>" },
    ];
    MODELS.filter((m) => state.models.has(m)).forEach((m) => traces.push({
      x: s.dates, y: s.forecasts[m], name: m, type: "scatter", mode: "lines",
      line: { color: S.color(m), width: m === FINAL ? 2.2 : 1.6 }, hovertemplate: `%{y:.0f} bps<extra>${m}</extra>`,
    }));
    traces.push({ x: s.dates, y: s.actual, name: "Realized margin", type: "scatter", mode: "lines+markers",
                  line: { color: ink, width: 1.1 }, marker: { size: 3, color: ink },
                  hovertemplate: "%{y:.0f} bps<extra>Realized</extra>" });
    const br = s.dates.map((d, i) => (s.actual[i] < s.band[i] ? i : -1)).filter((i) => i >= 0);
    traces.push({ x: br.map((i) => s.dates[i]), y: br.map((i) => s.actual[i]), name: "Below the band",
                  type: "scatter", mode: "markers", hoverinfo: "skip", showlegend: false,
                  marker: { size: 12, color: "rgba(0,0,0,0)", line: { color: S.cssVar("--spike"), width: 2 } } });
    S.plot("explorer", traces, {
      hovermode: "x unified",
      xaxis: { range: state.range, rangeslider: { visible: true, thickness: 0.08 }, type: "date" },
      yaxis: { tickprefix: "", ticksuffix: " bps", zeroline: true, zerolinecolor: S.cssVar("--ink-3") },
      legend: { y: -0.35 }, margin: { b: 20 },
    }).then(() => S.autoscaleY("explorer", state.range));
  }

  function drawRisk() {
    const rows = ["MX", "IN", "BR", "All"].map((c) => risk(c, state.h));
    document.getElementById("risk-sub").textContent =
      `${state.h} day${state.h > 1 ? "s" : ""} ahead. The band should be breached on about 5% of days; the shortfall is how far below the band the margin landed, in USD, on those days.`;
    document.getElementById("risk").innerHTML =
      "<thead><tr><th>Corridor</th><th>Days below band</th><th>Avg shortfall</th><th>Band width</th></tr></thead><tbody>" +
      rows.map((r) => `<tr class="${r.corridor === "All" ? "best" : ""}"><td>${CORRIDOR[r.corridor]}</td>` +
        `<td>${(r.breach_rate * 100).toFixed(1)}%</td><td>${S.fmtK(r.avg_shortfall_usd)}</td>` +
        `<td>${r.avg_band_bps.toFixed(0)} bps</td></tr>`).join("") + "</tbody>";
  }

  function drawShap() {
    const top = data.shap.slice(0, 8).reverse();
    S.plot("shap", [{
      type: "bar", orientation: "h", y: top.map((r) => FEATURE_NAMES[r.feature] || r.feature),
      x: top.map((r) => r.mean_abs_shap_bps), marker: { color: S.color(FINAL) },
      text: top.map((r) => `${r.mean_abs_shap_bps.toFixed(1)}`), textposition: "outside", cliponaxis: false,
      hovertemplate: "%{y}: %{x:.2f} bps<extra></extra>",
    }], {
      showlegend: false, margin: { l: 230, r: 30, t: 8, b: 30 },
      xaxis: { title: { text: "bps", font: { size: 11 } }, showgrid: true, gridcolor: S.cssVar("--line") },
      yaxis: { tickprefix: "", ticksuffix: "", showgrid: false, automargin: true },
    });
  }

  function drawTable() {
    const rows = [...MODELS, "Oracle"].map((m) => res(m, state.h));
    const best = Math.min(...rows.filter((r) => r.model !== "Oracle").map((r) => r.MAE_bps));
    document.getElementById("table-sub").textContent =
      `${state.h} day${state.h > 1 ? "s" : ""} ahead, 3 corridors, two years of walk-forward forecasts.`;
    document.getElementById("table").innerHTML =
      "<thead><tr><th>Model</th><th>MAE</th><th>RMSE</th><th>MAE (USD/day)</th><th>Predictable error captured</th></tr></thead><tbody>" +
      rows.map((r) => `<tr class="${r.MAE_bps === best ? "best" : ""}"><td>${r.model === "Oracle" ? "Oracle (knows the markup, not the FX move)" : r.model}</td>` +
        `<td>${r.MAE_bps.toFixed(1)} bps</td><td>${r.RMSE_bps.toFixed(1)} bps</td><td>${S.fmtK(r.MAE_usd)}</td>` +
        `<td>${r.model.startsWith("+") || r.model === "Oracle" ? Math.round(r.captured * 100) + "%" : "–"}</td></tr>`).join("") +
      "</tbody>";
  }

  function drawAll() { drawLadder(); drawExplorer(); drawRisk(); drawShap(); drawTable(); }
  drawAll();
  S.onThemeChange(drawAll);
})();
