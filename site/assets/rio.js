// Foundations 01: Airbnb prices in Rio (regression and classification recap).
(async function () {
  "use strict";
  const S = window.Site;
  let data;
  try { data = await S.loadJSON("data/rio.json"); } catch (e) { S.showError(e); return; }

  const ink = () => S.cssVar("--ink");
  const ink2 = () => S.cssVar("--ink-2");
  const brl = { tickprefix: "R$", ticksuffix: "", separatethousands: true };
  const plain = { tickprefix: "", ticksuffix: "" };
  const legendTop = { orientation: "h", x: 0, y: 1.12, yanchor: "bottom" };
  const COST_TICKS = [0.3, 0.5, 1, 2, 5, 10, 20, 50, 100];
  const passes = Array.from({ length: 30 }, (_, i) => i + 1);
  const LOG_KM = { type: "log", tickvals: [0.2, 0.5, 1, 2, 5, 10, 20], ticktext: ["0.2", "0.5", "1", "2", "5", "10", "20"] };

  // ---- 1. Price vs distance to the nearest ocean / bay beach (shared price axis)
  function drawBeaches() {
    const b = data.beaches;
    const ys = [...b.km_ocean_beach.y, ...b.km_bay_beach.y, ...b.marks.map((m) => m.price)];
    const yRange = [Math.min(...ys) * 0.85, Math.max(...ys) * 1.08];
    const markColor = { Botafogo: S.color("too large"), Copacabana: S.color("AI agent"), Tijuca: S.color("Never retrain") };
    [["beachOcean", "km_ocean_beach", "Ocean beach"], ["beachBay", "km_bay_beach", "Bay beach"]].forEach(([el, key, name]) => {
      const traces = [{
        x: b[key].x, y: b[key].y, customdata: b[key].n, type: "scatter", mode: "lines+markers", name,
        line: { color: S.color(name), width: 2.4 }, marker: { size: 7, color: S.color(name) },
        hovertemplate: "About %{x} km: typical price R$%{y:,}<br>%{customdata:,} listings<extra></extra>",
      }];
      b.marks.forEach((m) => traces.push({
        x: [m[key]], y: [m.price], type: "scatter", mode: "markers+text", name: m.name, text: [m.name],
        textposition: "top right", textfont: { color: markColor[m.name], size: 12 },
        marker: { size: 13, color: markColor[m.name], line: { color: S.cssVar("--surface"), width: 2 } },
        hovertemplate: `${m.name}: typical price R$%{y:,}, %{x} km away<extra></extra>`,
      }));
      S.plot(el, traces, {
        showlegend: false, margin: { l: 64, r: 16, t: 8, b: 48 },
        xaxis: { ...LOG_KM, title: { text: `Distance to the nearest ${name.toLowerCase()} (km)` } },
        yaxis: { ...brl, range: yRange, title: { text: "Typical nightly price" } },
      });
    });
  }

  // ---- 2. Gradient descent on one feature: the fitted line, and the cost by learning rate
  function drawLearning() {
    const g = data.gradient_descent;
    // 0–5 bedrooms: the few 6+ listings are mostly hostels and guesthouses, with prices all over the place.
    const keep = g.bedrooms.x.map((x, i) => (x <= 5 ? i : -1)).filter((i) => i >= 0);
    const pick = (arr) => keep.map((i) => arr[i]);
    const xs = pick(g.bedrooms.x);
    const bed = { median: pick(g.bedrooms.median), p25: pick(g.bedrooms.p25), p75: pick(g.bedrooms.p75) };
    const label = String;
    S.plot("gdFit", [
      { x: xs, y: bed.p75, type: "scatter", mode: "lines", line: { width: 0 }, hoverinfo: "skip", showlegend: false },
      { x: xs, y: bed.p25, type: "scatter", mode: "lines", line: { width: 0 }, fill: "tonexty",
        fillcolor: S.isDark() ? "rgba(57,135,229,0.18)" : "rgba(42,120,214,0.14)", name: "Middle half of listings", hoverinfo: "skip" },
      { x: xs, y: bed.median, type: "scatter", mode: "markers", name: "Typical price",
        marker: { size: 8, color: S.color("Ocean beach") },
        customdata: xs.map((x, i) => [label(x), bed.p25[i], bed.p75[i]]),
        hovertemplate: "%{customdata[0]} bedrooms: typical R$%{y:,} (middle half R$%{customdata[1]:,}–%{customdata[2]:,})<extra></extra>" },
      { x: xs, y: pick(g.fit), type: "scatter", mode: "lines", name: "Model learned by gradient descent",
        line: { color: S.color("about right"), width: 2.6 }, hovertemplate: "Model: R$%{y:,}<extra></extra>" },
    ], {
      legend: legendTop, margin: { l: 64, r: 12, t: 8, b: 48 },
      xaxis: { tickvals: xs, ticktext: xs.map(label), title: { text: "Bedrooms" } },
      yaxis: { ...brl, type: "log", tickvals: [100, 200, 500, 1000, 2000, 5000], title: { text: "Nightly price (log scale)" } },
    });

    const curves = Object.entries(g.curves).map(([name, y]) => {
      const short = name.split(" (")[0];
      return { x: passes, y, type: "scatter", mode: "lines+markers", name: `Learning rate ${short} (${name.split("(")[1]}`,
               line: { color: S.color(short), width: 2 }, marker: { size: 4, color: S.color(short) },
               hovertemplate: `Pass %{x}: cost %{y:.3f}<extra>${short}</extra>` };
    });
    S.plot("gdCost", [...curves, lowest(g.lowest_cost)], {
      legend: legendTop, margin: { l: 56, r: 12, t: 8, b: 48 },
      xaxis: { title: { text: "Passes through the training data" } },
      yaxis: { ...plain, type: "log", tickvals: COST_TICKS, title: { text: "Cost (log scale)" } },
    });
  }

  function lowest(v) {
    return { x: [1, 30], y: [v, v], type: "scatter", mode: "lines", name: "Lowest possible cost",
             line: { color: ink(), width: 1.2, dash: "dash" }, hovertemplate: `Lowest possible: ${v.toFixed(3)}<extra></extra>` };
  }

  // ---- 3. Feature scaling
  function drawScaling() {
    const sc = data.scaling;
    const hue = (n) => (n.startsWith("Scaled") ? "about right" : n.includes("smaller") ? "too small" : "too large");
    const name = (n) => (n.startsWith("Scaled") ? "Scaled inputs" : n.includes("smaller")
      ? "Raw inputs, 10× smaller step" : "Raw inputs, same step");
    const traces = Object.entries(sc.curves).map(([n, y]) => ({
      x: passes, y, type: "scatter", mode: "lines+markers", name: name(n), connectgaps: false,
      line: { color: S.color(hue(n)), width: 2.2 }, marker: { size: 4, color: S.color(hue(n)) },
      hovertemplate: `Pass %{x}: cost %{y:.3f}<extra>${name(n)}</extra>`,
    }));
    S.plot("scaling", [...traces, lowest(sc.lowest_cost)], {
      legend: legendTop, margin: { l: 56, r: 12, t: 8, b: 48 },
      xaxis: { title: { text: "Passes through the training data" } },
      yaxis: { ...plain, type: "log", tickvals: COST_TICKS, title: { text: "Cost (log scale)" } },
    });
  }

  // ---- 4. Overfitting and regularization (R², clipped so a collapse stays on the chart)
  function drawOverfitting() {
    const o = data.overfitting;
    const FLOOR = -0.1;
    const pair = (rows, x, hoverX) => [["Training listings", "train_r2"], ["New listings", "val_r2"]].map(([n, k]) => ({
      x: rows.map((r) => r[x]), y: rows.map((r) => Math.max(FLOOR, r[k])), customdata: rows.map((r) => r[k]),
      type: "scatter", mode: "lines+markers", name: n === "New listings" ? "New listings (tuning set)" : n,
      line: { color: S.color(n), width: 2.4 }, marker: { size: 8, color: S.color(n) },
      hovertemplate: `${hoverX}: R² %{customdata:.3f}<extra>${n}</extra>`,
    }));
    const worst = o.degrees[o.degrees.length - 1];
    const yaxis = { ...plain, range: [-0.14, 0.72], title: { text: "Share of price differences explained (R²)" } };
    S.plot("degrees", pair(o.degrees, "degree", "Degree %{x}"), {
      legend: legendTop, margin: { l: 56, r: 12, t: 8, b: 48 }, yaxis,
      xaxis: { tickvals: [1, 2, 3, 4], title: { text: "Polynomial degree (how much the model can bend)" } },
      annotations: worst.val_r2 < FLOOR ? [{ x: worst.degree, y: FLOOR, text: `Really ${Math.round(worst.val_r2)}<br>(off the chart)`,
        showarrow: false, xanchor: "right", yanchor: "bottom", xshift: -8, yshift: 4, align: "right", font: { color: S.color("New listings"), size: 11 } }] : [],
    });
    S.plot("ridge", pair(o.ridge_degree3, "alpha", "Strength %{x:,}"), {
      legend: legendTop, margin: { l: 56, r: 12, t: 8, b: 48 }, yaxis,
      xaxis: { type: "log", exponentformat: "none", separatethousands: true,
               title: { text: "Regularization strength, degree 3 (log scale)" } },
    });
  }

  // ---- 5. Business host: the cut-off trade-off and the decision boundary
  function drawBusiness() {
    const c = data.classification;
    S.plot("cutoff", [
      { x: c.cutoffs, y: c.precision, type: "scatter", mode: "lines", name: "Flags that are right (precision)",
        line: { color: S.color("Precision"), width: 2.6 }, hovertemplate: "Cut-off %{x:.2f}: %{y:.0%} of flags right<extra></extra>" },
      { x: c.cutoffs, y: c.recall, type: "scatter", mode: "lines", name: "Businesses caught (recall)",
        line: { color: S.color("Recall"), width: 2.6 }, hovertemplate: "Cut-off %{x:.2f}: %{y:.0%} of businesses caught<extra></extra>" },
    ], {
      legend: legendTop, margin: { l: 56, r: 12, t: 8, b: 48 },
      xaxis: { title: { text: "Cut-off: call it a business when the chance is at least…" } },
      yaxis: { ...plain, range: [0, 1], tickformat: ".0%" },
      shapes: [{ type: "line", x0: c.threshold, x1: c.threshold, y0: 0, y1: 1, yref: "y", line: { color: ink(), width: 1.2, dash: "dash" } }],
      annotations: [{ x: c.threshold, y: 0.98, xanchor: "left", text: " My cut-off: few false alarms", showarrow: false,
                      font: { color: ink2(), size: 11 } }],
    });

    const sc = c.scores;
    const mids = sc.bins.slice(0, -1).map((b) => b + 0.025);
    const bars = [["regular", "Regular host", "Regular hosts (1–2 listings)"], ["business", "Business host", "Business hosts (3+ listings)"]]
      .map(([k, hue, name]) => ({
        x: mids, y: sc[k], type: "bar", name, width: 0.045, marker: { color: S.color(hue), opacity: 0.6 },
        hovertemplate: `Chance %{x:.0%}: %{y:.1%} of ${name.split(" (")[0].toLowerCase()}<extra></extra>`,
      }));
    S.plot("boundary", bars, {
      barmode: "overlay", legend: legendTop, margin: { l: 56, r: 12, t: 8, b: 48 },
      xaxis: { range: [0, 1], tickformat: ".0%", title: { text: "The model's chance that it's a business host" } },
      yaxis: { ...plain, tickformat: ".0%", title: { text: "Share of the group" } },
      shapes: [{ type: "line", x0: c.threshold, x1: c.threshold, y0: 0, y1: 1, yref: "paper", line: { color: ink(), width: 1.2, dash: "dash" } }],
      annotations: [{ x: c.threshold, y: 1, yref: "paper", xanchor: "left", yanchor: "top", text: " Flagged →", showarrow: false,
                      font: { color: ink2(), size: 11 } }],
    });
  }

  // ---- 6. Final test: predicted vs actual price
  function drawTest() {
    const t = data.test_predictions;
    const diag = (lo, hi) => [
      { x: [lo, hi, hi, lo], y: [lo / 1.5, hi / 1.5, hi * 1.5, lo * 1.5], type: "scatter", mode: "lines", fill: "toself",
        fillcolor: S.isDark() ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)", line: { width: 0 }, name: "Within ±50%", hoverinfo: "skip" },
      { x: [lo, hi], y: [lo, hi], type: "scatter", mode: "lines", name: "Perfect prediction",
        line: { color: ink(), width: 1.2, dash: "dash" }, hoverinfo: "skip" },
    ];
    const axes = (lo, hi, ticks) => ({
      xaxis: { ...brl, type: "log", range: [Math.log10(lo), Math.log10(hi)], tickvals: ticks, title: { text: "Predicted nightly price" } },
      yaxis: { ...brl, type: "log", range: [Math.log10(lo), Math.log10(hi)], tickvals: ticks, title: { text: "Actual nightly price" } },
    });
    const s = t.sample;
    const listings = ["Entire home/apt", "Private room"].map((rt) => {
      const idx = s.room_type.map((r, i) => (r === rt ? i : -1)).filter((i) => i >= 0);
      return { x: idx.map((i) => s.pred[i]), y: idx.map((i) => s.actual[i]), type: "scattergl", mode: "markers",
               name: rt === "Private room" ? "Room" : "Whole place", marker: { size: 5, opacity: 0.45, color: S.color(rt) },
               hovertemplate: "Predicted R$%{x:,}, actual R$%{y:,}<extra></extra>" };
    });
    S.plot("testListings", [...diag(80, 8000), ...listings], {
      legend: legendTop, margin: { l: 64, r: 12, t: 8, b: 48 }, ...axes(80, 8000, [100, 200, 500, 1000, 2000, 5000]),
    });

    const h = t.neighbourhoods;
    const LABELLED = new Set(["Copacabana", "Ipanema", "Leblon", "Barra da Tijuca", "Botafogo", "Centro"]);
    S.plot("testHoods", [...diag(150, 1500), {
      x: h.map((r) => r.pred), y: h.map((r) => r.actual), customdata: h.map((r) => [r.name, r.n]),
      text: h.map((r) => (LABELLED.has(r.name) ? r.name : "")), textposition: "top left",
      textfont: { color: ink2(), size: 11 }, type: "scatter", mode: "markers+text", name: "Neighbourhood",
      marker: { size: h.map((r) => Math.max(6, Math.sqrt(r.n) * 0.55)), color: S.color("Neighbourhood"), opacity: 0.8,
                line: { color: S.cssVar("--surface"), width: 1 } },
      hovertemplate: "%{customdata[0]} (%{customdata[1]:,} listings)<br>Predicted R$%{x:,}, actual R$%{y:,}<extra></extra>",
    }], {
      legend: legendTop, margin: { l: 64, r: 12, t: 8, b: 48 }, ...axes(150, 1500, [200, 300, 500, 700, 1000]),
    });
  }

  function drawAll() { drawBeaches(); drawLearning(); drawScaling(); drawOverfitting(); drawBusiness(); drawTest(); }
  drawAll();
  S.onThemeChange(drawAll);
})();
