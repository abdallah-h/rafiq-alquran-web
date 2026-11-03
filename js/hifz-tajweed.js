/* ============================================================
   hifz-tajweed.js — the Hifz «أحكام التجويد» page split into one page per rule, each with many Quran examples and
   questions. Loaded before Hifz's own script; build-www.mjs puts a hook right before Hifz's "/* init *\/" that calls
   RQTJ.mount({QT, TJA, TJNAME, TJRULE, TJINFO, TB, ROUTES, esc, ar}) — the app's own data, so nothing is duplicated:
     - moves each rule's explanation (h2.bk-sec#tj-… up to the next h2.bk-sec) from the tajweed view into its own view
       «tjr-…» (ROUTES gets the new routes, so Hifz's router, menu and Back handle them like any page)
     - «أمثلة من القرآن»: found in the Quran text, Juz Amma first. Annotated rules come from Hifz's TJA (the data the
       coloured Mushaf uses); izhar / izhar shafawi / lam qamariyya are read from the Madani spelling (a noon or meem
       shows a sukun ONLY when it is pronounced clearly — verified on this text: نْ is never followed by an ikhfa
       letter or ب). EVERY example is checked letter by letter against its rule (VALID) and dropped if it doesn't fit.
     - «اختبر نفسك»: a «حدد الحكم» drill from the examples + the page's sections of Hifz's question bank (TB) inline,
       and a link to the full bank quiz (#tjq-<id>).
   Examples are built when a page is first opened (not at start-up).
============================================================ */
(function () {
  /* ---------- the pages ---------- */
  const PAGES = [
    { r: "tjr-makharij", id: "tj-makharij", t: "مخارج الحروف", lead: "كل حرف ليه مكان بيطلع منه: الجوف والحلق واللسان والشفتين والخيشوم.", bank: ["makharij"] },
    { r: "tjr-sifat", id: "tj-sifat", t: "صفات الحروف", lead: "الصفات اللي بتفرّق بين الحروف اللي مخرجها واحد.", bank: ["sifat"] },
    { r: "tjr-noon", id: "tj-noon", t: "النون الساكنة والتنوين", lead: "أربع أحكام: الإظهار والإدغام والإقلاب والإخفاء، حسب الحرف اللي بعدها.", bank: ["noon"],
      ex: ["izhar", "idghaam_ghunnah", "idghaam_no_ghunnah", "iqlab", "ikhfa"] },
    { r: "tjr-meem", id: "tj-meem", t: "الميم الساكنة والغنة", lead: "الإخفاء الشفوي والإدغام الشفوي والإظهار الشفوي، وغنة النون والميم المشددتين.", bank: ["meem"],
      ex: ["ikhfa_shafawi", "idghaam_shafawi", "izhar_shafawi", "ghunnah"] },
    { r: "tjr-lam", id: "tj-lam", t: "اللامات", lead: "لام التعريف الشمسية والقمرية، ولام الفعل والحرف، ولام لفظ الجلالة.", bank: ["lam"],
      ex: ["lam_shamsiyyah", "lam_qamariyyah"] },
    { r: "tjr-idgham", id: "tj-idgham", t: "الإدغام بين الحروف", lead: "لما حرفين يتقابلوا والأول ساكن: متماثلين ومتجانسين ومتقاربين.", bank: ["idgham"],
      ex: ["idghaam_mutajanisayn", "idghaam_mutaqaribayn"] },
    { r: "tjr-madd", id: "tj-madd", t: "المدود", lead: "المد الطبيعي والمدود الفرعية، ومقدار كل مد بالحركات.", bank: ["madd"],
      ex: ["madd_2", "madd_muttasil", "madd_munfasil", "madd_246", "madd_6"] },
    { r: "tjr-tafkhim", id: "tj-tafkhim", t: "التفخيم والترقيق", lead: "حروف الاستعلاء، وأحكام الراء والألف ولام لفظ الجلالة.", bank: ["tafkhim"] },
    { r: "tjr-qalqala", id: "tj-qalqala", t: "القلقلة", lead: "حروف «قطب جد» لما تكون ساكنة: صوتها بيهتز، وبتبقى أقوى عند الوقف.", bank: ["qalqala"],
      ex: ["qalqalah_sughra", "qalqalah_kubra"] },
    { r: "tjr-hamza", id: "tj-hamza", t: "همزة الوصل وهمزة القطع", lead: "همزة الوصل بتتنطق في البداية بس وبتسقط في الوصل، وهمزة القطع بتتنطق دايماً.", bank: ["hamza"],
      ex: ["hamzat_wasl"] },
    { r: "tjr-waqf", id: "tj-waqf", t: "الوقف والابتداء", lead: "تقف فين وتبدأ منين، وعلامات الوقف في مصحف المدينة.", bank: ["waqf"] },
    { r: "tjr-hafs", id: "tj-hafs", t: "رواية حفص وآداب التلاوة", lead: "السكتات والكلمات الخاصة برواية حفص، والاستعاذة والبسملة، واللحن.", bank: ["hafs", "intro"] },
    { r: "tjr-errors", id: "tj-errors", t: "أخطاء نطق منتشرة", lead: "حروف وحركات بنغلط فيها كتير في مصر، وإزاي تصححها.", bank: ["pron"] },
  ];

  /* ---------- letters ---------- */
  const ISMARK = (c) => /[ً-ٰٟۖ-ۭ]/.test(c || "");
  const ISPZ = (c) => /[ۖ-ۜ]/.test(c || "");          // pause (waqf) marks
  const SUKUN = "ْ", SHADDA = "ّ", TANWEEN = /[ً-ٍ]/;
  const THROAT = "ءأإآهعحغخ", IKHFA = "صذثكجشقسدطزفتضظ", YANMOU = "ينمو", LR = "لر", QALQ = "قطبجد";
  const HAMZA = "ءأإآؤئ";
  const MADD_LETTERS = /[اويىٰۥۦۧٓ]/;

  /* clusters: a base letter + its marks (a space + pause mark is one cluster too) */
  function clusters(t) {
    const cl = [];
    for (let i = 0; i < t.length;) {
      let j = i + 1;
      if (t[i] !== " ") while (j < t.length && ISMARK(t[j])) j++;
      else while (j < t.length && ISPZ(t[j])) j++;
      cl.push({ a: i, b: j, base: t[i], marks: t.slice(i + 1, j) });
      i = j;
    }
    return cl;
  }
  const isWordChar = (c) => c && c !== " " && !ISPZ(c);
  /* next pronounced letter after cluster index k: skips spaces, pause marks and silent letters (marked ۟ / ۠, e.g. the
     alif of «قَالُوٓا۟»); skipSeat also skips the alif/ى carrying tanween fath */
  const SILENT = (c) => c.marks && !c.marks.replace(/[۟۠]/g, "") && /[۟۠]/.test(c.marks);
  function nextLetter(cl, k, skipSeat) {
    for (let q = k + 1; q < cl.length; q++) {
      const c = cl[q];
      if (c.base === " " || ISPZ(c.base) || SILENT(c)) continue;
      if (skipSeat && (c.base === "ا" || c.base === "ى") && !c.marks.replace(/[۟۠]/g, "")) continue;
      return { q, c };
    }
    return null;
  }
  // hamza in any spelling: ء أ إ آ ؤ ئ, or a carrier/tatweel with hamza above/below (ـٔ ىٕ)
  const isHamza = (c) => HAMZA.includes(c.base) || /[ٕٔ]/.test(c.marks);
  const wordStart = (cl, k) => k === 0 || cl[k - 1].base === " ";
  const crossedSpace = (cl, k, q) => cl.slice(k + 1, q).some((c) => c.base === " ");
  const lastLetterOfAyah = (cl, k) => !cl.slice(k + 1).some((c) => isWordChar(c.base) && c.base !== "ا" && c.base !== "ى");
  const followedByPause = (cl, k) => { for (let q = k + 1; q < cl.length; q++) { if (cl[q].base === " ") { return ISPZ(cl[q].marks[0]) || ISPZ((cl[q + 1] || {}).base); } } return false; };

  /* ---------- rule definitions ---------- */
  // c = colour token (var(--tj-…)); cross = the trigger letter is in the next word (show both words)
  const RULES = {
    izhar: { n: "إظهار حلقي", d: "نون ساكنة أو تنوين قبل حرف من حروف الحلق الستة (ء هـ ع ح غ خ): النون بتتنطق واضحة من غير غنة زيادة.", c: "accent", cross: true, gen: true },
    idghaam_ghunnah: { c: "gh", cross: true },
    idghaam_no_ghunnah: { c: "sl", cross: true },
    iqlab: { c: "gh", cross: true },
    ikhfa: { c: "gh", cross: true },
    ikhfa_shafawi: { c: "gh", cross: true },
    idghaam_shafawi: { c: "gh", cross: true },
    izhar_shafawi: { n: "إظهار شفوي", d: "ميم ساكنة بعدها أي حرف غير الباء والميم: الميم بتتنطق واضحة من غير غنة، وخصوصاً قبل الواو والفاء.", c: "accent", cross: true, gen: true },
    ghunnah: { c: "gh" },
    lam_shamsiyyah: { c: "sl" },
    lam_qamariyyah: { n: "لام قمرية", d: "لام «ال» بتتنطق ساكنة واضحة قبل حروف «ابغ حجك وخف عقيمه».", c: "accent", gen: true },
    idghaam_mutajanisayn: { c: "sl", cross: true },
    idghaam_mutaqaribayn: { c: "sl", cross: true },
    madd_2: { c: "km" },
    madd_muttasil: { c: "wj" },
    madd_munfasil: { c: "wj", cross: true },
    madd_246: { c: "jz" },
    madd_6: { c: "lz" },
    qalqalah_sughra: { n: "قلقلة صغرى", d: "حرف من «قطب جد» ساكن في وسط الكلام: قلقلة خفيفة.", c: "ql", from: "qalqalah" },
    qalqalah_kubra: { n: "قلقلة كبرى", d: "حرف من «قطب جد» بتقف عليه (آخر الآية أو عند علامة وقف): قلقلة أقوى.", c: "ql", from: "qalqalah" },
    hamzat_wasl: { c: "sl" },
  };

  /* Letter-by-letter checks: an example is shown only if its text really is that rule. (cl, k = first cluster of the
     annotated range, k2 = last) → true/false */
  const VALID = {
    idghaam_ghunnah: (cl, k) => noonOrTanween(cl[k]) && trig(cl, k, YANMOU, true),
    idghaam_no_ghunnah: (cl, k) => noonOrTanween(cl[k]) && trig(cl, k, LR, true),
    iqlab: (cl, k) => noonOrTanween(cl[k]) && trig(cl, k, "ب", false),
    ikhfa: (cl, k) => noonOrTanween(cl[k]) && trig(cl, k, IKHFA, false),
    ikhfa_shafawi: (cl, k) => cl[k].base === "م" && trig(cl, k, "ب", true),
    idghaam_shafawi: (cl, k) => cl[k].base === "م" && trig(cl, k, "م", true),
    ghunnah: (cl, k) => "نم".includes(cl[k].base) && cl[k].marks.includes(SHADDA),
    lam_shamsiyyah: (cl, k) => cl[k].base === "ل" && cl[k + 1] && cl[k + 1].marks.includes(SHADDA),
    idghaam_mutajanisayn: (cl, k, k2) => { const n = nextLetter(cl, k2); return !!n && n.c.marks.includes(SHADDA); },
    idghaam_mutaqaribayn: (cl, k, k2) => { const n = nextLetter(cl, k2); return !!n && n.c.marks.includes(SHADDA); },
    madd_2: (cl, k, k2) => cl.slice(k, k2 + 1).some((c) => MADD_LETTERS.test(c.base + c.marks)),
    madd_muttasil: (cl, k, k2) => { // hamza after the madd letter, same word
      for (let q = k2 + 1; q < cl.length && isWordChar(cl[q].base); q++) if (isHamza(cl[q])) return true;
      return false;
    },
    madd_munfasil: (cl, k, k2) => { // madd ends a word, hamza starts the next — or the joined يَٰٓأَيُّهَا / هَٰٓأَنتُمْ (منفصل حكمي)
      const n = nextLetter(cl, k2);
      if (!n || !isHamza(n.c)) return false;
      return crossedSpace(cl, k2, n.q) || (wordStart(cl, k) && "يه".includes(cl[k].base) && cl[k].marks.includes("ٰ"));
    },
    madd_246: (cl, k, k2) => lastLetterOfAyah(cl, k2 + 1) || lastLetterOfAyah(cl, k2) || followedByPause(cl, k2),
    madd_6: (cl, k, k2, ctx) => {
      let n = nextLetter(cl, k2);
      // ءَآلذَّكَرَيْنِ / ءَآللَّهُ: the lam is assimilated into the doubled letter after it
      if (n && n.c.base === "ل" && !n.c.marks) n = nextLetter(cl, n.q);
      // muqatta'at letters open the surah (Ash-Shura: حمٓ ١ عٓسٓقٓ ٢)
      return (ctx.a === 1 || ctx.s === 42 && ctx.a === 2) && ctx.muqattaat || (!!n && !crossedSpace(cl, k2, n.q) && (n.c.marks.includes(SHADDA) || n.c.marks.includes(SUKUN)));
    },
    qalqalah: (cl, k) => QALQ.includes(cl[k].base),
    hamzat_wasl: (cl, k) => cl[k].base === "ٱ",
  };
  function noonOrTanween(c) { return c.base === "ن" || TANWEEN.test(c.marks); }
  // the letter after the noon/tanween/meem must be one of `set`; `sameWordOk=false` → still fine inside a word (ikhfa, iqlab)
  function trig(cl, k, set) {
    let kk = k;
    while (cl[kk + 1] && (ISMARK(cl[kk + 1].base))) kk++;
    const n = nextLetter(cl, kk, true);
    return !!n && set.includes(n.c.base);
  }

  /* ---------- finding examples ---------- */
  const MUQATTAAT = new Set([2, 3, 7, 10, 11, 12, 13, 14, 15, 19, 20, 26, 27, 28, 29, 30, 31, 32, 36, 38, 40, 41, 42, 43, 44, 45, 46, 50, 68]);
  // the user's memorization order: Juz Amma, Juz Tabarak, Al-Baqarah, then the rest of the Quran
  function ayahOrder(QT) {
    const out = [];
    const push = (s) => QT[s - 1][1].forEach((_, i) => out.push([s, i + 1]));
    for (let s = 78; s <= 114; s++) push(s);
    for (let s = 67; s <= 77; s++) push(s);
    push(2);
    for (let s = 1; s <= 66; s++) if (s !== 2) push(s);
    return out;
  }
  const MAX = 60;

  function findExamples(H, names) {
    const want = {}; names.forEach((n) => (want[n] = []));
    const seen = {}; names.forEach((n) => (seen[n] = new Set()));
    const annotated = names.filter((n) => !RULES[n].gen).map((n) => RULES[n].from || n);
    const idx = {}; H.TJNAME.forEach((n, i) => (idx[n] = i));
    const stats = { dropped: {} };
    const add = (name, s, a, t, cl, k, k2, trigQ) => {
      if (want[name].length >= MAX) return;
      const ex = snippet(H, s, a, t, cl, k, k2, trigQ, RULES[name].cross);
      if (ex.pause || seen[name].has(ex.text)) return;   // a waqf mark between the letter and its trigger reads confusingly
      seen[name].add(ex.text); want[name].push(ex);
    };
    const full = () => names.every((n) => want[n].length >= MAX);
    for (const [s, a] of ayahOrder(H.QT)) {
      if (full()) break;
      const t = H.QT[s - 1][1][a - 1], cl = clusters(t), ctx = { s, a, muqattaat: MUQATTAAT.has(s) };
      const at = (pos) => cl.findIndex((x) => x.a <= pos && pos < x.b);
      // 1) annotated rules (Hifz's TJA: [ruleIdx, startDelta, len]…)
      const ann = H.TJA[s - 1][a - 1];
      let st = 0;
      for (let q = 0; q < ann.length; q += 3) {
        st += ann[q + 1];
        const rn = H.TJNAME[ann[q]];
        if (!annotated.includes(rn)) continue;
        const k = at(st), k2 = at(st + ann[q + 2] - 1);
        if (k < 0 || k2 < 0) continue;
        if (!VALID[rn] || !VALID[rn](cl, k, k2, ctx)) { stats.dropped[rn] = (stats.dropped[rn] || 0) + 1; continue; }
        if (rn === "qalqalah") {
          // كبرى = the letter you stop on: last letter of its word, at the end of the ayah or before a pause mark
          const lastInWord = !cl[k + 1] || cl[k + 1].base === " ";
          const kubra = lastInWord && (lastLetterOfAyah(cl, k) || followedByPause(cl, k));
          const sughra = cl[k].marks.includes(SUKUN) && !kubra;
          const name = kubra ? "qalqalah_kubra" : sughra ? "qalqalah_sughra" : null;
          if (name && want[name]) add(name, s, a, t, cl, k, k2);
          else stats.dropped.qalqalah = (stats.dropped.qalqalah || 0) + 1;
          continue;
        }
        if (want[rn]) add(rn, s, a, t, cl, k, k2);
      }
      // 2) rules read from the Madani spelling
      cl.forEach((c, k) => {
        if (want.izhar && (c.base === "ن" && c.marks.includes(SUKUN) || TANWEEN.test(c.marks) && endOfWord(cl, k))) {
          const n = nextLetter(cl, k, true);
          if (n && THROAT.includes(n.c.base) && (c.base === "ن" || crossedSpace(cl, k, n.q))) add("izhar", s, a, t, cl, k, k, n.q);
        }
        if (want.izhar_shafawi && c.base === "م" && c.marks.includes(SUKUN)) {
          const n = nextLetter(cl, k);
          if (n && !"بم".includes(n.c.base)) add("izhar_shafawi", s, a, t, cl, k, k, n.q);
        }
        if (want.lam_qamariyyah && c.base === "ل" && c.marks.includes(SUKUN) && cl[k - 1] && cl[k - 1].base === "ٱ") {
          add("lam_qamariyyah", s, a, t, cl, k - 1, k, k + 1);
        }
      });
    }
    return { examples: want, stats };
  }
  function endOfWord(cl, k) { // tanween is on the last letter (or before the alif/ى seat)
    for (let q = k + 1; q < cl.length; q++) {
      if (cl[q].base === " " || ISPZ(cl[q].base)) return true;
      if ((cl[q].base === "ا" || cl[q].base === "ى") && !cl[q].marks.replace(/[۟۠]/g, "")) continue;
      return false;
    }
    return true;
  }

  /* the word(s) around the example, with the rule's letters marked (and the trigger letter, for cross-word rules) */
  function snippet(H, s, a, t, cl, k, k2, trigQ, cross) {
    let w0 = k; while (w0 > 0 && cl[w0 - 1].base !== " ") w0--;
    let w1 = k2; while (w1 + 1 < cl.length && cl[w1 + 1].base !== " ") w1++;
    // Cross-word rules: the rule letter is the noon / tanween / meem / madd letter at k (+ the alif seat or silent
    // letters glued to it) and the TRIGGER is the next pronounced letter. (The data's range for idgham also covers
    // the merged letter — «مِّن رَّبِّكَ» — so the trigger is found from k, not from the range's end.)
    let tq = trigQ, onEnd = k2;
    if (cross || tq != null) {
      onEnd = k;
      while (cl[onEnd + 1] && cl[onEnd + 1].base !== " " && (SILENT(cl[onEnd + 1]) || ("اى".includes(cl[onEnd + 1].base) && !cl[onEnd + 1].marks))) onEnd++;
      const n = tq != null ? { q: tq } : nextLetter(cl, onEnd, true);
      if (n) { tq = n.q; let e = n.q; while (e + 1 < cl.length && cl[e + 1].base !== " ") e++; if (e > w1) w1 = e; }
    }
    let html = "", text = "", pause = false;
    if (tq != null) for (let q = onEnd + 1; q < tq; q++) if (ISPZ(cl[q].base) || /[ۖ-ۜ]/.test(cl[q].marks)) pause = true;
    for (let q = w0; q <= w1; q++) {
      const piece = t.slice(cl[q].a, cl[q].b);
      text += piece;
      const cls = q >= k && q <= onEnd ? "rq-on" : q === tq ? "rq-trig" : "";
      html += cls ? `<span class="${cls}">${H.esc(piece)}</span>` : H.esc(piece);
    }
    const page = (H.QT[s - 1][2] || [])[a - 1];
    return { s, a, page, pause, text: text.trim(), html: html.trim().replace(/ (?=[ۖ-ۜ])/g, " ") };
  }

  /* ---------- page building ---------- */
  let H = null;
  const ruleName = (n) => RULES[n].n || (H.TJINFO[n] || [n])[0];
  const ruleDesc = (n) => RULES[n].d || (H.TJINFO[n] || ["", ""])[1];
  const colour = (n) => (RULES[n].c === "accent" ? "var(--accent)" : `var(--tj-${RULES[n].c})`);
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const ref = (ex) => `${H.QT[ex.s - 1][0]} ${H.ar(ex.a)}`;

  function mount(h) {
    H = h;
    const V = document.querySelector('[data-view="tajweed"]');
    if (!V) return;
    let anchor = V;
    for (const p of PAGES) {
      const h2 = document.getElementById(p.id);
      if (!h2 || !V.contains(h2)) continue;
      const sec = document.createElement("section");
      sec.className = "view";
      sec.dataset.view = p.r;
      const parts = p.ex ? `<button type="button" class="btn sm" data-rqjump="${p.r}-ex">أمثلة من القرآن</button>` : "";
      sec.innerHTML = `<p class="eyebrow">التجويد</p><h1>${p.t}</h1><p class="lead">${p.lead}</p>
        <div class="bk-toc"><button type="button" class="btn sm" data-rqjump="${p.id}">الشرح</button>${parts}<button type="button" class="btn sm" data-rqjump="${p.r}-q">اختبر نفسك</button></div>`;
      // move the explanation: h2#id … up to the next h2.bk-sec of the tajweed view
      const moved = [h2];
      for (let n = h2.nextElementSibling; n && !(n.tagName === "H2" && n.classList.contains("bk-sec")); n = n.nextElementSibling) moved.push(n);
      moved.forEach((n) => sec.appendChild(n));
      h2.classList.add("rq-first");
      if (p.ex) sec.insertAdjacentHTML("beforeend", `<h2 class="bk-sec" id="${p.r}-ex">أمثلة من القرآن</h2>
        <p class="muted">من نص المصحف، بالترتيب: جزء عمّ، ثم تبارك، ثم البقرة، ثم باقي القرآن. الجزء الملوّن هو الحكم${p.ex.some((n) => RULES[n].cross) ? "، والحرف المخطوط تحته هو اللي سبّبه" : ""}. دوس على أي مثال يفتحلك صفحته في المصحف.</p>
        <div class="rq-exbox" data-page="${p.r}"><p class="muted">بيتحضّر…</p></div>`);
      const bankN = p.bank.reduce((n, id) => n + ((H.TB.find((x) => x.id === id) || { qs: [] }).qs.length), 0);
      sec.insertAdjacentHTML("beforeend", `<h2 class="bk-sec" id="${p.r}-q">اختبر نفسك</h2>
        ${p.ex && p.ex.length > 1 ? `<div class="sheet rq-quiz" data-kind="ex" data-page="${p.r}"></div>` : ""}
        <div class="sheet rq-quiz" data-kind="bank" data-page="${p.r}"></div>
        <p style="margin-top:12px">${p.bank.map((id) => { const b = H.TB.find((x) => x.id === id); return b ? `<a class="btn" href="#tjq-${id}">${b.t}: اختبار بالوقت في بنك الأسئلة (${H.ar(b.qs.length)} سؤال)</a>` : ""; }).join(" ")}</p>`);
      sec.dataset.bankN = bankN;
      anchor.insertAdjacentElement("afterend", sec);
      anchor = sec;
      H.ROUTES.push(p.r);
      watch(sec, p);
    }
    // the entry page: a grid of the rule pages under its table of contents
    const toc = V.querySelector(".bk-toc");
    if (toc) toc.insertAdjacentHTML("afterend", `<h2 class="bk-sec" id="rq-pages">الأحكام بالتفصيل</h2>
      <p class="muted">كل حكم في صفحة لوحده: الشرح، وأمثلة كتير من القرآن، وأسئلة.</p>
      <div class="grid rq-pages">${PAGES.filter((p) => document.querySelector(`[data-view="${p.r}"]`)).map((p) =>
        `<a class="card" href="#${p.r}" style="text-decoration:none;color:inherit"><h3>${p.t}</h3><p class="muted">${p.lead}</p><span class="go">${p.ex ? "شرح وأمثلة وأسئلة" : "شرح وأسئلة"}</span></a>`).join("")}</div>`);
    // jumps to a moved section (TOC buttons, the Mushaf tooltip's «اقرا الحكم») → open its page instead
    const pageOf = {}; PAGES.forEach((p) => (pageOf[p.id] = p.r));
    document.addEventListener("click", (e) => {
      const j = e.target.closest("[data-jump],[data-jump-after]");
      if (j) {
        const id = j.dataset.jump || j.dataset.jumpAfter;
        if (pageOf[id] && document.querySelector(`[data-view="${pageOf[id]}"]`)) {
          e.preventDefault(); e.stopImmediatePropagation();
          location.hash = "#" + pageOf[id];
          return;
        }
      }
      const r = e.target.closest("[data-rqjump]");
      if (r) { e.preventDefault(); const t = document.getElementById(r.dataset.rqjump); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); }
    }, true);
  }

  /* build examples + quizzes the first time a page is shown */
  function watch(sec, p) {
    const build = () => {
      if (sec.dataset.built || !sec.classList.contains("on")) return;
      sec.dataset.built = "1";
      let ex = {};
      if (p.ex) { ex = findExamples(H, p.ex).examples; renderExamples(sec.querySelector(".rq-exbox"), p, ex); }
      const exQuiz = sec.querySelector('.rq-quiz[data-kind="ex"]');
      if (exQuiz) quiz(exQuiz, "حدد الحكم", "مثال من القرآن، والجزء المظلّل هو المطلوب: إيه حكمه؟", () => exQuestions(p, ex));
      quiz(sec.querySelector('.rq-quiz[data-kind="bank"]'), "أسئلة القسم", "أسئلة على الشرح، بالتصحيح والتعليل.", () => bankQuestions(p));
    };
    new MutationObserver(build).observe(sec, { attributes: true, attributeFilter: ["class"] });
    build();
  }

  function renderExamples(box, p, ex) {
    box.innerHTML = p.ex.map((n) => `<div class="rq-rule" data-rule="${n}" style="--c:${colour(n)}">
        <h3><span class="rq-sw"></span>${ruleName(n)} <span class="pill">${H.ar(ex[n].length)} مثال</span></h3>
        <p class="muted">${ruleDesc(n)}</p>
        <div class="rq-exs"></div>
        ${ex[n].length > 12 ? `<button type="button" class="btn sm rq-more">أمثلة تانية</button>` : ""}
      </div>`).join("");
    box.querySelectorAll(".rq-rule").forEach((div) => {
      const n = div.dataset.rule, list = ex[n];
      let shown = 0;
      const more = () => {
        const next = list.slice(shown, shown + 12);
        div.querySelector(".rq-exs").insertAdjacentHTML("beforeend", next.map((e) =>
          `<a class="rq-ex" href="#mushaf-${e.page}" title="افتح الصفحة ${H.ar(e.page)} في المصحف"><span class="q-txt">${e.html}</span><small>${ref(e)}</small></a>`).join(""));
        shown += next.length;
        const b = div.querySelector(".rq-more");
        if (b && shown >= list.length) b.remove();
      };
      more();
      const b = div.querySelector(".rq-more");
      if (b) b.addEventListener("click", more);
    });
  }

  /* ---------- questions ---------- */
  function exQuestions(p, ex) {
    const pool = [];
    p.ex.forEach((n) => ex[n].forEach((e) => pool.push({ n, e })));
    return shuffle(pool).slice(0, 10).map(({ n, e }) => {
      const others = shuffle(p.ex.filter((x) => x !== n)).slice(0, 3);
      return { q: "إيه حكم الجزء المظلّل؟", html: `<span class="q-txt rq-quizq">${e.html}</span><small class="muted">${ref(e)}</small>`,
        a: ruleName(n), w: others.map(ruleName), e: ruleDesc(n) };
    });
  }
  function bankQuestions(p) {
    const qs = [];
    p.bank.forEach((id) => { const b = H.TB.find((x) => x.id === id); if (b) qs.push(...b.qs); });
    return shuffle(qs).slice(0, 10);
  }

  /* one-question-at-a-time quiz: items [{q, html?, a, w:[wrong…], e}] */
  function quiz(box, title, sub, make) {
    if (!box) return;
    let items = [], i = 0, right = 0;
    const start = () => { items = make(); i = 0; right = 0; draw(); };
    const draw = () => {
      if (!items.length) { box.innerHTML = `<h3>${title}</h3><p class="muted">مفيش أسئلة هنا.</p>`; return; }
      if (i >= items.length) {
        const pct = Math.round((right / items.length) * 100);
        box.innerHTML = `<h3>${title}</h3><p class="rq-score">${H.ar(right)} من ${H.ar(items.length)} <span class="muted">(${H.ar(pct)}٪)</span></p>
          <p class="muted">${pct >= 90 ? "ممتاز، الحكم ده ثابت عندك." : pct >= 70 ? "كويس. راجع اللي غلطت فيه وجرّب تاني." : "ارجع للشرح والأمثلة فوق، وبعدين جرّب جولة تانية."}</p>
          <button type="button" class="btn pri rq-again">جولة تانية</button>`;
        box.querySelector(".rq-again").addEventListener("click", start);
        return;
      }
      const it = items[i], opts = shuffle([it.a, ...it.w]);
      box.innerHTML = `<div class="rq-qhead"><h3>${title}</h3><span class="muted">سؤال ${H.ar(i + 1)} من ${H.ar(items.length)}</span></div>
        <p class="muted" style="margin-top:0">${i === 0 ? sub : ""}</p>
        <p class="rq-q"><b>${H.esc(it.q)}</b></p>${it.html ? `<div class="rq-qex">${it.html}</div>` : ""}
        <div class="rq-opts">${opts.map((o) => `<button type="button" class="btn rq-opt">${H.esc(o)}</button>`).join("")}</div>
        <div class="rq-fb" hidden></div>`;
      box.querySelectorAll(".rq-opt").forEach((b) => b.addEventListener("click", () => {
        const ok = b.textContent === it.a;
        if (ok) right++;
        box.querySelectorAll(".rq-opt").forEach((x) => { x.disabled = true; if (x.textContent === it.a) x.classList.add("ok"); else if (x === b) x.classList.add("bad"); });
        const fb = box.querySelector(".rq-fb");
        fb.hidden = false;
        fb.innerHTML = `<p><b>${ok ? "صح ✓" : "الإجابة: " + H.esc(it.a)}</b>${it.e ? " — " + H.esc(it.e) : ""}</p><button type="button" class="btn pri rq-next">${i + 1 < items.length ? "اللي بعده" : "النتيجة"}</button>`;
        fb.querySelector(".rq-next").addEventListener("click", () => { i++; draw(); });
      }));
    };
    start();
  }

  window.RQTJ = { mount, PAGES, RULES, VALID, findExamples, clusters };
})();
