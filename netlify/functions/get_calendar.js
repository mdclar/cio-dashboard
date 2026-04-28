// GET /.netlify/functions/get_calendar
// ?days=N (optional) — limit to first N days. Sidebar uses days=7, full page omits.

const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json',
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'method_not_allowed' }) };
    }

    const params = (event.queryStringParameters) || {};
    const daysLimitRaw = params.days;
    const daysLimit = daysLimitRaw ? Math.max(1, parseInt(daysLimitRaw, 10) || 0) : null;

    try {
        const store = getStore({ name: 'cio_dashboard', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_BLOBS_TOKEN });
        const record = await store.get('calendar:latest', { type: 'json' });

        if (!record) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    empty: true,
                    message: 'No calendar data yet. The Calendar Agent runs Mon-Fri at 5:55 AM MT.'
                })
            };
        }

        const days = Array.isArray(record.days) ? record.days : [];
        const trimmed = daysLimit ? days.slice(0, daysLimit) : days;

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                saved_at: record.saved_at,
                generated_at: record.generated_at,
                window: record.window,
                summary: record.summary,
                days: trimmed,
                is_trimmed: daysLimit !== null && days.length > daysLimit,
                total_days: days.length
            })
        };
    } catch (e) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'storage_failed', details: e.message }) };
    }
};
