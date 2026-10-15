/* EUDC MBD Work Lists — Firebase connector.
   Gives the page the same small API it used inside Claude (db / user / downloads),
   backed by Firebase: Google sign-in with office approval, Firestore for lists and
   actions, and Firebase Storage (signed-in, approved users only) for consumer data. */
(function () {
  'use strict';
  var cfg = window.FIREBASE_CONFIG;
  var css = document.createElement('style');
  css.textContent = '#fbGate{position:fixed;inset:0;z-index:50;background:var(--bg,#f3f5f4);display:flex;align-items:center;justify-content:center;padding:24px 16px;overflow:auto}' +
    '#fbGate .box{max-width:420px;width:100%;background:var(--surface,#fff);border:1px solid var(--line,#d7dedc);border-radius:12px;padding:22px;display:flex;flex-direction:column;gap:14px;font-family:inherit;color:var(--ink,#15211f)}' +
    '#fbGate h2{margin:0;font-family:var(--f-display,inherit);text-transform:uppercase;letter-spacing:.04em;font-size:22px}' +
    '#fbGate p{margin:0;line-height:1.45}#fbGate .muted{color:var(--muted,#5b6a67);font-size:14px}' +
    '#fbGate button{font:inherit;font-weight:700;font-size:16px;border-radius:8px;padding:12px 16px;border:1px solid var(--brand,#0d5c56);background:var(--brand,#0d5c56);color:var(--brand-ink,#fff);cursor:pointer}' +
    '#fbGate button.ghost{background:transparent;color:var(--brand,#0d5c56)}#fbGate .err{color:var(--bad,#b3261e);font-size:14px}';
  document.head.appendChild(css);

  var gateEl = document.createElement('div'); gateEl.id = 'fbGate';
  function showGate(html) { gateEl.innerHTML = '<div class="box">' + html + '</div>'; if (!gateEl.isConnected) (document.body || document.documentElement).appendChild(gateEl); gateEl.hidden = false; }
  function hideGate() { gateEl.hidden = true; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function onReady(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }

  if (!cfg || !cfg.apiKey || /PASTE/.test(cfg.apiKey)) {
    onReady(function () { showGate('<h2>Setup needed</h2><p>Firebase is not configured yet. Open <b>config/firebase-config.js</b> in the GitHub repository and paste your Firebase web app settings (see README).</p>'); });
    window.claude = { use: function () { return new Promise(function () {}); } };
    return;
  }

  firebase.initializeApp(cfg);
  var auth = firebase.auth(), fs = firebase.firestore();
  try { fs.enablePersistence({ synchronizeTabs: true }).catch(function () {}); } catch (e) {}

  var state = { user: null, profile: null };
  var gateResolve; var gate = new Promise(function (r) { gateResolve = r; });
  var unsubProfile = null;

  function signIn() {
    var p = new firebase.auth.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' });
    auth.signInWithPopup(p).catch(function (e) {
      if (e && /popup|operation-not-supported|web-storage/i.test(e.code || '')) return auth.signInWithRedirect(p);
      var el = document.getElementById('fbErr'); if (el) el.textContent = 'Sign-in did not finish (' + (e.code || e.message) + '). Try again.';
    });
  }
  function loginScreen(msg) {
    showGate('<h2>EUDC MBD Work Lists</h2><p>Sign in with your Google account. The office approves each new account once; after that this phone opens straight to your work lists.</p>' +
      '<button type="button" id="fbIn">Sign in with Google</button><p class="err" id="fbErr">' + esc(msg || '') + '</p>');
    document.getElementById('fbIn').onclick = signIn;
  }
  function waitScreen(u, p) {
    var rejected = p && p.status === 'rejected';
    showGate('<h2>' + (rejected ? 'Access not approved' : 'Waiting for approval') + '</h2>' +
      '<p>Signed in as <b>' + esc(u.displayName || '') + '</b><br><span class="muted">' + esc(u.email || '') + '</span></p>' +
      '<p class="muted">' + (rejected ? 'The office did not approve this account. Call the office if this is a mistake.' : 'Ask the office to approve your account in Office records → Users. This screen opens by itself once approved.') + '</p>' +
      '<button type="button" class="ghost" id="fbOut">Use a different account</button>');
    document.getElementById('fbOut').onclick = function () { auth.signOut(); };
  }

  onReady(function () { if (!state.user) showGate('<h2>EUDC MBD Work Lists</h2><p class="muted">Loading…</p>'); });
  auth.getRedirectResult().catch(function (e) { loginScreen('Sign-in did not finish (' + (e.code || e.message) + ').'); });

  auth.onAuthStateChanged(function (u) {
    if (unsubProfile) { unsubProfile(); unsubProfile = null; }
    if (!u) { if (state.user) { location.reload(); return; } onReady(function () { loginScreen(); }); return; }
    var ref = fs.doc('users/' + u.uid);
    ref.get().then(function (s) {
      if (!s.exists) return ref.set({ name: u.displayName || '', email: u.email || '', status: 'pending', role: 'staff', createdAt: new Date().toISOString() });
    }).then(function () {
      unsubProfile = ref.onSnapshot(function (s) {
        var p = s.data() || {};
        if (p.status !== 'approved') { onReady(function () { waitScreen(u, p); }); return; }
        var first = !state.user; state.user = u; state.profile = p;
        try { if (!localStorage.getItem('srv_me') || localStorage.getItem('srv_me_uid') !== u.uid) { localStorage.setItem('srv_me', JSON.stringify({ name: p.name || u.displayName || u.email, desig: p.desig || (p.role === 'staff' ? 'TG-2' : 'Office staff') })); localStorage.setItem('srv_me_uid', u.uid); localStorage.removeItem('srv_queue'); } } catch (e) {}
        hideGate(); if (first) gateResolve(state);
      }, function (e) { onReady(function () { loginScreen('Could not read your account (' + (e.code || e.message) + ').'); }); });
    }).catch(function (e) { onReady(function () { loginScreen('Could not set up your account (' + (e.code || e.message) + ').'); }); });
  });

  // ---- db adapter (same shape the page already uses)
  function mapErr(e) {
    var c = (e && e.code) || '';
    if (/permission-denied|unauthenticated|invalid-argument|failed-precondition/.test(c)) return { code: 'invalid_argument', message: e.message };
    if (/resource-exhausted/.test(c)) return { code: 'quota_exceeded', message: e.message };
    return { code: 'unavailable', message: e && e.message };
  }
  function rethrow(e) { throw mapErr(e); }
  function clean(d) { return JSON.parse(JSON.stringify(d, function (k, v) { return v === undefined ? null : v; })); }
  function wrapSnap(s) { return { id: s.id, exists: s.exists, data: function () { return s.data(); }, metadata: s.metadata }; }
  function wrapQS(r) { return { docs: r.docs.map(wrapSnap), size: r.size, empty: r.empty, docChanges: function () { return r.docChanges(); }, metadata: r.metadata }; }
  function wrapQuery(q) {
    return {
      where: function (f, o, v) { return wrapQuery(q.where(f, o, v)); },
      orderBy: function (f, d) { return wrapQuery(q.orderBy(f, d || 'asc')); },
      limit: function (n) { return wrapQuery(q.limit(n)); },
      get: function () { return q.get().then(wrapQS, rethrow); },
      onSnapshot: function (n, e) { return q.onSnapshot(function (r) { n(wrapQS(r)); }, function (err) { if (e) e(mapErr(err)); }); }
    };
  }
  function wrapDoc(ref) {
    return {
      id: ref.id, path: ref.path,
      get: function () { return ref.get().then(wrapSnap, rethrow); },
      set: function (d) { return ref.set(clean(d)).catch(rethrow); },
      update: function (d) { return ref.update(clean(d)).catch(rethrow); },
      delete: function () { return ref.delete().catch(rethrow); },
      collection: function (c) { return wrapCol(ref.collection(c)); },
      onSnapshot: function (n, e) { return ref.onSnapshot(function (s) { n(wrapSnap(s)); }, function (err) { if (e) e(mapErr(err)); }); }
    };
  }
  function wrapCol(c) {
    var q = wrapQuery(c); q.path = c.path;
    q.doc = function (id) { return wrapDoc(id ? c.doc(id) : c.doc()); };
    q.add = function (d) { return c.add(clean(d)).then(wrapDoc, rethrow); };
    return q;
  }
  var db = { doc: function (p) { return wrapDoc(fs.doc(p)); }, collection: function (p) { return wrapCol(fs.collection(p)); } };
  var role = function () { return (state.profile && state.profile.role) || 'staff'; };
  var userApi = {
    id: function () { return Promise.resolve(state.user ? state.user.uid : null); },
    isOwner: function () { return Promise.resolve(role() === 'admin'); },
    canEdit: function () { return Promise.resolve(role() === 'admin' || role() === 'office'); },
    can: function () { return Promise.resolve(true); },
    profiles: function (ids) { var o = {}; [].concat(ids).forEach(function (i) { o[i] = { id: i, name: '', email: null }; }); return Promise.resolve(o); },
    me: function () { var u = state.user || {}; return Promise.resolve({ id: u.uid || null, name: u.displayName || '', email: u.email || null, isOwner: role() === 'admin', canEdit: role() !== 'staff' }); }
  };
  var downloads = {
    save: function (o) {
      var url = URL.createObjectURL(o.data), a = document.createElement('a');
      a.href = url; a.download = o.filename || 'download.csv'; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 4000); return Promise.resolve();
    }
  };
  window.claude = { use: function (n) { return gate.then(function () { return n === 'db' ? db : n === 'user' ? userApi : n === 'downloads' ? downloads : null; }); } };

  // ---- consumer data files live in Firestore under master/ (approved users only).
  // Each file is stored as text in chunks (master/<file>~0, ~1, ...) with a small
  // header doc master/<file> = {parts, size, updatedAt}. Works on the free Spark plan.
  var CHUNK = 900000, fileCache = {};
  function readMaster(name) {
    if (!fileCache[name]) fileCache[name] = fs.doc('master/' + name).get().then(function (h) {
      if (!h.exists) return null;
      var n = h.data().parts || 0, jobs = [];
      for (var i = 0; i < n; i++) jobs.push(fs.doc('master/' + name + '~' + i).get());
      return Promise.all(jobs).then(function (ds) { return ds.map(function (d) { return (d.data() || {}).d || ''; }).join(''); });
    }).catch(function (e) { delete fileCache[name]; throw e; });
    return fileCache[name];
  }
  var realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var u = typeof input === 'string' ? input : (input && input.url) || '';
    var m = u.match(/^(?:\.\/)?data\/([^?#]+)/);
    if (!m) return realFetch(input, init);
    return gate.then(function () { return readMaster(m[1]); }).then(function (txt) {
      return txt == null ? new Response('', { status: 404 }) : new Response(txt, { status: 200, headers: { 'Content-Type': 'application/json' } });
    }, function () { return new Response('', { status: 404 }); });
  };

  // ---- helpers for the Office page (users, master data upload)
  window.FB = {
    state: function () { return state; }, signOut: function () { return auth.signOut(); },
    users: function () { return fs.collection('users').get().then(function (r) { return r.docs.map(function (d) { var x = d.data(); x.uid = d.id; return x; }); }); },
    setUser: function (uid, patch) { return fs.doc('users/' + uid).update(patch); },
    uploadMaster: function (file, onProgress) {
      return file.text().then(function (txt) {
        var parts = Math.max(1, Math.ceil(txt.length / CHUNK)), i = 0;
        function next() {
          if (i >= parts) return fs.doc('master/' + file.name).set({ parts: parts, size: txt.length, updatedAt: new Date().toISOString(), by: (state.user && state.user.uid) || '' });
          var k = i++;
          return fs.doc('master/' + file.name + '~' + k).set({ d: txt.slice(k * CHUNK, (k + 1) * CHUNK) }).then(function () { if (onProgress) onProgress(i / parts); return next(); });
        }
        return next().then(function () { delete fileCache[file.name]; });
      });
    },
    masterInfo: function (name) { return fs.doc('master/' + name).get().then(function (s) { return s.exists ? s.data() : null; }, function () { return null; }); }
  };
})();
