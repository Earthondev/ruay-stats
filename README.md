# RUAY Daily Stats

Public scraper for the RUAY login page at `https://www.ruay.org/login`.

This project also includes an official GLO-based lottery history dashboard built from
`https://www.glo.or.th/api/lottery/getLotteryResultByYear`.

It also includes a RUAY yikee VIP read-only dashboard built from the public
`https://www.ruay.org/login` page.

Live dashboard:

- `https://ruay-stats.vercel.app`
- Root URL redirects to `glo/dashboard/`
- RUAY yikee read-only dashboard lives at `https://ruay-stats.vercel.app/yikee/dashboard/`

What it stores:

- `data/raw/*.html`: raw HTML snapshots for each run
- `data/snapshots/YYYY-MM-DD.json`: parsed snapshot for that day
- `data/results.csv`: normalized result history across runs
- `data/stats.json`: aggregated frequencies and latest values
- `reports/rules.md`: cleaned copy of the published rules text
- `reports/latest_summary.md`: human-readable daily summary

How to run:

```bash
python3 /Users/earthondev/Desktop/ruay-stats/fetch_ruay.py
python3 /Users/earthondev/Desktop/ruay-stats/build_glo_dashboard.py
python3 /Users/earthondev/Desktop/ruay-stats/build_ruay_yikee_dashboard.py
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
