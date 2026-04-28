// GET /.netlify/functions/get_actions

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

    try {
        const store = getStore('cio_dashboard');
        const record = await store.get('actions:latest', { type: 'json' });
        if (!record) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    empty: true,
                    message: 'No action items yet. The Daily CIO Brief runs Mon-Fri at 6:00 AM MT.'
                })
            };
        }
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                saved_at: record.saved_at,
                generated_at: record.generated_at,
                items: Array.isArray(record.items) ? record.items : []
            })
        };
    } catch (e) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'storage_failed', details: e.message }) };
    }
};
