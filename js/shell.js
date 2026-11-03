/* ============================================================
   shell.js — glue between the hub (index.html) and the two sections (tafsir.html, hifz.html).
   Load it in <head> with data-section="hub|tafsir|hifz" (build-www.mjs does that for the sections).

   - System bars: picks light/dark status- and nav-bar icons from the colour actually drawn under each bar, so it works
     for both apps' light/dark themes (native.js only knows data-theme="dark").
   - Sections: Android Back = close the open popup → previous in-section page → back to the hub.
     The apps navigate with pushState/replaceState (no hashchange event), so history methods are wrapped to track a
     small stack of visited hashes; going back sets location.hash, which both apps route on.
   - Remembers the last section + page for the hub's «كمّل» card.
   - Android stand-ins for browser features the WebView lacks (native only; the apps' own code is unchanged):
     <a download> backups → file + share sheet · window.print → Printer · webkitSpeechRecognition → Speech plugin
     · keep the screen on in the sections · the daily review reminder (alerts for native.js).
============================================================ */
(function () {
  const me = document.currentScript;
  const SEC = (me && me.dataset.section) || "hub";
  const Cap = window.Capacitor;
  const P = (n) => (Cap && Cap.Plugins ? Cap.Plugins[n] : null);
  const isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
  const save = (k, v) => { try { localStorage.setItem("rafiq:" + k, JSON.stringify(v)); } catch (e) {} };
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem("rafiq:" + k)); return v == null ? d : v; } catch (e) { return d; } };
  // On the device addListener() does NOT return a real Promise (no .catch → TypeError that killed this whole file
  // and the hub's script with it). Always wrap it.
  const listen = (plugin, ev, fn) => { try { return Promise.resolve(plugin.addListener(ev, fn)); } catch (e) { return Promise.reject(e); } };

  /* ---------- backups: <a download href="blob:…">.click() does nothing in a WebView ----------
     Both apps export JSON that way (Hifz «نسخة احتياطية», Tafsir bookmarks/notes). Read the blob, keep a copy in
     Documents/رفيق القرآن, and open the share sheet (Drive, WhatsApp, Files…). Fetch starts inside click(), before
     Tafsir revokes the blob URL (500 ms later). */
  async function saveAndShare(href, name) {
    const FS = P("Filesystem"), SH = P("Share");
    const data = await (await fetch(href)).text();
    FS.writeFile({ path: "رفيق القرآن/" + name, data, directory: "DOCUMENTS", encoding: "utf8", recursive: true }).catch(() => {});
    const r = await FS.writeFile({ path: name, data, directory: "CACHE", encoding: "utf8" });
    await SH.share({ title: name, url: r.uri, dialogTitle: "احفظ النسخة الاحتياطية" });
  }
  if (isNative && P("Filesystem") && P("Share")) {
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download && /^blob:/.test(this.href)) { saveAndShare(this.href, this.download).catch((e) => console.warn("[shell] backup share", e)); return; }
      return click.call(this);
    };
  }

  /* ---------- print (Tafsir «طباعة») → Android print dialog (printer or «Save as PDF») ---------- */
  if (isNative && P("Printer")) window.print = () => { P("Printer").print({ name: document.title }).catch(() => {}); };

  /* ---------- voice recitation: webkitSpeechRecognition on top of the Speech plugin ----------
     Implements what Hifz uses: lang, continuous, interimResults, onresult(e.results[i].isFinal / [0].transcript),
     onerror(e.error), onend, start(), stop(). With continuous=true (Hifz) the plugin keeps ONE session alive across
     Android's pauses (restarting natively, earcon muted) until stop(), so the mic stays on until «وقّف التسميع».
     Like the web API, e.results holds every finished segment of the session + the current partial one.
     Defined in <head>, before Hifz reads it. */
  // Always replace it on the phone: the Android WebView DOES define its own webkitSpeechRecognition, but it can't
  // record inside an app ("cr_media: Requires MODIFY_AUDIO_SETTINGS and RECORD_AUDIO. No audio device…") — a
  // "define only if missing" check left Hifz on that dead one and the mic never started.
  if (isNative && P("Speech")) {
    class NativeSpeechRecognition {
      constructor() { this.lang = "ar-SA"; this.continuous = false; this.interimResults = false; this.onresult = this.onerror = this.onend = null; this._subs = []; }
      _clear() { this._subs.forEach((s) => s.then((h) => h.remove()).catch(() => {})); this._subs = []; }
      _emit(text, isFinal) {
        if (!text || !this.onresult) return;
        const seg = (t, f) => ({ isFinal: f, length: 1, 0: { transcript: t, confidence: 1 } });
        if (isFinal) this._finals.push(text);
        else if (!this.interimResults) return;
        const results = this._finals.map((t) => seg(t, true));
        if (!isFinal) results.push(seg(text, false));
        this.onresult({ results, resultIndex: results.length - 1 });
      }
      start() {
        this._clear();
        this._finals = [];
        // listener removal is async: a session id keeps a finished session's late events (or a restarted one's)
        // from reaching Hifz twice
        const sid = (this._sid = (this._sid || 0) + 1), live = () => this._sid === sid;
        const S = P("Speech"), on = (ev, fn) => this._subs.push(listen(S, ev, (r) => { if (live()) fn(r); }));
        on("partial", (r) => this._emit(r.text, false));
        on("final", (r) => this._emit(r.text, true));
        on("error", (r) => { if (this.onerror) this.onerror({ error: r.error }); });
        on("end", () => { this._sid++; this._clear(); if (this.onend) this.onend(); });
        Promise.all(this._subs).then(() => S.start({ lang: this.lang, continuous: !!this.continuous })).catch(() => {});
      }
      stop() { P("Speech").stop().catch(() => {}); }
      abort() { this.stop(); }
    }
    window.SpeechRecognition = window.webkitSpeechRecognition = NativeSpeechRecognition;
  }

  /* ---------- keep the screen on while reading / reciting (setting on the hub; default on) ---------- */
  if (isNative && P("Screen")) P("Screen").keepOn({ on: SEC !== "hub" && load("screen", true) }).catch(() => {});

  /* ---------- daily review reminder → native.js schedules MZApp.alerts() ----------
     rafiq:remind = {on, time:"HH:MM"}. One notification a day for the next 14 days; the text counts the Hifz reviews
     due that day (hifz:items[].next ≤ day, sample items excluded). native.js re-plans when either key changes. */
  const AR = (n) => String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]);
  const reviewsTxt = (n) => n === 1 ? "مراجعة واحدة" : n === 2 ? "مراجعتين" : n <= 10 ? AR(n) + " مراجعات" : AR(n) + " مراجعة";
  const ymd = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  function alerts() {
    const r = load("remind", null);
    if (!r || !r.on) return [];
    const [hh, mm] = String(r.time || "20:00").split(":").map(Number);
    let items = [];
    try { items = (JSON.parse(localStorage.getItem("hifz:items")) || []).filter((x) => x && x.next && !x.example); } catch (e) {}
    const out = [];
    for (let i = 0; i < 14; i++) {
      const when = new Date(); when.setDate(when.getDate() + i); when.setHours(hh, mm, 0, 0);
      const due = items.filter((x) => x.next <= ymd(when)).length;
      out.push({ key: "remind:" + ymd(when), when, title: "رفيق القرآن",
        body: due ? "عندك " + reviewsTxt(due) + " النهارده في جدول الحفظ" : "ورد الحفظ والمراجعة مستنيك النهارده",
        extra: { open: due ? "hifz.html#schedule" : "hifz.html#home" } });
    }
    return out;
  }
  // tapping the reminder opens the review schedule
  if (isNative && P("LocalNotifications")) {
    listen(P("LocalNotifications"), "localNotificationActionPerformed", (e) => {
      const to = e && e.notification && e.notification.extra && e.notification.extra.open;
      if (to && /^(hifz|tafsir)\.html(#[\w-]*)?$/.test(to)) location.href = to;
    }).catch(() => {});
  }

  /* ---------- system bar icons follow the colour under them ---------- */
  function bgAt(x, y) {
    let el = document.elementFromPoint(x, y);
    for (; el && el.nodeType === 1; el = el.parentElement) {
      const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
      if (m && (m.length < 4 || +m[3] > 0.5)) return m.slice(0, 3).map(Number);
    }
    const b = (getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g) || [255, 255, 255]).map(Number);
    return b.length > 3 && !b[3] ? [255, 255, 255] : b.slice(0, 3);
  }
  const isDark = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b < 140;
  let barTimer = null;
  function syncBars() {
    clearTimeout(barTimer);
    barTimer = setTimeout(() => {
      const SB = P("SystemBars");
      if (!SB || !document.body) return;
      const w = innerWidth / 2;
      SB.setStyle({ style: isDark(bgAt(w, 1)) ? "DARK" : "LIGHT", bar: "StatusBar" }).catch(() => {});
      SB.setStyle({ style: isDark(bgAt(w, innerHeight - 2)) ? "DARK" : "LIGHT", bar: "NavigationBar" }).catch(() => {});
    }, 250);
  }
  function watchBars() {
    new MutationObserver(syncBars).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class", "style"] });
    try { matchMedia("(prefers-color-scheme: dark)").addEventListener("change", syncBars); } catch (e) {}
    addEventListener("hashchange", syncBars);
    syncBars();
    setTimeout(syncBars, 1200);   // after native.js's own (theme-attribute-only) setStyle
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watchBars); else watchBars();

  /* ---------- one theme for the whole app: auto | light | sepia | dark ----------
     Each section keeps its own key (tafsir: light/sepia/dark, missing = follow the system; hifz: auto/light/dark), so
     a change in any of them is mirrored to the others + rafiq:theme (the hub's). Sepia has no Hifz version → light. */
  const THEMES = ["auto", "light", "sepia", "dark"];
  let syncing = false;
  const rawSet = localStorage.setItem.bind(localStorage), rawRemove = localStorage.removeItem.bind(localStorage);
  function setTheme(t) {
    if (!THEMES.includes(t)) return;
    syncing = true;
    try {
      rawSet("rafiq:theme", JSON.stringify(t));
      if (t === "auto") localStorage.removeItem("tafsir:theme"); else rawSet("tafsir:theme", JSON.stringify(t));
      rawSet("hifz:theme", JSON.stringify(t === "sepia" ? "light" : t));
      stamp("tafsir:theme"); stamp("hifz:theme");
    } catch (e) {}
    syncing = false;
  }
  function getTheme() {
    try { const t = JSON.parse(localStorage.getItem("rafiq:theme")); return THEMES.includes(t) ? t : "auto"; } catch (e) { return "auto"; }
  }

  /* ---------- change stamps for the Google sync (js/cloud.js) ----------
     Any write to a tafsir:* / hifz:* key = that section changed now (rafiq:t:<section>) → sync soon. Writes made by
     the sync itself (applying Drive's copy) run with quiet(true) and are not changes. */
  let quiet = false;
  function stamp(k) {
    if (quiet) return;
    const g = /^(tafsir|hifz):/.exec(k);
    if (!g) return;
    rawSet("rafiq:t:" + g[1], String(Date.now()));
    if (window.RafiqCloud) window.RafiqCloud.changed();
  }
  try {
    localStorage.setItem = function (k, v) {
      rawSet(k, v);
      stamp(k);
      if (!syncing && !quiet && (k === "tafsir:theme" || k === "hifz:theme")) { try { setTheme(JSON.parse(v)); } catch (e) {} }
    };
    localStorage.removeItem = function (k) { rawRemove(k); stamp(k); };
  } catch (e) {}
  window.RafiqShell = { syncBars, section: SEC, setTheme, getTheme, THEMES, alerts, load, save, isNative, quiet: (on) => { quiet = !!on; } };
  if (SEC === "hub") return;

  /* ---------- section: hash stack ---------- */
  const HOME = { tafsir: "#/", hifz: "#home" }[SEC] || "";
  const norm = (h) => (!h || h === "#" || h === HOME ? "" : h);
  const stack = [norm(location.hash)];
  let goingBack = false;
  function record() {
    const h = norm(location.hash);
    if (goingBack) { goingBack = false; stack[stack.length - 1] = h; }
    else if (stack[stack.length - 1] !== h) { stack.push(h); if (stack.length > 60) stack.shift(); }
    save("last", { sec: SEC, hash: location.hash, at: Date.now() });
    syncBars();
  }
  for (const m of ["pushState", "replaceState"]) {
    const orig = history[m].bind(history);
    history[m] = function (...a) { const r = orig(...a); record(); return r; };
  }
  addEventListener("hashchange", record);
  addEventListener("popstate", record);
  save("last", { sec: SEC, hash: location.hash, at: Date.now() });

  /* ---------- section: what Back closes first ---------- */
  const $ = (s) => document.querySelector(s);
  const esc = () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  const CLOSERS = {
    tafsir: [
      [() => $(".noteed"), () => $(".noteed .cn").click()],
      [() => $("#ov.open, #keysOv.open, #panel.open, #side.open"), esc],
    ],
    hifz: [
      [() => $("#cmdk:not([hidden])"), esc],
      [() => $("#nav.open"), esc],
    ],
  }[SEC] || [];

  function back() {
    for (const [isOpen, close] of CLOSERS) {
      if (isOpen()) { try { close(); } catch (e) {} if (!isOpen()) return true; }
    }
    if (stack.length > 1) {
      stack.pop();
      goingBack = true;
      location.hash = stack[stack.length - 1] || HOME;
      return true;
    }
    goHome();
    return true;
  }
  function goHome() { location.replace("index.html"); }
  window.MZApp = { back, alerts };
  window.RafiqShell.goHome = goHome;
})();
