// Project 1 page: weekday-seasonal forecaster.
(async function () {
  "use strict";
  const S = window.Site;
  let data;
  try { data = await S.loadJSON("data/weekday.json"); } catch (e) { S.showError(e); return; }

  const state = { h: 7, models: new Set(data.models), range: ["2025-10-01", "2025-12-31"] };
  const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const result = (m, h) => data.results.find((r) => r.model === m && r.horizon === h);

  // ---- KPI tiles (7-day horizon)
  const sw = result("SeasonalWeekday", 7), nw = result("NaiveWeekly", 7), ma = result("MovingAverage", 7);
  document.getElementById("kpis").innerHTML = [
    [`${Math.round((1 - sw.MAE / nw.MAE) * 100)}%`, "less error than repeating last week (7 days ahead)"],
    [`${Math.round((1 - sw.MAE / ma.MAE) * 100)}%`, "less error than a 28-day moving average"],
    [`${S.fmtM(sw.required_buffer, 1)}`, `cash buffer a day, vs ${S.fmtM(nw.required_buffer, 1)} for the naive rule`],
    [`${sw.MAPE.toFixed(1)}%`, "average error, close to the 6% noise in the data"],
  ].map(([v, l]) => `<div class="kpi"><div class="value">${v}</div><div class="label">${l}</div></div>`).join("");

  // ---- Controls
  S.segmented("horizon", data.horizons.map((h) => [h, `${h} day${h > 1 ? "s" : ""}`]), state.h, (h) => {
    state.h = h; drawExplorer(); drawWeekday(); drawTable();
  });
  S.chips("models", data.models, state.models, drawExplorer);
  S.segmented("presets", [
    ["q4", "Q4 2025"], ["dec", "December peak"], ["year", "Full year"],
  ], "q4", (p) => {
    state.range = { q4: ["2025-10-01", "2025-12-31"], dec: ["2025-12-01", "2025-12-31"],
                    year: ["2025-01-01", "2025-12-31"] }[p];
    drawExplorer();
  });

  // ---- Charts
  function drawExplorer() {
    const traces = [{
      x: data.dates, y: data.actual, name: "Actual", type: "scatter", mode: "lines+markers",
      line: { color: S.cssVar("--ink"), width: 1.4 }, marker: { size: 3.5, color: S.cssVar("--ink") },
      hovertemplate: "%{y:$.1f}M<extra>Actual</extra>",
    }];
    data.models.filter((m) => state.models.has(m)).forEach((m) => {
      traces.push({
        x: data.dates, y: data.forecasts[m][String(state.h)], name: m, type: "scatter", mode: "lines",
        line: { color: S.color(m), width: m === "SeasonalWeekday" ? 2.4 : 1.6 },
        hovertemplate: `%{y:$.1f}M<extra>${m}</extra>`,
      });
    });
    S.plot("explorer", traces, {
      hovermode: "x unified",
      xaxis: S.dateAxis(data.dates, state.range),
      yaxis: { title: { text: "" } },
      legend: { y: -0.35 },
      margin: { b: 20 },
    }).then(() => S.autoscaleY("explorer", state.range));
  }

  function groupedBars(id, field, digits) {
    const traces = data.models.map((m) => {
      const rows = data.horizons.map((h) => result(m, h));
      return {
        type: "bar", name: m, x: data.horizons.map((h) => `${h} day${h > 1 ? "s" : ""} ahead`),
        y: rows.map((r) => r[field]), marker: { color: S.color(m) },
        text: rows.map((r) => (m === "SeasonalWeekday" ? S.fmtM(r[field], digits) : "")),
        textposition: "outside", cliponaxis: false,
        hovertemplate: `${m}: %{y:$.2f}M<extra></extra>`,
      };
    });
    S.plot(id, traces, { barmode: "group", legend: { y: -0.22 } });
  }

  function drawWeekday() {
    const rows = data.by_weekday.filter((r) => r.horizon === state.h);
    const traces = data.models.map((m) => ({
      type: "bar", name: m, x: WEEKDAYS,
      y: WEEKDAYS.map((d) => (rows.find((r) => r.model === m && r.weekday === d) || {}).MAE),
      marker: { color: S.color(m) }, hovertemplate: `${m}: %{y:$.2f}M<extra>%{x}</extra>`,
    }));
    document.getElementById("weekday-sub").textContent =
      `Average error by weekday of the target date, ${state.h} day${state.h > 1 ? "s" : ""} ahead.`;
    S.plot("weekday", traces, { barmode: "group", legend: { y: -0.22 } });
  }

  function drawTable() {
    const rows = data.models.map((m) => result(m, state.h)).sort((a, b) => a.MAE - b.MAE);
    document.getElementById("table-sub").textContent =
      `${state.h} day${state.h > 1 ? "s" : ""} ahead, 365 forecasts per model.`;
    document.getElementById("table").innerHTML =
      "<thead><tr><th>Model</th><th>MAE</th><th>RMSE</th><th>MAPE</th><th>Required buffer</th></tr></thead><tbody>" +
      rows.map((r, i) => `<tr class="${i === 0 ? "best" : ""}"><td>${r.model}</td><td>${S.fmtM(r.MAE)}</td>` +
        `<td>${S.fmtM(r.RMSE)}</td><td>${r.MAPE.toFixed(1)}%</td><td>${S.fmtM(r.required_buffer)}</td></tr>`).join("") +
      "</tbody>";
  }

  function drawAll() {
    drawExplorer(); groupedBars("mae", "MAE", 1); groupedBars("buffer", "required_buffer", 1);
    drawWeekday(); drawTable();
  }
  drawAll();
  S.onThemeChange(drawAll);
})();
