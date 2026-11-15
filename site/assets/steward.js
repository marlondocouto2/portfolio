// Project 5 page: an AI agent that maintains the FX margin model, vs non-AI baselines.
(async function () {
  "use strict";
  const S = window.Site;
  let data;
  try { data = await S.loadJSON("data/steward.json"); } catch (e) { S.showError(e); return; }

  const TESTS = {
    weak_sample: ["Weak champion · 16 weeks",
      "Each week starts from stage 1 only (an EWMA with no machine-learning stage), so there is real improvement to find. " +
      "Same 16 sampled weeks, same budget and rule for every method."],
    strong_sample: ["Strong champion · 16 weeks",
      "Each week starts from Project 3's tuned XGBoost. The 16 weeks sampled for the AI agent: equal shares of calm, normal and volatile markets."],
    strong_all: ["Strong champion · 136 weeks (no AI)",
      "Every Friday from January 2024 to August 2026, starting from Project 3's tuned XGBoost. The AI agent ran only on the 16 sampled weeks."],
  };
  const state = { test: "weak_sample", memoTest: "weak", week: null, methods: new Set(["Scripted playbook", "Optuna automation"]) };
  const fmtPct = (v) => (Math.abs(v) < 0.005 ? "0.00%" : `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}%`);

  // ---- KPI tiles
  const weak = data.tests.weak_sample, strongAll = data.tests.strong_all;
  const get = (rows, m) => rows.find((r) => r.method === m);
  const agentWeak = get(weak, "AI agent");
  const avg = (arr, k) => arr.reduce((a, w) => a + w.used[k], 0) / arr.length;
  document.getElementById("kpis").innerHTML = [
    [fmtPct(agentWeak.change_pct), `future error vs never retraining, weak champion (scripted ${fmtPct(get(weak, "Scripted playbook").change_pct)}, Optuna ${fmtPct(get(weak, "Optuna automation").change_pct)})`],
    [`${avg(data.agent.weak, "backtest").toFixed(1)} of 15`, "backtests a week used by the agent with a weak champion (Optuna: 14)"],
    [`${fmtPct(get(strongAll, "Scripted playbook").if_rule_ignored_pct)} → ${fmtPct(get(strongAll, "Scripted playbook").change_pct)}`, "future error from accepting every proposal vs with the promotion rule, strong champion, 136 weeks"],
    ["$0", "to run: the agent uses an existing Claude plan, no API bill"],
  ].map(([v, l]) => `<div class="kpi"><div class="value">${v}</div><div class="label">${l}</div></div>`).join("");

  // ---- Test comparison
  S.segmented("test", Object.entries(TESTS).map(([k, [label]]) => [k, label]), state.test, (t) => { state.test = t; drawTests(); });

  function drawTests() {
    const rows = data.tests[state.test].filter((r) => r.method !== "Never retrain");
    const names = rows.map((r) => r.method.replace(" ", "<br>"));  // two-line labels fit on phones
    const lab = (v) => fmtPct(v);
    const colors = rows.map((r) => S.color(r.method));
    const lim = Math.max(1.2, ...rows.flatMap((r) => [Math.abs(r.change_pct), Math.abs(r.if_rule_ignored_pct)])) * 1.3;
    S.plot("tests", [
      { type: "bar", name: "With the promotion rule", x: names, y: rows.map((r) => r.change_pct),
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
               title: { text: "Error, next 12 weeks, vs never retraining", font: { size: 11 } } },
      margin: { t: 24, l: 64 },
    });
    const never = get(data.tests[state.test], "Never retrain");
    document.getElementById("tests-sub").textContent = TESTS[state.test][1] +
      ` Lower is better. Never retraining scored ${never.future_mae_bps.toFixed(2)} bps over the following 12 weeks.`;
    const best = Math.min(...rows.map((r) => r.change_pct));
    document.getElementById("tests-table").innerHTML =
      "<thead><tr><th>Method</th><th>Switches</th><th>Promotion tests</th><th>Future MAE</th><th>vs never</th>" +
      "<th>If every proposal were accepted</th><th>Memos passed first try</th></tr></thead><tbody>" +
      data.tests[state.test].map((r) => `<tr${r.method !== "Never retrain" && r.change_pct === best && best < 0 ? ' class="best"' : ""}>` +
        `<td>${r.method}</td><td>${r.switches}</td><td>${r.promotion_tests}</td><td>${r.future_mae_bps.toFixed(2)} bps</td>` +
        `<td>${r.method === "Never retrain" ? "–" : fmtPct(r.change_pct)}</td>` +
        `<td>${r.method === "Never retrain" ? "–" : fmtPct(r.if_rule_ignored_pct)}</td>` +
        `<td>${r.method === "AI agent" ? Math.round(r.first_try * 100) + "%" : "templated"}</td></tr>`).join("") + "</tbody>";
  }

  // ---- Memo viewer
  const weekSelect = document.getElementById("memo-week");
  function fillWeeks() {
    const weeks = data.agent[state.memoTest];
    weekSelect.innerHTML = weeks.map((w) => `<option value="${w.cutoff}">${w.cutoff} · ${w.decision}</option>`).join("");
    const firstSwitch = weeks.find((w) => w.decision === "switch");
    state.week = (firstSwitch || weeks[0]).cutoff;
    weekSelect.value = state.week;
  }
  S.segmented("memo-test", [["weak", "Weak (EWMA only)"], ["strong", "Strong (tuned XGBoost)"]], state.memoTest, (t) => {
    state.memoTest = t; fillWeeks(); drawMemo();
  });
  weekSelect.addEventListener("change", () => { state.week = weekSelect.value; drawMemo(); });

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function drawMemo() {
    const w = data.agent[state.memoTest].find((x) => x.cutoff === state.week);
    const diff = w.chosen_future_mae_bps - w.start_future_mae_bps;
    const outcome = w.decision === "switch"
      ? `Over the next 12 weeks the new champion scored ${w.chosen_future_mae_bps.toFixed(2)} bps vs ${w.start_future_mae_bps.toFixed(2)} bps for the old one (${diff > 0 ? "+" : "−"}${Math.abs(diff).toFixed(2)} bps).`
      : `Over the next 12 weeks the champion scored ${w.start_future_mae_bps.toFixed(2)} bps.`;
    document.getElementById("memo").innerHTML =
      `<div class="head"><span class="badge ${w.decision}">${w.decision === "switch" ? "Switch" : "Keep"}</span>` +
      `<strong>Champion: <code>${esc(w.chosen)}</code></strong></div>` +
      `<p><strong>What changed:</strong> ${esc(w.diagnosis)}</p>` +
      `<ul>${w.evidence.map((e) => `<li>${esc(e.claim)} <span class="ids">${e.ledger_ids.join(", ")}</span></li>`).join("")}</ul>` +
      `<p><strong>Risks:</strong> ${esc(w.risks)}</p>` +
      `<p><strong>Watch next week:</strong> ${esc(w.watch)}</p>` +
      `<p class="meta">Budget used: ${w.used.backtest} of 15 backtests, ${w.used.tune} of 2 tunes, ${w.used.promote} of 1 promotion test. ` +
      `Memo accepted on try ${w.submissions}. ${outcome}</p>`;
    const cited = new Set(w.evidence.flatMap((e) => e.ledger_ids));
    document.getElementById("ledger").innerHTML = "<thead><tr><th>Id</th><th>Command</th><th>Result</th></tr></thead><tbody>" +
      w.ledger.map((e) => `<tr${cited.has(e.id) ? ' class="hl"' : ""}><td>${e.id}</td><td>${e.command}</td><td>${esc(e.summary)}</td></tr>`).join("") +
      "</tbody>";
  }

  // ---- Timeline
  const TL = ["Scripted playbook", "Optuna automation"];
  S.chips("methods", TL, state.methods, drawTimeline);
  function drawTimeline() {
    const traces = [];
    TL.filter((m) => state.methods.has(m)).forEach((m) => {
      const rows = data.timeline.filter((w) => w.method === m && w.proposed_vs_never !== null);
      const sw = rows.filter((w) => w.decision === "switch");
      traces.push({ type: "scatter", mode: "markers", name: `${m}: proposal`, x: rows.map((w) => w.cutoff), y: rows.map((w) => w.proposed_vs_never),
        marker: { color: S.color(m), size: 7, opacity: 0.45 }, text: rows.map((w) => w.proposed),
        hovertemplate: "%{x}<br>%{text}<br>%{y:+.2f} bps vs the champion<extra></extra>" });
      traces.push({ type: "scatter", mode: "markers", name: `${m}: switch made`, x: sw.map((w) => w.cutoff), y: sw.map((w) => w.chosen_vs_never),
        marker: { color: S.color(m), size: 11, line: { color: S.cssVar("--ink"), width: 1.5 } }, text: sw.map((w) => w.proposed),
        hovertemplate: "%{x}<br>Switched to %{text}<br>%{y:+.2f} bps vs the champion<extra></extra>" });
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
