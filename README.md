# Portfolio site

Source for my forecasting portfolio: an interactive, static site with one page per project.
Charts are drawn in the browser with [Plotly.js](https://plotly.com/javascript/) from data
exported out of each project's backtest results.

| Page | Project repo |
|---|---|
| [Weekday-seasonal forecaster](site/weekday-seasonal.html) | [weekday-seasonal-forecaster](https://github.com/marlondocouto2/weekday-seasonal-forecaster) |
| [Cash-flow forecaster](site/cash-flow.html) | [cash-flow-forecaster](https://github.com/marlondocouto2/cash-flow-forecaster) |

## How it fits together

```
project repos (reports/*.csv)  ->  scripts/export_data.py  ->  site/data/*.json  ->  site/*.html + Plotly
```

- `site/` is the whole website: plain HTML, CSS and JavaScript, no build step.
- `site/data/` holds the exported results and is committed, so the site never needs to run the
  models.
- `.github/workflows/pages.yml` publishes `site/` to GitHub Pages on every push to `main`.

## Updating the data

The project repos are expected next to this one (`../weekday-seasonal-forecaster`,
`../cash-flow-forecaster`). After re-running a project's pipeline:

```bash
python scripts/export_data.py
```

Use `--projects-dir PATH` if the repos live elsewhere. The script uses only the Python standard
library.

## Previewing locally

```bash
python3 -m http.server 8765 --directory site
```

Then open http://localhost:8765. Opening the HTML files directly doesn't work, because the pages
load their data with `fetch`.

## Adding a project

1. Add an `export_<project>()` function to `scripts/export_data.py`.
2. Copy one of the project pages and its script in `site/assets/` as a starting point.
3. Add the page to the navigation in each HTML file and a card on `site/index.html`.

## Custom domain

The site is served at `https://marlondocouto2.github.io/portfolio/` until a custom domain is
set up under **Settings → Pages**.
