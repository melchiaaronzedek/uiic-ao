/* ══════════════════════════════════════════════════════════════════
   UIIC AO Compass: UIIC Administrative Officer (Scale I) Generalist 2026.
   Vanilla SPA, no build step. The study data is one sealed file (p/data.bin,
   AES-GCM, gzip inside); its key arrives once in the private link (#key=…)
   and stays in this browser. Progress lives in this browser only.
   Look and engine forked from CGL Compass.
   ══════════════════════════════════════════════════════════════════ */
(function () {
"use strict";

var EXAM = new Date(2026, 9, 22, 8, 0, 0);       // Prelims, Thursday 22 October 2026, reporting 8:00 am
var MAINS = new Date(2026, 10, 30, 9, 0, 0);     // Mains, 30 November 2026 (tentative)
var VER = "c39b00ff00";
var BRAND = "UIIC AO Compass";

/* ── helpers ── */
function h(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function el(s, r) { return (r || document).querySelector(s); }
function els(s, r) { return [].slice.call((r || document).querySelectorAll(s)); }
function pc(a, b) { return b ? Math.round(a / b * 100) : 0; }
function arr() { return '<i>&#8250;</i>'; }
function reduceMotion() { return matchMedia("(prefers-reduced-motion: reduce)").matches; }
function dayOnly(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function daysTo(d) { var n = Math.round((dayOnly(d) - dayOnly(new Date())) / 864e5); return n > 0 ? n : 0; }
function ymd(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

/* ── state, this browser only ── */
var SKEYS = ["prac", "log", "att", "learn", "plan", "seen"];
function fresh() { var o = {}; SKEYS.forEach(function (k) { o[k] = {}; }); return o; }
var ST = (function () { try { var s = JSON.parse(localStorage.getItem("uc-state") || "null"); if (s) { SKEYS.forEach(function (k) { s[k] = s[k] || {}; }); return s; } } catch (e) {} return fresh(); })();
var saveT = null;
function save() { clearTimeout(saveT); saveT = setTimeout(function () { lsSet("uc-state", JSON.stringify(ST)); }, 120); }
window.addEventListener("pagehide", function () { lsSet("uc-state", JSON.stringify(ST)); });

/* ── data ── */
var D = null, QIDX = null, PIDX = null;
function b64u(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
function takeKey() {
  var m = /[#&?]key=([A-Za-z0-9_-]{40,})/.exec(location.hash);
  if (m) { lsSet("uc-key", m[1]); history.replaceState(null, "", location.pathname + location.search + "#/"); }
  return lsGet("uc-key", "");
}
function loadData() {
  var k = takeKey();
  if (!k) return Promise.reject(new Error("nokey"));
  var key;
  return crypto.subtle.importKey("raw", b64u(k), "AES-GCM", false, ["decrypt"]).then(function (x) { key = x; return fetch("p/data.bin?v=" + VER); })
    .then(function (r) { if (!r.ok) throw new Error("The study data did not download (" + r.status + ")."); return r.arrayBuffer(); })
    .then(function (buf) { return crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(0, 12) }, key, buf.slice(12)).catch(function () { throw new Error("badkey"); }); })
    .then(function (pt) { return new Response(new Blob([pt]).stream().pipeThrough(new DecompressionStream("gzip"))).json(); })
    .then(function (j) { D = j; QIDX = null; PIDX = null; });
}
function qById(id) { if (!QIDX) { QIDX = {}; D.qs.forEach(function (q) { QIDX[q.id] = q; }); } return QIDX[id]; }
function paper(id) { return D.papers.filter(function (p) { return p.id === id; })[0]; }
function paperQs(p) { return p.qids.map(qById).filter(Boolean); }
function paperOf(q) {
  if (!PIDX) { PIDX = {}; D.papers.forEach(function (p) { p.qids.forEach(function (id) { PIDX[id] = p; }); }); }
  return PIDX[q.id];
}

/* ── sections and marks ── */
function SECS() { return D.secs; }
function secOf(k) { return D.secs.filter(function (s) { return s.k === k; })[0] || { k: k, name: k, short: k, tone: "q", topics: [] }; }
function secsOf(pp) { return D.secs.filter(function (s) { return pp === "pre" ? !!s.pre : pp === "mainsonly" ? !s.pre : !!(s.mains || s.desc); }); }
/* Prelims: 1 mark a question. Mains: section marks over questions (English 1.25, Reasoning and Quant 1.2, GA 1.5, Computer 1). A quarter off for a wrong answer. */
function plusOf(q, kind) { var s = secOf(q.s); return kind === "MAINS" && s.mains ? s.mains[1] / s.mains[0] : 1; }
function minusOf(q, kind) { return plusOf(q, kind) / 4; }
function fmtM(x) { return (Math.round(x * 100) / 100).toString(); }

/* ── answers and stats ── */
function logAnswer(q, v) {
  if (v == null) return;
  var e = ST.log[q.id] || { n: 0, w: 0, ok: 0 };
  e.n++; if (v !== q.a) { e.w++; e.ok = 0; } else if (e.w) e.ok++;
  e.t = Date.now(); ST.log[q.id] = e;
}
function errList() {
  var out = [];
  Object.keys(ST.log).forEach(function (id) { var e = ST.log[id], q = qById(id); if (q && e.w && e.ok < 2) out.push({ q: q, e: e }); });
  return out.sort(function (a, b) { return b.e.t - a.e.t; });
}
function topicQs(sk, t) { return D.qs.filter(function (q) { return q.s === sk && q.t === t; }); }
function secQs(sk) { return D.qs.filter(function (q) { return q.s === sk; }); }
function statOf(qs) {
  var done = 0, right = 0;
  qs.forEach(function (q) { var v = ST.prac[q.id]; if (v != null) { done++; if (v === q.a) right++; } });
  return { n: qs.length, done: done, right: right, acc: done ? Math.round(right / done * 100) : null };
}
function totals() { return statOf(D.qs); }
function tkey(sk, t) { return sk + "|" + t; }
function learned(sk, t) { return !!ST.learn[tkey(sk, t)]; }
function nTopics() { return D.secs.reduce(function (a, s) { return a + s.topics.length; }, 0); }
function nLearned() { var n = 0; D.secs.forEach(function (s) { s.topics.forEach(function (t) { if (learned(s.k, t.n)) n++; }); }); return n; }
function learnHref(sk, t) { return "#/learn/" + sk + "/" + encodeURIComponent(t); }
function pracHref(sk, t) { return "#/practice/" + sk + (t ? "/" + encodeURIComponent(t) : ""); }
function score(qs, ans, kind) {
  var s = { right: 0, wrong: 0, done: 0, total: qs.length, marks: 0, max: 0, bySec: {} };
  qs.forEach(function (q) {
    var b = s.bySec[q.s] = s.bySec[q.s] || { right: 0, wrong: 0, done: 0, total: 0, marks: 0, max: 0 };
    var v = ans[q.id], p = plusOf(q, kind), m = minusOf(q, kind);
    b.total++; s.max += p; b.max += p;
    if (v == null) return;
    s.done++; b.done++;
    if (v === q.a) { s.right++; b.right++; s.marks += p; b.marks += p; } else { s.wrong++; b.wrong++; s.marks -= m; b.marks -= m; }
  });
  return s;
}
function att(pid) { return ST.att[pid] || null; }
function paperScore(pid) { var p = paper(pid), a = att(pid); return p && a ? score(paperQs(p), a.ans || {}, p.kind) : null; }
function mockHistory() {
  return D.papers.map(function (p) { var a = att(p.id); return a && a.done ? { p: p, a: a, s: paperScore(p.id) } : null; })
    .filter(Boolean).sort(function (x, y) { return x.a.ts - y.a.ts; });
}

/* ── rings ── */
function rings(items, size) {
  var R = [86, 63.5, 41], W = 17;
  var body = items.slice(0, 3).map(function (it, i) {
    var r = R[i], c = (2 * Math.PI * r).toFixed(2), p = Math.max(0, Math.min(1, it.p));
    return '<circle class="trk r' + (i + 1) + '" cx="100" cy="100" r="' + r + '"/>' +
      '<circle class="arc r' + (i + 1) + '" cx="100" cy="100" r="' + r + '" style="--c:' + c + ';--p:' + p.toFixed(4) + '"/>';
  }).join("");
  return '<svg class="rings" viewBox="0 0 200 200" width="' + (size || 200) + '" height="' + (size || 200) + '" role="img" aria-label="' + h(items.map(function (i) { return i.k + " " + i.v; }).join(", ")) + '">' +
    '<g transform="rotate(-90 100 100)" stroke-width="' + W + '" fill="none" stroke-linecap="round">' + body + '</g></svg>';
}
function ringLegend(items) {
  return '<ul class="legend">' + items.slice(0, 3).map(function (it, i) {
    return '<li class="r' + (i + 1) + '"><i></i><span class="k">' + h(it.k) + '</span><b data-count="' + it.n + '"' + (it.suffix ? ' data-suffix="' + h(it.suffix) + '"' : '') + '>' + h(it.v) + '</b></li>';
  }).join("") + '</ul>';
}
function miniRing(p, size, cls) {
  var r = 42, c = (2 * Math.PI * r).toFixed(1);
  return '<svg class="mring ' + (cls || '') + '" viewBox="0 0 100 100" width="' + size + '" height="' + size + '" aria-hidden="true">' +
    '<circle cx="50" cy="50" r="' + r + '" class="mr-t"/><circle cx="50" cy="50" r="' + r + '" class="mr-a" style="stroke-dasharray:' + c + ';stroke-dashoffset:' + (c * (1 - Math.max(0, Math.min(1, p)))).toFixed(1) + '"/></svg>';
}
function countUp(scope) {
  els("[data-count]", scope || document).forEach(function (x) {
    var to = parseFloat(x.dataset.count);
    if (!isFinite(to) || to <= 0 || reduceMotion()) return;
    var suffix = x.dataset.suffix || "", t0 = 0, dur = 900;
    function step(t) { if (!t0) t0 = t; var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 4); x.textContent = Math.round(to * e) + suffix; if (k < 1) requestAnimationFrame(step); }
    x.textContent = "0" + suffix; requestAnimationFrame(step);
  });
}

/* ── question text ── */
function stemHTML(q) { return '<p>' + h(q.q).replace(/\n/g, "<br>") + '</p>'; }
function optHTML(o) { return h(o); }
function srcLabel(q) { return q.src || ""; }
function srcChip(q) {
  if (q.kind === "pyq") return ' <span class="pyq' + (/UIIC/.test(q.src || "") ? ' y26' : '') + '" title="Asked in an insurance AO exam (memory-based)">' + h(q.src) + '</span>';
  return '';
}

/* ── quiz engine (practice) ── */
function quiz(cfg) {
  var i = cfg.startAt ? cfg.startAt() : 0;
  var host = document.createElement("div");
  host.className = "quiz";
  function draw(refocus) {
    var q = cfg.qs[i], picked = cfg.get(i), shown = (picked != null || cfg.locked) && !cfg.hide;
    var brief = q.dir ? '<div class="brief"><span class="t">Directions</span><p>' + h(q.dir).replace(/\n/g, "<br>") + '</p></div>' : '';
    var sm = { r: 0, w: 0, d: 0 };
    if (!cfg.hide) cfg.qs.forEach(function (x, k) { var v = cfg.get(k); if (v != null) { sm.d++; if (v === x.a) sm.r++; else sm.w++; } });
    host.classList.toggle("pq", !cfg.hide);
    host.innerHTML =
      '<a class="kicker" href="' + cfg.back + '">&#8592; ' + h(cfg.backLabel) + '</a>' + (cfg.head || '') +
      (!cfg.hide ? '<div class="pq-prog" aria-hidden="true"><i class="r" style="--w:' + (sm.r / cfg.qs.length) + '"></i><i class="w" style="--w:' + (sm.w / cfg.qs.length) + '"></i></div>' +
        '<div class="pq-sum"><span><b>' + sm.d + '</b> of ' + cfg.qs.length + ' done</span><span class="ok"><b>' + sm.r + '</b> right</span><span class="no"><b>' + sm.w + '</b> wrong</span>' +
        (sm.d ? '<span><b>' + Math.round(sm.r / sm.d * 100) + '%</b> accuracy</span>' : '') + '<span class="pq-keys"><kbd>1</kbd>–<kbd>5</kbd> answer · <kbd>→</kbd> next · <kbd>N</kbd> next unanswered</span></div>' : '') +
      '<div class="qbar" style="margin-top:16px"><span class="c">Question ' + (i + 1) + ' of ' + cfg.qs.length +
        (!cfg.hide && q.t ? ' · ' + h(q.t) : '') + (!cfg.hide ? srcChip(q) : '') + '</span></div>' +
      brief + '<div class="qstem">' + stemHTML(q) + '</div>' +
      '<div class="opts">' + q.o.map(function (o, k) {
        var c = "opt";
        if (shown) { if (k === q.a) c += " ok"; else if (k === picked) c += " no"; }
        else if (picked === k) c += " picked";
        return '<button class="' + c + '" data-p="' + k + '"' + (shown || cfg.locked ? " disabled" : "") + '><em>' + "ABCDE"[k] + '</em><span>' + optHTML(o) + '</span>' +
          (shown && k === q.a ? '<b class="mk ok" aria-label="Correct">✓</b>' : shown && k === picked ? '<b class="mk no" aria-label="Your answer">✕</b>' : '') + '</button>';
      }).join("") + '</div>' +
      (shown ? '<div class="why ' + (picked === q.a ? "ok" : "no") + '"><span class="t">' + (picked === q.a ? "Correct" : (picked == null ? "Not attempted. Answer is " : "Answer is ") + "ABCDE"[q.a]) + '</span><p>' +
        (q.e ? h(q.e).replace(/\n/g, "<br>") : optHTML(q.o[q.a])) + '</p>' + (q.t && q.s && D.notes[tkey(q.s, q.t)] ? '<a class="why-n" href="' + learnHref(q.s, q.t) + '">Notes: ' + h(q.t) + arr() + '</a>' : '') + '</div>' : '') +
      '<div class="qnav"><button class="btn quiet sm" data-n="-1"' + (i === 0 ? " disabled" : "") + '>&#8592; Prev</button>' +
        '<button class="btn sm" data-n="1"' + (i === cfg.qs.length - 1 ? " disabled" : "") + '>Next' + arr() + '</button><span style="flex:1"></span>' +
        '<button class="btn quiet sm" data-fin="1">' + (cfg.finLabel || 'Finish') + arr() + '</button></div>';
    els("[data-p]", host).forEach(function (b) { b.addEventListener("click", function () { cfg.set(i, +b.dataset.p); draw(b.dataset.p); }); });
    els("[data-n]", host).forEach(function (b) { b.addEventListener("click", function () { go(i + +b.dataset.n); }); });
    el("[data-fin]", host).addEventListener("click", function () { cfg.done(false); });
    drawPads();
    if (refocus != null) { var onward = el('[data-n="1"]:not([disabled])', host) || el('[data-fin]', host); if (onward) onward.focus({ preventScroll: true }); }
  }
  function go(k) { if (k < 0 || k >= cfg.qs.length) return; i = k; if (cfg.onMove) cfg.onMove(k); draw(); window.scrollTo({ top: 0, behavior: reduceMotion() ? "auto" : "smooth" }); }
  function drawPads() {
    var a = el("#pads"); if (!a) return;
    a.innerHTML = cfg.qs.map(function (q, k) {
      var v = cfg.get(k), c = "pad";
      if (v != null) c += cfg.hide ? " picked" : (v === q.a ? " ok" : " no");
      if (k === i) c += " here";
      return '<button class="' + c + '" data-j="' + k + '">' + (k + 1) + '</button>';
    }).join("");
    els("[data-j]", a).forEach(function (b) { b.addEventListener("click", function () { go(+b.dataset.j); }); });
    els("[data-jump]").forEach(function (b) { if (b.__w) return; b.__w = 1; b.addEventListener("click", function () {
      if (b.dataset.jump === "open") { var j = nextOpen(); if (j >= 0) go(j); return; }
      for (var k = 1; k <= cfg.qs.length; k++) { var x = (i + k) % cfg.qs.length, v = cfg.get(x); if (v != null && v !== cfg.qs[x].a) return go(x); }
    }); });
  }
  function nextOpen() { for (var k = 1; k <= cfg.qs.length; k++) { var j = (i + k) % cfg.qs.length; if (cfg.get(j) == null) return j; } return -1; }
  if (!cfg.hide) document.addEventListener("keydown", function qk(e) {
    if (!document.body.contains(host)) return document.removeEventListener("keydown", qk);
    if (e.metaKey || e.ctrlKey || e.altKey || /input|textarea|select/i.test(e.target.tagName || "")) return;
    var q = cfg.qs[i], k = e.key, pick = /^[1-5]$/.test(k) ? +k - 1 : -1;
    if (pick >= 0 && pick < q.o.length && cfg.get(i) == null && !cfg.locked) { cfg.set(i, pick); draw(pick); e.preventDefault(); }
    else if (k === "ArrowRight" || (k === "Enter" && cfg.get(i) != null && e.target.tagName !== "BUTTON")) { e.preventDefault(); go(i + 1); }
    else if (k === "ArrowLeft") { e.preventDefault(); go(i - 1); }
    else if (k === "n" || k === "N") { var j = nextOpen(); if (j >= 0) go(j); }
  });
  host.__pads = function () {
    if (cfg.hide) return '<h4>Questions</h4><div class="pads" id="pads"></div>';
    var side = '<div class="pq-side"><button class="btn quiet sm" data-jump="open">Next unanswered</button><button class="btn quiet sm" data-jump="wrong">Review a wrong one</button></div>' +
      '<p class="pq-legend"><i class="ok"></i>Right <i class="no"></i>Wrong <i></i>Not tried</p>';
    if (innerWidth <= 900) return side + '<details class="pads-fold"><summary><h4>All ' + cfg.qs.length + ' questions</h4></summary><div class="pads" id="pads"></div></details>';
    return '<h4>Questions</h4><div class="pads" id="pads"></div>' + side;
  };
  host.__drawPads = drawPads;
  draw();
  return host;
}

/* ══════════ the exam hall ══════════
   The UIIC screen: separately timed sections (the clock and tabs come from the
   caller), a palette with the five
   exam states, and answers that count only after Save & Next. */
var EXFS = +lsGet("uc-exfs", 1);
function examHall(cfg) {
  var qs = cfg.qs, n = qs.length, i = Math.min(cfg.startAt ? cfg.startAt() : 0, n - 1), pend = null, timer = null, shownAt = Date.now();
  var host = document.createElement("div");
  host.className = "exam";
  document.body.classList.add("examining");
  var ST_ = { a: "Answered", na: "Not answered", nv: "Not visited", m: "Marked for review", am: "Answered and marked (will be evaluated)" };
  function state(k) { var v = cfg.get(k), m = cfg.getMark(k), vis = cfg.visited(k) || k === i; if (v != null && m) return "am"; if (v != null) return "a"; if (m) return "m"; return vis ? "na" : "nv"; }
  function counts() { var c = { a: 0, na: 0, nv: 0, m: 0, am: 0 }; for (var k = 0; k < n; k++) c[state(k)]++; return c; }
  function fmt(s) { s = Math.max(0, s); var m = Math.floor(s / 60), x = s % 60; return (m < 10 ? "0" : "") + m + ":" + (x < 10 ? "0" : "") + x; }
  function spent() { return Math.round(((cfg.timeOn(i) || 0) + (Date.now() - shownAt)) / 1000); }
  function keep() { cfg.addTime(i, Date.now() - shownAt); shownAt = Date.now(); }
  var secStart = {}; qs.forEach(function (q, k) { if (secStart[q.s] == null) secStart[q.s] = k; });
  var secList = Object.keys(secStart).sort(function (a, b) { return secStart[a] - secStart[b]; });
  function paint() {
    var q = qs[i], c = counts(), saved = cfg.get(i);
    if (pend === undefined) pend = saved;
    var dirty = pend !== saved;
    host.style.setProperty("--exfs", EXFS);
    host.innerHTML =
      '<div class="ex-top"><div class="ex-id"><b>' + h(cfg.title) + '</b><span>' + h(cfg.sub) + '</span></div>' +
        '<div class="ex-secs" role="tablist" aria-label="Sections">' + (cfg.secTabs ? cfg.secTabs.map(function (x) { return '<span class="' + x.st + '">' + (x.st === "gone" ? '&#128274; ' : '') + h(x.short) + '</span>'; }).join("") : secList.length > 1 ? secList.map(function (s) {
          return '<span class="' + (s === q.s ? "on" : "next") + '" data-sec="' + s + '" role="tab" tabindex="0">' + h(secOf(s).short) + '</span>'; }).join("") : '') + '</div>' +
        '<div class="ex-tools"><div class="ex-clock" id="exclk" role="timer" aria-live="off"><small>Time left</small><b>--:--</b></div>' +
          '<button class="ex-ib" data-x="fs-" aria-label="Smaller text">A−</button><button class="ex-ib" data-x="fs+" aria-label="Larger text">A+</button>' +
          '<button class="ex-ib" data-x="full" aria-label="Full screen">' + (document.fullscreenElement ? '⤡' : '⤢') + '</button>' +
          '<button class="ex-ib" data-x="help" aria-label="Instructions">?</button>' +
          '<button class="ex-ib ex-pal-b" data-x="pal" aria-label="Question palette">' + (c.a + c.am) + '/' + n + '</button></div></div>' +
      '<div class="ex-body"><div class="ex-main">' +
          '<div class="ex-qh"><b>Question ' + (i + 1) + '</b><span class="ex-mk">Marks <em class="p">+' + fmtM(plusOf(q, cfg.kind)) + '</em> <em class="m">−' + fmtM(minusOf(q, cfg.kind)) + '</em></span>' +
            '<span class="ex-tq">Time on this question <b id="extq">' + fmt(spent()) + '</b></span></div>' +
          '<div class="ex-q">' + (q.dir ? '<div class="brief"><span class="t">Directions</span><p>' + h(q.dir).replace(/\n/g, "<br>") + '</p></div>' : '') +
            '<div class="qstem">' + stemHTML(q) + '</div>' +
            '<div class="ex-opts" role="radiogroup" aria-label="Options">' + q.o.map(function (o, k) {
              return '<label class="ex-opt' + (pend === k ? ' on' : '') + '"><input type="radio" name="exo" value="' + k + '"' + (pend === k ? ' checked' : '') + '><i>' + "ABCDE"[k] + '</i><span>' + optHTML(o) + '</span></label>'; }).join("") + '</div>' +
            (dirty ? '<p class="ex-warn">' + (pend == null ? 'Response cleared but not saved.' : 'Not saved yet.') + ' Press <b>Save &amp; Next</b> to keep it.</p>' : '') + '</div>' +
          '<div class="ex-act"><button class="ex-b mark" data-x="mark">Mark for Review &amp; Next</button><button class="ex-b" data-x="clear">Clear Response</button><span class="ex-sp"></span>' +
            '<button class="ex-b" data-x="prev"' + (i ? '' : ' disabled') + '>Previous</button><button class="ex-b save" data-x="save">Save &amp; Next</button></div></div>' +
        '<div class="ex-side" id="exside"><div class="ex-who"><span>C</span><div><b>Candidate</b><small>' + h(secOf(q.s).name) + '</small></div></div>' +
          '<ul class="ex-leg">' + ["a", "na", "nv", "m", "am"].map(function (s) { return '<li><i class="st ' + s + '">' + c[s] + '</i>' + ST_[s] + '</li>'; }).join("") + '</ul>' +
          '<div class="ex-grid">' + qs.map(function (x, k) { return x.s === q.s ? '<button class="st ' + state(k) + (k === i ? ' here' : '') + '" data-j="' + k + '" aria-label="Question ' + (k + 1) + ', ' + ST_[state(k)] + '">' + (k + 1) + '</button>' : ''; }).join("") + '</div>' +
          '<button class="ex-b save ex-sub" data-x="submit">' + h(cfg.finLabel || 'Submit paper') + '</button><a class="ex-exit" href="' + cfg.exit + '">Leave for now · the clock keeps running</a></div></div>';
    tick();
  }
  function go(k, save) { if (k < 0 || k >= n) return; keep(); if (save) cfg.set(i, pend); cfg.markVisited(i); i = k; pend = undefined; cfg.onMove(i); cfg.markVisited(i); paint(); var m = el(".ex-main", host); if (m) m.scrollTop = 0; }
  function saveNext() { cfg.set(i, pend); keep(); if (i < n - 1) go(i + 1); else { pend = undefined; paint(); summary(); } }
  function markNext() { cfg.set(i, pend); cfg.setMark(i, true); keep(); if (i < n - 1) go(i + 1); else { pend = undefined; paint(); } }
  function modal(html, wire) { var m = document.createElement("div"); m.className = "ex-modal"; m.innerHTML = '<div class="ex-mb" role="dialog" aria-modal="true">' + html + '</div>'; host.appendChild(m); wire(m, function () { m.remove(); }); var f = el("button", m); if (f) f.focus(); }
  function summary(timedOut) {
    var c = counts();
    if (timedOut) { finish(true); return; }
    var rows = [["Total questions", n], ["Answered", c.a], ["Not answered", c.na], ["Marked for review", c.m], ["Answered and marked", c.am], ["Not visited", c.nv]];
    modal('<h3>' + h(cfg.finLabel || 'Submit the paper') + '?</h3><p>' + h(cfg.lockNote || 'This ends the paper and scores it, with a quarter of the marks taken off for each wrong answer.') + '</p><table class="ex-sum"><tbody>' +
      rows.map(function (r) { return '<tr><th>' + r[0] + '</th><td>' + r[1] + '</td></tr>'; }).join("") + '</tbody></table>' +
      '<div class="ex-mact"><button class="ex-b" data-m="no">No, go back</button><button class="ex-b save" data-m="yes">Yes, submit</button></div>', function (m, close) {
      el('[data-m="no"]', m).addEventListener("click", close);
      el('[data-m="yes"]', m).addEventListener("click", function () { close(); finish(false); });
    });
  }
  function finish(timedOut) { keep(); clearInterval(timer); document.removeEventListener("keydown", onKey); cfg.submit(timedOut); }
  function help() {
    modal('<h3>Instructions</h3><ul class="ex-help"><li>Pick an option, then press <b>Save &amp; Next</b>. A pick you do not save is not counted, as in the exam.</li>' +
      '<li><b>Mark for Review &amp; Next</b> saves your pick and flags the question. Answered and marked questions are evaluated.</li>' +
      '<li>' + (cfg.secTabs ? 'Each section has its own clock. When you submit a section or its time runs out, it locks and the next one starts.' : 'One clock for the paper. Move between sections with the tabs at the top.') + '</li>' +
      '<li>Wrong answers lose a quarter of the question\'s marks; blanks lose nothing.</li></ul>' +
      '<h4>Keyboard</h4><table class="ex-keys"><tbody>' + [["1 – 5 or A – E", "Pick an option"], ["Enter", "Save & Next"], ["M", "Mark for Review & Next"], ["C", "Clear Response"], ["← →", "Previous / next question"], ["F", "Full screen"], ["+ / −", "Text size"]].map(function (r) {
        return '<tr><th><kbd>' + h(r[0]) + '</kbd></th><td>' + h(r[1]) + '</td></tr>'; }).join("") + '</tbody></table>' +
      '<div class="ex-mact"><button class="ex-b save" data-m="ok">Back to the paper</button></div>', function (m, close) { el('[data-m="ok"]', m).addEventListener("click", close); });
  }
  function full() { if (document.fullscreenElement) document.exitFullscreen && document.exitFullscreen(); else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {}); }
  function size(d) { EXFS = Math.max(0.85, Math.min(1.4, +(EXFS + d).toFixed(2))); lsSet("uc-exfs", EXFS); host.style.setProperty("--exfs", EXFS); }
  host.addEventListener("click", function (e) {
    var t = e.target.closest("[data-x],[data-j],[data-sec],input[name=exo]");
    if (!t) return;
    if (t.name === "exo") { pend = +t.value; paint(); return; }
    if (t.dataset.j != null) { go(+t.dataset.j, false); host.classList.remove("pal-open"); return; }
    if (t.dataset.sec) { go(secStart[t.dataset.sec], false); return; }
    var x = t.dataset.x;
    if (x === "save") saveNext(); else if (x === "mark") markNext();
    else if (x === "clear") { pend = null; cfg.set(i, null); cfg.setMark(i, false); paint(); }
    else if (x === "prev") go(i - 1, false); else if (x === "submit") summary(false);
    else if (x === "full") full(); else if (x === "help") help();
    else if (x === "fs+") size(.05); else if (x === "fs-") size(-.05);
    else if (x === "pal") host.classList.toggle("pal-open");
  });
  function onKey(e) {
    if (!document.body.contains(host)) { document.removeEventListener("keydown", onKey); return; }
    if (el(".ex-modal", host)) { if (e.key === "Escape") { var mm = el(".ex-modal", host); if (mm) mm.remove(); } return; }
    if (e.metaKey || e.ctrlKey || e.altKey || /input|textarea|select/i.test((e.target.tagName || "")) && e.target.name !== "exo") return;
    var k = e.key, q = qs[i];
    var pick = /^[1-5]$/.test(k) ? +k - 1 : /^[a-eA-E]$/.test(k) ? "abcde".indexOf(k.toLowerCase()) : -1;
    if (pick >= 0 && pick < q.o.length) { pend = pick; paint(); e.preventDefault(); return; }
    if (k === "Enter") { e.preventDefault(); saveNext(); }
    else if (k === "m" || k === "M") markNext();
    else if (k === "c" || k === "C") { pend = null; cfg.set(i, null); cfg.setMark(i, false); paint(); }
    else if (k === "ArrowRight") { e.preventDefault(); go(i + 1, false); }
    else if (k === "ArrowLeft") { e.preventDefault(); go(i - 1, false); }
    else if (k === "f" || k === "F") full(); else if (k === "?") help();
    else if (k === "+" || k === "=") size(.05); else if (k === "-") size(-.05);
  }
  document.addEventListener("keydown", onKey);
  function tick() {
    var c = el("#exclk", host), s = Math.round((cfg.deadline() - Date.now()) / 1000);
    if (c) { el("b", c).textContent = fmt(s); c.classList.toggle("low", s < 300); c.classList.toggle("crit", s < 60); }
    var tq = el("#extq", host); if (tq) tq.textContent = fmt(spent());
    if (s <= 0) finish(true);
  }
  timer = setInterval(function () { if (!document.body.contains(host)) { clearInterval(timer); document.removeEventListener("keydown", onKey); return; } tick(); }, 500);
  cfg.markVisited(i);
  pend = undefined; paint();
  return host;
}

/* ══════════ notes ══════════ */
var PYQ_RE = /\s*((?:\{(?:PYQ|UIIC)(?: [\d, ]+)?\}\s*)+)$/;
function hx(s) {
  s = s == null ? "" : String(s);
  var m = s.match(PYQ_RE);
  if (!m) return { t: h(s), hot: false };
  var tags = "", re = /\{(PYQ|UIIC)(?: ([\d, ]+))?\}/g, x, uiic = false;
  while ((x = re.exec(m[1]))) {
    var ys = x[2] ? x[2].split(/,\s*/).filter(Boolean) : [];
    if (x[1] === "UIIC") { uiic = true; tags += ' <span class="pyq y26" title="Asked in UIIC AO' + (ys.length ? ": " + ys.join(", ") : "") + '">UIIC' + (ys.length ? " " + ys.map(function (y) { return "’" + y.slice(2); }).join(" ") : "") + '</span>'; continue; }
    tags += ' <span class="pyq" title="Asked in UIIC, NIACL or NICL AO' + (ys.length ? ": " + ys.join(", ") : "") + '">' + (ys.length ? "Asked " + ys.map(function (y) { return "’" + y.slice(2); }).join(" ") : "Asked") + '</span>';
  }
  return { t: h(s.replace(PYQ_RE, "")) + tags, hot: true, uiic: uiic };
}
function nb(b) {
  var t = b.title || b.imp ? '<h4 class="nb-t">' + (b.imp ? '<span class="mr">Must read</span>' : '') + h(b.title || "") + '</h4>' : '';
  var any = false;
  function li(x) { var r = hx(x); any = any || r.hot; return '<li' + (r.hot ? ' class="hot"' : '') + '>' + r.t + '</li>'; }
  var out = "";
  switch (b.type) {
    case "points": out = '<ul class="pts">' + (b.items || []).map(li).join("") + '</ul>'; break;
    case "table": out = '<div class="nt-scroll"><table><thead><tr>' + (b.cols || []).map(function (c) { return '<th>' + h(c) + '</th>'; }).join("") + '</tr></thead><tbody>' +
      (b.rows || []).map(function (r) {
        var hot = false, cells = r.map(function (c, i) { var x = hx(c); hot = hot || x.hot; return i ? '<td>' + x.t + '</td>' : '<th scope="row">' + x.t + '</th>'; }).join("");
        any = any || hot; return '<tr' + (hot ? ' class="hot"' : '') + '>' + cells + '</tr>'; }).join("") + '</tbody></table></div>'; break;
    case "timeline": out = '<ol>' + (b.items || []).map(function (x) { var r = hx(x.what); any = any || r.hot;
      return '<li' + (r.hot ? ' class="hot"' : '') + '><b>' + h(x.when) + '</b><span>' + r.t + '</span></li>'; }).join("") + '</ol>'; break;
    case "pairs": out = '<div class="np">' + (b.items || []).map(function (x) { var r = hx(x.b); any = any || r.hot;
      return '<div' + (r.hot ? ' class="hot"' : '') + '><b>' + h(x.a) + '</b><i aria-hidden="true"></i><span>' + r.t + '</span></div>'; }).join("") + '</div>'; break;
    case "compare": out = '<div class="nc" style="--n:' + (b.items || []).length + '">' + (b.items || []).map(function (x) { return '<div><h5>' + h(x.title) + '</h5><ul class="pts">' + (x.points || []).map(li).join("") + '</ul></div>'; }).join("") + '</div>'; break;
    case "chain": out = '<div class="chn">' + (b.items || []).map(function (x) {
      var r = hx(x.note || ""), nodes = (x.nodes || []).slice(), last = hx(nodes.pop()); any = any || r.hot || last.hot;
      return '<div class="chn-r' + (r.hot || last.hot ? ' hot' : '') + '"><div class="chn-n">' + nodes.map(function (n) { return '<span>' + h(n) + '</span>'; }).join('<i aria-hidden="true"></i>') +
        (nodes.length ? '<i aria-hidden="true"></i>' : '') + '<span>' + last.t + '</span></div>' + (x.note ? '<p>' + r.t + '</p>' : '') + '</div>'; }).join("") + '</div>'; break;
    case "flow": out = '<ol>' + (b.steps || []).map(function (x) { var r = hx(x); any = any || r.hot; return '<li><span>' + r.t + '</span></li>'; }).join("") + '</ol>'; break;
    case "mnemonic": return '<div class="nb nb-mn' + (b.imp ? ' imp' : '') + '"><h4 class="nb-t">' + h(b.title || "Mnemonic") + '</h4><div class="mn-k">' + h(b.key) + '</div><div class="mn-l' + ((b.lines || []).some(function (x) { return String(x.l).length > 2; }) ? ' mn-w' : '') + '">' +
      (b.lines || []).map(function (x) { return '<div><b>' + h(x.l) + '</b><span>' + h(x.t) + '</span></div>'; }).join("") + '</div>' + (b.note ? '<p class="mn-n">' + h(b.note) + '</p>' : '') + '</div>';
    case "callout": var tone = { remember: "Remember", tip: "Tip", trap: "Trap", story: "The story" }[b.tone] || "Note", cb = hx(b.body);
      return '<div class="nb nb-co co-' + h(b.tone || "remember") + (cb.hot ? ' has-hot' : '') + '"><span class="co-k">' + h(b.title || tone) + '</span><p>' + cb.t + '</p></div>';
    case "formula": out = '<div class="fxg">' + (b.items || []).map(function (f) { return '<div class="fxc"><code class="fxm">' + mx(f.f) + '</code>' + (f.note ? '<span>' + mx(f.note) + '</span>' : '') + '</div>'; }).join("") + '</div>'; break;
    case "fig": return '<figure class="nb nb-fig">' + (b.title ? '<h4 class="nb-t">' + h(b.title) + '</h4>' : '') + '<div class="fig-s">' + svgSafe(b.svg) + '</div>' + (b.cap ? '<figcaption>' + hx(b.cap).t + '</figcaption>' : '') + '</figure>';
    case "solve": return solveHTML(b);
    case "work": return workHTML(b);
    case "method": return '<div class="nb nb-method' + (b.imp ? ' imp' : '') + '">' + (b.title ? '<h4 class="nb-t">' + h(b.title) + '</h4>' : '<h4 class="nb-t">Method</h4>') +
      '<ol class="mth">' + (b.steps || []).map(function (x, i) { return '<li><span class="mth-n">' + (i + 1) + '</span><span class="mth-t">' + mx(x) + '</span></li>'; }).join("") + '</ol>' + (b.note ? '<p class="mth-note">' + mx(b.note) + '</p>' : '') + '</div>';
    case "text": return '<div class="nb nb-text' + (b.imp ? ' imp' : '') + '">' + t + (b.paras || []).map(function (x) { var r = hx(x); return '<p' + (r.hot ? ' class="hot"' : '') + '>' + r.t + '</p>'; }).join("") + '</div>';
    default: return "";
  }
  var cls = { points: "nb-pts", table: "nb-tab", timeline: "nb-tl", pairs: "nb-pairs", compare: "nb-cmp", chain: "nb-chain", flow: "nb-flow", formula: "nb-fx" }[b.type];
  return '<div class="nb ' + cls + (b.imp ? ' imp' : '') + (any ? ' has-hot' : '') + '">' + t + out + '</div>';
}
/* maths, written the way it is on a whiteboard: [[a/b]] is a stacked fraction, ==x== is highlighted, `x` is a maths run */
function mx(s) {
  var r = hx(s), t = r.t;
  t = t.replace(/\[\[([^\]\/]+)\/([^\]]+)\]\]/g, '<span class="fr"><i>$1</i><i>$2</i></span>')
       .replace(/==([^=]+)==/g, '<mark>$1</mark>')
       .replace(/`([^`]+)`/g, '<span class="mm">$1</span>');
  return t;
}
/* a worked example as a whiteboard: the question, one line per step (big maths, a few words on what was done), the answer boxed.
   rows with "hide" stay covered until tapped, for "Your turn" examples */
function workHTML(b) {
  var turn = (b.rows || []).some(function (x) { return x.hide; });
  return (b.title ? '<h4 class="nb-t sol-g">' + h(b.title) + '</h4>' : '') + '<div class="nb nb-work' + (turn ? ' turn' : '') + (/UIIC/i.test(b.src || "") ? ' has-hot' : '') + '">' +
    (b.src || turn ? '<div class="wk-h">' + (turn ? '<span class="wk-k">Your turn</span>' : '<span class="wk-k">Worked example</span>') + (b.src ? '<span class="pyq' + (/UIIC/i.test(b.src) ? ' y26' : '') + '">' + h(b.src) + '</span>' : '') + '</div>' : '') +
    (b.q ? '<p class="wk-q">' + mx(b.q) + '</p>' : '') +
    (b.fig ? '<div class="fig-s wk-fig">' + svgSafe(b.fig) + '</div>' : '') +
    '<ol class="wk">' + (b.rows || []).map(function (x, i) {
      var inner = '<span class="wk-m">' + mx(x.m) + '</span>' + (x.n ? '<span class="wk-n">' + mx(x.n) + '</span>' : '');
      return '<li class="' + (x.ans ? 'ans' : '') + (x.hide ? ' hide' : '') + '"' + (x.hide ? ' tabindex="0" role="button" aria-label="Tap to reveal this step"' : '') + '>' +
        '<span class="wk-i">' + (x.ans ? '✓' : i + 1) + '</span><div class="wk-b">' + inner + '</div></li>';
    }).join("") + '</ol>' +
    (b.tip ? '<p class="wk-tip"><span>Shortcut</span>' + mx(b.tip) + '</p>' : '') + '</div>';
}
document.addEventListener("click", function (e) { var li = e.target.closest && e.target.closest(".nb-work li.hide"); if (li) li.classList.remove("hide"); });
var SVG_EL = /^(svg|g|line|path|circle|ellipse|rect|polygon|polyline|text|tspan|title)$/,
  SVG_AT = /^(viewBox|class|d|x|y|x1|y1|x2|y2|cx|cy|r|rx|ry|width|height|points|transform|text-anchor|dominant-baseline|dx|dy|stroke-dasharray|role|aria-label)$/;
function svgSafe(src) {
  if (!src || typeof DOMParser === "undefined") return "";
  try {
    var doc = new DOMParser().parseFromString(String(src), "image/svg+xml"), root = doc.documentElement;
    if (!root || root.nodeName !== "svg" || doc.getElementsByTagName("parsererror").length) return "";
    (function clean(n) {
      Array.prototype.slice.call(n.children).forEach(function (c) { if (!SVG_EL.test(c.nodeName)) n.removeChild(c); else clean(c); });
      Array.prototype.slice.call(n.attributes).forEach(function (a) { if (!SVG_AT.test(a.name)) n.removeAttribute(a.name); });
      var c = n.getAttribute && n.getAttribute("class"); if (c) n.setAttribute("class", c.replace(/\bbar(2?)\b/g, "cbar$1"));
    })(root);
    root.setAttribute("xmlns", "http://www.w3.org/2000/svg"); root.setAttribute("role", "img");
    root.removeAttribute("width"); root.removeAttribute("height");
    return new XMLSerializer().serializeToString(root);
  } catch (e) { return ""; }
}
document.addEventListener("click", function (e) {
  var s = e.target.closest ? e.target.closest(".fig-s") : null;
  if (!s || s.closest(".figzoom") || e.target.closest("a,button")) return;
  var svg = s.querySelector("svg"); if (!svg) return;
  var z = document.createElement("div"); z.className = "figzoom"; z.setAttribute("role", "dialog"); z.setAttribute("aria-label", "Diagram, enlarged");
  var wrap = s.closest("figure, .nb-sol"), cap = wrap && (wrap.querySelector("figcaption") || wrap.querySelector(".nb-t") || wrap.querySelector(".sol-q"));
  z.innerHTML = '<button class="fz-x" type="button">Close</button><div class="fz-in fig-s"></div><p class="fz-c"></p>';
  z.querySelector(".fz-in").appendChild(svg.cloneNode(true));
  if (cap) z.querySelector(".fz-c").textContent = cap.textContent;
  function close() { z.remove(); document.removeEventListener("keydown", onk); }
  function onk(ev) { if (ev.key === "Escape") close(); }
  z.addEventListener("click", function (ev) { if (ev.target === z || ev.target.classList.contains("fz-x") || ev.target.classList.contains("fz-c")) close(); });
  document.addEventListener("keydown", onk);
  document.body.appendChild(z); z.querySelector(".fz-x").focus();
});
document.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("[data-print]")) window.print(); });
function solveHTML(b) {
  var L = "ABCDE", a = String(b.a || "").trim(), o = b.o || [];
  var ok = o.findIndex ? o.findIndex(function (x) { return String(x).trim() === a; }) : -1;
  var pyq = b.src && !/^practice/i.test(b.src);
  return (b.title ? '<h4 class="nb-t sol-g">' + h(b.title) + '</h4>' : '') + '<div class="nb nb-sol has-hot">' +
    '<div class="sol-h"><span class="sol-k">' + (pyq ? "Solved PYQ" : "Worked example") + '</span>' + (pyq ? '<span class="pyq' + (/UIIC/i.test(b.src) ? ' y26' : '') + '">' + h(b.src) + '</span>' : '') + '</div>' +
    '<p class="sol-q">' + h(b.q) + '</p>' + (b.svg ? '<div class="fig-s sol-fig">' + svgSafe(b.svg) + '</div>' : '') +
    (o.length ? '<ol class="sol-o">' + o.map(function (x, i) { return '<li' + (i === ok ? ' class="ok"' : '') + '><b>' + L[i] + '</b><span>' + h(x) + '</span></li>'; }).join("") + '</ol>' : '') +
    '<details class="sol-d"><summary><span>Show the full solution</span></summary><ol class="sol-st">' + (b.steps || []).map(function (x) { return '<li>' + h(x) + '</li>'; }).join("") + '</ol>' +
      '<p class="sol-a"><span>Answer</span><b>' + h(a) + '</b></p>' + (b.trick ? '<p class="sol-tr"><span>Shortcut</span>' + h(b.trick) + '</p>' : '') + '</details></div>';
}
var YLD = { high: "Asked often", med: "Asked sometimes", medium: "Asked sometimes" };
var noteMode = lsGet("uc-note-mode", "full"), noteLens = "", tocOff = lsGet("uc-toc", "on") === "off";
function notesV4(N) {
  var R = N.recap || {}, C = N.chapters || [];
  var recap = '<div class="nv-recap"><ol class="rc-lines">' + (R.lines || []).map(function (x) { var r = hx(x); return '<li' + (r.hot ? ' class="hot"' : '') + '>' + r.t + '</li>'; }).join("") + '</ol></div>';
  var full = '<div class="nv-full">' +
    '<div class="nv-pick"><button class="nv-prev" aria-label="Previous chapter">&#8249;</button>' +
      '<button class="nv-pk" aria-haspopup="dialog"><span class="nv-pn">Chapter 1 of ' + C.length + '</span><b class="nv-pt">' + h((C[0] || {}).h || "") + '</b><i aria-hidden="true">&#9662;</i></button>' +
      '<button class="nv-next" aria-label="Next chapter">&#8250;</button></div>' +
    '<div class="nv-sheet" hidden><div class="nv-sh-bg"></div><div class="nv-sh-in" role="dialog" aria-label="Chapters"><div class="nv-sh-h"><b>Chapters</b><button class="nv-sh-x" aria-label="Close">&#215;</button></div>' +
      C.map(function (c, i) { return '<button data-go="' + i + '"><span>' + (i + 1) + '</span>' + h(c.h) + '</button>'; }).join("") + '</div></div>' +
    '<button class="nv-tocb" data-toct aria-label="Show chapters"><span aria-hidden="true">&#9776;</span> Chapters</button>' +
    '<nav class="nv-toc" aria-label="Chapters"><div class="nv-toch"><b>Chapters</b><button data-toct aria-label="Hide chapters">&#8249;</button></div>' + C.map(function (c, i) { return '<a href="#nch-' + i + '" data-nch="' + i + '"' + (c.yield === "high" ? ' class="hy" title="Asked often"' : '') + '><span>' + (i + 1) + '</span>' + h(c.h) + '</a>'; }).join("") + '</nav>' +
    '<div class="nv-chs">' + C.map(function (c, i) {
      return '<article class="nch' + (/\{PYQ|"type":"solve"/.test(JSON.stringify(c.blocks || [])) ? ' has-hot' : '') + '" id="nch-' + i + '"><header><span class="nch-n">Chapter ' + (i + 1) + (YLD[c.yield] ? '<em class="yl yl-' + (c.yield === "med" ? "medium" : c.yield) + '">' + YLD[c.yield] + '</em>' : '') + '</span><h3>' + h(c.h) + '</h3></header>' +
        (c.intro ? '<p class="nch-in">' + h(c.intro) + '</p>' : '') + (c.blocks || []).map(nb).join("") + '</article>'; }).join("") + '</div></div>';
  var CS = JSON.stringify(C), hot1 = (CS.match(/\{(PYQ|UIIC)/g) || []).length, nu = (CS.match(/\{UIIC/g) || []).length + (CS.match(/"src":"[^"]*UIIC/g) || []).length, hot = hot1 + (CS.match(/"type":"solve"/g) || []).length, nimp = (CS.match(/"imp":true/g) || []).length;
  var mode = noteMode === "recap" ? "recap" : "full";
  var L = [["", "All notes"]].concat(nu ? [["y26", "Asked in UIIC · " + nu]] : [], hot ? [["asked", "Asked in AO papers"]] : [], nimp ? [["imp", "Must read · " + nimp]] : []);
  var lens = L.some(function (x) { return x[0] === noteLens; }) ? noteLens : "";
  return '<div class="nv" data-mode="' + mode + '" data-lens="' + lens + '" data-toc="' + (tocOff ? "off" : "on") + '">' +
    (L.length > 1 ? '<div class="nv-lens"><span class="nv-lk">' + (hot1 ? '<span class="pyq">Asked</span> ' + hot1 + ' lines asked in insurance AO papers' : 'Solved questions in the chapters') + '</span>' +
      '<div class="nv-lseg" role="radiogroup" aria-label="Show">' + L.map(function (x) { return '<button role="radio" data-lens="' + x[0] + '" aria-checked="' + (x[0] === lens) + '"' + (x[0] === "imp" ? ' class="limp"' : x[0] === "y26" ? ' class="l26"' : '') + '>' + h(x[1]) + '</button>'; }).join("") + '</div></div>' : '') +
    '<div class="nv-seg" role="tablist" aria-label="Notes view" style="--n:2"><button role="tab" data-nm="recap" aria-selected="' + (mode === "recap") + '">Recap <small>' + (R.lines || []).length + ' lines</small></button>' +
      '<button role="tab" data-nm="full" aria-selected="' + (mode === "full") + '">Complete notes <small>' + C.length + ' chapters</small></button><i aria-hidden="true"></i></div>' +
    '<div class="nv-body">' + recap + full + '</div></div>';
}
function wireNotes() {
  var nv = el(".nv"); if (!nv) return;
  els("[data-toct]", nv).forEach(function (b) { b.addEventListener("click", function () { tocOff = !tocOff; nv.dataset.toc = tocOff ? "off" : "on"; lsSet("uc-toc", tocOff ? "off" : "on"); }); });
  els(".nv-chs .nb.imp", nv).forEach(function (b) { var c = b.closest(".nch"); if (c) c.classList.add("hasimp"); });
  // what UIIC itself asked: the "Asked in UIIC" view keeps just those lines, blocks and chapters
  els(".nv-chs .pyq.y26", nv).forEach(function (p) {
    var line = p.closest(".pts li, tr, .np > div, .nb-tl li, .chn-r, .nb-co, .nb-sol, .nb-text p"); if (line) line.classList.add("y26");
    var b = p.closest(".nb"); if (b) b.classList.add("has26");
    var c = p.closest(".nch"); if (c) c.classList.add("has26");
  });
  els("[data-lens]", el(".nv-lens", nv) || nv).forEach(function (b) { if (b === nv) return; b.addEventListener("click", function () {
    noteLens = b.dataset.lens; nv.dataset.lens = noteLens;
    els(".nv-lseg [data-lens]", nv).forEach(function (x) { x.setAttribute("aria-checked", String(x === b)); });
    if (noteLens && noteMode !== "full") { var fb = el('[data-nm="full"]', nv); if (fb) fb.click(); }
    refreshPicker();
  }); });
  els("[data-nm]", nv).forEach(function (b) { b.addEventListener("click", function () {
    noteMode = b.dataset.nm; nv.dataset.mode = noteMode; lsSet("uc-note-mode", noteMode);
    els("[data-nm]", nv).forEach(function (x) { x.setAttribute("aria-selected", String(x === b)); });
    var M = window.Motion, body = el(noteMode === "recap" ? ".nv-recap" : ".nv-full", nv);
    if (M && !reduceMotion()) M.animate(body, { opacity: [0, 1], transform: ["translateY(8px)", "translateY(0)"] }, { duration: 0.3, ease: [0.23, 1, 0.32, 1] });
  }); });
  var links = els("[data-nch]", nv);
  links.forEach(function (a) { a.addEventListener("click", function (e) { e.preventDefault(); var t = document.getElementById("nch-" + a.dataset.nch); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); }); });
  var chs = els(".nch", nv), cur = 0, pn = el(".nv-pn", nv), pt = el(".nv-pt", nv), sheet = el(".nv-sheet", nv);
  function shown() { return chs.filter(function (c) { return getComputedStyle(c).display !== "none"; }); }
  function go(i) { var t = chs[Math.max(0, Math.min(chs.length - 1, i))]; if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); }
  function step(d) {
    var v = shown(), k = v.indexOf(chs[cur]);
    if (k < 0) { k = v.findIndex(function (c) { return chs.indexOf(c) > cur; }); k = k < 0 ? v.length - 1 : d > 0 ? k - 1 : k; }
    var t = v[Math.max(0, Math.min(v.length - 1, k + d))]; if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function mark(i) {
    cur = i; var v = shown(), k = v.indexOf(chs[i]);
    links.forEach(function (a) { a.classList.toggle("on", +a.dataset.nch === i); });
    if (pn) { pn.textContent = "Chapter " + (i + 1) + (v.length < chs.length && k >= 0 ? " · " + (k + 1) + " of " + v.length + " shown" : " of " + chs.length); pt.textContent = (el("h3", chs[i]) || {}).textContent || ""; }
    els("[data-go]", nv).forEach(function (b) { b.classList.toggle("on", +b.dataset.go === i); });
    var pv = el(".nv-prev", nv), nx = el(".nv-next", nv); if (pv) pv.disabled = k <= 0; if (nx) nx.disabled = k < 0 || k >= v.length - 1;
  }
  function refreshPicker() {
    var v = shown();
    links.forEach(function (a) { a.hidden = v.indexOf(chs[+a.dataset.nch]) < 0; });
    els("[data-go]", nv).forEach(function (b) { b.hidden = v.indexOf(chs[+b.dataset.go]) < 0; });
    mark(v.indexOf(chs[cur]) >= 0 || !v.length ? cur : chs.indexOf(v[0]));
  }
  function openSheet(on) {
    if (!sheet) return;
    var M = window.Motion, box = el(".nv-sh-in", sheet);
    if (on) { sheet.hidden = false; document.body.style.overflow = "hidden"; var cb = el('[data-go="' + cur + '"]', sheet); if (cb) cb.scrollIntoView({ block: "center" });
      if (M && !reduceMotion()) { M.animate(box, { transform: ["translateY(100%)", "translateY(0)"] }, { type: "spring", bounce: 0, duration: 0.4 }); M.animate(el(".nv-sh-bg", sheet), { opacity: [0, 1] }, { duration: 0.2 }); } }
    else { document.body.style.overflow = ""; if (M && !reduceMotion()) M.animate(box, { transform: "translateY(100%)" }, { duration: 0.22, ease: [0.23, 1, 0.32, 1] }).then(function () { sheet.hidden = true; }); else sheet.hidden = true; }
  }
  var pk = el(".nv-pk", nv);
  if (pk) {
    pk.addEventListener("click", function () { openSheet(true); });
    el(".nv-prev", nv).addEventListener("click", function () { step(-1); });
    el(".nv-next", nv).addEventListener("click", function () { step(1); });
    el(".nv-sh-bg", nv).addEventListener("click", function () { openSheet(false); });
    el(".nv-sh-x", nv).addEventListener("click", function () { openSheet(false); });
    els("[data-go]", nv).forEach(function (b) { b.addEventListener("click", function () { openSheet(false); go(+b.dataset.go); }); });
    document.addEventListener("keydown", function esc(e) { if (!document.body.contains(nv)) return document.removeEventListener("keydown", esc); if (e.key === "Escape" && !sheet.hidden) openSheet(false); });
  }
  var io = new IntersectionObserver(function (es) { es.forEach(function (x) { if (x.isIntersecting) mark(chs.indexOf(x.target)); }); }, { rootMargin: "-30% 0px -60% 0px" });
  chs.forEach(function (c) { io.observe(c); });
  refreshPicker();
}

/* ══════════ views ══════════ */
var V = {};
function blank(msg) { return '<div class="blank"><b>Not found</b><p>' + h(msg || "That page does not exist.") + '</p><a class="btn key" href="#/" style="margin-top:20px">Home' + arr() + '</a></div>'; }
function foot() {
  return '<footer class="foot">UIIC Administrative Officer (Scale I), Generalist, 2026. Prelims on 22 October 2026, Mains on 30 November 2026 (tentative).<br>' +
    'Notes written for this site from the official syllabus and public sources. Past papers are memory-based recollections; verify dates and rules against your call letter and uiic.co.in. Not affiliated with United India Insurance.</footer>';
}
function secTone(k) { return secOf(k).tone || "q"; }

/* ── home ── */
function todayPlan() {
  var t = ymd(new Date()), P = D.plan || [];
  for (var i = 0; i < P.length; i++) if (P[i].date === t) return { d: P[i], i: i };
  if (P.length && t < P[0].date) return { d: P[0], i: 0 };
  return P.length ? { d: P[P.length - 1], i: P.length - 1 } : null;
}
V[""] = function () {
  var t = totals(), d = daysTo(EXAM), hist = mockHistory(), last = hist[hist.length - 1];
  var nl = nLearned(), nt = nTopics(), nErr = errList().length;
  var ring = [
    { k: "Topics read", p: nt ? nl / nt : 0, n: nl, v: String(nl), suffix: " of " + nt },
    { k: "Questions", p: t.n ? t.done / t.n : 0, n: t.done, v: String(t.done), suffix: " of " + t.n },
    { k: "Accuracy", p: (t.acc || 0) / 100, n: t.acc || 0, v: (t.acc || 0) + "%", suffix: "%" }
  ];
  var tp = todayPlan(), next = [];
  if (tp) tp.d.tasks.forEach(function (x, k) {
    var id = tp.d.date + "t" + k;
    if (!ST.plan[id] && next.length < 4) next.push([x.href || "#/plan", x.t, x.d || "", id]);
  });
  if (nErr && next.length < 5) next.push(["#/errors", nErr + " question" + (nErr === 1 ? "" : "s") + " in your error log", "Each leaves the log after two right answers in a row."]);
  var nextHTML = next.length ? '<section class="band next-up"><div class="band-h"><h2 class="sec-h reveal">' + (tp ? 'Today · ' + h(tp.d.t) : 'Do this next') + '</h2><a class="muted reveal" href="#/plan">The plan' + arr() + '</a></div>' +
    '<div class="list" style="margin-top:22px">' + next.map(function (x, i) {
      return '<a class="item reveal" href="' + x[0] + '"><span class="num">' + (i + 1) + '</span><span><span class="t">' + h(x[1]) + '</span>' + (x[2] ? '<span class="d">' + h(x[2]) + '</span>' : '') + '</span></a>';
    }).join("") + '</div></section>' : '';
  return '<section class="head hero"><div class="hero-t">' +
      '<span class="kicker reveal">Prelims · Thursday 22 October 2026 · report 8:00 am</span>' +
      '<h1 class="page-h reveal">' + (d ? d + ' day' + (d === 1 ? '' : 's') + ' left.' : 'Exam day.') + '</h1>' +
      '<p class="lede reveal">UIIC Administrative Officer, Generalist. Prelims: English 30, Reasoning 35 and Quant 35 questions, each section on its own 20-minute clock, a quarter mark off for every wrong answer.</p>' +
    '</div><figure class="hero-g reveal">' + rings(ring) + ringLegend(ring) + '</figure></section>' +
    (D.lastday ? '<a class="ld-band reveal" href="#/lastday"><span class="ld-k">' + (d <= 1 ? 'Read tonight' : 'Final revision') + '</span><b>The last-day sheet</b><span class="d">Every topic on one page: the methods, formulas and traps that insurance AO papers keep testing.</span></a>' : '') +
    nextHTML +
    '<a class="ld-band reveal ex-band" href="#/exam"><span class="ld-k">The exam</span><b>Pattern and syllabus</b><span class="d">Prelims and Mains, the sectional clocks, the marking, how selection works and the full syllabus on one page.</span></a>' +
    '<div class="stats reveal">' +
      '<div class="stat"><div class="k">Last mock</div><div class="v">' + (last ? fmtM(last.s.marks) + '<small> / ' + fmtM(last.s.max) + '</small>' : '—') + '</div><div class="s">' + (last ? h(last.p.label) : 'none yet') + '</div></div>' +
      '<div class="stat"><div class="k">Accuracy</div><div class="v">' + (t.acc == null ? '—' : t.acc + '%') + '</div><div class="s">' + (t.done ? t.right + ' right of ' + t.done : 'nothing answered yet') + '</div></div>' +
      '<div class="stat"><div class="k">Error log</div><div class="v">' + nErr + '</div><div class="s">questions still to clear</div></div>' +
      '<div class="stat"><div class="k">Mains</div><div class="v">' + daysTo(MAINS) + '<small> days</small></div><div class="s">30 November 2026 (tentative)</div></div>' +
    '</div>' +
    '<section class="band"><h2 class="sec-h reveal">The exam</h2><div class="two" style="margin-top:18px">' +
      '<div class="note reveal"><h3>Prelims · 22 Oct · 60 min</h3><ul class="pts">' + secsOf("pre").map(function (s) { return '<li>' + h(s.name) + ': ' + s.pre[0] + ' questions in ' + s.pre[2] + ' minutes</li>'; }).join("") + '<li>A cut-off in every section and overall. Prelims marks only shortlist you for Mains.</li></ul></div>' +
      '<div class="note reveal"><h3>Mains · 30 Nov · 150 min + 30</h3><ul class="pts">' + secsOf("mains").filter(function (s) { return s.mains; }).map(function (s) { return '<li>' + h(s.short) + ': ' + s.mains[0] + ' questions, ' + s.mains[1] + ' marks, ' + s.mains[2] + ' min</li>'; }).join("") + '<li>Then a typed letter and essay, 30 marks in 30 minutes. Final merit: Mains objective 75, interview 25.</li></ul></div>' +
    '</div></section>' + foot();
};

/* ── plan ── */
V["plan"] = function () {
  var P = D.plan || [], ids = [];
  P.forEach(function (s) { s.tasks.forEach(function (t, k) { ids.push(s.date + "t" + k); }); });
  var done = ids.filter(function (k) { return ST.plan[k]; }).length, tday = ymd(new Date());
  return '<section class="head"><span class="kicker reveal">' + done + ' of ' + ids.length + ' done</span>' +
      '<h1 class="page-h reveal">Six days to Prelims.</h1>' +
      '<p class="lede reveal">Prelims is three sections on separate 20-minute clocks, so speed on the high-yield question types decides it. Mornings go to the topic notes and their videos, afternoons to timed sectional practice, evenings to a full mock and the error log. The last day is revision only.</p>' +
      '<div class="track reveal" style="max-width:320px;margin-top:22px"><i style="--p:' + (pc(done, ids.length) / 100) + '"></i></div></section>' +
    '<div class="plan">' + P.map(function (s, i) {
      var today = s.date === tday;
      return '<details class="sess reveal"' + (today || (!P.some(function (x) { return x.date === tday; }) && i === 0) ? " open" : "") + '>' +
        '<summary><span class="sd">' + (today ? "Today" : h(s.label)) + '</span><span class="st">' + h(s.t) + '</span><span class="tag' + (today ? " key" : "") + '">Day ' + (i + 1) + '</span></summary>' +
        '<div class="body"><p class="goal">' + h(s.goal) + '</p><div class="blk">' + s.tasks.map(function (t, k) {
          var id = s.date + "t" + k;
          return '<label class="task"><input type="checkbox" data-plan="' + id + '"' + (ST.plan[id] ? " checked" : "") + '><span>' + (t.when ? '<b>' + h(t.when) + '</b> ' : '') + (t.href ? '<a href="' + t.href + '">' + h(t.t) + '</a>' : h(t.t)) + (t.d ? ' <small class="muted">' + h(t.d) + '</small>' : '') + '</span></label>';
        }).join("") + '</div></div></details>';
    }).join("") + '</div>' + foot();
};

/* ── learn ── */
var learnSec = "";
V["learn"] = function (sk, topic) {
  if (sk && topic) return topicPage(sk, decodeURIComponent(topic));
  if (sk) { learnSec = sk; }
  var nl = nLearned(), nt = nTopics();
  function paperBand(pp, title) {
    return secsOf(pp).map(function (x) {
      var done = x.topics.filter(function (t) { return learned(x.k, t.n); }).length;
      return '<section class="band lsec t-' + x.tone + '" id="sec-' + x.k + '"><div class="band-h"><h2 class="sec-h reveal"><i class="sdot"></i>' + h(x.name) + '</h2>' +
        '<span class="muted reveal">' + title + ' · ' + done + ' of ' + x.topics.length + ' read</span></div>' +
        (x.official ? '<details class="offic reveal"><summary>Official syllabus wording</summary><p>' + h(x.official) + '</p></details>' : '') +
        '<div class="tgrid">' + x.topics.map(function (t) {
          var N = D.notes[tkey(x.k, t.n)], qs = topicQs(x.k, t.n), st = statOf(qs), NS = N ? JSON.stringify(N) : "", asked = (NS.match(/\{(PYQ|UIIC)/g) || []).length, uq = (NS.match(/\{UIIC/g) || []).length + qs.filter(function (q) { return /UIIC/.test(q.src || ""); }).length;
          return '<a class="tcard reveal' + (learned(x.k, t.n) ? " done" : "") + '" href="' + learnHref(x.k, t.n) + '" data-tn="' + h((t.n + " " + x.name).toLowerCase()) + '" data-ts="' + x.k + '"' + (learned(x.k, t.n) ? ' data-tl="1"' : '') + '>' +
            '<span class="tc-top"><span class="tc-w">' + (N ? '<b>' + (N.chapters || []).length + '</b> chapters' : 'Notes coming') + '</span>' +
              (learned(x.k, t.n) ? '<span class="tag key">Read</span>' : asked ? '<span class="tag">Asked ×' + asked + '</span>' : '') + '</span>' +
            '<span class="tc-t">' + h(t.n) + (uq ? ' <span class="pyq y26" title="Asked in UIIC AO papers">UIIC · ' + uq + '</span>' : '') + '</span>' +
            '<span class="tc-bar"><i style="--p:' + (st.n ? Math.max(0.04, st.done / st.n) : 0) + '"></i></span>' +
            '<span class="tc-d">' + st.n + ' question' + (st.n === 1 ? '' : 's') + (st.done ? ' · ' + st.done + ' done' : '') + '</span></a>';
        }).join("") + '</div></section>';
    }).join("");
  }
  return '<section class="lhero reveal"><div class="lh-t"><span class="kicker">' + nl + ' of ' + nt + ' topics read</span>' +
      '<h1 class="page-h">Learn.</h1><p class="lede">Every topic for Prelims and Mains, with complete notes, the best video classes, what insurance AO papers have asked marked in yellow, worked questions and practice.</p></div>' +
      '<div class="lh-ring">' + miniRing(nt ? nl / nt : 0, 168, "big") + '<div class="lh-n"><b>' + pc(nl, nt) + '%</b><span>read</span></div></div></section>' +
    '<div class="stiles">' + D.secs.map(function (x) {
      var done = x.topics.filter(function (t) { return learned(x.k, t.n); }).length;
      return '<button class="stile t-' + x.tone + (learnSec === x.k ? ' on' : '') + ' reveal" data-fsec="' + x.k + '"><span class="st-k">' + h(x.short) + '</span><b>' + done + '<small> / ' + x.topics.length + '</small></b>' +
        '<span class="st-d">' + (x.pre ? 'Prelims and Mains' : 'Mains') + ' · ' + secQs(x.k).length + ' questions</span><span class="st-bar"><i style="--p:' + (x.topics.length ? done / x.topics.length : 0) + '"></i></span></button>';
    }).join("") + '</div>' +
    '<div class="finder reveal" id="finder"><label class="fsearch"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>' +
      '<input id="tq" type="search" placeholder="Find a topic: puzzles, DI, cloze, IRDAI…" autocomplete="off" aria-label="Find a topic"></label>' +
      '<div class="chips" role="tablist">' + [["", "All"], ["PRE", "Prelims"], ["MAINS", "Mains only"]].map(function (c) { return '<button class="chip' + (c[0] === learnSec ? ' on' : '') + '" data-fsec="' + c[0] + '">' + c[1] + '</button>'; }).join("") + '</div></div>' +
    '<p class="muted fempty" id="fempty" hidden>No topic matches. Try a shorter word.</p>' +
    paperBand("pre", "Prelims and Mains") + paperBand("mainsonly", "Mains only") + foot();
};
function applyFinder() {
  var q = ((el("#tq") || {}).value || "").trim().toLowerCase(), any = false;
  els(".band[id^='sec-']").forEach(function (b) {
    var vis = 0, bk = b.id.slice(4), pp = secOf(bk).pre ? "PRE" : "MAINS";
    var secOk = !learnSec || learnSec === bk || learnSec === pp;
    els("[data-tn]", b).forEach(function (it) {
      var ok = secOk && (!q || q.split(/\s+/).every(function (w) { return it.dataset.tn.indexOf(w) >= 0; }));
      it.hidden = !ok; if (ok) vis++;
    });
    b.hidden = !vis; if (vis) any = true;
  });
  var e = el("#fempty"); if (e) e.hidden = any;
}
function topicPage(sk, t) {
  var sec = secOf(sk), list = sec.topics, idx = list.map(function (x) { return x.n; }).indexOf(t);
  if (idx < 0) return blank();
  var N = D.notes[tkey(sk, t)] || null, qs = topicQs(sk, t), st = statOf(qs);
  lsSet("uc-last", JSON.stringify({ s: sk, t: t }));
  var prev = list[idx - 1], next = list[idx + 1], steps = [];
  function step(id, title, body) { steps.push([id, title]); return '<section class="band tstep" id="' + id + '"><h2 class="sec-h reveal"><span class="sn">' + steps.length + '</span>' + title + '</h2>' + body + '</section>'; }
  function ul(a) { return '<ul class="pts">' + a.map(function (x) { var r = hx(x); return '<li' + (r.hot ? ' class="hot"' : '') + '>' + r.t + '</li>'; }).join("") + '</ul>'; }
  var body = "";
  if (N) {
    body += step("notes", "Learn", notesV4(N));
    if ((N.formulas || []).length) body += step("formulas", "Formulas, rules and numbers", '<div class="fxg">' + N.formulas.map(function (f) { return '<div class="fxc reveal"><code>' + h(f.f) + '</code>' + (f.note ? '<span>' + h(f.note) + '</span>' : '') + '</div>'; }).join("") + '</div>');
    if ((N.traps || []).length || (N.method || []).length) body += step("traps", "Traps", '<div class="two">' +
      ((N.method || []).length ? '<div class="note reveal"><h3>How to answer</h3><ol class="pts">' + N.method.map(function (x) { return '<li>' + h(x) + '</li>'; }).join("") + '</ol></div>' : '') +
      ((N.traps || []).length ? '<div class="note trap reveal"><h3>Where marks are lost</h3>' + ul(N.traps) + '</div>' : '') + '</div>');
    if ((N.examples || []).length) body += step("examples", "Worked examples", '<p class="muted reveal" style="margin-top:10px">Try each one first. The answer stays hidden until you ask.</p><div class="exs">' + N.examples.map(function (e, k) {
      return '<details class="ex reveal"><summary><span class="exn">' + (k + 1) + '</span><span class="exq">' + h(e.q) + '</span></summary><div class="exa"><b>' + h(e.a) + '</b><p>' + h(e.how) + '</p></div></details>'; }).join("") + '</div>');
  } else body += step("notes", "Learn", '<p class="muted reveal" style="margin-top:12px">The notes for this topic are being written and will appear here on the next update. Its questions below are ready.</p>');
  var vids = (D.videos || {})[tkey(sk, t)] || [];
  if (vids.length) body += step("watch", "Watch", '<p class="muted reveal" style="margin-top:10px">The best classes we found for this topic, best first. Tap to play here.</p><div class="vgrid">' + vids.map(vidCard).join("") + '</div>');
  body += step("practise", "Practise", '<div class="cta reveal"><div><b>' + qs.length + ' question' + (qs.length === 1 ? '' : 's') + '</b><span>' + srcSplit(qs) + '. ' + (st.done ? st.done + ' done, ' + st.acc + '% right.' : 'None attempted yet.') + '</span></div>' +
      '<div class="cta-b">' + (qs.length ? '<a class="btn key" href="' + pracHref(sk, t) + '">' + (st.done ? 'Continue practice' : 'Start practice') + arr() + '</a>' : '') +
      '<label class="lchk"><input type="checkbox" data-learn="' + h(tkey(sk, t)) + '"' + (learned(sk, t) ? ' checked' : '') + '><span>I have read this topic</span></label></div></div>' +
    (N && (N.revise || []).length ? '<div class="note reveal" style="margin-top:16px"><h3>Before the exam, read only this</h3>' + ul(N.revise) + '</div>' : ''));
  var tbar = '<div class="tbar" id="tbar"><a class="tb-back" href="#/learn" aria-label="All topics">&#8592;</a><span class="tb-tt">' + h(sec.short) + ' · ' + h(t) + '</span>' +
    '<div class="tb-r"><button class="tb-b" data-rs="-1" aria-label="Smaller text">A−</button><button class="tb-b" data-rs="1" aria-label="Larger text">A+</button><button class="tb-b tb-aa" data-rs="cycle" aria-label="Text size">Aa</button></div><i class="tb-prog" id="tprog"></i></div>';
  return tbar + '<article class="study t-' + sec.tone + '"><section class="thero reveal"><div class="th-t"><a class="kicker" href="#/learn">&#8592; ' + h(sec.short) + ' · topic ' + (idx + 1) + ' of ' + list.length + '</a>' +
      '<h1 class="page-h">' + h(t) + '</h1><p class="lede">' + h(N ? N.why : "") + '</p>' +
      '<div class="pills">' + (learned(sk, t) ? '<span class="tag key">Read</span>' : '') + '</div></div>' +
      '<div class="th-stats"><div class="th-s"><b>' + (N ? (N.chapters || []).length : 0) + '</b><span>chapters</span></div><div class="th-s"><b>' + qs.length + '</b><span>questions</span></div>' +
        '<div class="th-s ring">' + miniRing(st.acc == null ? 0 : st.acc / 100, 62) + '<div><b>' + (st.acc == null ? '—' : st.acc + '%') + '</b><span>' + (st.acc == null ? 'not practised' : 'your accuracy') + '</span></div></div></div>' +
      '<nav class="steps" aria-label="On this page">' + steps.map(function (x, k) { return '<a href="#' + x[0] + '" data-jump="' + x[0] + '"><span class="sn">' + (k + 1) + '</span>' + x[1] + '</a>'; }).join("") + '</nav></section>' + body +
    '<nav class="tnav reveal">' + (prev ? '<a class="btn quiet" href="' + learnHref(sk, prev.n) + '">&#8592; ' + h(prev.n) + '</a>' : '<span></span>') +
      (next ? '<a class="btn quiet" href="' + learnHref(sk, next.n) + '">' + h(next.n) + arr() + '</a>' : '') + '</nav></article>' + foot();
}
/* a YouTube class: thumbnail first, the player only loads when tapped */
function vidCard(v) {
  var mins = v.mins ? (v.mins >= 60 ? Math.floor(v.mins / 60) + " h " + (v.mins % 60) + " min" : v.mins + " min") : "";
  return '<div class="vcard reveal"><button class="vthumb" data-yt="' + h(v.id) + '" aria-label="Play ' + h(v.t) + '"><img src="https://i.ytimg.com/vi/' + h(v.id) + '/hqdefault.jpg" alt="" loading="lazy"><i aria-hidden="true"></i>' + (mins ? '<em>' + mins + '</em>' : '') + '</button>' +
    '<div class="vmeta"><b>' + h(v.t) + '</b><span>' + h(v.ch || "") + (v.lang ? ' · ' + h({ en: "English", hi: "Hindi", hinglish: "Hinglish" }[v.lang] || v.lang) : '') + '</span>' + (v.why ? '<p>' + h(v.why) + '</p>' : '') +
    '<a href="https://www.youtube.com/watch?v=' + h(v.id) + '" target="_blank" rel="noopener">Open in YouTube' + arr() + '</a></div></div>';
}
document.addEventListener("click", function (e) {
  var b = e.target.closest && e.target.closest("[data-yt]"); if (!b) return;
  var f = document.createElement("iframe");
  f.src = "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(b.dataset.yt) + "?autoplay=1&rel=0";
  f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen"; f.allowFullscreen = true; f.className = "vframe"; f.title = "Video";
  b.replaceWith(f);
});
function srcSplit(qs) {
  var by = {}; qs.forEach(function (q) { var k = q.kind === "pyq" ? "from past insurance AO papers" : q.kind === "pq" ? "from practice quizzes" : "written for this site"; by[k] = (by[k] || 0) + 1; });
  return Object.keys(by).map(function (k) { return by[k] + " " + k; }).join(", ") || "No questions yet";
}

/* ── practice ── */
function orderQs(qs) {
  var rank = { pyq: 0, own: 1, pq: 2 };
  return qs.map(function (q, i) { return [q, i]; }).sort(function (a, b) { return (rank[a[0].kind] || 3) - (rank[b[0].kind] || 3) || (b[0].y || 0) - (a[0].y || 0) || a[1] - b[1]; }).map(function (x) { return x[0]; });
}
V["practice"] = function (sk, topic) {
  if (sk && (topic || sk === "pyq" || sk === "uiic")) {
    var t = topic ? decodeURIComponent(topic) : "", qs, label;
    if (sk === "pyq") { qs = D.qs.filter(function (q) { return q.kind === "pyq" && (!t || q.s === t); }); label = "Every past insurance AO question" + (t ? ", " + secOf(t).short : ""); }
    else if (sk === "uiic") { qs = D.qs.filter(function (q) { return /UIIC/.test(q.src || "") && q.kind === "pyq" && (!t || q.s === t); }); label = "Every UIIC AO question" + (t ? ", " + secOf(t).short : ""); }
    else if (t === "*") { qs = secQs(sk); label = secOf(sk).short + ", all topics"; }
    else { qs = topicQs(sk, t); label = t; }
    qs = orderQs(qs);
    if (!qs.length) return blank("No questions here yet.");
    var host = quiz({
      qs: qs, back: "#/practice" + (sk !== "pyq" && sk !== "uiic" ? "/" + sk : ""), backLabel: sk === "pyq" || sk === "uiic" ? "Practice" : secOf(sk).short,
      head: sk !== "pyq" && sk !== "uiic" && t !== "*" && D.notes[tkey(sk, t)] ? '<a class="notes-link" href="' + learnHref(sk, t) + '">' + (learned(sk, t) ? "Notes for " : "Read ") + h(t) + ' first' + arr() + '</a>' : '<h1 class="page-h" style="font-size:clamp(24px,3vw,32px);margin:8px 0 0">' + h(label) + '</h1>',
      get: function (k) { var v = ST.prac[qs[k].id]; return v == null ? null : v; },
      set: function (k, v) { ST.prac[qs[k].id] = v; logAnswer(qs[k], v); save(); },
      startAt: function () { for (var k = 0; k < qs.length; k++) if (ST.prac[qs[k].id] == null) return k; return 0; },
      done: function () { location.hash = "#/practice" + (sk !== "pyq" && sk !== "uiic" ? "/" + sk : ""); }
    });
    setAside(host.__pads());
    return host;
  }
  if (sk) {
    var x = secOf(sk), all = statOf(secQs(sk));
    return '<section class="head"><a class="kicker" href="#/practice">&#8592; Practice</a><h1 class="page-h reveal">' + h(x.name) + '.</h1>' +
      '<p class="lede reveal">' + all.n + ' questions, ' + all.done + ' done' + (all.acc != null ? ', ' + all.acc + '% right' : '') + '. Past-paper questions come first in every topic.</p>' +
      '<div class="reveal" style="margin-top:22px"><a class="btn key" href="' + pracHref(sk, "*") + '">All ' + all.n + ' in one run' + arr() + '</a></div></section>' +
      '<div class="list" style="margin-top:8px">' + x.topics.map(function (t) {
        var s = statOf(topicQs(sk, t.n));
        return s.n ? '<a class="item reveal" href="' + pracHref(sk, t.n) + '"><span class="num">' + s.n + '</span><span><span class="t">' + h(t.n) + '</span><span class="d">' + s.done + ' of ' + s.n + ' attempted</span></span><span class="end">' + (s.acc != null ? '<b>' + s.acc + '%</b>' : '') + '</span></a>' : '';
      }).join("") + '</div>' + foot();
  }
  var npyq = D.qs.filter(function (q) { return q.kind === "pyq"; }).length;
  return '<section class="head"><span class="kicker reveal">' + D.qs.length.toLocaleString("en-IN") + ' questions · ' + npyq + ' from past insurance AO papers</span>' +
      '<h1 class="page-h reveal">Practice.</h1><p class="lede reveal">Untimed, the answer and its reason shown as soon as you pick. Wrong answers go to the error log.</p>' +
      '<div class="reveal" style="margin-top:22px;display:flex;gap:10px;flex-wrap:wrap"><a class="btn key" href="#/practice/uiic">Every UIIC question · ' + D.qs.filter(function (q) { return q.kind === "pyq" && /UIIC/.test(q.src || ""); }).length + arr() + '</a><a class="btn quiet" href="#/practice/pyq">Every past-paper question' + arr() + '</a><a class="btn quiet" href="#/errors">Error log' + arr() + '</a></div></section>' +
    [["pre", "Prelims and Mains"], ["mainsonly", "Mains only"]].map(function (pp) {
      return '<section class="band"><h2 class="sec-h reveal">' + pp[1] + '</h2><div class="tgrid" style="margin-top:18px">' + secsOf(pp[0]).map(function (x) {
        var s = statOf(secQs(x.k));
        return '<a class="tcard t-' + x.tone + ' reveal" href="#/practice/' + x.k + '"><span class="tc-top"><span class="tc-w"><b>' + s.n + '</b> questions</span>' + (s.acc != null ? '<span class="tag">' + s.acc + '%</span>' : '') + '</span>' +
          '<span class="tc-t">' + h(x.name) + '</span><span class="tc-bar"><i style="--p:' + (s.n ? Math.max(0.04, s.done / s.n) : 0) + '"></i></span><span class="tc-d">' + s.done + ' done</span></a>';
      }).join("") + '</div></section>';
    }).join("") + foot();
};

/* ── error log ── */
V["errors"] = function (run) {
  var list = errList();
  if (run) {
    if (!list.length) { location.hash = "#/errors"; return blank(); }
    var qs = list.map(function (x) { return x.q; }), local = {};
    var host = quiz({ qs: qs, back: "#/errors", backLabel: "Error log",
      get: function (k) { var v = local[qs[k].id]; return v == null ? null : v; },
      set: function (k, v) { local[qs[k].id] = v; ST.prac[qs[k].id] = v; logAnswer(qs[k], v); save(); },
      done: function () { location.hash = "#/errors"; } });
    setAside(host.__pads());
    return host;
  }
  var by = {}; list.forEach(function (x) { (by[x.q.s] = by[x.q.s] || []).push(x); });
  return '<section class="head"><span class="kicker reveal">Clears after two right in a row</span><h1 class="page-h reveal">Error log.</h1>' +
      '<p class="lede reveal">' + (list.length ? list.length + ' question' + (list.length === 1 ? '' : 's') + ' you have got wrong and not yet got right twice.' : 'Empty. Every miss from a mock or practice lands here automatically.') + '</p>' +
      (list.length ? '<div class="reveal" style="margin-top:24px"><a class="btn key" href="#/errors/run">Work through all ' + list.length + arr() + '</a></div>' : '') + '</section>' +
    D.secs.filter(function (x) { return by[x.k]; }).map(function (x) {
      return '<section class="band"><h2 class="sec-h reveal">' + h(x.short) + ' · ' + by[x.k].length + '</h2><div class="list" style="margin-top:18px">' + by[x.k].slice(0, 40).map(function (e) {
        return '<div class="item reveal" style="grid-template-columns:38px minmax(0,1fr) auto"><span class="num">' + e.e.w + '×</span><span><span class="t">' + h(e.q.q.length > 150 ? e.q.q.slice(0, 150) + '…' : e.q.q) + '</span>' +
          '<span class="d">' + h(e.q.t || "") + (e.q.src ? ' · ' + h(e.q.src) : '') + ' · answer ' + "ABCDE"[e.q.a] + ': ' + h(e.q.o[e.q.a]) + '</span></span><span class="end">' + (e.e.ok ? e.e.ok + ' of 2' : '') + '</span></div>';
      }).join("") + '</div></section>';
    }).join("") + foot();
};

/* ── mocks ── */
V["mocks"] = function () {
  var groups = {}, order = [];
  D.papers.forEach(function (p) { var g = p.group || p.year; if (!groups[g]) { groups[g] = []; order.push(g); } groups[g].push(p); });
  var hist = mockHistory();
  return '<section class="head"><span class="kicker reveal">' + D.papers.length + ' papers · ' + hist.length + ' taken</span><h1 class="page-h reveal">Mocks.</h1>' +
      '<p class="lede reveal">Full mocks in the 2026 pattern, real UIIC, NIACL and NICL AO papers recalled by candidates, and your practice sets. Mock mode runs them like the hall: each section on its own clock, Save &amp; Next, and a quarter mark off for each wrong answer.</p></section>' +
    order.map(function (g) {
      return '<section class="band"><h2 class="sec-h reveal">' + h(g) + '</h2><div class="list" style="margin-top:18px">' + groups[g].map(function (p) {
        var a = att(p.id), s = a && a.done ? paperScore(p.id) : null;
        if (p.desc) return '<a class="item reveal" href="#/mock/' + encodeURIComponent(p.id) + '/paper"><span class="num">✎</span><span><span class="t">' + h(p.label) + '</span><span class="d">Descriptive: the questions as asked, to practise writing against the clock</span></span><span class="end">' + arr() + '</span></a>';
        return '<div class="item mrow reveal' + (s ? " done" : "") + '"><a class="mr-main" href="#/mock/' + encodeURIComponent(p.id) + '"><span class="num">' + (p.kind === "P1" ? "1" : "2") + '</span>' +
          '<span><span class="t">' + h(p.label) + '</span><span class="d">' + p.qids.length + ' questions · ' + p.mins + ' min' + (a && !a.done ? ' · in progress' : '') + '</span></span>' +
          '<span class="end">' + (s ? '<b>' + fmtM(s.marks) + '</b>of ' + fmtM(s.max) : '') + '</span></a><a class="mr-key" href="#/mock/' + encodeURIComponent(p.id) + '/paper">With answers' + arr() + '</a></div>';
      }).join("") + '</div></section>';
    }).join("") + foot();
};
V["mock"] = function (pid) {
  var p = paper(pid); if (!p) return blank();
  if (p.desc) { location.hash = "#/mock/" + encodeURIComponent(pid) + "/paper"; return ""; }
  var a = att(pid), s = a && a.done ? paperScore(pid) : null;
  return '<section class="head"><a class="kicker" href="#/mocks">&#8592; All mocks</a><h1 class="page-h reveal">' + h(p.label) + '</h1>' +
    '<p class="lede reveal">' + p.qids.length + ' questions in ' + p.mins + ' minutes. ' + h(p.note || "") + '</p>' +
    (p.memo ? '<p class="memo-note reveal">Memory-based: candidates recalled these questions after the exam, so wording can differ slightly. Answers follow the published key; every question has a worked reason.</p>' : '') +
    (s ? '<p class="muted reveal" style="margin-top:14px">Last attempt: ' + fmtM(s.marks) + ' of ' + fmtM(s.max) + ', ' + s.right + ' right, ' + s.wrong + ' wrong.</p>' : '') +
    '<div class="reveal" style="display:flex;gap:10px;margin-top:26px;flex-wrap:wrap">' +
      '<a class="btn key" href="#/mock/' + encodeURIComponent(pid) + '/run">' + (a && !a.done ? "Resume mock" : "Start mock, " + p.mins + " min") + arr() + '</a>' +
      (s ? '<a class="btn quiet" href="#/mock/' + encodeURIComponent(pid) + '/review">Review answers' + arr() + '</a>' : '') +
      '<a class="btn quiet" href="#/mock/' + encodeURIComponent(pid) + '/practice">Practice, untimed' + arr() + '</a>' +
      '<a class="btn quiet" href="#/mock/' + encodeURIComponent(pid) + '/paper">Question paper with answers' + arr() + '</a></div>' +
    (a ? '<button class="btn quiet sm reveal" style="margin-top:22px" data-clear-paper="' + h(pid) + '">Clear this paper</button>' : '') + '</section>' + foot();
};
V["mockpaper"] = function (pid) {
  var p = paper(pid); if (!p) return blank();
  if (p.desc) return '<section class="head"><a class="kicker" href="#/mocks">&#8592; All mocks</a><h1 class="page-h reveal">' + h(p.label) + '</h1><p class="lede reveal">Descriptive English, 60 minutes, three questions. Write by hand or type, against the clock; then compare with the model answer points.</p></section>' +
    '<section class="band">' + p.desc.map(function (d, k) { return '<div class="note reveal" style="margin-top:16px"><h3>Question ' + (k + 1) + '</h3><p style="white-space:pre-wrap">' + h(d.q) + '</p>' + (d.tips ? '<h4 style="margin-top:12px">What a good answer covers</h4><ul class="pts">' + d.tips.map(function (x) { return '<li>' + h(x) + '</li>'; }).join("") + '</ul>' : '') + '</div>'; }).join("") + '</section>' + foot();
  var qs = paperQs(p), by = {}, ord = [], n = 0;
  qs.forEach(function (q) { if (!by[q.s]) { by[q.s] = []; ord.push(q.s); } by[q.s].push(q); });
  return '<section class="head"><a class="kicker" href="#/mock/' + encodeURIComponent(pid) + '">&#8592; ' + h(p.label) + '</a><h1 class="page-h reveal">Question paper with answers.</h1>' +
      '<p class="lede reveal">' + qs.length + ' questions, the right option marked and the reason under each.</p>' +
      '<div class="kp-act reveal"><a class="btn key" href="#/mock/' + encodeURIComponent(pid) + '/run">Take it as a mock' + arr() + '</a><a class="btn quiet" href="#/mock/' + encodeURIComponent(pid) + '/practice">Practise, answers hidden' + arr() + '</a></div>' +
      (ord.length > 1 ? '<nav class="kp-nav reveal" aria-label="Sections">' + ord.map(function (k) { return '<a href="#kp-' + k + '" data-kp="' + k + '">' + h(secOf(k).short) + ' <small>' + by[k].length + '</small></a>'; }).join("") + '</nav>' : '') + '</section>' +
    ord.map(function (k) {
      return '<section class="band kp-sec" id="kp-' + k + '"><h2 class="sec-h">' + h(secOf(k).name) + '</h2>' + by[k].map(function (q) {
        n++;
        return '<article class="kp-q"><div class="qbar"><span class="c">Q' + n + (q.t ? ' · ' + h(q.t) : '') + '</span></div>' + (q.dir ? '<div class="brief"><span class="t">Directions</span><p>' + h(q.dir).replace(/\n/g, "<br>") + '</p></div>' : '') +
          '<div class="qstem">' + stemHTML(q) + '</div><div class="opts kp-o">' + q.o.map(function (o, j) {
            return '<div class="opt' + (j === q.a ? ' ok' : '') + '"><em>' + "ABCDE"[j] + '</em><span>' + optHTML(o) + '</span>' + (j === q.a ? '<b class="mk ok" aria-label="Correct answer">✓</b>' : '') + '</div>'; }).join("") + '</div>' +
          '<div class="why ok"><span class="t">Answer ' + "ABCDE"[q.a] + '</span><p>' + (q.e ? h(q.e).replace(/\n/g, "<br>") : optHTML(q.o[q.a])) + '</p></div></article>';
      }).join("") + '</section>';
    }).join("") + foot();
};
document.addEventListener("click", function (e) {
  var a = e.target.closest && e.target.closest("[data-kp]"); if (!a) return;
  e.preventDefault(); var t = document.getElementById("kp-" + a.dataset.kp); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
});
/* Separately timed sections, as the UIIC notice says: each section has its own clock and
   locks once submitted or out of time. Time runs on while the page is closed; a mock left
   for over two hours is treated as abandoned. */
function secMins(p, k) { var s = secOf(k), x = p.kind === "MAINS" ? s.mains : s.pre; var n = paperQs(p).filter(function (q) { return q.s === k; }).length; return x ? Math.max(5, Math.round(x[2] * n / x[0])) : Math.max(5, Math.round(n * 0.6)); }
V["mockrun"] = function (pid) {
  var p = paper(pid); if (!p) return blank();
  var all = paperQs(p), S = p.secs && p.secs.length ? p.secs : [all[0].s], a = ST.att[pid];
  if (!a || a.done || a.sec == null) { a = ST.att[pid] = { ans: {}, done: false, ts: Date.now(), sec: 0, end: 0 }; save(); }
  if (a.end && Date.now() - a.end > 2 * 36e5) a.end = 0;
  while (a.end && a.end <= Date.now() && a.sec < S.length) { var ended = a.end; a.sec++; a.i = 0; a.end = a.sec < S.length ? ended + secMins(p, S[a.sec]) * 60000 : 0; }
  function finish() { a.done = true; a.ts = Date.now(); all.forEach(function (q) { logAnswer(q, a.ans[q.id]); }); lsSet("uc-state", JSON.stringify(ST)); location.hash = "#/mock/" + encodeURIComponent(pid) + "/result"; }
  if (a.sec >= S.length) { setTimeout(finish, 0); return '<div class="blank"><b>Time is up</b><p>Scoring your paper.</p></div>'; }
  var k = S[a.sec], qs = all.filter(function (q) { return q.s === k; });
  if (!a.end) a.end = Date.now() + secMins(p, k) * 60000;
  a.mk = a.mk || {}; a.vis = a.vis || {}; a.tq = a.tq || {}; save();
  var last = a.sec >= S.length - 1;
  return examHall({
    qs: qs, kind: p.kind, title: p.label, sub: "UIIC AO · " + ({ PRE: "Prelims", MAINS: "Mains" }[p.kind] || "Practice set") + " · " + secOf(k).name + ", " + secMins(p, k) + " min", exit: "#/mock/" + encodeURIComponent(pid),
    secTabs: S.length > 1 ? S.map(function (x, j) { return { short: secOf(x).short, st: j < a.sec ? "gone" : j === a.sec ? "on" : "next" }; }) : null,
    finLabel: last ? "Submit paper" : "Submit " + secOf(k).short,
    lockNote: last ? "This ends the paper and scores it, with a quarter of the marks taken off for each wrong answer." : "Once submitted you cannot come back to " + secOf(k).short + ". The next section starts its own clock.",
    get: function (j) { var v = a.ans[qs[j].id]; return v == null ? null : v; },
    set: function (j, v) { if (v == null) delete a.ans[qs[j].id]; else a.ans[qs[j].id] = v; save(); },
    getMark: function (j) { return !!a.mk[qs[j].id]; }, setMark: function (j, b) { if (b) a.mk[qs[j].id] = 1; else delete a.mk[qs[j].id]; save(); },
    visited: function (j) { return !!a.vis[qs[j].id]; }, markVisited: function (j) { if (!a.vis[qs[j].id]) { a.vis[qs[j].id] = 1; save(); } },
    timeOn: function (j) { return a.tq[qs[j].id] || 0; }, addTime: function (j, ms) { a.tq[qs[j].id] = (a.tq[qs[j].id] || 0) + ms; },
    startAt: function () { return a.i || 0; }, onMove: function (j) { a.i = j; save(); },
    deadline: function () { return a.end; },
    submit: function () { if (last) return finish(); a.sec++; a.end = 0; a.i = 0; lsSet("uc-state", JSON.stringify(ST)); setTimeout(route, 0); }
  });
};
V["mockresult"] = function (pid) {
  var p = paper(pid), s = paperScore(pid); if (!p || !s) return blank();
  var ord = []; paperQs(p).forEach(function (q) { if (ord.indexOf(q.s) < 0) ord.push(q.s); });
  return '<section class="head"><a class="kicker" href="#/mocks">&#8592; All mocks</a><h1 class="page-h reveal">' + fmtM(s.marks) + ' of ' + fmtM(s.max) + '</h1>' +
    '<p class="lede reveal">' + s.right + ' right, ' + s.wrong + ' wrong, ' + (s.total - s.done) + ' left blank. Wrong answers cost ' +
      (s.wrong ? fmtM(Object.keys(s.bySec).reduce(function (x, k) { var b = s.bySec[k]; return x + b.wrong * (b.max / b.total) / 4; }, 0)) + ' marks.' : 'nothing.') + '</p></section>' +
    '<div class="stats reveal">' + ord.map(function (k) { var b = s.bySec[k];
      return '<div class="stat"><div class="k">' + h(secOf(k).short) + '</div><div class="v">' + fmtM(b.marks) + '<small> / ' + fmtM(b.max) + '</small></div><div class="s">' + b.right + ' right · ' + b.wrong + ' wrong · ' + (b.total - b.done) + ' blank</div></div>'; }).join("") + '</div>' +
    '<div class="reveal" style="display:flex;gap:10px;margin-top:28px;flex-wrap:wrap"><a class="btn key" href="#/mock/' + encodeURIComponent(pid) + '/review">Review every answer' + arr() + '</a><a class="btn quiet" href="#/errors">Error log' + arr() + '</a><a class="btn quiet" href="#/progress">Progress' + arr() + '</a></div>' + foot();
};
V["mockreview"] = function (pid, practice) {
  var p = paper(pid); if (!p) return blank();
  var qs = paperQs(p), host;
  if (practice) host = quiz({ qs: qs, back: "#/mock/" + encodeURIComponent(pid), backLabel: p.label,
    get: function (k) { var v = ST.prac[qs[k].id]; return v == null ? null : v; },
    set: function (k, v) { ST.prac[qs[k].id] = v; logAnswer(qs[k], v); save(); },
    done: function () { location.hash = "#/mock/" + encodeURIComponent(pid); } });
  else { var a = att(pid) || { ans: {} }; host = quiz({ qs: qs, back: "#/mock/" + encodeURIComponent(pid) + "/result", backLabel: "Result",
    get: function (k) { var v = a.ans[qs[k].id]; return v == null ? null : v; }, set: function () {}, locked: true,
    done: function () { location.hash = "#/mock/" + encodeURIComponent(pid) + "/result"; } }); }
  setAside(host.__pads());
  return host;
};

/* ── exam pattern and syllabus: everything from the official notice on one page ── */
function tbl(cols, rows, cls) {
  return '<div class="nb nb-tab' + (cls ? ' ' + cls : '') + '"><div class="nt-scroll"><table><thead><tr>' + cols.map(function (c) { return '<th>' + c + '</th>'; }).join("") + '</tr></thead><tbody>' +
    rows.map(function (r) { return '<tr>' + r.map(function (c, i) { return i ? '<td>' + c + '</td>' : '<th scope="row">' + c + '</th>'; }).join("") + '</tr>'; }).join("") + '</tbody></table></div></div>';
}
V["exam"] = function () {
  function chips(x) { return '<div class="ex-chips">' + x.topics.map(function (t) { return '<a href="' + learnHref(x.k, t.n) + '">' + h(t.n) + '</a>'; }).join("") + '</div>'; }
  var PRE = secsOf("pre"), MN = D.secs.filter(function (s) { return s.mains; });
  return '<section class="head"><span class="kicker reveal">UIIC Administrative Officer (Scale I) · Generalist · 2026</span>' +
      '<h1 class="page-h reveal">Exam pattern and syllabus.</h1>' +
      '<p class="lede reveal">Everything from the official notice (Ref HO:HRM:REC:AO:1:2026, 7 September 2026) on one page: the two exams, every section and its clock, the marking, how selection works, and the syllabus with a link to the notes and videos for each topic.</p>' +
      '<div class="ld-nav reveal">' + [["ex-dates", "Dates"], ["ex-sel", "Selection"], ["ex-pre", "Prelims"], ["ex-mains", "Mains"], ["ex-rules", "Marking rules"], ["ex-syl", "Syllabus"], ["ex-desc", "Descriptive"], ["ex-post", "Posts and eligibility"]].map(function (x) { return '<a href="#' + x[0] + '" data-jump="' + x[0] + '">' + x[1] + '</a>'; }).join("") + '<button class="btn quiet sm" data-print>Print</button></div></section>' +
    '<section class="band" id="ex-dates"><h2 class="sec-h reveal">Dates</h2>' + tbl(["Stage", "Date"], [
      ["Registration and fee", "Closed 28 September 2026"], ["<b>Tier I: Prelims</b>", "<b>Thursday 22 October 2026</b> (reporting time is on your call letter)"], ["Tier II: Mains", "30 November 2026 (tentative)"], ["Interview", "For those who clear Mains and the descriptive test"]]) + '</section>' +
    '<section class="band" id="ex-sel"><h2 class="sec-h reveal">How you are selected</h2>' +
      '<div class="stats reveal" style="margin-top:18px"><div class="stat"><div class="k">Prelims</div><div class="v">Screening</div><div class="s">100 marks. Clear every section and the overall cut-off; the marks are not counted later.</div></div>' +
        '<div class="stat"><div class="k">Mains objective</div><div class="v">75%</div><div class="s">250 marks in five separately timed sections. This is the score that matters.</div></div>' +
        '<div class="stat"><div class="k">Descriptive</div><div class="v">Qualifying</div><div class="s">Letter and essay, 30 marks. Must be cleared; not added to merit.</div></div>' +
        '<div class="stat"><div class="k">Interview</div><div class="v">25%</div><div class="s">Final merit is Mains objective 75 : interview 25.</div></div></div></section>' +
    '<section class="band" id="ex-pre"><h2 class="sec-h reveal">Tier I: Prelims · 22 October 2026</h2>' +
      tbl(["Section", "Questions", "Marks", "Time"], PRE.map(function (s) { return [s.name, String(s.pre[0]), String(s.pre[1]), s.pre[2] + " min"]; }).concat([["<b>Total</b>", "<b>100</b>", "<b>100</b>", "<b>60 min</b>"]])) +
      '<p class="muted reveal" style="margin-top:10px">Each section has its own 20-minute clock: time does not carry over and you cannot go back. Sections may come in any order. English is set in English; the others in English and Hindi.</p></section>' +
    '<section class="band" id="ex-mains"><h2 class="sec-h reveal">Tier II: Mains · 30 November 2026</h2>' +
      tbl(["Section", "Questions", "Marks", "Time", "Right / wrong"], MN.map(function (s) { return [s.name, String(s.mains[0]), String(s.mains[1]), s.mains[2] + " min", "+" + fmtM(s.mains[1] / s.mains[0]) + " / −" + fmtM(s.mains[1] / s.mains[0] / 4)]; })
        .concat([["<b>Total objective</b>", "<b>200</b>", "<b>250</b>", "<b>150 min</b>", ""], ["Descriptive, typed: letter 10 + essay 20", "2", "30", "30 min", "straight after the objective test"]])) + '</section>' +
    '<section class="band" id="ex-rules"><h2 class="sec-h reveal">Marking and cut-off rules</h2><div class="note reveal" style="margin-top:16px"><ul class="pts">' +
      ["Prelims: 1 mark a question. A wrong answer loses a quarter of the question's marks (0.25); a blank loses nothing. The same quarter penalty applies in Mains.", 'There is a cut-off in <b>every section</b> and an overall cut-off in each category, in Prelims and again in Mains. One weak section can stop you, so never neglect a section.',
       'Scores are equated across shifts to adjust for small differences in difficulty.', 'The descriptive answers are evaluated only for candidates who clear the Mains objective cut-offs.',
       'Final merit: Mains objective marks and interview marks in the ratio 75:25. Prelims and descriptive marks are not added.', 'Answer patterns are compared across candidates; copied responses lead to cancellation.'].map(function (x) { return '<li>' + x + '</li>'; }).join("") + '</ul></div></section>' +
    '<section class="band" id="ex-syl"><h2 class="sec-h reveal">Syllabus, section by section</h2>' +
      '<p class="muted reveal" style="margin-top:10px">The notice names the sections; these are the question types UIIC, NIACL and NICL AO papers set, the ones our notes cover. Tap a topic to open its notes and videos.</p>' +
      D.secs.filter(function (x) { return x.k !== "D"; }).map(function (x) {
        return '<div class="note ex-syl reveal t-' + x.tone + '"><div class="ex-sh"><h3>' + h(x.name) + '</h3><span class="tag' + (x.pre ? ' key' : '') + '">' + (x.pre ? 'Prelims ' + x.pre[0] + ' · Mains ' + x.mains[0] : 'Mains ' + x.mains[0] + ' questions') + '</span></div>' +
          (x.official ? '<p class="ex-off">' + h(x.official) + '</p>' : '') + chips(x) + '<a class="ex-go" href="#/practice/' + x.k + '">Practise ' + secQs(x.k).length + ' questions' + arr() + '</a></div>'; }).join("") + '</section>' +
    '<section class="band" id="ex-desc"><h2 class="sec-h reveal">Descriptive English</h2><div class="note reveal" style="margin-top:16px"><ul class="pts">' +
      '<li>Typed on the computer straight after the Mains objective test: a letter (10 marks) and an essay (20 marks) in 30 minutes.</li><li>It must be cleared, but it is not added to the final merit.</li></ul>' +
      '<a class="ex-go" href="#/learn/D">Letter and essay notes' + arr() + '</a></div></section>' +
    '<section class="band" id="ex-post"><h2 class="sec-h reveal">Posts and eligibility</h2>' +
      tbl(["", "Generalist"], [["Vacancies", "200 (provisional), mostly in the Western and Southern zones"], ["Qualification", "A degree or post-graduate degree in any discipline with at least 60% (55% for SC, ST and PwBD), completed by 30 June 2026"],
        ["Age", "21 to 30 as on 30 June 2026 (SC and ST +5, OBC +3, PwBD +10)"], ["Penalty", "One quarter of the marks for each wrong answer, Prelims and Mains"], ["Final merit", "Mains objective 75 : interview 25"]]) +
      '<p class="muted reveal" style="margin-top:10px">Source: UIIC notice for Administrative Officers (Scale I), Generalists and Hindi Officers, 2026. Check your call letter for the reporting time, documents and venue.</p></section>' + foot();
};

/* ── videos: strategy, insurance, current affairs, and every topic's classes ── */
V["videos"] = function () {
  var VD = D.videos || {}, n = Object.keys(VD).reduce(function (a, k) { return a + VD[k].length; }, 0);
  function band(id, title, sub, list) { return list && list.length ? '<section class="band" id="' + id + '"><h2 class="sec-h reveal">' + h(title) + '</h2>' + (sub ? '<p class="muted reveal" style="margin-top:8px">' + h(sub) + '</p>' : '') + '<div class="vgrid">' + list.map(vidCard).join("") + '</div></section>' : ''; }
  return '<section class="head"><span class="kicker reveal">' + n + ' classes, each checked to be live</span><h1 class="page-h reveal">Videos.</h1>' +
      '<p class="lede reveal">The best free classes we found for every topic, best first. Tap one to play it here. Each topic page also has its own classes under Watch.</p>' +
      '<div class="ld-nav reveal">' + [["v-strat", "Strategy"], ["v-ins", "Insurance"], ["v-ca", "Current affairs"]].concat(D.secs.map(function (x) { return ["v-" + x.k, x.short]; })).map(function (x) { return '<a href="#' + x[0] + '" data-jump="' + x[0] + '">' + h(x[1]) + '</a>'; }).join("") + '</div></section>' +
    band("v-strat", "Strategy and exam analysis", "UIIC AO 2026 pattern, and what NIACL, NICL and UIIC papers asked.", VD._strategy) +
    band("v-ins", "Insurance awareness", "For Mains GA: insurance basics, IRDAI and the 2026 insurance news.", VD._insurance) +
    band("v-ca", "Current affairs, month by month", "For Mains GA: April to October 2026.", VD._ca) +
    D.secs.map(function (x) {
      var rows = x.topics.map(function (t) { var L = VD[tkey(x.k, t.n)] || []; return L.length ? '<h3 class="reveal" style="margin:22px 0 0"><a href="' + learnHref(x.k, t.n) + '" style="color:inherit;text-decoration:none">' + h(t.n) + ' ' + arr() + '</a></h3><div class="vgrid">' + L.slice(0, 2).map(vidCard).join("") + '</div>' : ''; }).join("");
      return rows ? '<section class="band" id="v-' + x.k + '"><h2 class="sec-h reveal">' + h(x.name) + '</h2><p class="muted reveal" style="margin-top:8px">The top two classes per topic; the topic page has the rest.</p>' + rows + '</section>' : '';
    }).join("") + foot();
};

/* ── last-day sheet ── */
V["lastday"] = function () {
  var L = D.lastday; if (!L) return blank("The last-day sheet is being written.");
  return '<section class="head"><span class="kicker reveal">' + h(L.kicker || "Final revision") + '</span><h1 class="page-h reveal">The last-day sheet.</h1><p class="lede reveal">' + h(L.lede || "") + '</p>' +
      '<div class="ld-nav reveal">' + L.parts.map(function (x, i) { return '<a href="#ld-' + i + '" data-jump="ld-' + i + '">' + h(x.t) + '</a>'; }).join("") + '<button class="btn quiet sm" data-print>Print</button></div></section>' +
    L.parts.map(function (x, i) {
      return '<section class="band" id="ld-' + i + '"><h2 class="sec-h reveal">' + h(x.t) + '</h2>' + (x.blocks || []).map(nb).join("") + '</section>';
    }).join("") + foot();
};

/* ── progress ── */
V["progress"] = function () {
  var hist = mockHistory();
  return '<section class="head"><h1 class="page-h reveal">Progress.</h1><p class="lede reveal">Mock scores in the order you sat them, and accuracy by subject.</p></section>' +
    '<section class="band"><h2 class="sec-h reveal">Mocks</h2><div class="list" style="margin-top:18px">' + (hist.length ? hist.map(function (x, i) {
      return '<a class="item reveal" href="#/mock/' + encodeURIComponent(x.p.id) + '/result"><span class="num">' + (i + 1) + '</span><span><span class="t">' + h(x.p.label) + '</span><span class="d">' + new Date(x.a.ts).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) + ' · ' + x.s.right + ' right, ' + x.s.wrong + ' wrong</span></span><span class="end"><b>' + fmtM(x.s.marks) + '</b>of ' + fmtM(x.s.max) + '</span></a>';
    }).join("") : '<p class="muted">No mock taken yet.</p>') + '</div></section>' +
    '<section class="band"><h2 class="sec-h reveal">By subject</h2><div class="list" style="margin-top:18px">' + D.secs.map(function (x) {
      var s = statOf(secQs(x.k));
      return '<a class="item reveal" href="#/practice/' + x.k + '"><span class="num">' + (s.acc == null ? '·' : s.acc) + '</span><span><span class="t">' + h(x.name) + '</span><span class="d">' + s.done + ' of ' + s.n + ' answered</span></span><span class="end">' + (s.acc != null ? s.acc + '%' : '') + '</span></a>';
    }).join("") + '</div></section>' +
    '<section class="band"><h2 class="sec-h reveal">This browser</h2><p class="muted reveal" style="margin-top:12px">Your progress is saved on this device only.</p><button class="btn quiet sm reveal" id="wipe" style="margin-top:14px">Erase my progress</button></section>' + foot();
};

/* ── more ── */
V["more"] = function () {
  var L = [["#/exam", "Exam pattern and syllabus", "Every paper, the marking, selection and the full syllabus"], ["#/plan", "The plan", "Day by day to Prelims on 22 October"], ["#/videos", "Videos", "The best classes for every topic, plus strategy, insurance and current affairs"], ["#/lastday", "Last-day sheet", "Every topic on one page"], ["#/errors", "Error log", (errList().length || "No") + " questions to clear"],
    ["#/practice/pyq", "Every past-paper question", "UIIC, NIACL and NICL AO, with reasons"], ["#/progress", "Progress", "Mock scores and accuracy by subject"], ["#/sources", "Sources", "Where the notes and facts come from"]];
  return '<section class="head"><h1 class="page-h reveal">More.</h1></section><div class="list reveal">' + L.map(function (x) {
    return '<a class="item" href="' + x[0] + '" style="grid-template-columns:minmax(0,1fr) auto;align-items:center"><span><span class="t">' + h(x[1]) + '</span><span class="d">' + h(x[2]) + '</span></span><span class="end">' + arr() + '</span></a>';
  }).join("") + '</div>' + foot();
};
V["sources"] = function () {
  var S = D.sources || [];
  return '<section class="head"><h1 class="page-h reveal">Sources.</h1><p class="lede reveal">The notes are written for this site in plain English from the official syllabus and the sources below. Figures carry their "as on" date; check uiic.co.in, irdai.gov.in and rbi.org.in for anything that changes after it.</p></section>' +
    '<div class="list reveal">' + S.map(function (x) { return '<a class="item" href="' + h(x.url) + '" target="_blank" rel="noopener" style="grid-template-columns:minmax(0,1fr) auto"><span><span class="t">' + h(x.t) + '</span><span class="d">' + h(x.d || x.url) + '</span></span><span class="end">' + arr() + '</span></a>'; }).join("") + '</div>' + foot();
};

/* ── gate: no key in this browser ── */
function gate(msg) {
  return '<div class="blank" style="max-width:520px;margin:12vh auto 0;text-align:left"><b>' + BRAND + '</b><p>' + (msg === "badkey" ? 'This link\'s key does not open the current data. Open the latest private link again.' :
    msg === "nokey" ? 'This study copy opens from its private link. Open the link you were sent once on this device and it will be remembered.' : h(msg)) + '</p></div>';
}

/* ── router ── */
var main = document.getElementById("main"), asideEl = document.getElementById("aside"), shell = document.getElementById("shell");
var asideHTML = "";
function setAside(x) { asideHTML = x || ""; }
function readScale() { return Math.max(0.9, Math.min(1.5, parseFloat(lsGet("uc-rs", 1)) || 1)); }
function setReadScale(v) { v = Math.round(Math.max(0.9, Math.min(1.5, v)) * 10) / 10; document.documentElement.style.setProperty("--rs", v); lsSet("uc-rs", v); }
document.documentElement.style.setProperty("--rs", readScale());
window.addEventListener("scroll", function () { var p = el("#tprog"); if (!p) return; var d = document.documentElement, max = d.scrollHeight - innerHeight; p.style.transform = "scaleX(" + (max > 0 ? Math.min(1, scrollY / max) : 0) + ")"; }, { passive: true });

function route() {
  if (!D) return;
  setAside(""); document.body.classList.remove("examining");
  var p = (location.hash || "#/").replace(/^#\/?/, "").split(/[?#]/)[0].split("/").filter(Boolean);
  var key = "", args = [];
  if (!p.length) key = "";
  else if (p[0] === "mock" && p[1]) {
    var id = decodeURIComponent(p[1]);
    key = { run: "mockrun", result: "mockresult", review: "mockreview", practice: "mockreview", paper: "mockpaper" }[p[2]] || "mock";
    args = [id, p[2] === "practice"];
  }
  else if (p[0] === "practice") { key = "practice"; args = [p[1], p[2]]; }
  else if (p[0] === "learn") { key = "learn"; args = [p[1], p[2]]; }
  else if (p[0] === "errors") { key = "errors"; args = [p[1] === "run"]; }
  else if (V[p[0]]) key = p[0];
  else key = "404";
  var TITLES = { "": "Home", plan: "The plan", learn: "Learn", practice: "Practice", errors: "Error log", mocks: "Mocks", mock: "Mock", mockrun: "Mock in progress", mockresult: "Mock result", mockreview: "Mock review", mockpaper: "Question paper with answers", exam: "Exam pattern and syllabus", lastday: "Last-day sheet", videos: "Videos", progress: "Progress", more: "More", sources: "Sources" };
  document.title = (TITLES[key] ? TITLES[key] + " · " : "") + BRAND;
  var out;
  try { out = V[key] ? V[key].apply(null, args) : blank(); } catch (err) { console.error(err); out = blank("Something went wrong drawing this page."); }
  var top = el(".top"), boot = document.getElementById("boot");
  if (boot) boot.remove();
  main.innerHTML = ""; if (top) main.appendChild(top);
  if (typeof out === "string") { var d = document.createElement("div"); d.innerHTML = out; while (d.firstChild) main.appendChild(d.firstChild); } else main.appendChild(out);
  asideEl.innerHTML = asideHTML; shell.classList.toggle("has-aside", !!asideHTML);
  if (typeof out !== "string" && out.__drawPads) out.__drawPads();
  var r = p[0] === "mock" ? "mocks" : (p[0] || "");
  els("[data-r]").forEach(function (a) { a.classList.toggle("on", a.dataset.r === r); });
  if (key !== "learn") learnSec = "";
  var studying = key === "learn" && args[1];
  document.body.classList.toggle("studying", !!studying);
  el("#railDays").textContent = daysTo(EXAM);
  var ne = el("#nErr"); if (ne) ne.textContent = errList().length || "";
  countUp(main); wire();
  if (!/run|practice\/|errors\/run|review/.test(location.hash)) window.scrollTo(0, 0);
}
function wire() {
  wireNotes();
  els("[data-plan]").forEach(function (b) { b.addEventListener("change", function () {
    ST.plan[b.dataset.plan] = b.checked; save();
    var ids = []; (D.plan || []).forEach(function (s) { s.tasks.forEach(function (t, k) { ids.push(s.date + "t" + k); }); });
    var done = ids.filter(function (k) { return ST.plan[k]; }).length, k = el(".head .kicker"), t = el(".head .track i");
    if (k) k.textContent = done + " of " + ids.length + " done"; if (t) t.style.setProperty("--p", pc(done, ids.length) / 100);
  }); });
  els("[data-clear-paper]").forEach(function (b) { b.addEventListener("click", function () { if (!confirm("Clear your answers for this paper?")) return; delete ST.att[b.dataset.clearPaper]; save(); route(); }); });
  els("[data-learn]").forEach(function (b) { b.addEventListener("change", function () { if (b.checked) ST.learn[b.dataset.learn] = Date.now(); else delete ST.learn[b.dataset.learn]; save(); }); });
  els("[data-jump]").forEach(function (a) { if (a.tagName !== "A") return; a.addEventListener("click", function (e) { e.preventDefault(); var t = document.getElementById(a.dataset.jump); if (t) t.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" }); }); });
  var tq = el("#tq");
  if (tq) {
    tq.addEventListener("input", applyFinder);
    els("[data-fsec]").forEach(function (b) { b.addEventListener("click", function () {
      learnSec = (b.classList.contains("stile") && learnSec === b.dataset.fsec) ? "" : b.dataset.fsec;
      els("[data-fsec]").forEach(function (c) { c.classList.toggle("on", c.dataset.fsec === learnSec && !(c.classList.contains("stile") && !learnSec)); });
      applyFinder();
      if (b.classList.contains("stile")) { var f = el("#finder"); if (f) f.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" }); }
    }); });
    applyFinder();
  }
  els("[data-rs]").forEach(function (b) { b.addEventListener("click", function () {
    if (b.dataset.rs === "cycle") { var r = readScale(); setReadScale(r >= 1.3 ? 0.9 : r < 1 ? 1 : r < 1.15 ? 1.15 : 1.3); } else setReadScale(readScale() + (+b.dataset.rs) * 0.1);
  }); });
  var w = el("#wipe"); if (w) w.addEventListener("click", function () { if (!confirm("Erase every answer, mock and ticked task in this browser? This cannot be undone.")) return; ST = fresh(); lsSet("uc-state", JSON.stringify(ST)); route(); });
}

/* ── rail and theme ── */
(function () {
  var b = document.getElementById("railToggle");
  function set(mini) { document.body.classList.toggle("rail-mini", mini); if (b) { b.setAttribute("aria-expanded", String(!mini)); b.setAttribute("aria-label", mini ? "Expand sidebar" : "Collapse sidebar"); } lsSet("uc-rail", mini ? "mini" : ""); }
  set(lsGet("uc-rail", "") === "mini");
  if (b) b.addEventListener("click", function () { set(!document.body.classList.contains("rail-mini")); });
  var t = lsGet("uc-theme", ""); if (t) document.documentElement.setAttribute("data-theme", t);
  function toggle() {
    var cur = document.documentElement.getAttribute("data-theme"), dark = cur ? cur === "dark" : matchMedia("(prefers-color-scheme:dark)").matches, next = dark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next); lsSet("uc-theme", next);
  }
  ["theme", "theme2"].forEach(function (id) { var x = document.getElementById(id); if (x) x.addEventListener("click", toggle); });
})();

window.addEventListener("hashchange", function () { if (/key=/.test(location.hash)) { start(); return; } route(); });
function start() {
  loadData().then(route).catch(function (e) {
    var boot = document.getElementById("boot"); if (boot) boot.remove();
    if (e.message === "badkey") { try { localStorage.removeItem("uc-key"); } catch (x) {} }
    main.innerHTML = gate(e.message);
  });
}
start();
})();
