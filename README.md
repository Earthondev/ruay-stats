# RUAY Daily Stats

Public scraper for the RUAY login page at `https://www.ruay.org/login`.

This project also includes an official GLO-based lottery history dashboard built from
`https://www.glo.or.th/api/lottery/getLotteryResultByYear`.

It also includes a RUAY yikee VIP read-only dashboard built from the public
`https://www.ruay.org/login` page.

It now also includes a WAII public collector that inspects the public `https://wwii.one/`
frontend via headless Chrome, stores rendered snapshots, captures API diagnostics for
`https://api.waii.site`, and builds a static read-only pattern lab.

Live dashboard:

- `https://ruay-stats.vercel.app`
- Root URL redirects to `glo/dashboard/`
- RUAY yikee read-only dashboard lives at `https://ruay-stats.vercel.app/yikee/dashboard/`
- WAII read-only pattern lab lives at `https://ruay-stats.vercel.app/waii/dashboard/`

What it stores:

- `data/raw/*.html`: raw HTML snapshots for each run
- `data/snapshots/YYYY-MM-DD.json`: parsed snapshot for that day
- `data/results.csv`: normalized result history across runs
- `data/stats.json`: aggregated frequencies and latest values
- `reports/rules.md`: cleaned copy of the published rules text
- `reports/latest_summary.md`: human-readable daily summary
- `waii/data/raw/*.html`: latest rendered WAII page captures
- `waii/data/snapshots/*.json`: per-run WAII browser/api snapshot bundle
- `waii/data/history.json`: WAII history bundle with capture timeline and backtests

How to run:

```bash
python3 /Users/earthondev/Desktop/ruay-stats/fetch_ruay.py
python3 /Users/earthondev/Desktop/ruay-stats/build_glo_dashboard.py
python3 /Users/earthondev/Desktop/ruay-stats/build_ruay_yikee_dashboard.py
cd /Users/earthondev/Desktop/ruay-stats/waii/collector && npm install
cd /Users/earthondev/Desktop/ruay-stats/waii/collector && npm run fetch
python3 /Users/earthondev/Desktop/ruay-stats/build_waii_dashboard.py
```

Deployment:

- GitHub: `https://github.com/Earthondev/ruay-stats`
- Vercel project: `ruay-stats`
- Vercel CLI can deploy the linked project from this directory
- GitHub Actions deploys `main` to Vercel production and other branches/PRs to preview

Notes:

- The scraper only uses the public login page and does not require an account.
- Placeholder values such as `xxx`, `xx`, or `xxxxxx` are stored but excluded from numeric frequency stats.
- Running the script repeatedly on the same day updates matching records in `data/results.csv` instead of duplicating them.
- The GLO dashboard writes official history data to `glo/data/`, a ready-to-open dashboard bundle to `glo/dashboard/`,
  and a summary note to `glo/reports/summary.md`.
- The RUAY yikee dashboard writes a read-only history bundle to `yikee/data/`, a static dashboard to `yikee/dashboard/`,
  and a current summary note to `yikee/reports/summary.md`.
- The WAII collector writes browser-rendered HTML snapshots to `waii/data/raw/`, per-run snapshot bundles to
  `waii/data/snapshots/`, browser/network diagnostics to `waii/data/status.json`, normalized rows to
  `waii/data/results.csv`, a history bundle with capture timeline and pattern tests to `waii/data/history.json`,
  a static read-only pattern lab to `waii/dashboard/`, and a current summary note to `waii/reports/summary.md`.
- WAII Pattern Lab backtests are historical tests against captured observations only. They are for read-only analysis
  and monitoring, not betting instructions or proof that a rule works in the future.
