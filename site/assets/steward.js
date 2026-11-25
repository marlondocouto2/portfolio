// Project 5 page: an AI agent that maintains the FX margin model, vs non-AI baselines.
(async function () {
  "use strict";
  const S = window.Site;
  let data;
  try { data = await S.loadJSON("data/steward.json"); } catch (e) { S.showError(e); return; }

  const TESTS = {
    weak_sample: ["Weak starting model",
      "Each week starts from a simple trend, so there's real improvement to find. Same 16 weeks for every reviewer."],
    strong_sample: ["Strong starting model",
      "Each week starts from Project 3's best model, so there's little to improve. Same 16 weeks for every reviewer."],
    strong_all: ["Strong, 136 weeks (no AI)",
      "Every Friday from January 2024 to August 2026, starting from Project 3's best model. The AI ran only on 16 of these weeks."],
  };
  // Plain names for the reviewers; the data keeps the original names.
  const NAME = { "Never retrain": "Never change", "Scripted playbook": "Fixed checklist",
                 "Optuna automation": "Automated search", "AI agent": "AI reviewer" };
  const M = (m) => NAME[m] || m;
  const state = { test: "weak_sample", memoTest: "weak", week: null, methods: new Set(["Scripted playbook", "Optuna automation"]) };
  const fmtPct = (v) => (Math.abs(v) < 0.005 ? "0.00%" : `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}%`);

  // ---- KPI tiles
  const weak = data.tests.weak_sample, strongAll = data.tests.strong_all;
  const get = (rows, m) => rows.find((r) => r.method === m);
  const agentWeak = get(weak, "AI agent");
  const avg = (arr, k) => arr.reduce((a, w) => a + w.used[k], 0) / arr.length;
  document.getElementById("kpis").innerHTML = [
    [fmtPct(agentWeak.change_pct), `change in the forecast's miss when the AI reviews a weak model (checklist ${fmtPct(get(weak, "Scripted playbook").change_pct)}, automated search ${fmtPct(get(weak, "Optuna automation").change_pct)})`],
    [`${avg(data.agent.weak, "backtest").toFixed(1)} of 15`, "tests a week used by the AI (automated search used 14)"],
    [`${fmtPct(get(strongAll, "Scripted playbook").if_rule_ignored_pct)} → ${fmtPct(get(strongAll, "Scripted playbook").change_pct)}`, "the checklist's result without the safety rule → with it (strong model, 136 weeks)"],
    ["$0", "to run: the AI uses an existing Claude plan, with no extra bill"],
  ].map(([v, l]) => `<div class="kpi"><div class="value">${v}</div><div class="label">${l}</div></div>`).join("");

  // ---- Test comparison
  S.segmented("test", Object.entries(TESTS).map(([k, [label]]) => [k, label]), state.test, (t) => { state.test = t; drawTests(); });

  function drawTests() {
    const rows = data.tests[state.test].filter((r) => r.method !== "Never retrain");
    const names = rows.map((r) => M(r.method).replace(" ", "<br>"));  // two-line labels fit on phones
    const lab = (v) => fmtPct(v);
    const colors = rows.map((r) => S.color(r.method));
    const lim = Math.max(1.2, ...rows.flatMap((r) => [Math.abs(r.change_pct), Math.abs(r.if_rule_ignored_pct)])) * 1.3;
    S.plot("tests", [
      { type: "bar", name: "With the safety rule", x: names, y: rows.map((r) => r.change_pct),
        marker: { color: colors }, text: rows.map((r) => lab(r.change_pct)), textposition: "outside", cliponaxis: false,
        hovertemplate: "%{x}<br>With the rule: %{text}<extra></extra>" },
      { type: "bar", name: "If every proposal were accepted", x: names, y: rows.map((r) => r.if_rule_ignored_pct),
        marker: { color: colors, opacity: 0.35, pattern: { shape: "/", fgcolor: colors, size: 6 } },
        text: rows.map((r) => lab(r.if_rule_ignored_pct)), textposition: "outside", cliponaxis: false,
        hovertemplate: "%{x}<br>Every proposal accepted: %{text}<extra></extra>" },
    ], {
      barmode: "group",
      xaxis: { tickangle: 0 },
      yaxis: { tickprefix: "", ticksuffix: "%", range: [-lim, lim], zeroline: true, zerolinecolor: S.cssVar("--ink-3"),
               title: { text: "Change in miss vs never changing", font: { size: 11 } } },
      margin: { t: 24, l: 64 },
    });
    const never = get(data.tests[state.test], "Never retrain");
    document.getElementById("tests-sub").textContent = TESTS[state.test][1] +
      " Lower is better. Solid bars: what happened with the safety rule (explained below). " +
      "Striped bars: what would have happened if every proposed replacement had been accepted.";
    const best = Math.min(...rows.map((r) => r.change_pct));
    document.getElementById("tests-table").innerHTML =
      "<thead><tr><th>Reviewer</th><th>Replacements made</th><th>Replacements proposed</th><th>Average miss, next 12 weeks</th>" +
      "<th>vs never changing</th><th>If every proposal were accepted</th><th>Reports passed first try</th></tr></thead><tbody>" +
      data.tests[state.test].map((r) => `<tr${r.method !== "Never retrain" && r.change_pct === best && best < 0 ? ' class="best"' : ""}>` +
        `<td>${M(r.method)}</td><td>${r.switches}</td><td>${r.promotion_tests}</td><td>${r.future_mae_bps.toFixed(2)} bps</td>` +
        `<td>${r.method === "Never retrain" ? "–" : fmtPct(r.change_pct)}</td>` +
        `<td>${r.method === "Never retrain" ? "–" : fmtPct(r.if_rule_ignored_pct)}</td>` +
        `<td>${r.method === "AI agent" ? Math.round(r.first_try * 100) + "%" : "automatic"}</td></tr>`).join("") + "</tbody>";
  }

  // ---- Memo viewer
  const weekSelect = document.getElementById("memo-week");
  function fillWeeks() {
    const weeks = data.agent[state.memoTest];
    weekSelect.innerHTML = weeks.map((w) => `<option value="${w.cutoff}">${w.cutoff} · ${w.decision === "switch" ? "replace" : "keep"}</option>`).join("");
    const firstSwitch = weeks.find((w) => w.decision === "switch");
    state.week = (firstSwitch || weeks[0]).cutoff;
    weekSelect.value = state.week;
  }
  S.segmented("memo-test", [["weak", "Weak"], ["strong", "Strong"]], state.memoTest, (t) => {
    state.memoTest = t; fillWeeks(); drawMemo();
  });
  weekSelect.addEventListener("change", () => { state.week = weekSelect.value; drawMemo(); });

  // A model's technical label (e.g. "lightgbm[mk,lag] tuned 1y refit7 hl5") in plain words.
  const FAMILY = { ewma: "Simple trend", ridge: "Trend + Ridge", xgboost: "Trend + XGBoost", lightgbm: "Trend + LightGBM" };
  const INPUT = { fx: "currency moves", vol: "volatility", dxy: "the dollar index", mk: "markup",
                  cal: "calendar", lag: "recent errors" };
  const WINDOW = { all: "all history", "3y": "the last 3 years", "2y": "the last 2 years", "1y": "the last year" };
  function plain(label) {
    const m = label.match(/^(\w+)(?:\[([^\]]*)\])?( tuned)? (\w+) refit(\d+)/);
    if (!m) return label;
    const parts = [FAMILY[m[1]] || m[1]];
    if (m[2]) {
      const ins = m[2].split(",").map((k) => INPUT[k] || k);
      parts.push(`using ${ins.length > 1 ? ins.slice(0, -1).join(", ") + " and " + ins[ins.length - 1] : ins[0]}`);
    }
    if (m[3]) parts.push("tuned");
    parts.push(`trained on ${WINDOW[m[4]] || m[4]}`, m[5] === "7" ? "updated weekly" : "updated monthly");
    return parts.join(", ");
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function drawMemo() {
    const w = data.agent[state.memoTest].find((x) => x.cutoff === state.week);
    const diff = w.chosen_future_mae_bps - w.start_future_mae_bps;
    const outcome = w.decision === "switch"
      ? `Over the next 12 weeks the new model missed by ${w.chosen_future_mae_bps.toFixed(2)} bps on average, vs ${w.start_future_mae_bps.toFixed(2)} bps for the old one (${diff > 0 ? "worse" : "better"} by ${Math.abs(diff).toFixed(2)} bps; 100 bps = 1%).`
      : `Over the next 12 weeks the model it kept missed by ${w.start_future_mae_bps.toFixed(2)} bps on average (100 bps = 1%).`;
    document.getElementById("memo").innerHTML =
      (w.decision === "switch"
        ? `<div class="head"><span class="badge switch">Replace</span><span><strong>Replaced</strong> ${esc(plain(w.start))} ` +
          `<strong>with</strong> ${esc(plain(w.chosen))}</span></div>` +
          `<p class="meta">Technical names: <code>${esc(w.start)}</code> → <code>${esc(w.chosen)}</code></p>`
        : `<div class="head"><span class="badge keep">Keep</span><span><strong>Kept</strong> ${esc(plain(w.chosen))}</span></div>` +
          `<p class="meta">Technical name: <code>${esc(w.chosen)}</code></p>`) +
      `<p><strong>What changed:</strong> ${esc(w.diagnosis)}</p>` +
      `<ul>${w.evidence.map((e) => `<li>${esc(e.claim)} <span class="ids">${e.ledger_ids.join(", ")}</span></li>`).join("")}</ul>` +
      `<p><strong>Risks:</strong> ${esc(w.risks)}</p>` +
      `<p><strong>Watch next week:</strong> ${esc(w.watch)}</p>` +
      `<p class="meta">Tests used: ${w.used.backtest} of 15, tuning runs ${w.used.tune} of 2, safety-rule checks ${w.used.promote} of 1. ` +
      `Report accepted on try ${w.submissions}. ${outcome}</p>`;
    const cited = new Set(w.evidence.flatMap((e) => e.ledger_ids));
    document.getElementById("ledger").innerHTML = "<thead><tr><th>Id</th><th>Step</th><th>Result (highlighted: cited in the report)</th></tr></thead><tbody>" +
      w.ledger.map((e) => `<tr${cited.has(e.id) ? ' class="hl"' : ""}><td>${e.id}</td><td>${e.command}</td><td>${esc(e.summary)}</td></tr>`).join("") +
      "</tbody>";
  }

  // ---- Timeline
  const TL = ["Scripted playbook", "Optuna automation"];
  S.chips("methods", TL, state.methods, drawTimeline, M);
  function drawTimeline() {
    const traces = [];
    TL.filter((m) => state.methods.has(m)).forEach((m) => {
      const rows = data.timeline.filter((w) => w.method === m && w.proposed_vs_never !== null);
      const sw = rows.filter((w) => w.decision === "switch");
      traces.push({ type: "scatter", mode: "markers", name: `${M(m)}: proposed`, x: rows.map((w) => w.cutoff), y: rows.map((w) => w.proposed_vs_never),
        marker: { color: S.color(m), size: 7, opacity: 0.45 }, text: rows.map((w) => w.proposed),
        hovertemplate: "%{x}<br>%{text}<br>%{y:+.2f} bps vs keeping the model<extra></extra>" });
      traces.push({ type: "scatter", mode: "markers", name: `${M(m)}: replaced`, x: sw.map((w) => w.cutoff), y: sw.map((w) => w.chosen_vs_never),
        marker: { color: S.color(m), size: 11, line: { color: S.cssVar("--ink"), width: 1.5 } }, text: sw.map((w) => w.proposed),
        hovertemplate: "%{x}<br>Replaced with %{text}<br>%{y:+.2f} bps vs keeping the model<extra></extra>" });
    });
    S.plot("timeline", traces, {
      xaxis: { type: "date" },
      yaxis: { tickprefix: "", ticksuffix: " bps", zeroline: true, zerolinecolor: S.cssVar("--ink-3") },
      margin: { t: 12 },
    });
  }

  function drawAll() { drawTests(); drawMemo(); drawTimeline(); }
  fillWeeks();
  drawAll();
  S.onThemeChange(drawAll);
})();
