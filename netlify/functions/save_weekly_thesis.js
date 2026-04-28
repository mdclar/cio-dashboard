// POST /.netlify/functions/save_weekly_thesis
// Preserves the existing schema: { macro, thesisChanges, crypto, metadata, timestamp }
// macro/thesisChanges/crypto can be HTML strings (legacy) or structured JSON.
// Stores latest + 12-week history.

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

    const { macro, thesisChanges, crypto, metadata, timestamp } = payload || {};
    if (macro === undefined && thesisChanges === undefined && crypto === undefined) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'missing_content' }) };
    }

    try {
        const store = getStore('cio_dashboard');

        const record = {
            macro,
            thesisChanges,
            crypto,
            metadata,
            timestamp: timestamp || new Date().toISOString(),
            saved_at: new Date().toISOString(),
            generatedDate: (metadata && metadata.generated_date) || new Date().toISOString().slice(0, 10)
        };

        await store.setJSON('weekly_thesis:latest', record);

        let history = (await store.get('weekly_thesis:history', { type: 'json' })) || [];
        if (!Array.isArray(history)) history = [];
        history.unshift({
            saved_at: record.saved_at,
            generatedDate: record.generatedDate
        });
        history = history.slice(0, 12);
        await store.setJSON('weekly_thesis:history', history);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ ok: true, saved_at: record.saved_at, week_count: history.length })
        };
    } catch (e) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'storage_failed', details: e.message }) };
    }
};
