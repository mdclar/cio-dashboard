// CIO Chat Widget — embedded on every dashboard page
// Self-contained: injects DOM, handles state, calls /chat endpoints

(function() {
  const ENDPOINTS = {
    chat: '/.netlify/functions/chat',
    history: '/.netlify/functions/get_chat_history',
    clear: '/.netlify/functions/clear_chat'
  };

  let panelOpen = false;
  let voiceMode = false;
  let speakReplies = false;
  let recognition = null;
  let isRecording = false;
  let messagesLoaded = false;

  // Lightweight markdown -> HTML (subset we care about)
  function md2html(text) {
    if (!text) return '';
    let s = String(text);
    // Escape HTML first
    s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // Code blocks
    s = s.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code}</code></pre>`);
    // Inline code
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Bold
    s = s.replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>');
    // Italic
    s = s.replace(/(?<!\*)\*([^\*]+)\*(?!\*)/g, '<em>$1</em>');
    // Links
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    // Lists (consecutive lines starting with - or *)
    const lines = s.split('\n');
    const out = [];
    let inList = false;
    let listType = null;
    for (const line of lines) {
      const ulMatch = /^\s*[-*]\s+(.+)/.exec(line);
      const olMatch = /^\s*\d+\.\s+(.+)/.exec(line);
      if (ulMatch) {
        if (!inList || listType !== 'ul') {
          if (inList) out.push('</' + listType + '>');
          out.push('<ul>');
          inList = true; listType = 'ul';
        }
        out.push('<li>' + ulMatch[1] + '</li>');
      } else if (olMatch) {
        if (!inList || listType !== 'ol') {
          if (inList) out.push('</' + listType + '>');
          out.push('<ol>');
          inList = true; listType = 'ol';
        }
        out.push('<li>' + olMatch[1] + '</li>');
      } else {
        if (inList) { out.push('</' + listType + '>'); inList = false; listType = null; }
        out.push(line);
      }
    }
    if (inList) out.push('</' + listType + '>');
    s = out.join('\n');
    // Paragraphs (split on double newlines)
    s = s.split(/\n\n+/).map(p => {
      if (/^<(ul|ol|pre|h\d)/.test(p.trim())) return p;
      return '<p>' + p.replace(/\n/g, '<br>') + '</p>';
    }).join('');
    return s;
  }

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else node.setAttribute(k, v);
    }
    for (const c of children) {
      if (c == null) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }

  function renderEmpty(messagesEl) {
    messagesEl.innerHTML = '';
    const empty = el('div', { class: 'cio-chat-empty' });
    empty.innerHTML = `
      <div class="big">Ask the CIO</div>
      I have your portfolio, today's brief, and the 30-day calendar. Try:<br><br>
      "What should I watch tomorrow?"<br>
      "Is META overheated?"<br>
      "Walk me through the FOMC implications."<br>
    `;
    messagesEl.appendChild(empty);
  }

  function renderMessage(messagesEl, role, content) {
    const msg = el('div', { class: 'cio-msg ' + role });
    msg.appendChild(el('div', { class: 'cio-msg-role' }, role === 'user' ? 'You' : 'CIO'));
    const bubble = el('div', { class: 'cio-msg-bubble' });
    if (role === 'assistant') {
      bubble.innerHTML = md2html(content);
    } else {
      bubble.textContent = content;
    }
    msg.appendChild(bubble);
    messagesEl.appendChild(msg);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return msg;
  }

  function renderTyping(messagesEl) {
    const t = el('div', { class: 'cio-typing' }, 'CIO is thinking');
    t.id = 'cio-typing';
    messagesEl.appendChild(t);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function removeTyping() {
    const t = document.getElementById('cio-typing');
    if (t) t.remove();
  }

  function renderError(messagesEl, msg) {
    const e = el('div', { class: 'cio-chat-error' }, 'Error: ' + msg);
    messagesEl.appendChild(e);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function loadHistory(messagesEl) {
    if (messagesLoaded) return;
    try {
      const res = await fetch(ENDPOINTS.history, { cache: 'no-store' });
      const data = await res.json();
      if (Array.isArray(data.messages) && data.messages.length) {
        messagesEl.innerHTML = '';
        for (const m of data.messages) {
          renderMessage(messagesEl, m.role, m.content);
        }
      } else {
        renderEmpty(messagesEl);
      }
    } catch (e) {
      renderEmpty(messagesEl);
    }
    messagesLoaded = true;
  }

  async function sendMessage(messagesEl, inputEl, sendBtn) {
    const text = inputEl.value.trim();
    if (!text) return;

    // Remove empty state if present
    const empty = messagesEl.querySelector('.cio-chat-empty');
    if (empty) empty.remove();

    renderMessage(messagesEl, 'user', text);
    inputEl.value = '';
    inputEl.style.height = 'auto';
    sendBtn.disabled = true;
    renderTyping(messagesEl);

    try {
      const res = await fetch(ENDPOINTS.chat, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });
      removeTyping();
      const data = await res.json();
      if (!res.ok) {
        renderError(messagesEl, data.details || data.error || ('HTTP ' + res.status));
      } else {
        renderMessage(messagesEl, 'assistant', data.reply);
        if (speakReplies && 'speechSynthesis' in window) {
          const utter = new SpeechSynthesisUtterance(data.reply.replace(/[*_`#]/g, ''));
          utter.rate = 1.05;
          window.speechSynthesis.speak(utter);
        }
      }
    } catch (e) {
      removeTyping();
      renderError(messagesEl, e.message);
    } finally {
      sendBtn.disabled = false;
      inputEl.focus();
    }
  }

  function setupVoice(inputEl, micBtn) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      micBtn.disabled = true;
      micBtn.title = 'Voice input not supported in this browser';
      return;
    }
    recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    let finalTranscript = '';
    recognition.onresult = (event) => {
      let interim = '';
      finalTranscript = '';
      for (let i = 0; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalTranscript += r[0].transcript;
        else interim += r[0].transcript;
      }
      inputEl.value = finalTranscript + interim;
    };
    recognition.onerror = () => stopRecording(micBtn);
    recognition.onend = () => stopRecording(micBtn);

    micBtn.addEventListener('click', () => {
      if (isRecording) {
        recognition.stop();
      } else {
        try {
          recognition.start();
          isRecording = true;
          micBtn.classList.add('recording');
          micBtn.textContent = '?';
        } catch (e) { /* already started */ }
      }
    });
  }

  function stopRecording(micBtn) {
    isRecording = false;
    micBtn.classList.remove('recording');
    micBtn.textContent = '??';
  }

  async function clearChat(messagesEl) {
    if (!confirm('Clear conversation history? This cannot be undone.')) return;
    try {
      await fetch(ENDPOINTS.clear, { method: 'POST' });
      messagesLoaded = false;
      renderEmpty(messagesEl);
    } catch (e) { /* ignore */ }
  }

  function buildPanel() {
    // Toggle button
    const toggle = el('button', { class: 'cio-chat-toggle', title: 'Open CIO Chat' }, 'CIO ? Chat');
    document.body.appendChild(toggle);

    // Main panel
    const panel = el('div', { class: 'cio-chat-panel' });

    const header = el('div', { class: 'cio-chat-header' });
    const titleWrap = el('div');
    titleWrap.appendChild(el('div', { class: 'cio-chat-title' }, 'Ask the CIO'));
    titleWrap.appendChild(el('div', { class: 'cio-chat-subtitle' }, 'Persistent · Memory On'));
    header.appendChild(titleWrap);

    const actions = el('div', { class: 'cio-chat-actions' });
    const clearBtn = el('button', { class: 'cio-chat-btn danger', title: 'Clear conversation' }, 'CLEAR');
    const closeBtn = el('button', { class: 'cio-chat-btn', title: 'Close' }, '?');
    actions.appendChild(clearBtn);
    actions.appendChild(closeBtn);
    header.appendChild(actions);
    panel.appendChild(header);

    // Mode tabs
    const modeBar = el('div', { class: 'cio-chat-mode' });
    const textTab = el('button', { class: 'cio-mode-tab active' }, 'TEXT');
    const voiceTab = el('button', { class: 'cio-mode-tab' }, 'VOICE');
    modeBar.appendChild(textTab);
    modeBar.appendChild(voiceTab);
    panel.appendChild(modeBar);

    // Messages
    const messages = el('div', { class: 'cio-chat-messages' });
    panel.appendChild(messages);

    // Input area
    const inputArea = el('div', { class: 'cio-chat-input-area' });
    const inputRow = el('div', { class: 'cio-chat-input-row' });
    const micBtn = el('button', { class: 'cio-icon-btn', title: 'Voice input' }, '??');
    const input = el('textarea', { class: 'cio-chat-input', placeholder: 'Ask anything…', rows: '1' });
    const sendBtn = el('button', { class: 'cio-send-btn' }, 'SEND');
    inputRow.appendChild(micBtn);
    inputRow.appendChild(input);
    inputRow.appendChild(sendBtn);
    inputArea.appendChild(inputRow);

    const hint = el('div', { class: 'cio-chat-hint' }, 'Enter to send · Shift+Enter for newline');
    inputArea.appendChild(hint);
    panel.appendChild(inputArea);

    document.body.appendChild(panel);

    // Auto-resize textarea
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 140) + 'px';
    });

    // Open/close
    function open() {
      panel.classList.add('open');
      toggle.classList.add('open');
      panelOpen = true;
      loadHistory(messages);
      setTimeout(() => input.focus(), 200);
    }
    function close() {
      panel.classList.remove('open');
      toggle.classList.remove('open');
      panelOpen = false;
      if (recognition && isRecording) recognition.stop();
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    }
    toggle.addEventListener('click', open);
    closeBtn.addEventListener('click', close);

    // Mode toggle
    textTab.addEventListener('click', () => {
      voiceMode = false; speakReplies = false;
      textTab.classList.add('active');
      voiceTab.classList.remove('active');
    });
    voiceTab.addEventListener('click', () => {
      voiceMode = true; speakReplies = true;
      voiceTab.classList.add('active');
      textTab.classList.remove('active');
    });

    // Clear
    clearBtn.addEventListener('click', () => clearChat(messages));

    // Send
    sendBtn.addEventListener('click', () => sendMessage(messages, input, sendBtn));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(messages, input, sendBtn);
      }
    });

    // Voice
    setupVoice(input, micBtn);

    // Keyboard shortcut: Esc closes
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && panelOpen) close();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildPanel);
  } else {
    buildPanel();
  }
})();