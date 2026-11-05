# Groundwork Forecaster

Groundwork Forecaster walks a first-time owner through the numbers behind a new restaurant or small shop and produces a 36-month forecast a lender can read. You enter an address and a concept, and it fills in local wages, rent, licenses, price levels and seasonality from public government data. Every default explains where it came from, and you can change all of them.

**Live demo:** https://nickbitzis.github.io/groundwork-forecaster/

## What it does

- **Location and concept.** Type an address or pick one of 393 US metros. Choose from 14 concepts, from steakhouse to food truck, and set square feet, hours, alcohol and menu prices.
- **Guided plan.** Eleven short steps cover ticket size, volume, ramp-up, seasonality, cost of goods, staffing, rent, other expenses, the startup budget and financing. A live estimate of break-even, lowest cash and DSCR updates as you go.
- **Results.** Monthly P&L and cash flow, break-even month, lowest cash point, DSCR by year, and a downside case.
- **Break-even solver.** It answers questions like "what does my average ticket need to be to keep cash above $50K?" and applies the answer to the plan.
- **Scenarios.** You can save named versions of a plan and compare them side by side.
- **Excel export.** It produces a lender-ready workbook with a summary, monthly detail, downside case, labor detail, startup budget and assumptions.

Volume comes from the space and the hours: seats times turns times how full, by meal period, with weekdays and weekends handled separately. Staffing comes from seats, covers per hour and hours open, at local wages. Payroll burden is built from its parts: FICA, FUTA, state unemployment, workers comp and benefits.

## Data sources

All of these are free and public.

| What | Source |
|---|---|
| Wages by job, every metro | BLS Occupational Employment and Wage Statistics, May 2025 |
| Minimum and tipped wage, unemployment tax | State labor departments and the US Department of Labor |
| Local price level | BEA Regional Price Parities, 2024 |
| Restaurant sales per location, payroll share | Census 2022 Economic Census and County Business Patterns |
| Seasonality | Census Monthly Retail Trade; NOAA climate normals |
| Rent, build-out and licenses for five cities | Broker reports, state liquor boards, city fee schedules |
| Address lookup and nearby places | OpenStreetMap Nominatim and Overpass, FCC Area API (live, in the browser) |

Outside the five curated cities, rent is an estimate scaled from BEA prices, and the app labels it that way.

## Run it

```bash
npm install
npm run dev      # local dev server
npm test         # 49 tests on the engine, solver, localization and scenarios
npm run build    # one self-contained HTML file in dist/
```

To rebuild the data pack from the raw public files (about 60 MB of downloads):

```bash
cd data && uv run --project pipeline python pipeline/build_datapack.py --download
```

## Stack

TypeScript, React and Vite. The forecast engine in `src/engine/` is plain TypeScript with no UI code, so it is easy to test and could move behind an API unchanged. SheetJS writes the Excel file. Everything runs in the browser, so there is nothing to host beyond a static page. The live demo is the built file on the `gh-pages` branch.

## Layout

| Path | What it is |
|---|---|
| `src/engine/forecast.ts` | 36-month engine: revenue, costs, loan, cash, break-even |
| `src/engine/solver.ts` | Reverse solver (bisection on a ticket or volume multiplier) |
| `src/engine/excel.ts` | Lender workbook |
| `src/local/` | Concepts, data pack access, localization, live lookups |
| `src/ui/` | Wizard steps, results, charts, scenario comparison |
| `data/pipeline/` | Python script that builds `src/data/datapack.json` from public files |

## Limits

Concept benchmarks such as plate costs, turns and staffing ratios are industry rules of thumb, and the app labels them as such. Workers comp uses a national average rate. This is a planning tool, not financial advice.
