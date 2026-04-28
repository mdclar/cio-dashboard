// POST /.netlify/functions/trigger_refresh
// Thin proxy: forwards a POST to the Beast n8n webhook that triggers
// "Refresh Open Stocks Prices" + "save_portfolio" pipeline.
//
// The actual webhook URL is hardcoded here so the dashboard JS doesn't expose it
// or hit CORS issues. If the Beast public URL changes, update WEBHOOK_URL.

const WEBHOOK_URL = 'https://beast.tail53158a.ts.net/webhook/refresh-prices';

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json',
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'method_not_allowed' }) };
    }

    try {
        const ctrl = new AbortController();
        const timeoutId = setTimeout(() => ctrl.abort(), 60000);
        const res = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: event.body || '{}',
            signal: ctrl.signal
        });
        clearTimeout(timeoutId);

        const text = await res.text();
        let body;
        try { body = JSON.parse(text); } catch { body = { raw: text }; }

        return {
            statusCode: res.ok ? 200 : 502,
            headers,
            body: JSON.stringify({
                ok: res.ok,
                upstream_status: res.status,
                upstream: body
            })
        };
    } catch (e) {
        const isTimeout = e.name === 'AbortError';
        return {
            statusCode: 504,
            headers,
            body: JSON.stringify({
                error: isTimeout ? 'beast_timeout' : 'beast_unreachable',
                details: e.message,
                hint: 'Check that the Refresh Open Stocks Prices workflow is active in n8n and the Tailscale Funnel for n8n is exposing the webhook publicly.'
            })
        };
    }
};
