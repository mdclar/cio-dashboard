// GET /.netlify/functions/get_briefs
// Default: returns the latest brief as { ...brief }
// ?history=true: returns just the history list (saved_at, generated_at, today_label, cio_take, market_posture)
// ?empty_ok=true: never error on empty, return { empty: true, message: '...' }

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
    const wantHistory = String(params.history || '').toLowerCase() === 'true';

    try {
        const store = getStore('cio_dashboard');

        if (wantHistory) {
            const history = (await store.get('brief:history', { type: 'json' })) || [];
            return { statusCode: 200, headers, body: JSON.stringify(Array.isArray(history) ? history : []) };
        }

        const record = await store.get('brief:latest', { type: 'json' });
        if (!record) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    empty: true,
                    message: 'No brief generated yet. The Daily CIO Brief runs Mon-Fri at 6:00 AM MT.'
                })
            };
        }
        return { statusCode: 200, headers, body: JSON.stringify(record) };
    } catch (e) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'storage_failed', details: e.message }) };
    }
};
