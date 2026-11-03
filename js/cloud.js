/* رفيق القرآن — one account, same data on the phone app and the web version (adapted from HTML Shelf's cloud.js).

   "سجّل دخول بجوجل" = pick a Google account and allow the app (scope drive.file) to manage the files IT creates in that
   account's Drive — it can't see any other file. Everything is in one visible folder, FOLDER (drive.google.com):
     التفسير — بيانات.json            every tafsir:* key (bookmarks, notes, reading place, quiz scores…)
     الحفظ والتسميع — بيانات.json      every hifz:* key (review schedule, khatma progress, tests, streak…)
   Each file: { app, pid, t, keys: { key: value } } + appProperties { app, kind: "data", pid, t }; t = last change.

   Per section the newer copy wins: this device newer → upload; Drive newer → replace this device's keys of that section
   (and reload the page if that section is open, so it shows them). shell.js stamps rafiq:t:<section> on every write.
   Phone: Play Services token (GoogleDriveAuthPlugin), renewed silently. Web: Google Identity Services token client with
   the Web client of the SAME Google Cloud project (drive.file access belongs to the project, so both see the same
   files); a browser token lasts an hour, then «احفظ دلوقتي» asks again with one click.
   Rules from HTML Shelf / GymPlan: one sync at a time (promise chain), the token must belong to the signed-in account.
   The hub draws the account card from window.RafiqCloud (bottom of this file). */
(function () {
  var C = window.Capacitor;
  var native = !!(C && C.isNativePlatform && C.isNativePlatform());
  var WEB_CLIENT_ID = window.RAFIQ_WEB_CLIENT_ID || "";
  var gisP = null;
  function loadGis() {
    if (!gisP) gisP = new Promise(function (res, rej) {
      var s = document.createElement("script"); s.src = "https://accounts.google.com/gsi/client"; s.async = true;
      s.onload = res; s.onerror = function () { gisP = null; rej(new Error("network: gsi")); }; document.head.appendChild(s);
    });
    return gisP;
  }
  var webAuth = !native && WEB_CLIENT_ID ? {
    getAccessToken: async function (o) {
      if (!o.interactive) throw new Error("needs-consent");
      await loadGis();
      return new Promise(function (res, rej) {
        var tc = window.google.accounts.oauth2.initTokenClient({
          client_id: WEB_CLIENT_ID, scope: o.scopes.join(" "), hint: o.email || undefined, prompt: o.email ? "" : "select_account",
          callback: function (r) { if (r && r.access_token) res({ accessToken: r.access_token, expiresIn: +r.expires_in || 3500 }); else rej(new Error("needs-consent")); },
          error_callback: function () { rej(new Error("needs-consent")); }
        });
        tc.requestAccessToken();
      });
    }
  } : null;
  var AUTH = native && C.Plugins ? C.Plugins.GoogleDriveAuth : webAuth; // plugin: plain object — never await the plugin itself

  var SCOPE = "https://www.googleapis.com/auth/drive.file";
  var API = "https://www.googleapis.com/drive/v3", UPLOAD = "https://www.googleapis.com/upload/drive/v3";
  var FOLDER = "رفيق القرآن — بياناتي";
  var APP = "rafiq-alquran";
  var KEY = "rafiq:cloud";
  var SECTIONS = { tafsir: "التفسير", hifz: "الحفظ والتسميع" };   // pid → file title; keys = "<pid>:*"
  var PAGE = (document.currentScript && document.currentScript.dataset.section) || (window.RafiqShell && RafiqShell.section) || "hub";

  var ls = window.localStorage;
  // synced[pid]: this device has exchanged that section with this account at least once. Until then Drive WINS if it
  // has the section — a fresh device (the web version opened for the first time) has Hifz's sample data written "just
  // now", which would otherwise look newer than the real data and overwrite it.
  function blank() { return { account: null, token: null, folder: null, lastSync: 0, synced: {} }; }
  function load() { try { return Object.assign(blank(), JSON.parse(ls.getItem(KEY) || "{}")); } catch (e) { return blank(); } }
  var st = load();
  function save() { try { ls.setItem(KEY, JSON.stringify(st)); } catch (e) {} }

  /* this device's copy of a section: its keys + when they last changed (stamped by shell.js) */
  function localData(pid) {
    var keys = {};
    for (var i = 0; i < ls.length; i++) { var k = ls.key(i); if (k && k.indexOf(pid + ":") === 0) keys[k] = ls.getItem(k); }
    return { keys: keys, t: +ls.getItem("rafiq:t:" + pid) || 0 };
  }
  function applyData(pid, keys, t) {
    var S = window.RafiqShell;
    if (S && S.quiet) S.quiet(true);   // these writes are not local changes
    try {
      var drop = [];
      for (var i = 0; i < ls.length; i++) { var k = ls.key(i); if (k && k.indexOf(pid + ":") === 0 && !(k in keys)) drop.push(k); }
      drop.forEach(function (k) { ls.removeItem(k); });
      Object.keys(keys).forEach(function (k) { if (k.indexOf(pid + ":") === 0) ls.setItem(k, keys[k]); });
      ls.setItem("rafiq:t:" + pid, String(t));
    } finally { if (S && S.quiet) S.quiet(false); }
  }

  var listeners = [], state = "idle", error = "", reloadAfter = false;
  function setState(s, e) { state = s; error = e || ""; listeners.forEach(function (fn) { try { fn(api.info()); } catch (x) {} }); }

  // ── tokens + Drive requests ──
  async function token(interactive) {
    var email = st.account ? st.account.email : "";
    if (email && st.token && st.token.email === email && st.token.exp - 120000 > Date.now()) return st.token.token;
    if (!AUTH) throw new Error("not-available");
    var res = await AUTH.getAccessToken({ scopes: [SCOPE], interactive: !!interactive, email: email });
    if (!res || !res.accessToken) throw new Error("needs-consent");
    st.token = { email: email, token: res.accessToken, exp: Date.now() + (res.expiresIn || 3500) * 1000 }; save();
    return res.accessToken;
  }
  async function drive(url, opt) {
    opt = opt || {};
    var go = async function () {
      var t = await token(false);
      return fetch(url, { method: opt.method || "GET", headers: Object.assign({ Authorization: "Bearer " + t }, opt.headers || {}), body: opt.body });
    };
    var res = await go();
    if (res.status === 401) { st.token = null; save(); res = await go(); }
    if (!res.ok && res.status !== 404) {
      var text = ""; try { text = await res.text(); } catch (e) {}
      var err = new Error("drive-" + res.status + ": " + text.slice(0, 160)); err.status = res.status; throw err;
    }
    if (opt.as === "none" || res.status === 204 || res.status === 404) return null;
    return res.json();
  }
  var q = function (s) { return "'" + String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'"; };

  async function folderId() {
    if (st.folder && st.folder.email === st.account.email) {
      var f = await drive(API + "/files/" + st.folder.id + "?fields=id,trashed");
      if (f && !f.trashed) return st.folder.id;
    }
    var r = await drive(API + "/files?pageSize=10&fields=files(id)&q=" + encodeURIComponent(
      "name=" + q(FOLDER) + " and mimeType='application/vnd.google-apps.folder' and trashed=false"));
    var id = r.files && r.files[0] ? r.files[0].id : null;
    if (!id) {
      var c = await drive(API + "/files?fields=id", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: FOLDER, mimeType: "application/vnd.google-apps.folder", appProperties: { app: APP } }) });
      id = c.id;
    }
    st.folder = { email: st.account.email, id: id }; save();
    return id;
  }
  async function upload(fileId, meta, content) {
    var b = "rafiq" + Math.random().toString(36).slice(2);
    var body = "--" + b + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(meta) +
      "\r\n--" + b + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + content + "\r\n--" + b + "--";
    var url = UPLOAD + "/files" + (fileId ? "/" + fileId : "") + "?uploadType=multipart&fields=id";
    return (await drive(url, { method: fileId ? "PATCH" : "POST", headers: { "Content-Type": "multipart/related; boundary=" + b }, body: body })).id;
  }

  // ── one full pass ──
  async function syncOnce() {
    if (!st.account) return;
    setState("syncing");
    var who = await drive(API + "/about?fields=user(emailAddress)");
    if (!who || !who.user || who.user.emailAddress !== st.account.email) throw new Error("account-mismatch");
    var fid = await folderId();
    var r = await drive(API + "/files?pageSize=100&fields=files(id,name,appProperties)&q=" + encodeURIComponent(q(fid) + " in parents and trashed=false"));
    var by = {};
    (r.files || []).forEach(function (f) { var a = f.appProperties || {}; if (a.app === APP && a.kind === "data") by[a.pid] = f; });
    for (var pid in SECTIONS) {
      var mine = localData(pid), rf = by[pid], rt = rf ? +rf.appProperties.t || 0 : -1, lt = mine.t;
      var has = Object.keys(mine.keys).length > 0, first = !st.synced[pid];
      if (rf && (rt > lt || first)) {                            // Drive is newer (or this device is new) → take it
        var doc = await drive(API + "/files/" + rf.id + "?alt=media");
        if (doc && doc.keys) { applyData(pid, doc.keys, rt); if (PAGE === pid) reloadAfter = true; }
      } else if (has && (!rf || lt > rt)) {                      // this device is newer → upload
        if (!lt) { lt = Date.now(); ls.setItem("rafiq:t:" + pid, String(lt)); }   // data from before sync existed
        var meta = { name: SECTIONS[pid] + " — بيانات.json", appProperties: { app: APP, kind: "data", pid: pid, t: String(lt) } };
        if (!rf) meta.parents = [fid];
        await upload(rf && rf.id, meta, JSON.stringify({ app: APP, pid: pid, t: lt, keys: mine.keys }));
      }
      if (rf || has) st.synced[pid] = 1;
    }
    st.lastSync = Date.now(); save();
    setState("ok");
    // the open section's data was replaced underneath it → show the new data
    if (reloadAfter) { reloadAfter = false; setTimeout(function () { location.reload(); }, 300); }
  }

  var chain = Promise.resolve(), timer = null;
  function sync() {
    chain = chain.then(syncOnce).catch(function (e) {
      var m = String(e && e.message || e);
      setState("error", m);
      if (/needs-consent|account-mismatch/.test(m)) { st.token = null; save(); }
    });
    return chain;
  }
  function soon(ms) { if (!st.account) return; clearTimeout(timer); timer = setTimeout(sync, ms || 4000); }

  var api = {
    available: !!AUTH,
    web: !native,
    info: function () { return { signedIn: !!st.account, email: st.account ? st.account.email : "", name: st.account ? st.account.name : "", state: state, error: error, lastSync: st.lastSync }; },
    onChange: function (fn) { listeners.push(fn); },
    signIn: async function () {
      setState("signing-in");
      try {
        st.account = null; st.token = null;
        var res = await AUTH.getAccessToken({ scopes: [SCOPE], interactive: true, email: "" });
        var r = await fetch(API + "/about?fields=user(displayName,emailAddress)", { headers: { Authorization: "Bearer " + res.accessToken } });
        if (!r.ok) throw new Error("drive-" + r.status + ": " + (await r.text()).slice(0, 160)); // 403 = Drive API not enabled
        var who = await r.json();
        if (!who.user || !who.user.emailAddress) throw new Error("no-account");
        st.account = { email: who.user.emailAddress, name: who.user.displayName || "" };
        st.token = { email: st.account.email, token: res.accessToken, exp: Date.now() + (res.expiresIn || 3500) * 1000 };
        st.synced = {}; save();
        await sync();
        return true;
      } catch (e) { setState("error", String(e && e.message || e)); return false; }
    },
    // permission expired (web: after an hour) → ask again for the same account, then sync
    reauth: async function () {
      try { st.token = null; save(); await token(true); return sync(); }
      catch (e) { setState("error", String(e && e.message || e)); }
    },
    signOut: function () { st = blank(); save(); setState("idle"); },
    sync: sync,
    changed: function () { soon(4000); },   // shell.js: a section saved something
    _state: function () { return st; }
  };
  window.RafiqCloud = api;

  if (native && C.Plugins.App) C.Plugins.App.addListener("appStateChange", function (s) { soon(s.isActive ? 1500 : 10); });
  else document.addEventListener("visibilitychange", function () { soon(document.hidden ? 10 : 1500); });
  // leaving a page (hub ⇄ section) → push what's pending right away (sendBeacon can't carry the auth header)
  window.addEventListener("pagehide", function () { if (timer) { clearTimeout(timer); sync(); } });
  window.addEventListener("online", function () { soon(1000); });
  setInterval(function () { soon(10); }, 5 * 60 * 1000);
  if (st.account) setTimeout(function () { soon(10); }, 1500);
})();
