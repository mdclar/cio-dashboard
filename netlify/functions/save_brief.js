// POST /.netlify/functions/save_brief
// Accepts the modern Daily CIO Brief workflow payload (structured JSON, not HTML).
// Stores the latest brief in Netlify Blobs and keeps last 30 in history.
//
// Expected body shape (from the workflow's "Parse Brief JSON" node):
// {
//   generated_at, today_label, day_of_week, is_monday,
//   portfolio_count, extreme_rsi_count, near_stop_count,
//   near_target_count, profit_taking_count,
//   market_posture, data_source,
//   cio_take, market_pulse, macro_posture,
//   sector_rotation: [...], portfolio_watch: [...], calendar_highlights: [...],
//   parse_error, raw_brief
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

    if (!payload || typeof payload !== 'object') {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'empty_body' }) };
    }

    try {
        const store = getStore({ name: 'cio_dashboard', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_BLOBS_TOKEN });

        const record = {
            saved_at: new Date().toISOString(),
            ...payload
        };

        // Store both the latest snapshot and append to a history (last 30)
        await store.setJSON('brief:latest', record);

        let history = (await store.get('brief:history', { type: 'json' })) || [];
        if (!Array.isArray(history)) history = [];
        history.unshift({
            saved_at: record.saved_at,
            generated_at: record.generated_at || null,
            today_label: record.today_label || null,
            cio_take: record.cio_take || null,
            market_posture: record.market_posture || null
        });
        history = history.slice(0, 30);
        await store.setJSON('brief:history', history);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                ok: true,
                saved_at: record.saved_at,
                history_count: history.length
            })
        };
    } catch (e) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'storage_failed', details: e.message }) };
    }
};
