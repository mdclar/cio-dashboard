// GET /.netlify/functions/get_weekly_thesis
// Returns the most recent weekly thesis from Blobs, or empty-state if nothing saved.
// (Hardcoded HTML fallbacks from the previous version have been removed.)

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
        const store = getStore({ name: 'cio_dashboard', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_BLOBS_TOKEN });
        const record = await store.get('weekly_thesis:latest', { type: 'json' });
        if (!record) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    empty: true,
                    message: 'No weekly thesis published yet. The Weekly Thesis Writer runs Mondays at 7:00 AM ET (5 AM MT cron).'
                })
            };
        }
        return { statusCode: 200, headers, body: JSON.stringify(record) };
    } catch (e) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'storage_failed', details: e.message }) };
    }
};
