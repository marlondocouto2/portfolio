"""Export each project's backtest results into compact JSON for the site's interactive charts.

    python scripts/export_data.py
    python scripts/export_data.py --projects-dir ~/code   # if the project repos live elsewhere

Reads the `reports/` folder each project's pipeline writes, so run a project's
`scripts/run_pipeline.py` first when its results change, then re-export. Standard library only.
Values are written in $ millions.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "site" / "data"
M = 1e6


def _read_csv(path: Path) -> list[dict]:
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", newline="") as f:
        return list(csv.DictReader(f))


def _m(value: str, digits: int = 4) -> float | None:
    return None if value in ("", "nan", None) else round(float(value) / M, digits)


def _num(value: str, digits: int = 2) -> float | None:
    return None if value in ("", "nan", None) else round(float(value), digits)


def _series(rows: list[dict], key_cols: tuple[str, ...]) -> tuple[list[str], dict]:
    """Group backtest rows into aligned arrays: dates, and forecasts per key (model, horizon...)."""
    dates = sorted({r["date"] for r in rows})
    index = {d: i for i, d in enumerate(dates)}
    out: dict = defaultdict(lambda: [None] * len(dates))
    for r in rows:
        out[tuple(r[c] for c in key_cols)][index[r["date"]]] = _m(r["forecast"])
    return dates, out


def export_weekday(repo: Path) -> dict:
    """Project 1: one series, three models, horizons 1/7/30."""
    rows = _read_csv(repo / "reports" / "backtest_forecasts.csv.gz")
    dates, fc = _series(rows, ("model", "horizon"))
    actual = {r["date"]: _m(r["actual"]) for r in rows}
    models = ["SeasonalWeekday", "NaiveWeekly", "MovingAverage"]
    horizons = sorted({int(r["horizon"]) for r in rows})
    return {
        "title": "Weekday-seasonal forecaster",
        "repo": "https://github.com/marlondocouto2/weekday-seasonal-forecaster",
        "models": models,
        "horizons": horizons,
        "dates": dates,
        "actual": [actual[d] for d in dates],
        "forecasts": {m: {str(h): fc[(m, str(h))] for h in horizons} for m in models},
        "results": [
            {"model": r["model"], "horizon": int(r["horizon"]), "MAE": _m(r["MAE"]),
             "RMSE": _m(r["RMSE"]), "MAPE": _num(r["MAPE"]), "required_buffer": _m(r["required_buffer"])}
            for r in _read_csv(repo / "reports" / "results.csv")
        ],
        "by_weekday": [
            {"model": r["model"], "horizon": int(r["horizon"]), "weekday": r["weekday_name"],
             "MAE": _m(r["MAE"])}
            for r in _read_csv(repo / "reports" / "error_by_weekday.csv")
        ],
    }


def export_cashflow(repo: Path) -> dict:
    """Project 2: three corridors, five versions, horizons 1/7/30, with day-type flags."""
    rows = _read_csv(repo / "reports" / "backtest_forecasts.csv.gz")
    results = _read_csv(repo / "reports" / "results.csv")
    versions = sorted({r["model"] for r in rows})
    horizons = sorted({int(r["horizon"]) for r in rows})
    corridors = {}
    for corridor in ["MX", "PH", "IN"]:
        sub = [r for r in rows if r["corridor"] == corridor]
        dates, fc = _series(sub, ("model", "horizon"))
        first = {}
        for r in sub:
            first.setdefault(r["date"], r)
        day = [first[d] for d in dates]
        corridors[corridor] = {
            "dates": dates,
            "actual": [_m(r["actual"]) for r in day],
            "day_type": [r["day_type"] for r in day],
            "holiday_offset": [None if r["holiday_offset"] in ("", "nan") else int(float(r["holiday_offset"]))
                               for r in day],
            "is_spike": [r["is_spike"] == "True" for r in day],
            "is_scheduled": [r["is_scheduled"] == "True" for r in day],
            "forecasts": {v: {str(h): fc[(v, str(h))] for h in horizons} for v in versions},
        }
    money = ["MAE", "RMSE", "MAE_normal", "MAE_spike", "MAE_scheduled", "MAE_holiday",
             "required_buffer", "avg_cash_held"]
    return {
        "title": "Cash-flow forecaster with spikes and holidays",
        "repo": "https://github.com/marlondocouto2/cash-flow-forecaster",
        "versions": versions,
        "horizons": horizons,
        "corridors": corridors,
        "results": [
            {"model": r["model"], "horizon": int(r["horizon"]),
             **{k: _m(r[k]) for k in money},
             "idle_cash_cost_per_year": _num(r["idle_cash_cost_per_year"], 0),
             "MAE_vs_previous_pct": _num(r["MAE_vs_previous_pct"], 1),
             "MAE_vs_baseline_pct": _num(r["MAE_vs_baseline_pct"], 1)}
            for r in results
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--projects-dir", type=Path, default=ROOT.parent,
                        help="folder that contains the project repos (default: next to this repo)")
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    exports = {
        "weekday.json": export_weekday(args.projects_dir / "weekday-seasonal-forecaster"),
        "cashflow.json": export_cashflow(args.projects_dir / "cash-flow-forecaster"),
    }
    for name, data in exports.items():
        path = OUT / name
        path.write_text(json.dumps(data, separators=(",", ":")))
        print(f"Wrote {path.relative_to(ROOT)} ({path.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
