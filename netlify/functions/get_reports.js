// GET /.netlify/functions/get_reports
//   (no params)   -> { reports: [ ...index newest first ] }
//   ?id=<id>      -> the full report record (incl. actions + optional html), or 404
// Mirrors get_briefs / get_calendar (same 'cio_dashboard' Blobs store).

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

    const id = (event.queryStringParameters || {}).id;

    try {
        const store = getStore({ name: 'cio_dashboard', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_BLOBS_TOKEN });

        if (id) {
            const record = await store.get(`report:${id}`, { type: 'json' });
            if (!record) {
                return { statusCode: 404, headers, body: JSON.stringify({ error: 'not_found', id }) };
            }
            return { statusCode: 200, headers, body: JSON.stringify(record) };
        }

        let index = (await store.get('report:index', { type: 'json' })) || [];
        if (!Array.isArray(index)) index = [];
        return { statusCode: 200, headers, body: JSON.stringify({ reports: index, count: index.length }) };
    } catch (e) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'storage_failed', details: e.message }) };
    }
};
