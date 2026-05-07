# CIO Dashboard — v2.1 Deploy Bundle

**v2.1 adds the Portfolio Mirror page.** Same drag-deploy as last time. This bundle includes everything from v2.0 (do not deploy v2.0 separately afterwards) plus the new portfolio additions.

## What's new in v2.1

| File | Purpose |
|---|---|
| `portfolio.html` | New page — sortable flat table of all positions with Refresh button |
| `netlify/functions/save_portfolio.js` | Workflow → save full snapshot to Blobs |
| `netlify/functions/get_portfolio.js` | Page reads here |
| `netlify/functions/trigger_refresh.js` | Proxy that forwards page → Beast n8n webhook (avoids CORS) |
| `cio_dashboard.html` | Updated — Quick Links now includes 💼 Portfolio Mirror |

Everything from v2.0 (8 other functions, 4 other HTML pages, config) is included unchanged.

## Deploy

1. Open https://app.netlify.com → `ciodailydashboard` → Deploys tab
2. Drag the `cio_dashboard_deploy` folder onto the drop zone
3. Wait ~60s for build

## How the Refresh button works

1. You click "Refresh Live Prices" on `/portfolio.html`
2. Browser POSTs to `/.netlify/functions/trigger_refresh`
3. That proxy forwards to `https://beast.tail53158a.ts.net/webhook/refresh-prices`
4. n8n workflow (`w9dWIxuN36xTsaAZ` — "Refresh Open Stocks Prices") runs:
   - Reads `1_Open_Stocks`
   - Dedupes tickers across accounts
   - Calls TWS Bridge for live prices on each unique ticker
   - Updates `Current Price` column in the sheet
   - Updates `Prices Last Refreshed` timestamp cell A1
   - **NEW:** posts the full structured snapshot to `save_portfolio` on Netlify
   - Responds to webhook
5. Page receives success → reloads from `get_portfolio`

## Pre-requisite: workflow modifications + activation

The "Refresh Open Stocks Prices" workflow on Beast (`w9dWIxuN36xTsaAZ`) needs:
- A new code node before "Respond to Webhook" that builds the structured payload
- A new HTTP Request node that POSTs to `/.netlify/functions/save_portfolio`
- Activation (it's currently inactive)

I'll do the workflow modifications via Beast MCP after you confirm the Netlify deploy is live. Then you'll need to **activate the workflow once via the n8n UI** so the webhook gets registered. After that the Refresh button just works.

## Pre-requisite: n8n must be reachable from Netlify

The page calls Beast through the Tailscale Funnel hostname `beast.tail53158a.ts.net`. For this to work:
- That hostname must serve n8n's webhook endpoint publicly
- Webhook path must be `/webhook/refresh-prices`

If n8n isn't currently exposed via Tailscale Funnel (only Beast MCP is), you have two options:
1. **Run `tailscale funnel 5678`** on Beast (n8n's port) — same Funnel pattern as Beast MCP
2. **Use cloudflared tunnel** to expose `localhost:5678` and update `WEBHOOK_URL` in `trigger_refresh.js`

Either way works. Tell me which you set up and I'll confirm the URL is right.

## Verifying after deploy

1. Open https://ciodailydashboard.netlify.app/portfolio.html
2. You should see "No data yet — click Refresh to populate." and the table empty-state.
3. The 💼 Portfolio Mirror link should appear in the main dashboard's left sidebar Quick Links.
4. Don't click Refresh yet — the workflow on Beast hasn't been modified.

After I modify the workflow + you activate it, click Refresh. You'll see:
- "Triggering Beast workflow…" toast
- ~10–20 second wait while TWS Bridge fetches all prices
- "Refresh complete · reloading data" toast
- Table populates with 76 rows, sorted by Unrealized $ descending
- Click any column header to re-sort. Click again to reverse direction.

## Troubleshooting

- **Refresh fails with "beast_unreachable"** → n8n isn't exposed publicly. Set up Tailscale Funnel on port 5678 or use cloudflared. Update `WEBHOOK_URL` in `trigger_refresh.js` if needed.
- **Refresh fails with "beast_timeout"** → Workflow took >60s. Could be TWS Bridge slow, or many tickers. Check n8n executions log.
- **Table loads but Day Δ% is `—` for everything** → TWS Bridge `/price/{ticker}` doesn't include `dayChangePct` natively. The workflow can compute it from the Yahoo daily closes the Bridge fetches; if not, we'll add an FMP fallback.
- **Numbers look stale** → The dashboard reads from Blobs (last save). If the workflow ran but didn't post to `save_portfolio`, only the sheet got updated. Check workflow execution log for the new HTTP node.

<!-- Push pipeline test 2026-05-06 -->
