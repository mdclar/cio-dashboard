// GET /.netlify/functions/get_chat_history
// Returns the persisted conversation thread

const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ error: 'method_not_allowed' }) };

  try {
    const store = getStore({ name: 'cio_dashboard', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_BLOBS_TOKEN });
    const thread = await store.get('chat:thread', { type: 'json' }).catch(() => null);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ messages: Array.isArray(thread) ? thread : [] })
    };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'load_failed', details: e.message }) };
  }
};