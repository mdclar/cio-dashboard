// POST /.netlify/functions/save_calendar
// Body shape (from Calendar Agent "Build 30-Day Calendar" node):
// {
//   generated_at, window: {start, end},
//   days: [{ date, label, is_today, events: [...] }, ...],
//   summary: { total_events, earnings_count, economic_count, dividend_count }
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

    if (!payload || !Array.isArray(payload.days)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'missing_days_array' }) };
    }

    try {
        const store = getStore('cio_dashboard');
        const record = {
            saved_at: new Date().toISOString(),
            ...payload
        };
        await store.setJSON('calendar:latest', record);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                ok: true,
                saved_at: record.saved_at,
                days_count: payload.days.length,
                total_events: payload.summary && payload.summary.total_events !== undefined
                    ? payload.summary.total_events : null
            })
        };
    } catch (e) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'storage_failed', details: e.message }) };
    }
};
