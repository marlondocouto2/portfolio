// Project 2 page: cash-flow forecaster with spikes and holidays.
(async function () {
  "use strict";
  const S = window.Site;
  let data;
  try { data = await S.loadJSON("data/cashflow.json"); } catch (e) { S.showError(e); return; }

  const V = data.versions;
  const SHORT = {
    "1. Baseline": "1 · Baseline",
    "2. + Spike GMM": "2 · + Spike GMM",
    "3. + Holidays": "3 · + Holidays",
    "4. Prophet + Fourier": "4 · Prophet + Fourier",
    "5. Prophet + Fourier + GMM": "5 · + GMM",
  };
  const state = { h: 7, corridor: "MX", versions: new Set([V[0], V[2], V[4]]), range: ["2025-05-03", "2025-05-15"] };
  const result = (v, h) => data.results.find((r) => r.model === v && r.horizon === h);

  // ---- KPI tiles (7-day horizon)
  const b = result(V[0], 7), f = result(V[4], 7), s3 = result(V[2], 7);
  document.getElementById("kpis").innerHTML = [
    [`${Math.round((1 - f.MAE / b.MAE) * 100)}%`, "less error than the Project 1 baseline, 7 days ahead"],
    [S.fmtM(b.avg_cash_held - f.avg_cash_held, 1), "less cash held a day for the same 95% shortfall cover"],
    [`${S.fmtK(b.idle_cash_cost_per_year)} → ${S.fmtK(f.idle_cash_cost_per_year)}`, "idle-cash cost a year, at a 5% cost of capital"],
    [`${S.fmtM(s3.MAE_scheduled, 1)} → ${S.fmtM(f.MAE_scheduled, 1)}`, "error on payroll Fridays, once Fourier terms see the 14-day cycle"],
  ].map(([v, l]) => `<div class="kpi"><div class="value">${v}</div><div class="label">${l}</div></div>`).join("");

  // ---- Controls
  S.segmented("horizon", data.horizons.map((h) => [h, `${h} day${h > 1 ? "s" : ""} ahead`]), state.h, (h) => {
    state.h = h; drawSteps(); drawDayType(); drawExplorer(); drawTable();
  });
  S.chips("versions", V, state.versions, drawExplorer, (v) => SHORT[v]);
  const corridorSelect = document.getElementById("corridor");
  corridorSelect.addEventListener("change", () => { state.corridor = corridorSelect.value; drawExplorer(); });

  const PRESETS = {
    mothers: ["MX", ["2025-05-03", "2025-05-15"]],
    diwali: ["IN", ["2025-10-13", "2025-10-25"]],
    payroll: ["MX", ["2025-08-25", "2025-10-05"]],
    christmas: [null, ["2025-12-13", "2025-12-31"]],
    year: [null, ["2025-01-01", "2025-12-31"]],
  };
  S.segmented("presets", [
    ["mothers", "Mother's Day (MX)"], ["diwali", "Diwali (IN)"], ["payroll", "Payroll Fridays"],
    ["christmas", "Christmas"], ["year", "Full year"],
  ], "mothers", (p) => {
    const [corridor, range] = PRESETS[p];
    if (corridor) { state.corridor = corridor; corridorSelect.value = corridor; }
    state.range = range;
    drawExplorer();
  });

  // ---- Charts
  function drawSteps() {
    const rows = V.map((v) => result(v, state.h));
    const labels = V.map((v) => SHORT[v]);
    S.plot("steps", [{
      type: "bar", x: labels, y: rows.map((r) => r.MAE), marker: { color: V.map((v) => S.color(v)) },
      text: rows.map((r, i) => S.fmtM(r.MAE) + (i ? `<br>${S.fmtPct(r.MAE_vs_previous_pct)} vs previous` : "")),
      textposition: "outside", cliponaxis: false,
      hovertemplate: "%{x}: %{y:$.2f}M<extra></extra>",
    }], {
      showlegend: false,
      yaxis: { range: [0, Math.max(...rows.map((r) => r.MAE)) * 1.3] },
      margin: { t: 16 },
    });
    const total = rows[rows.length - 1].MAE_vs_baseline_pct;
    document.getElementById("steps-sub").textContent =
      `Average error per corridor-day, ${state.h} day${state.h > 1 ? "s" : ""} ahead: ${S.fmtPct(total)} from the baseline to the final version. Each bar shows the change from the previous one.`;
  }

  function drawDayType() {
    const groups = [["MAE", "All days"], ["MAE_normal", "Normal days"], ["MAE_scheduled", "Payroll Fridays"],
                    ["MAE_holiday", "Holiday windows"], ["MAE_spike", "Random spikes"]];
    S.plot("daytype", V.map((v) => {
      const r = result(v, state.h);
      return {
        type: "bar", name: SHORT[v], x: groups.map((g) => g[1]), y: groups.map((g) => r[g[0]]),
        marker: { color: S.color(v) }, hovertemplate: `${SHORT[v]}: %{y:$.2f}M<extra>%{x}</extra>`,
      };
    }), { barmode: "group", legend: { y: -0.2 } });
  }

  function drawExplorer() {
    const c = data.corridors[state.corridor];
    const ink = S.cssVar("--ink");
    const payroll = S.isDark() ? "#c98500" : "#eda100";
    document.getElementById("payroll-swatch").style.background = payroll;

    const traces = [{
      x: c.dates, y: c.actual, name: "Actual", type: "scatter", mode: "lines+markers",
      line: { color: ink, width: 1.4 }, marker: { size: 3.5, color: ink },
      hovertemplate: "%{y:$.1f}M<extra>Actual</extra>",
    }];
    V.filter((v) => state.versions.has(v)).forEach((v) => traces.push({
      x: c.dates, y: c.forecasts[v][String(state.h)], name: SHORT[v], type: "scatter", mode: "lines",
      line: { color: S.color(v), width: 2 }, hovertemplate: `%{y:$.1f}M<extra>${SHORT[v]}</extra>`,
    }));
    const pick = (flags) => c.dates.map((d, i) => (flags[i] ? i : -1)).filter((i) => i >= 0);
    const spikes = pick(c.is_spike);
    traces.push({
      x: spikes.map((i) => c.dates[i]), y: spikes.map((i) => c.actual[i]), name: "Random spike",
      type: "scatter", mode: "markers", hoverinfo: "skip", showlegend: false,
      marker: { size: 13, color: "rgba(0,0,0,0)", line: { color: S.cssVar("--spike"), width: 2 } },
    });
    const pay = pick(c.is_scheduled.map((x, i) => x && !c.is_spike[i]));
    traces.push({
      x: pay.map((i) => c.dates[i]), y: pay.map((i) => c.actual[i]), name: "Payroll Friday",
      type: "scatter", mode: "markers", hoverinfo: "skip", showlegend: false,
      marker: { size: 9, symbol: "diamond", color: payroll, line: { color: S.cssVar("--surface"), width: 1 } },
    });

    // Holiday windows: light band for the days around, darker band for the holiday itself.
    const shapes = [];
    c.dates.forEach((d, i) => {
      const off = c.holiday_offset[i];
      if (off == null) return;
      const t = new Date(d + "T00:00:00Z");
      const x0 = new Date(t.getTime() - 12 * 3600e3).toISOString();
      const x1 = new Date(t.getTime() + 12 * 3600e3).toISOString();
      shapes.push({ type: "rect", xref: "x", yref: "paper", x0, x1, y0: 0, y1: 1, layer: "below", line: { width: 0 },
                    fillcolor: S.cssVar(off === 0 ? "--shade-day" : "--shade-window") });
    });

    S.plot("explorer", traces, {
      hovermode: "x unified", shapes,
      xaxis: S.dateAxis(c.dates, state.range),
      legend: { y: -0.35 }, margin: { b: 20 },
    }).then(() => S.autoscaleY("explorer", state.range));
  }

  function drawTable() {
    document.getElementById("table-sub").textContent =
      `${state.h} day${state.h > 1 ? "s" : ""} ahead. Errors per corridor-day; buffer, cash held and idle cost on the daily total across corridors.`;
    const cols = [["MAE", "MAE", S.fmtM], ["MAE_vs_previous_pct", "vs previous", S.fmtPct],
                  ["MAE_normal", "Normal", S.fmtM], ["MAE_scheduled", "Payroll Fri", S.fmtM],
                  ["MAE_holiday", "Holiday", S.fmtM], ["MAE_spike", "Random spike", S.fmtM],
                  ["required_buffer", "Buffer", S.fmtM], ["avg_cash_held", "Cash held", S.fmtM],
                  ["idle_cash_cost_per_year", "Idle cost / yr", S.fmtK]];
    const rows = V.map((v) => result(v, state.h));
    const best = Math.min(...rows.map((r) => r.MAE));
    document.getElementById("table").innerHTML =
      `<thead><tr><th>Version</th>${cols.map((c) => `<th>${c[1]}</th>`).join("")}</tr></thead><tbody>` +
      rows.map((r) => `<tr class="${r.MAE === best ? "best" : ""}"><td>${r.model}</td>` +
        cols.map(([k, , fmt]) => `<td>${fmt(r[k])}</td>`).join("") + "</tr>").join("") + "</tbody>";
  }

  function drawAll() { drawSteps(); drawDayType(); drawExplorer(); drawTable(); }
  drawAll();
  S.onThemeChange(drawAll);
})();
