/* AfroLink — module de messagerie partagé, branché sur l'API backend.
   Chaque page qui inclut ce script (après api.js) peut appeler
   window.openContactModal({ contactType, contactId, name, email })
   pour ouvrir une fenêtre de contact et échanger de vrais messages
   stockés côté serveur (voir /api/conversations). */
(function () {
  const GUEST_KEY = 'afrolink_guest_identity';

  function getGuestIdentity() {
    const user = window.AfroAPI && window.AfroAPI.getUser();
    if (user) return { name: user.email, email: user.email };
    try { return JSON.parse(localStorage.getItem(GUEST_KEY)) || null; }
    catch (e) { return null; }
  }

  function saveGuestIdentity(identity) {
    try { localStorage.setItem(GUEST_KEY, JSON.stringify(identity)); }
    catch (e) { /* ignore storage errors */ }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function formatTs(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
  }

  function formatAmountCents(cents) {
    try { return (Number(cents) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
    catch (e) { return cents + ' €'; }
  }

  let pendingContact = null;
  let currentConv = null;

  function ensureModal() {
    if (document.getElementById('msg-modal-overlay')) return;

    const style = document.createElement('style');
    style.textContent = `
      #msg-modal-overlay { position: fixed; inset: 0; background: rgba(32,36,31,0.5); display: none; align-items: center; justify-content: center; z-index: 1000; padding: 20px; }
      #msg-modal-overlay.show { display: flex; }
      #msg-modal { background: #fff; border-radius: 14px; width: 100%; max-width: 420px; max-height: 82vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 12px 40px rgba(0,0,0,0.25); font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
      #msg-modal-header { background: var(--green-dark, #0E4A2B); color: #fff; padding: 16px 18px; display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
      #msg-modal-header h3 { margin: 0; font-size: 15px; }
      #msg-modal-header span { font-size: 11.5px; opacity: 0.85; display: block; margin-top: 2px; }
      #msg-modal-close { background: none; border: none; color: #fff; font-size: 20px; cursor: pointer; line-height: 1; padding: 4px; }
      #msg-identity-form { padding: 18px; display: flex; flex-direction: column; gap: 10px; }
      #msg-identity-form p { font-size: 12px; color: var(--gray, #5F5E5A); margin: 0 0 4px; }
      #msg-identity-form label { font-size: 12px; font-weight: 600; display: block; margin-bottom: 4px; }
      #msg-identity-form input { width: 100%; border: 1.5px solid var(--border, #E4E2DA); border-radius: 8px; padding: 8px 10px; font-size: 12.5px; font-family: inherit; outline: none; box-sizing: border-box; }
      #msg-identity-form input:focus { border-color: var(--green, #1F7A4D); }
      #msg-identity-form button { background: var(--green-dark, #0E4A2B); color: #fff; border: none; border-radius: 8px; padding: 10px; font-size: 13px; font-weight: 700; cursor: pointer; margin-top: 4px; }
      #msg-identity-error { font-size: 11.5px; color: #B3261E; display: none; }
      #msg-modal-thread { flex: 1; overflow-y: auto; padding: 14px 18px; display: flex; flex-direction: column; gap: 8px; background: var(--bg, #F7F6F1); min-height: 90px; }
      .msg-bubble { background: #fff; border: 1px solid var(--border, #E4E2DA); border-radius: 10px; padding: 8px 12px; font-size: 12.5px; align-self: flex-end; max-width: 85%; color: var(--ink, #20241F); }
      .msg-bubble.from-contact { align-self: flex-start; background: var(--green-light, #E4F3EA); }
      .msg-bubble .msg-ts { font-size: 10px; color: var(--gray, #5F5E5A); margin-top: 4px; }
      #msg-modal-empty { font-size: 12px; color: var(--gray, #5F5E5A); text-align: center; padding: 12px 0; }
      #msg-modal-order { padding: 12px 18px; border-top: 1px solid var(--border, #E4E2DA); background: #fff; }
      #msg-order-status { font-size: 12px; margin-bottom: 8px; }
      #msg-order-status .badge-pending { color: var(--gold-dark, #8A6410); font-weight: 700; }
      #msg-order-status .badge-paid { color: var(--green-dark, #0E4A2B); font-weight: 700; }
      #msg-order-actions { display: flex; gap: 8px; }
      .msg-order-btn { background: var(--green-dark, #0E4A2B); color: #fff; border: none; border-radius: 8px; padding: 8px 14px; font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap; }
      .msg-order-btn:hover { background: var(--green, #1F7A4D); }
      #msg-modal-note { font-size: 10.5px; color: var(--gray, #5F5E5A); padding: 10px 18px 0; margin: 0; }
      #msg-modal-form { padding: 10px 14px 14px; display: flex; gap: 8px; }
      #msg-modal-form textarea { flex: 1; border: 1.5px solid var(--border, #E4E2DA); border-radius: 8px; padding: 8px 10px; font-size: 12.5px; font-family: inherit; resize: none; outline: none; min-height: 40px; }
      #msg-modal-form textarea:focus { border-color: var(--green, #1F7A4D); }
      #msg-modal-form button { background: var(--green-dark, #0E4A2B); color: #fff; border: none; border-radius: 8px; padding: 0 16px; font-size: 12.5px; font-weight: 700; cursor: pointer; }
      #msg-modal-form button:hover { background: var(--green, #1F7A4D); }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.id = 'msg-modal-overlay';
    overlay.innerHTML = [
      '<div id="msg-modal">',
      '  <div id="msg-modal-header">',
      '    <div>',
      '      <h3 id="msg-modal-name"></h3>',
      '      <span id="msg-modal-email"></span>',
      '    </div>',
      '    <button id="msg-modal-close" type="button" aria-label="Fermer">&times;</button>',
      '  </div>',
      '  <form id="msg-identity-form" style="display:none;">',
      '    <p>Indique tes coordonnées pour démarrer la conversation.</p>',
      '    <div><label>Ton nom</label><input type="text" id="msg-identity-name" required></div>',
      '    <div><label>Ton email</label><input type="email" id="msg-identity-email" required></div>',
      '    <div id="msg-identity-error"></div>',
      '    <button type="submit">Continuer</button>',
      '  </form>',
      '  <div id="msg-modal-thread" style="display:none;"></div>',
      '  <div id="msg-modal-order" style="display:none;">',
      '    <div id="msg-order-status"></div>',
      '    <div id="msg-order-actions"></div>',
      '  </div>',
      '  <p id="msg-modal-note" style="display:none;">Tes messages sont enregistrés sur le serveur AfroLink.</p>',
      '  <form id="msg-modal-form" style="display:none;">',
      '    <textarea id="msg-modal-input" placeholder="Écris ton message..." required></textarea>',
      '    <button type="submit">Envoyer</button>',
      '  </form>',
      '</div>'
    ].join('');
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function (e) { if (e.target === overlay) window.closeContactModal(); });
    document.getElementById('msg-modal-close').addEventListener('click', function () { window.closeContactModal(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') window.closeContactModal(); });

    document.getElementById('msg-identity-form').addEventListener('submit', function (e) {
      e.preventDefault();
      const name = document.getElementById('msg-identity-name').value.trim();
      const email = document.getElementById('msg-identity-email').value.trim();
      const errorEl = document.getElementById('msg-identity-error');
      if (!name || !email) {
        errorEl.textContent = 'Merci de renseigner ton nom et ton email.';
        errorEl.style.display = 'block';
        return;
      }
      errorEl.style.display = 'none';
      const identity = { name, email };
      saveGuestIdentity(identity);
      startConversation(pendingContact, identity);
    });

    document.getElementById('msg-modal-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      const input = document.getElementById('msg-modal-input');
      const text = input.value.trim();
      if (!text || !currentConv) return;
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      try {
        const updated = await window.AfroAPI.postPublic('/conversations/' + currentConv.id + '/messages', { text, sender: 'guest' });
        currentConv = updated;
        input.value = '';
        renderThread(currentConv);
        renderOrder(currentConv);
        if (typeof window.showToast === 'function') {
          window.showToast('Message envoyé à ' + (pendingContact && pendingContact.name || 'ton contact') + '.');
        }
      } catch (err) {
        if (typeof window.showToast === 'function') window.showToast(err.message || 'Impossible d\'envoyer le message.');
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById('msg-modal-order').addEventListener('click', async function (e) {
      const payBtn = e.target.closest('[data-order-action="pay"]');
      if (!payBtn || !currentConv) return;
      payBtn.disabled = true;
      payBtn.textContent = 'Redirection...';
      try {
        const data = await window.AfroAPI.postPublic('/conversations/' + currentConv.id + '/order/checkout');
        if (data && data.url) {
          window.location.href = data.url;
        }
      } catch (err) {
        if (typeof window.showToast === 'function') window.showToast(err.message || 'Paiement indisponible pour le moment.');
        payBtn.disabled = false;
        payBtn.textContent = 'Payer maintenant';
      }
    });
  }

  function renderThread(conv) {
    const threadEl = document.getElementById('msg-modal-thread');
    if (!conv.messages || conv.messages.length === 0) {
      threadEl.innerHTML = '<div id="msg-modal-empty">Aucun message pour l\'instant. Lance la conversation !</div>';
      return;
    }
    threadEl.innerHTML = conv.messages.map(function (m) {
      const cls = m.sender === 'contact' ? 'msg-bubble from-contact' : 'msg-bubble';
      return '<div class="' + cls + '">' + escapeHtml(m.text) + '<div class="msg-ts">' + formatTs(m.createdAt) + '</div></div>';
    }).join('');
    threadEl.scrollTop = threadEl.scrollHeight;
  }

  function renderOrder(conv) {
    const statusEl = document.getElementById('msg-order-status');
    const actionsEl = document.getElementById('msg-order-actions');
    const order = conv.order;
    if (!order) {
      statusEl.innerHTML = 'Aucune commande proposée pour l\'instant.';
      actionsEl.innerHTML = '';
    } else if (order.status === 'pending') {
      statusEl.innerHTML = '<span class="badge-pending">⏳ Commande proposée</span> — ' + formatAmountCents(order.amountCents);
      actionsEl.innerHTML = '<button type="button" class="msg-order-btn" data-order-action="pay">Payer maintenant</button>';
    } else {
      statusEl.innerHTML = '<span class="badge-paid">✅ Payé</span> — ' + formatAmountCents(order.amountCents) + ' le ' + formatTs(order.paidAt);
      actionsEl.innerHTML = '';
    }
  }

  function showIdentityForm() {
    document.getElementById('msg-identity-form').style.display = 'flex';
    document.getElementById('msg-modal-thread').style.display = 'none';
    document.getElementById('msg-modal-order').style.display = 'none';
    document.getElementById('msg-modal-note').style.display = 'none';
    document.getElementById('msg-modal-form').style.display = 'none';
  }

  function showThreadUI() {
    document.getElementById('msg-identity-form').style.display = 'none';
    document.getElementById('msg-modal-thread').style.display = 'flex';
    document.getElementById('msg-modal-order').style.display = 'block';
    document.getElementById('msg-modal-note').style.display = 'block';
    document.getElementById('msg-modal-form').style.display = 'flex';
    setTimeout(function () {
      const input = document.getElementById('msg-modal-input');
      if (input) input.focus();
    }, 50);
  }

  function showLoadingThread() {
    document.getElementById('msg-identity-form').style.display = 'none';
    const threadEl = document.getElementById('msg-modal-thread');
    threadEl.style.display = 'flex';
    threadEl.innerHTML = '<div id="msg-modal-empty">Chargement...</div>';
    document.getElementById('msg-modal-order').style.display = 'none';
    document.getElementById('msg-modal-note').style.display = 'none';
    document.getElementById('msg-modal-form').style.display = 'none';
  }

  async function startConversation(contact, identity) {
    showLoadingThread();
    try {
      const conv = await window.AfroAPI.postPublic('/conversations/find-or-create', {
        contactType: contact.contactType,
        contactId: contact.contactId,
        contactName: contact.name,
        contactEmail: contact.email,
        guestName: identity.name,
        guestEmail: identity.email
      });
      currentConv = conv;
      renderThread(conv);
      renderOrder(conv);
      showThreadUI();
    } catch (err) {
      document.getElementById('msg-modal-thread').innerHTML = '<div id="msg-modal-empty">' + escapeHtml(err.message || 'Impossible de charger la conversation.') + '</div>';
    }
  }

  window.openContactModal = function (contact) {
    ensureModal();
    pendingContact = contact;
    currentConv = null;
    document.getElementById('msg-modal-name').textContent = (contact && contact.name) || 'Contact';
    document.getElementById('msg-modal-email').textContent = (contact && contact.email) || '';
    document.getElementById('msg-modal-overlay').classList.add('show');

    const identity = getGuestIdentity();
    if (!identity || !identity.email) {
      showIdentityForm();
      return;
    }
    startConversation(contact, identity);
  };

  window.closeContactModal = function () {
    const overlay = document.getElementById('msg-modal-overlay');
    if (overlay) overlay.classList.remove('show');
  };

  window.afroLinkMessaging = {
    escapeHtml: escapeHtml,
    formatTs: formatTs,
    formatAmountCents: formatAmountCents,
    getGuestIdentity: getGuestIdentity
  };
})();
