// Project 4 page: FX pricing experiment.
(async function () {
  "use strict";
  const S = window.Site;
  let data;
  try { data = await S.loadJSON("data/pricing.json"); } catch (e) { S.showError(e); return; }

  const OPTIONS = ["2.0% for everyone", "Tiered: 2.0% small, 1.5% large"];
  const SEGMENTS = ["All users", "Small senders", "Large senders"];
  const METRICS = [["revenue", "Revenue"], ["profit", "Profit"], ["volume", "Amount sent"],
                   ["repeat", "Customers sending again"], ["converted", "Customers who send"]];
  const DESIGNS = [["new_then_old", "6 weeks new, then old"], ["old_then_new", "6 weeks old, then new"],
                   ["daily", "Coin flip each day"], ["blocks", "Coin flip, 2-day blocks"]];
  // Plain labels for the page; the data keeps the technical names.
  const PLAIN = {
    "Difference in means": "Simple comparison", "CUPED (pre-test volume)": "CUPED: past sending",
    "CUPED (+ quote amount)": "CUPED: + amount quoted",
    "Look once, at the end": "Check once, at the end", "Peek weekly at 1.96": "Check every week",
    "Peek daily at 1.96": "Check every day", "Weekly with O'Brien-Fleming": "Weekly, stricter early bar",
    "Parallel trends": "Countries move together", "Holiday boosts GT after launch": "Holiday in Guatemala after launch",
    "MX was already growing faster": "Mexico already growing faster",
  };
  const P = (x) => PLAIN[x] || x;
  const state = { option: OPTIONS[0], tier: "small", metric: "revenue", scenario: data.did.summary[0].scenario };
  const effect = (o, s) => data.effects.find((r) => r.option === o && r.segment === s);
  const pct = (v, d = 1) => `${v > 0 ? "+" : ""}${v.toFixed(d)}%`;
  const usd = (v) => `${v < 0 ? "−" : "+"}$${Math.abs(v).toLocaleString()}`;

  // ---- Best markups from the fitted curves
  const best = (tier, key) => {
    const d = data.demand[tier];
    const ys = d[`fitted_${key}`];
    return d.markup[ys.indexOf(Math.max(...ys))];
  };

  // ---- KPI tiles
  const raw = data.readout[0], cup = data.readout[data.readout.length - 1];
  const tiered = effect(OPTIONS[1], "All users");
  const peek = (s) => data.peeking.find((r) => r.strategy === s).rate;
  document.getElementById("kpis").innerHTML = [
    [pct(cup.lift), `more revenue per customer with the higher price, as measured (likely ${pct(cup.ci_low)} to ${pct(cup.ci_high)}; true ${pct(data.true_lift)})`],
    [`${pct(tiered.profit, 0)} profit`, `with separate prices for small and large senders, vs ${pct(effect(OPTIONS[0], "All users").profit, 0)} for one price`],
    [`${best("small", "revenue").toFixed(2)}% / ${best("large", "revenue").toFixed(2)}%`, "best fee for small / large senders, estimated from the test"],
    [`${peek("Peek daily at 1.96").toFixed(0)}% vs 5%`, "false alarms when results are checked every day instead of once"],
  ].map(([v, l]) => `<div class="kpi"><div class="value">${v}</div><div class="label">${l}</div></div>`).join("");

  // ---- Controls
  S.segmented("option", OPTIONS.map((o) => [o, o]), state.option, (o) => { state.option = o; drawEffects(); });
  S.segmented("tier", [["small", "Small (under $1,000)"], ["large", "Large ($1,000+)"]], state.tier, (t) => { state.tier = t; drawDemand(); });
  S.segmented("metric", [["revenue", "Revenue"], ["profit", "Profit"]], state.metric, (m) => { state.metric = m; drawDemand(); });
  S.segmented("scenario", data.did.summary.map((r) => [r.scenario, P(r.scenario)]), state.scenario, (s) => { state.scenario = s; drawDid(); });

  // ---- Charts
  function drawEffects() {
    const traces = SEGMENTS.map((seg) => {
      const r = effect(state.option, seg);
      return {
        type: "bar", name: seg, x: METRICS.map((m) => m[1]), y: METRICS.map(([k]) => r[k]),
        marker: { color: S.color(seg) }, text: METRICS.map(([k]) => pct(r[k], 0)), textposition: "outside",
        cliponaxis: false, hovertemplate: `${seg}<br>%{x}: %{y:+.1f}%<extra></extra>`,
      };
    });
    S.plot("effects", traces, {
      barmode: "group", yaxis: { tickprefix: "", ticksuffix: "%", range: [-48, 32], zeroline: true, zerolinecolor: S.cssVar("--ink-3") },
      margin: { t: 16 },
    });
    document.getElementById("effects-sub").textContent =
      "The true change for each group compared with today's 1.5% fee (known because the customers are simulated). Profit subtracts a $1.50 cost per transfer. " +
      (state.option === OPTIONS[0]
        ? "With one price, large senders drop away: they're the most price-sensitive and send the most."
        : "With separate prices, large senders stay at 1.5%, so nothing changes for them.");
  }

  function drawDemand() {
    const d = data.demand[state.tier];
    const key = state.metric;
    const label = key === "revenue" ? "Revenue" : "Profit";
    const ink3 = S.cssVar("--ink-3");
    const m = best(state.tier, key);
    const tested = d.tested.map((t) => t.markup);
    const tr = [
      { x: d.markup, y: d[`fitted_${key}`], name: "Estimated from 3 tested fees", type: "scatter", mode: "lines",
        line: { color: S.color(state.tier === "small" ? "Small senders" : "Large senders"), width: 2.4 },
        hovertemplate: "%{x:.2f}%: $%{y:.2f}<extra>Estimated</extra>" },
      { x: d.markup, y: d[`true_${key}`], name: "True curve", type: "scatter", mode: "lines", connectgaps: true,
        line: { color: S.cssVar("--ink-2"), width: 1.4, dash: "dash" }, hovertemplate: "%{x:.2f}%: $%{y:.2f}<extra>True</extra>" },
    ];
    if (key === "revenue") {
      tr.push({ x: tested, y: d.tested.map((t) => t.revenue), name: "Tested fees", type: "scatter", mode: "markers",
                marker: { size: 11, color: S.color(state.tier === "small" ? "Small senders" : "Large senders"),
                          line: { color: S.cssVar("--surface"), width: 2 } },
                hovertemplate: "%{x:.1f}%: $%{y:.2f}<extra>Tested fee</extra>" });
    }
    const shade = S.isDark() ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";
    S.plot("demand", tr, {
      xaxis: { title: { text: "Fee (markup, %)", font: { size: 12 } }, ticksuffix: "%", showgrid: true, gridcolor: S.cssVar("--line") },
      yaxis: { tickprefix: "$", ticksuffix: "", title: { text: `${label} per customer`, font: { size: 12 } } },
      shapes: [
        { type: "rect", xref: "x", yref: "paper", x0: d.markup[0], x1: tested[0], y0: 0, y1: 1, fillcolor: shade, line: { width: 0 }, layer: "below" },
        { type: "rect", xref: "x", yref: "paper", x0: tested[tested.length - 1], x1: d.markup[d.markup.length - 1], y0: 0, y1: 1, fillcolor: shade, line: { width: 0 }, layer: "below" },
        { type: "line", xref: "x", yref: "paper", x0: m, x1: m, y0: 0, y1: 1, line: { color: ink3, width: 1, dash: "dot" } },
      ],
      annotations: [{ x: m, y: 1, xref: "x", yref: "paper", text: `best ≈ ${m.toFixed(2)}%`, showarrow: false, yanchor: "bottom", font: { size: 11 } }],
      margin: { t: 24, l: 64 },
    });
    document.getElementById("demand-sub").textContent =
      "I tested three fees (1.5%, 2.0%, 2.5%) and fitted a curve through them to estimate revenue or profit at every fee. " +
      "The dashed line is the truth. Shaded areas are outside the tested range, where the curve is a guess. " +
      (state.tier === "small"
        ? "Near the top the curve is flat: anything from about 2.2% to 2.8% is within 2% of the best."
        : "The best fee looks lower than today's 1.5%, but that's a guess outside the tested range, so the next test should try a lower fee.");
  }

  function drawReadout() {
    const rows = data.readout.slice().reverse();
    const c = S.color("All users");
    S.plot("readout", [{
      type: "scatter", mode: "markers", y: rows.map((r) => P(r.method)), x: rows.map((r) => r.lift),
      error_x: { type: "data", symmetric: false, array: rows.map((r) => r.ci_high - r.lift),
                 arrayminus: rows.map((r) => r.lift - r.ci_low), color: c, thickness: 3, width: 0 },
      marker: { size: 11, color: c, line: { color: S.cssVar("--surface"), width: 2 } },
      hovertemplate: rows.map((r) => `${P(r.method)}<br>${pct(r.lift)} [${pct(r.ci_low)}, ${pct(r.ci_high)}]<extra></extra>`),
    }], {
      showlegend: false, margin: { l: 170, t: 24, r: 16 },
      xaxis: { ticksuffix: "%", range: [-0.5, 10], showgrid: true, gridcolor: S.cssVar("--line"), zeroline: true, zerolinecolor: S.cssVar("--ink-3") },
      yaxis: { tickprefix: "", ticksuffix: "", automargin: true },
      shapes: [{ type: "line", xref: "x", yref: "paper", x0: data.true_lift, x1: data.true_lift, y0: 0, y1: 1,
                 line: { color: S.cssVar("--ink"), width: 1.2, dash: "dash" } }],
      annotations: [{ x: data.true_lift, y: 1, xref: "x", yref: "paper", text: `true ${pct(data.true_lift)}`, showarrow: false, yanchor: "bottom", font: { size: 11 } }],
    });
    document.getElementById("readout-sub").textContent =
      `One test with ${data.n_per_arm.toLocaleString()} customers in each group, enough to detect a 3% change. ` +
      "Each dot is the measured revenue gain and the bar its likely range; the dashed line is the true gain. " +
      "CUPED uses each customer's behaviour from before the test to narrow the range, without moving the answer.";
  }

  function drawPeeking() {
    const rows = data.peeking;
    S.plot("peeking", [{
      type: "bar", orientation: "h", y: rows.map((r) => P(r.strategy)), x: rows.map((r) => r.rate),
      marker: { color: rows.map((r) => S.color(r.strategy.includes("1.96") ? "Sequential" : "All users")) },
      text: rows.map((r) => `${r.rate.toFixed(1)}%`), textposition: "outside", cliponaxis: false,
      hovertemplate: "%{y}: %{x:.1f}%<extra></extra>",
    }], {
      showlegend: false, margin: { l: 190, t: 24, r: 40 },
      xaxis: { ticksuffix: "%", range: [0, 32], showgrid: true, gridcolor: S.cssVar("--line") },
      yaxis: { tickprefix: "", ticksuffix: "", autorange: "reversed", automargin: true },
      shapes: [{ type: "line", xref: "x", yref: "paper", x0: 5, x1: 5, y0: 0, y1: 1, line: { color: S.cssVar("--ink"), width: 1.2, dash: "dash" } }],
      annotations: [{ x: 5, y: 1, xref: "x", yref: "paper", text: "target 5%", showarrow: false, yanchor: "bottom", font: { size: 11 } }],
    });
  }

  function drawSwitchback() {
    const truth = data.switchback.truth;
    const traces = DESIGNS.map(([k, name]) => {
      const v = data.switchback.estimates[k];
      return {
        type: "box", name, x: v, orientation: "h", boxpoints: "all", jitter: 0.5, pointpos: 0, boxmean: true,
        marker: { size: 3, opacity: 0.45, color: S.color(k.includes("then") ? "Sequential" : "All users") },
        line: { color: S.color(k.includes("then") ? "Sequential" : "All users"), width: 1.5 },
        fillcolor: "rgba(0,0,0,0)", hoverinfo: "x", showlegend: false,
      };
    }).reverse();
    S.plot("switchback", traces, {
      margin: { l: 170, t: 24 },
      xaxis: { tickprefix: "$", ticksuffix: "", separatethousands: true, showgrid: true, gridcolor: S.cssVar("--line"),
               title: { text: "Change in daily cost with the new rule", font: { size: 12 } },
               zeroline: true, zerolinecolor: S.cssVar("--ink-3") },
      yaxis: { tickprefix: "", ticksuffix: "", automargin: true },
      shapes: [{ type: "line", xref: "x", yref: "paper", x0: truth, x1: truth, y0: 0, y1: 1, line: { color: S.cssVar("--ink"), width: 1.2, dash: "dash" } }],
      annotations: [{ x: truth, y: 1, xref: "x", yref: "paper", text: `truth ${usd(truth)}/day`, showarrow: false, yanchor: "bottom", font: { size: 11 } }],
    });
    const mean = (k) => Math.round(data.switchback.estimates[k].reduce((a, b) => a + b, 0) / data.switchback.estimates[k].length);
    document.getElementById("switchback-sub").textContent =
      "Some changes apply to everyone at once, like how much cash to set aside each morning, so customers can't be split into groups. " +
      "Here the new rule sets the cash from the Project 1 forecast instead of a fixed 20% extra, and the test switches rules from day to day. " +
      `Running each rule for six weeks in a row gives opposite answers (${usd(mean("new_then_old"))} vs ${usd(mean("old_then_new"))} a day), ` +
      "depending on which rule happens to meet a busy period. Flipping a coin for each day gets the right answer. Each dot is one of 300 simulated tests.";
  }

  function drawDid() {
    const p = data.did.panels[state.scenario];
    const sum = data.did.summary.find((r) => r.scenario === state.scenario);
    const weeks = p["US→MX"].map((_, i) => i);
    const traces = ["US→MX", "US→GT"].map((c) => ({
      x: weeks, y: p[c], name: c === "US→MX" ? "U.S. → Mexico (launched 2.0%)" : "U.S. → Guatemala (no change)",
      type: "scatter", mode: "lines", line: { color: S.color(c), width: 2.2 },
      hovertemplate: `Week %{x}: %{y:.3f}<extra>${c}</extra>`,
    }));
    const lw = data.did.launch_week - 0.5;
    S.plot("did", traces, {
      hovermode: "x unified", margin: { t: 24 },
      xaxis: { title: { text: "Week", font: { size: 12 } }, showgrid: true, gridcolor: S.cssVar("--line") },
      yaxis: { tickprefix: "", ticksuffix: "", tickformat: ".2f", title: { text: "Revenue per user (pre-launch average = 1)", font: { size: 12 } } },
      shapes: [{ type: "line", xref: "x", yref: "paper", x0: lw, x1: lw, y0: 0, y1: 1, line: { color: S.cssVar("--ink"), width: 1.2, dash: "dash" } }],
      annotations: [{ x: lw, y: 1, xref: "x", yref: "paper", text: "launch", showarrow: false, yanchor: "bottom", font: { size: 11 } }],
    });
    const notes = {
      "Parallel trends": "The two countries move together before the launch, so Guatemala shows what Mexico would have done without it.",
      "Holiday boosts GT after launch": "A holiday lifts Guatemala after the launch, which makes Mexico's gain look smaller. The fake-launch check can't see it, because it happens after launch: only the calendar can.",
      "MX was already growing faster": "Mexico was already pulling ahead, and the method credits the launch with that growth. The fake-launch check catches it.",
    };
    document.getElementById("did-sub").textContent =
      "When a price launches in one country without a test group, compare it with a similar country that didn't change. The gap that opens after launch is the effect. " +
      `True effect +4.4%. Average estimate over 300 simulations: ${pct(sum.did)}. A check with a fake launch date (week 9), which should show nothing: ${pct(sum.placebo)}. ` + notes[state.scenario];
  }

  function drawAll() { drawEffects(); drawDemand(); drawReadout(); drawPeeking(); drawSwitchback(); drawDid(); }
  drawAll();
  S.onThemeChange(drawAll);
})();
