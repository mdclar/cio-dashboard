// POST /.netlify/functions/save_portfolio
// Body shape (from "Refresh Open Stocks Prices" workflow):
// {
//   generated_at: ISO timestamp,
//   timestamp_label: "MM/DD/YYYY, hh:mm:ss AM/PM ET",
//   refresh_count: <number of tickers refreshed>,
//   summary: {
//     total_positions: <int>,
//     total_cost_basis: <float>,
//     total_market_value: <float>,
//     total_unrealized: <float>,
//     total_unrealized_pct: <float>,
//     account_count: <int>
//   },
//   positions: [{
//     ticker, name, shares, avg_cost, total_cost,
//     current_price, day_change_pct, current_value,
//     unrealized, unrealized_pct, account, sector
//   }, ...]
// }

const { getStore } = require('@netlify/blobs');

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

    let payload;
    try {
        payload = JSON.parse(event.body || '{}');
    } catch (e) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid_json', details: e.message }) };
    }

    if (!payload || !Array.isArray(payload.positions)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'missing_positions_array' }) };
    }

    try {
        const store = getStore('cio_dashboard');
        const record = {
            saved_at: new Date().toISOString(),
            ...payload
        };
        await store.setJSON('portfolio:latest', record);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                ok: true,
                saved_at: record.saved_at,
                positions_count: payload.positions.length,
                refresh_count: payload.refresh_count ?? null
            })
        };
    } catch (e) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'storage_failed', details: e.message }) };
    }
};
