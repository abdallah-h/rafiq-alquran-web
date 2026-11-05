/* رفيق القرآن — one account, same data on the phone app and the web version (adapted from HTML Shelf's cloud.js).

   "سجّل دخول بجوجل" = pick a Google account and allow the app (scope drive.file) to manage the files IT creates in that
   account's Drive — it can't see any other file. Everything is in one visible folder, FOLDER (drive.google.com):
     التفسير — بيانات.json            every tafsir:* key (bookmarks, notes, reading place, quiz scores…)
     الحفظ والتسميع — بيانات.json      every hifz:* key (review schedule, khatma progress, tests, streak…)
   Each file: { app, pid, t, keys: { key: value }, kt: { key: time } } + appProperties { app, kind: "data", pid, t }.

   Merged ITEM BY ITEM: shell.js records when each key was last written or deleted (rafiq:kt:<section>); on sync each
   key takes the side that changed it last, deletions included — a note written on the computer and a review done on
   the phone before either synced both survive. (One key edited on both sides: the later edit wins.) The merged result
   goes to this device (the open section reloads to show it) and to Drive. A device's FIRST sync with an account counts
   its own times as 0, so Drive's copy wins every key it has (a fresh browser's sample data must not win).
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
  // seen[pid] = Drive file's t when we last merged it; pushed[pid] = local section stamp already merged/sent
  function blank() { return { account: null, token: null, folder: null, lastSync: 0, synced: {}, seen: {}, pushed: {} }; }
  function load() { try { return Object.assign(blank(), JSON.parse(ls.getItem(KEY) || "{}")); } catch (e) { return blank(); } }
  var st = load();
  function save() { try { ls.setItem(KEY, JSON.stringify(st)); } catch (e) {} }

  /* this device's copy of a section: its keys + when they last changed (stamped by shell.js) */
  function localData(pid) {
    var keys = {};
    for (var i = 0; i < ls.length; i++) { var k = ls.key(i); if (k && k.indexOf(pid + ":") === 0) keys[k] = ls.getItem(k); }
    return { keys: keys, t: +ls.getItem("rafiq:t:" + pid) || 0 };
  }
  function localTimes(pid) { try { return JSON.parse(ls.getItem("rafiq:kt:" + pid)) || {}; } catch (e) { return {}; } }
  /* write the merged keys onto this device (quietly: not local changes) */
  function applyData(pid, keys, kt) {
    var S = window.RafiqShell;
    if (S && S.quiet) S.quiet(true);
    try {
      var drop = [];
      for (var i = 0; i < ls.length; i++) { var k = ls.key(i); if (k && k.indexOf(pid + ":") === 0 && !(k in keys)) drop.push(k); }
      drop.forEach(function (k) { ls.removeItem(k); });
      Object.keys(keys).forEach(function (k) { if (k.indexOf(pid + ":") === 0 && ls.getItem(k) !== keys[k]) ls.setItem(k, keys[k]); });
      ls.setItem("rafiq:kt:" + pid, JSON.stringify(kt));
    } finally { if (S && S.quiet) S.quiet(false); }
  }
  /* item-by-item merge. mine/theirs = {keys, kt}; a key's time = its last write OR delete. Equal times → keep the value
     that exists (a key only one side has is kept). → { keys, kt, localChanged, remoteChanged } */
  function merge(mine, theirs) {
    var all = {}, keys = {}, kt = {}, localChanged = false, remoteChanged = false;
    [mine.keys, mine.kt, theirs.keys, theirs.kt].forEach(function (o) { Object.keys(o).forEach(function (k) { all[k] = 1; }); });
    Object.keys(all).forEach(function (k) {
      var lt = mine.kt[k] || 0, rt = theirs.kt[k] || 0;
      var inL = k in mine.keys, inR = k in theirs.keys;
      var useR = rt > lt || (rt === lt && inR && !inL) || (rt === lt && inR && inL);
      var v = useR ? (inR ? theirs.keys[k] : undefined) : (inL ? mine.keys[k] : undefined);
      if (v !== undefined) keys[k] = v;
      kt[k] = Math.max(lt, rt);
      if ((inL ? mine.keys[k] : undefined) !== v) localChanged = true;
      if ((inR ? theirs.keys[k] : undefined) !== v || (theirs.kt[k] || 0) !== kt[k]) remoteChanged = true;
    });
    return { keys: keys, kt: kt, localChanged: localChanged, remoteChanged: remoteChanged };
  }

  var listeners = [], state = "idle", error = "", reloadAfter = false;
  function setState(s, e) { state = s; error = e || ""; listeners.forEach(function (fn) { try { fn(api.info()); } catch (x) {} }); bar(); }

  /* Web: Google's permission lasts an hour and only a click can renew it (a popup needs a user gesture). On the sections
     (the hub has its own card) a small bar says so, instead of syncing silently stopping. */
  function bar() {
    if (native || PAGE === "hub" || !document.body) return;
    var b = document.getElementById("rq-cloudbar");
    var need = !!st.account && state === "error" && /needs-consent/.test(error);
    if (!need) { if (b) b.remove(); return; }
    if (b) return;
    b = document.createElement("button");
    b.id = "rq-cloudbar"; b.type = "button";
    b.textContent = "☁️ إذن جوجل خلص — اضغط عشان تكمّل المزامنة";
    b.style.cssText = "position:fixed;z-index:9999;left:50%;transform:translateX(-50%);bottom:calc(16px + env(safe-area-inset-bottom,0px));" +
      "border:0;border-radius:999px;padding:10px 18px;font:inherit;font-size:14px;cursor:pointer;color:#fff;background:#0f6b4f;" +
      "box-shadow:0 6px 20px rgba(0,0,0,.25);max-width:calc(100% - 32px)";
    b.onclick = function () { b.disabled = true; api.reauth(); };
    document.body.appendChild(b);
  }

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
      var mine = localData(pid), rf = by[pid], rt = rf ? String(rf.appProperties.t || "") : "";
      var has = Object.keys(mine.keys).length > 0, first = !st.synced[pid];
      var remoteNew = !!rf && rt !== String(st.seen[pid] || ""), localNew = mine.t > (st.pushed[pid] || 0);
      if (!rf && !has) continue;
      if (rf && !remoteNew && !localNew && !first) continue;          // nothing changed on either side
      var doc = rf ? await drive(API + "/files/" + rf.id + "?alt=media") : null;
      var theirs = { keys: (doc && doc.keys) || {}, kt: (doc && doc.kt) || {} };
      if (doc && !doc.kt) Object.keys(theirs.keys).forEach(function (k) { theirs.kt[k] = +doc.t || 1; });  // file from before item times
      var mineT = first ? {} : localTimes(pid);                       // first sync: Drive wins every key it has
      var m = merge({ keys: mine.keys, kt: mineT }, theirs);
      if (m.localChanged) { applyData(pid, m.keys, m.kt); if (PAGE === pid) reloadAfter = true; }
      else ls.setItem("rafiq:kt:" + pid, JSON.stringify(m.kt));
      var newT = rt;
      if (m.remoteChanged || !rf) {
        newT = String(Date.now());
        var meta = { name: SECTIONS[pid] + " — بيانات.json", appProperties: { app: APP, kind: "data", pid: pid, t: newT } };
        if (!rf) meta.parents = [fid];
        await upload(rf && rf.id, meta, JSON.stringify({ app: APP, pid: pid, t: +newT, keys: m.keys, kt: m.kt }));
      }
      st.seen[pid] = newT; st.pushed[pid] = +ls.getItem("rafiq:t:" + pid) || 0; st.synced[pid] = 1;
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
        st.synced = {}; st.seen = {}; st.pushed = {}; save();
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
