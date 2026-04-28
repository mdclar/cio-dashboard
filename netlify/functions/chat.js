// POST /.netlify/functions/chat
// Receives { message: "..." }, returns { reply: "..." }
// Stores conversation in Blobs key 'chat:thread' (single ongoing thread)

const { getStore } = require('@netlify/blobs');

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-5';
const MAX_HISTORY = 30; // last N turns sent to Claude
const MAX_STORED = 200; // max turns kept in storage

async function fetchJson(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) { return null; }
}

function buildSystemPrompt(brief, portfolio, calendar) {
  let ctx = `You are the Chief Investment Officer of the Marshall Clark Family Office, embedded in Marshall's daily dashboard.

VOICE & STYLE:
- Adaptive: be sharp and decisive by default, but adjust based on Marshall's signals.
- If Marshall says "be more direct" or "TL;DR" — cut everything except the conclusion.
- If Marshall says "walk me through it" or "explain" — go step-by-step.
- Never repeat what's already on the dashboard unless asked. He can see the brief.
- Cite specific tickers, numbers, and percentages when you have them.
- No fluff, no preamble, no "Great question!" energy.
- You have STRONG opinions and commit to them. You can be wrong but never wishy-washy.

CONVERSATION RULES:
- This is an ongoing dialogue with persistent memory. Reference prior conversation naturally.
- If you don't know something current (today's price, breaking news), say so.
- Markdown is supported in your replies (bold, lists, etc.).
- Keep replies to 2-4 paragraphs unless explicitly asked for more depth.

`;

  if (brief && !brief.empty) {
    ctx += `\n=== TODAY'S BRIEF (${brief.today_label || 'recent'}) ===\n`;
    if (brief.cio_take) ctx += `Take: ${brief.cio_take}\n`;
    if (brief.market_posture) ctx += `Posture: ${brief.market_posture}\n`;
    if (brief.macro_posture) ctx += `Macro: ${brief.macro_posture}\n`;
    if (brief.market_pulse) ctx += `Pulse: ${brief.market_pulse}\n`;
    if (Array.isArray(brief.portfolio_watch) && brief.portfolio_watch.length) {
      ctx += `Watchlist: ${brief.portfolio_watch.join(' | ')}\n`;
    }
    if (brief.portfolio_count != null) {
      ctx += `Portfolio: ${brief.portfolio_count} positions, ${brief.extreme_rsi_count || 0} extreme RSI, ${brief.near_stop_count || 0} near stop, ${brief.profit_taking_count || 0} profit candidates\n`;
    }
  }

  if (portfolio && !portfolio.empty && Array.isArray(portfolio.positions)) {
    const top10 = portfolio.positions
      .slice()
      .sort((a, b) => (b.current_value || 0) - (a.current_value || 0))
      .slice(0, 10);
    ctx += `\n=== TOP 10 POSITIONS BY VALUE ===\n`;
    for (const p of top10) {
      ctx += `${p.ticker}: $${Math.round(p.current_value || 0).toLocaleString()} (${(p.unrealized_pct || 0).toFixed(1)}% unrealized) [${p.account || '?'}]\n`;
    }
    if (portfolio.summary) {
      const s = portfolio.summary;
      ctx += `Total: ${s.total_positions} positions, $${Math.round(s.total_market_value || 0).toLocaleString()} value, ${(s.total_unrealized_pct || 0).toFixed(1)}% unrealized.\n`;
    }
  }

  if (calendar && !calendar.empty && Array.isArray(calendar.days)) {
    const upcoming = calendar.days.slice(0, 7).filter(d => d.events && d.events.length);
    if (upcoming.length) {
      ctx += `\n=== NEXT 7 DAYS CALENDAR ===\n`;
      for (const day of upcoming) {
        const tags = day.events.map(e => {
          if (e.type === 'earnings') return `${e.ticker}${e.held ? '(held)' : ''}`;
          if (e.type === 'economic') return e.name;
          if (e.type === 'dividend') return `${e.ticker} div`;
          return e.name;
        }).join(', ');
        ctx += `${day.label}: ${tags}\n`;
      }
    }
  }

  return ctx;
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
  try { payload = JSON.parse(event.body || '{}'); }
  catch (e) { return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid_json' }) }; }

  const userMsg = String(payload.message || '').trim();
  if (!userMsg) return { statusCode: 400, headers, body: JSON.stringify({ error: 'empty_message' }) };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ error: 'missing_api_key' }) };

  try {
    const store = getStore({ name: 'cio_dashboard', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_BLOBS_TOKEN });

    // Load existing thread + dashboard context in parallel
    const [thread, brief, portfolio, calendar] = await Promise.all([
      store.get('chat:thread', { type: 'json' }).catch(() => null),
      store.get('brief:latest', { type: 'json' }).catch(() => null),
      store.get('portfolio:latest', { type: 'json' }).catch(() => null),
      store.get('calendar:latest', { type: 'json' }).catch(() => null)
    ]);

    const history = Array.isArray(thread) ? thread : [];
    const recentHistory = history.slice(-MAX_HISTORY);

    // Build messages for Anthropic API
    const apiMessages = recentHistory.map(m => ({
      role: m.role,
      content: m.content
    }));
    apiMessages.push({ role: 'user', content: userMsg });

    const systemPrompt = buildSystemPrompt(brief, portfolio, calendar);

    // Call Anthropic
    const apiResp = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        temperature: 0.4,
        system: systemPrompt,
        messages: apiMessages
      })
    });

    if (!apiResp.ok) {
      const errText = await apiResp.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'anthropic_error', status: apiResp.status, details: errText.slice(0, 500) }) };
    }

    const apiData = await apiResp.json();
    let reply = '';
    for (const block of (apiData.content || [])) {
      if (block.type === 'text' && block.text) reply += block.text;
    }
    if (!reply) reply = '(no response)';

    // Append to thread and save
    const now = new Date().toISOString();
    history.push({ role: 'user', content: userMsg, ts: now });
    history.push({ role: 'assistant', content: reply, ts: new Date().toISOString() });
    const trimmed = history.slice(-MAX_STORED);
    await store.setJSON('chat:thread', trimmed);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ reply, thread_length: trimmed.length })
    };

  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'chat_failed', details: e.message }) };
  }
};