# Fund Explorer

Compare Vanguard and Schwab index funds (plus international, bonds, gold/silver and benchmarks) through the dot-com crash, 2008, COVID and 2022. Runs entirely in the browser on GitHub Pages; weekly data refreshes itself through a GitHub Action.

**For research, not advice.** Prices come from public providers and can contain errors.

## First-time setup
1. Repo **Settings → Pages → Source: GitHub Actions**.
2. **Actions → "Refresh fund data and deploy" → Run workflow.** The first run downloads all history (a few minutes) and publishes the site at `https://<your-user>.github.io/fund-explorer/`.
3. After that it refreshes every Saturday automatically.

If the `.github` folder didn't upload, create `.github/workflows/refresh-and-deploy.yml` in the GitHub web editor and paste in `docs/refresh-and-deploy.yml.txt`.

Optional: add a free [Tiingo](https://tiingo.com) key as repo secret `TIINGO_API_KEY`; it is used only as a per-fund fallback when Yahoo has no data.

## Local development
```
npm install
python scripts/make_sample_data.py --out preview-data   # invented data, preview only
npm run dev
npm test
```
Data script: `pip install -r scripts/requirements.txt && python scripts/fetch_data.py` (`--only VFIAX,VBTLX` for a subset).

## What's in it
- **Chart** of up to 8 funds plus 4 benchmark lines, with stress-period shading, log scale, drop-from-peak view and an editable vertical axis.
- **Fund picker** with filters (asset class, theme, mix, region, provider, type, format, history) and search.
- **My mix:** press *Build my mix* above the table, type a weight (percent or dollars) next to each fund, and the combined result becomes the bold line and the top table row. Choose how often it rebalances.
- **Holdings and AI/software exposure:** each fund's info box lists its biggest holdings with AI and software labels; the table can show technology weight and AI/software share. Yahoo Finance only discloses the top 10 holdings, so exposure for broad funds is understated. Labels come from `catalog/themes.json` (my judgement calls, edit freely).
- **Downturn results:** *Show downturn results* adds each fund's return in the dot-com crash, 2008, COVID and 2022. Click a column to rank.

## Adding or editing funds
Edit `catalog/funds.json` (names, tickers, descriptions, `tags` such as defensive / ai-software / tax-managed, which ticker supplies data and any older share class it `extends`). Blends are entries with `data.type = "blend"` and a weights table. Verify descriptions against the fund's official page. `scripts/add_catalog_entries.py` shows how the second batch was added and is a handy template.

## URL parameters
Everything on screen (funds, filters, zoom window, axis, columns, sort, my-mix weights `w=VFIAX:50,VBTLX:50`, rebalance `rb=m|q|y|n`) lives in the URL hash; defaults are omitted. Use **Copy link to this view**.

## Architecture
React + TypeScript + Vite + ECharts. Public market data lives in `public/data` (JSON). Routes are `#/funds`, leaving room for future modules (retirement projections, etc.).

**Never put personal financial information in this repo — GitHub Pages sites are public.**
