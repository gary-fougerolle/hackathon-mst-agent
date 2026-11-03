(() => {
  'use strict';

  /* Pandemic Alert — Clara chat + alert status */

  const $ = (id) => document.getElementById(id);

  // Thread persistence
  const store = {
    get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} },
  };
  let threadId = store.get('threadId') || crypto.randomUUID();
  store.set('threadId', threadId);

  // -----------------------------------------------------------------------
  // Alert level
  // -----------------------------------------------------------------------

  const ALERT_MAP = {
    vigilance:        { cls: 'ok',   label: 'Low — Under surveillance',       msg: 'The epidemic situation is stable. Continue to take standard precautions.' },
    alerte_moderee:   { cls: 'warn', label: 'Moderate — Active circulation',  msg: 'The virus is actively circulating. Wear a mask in crowded places and get tested if you have symptoms.' },
    alerte_renforcee: { cls: 'high', label: 'High — Significant pressure',    msg: 'Epidemic pressure is high. Avoid crowded gatherings and consult a doctor if you have symptoms.' },
    urgence_sanitaire:{ cls: 'crit', label: 'Critical — Health emergency',    msg: 'A health emergency is in effect. Strictly follow official recommendations and limit your outings.' },
  };

  async function loadAlert() {
    try {
      const resp = await fetch('/api/stats');
      if (!resp.ok) return;
      const d = await resp.json();

      const code = d.niveau_alerte?.code || d.niveau_alerte || 'alerte_moderee';
      const info = ALERT_MAP[code] || ALERT_MAP['alerte_moderee'];

      // Hero dot + label
      const heroDot = $('hero-alert-dot');
      const heroLabel = $('hero-alert-label');
      if (heroDot) {
        heroDot.className = `hero-dot hero-dot--${info.cls}`;
        heroDot.title = info.label;
      }
      if (heroLabel) heroLabel.textContent = info.label;

      // Status card
      const card = $('status-card');
      if (card) {
        card.className = `status-card status-card--${info.cls}`;
        const dot = $('status-dot');
        if (dot) dot.className = `status-dot`;
        const label = $('status-label');
        if (label) label.textContent = info.label;
        const msg = $('status-message');
        if (msg) msg.textContent = info.msg;
      }

      // Status subtitle (date)
      if (d.date_mise_a_jour) {
        const sub = $('status-subtitle');
        if (sub) sub.textContent = `Data updated: ${d.date_mise_a_jour}`;
      }

      // Stats
      const pos = d.indicateurs?.taux_positivite?.valeur;
      if (pos !== undefined) {
        const el = $('stat-pos');
        if (el) el.textContent = `${pos}%`;
      }
      const hosp = d.indicateurs?.hospitalisations?.valeur;
      if (hosp !== undefined) {
        const el = $('stat-hosp');
        if (el) el.textContent = Number(hosp).toLocaleString('fr-FR');
      }
      const vacc = d.couverture_vaccinale_pct;
      if (vacc !== undefined) {
        const el = $('stat-vacc');
        if (el) el.textContent = `${vacc}%`;
      }
    } catch (err) {
      console.warn('[stats]', err);
    }
  }

  // -----------------------------------------------------------------------
  // Markdown renderer (safe, minimal)
  // -----------------------------------------------------------------------

  function md(text) {
    return text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*\w])\*([^*\s][^*\n]*?)\*(?![*\w])/g, '$1<em>$2</em>')
      .replace(/^[ \t]*[-•][ \t]+(.+)$/gm, '• $1')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }

  // -----------------------------------------------------------------------
  // Chat
  // -----------------------------------------------------------------------

  const messagesEl  = $('messages');
  const chatForm    = $('chat-form');
  const chatInput   = $('chat-input');
  const sendBtn     = $('chat-send');
  const quickEl     = $('quick-questions');

  function addMsg(role, text) {
    const el = document.createElement('div');
    el.className = `msg msg--${role}`;
    if (role === 'bot') el.innerHTML = md(text);
    else el.textContent = text;
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  function showTyping() {
    const el = document.createElement('div');
    el.className = 'msg msg--typing';
    el.setAttribute('aria-label', 'Clara is writing…');
    el.innerHTML = '<i></i><i></i><i></i>';
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  function setDisabled(on) {
    chatInput.disabled = on;
    sendBtn.disabled = on;
    document.querySelectorAll('.chip').forEach((c) => { c.disabled = on; });
    document.querySelectorAll('.action-tile').forEach((c) => { c.disabled = on; });
  }

  async function sendMessage(text) {
    if (!text.trim()) return;
    chatInput.value = '';
    quickEl.style.display = 'none';
    addMsg('user', text);
    setDisabled(true);

    const typing = showTyping();
    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, threadId }),
      });
      typing.remove();

      if (!resp.ok) {
        let errMsg = `Error ${resp.status}`;
        try { errMsg = (await resp.json()).error || errMsg; } catch {}
        addMsg('error', errMsg);
        return;
      }

      const botEl = document.createElement('div');
      botEl.className = 'msg msg--bot';
      messagesEl.appendChild(botEl);

      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let full = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        full += dec.decode(value, { stream: true });
        botEl.innerHTML = md(full);
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
      if (!full.trim()) {
        botEl.className = 'msg msg--error';
        botEl.textContent = 'No response received.';
      }
    } catch {
      typing.remove();
      addMsg('error', 'Cannot reach Clara. Please check your connection.');
    } finally {
      setDisabled(false);
      chatInput.focus();
    }
  }

  // Events
  chatForm.addEventListener('submit', (e) => { e.preventDefault(); sendMessage(chatInput.value); });

  quickEl.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (chip) sendMessage(chip.dataset.msg);
  });

  // Action tiles trigger chat + scroll
  document.querySelectorAll('.action-tile[data-msg]').forEach((tile) => {
    tile.addEventListener('click', () => {
      const chatSection = document.getElementById('chat');
      if (chatSection) chatSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      sendMessage(tile.dataset.msg);
    });
  });

  $('btn-new-conv').addEventListener('click', () => {
    threadId = crypto.randomUUID();
    store.set('threadId', threadId);
    messagesEl.innerHTML = '';
    quickEl.style.display = '';
    welcome();
    chatInput.focus();
  });

  function welcome() {
    addMsg('bot',
      'Hello! I\'m **Clara**, your official health assistant from Santé Publique France.\n\n' +
      'I can help you:\n' +
      '• Find a **testing site** near you\n' +
      '• Book a **doctor appointment** via Doctolib\n' +
      '• Understand the **current measures** and your risk\n\n' +
      'Use the shortcuts above or type your question below.\n\n' +
      '**Emergency? Call 15 (SAMU) or 112.**'
    );
  }

  // -----------------------------------------------------------------------
  // Init
  // -----------------------------------------------------------------------

  loadAlert();
  setInterval(loadAlert, 5 * 60 * 1000);
  welcome();
})();
