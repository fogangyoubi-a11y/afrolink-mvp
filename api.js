/* AfroLink — client API partagé.
   Point d'entrée unique vers le backend (auth, producteurs, boutiques,
   catalogue, demandes, messagerie, commandes). Remplace le stockage
   localStorage utilisé par le prototype initial.

   Pour pointer vers un backend déployé, définis avant d'inclure ce fichier :
     <script>window.AFROLINK_API_BASE = 'https://api.afrolink.example.com/api';</script>
   Par défaut, pointe sur un backend local (npm start dans /backend). */
(function () {
  const API_BASE = window.AFROLINK_API_BASE || 'http://localhost:4000/api';
  const TOKEN_KEY = 'afrolink_token';
  const USER_KEY = 'afrolink_user';

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || null; }
    catch (e) { return null; }
  }

  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY)) || null; }
    catch (e) { return null; }
  }

  function setSession(token, user) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch (e) { /* ignore storage errors */ }
  }

  function clearSession() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch (e) { /* ignore */ }
  }

  // Low-level request helper. Throws an Error with .status set on failure.
  async function request(path, opts) {
    opts = opts || {};
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token && opts.auth !== false) headers.Authorization = 'Bearer ' + token;

    let res;
    try {
      res = await fetch(API_BASE + path, {
        method: opts.method || 'GET',
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
      });
    } catch (networkErr) {
      const err = new Error('Impossible de contacter le serveur AfroLink. Vérifie ta connexion ou réessaie plus tard.');
      err.status = 0;
      err.network = true;
      throw err;
    }

    let data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }

    if (!res.ok) {
      if (res.status === 401) clearSession();
      const err = new Error((data && data.error) || `Erreur serveur (${res.status}).`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  const AfroAPI = {
    API_BASE: API_BASE,
    getToken: getToken,
    getUser: getUser,
    isLoggedIn: function () { return !!getToken(); },

    get: function (path) { return request(path, { method: 'GET' }); },
    post: function (path, body) { return request(path, { method: 'POST', body: body || {} }); },
    put: function (path, body) { return request(path, { method: 'PUT', body: body || {} }); },
    // Public GET, never sends the Authorization header even if logged in.
    getPublic: function (path) { return request(path, { method: 'GET', auth: false }); },
    // Public POST (e.g. guest messaging), never sends Authorization.
    postPublic: function (path, body) { return request(path, { method: 'POST', body: body || {}, auth: false }); },

    async signup(payload) {
      const data = await request('/auth/signup', { method: 'POST', body: payload, auth: false });
      setSession(data.token, data.user);
      return data.user;
    },

    async login(payload) {
      const data = await request('/auth/login', { method: 'POST', body: payload, auth: false });
      setSession(data.token, data.user);
      return data.user;
    },

    logout: function () { clearSession(); },

    // Re-validates the token against the server and refreshes the cached user.
    // Returns null (and clears the session) if the token is missing/invalid.
    async me() {
      if (!getToken()) return null;
      try {
        const user = await request('/auth/me', { method: 'GET' });
        setSession(getToken(), user);
        return user;
      } catch (e) {
        if (e.status === 401) clearSession();
        return null;
      }
    },

    // Injects a login/account block into the page's `.nav-links` element (if present).
    // profileHrefFor(role) lets each page decide where "my account" should link to.
    mountAuthNav: function (profileHrefFor) {
      const nav = document.querySelector('.nav-links');
      if (!nav) return;
      const user = getUser();

      const wrap = document.createElement('span');
      wrap.className = 'afro-auth-nav';
      wrap.style.display = 'flex';
      wrap.style.gap = '14px';
      wrap.style.alignItems = 'center';

      if (!user) {
        wrap.innerHTML = '<a href="compte.html">Connexion</a>';
      } else {
        const href = (typeof profileHrefFor === 'function' && profileHrefFor(user.role)) ||
          (user.role === 'producer' ? 'producteurs.html' : 'boutiques.html');
        wrap.innerHTML =
          '<a href="' + href + '" title="' + (user.email || '') + '">' +
          (user.role === 'producer' ? 'Mon profil producteur' : 'Mon profil boutique') +
          '</a><a href="#" id="afro-logout-link">Déconnexion</a>';
      }

      nav.appendChild(wrap);

      const logoutLink = document.getElementById('afro-logout-link');
      if (logoutLink) {
        logoutLink.addEventListener('click', function (e) {
          e.preventDefault();
          clearSession();
          window.location.reload();
        });
      }
    }
  };

  window.AfroAPI = AfroAPI;
})();
