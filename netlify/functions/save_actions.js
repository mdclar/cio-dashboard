// POST /.netlify/functions/save_actions
// Body: { generated_at, items: [{ priority, title, description, ticker?, source }] }

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

    if (!payload || !Array.isArray(payload.items)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'missing_items_array' }) };
    }

    try {
        const store = getStore('cio_dashboard');
        const record = {
            saved_at: new Date().toISOString(),
            ...payload
        };
        await store.setJSON('actions:latest', record);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                ok: true,
                saved_at: record.saved_at,
                items_count: payload.items.length
            })
        };
    } catch (e) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'storage_failed', details: e.message }) };
    }
};
