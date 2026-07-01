// POST /.netlify/functions/save_report
// Registers a CIO report so it shows up in the Reports library and never gets lost.
// Mirrors the save_brief / save_portfolio_briefs pattern (same 'cio_dashboard' Blobs store).
//
// Body shape:
// {
//   id:       "cio-2026-07-01"          // optional; derived from date+title if omitted
//   date:     "2026-07-01"              // required (YYYY-MM-DD, used for sorting)
//   title:    "Drawdown Playbook & Rotation Book"   // required
//   type:     "weekly" | "quarterly" | "thesis" | "adhoc"   // default "weekly"
//   summary:  "One-line what-this-is."  // shown on the card
//   url:      "/reports/cio-2026-07-01.html"   // link to the full static report page
//   actions:  [ { ticker, action, note, priority } ]   // optional recommended actions
//   pinned:   true|false                // pin to top of the Reports page (e.g. the quarterly)
//   html:     "<...>"                   // optional inline body if you aren't using a static file
// }

const { getStore } = require('@netlify/blobs');

function slugify(s) {
    return String(s || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, 60);
}

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

    const { date, title } = payload || {};
    if (!date || !title) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'missing_required', need: ['date', 'title'] }) };
    }

    const id = payload.id || `${date}-${slugify(title)}`;

    try {
        const store = getStore({ name: 'cio_dashboard', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_BLOBS_TOKEN });

        const record = {
            id,
            date,
            title,
            type: payload.type || 'weekly',
            summary: payload.summary || '',
            url: payload.url || null,
            actions: Array.isArray(payload.actions) ? payload.actions : [],
            pinned: !!payload.pinned,
            html: payload.html || null,
            saved_at: new Date().toISOString(),
        };

        // Full record (includes actions + optional inline html)
        await store.setJSON(`report:${id}`, record);

        // Lightweight index for the Reports list (dedupe by id, newest first, keep 100)
        let index = (await store.get('report:index', { type: 'json' })) || [];
        if (!Array.isArray(index)) index = [];
        index = index.filter((r) => r.id !== id);
        index.unshift({
            id: record.id,
            date: record.date,
            title: record.title,
            type: record.type,
            summary: record.summary,
            url: record.url,
            pinned: record.pinned,
            action_count: record.actions.length,
            saved_at: record.saved_at,
        });
        index.sort((a, b) => String(b.date).localeCompare(String(a.date)));
        index = index.slice(0, 100);
        await store.setJSON('report:index', index);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ ok: true, id, url: record.url, report_count: index.length }),
        };
    } catch (e) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'storage_failed', details: e.message }) };
    }
};
