/* ============================================================
   hifz-nav.js — organizes the Hifz section's 28 pages into 6 groups (Quran first).
   One source of truth (GROUPS) drives:
     - the side menu: collapsible groups (<details>); the group of the open page opens by itself
     - the «أقسام المرجع» map on the Hifz home (replaces the old flat 16-card grid; now lists every page)
     - the group name in the top bar, each page's eyebrow, and «السابق / التالي» at the bottom of each page
   build-www.mjs loads it right after hifz's </nav> (so the menu is rebuilt before the app's own script reads it) and
   puts <div id="rq-map"> where the old grid was. The app's code keeps working unchanged: links stay
   <a href="#x" data-r="x">plain text</a> (cmdPages() reads childNodes[0], go() sets aria-current by data-r).
============================================================ */
(function () {
  const GROUPS = [
    { id: "quran", t: "القرآن", d: "خطة الختم، والمصحف، وتثبيت المحفوظ",
      icon: '<path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5Z"/><path d="M12 6.5v13"/>',
      pages: [
        ["khatma", "خطة ختم القرآن", "عمّ، ثم تبارك، ثم البقرة، ثم باقي القرآن. بحاسبة مدة ومتابعة لكل سورة.", "افتح الخطة", 1],
        ["quran", "طريقة حفظ القرآن", "الوجه اليومي، القريب والبعيد، المتشابهات.", "اقرأ"],
        ["mushaf", "مصحف الحفظ", "صفحات مصحف المدينة بأوضاع إخفاء، تسمّع بيها من غير ما تقفل المصحف.", "افتح المصحف"],
        ["hifzq", "تثبيت حفظ القرآن", "أسئلة من نص المصحف على قد اللي إنت حافظه، والسور اللي بتغلط فيها بتتكرر أكتر.", "ابدأ", 1],
        ["mutash", "المتشابهات اللفظية", "الآيات اللي بتتشابه في ألفاظها، والفرق بينها ملوّن.", "اقرأ"],
      ] },
    // tjr-… pages are created by js/hifz-tajweed.js (one per rule: explanation + Quran examples + questions)
    { id: "tajweed", t: "التجويد", d: "كل حكم في صفحة: شرح وأمثلة كتير من القرآن وأسئلة",
      icon: '<path d="M4 18c3-6 5-9 8-9s5 3 8 9"/><circle cx="12" cy="5" r="2"/><path d="M8 21h8"/>',
      pages: [
        ["tajweed", "مدخل التجويد", "ألوان مصحف التجويد، وسور كاملة ملونة، وإزاي تتعلم الأحكام مع خطة الحفظ.", "ابدأ هنا", 1],
        ["tjr-makharij", "مخارج الحروف", "الجوف والحلق واللسان والشفتين والخيشوم.", "اقرأ"],
        ["tjr-sifat", "صفات الحروف", "الصفات اللي ليها ضد واللي ملهاش.", "اقرأ"],
        ["tjr-noon", "النون الساكنة والتنوين", "الإظهار والإدغام والإقلاب والإخفاء، بأمثلة كتير وأسئلة.", "اتعلم", 1],
        ["tjr-meem", "الميم الساكنة والغنة", "الإخفاء والإدغام والإظهار الشفوي، والنون والميم المشددتين.", "اتعلم"],
        ["tjr-lam", "اللامات", "اللام الشمسية والقمرية، ولام الفعل والحرف، ولفظ الجلالة.", "اتعلم"],
        ["tjr-idgham", "الإدغام بين الحروف", "المتماثلين والمتجانسين والمتقاربين.", "اتعلم"],
        ["tjr-madd", "المدود", "المد الطبيعي والمتصل والمنفصل والعارض واللازم، ومقدار كل واحد.", "اتعلم", 1],
        ["tjr-tafkhim", "التفخيم والترقيق", "حروف الاستعلاء، وأحكام الراء.", "اقرأ"],
        ["tjr-qalqala", "القلقلة", "حروف «قطب جد»: الصغرى والكبرى.", "اتعلم"],
        ["tjr-hamza", "همزة الوصل والقطع", "إزاي تبدأ بهمزة الوصل، وإمتى تسقط.", "اتعلم"],
        ["tjr-waqf", "الوقف والابتداء", "أنواع الوقف، وعلامات مصحف المدينة.", "اقرأ"],
        ["tjr-hafs", "رواية حفص وآداب التلاوة", "السكتات والكلمات الخاصة، والاستعاذة والبسملة، واللحن.", "اقرأ"],
        ["tjr-errors", "أخطاء نطق منتشرة", "القاف والجيم والثاء والذال والظاء والضاد والهمزة.", "اقرأ"],
        ["tjquiz", "بنك أسئلة التجويد", "كل الأسئلة مقسّمة أقسام بالوقت، بتسجل نتيجتك وبتجمع أخطاءك.", "اختبر نفسك"],
      ] },
    { id: "practice", t: "التسميع والمراجعة", d: "اختبر نفسك، وراجع في ميعادك كل يوم",
      icon: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>',
      pages: [
        ["tests", "اختبارات التسميع", "تسميع كامل، ملء فراغات، ترتيب، بداية عشوائية، بطاقات.", "اختبر نفسك", 1],
        ["schedule", "جدول المراجعة", "بيقولك تراجع إيه النهارده، وبيتعدل حسب درجتك.", "افتح الجدول"],
        ["plan", "الخطة اليومية", "ساعة ونص في اليوم تكفي لو اتقسمت صح.", "اقرأ"],
        ["challenge", "تحدي ٣٠ يوم", "مهمة صغيرة كل يوم لحد ما الطرق تبقى عادة.", "ابدأ التحدي"],
        ["habits", "الاستمرار والعادة", "إزاي تكمّل بكمية صغيرة كل يوم بدل حماس أسبوعين.", "اقرأ"],
      ] },
    { id: "memory", t: "الذاكرة وطرق الحفظ", d: "افهم الذاكرة، واتعلم الطرق، واتمرّن عليها",
      icon: '<path d="M12 4a4 4 0 0 0-4 4v.5A3.5 3.5 0 0 0 6 15a3.5 3.5 0 0 0 4 5h2V4Z"/><path d="M12 4a4 4 0 0 1 4 4v.5a3.5 3.5 0 0 1 2 6.5 3.5 3.5 0 0 1-4 5h-2"/>',
      pages: [
        ["basics", "إزاي الذاكرة بتشتغل", "الترميز والتخزين والاسترجاع، ومنحنى النسيان.", "اقرأ"],
        ["methods", "طرق الحفظ", "٢٠ طريقة، من الاسترجاع النشط لقصر الذاكرة، وإمتى تستخدم كل واحدة.", "اقرأ"],
        ["techniques", "تقنيات متقدمة", "قصر الذاكرة خطوة بخطوة، شكل الأرقام، صندوق لايتنر، فاينمان.", "اتعلمها"],
        ["types", "حسب نوع المادة", "قرآن وشعر، تعريفات، أرقام، قوائم، لغات.", "اقرأ"],
        ["drills", "تمارين الذاكرة", "تمرين الأرقام وتمرين الكلمات، بيسجلوا أحسن نتيجة ليك.", "اتمرّن"],
        ["brain", "صحة المخ", "النوم والحركة والتوتر والموبايل وتأثيرهم على الحفظ.", "اقرأ"],
      ] },
    { id: "other", t: "حفظ مواد تانية", d: "امتحانات، ولغات، وأسماء، وقوانين",
      icon: '<path d="M4 6h16M4 12h16M4 18h10"/>',
      pages: [
        ["exams", "المذاكرة للامتحان", "خطة من شهر قبل الامتحان لحد ورقة الإجابة.", "اقرأ"],
        ["languages", "حفظ اللغات", "الكلمة في جملة وصورة وصوت، مش في قائمة وترجمتها.", "اقرأ"],
        ["names", "حفظ الأسماء والوشوش", "إزاي تسمع الاسم صح من الأول وتربطه بالوش.", "اقرأ"],
        ["formulas", "القوانين والمعادلات", "افهم القانون جاي منين، واستخدمه لحد ما يتحفظ لوحده.", "اقرأ"],
      ] },
    { id: "refs", t: "مراجع", d: "أسئلة، وأخطاء شائعة، ومصطلحات، وكتب",
      icon: '<path d="M5 4h11l3 3v13H5z"/><path d="M9 10h6M9 14h6"/>',
      pages: [
        ["quiz", "اختبر فهمك", "١٣ سؤال اختيار من متعدد عن المرجع، بالشرح.", "ابدأ"],
        ["mistakes", "أخطاء شائعة", "حاجات بتحسسك إنك بتذاكر من غير ما تثبّت حاجة.", "اقرأ"],
        ["faq", "أسئلة متكررة", "أحفظ الصبح ولا بالليل؟ قد إيه في اليوم؟ موسيقى ولا لأ؟", "اقرأ"],
        ["glossary", "قاموس المصطلحات", "المصطلحات بالعربي والإنجليزي، ومصطلحات الحفاظ في الحلقات.", "اقرأ"],
        ["books", "الكتب", "١٠ كتب عن الذاكرة: ملخص كل كتاب وأفكاره وتطبقه إزاي.", "شوف الكتب"],
      ] },
  ];
  const ORDER = GROUPS.flatMap((g) => g.pages.map((p) => ({ r: p[0], t: p[1], g })));
  const byR = Object.fromEntries(ORDER.map((p, i) => [p.r, { ...p, i }]));
  const OLD_EYEBROWS = ["افهم", "اتمرّن", "أدلة خاصة", "اقرأ"];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;

  /* ---------- 1) side menu: rebuild the links as collapsible groups ---------- */
  const nav = document.getElementById("nav");
  const tools = nav && nav.querySelector(".nav-tools");
  if (!nav || !tools) return;
  while (tools.nextSibling) tools.nextSibling.remove();
  let html = '<a href="#home" data-r="home">البداية</a>';
  for (const g of GROUPS) {
    html += `<details class="rq-grp" data-g="${g.id}"><summary>${svg(g.icon)}<span>${g.t}</span><i>${g.pages.length}</i></summary>` +
      g.pages.map(([r, t, , , key]) => `<a href="#${r}" data-r="${r}"${key ? ' class="key"' : ""}>${esc(t)}</a>`).join("") + "</details>";
  }
  tools.insertAdjacentHTML("afterend", html);

  /* ---------- 2) follow the open page: open its group, top-bar group name, pager ---------- */
  function onRoute() {
    const cur = nav.querySelector("a[aria-current]");
    const r = cur ? cur.dataset.r : "home";
    const p = byR[r];
    if (p) { const d = nav.querySelector(`.rq-grp[data-g="${p.g.id}"]`); if (d && !d.open) d.open = true; }
    const crumb = document.getElementById("rq-crumb");
    if (crumb) { crumb.textContent = p ? p.g.t + " ›" : ""; crumb.hidden = !p; }
    document.querySelectorAll(".rq-pager").forEach((x) => x.remove());
    const view = document.querySelector(".view.on");
    if (!p || !view || view.dataset.view !== r) return;   // home + single book pages: no pager
    const prev = ORDER[p.i - 1], next = ORDER[p.i + 1];
    const link = (q, cls, lbl) => q ? `<a class="${cls}" href="#${q.r}"><small>${lbl}${q.g !== p.g ? " – " + q.g.t : ""}</small><b>${esc(q.t)}</b></a>` : "<span></span>";
    view.insertAdjacentHTML("beforeend", `<nav class="rq-pager" aria-label="التنقل بين الصفحات">${link(prev, "prev", "السابق")}${link(next, "next", "التالي")}</nav>`);
  }
  new MutationObserver(onRoute).observe(nav, { subtree: true, attributes: true, attributeFilter: ["aria-current"] });
  // accordion: one group open at a time keeps the menu short
  nav.addEventListener("toggle", (e) => {
    if (e.target.open) nav.querySelectorAll(".rq-grp[open]").forEach((d) => { if (d !== e.target) d.open = false; });
  }, true);

  /* ---------- 3) home map + eyebrows (after the rest of the page is parsed) ---------- */
  function map() {
    const box = document.getElementById("rq-map");
    if (!box) return;
    box.innerHTML = '<h2>أقسام المرجع</h2>' + GROUPS.map((g) =>
      `<section class="rq-sec"><h3 class="rq-sec-h">${svg(g.icon)}<span>${g.t}<small>${g.d}</small></span></h3><div class="grid">` +
      g.pages.map(([r, t, d, verb]) => `<a class="card" href="#${r}" style="text-decoration:none;color:inherit"><h3>${esc(t)}</h3><p class="muted">${esc(d)}</p><span class="go">${esc(verb)}</span></a>`).join("") +
      "</div></section>").join("");
  }
  function eyebrows() {
    for (const p of ORDER) {
      const eb = document.querySelector(`.view[data-view="${p.r}"] .eyebrow`);
      if (eb && OLD_EYEBROWS.includes(eb.textContent.trim())) eb.textContent = p.g.t;
    }
  }
  function ready() { map(); eyebrows(); onRoute(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready); else ready();
  window.RQ = { GROUPS, ORDER };
})();
