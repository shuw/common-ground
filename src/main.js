import * as THREE from 'three';
import { GroundCamera } from './camera.js';
import { place, EXTENT, RELIEF } from './space.js';
import { TerrainLayer } from './layers/terrain.js';
import { VersesLayer } from './layers/verses.js';
import { ThreadsLayer } from './layers/threads.js';
import { Search } from './search.js';

const base = import.meta.env.BASE_URL;
const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(pixelRatio);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f1316);
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
const controls = new GroundCamera(camera, canvas, { extent: EXTENT, minDistance: 1.2, maxDistance: EXTENT * 2.2 });

const terrain = new TerrainLayer(), verses = new VersesLayer(), threads = new ThreadsLayer();
let corpus = null, layout = null, kin = null, textIds = [], textColours = [], regions = null, search = null, refIndex = new Map();

let sized = false;
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  threads.resize(w, h, pixelRatio);
  // home is the distance at which the whole ground fits the width of the screen; a tall screen sits further back
  const fit = Math.max(EXTENT * 1.275, (EXTENT * 0.55) / (Math.tan(camera.fov / 2 * Math.PI / 180) * camera.aspect));
  controls.setHome(fit, !sized); sized = true;
}
window.addEventListener('resize', resize);
resize();

// Keys: arrows slide the ground, + and - zoom, z resets the view; o flips the order; space plays and pauses the reading.
const resetBtn = $('reset');
resetBtn.addEventListener('click', () => controls.goHome());
const help = $('help'), helpBtn = $('help-btn');
function showHelp(on) { help.hidden = !on; helpBtn.setAttribute('aria-expanded', on); if (on) { card.hidden = true; about.hidden = true; aboutBtn.setAttribute('aria-expanded', false); } }
helpBtn.addEventListener('click', () => showHelp(help.hidden));
document.addEventListener('keydown', (ev) => {
  if (ev.metaKey || ev.ctrlKey || ev.altKey || ev.target === qInput) return;
  if (ev.key === '?') showHelp(help.hidden);
  else if (ev.key === '/') { qInput.focus(); qInput.select(); ev.preventDefault(); }
  else if (ev.key === 'Escape') { if (guideOn) showGuide(false); else if (!help.hidden) showHelp(false); else if (!about.hidden) showAbout(false); else if (query) clearSearch(); else if (shown >= 0) letGo(); }
  const cx = canvas.clientWidth / 2, cy = canvas.clientHeight / 2, step = controls.goalDistance * 0.12;
  const pan = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[ev.key];
  if (pan) { controls.panBy(...pan); ev.preventDefault(); }
  else if (ev.key === '+' || ev.key === '=') controls.zoomAt(0.7, cx, cy);
  else if (ev.key === '-' || ev.key === '_') controls.zoomAt(1 / 0.7, cx, cy);
  else if (ev.key === 'z') controls.goHome();
});

// Reading: the nearest verse to the pointer, found by projecting the points (a few tens of thousands: fine on a move, not every frame).
const _p = new THREE.Vector3();
let screen = null, screenKey = ''; // every verse's place on screen, refreshed only when the view or the flight moves
function projectAll() {
  const w = canvas.clientWidth, h = canvas.clientHeight, n = verses.meaning.length / 3;
  const key = `${camera.matrixWorldInverse.elements.join(',')}|${order.value}|${w}x${h}`;
  if (key === screenKey) return; screenKey = key;
  if (!screen || screen.length !== n * 3) screen = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    verses.positionOf(i, _p).project(camera);
    screen[i * 3] = (_p.x + 1) / 2 * w; screen[i * 3 + 1] = (1 - _p.y) / 2 * h; screen[i * 3 + 2] = _p.z;
  }
}
function nearestVerse(sx, sy, px = 8) {
  if (!verses.meaning) return -1;
  projectAll();
  const n = screen.length / 3;
  let best = -1, bd = px * px;
  for (let i = 0; i < n; i++) {
    if (screen[i * 3 + 2] > 1 || !verses.isLit(i)) continue;
    const dx = screen[i * 3] - sx, dy = screen[i * 3 + 1] - sy, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
const card = $('card');
const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** The nearest verse in each other text, in text order, or -1 for the verse's own text. */
function kinOf(i) { return textIds.map((t, k) => (t === corpus.verses[i][0] ? -1 : kin.idx[i * 7 + k])); }
function showVerse(i) {
  if (i === shown && !card.hidden) return; // already up: nothing to redraw, nothing to replay
  const [t, ref, text] = corpus.verses[i], info = corpus.texts[t];
  card.style.setProperty('--c', info.colour);
  card.querySelector('.who').textContent = `${info.name} · ${ref}`;
  card.querySelector('.verse').textContent = text;
  card.querySelector('.tr').innerHTML = `${esc(info.translation)} · kinship ${(verses.kin[i] * 100).toFixed(0)}% · <a href="${info.url}" target="_blank" rel="noopener">source ↗</a> · <button class="link" type="button" title="Copy a link to this verse">copy link</button>`;
  const prev = i > 0 && corpus.verses[i - 1][0] === t ? i - 1 : -1, next = i + 1 < corpus.verses.length && corpus.verses[i + 1][0] === t ? i + 1 : -1;
  const around = `<div class="around">${prev >= 0 ? `<button data-verse="${prev}">‹ ${esc(corpus.verses[prev][1])}</button>` : '<span></span>'}${next >= 0 ? `<button data-verse="${next}">${esc(corpus.verses[next][1])} ›</button>` : ''}</div>`;
  let n = 0; // each kin card arrives as its thread lands: the n-th thread reaches at 200 ms + 10 ms per step
  const kins = kinOf(i).map((j, k) => j < 0 ? '' : `<div class="k" style="--c:${corpus.texts[textIds[k]].colour}; --n:${n++}"><button data-verse="${j}"><b>${corpus.texts[textIds[k]].name.includes(corpus.verses[j][1].split(' ')[0]) ? '' : esc(corpus.texts[textIds[k]].name) + ' · '}${esc(corpus.verses[j][1])}</b><span>${esc(corpus.verses[j][2])}</span></button></div>`).join('');
  card.querySelector('.more').innerHTML = around;
  card.querySelector('.kins').innerHTML = kins;
  const wasHidden = card.hidden;
  card.hidden = !(help.hidden && about.hidden);
  if (i !== shown) { const fresh = wasHidden || shown < 0; shown = i; shownAt = performance.now() / 1000; card.classList.remove('enter', 'fresh'); void card.offsetWidth; card.classList.add('enter'); if (fresh) card.classList.add('fresh'); syncHash(); }
}
let shown = -1, shownAt = 0; // the verse the card and threads are about, and when it arrived
let last = { i: -1, at: 0, left: 0 }; // the verse whose threads are still receding
let candidate = { i: -1, since: 0 }; // the verse under the pointer, waiting a moment to be sure
function hold(i) { held = true; showVerse(i); }
card.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-verse]'); if (b) return step(+b.dataset.verse);
  const l = e.target.closest('.link');
  if (l) { try { await navigator.clipboard.writeText(location.href); l.textContent = 'copied'; } catch { l.textContent = location.href; } }
});
function letGo() { held = false; shown = -1; walk.length = 0; card.hidden = true; threads.hide(); syncHash(); }

// The URL hash carries the moment: #reading for the order, v=<reference> for the verse in hand.
function syncHash() {
  const parts = [];
  if (order.target === 0) parts.push('reading');
  if (shown >= 0) parts.push('v=' + encodeURIComponent(corpus.verses[shown][1]));
  if (walk.length > 1) parts.push('w=' + walk.slice(-24).map((i) => encodeURIComponent(corpus.verses[i][1])).join('|')); // references hold dots and commas; a bar they never hold
  if (query) parts.push('q=' + encodeURIComponent(query));
  const h = parts.length ? '#' + parts.join('&') : '';
  if (h !== location.hash) history.replaceState(null, '', location.pathname + location.search + h);
}
function readHash() { const p = new URLSearchParams(location.hash.slice(1)); return { reading: p.has('reading'), v: p.get('v'), q: p.get('q'), w: p.get('w') }; }
let hover = null, held = false, overCard = false, down = null;
canvas.addEventListener('pointermove', (e) => { hover = { x: e.clientX, y: e.clientY }; });
// Click and walk. A click on a verse holds it, so the card stays put. A click on one of its six kin, on the ground
// or in the card, steps to it: the camera slides over at its current height and the steps make a trail. A click on
// empty ground lets go.
const walk = [];
function step(i) {
  const last = walk[walk.length - 1], onward = last !== undefined && last !== i && kinOf(last).includes(i);
  if (!onward) walk.length = 0; // a step off the kin is a new walk
  if (last !== i) walk.push(i);
  hold(i);
  if (onward) { const p = verses.positionOf(i, _p); controls.flyTo(p.x, p.z, controls.goalDistance); }
  syncHash();
}
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerup', (e) => {
  if (!down || controls.dragging || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) { down = null; return; }
  down = null;
  const i = nearestVerse(e.clientX, e.clientY, 14);
  if (i < 0) letGo(); else step(i);
});
canvas.addEventListener('pointerleave', () => { hover = null; candidate = { i: -1, since: 0 }; });
// the card stays while the pointer is on it, so its verses can be followed
card.addEventListener('pointerenter', () => { overCard = true; });
card.addEventListener('pointerleave', () => { overCard = false; candidate = { i: -1, since: performance.now() / 1000 }; });

// Search: by words at once, by meaning once the model is here. Hits stay lit, everything else dims.
const qInput = $('q'), results = $('results'), clearBtn = $('clear');
let query = '', searchRun = 0;
function bestPerText(order, limit = 7) {
  const seen = new Set(), out = [];
  for (const i of order) { const t = corpus.verses[i][0]; if (!seen.has(t)) { seen.add(t); out.push(i); if (out.length === limit) break; } }
  return textIds.map((t) => out.find((i) => corpus.verses[i][0] === t)).filter((i) => i !== undefined);
}
function renderResults(how, ids, extra = '') {
  results.querySelector('.how').innerHTML = how;
  results.querySelector('ul').innerHTML = ids.map((j) => `<li style="--c:${corpus.texts[corpus.verses[j][0]].colour}"><button data-verse="${j}"><b>${esc(corpus.verses[j][1])}</b><span>${esc(corpus.verses[j][2])}</span></button></li>`).join('') + extra;
  results.hidden = false;
}
results.addEventListener('click', (e) => {
  const b = e.target.closest('[data-verse]'); if (!b) return;
  step(+b.dataset.verse);
});
async function runSearch(q) {
  query = q; qInput.value = q; clearBtn.hidden = false; const run = ++searchRun; syncHash(); applyReading();
  const words = search.byWords(q);
  renderResults(words.length ? `by words · ${words.length.toLocaleString()} verses` : 'by words · nothing', bestPerText(words));
  verses.setHits(words.slice(0, 3000));
  const progress = { index: 0, model: 0 };
  try {
    const { order } = await search.byMeaning(q, (what, frac) => {
      progress[what] = frac; if (run !== searchRun) return;
      const pct = Math.round(((progress.index + progress.model) / 2) * 100);
      renderResults(`by words · ${words.length.toLocaleString()} verses · <b>loading the meaning model, ${pct}%</b>`, bestPerText(words), `<li class="bar" style="border:0;padding:0"><i style="width:${pct}%"></i></li>`);
    });
    if (run !== searchRun) return;
    const top = order.slice(0, 80), per = bestPerText(order);
    renderResults('by meaning · nearest in each text', per);
    verses.setHits([...new Set([...top, ...per])]);
  } catch (err) {
    console.error(err);
    if (run === searchRun) renderResults(`by words · ${words.length.toLocaleString()} verses · <b>the meaning model could not load</b>`, bestPerText(words));
  }
}
function clearSearch() { query = ''; searchRun++; if (verses.points) applyReading(); if (document.activeElement !== qInput) qInput.value = ''; results.hidden = true; clearBtn.hidden = true; if (verses.points) verses.setHits(null); syncHash(); }
$('search').addEventListener('submit', (e) => { e.preventDefault(); const q = qInput.value.trim(); if (q) runSearch(q); else clearSearch(); qInput.blur(); });
let typing = 0; // the search runs as you type, a beat after the last key
qInput.addEventListener('input', () => { clearTimeout(typing); typing = setTimeout(() => { const q = qInput.value.trim(); if (q.length >= 2) { if (q !== query) runSearch(q); } else if (query) clearSearch(); }, 220); });
clearBtn.addEventListener('click', clearSearch);
document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#search, #results')) results.hidden = true; });
qInput.addEventListener('focus', () => { if (query) results.hidden = false; });
qInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') { clearSearch(); qInput.blur(); } e.stopPropagation(); });

// Panels: about and keys, one at a time.
const about = $('about'), aboutBtn = $('about-btn');
function showAbout(on) { about.hidden = !on; aboutBtn.setAttribute('aria-expanded', on); if (on) { showHelp(false); card.hidden = true; } }
aboutBtn.addEventListener('click', () => showAbout(about.hidden));

// Regions: named places on the terrain, shown in the meaning view; a label yields to a bigger one it would touch.
const regionLabels = [];
function placeRegionLabels() {
  const w = canvas.clientWidth, h = canvas.clientHeight, show = order.value > 0.6 ? (order.value - 0.6) / 0.4 : 0;
  const placed = [];
  if (!show) { for (const r of regionLabels) r.el.style.opacity = 0; return placed; }
  for (const r of regionLabels) {
    if (!show) { r.el.style.opacity = 0; continue; }
    place(r.u, r.v, terrain.heightAt(r.u, r.v) + 0.05, _p).project(camera);
    const x = (_p.x + 1) / 2 * w, y = (1 - _p.y) / 2 * h;
    const ok = _p.z < 1 && x > 20 && x < w - 20 && y > 60 && y < h - 130 && !placed.some((q) => Math.abs(q.x - x) < (q.w + r.w) / 2 + 12 && Math.abs(q.y - y) < 26);
    r.el.style.opacity = ok ? show * 0.9 : 0;
    if (ok) { r.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`; placed.push({ x, y, w: r.w }); }
  }
  return placed;
}

// The guide: what the three dimensions mean, drawn on the scene itself. A rule up the highest peak for height,
// a span between two far regions for distance, and notes for colour and, in reading order, for the run of a band.
const guide = $('guide'), guideLabels = $('guide-labels'), guideBtn = $('guide-btn');
const gl = { rule: guide.querySelector('.rule'), span: guide.querySelector('.span'), ta: guide.querySelector('.tick.a'), tb: guide.querySelector('.tick.b') };
const gt = { height: guideLabels.querySelector('.height'), span: guideLabels.querySelector('.span'), order: guideLabels.querySelector('.order'), bright: guideLabels.querySelector('.bright'), colour: guideLabels.querySelector('.colour') };
let guideOn = false, guidePoints = null;
function showGuide(on) {
  guideOn = on; guide.style.display = on ? '' : 'none'; guideLabels.hidden = !on; guideLabels.classList.toggle('on', on); guideBtn.setAttribute('aria-pressed', on);
  if (on) card.hidden = true; else try { localStorage.setItem('cg-guided', '1'); } catch {}
}
guideBtn.addEventListener('click', () => showGuide(!guideOn));
guideLabels.querySelector('.dismiss').addEventListener('click', () => showGuide(false));
const _q = new THREE.Vector3();
const toScreen = (v) => { const w = canvas.clientWidth, h = canvas.clientHeight; return [(v.x + 1) / 2 * w, (1 - v.y) / 2 * h, v.z < 1]; };
function setLine(el, a, b) { el.setAttribute('x1', a[0]); el.setAttribute('y1', a[1]); el.setAttribute('x2', b[0]); el.setAttribute('y2', b[1]); el.style.opacity = a[2] && b[2] ? 1 : 0; }
function putLabel(el, x, y, anchor = 'left') {
  const w = canvas.clientWidth, h = canvas.clientHeight, lw = Math.min(240, w - 24); // kept inside the screen
  if (anchor === 'center') x -= lw / 2;
  x = Math.min(w - lw - 12, Math.max(12, x)); y = Math.min(h - 120, Math.max(60, y));
  el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
}
function placeGuide() {
  if (!guideOn || !guidePoints) return;
  const meaning = order.value > 0.5, w = canvas.clientWidth;
  gt.height.style.display = gt.span.style.display = meaning ? '' : 'none';
  gt.order.style.display = gt.bright.style.display = meaning ? 'none' : '';
  gl.rule.style.opacity = gl.span.style.opacity = gl.ta.style.opacity = gl.tb.style.opacity = 0;
  if (meaning) {
    const { peak, far } = guidePoints;
    const foot = toScreen(place(peak[0], peak[1], 0, _q).project(camera)), top = toScreen(place(peak[0], peak[1], terrain.heightAt(peak[0], peak[1]) + 0.25, _q).project(camera));
    setLine(gl.rule, foot, top); putLabel(gt.height, top[0] + 10, top[1] - 12);
    const a = toScreen(place(far[0][0], far[0][1], terrain.heightAt(far[0][0], far[0][1]) + 0.04, _q).project(camera)), b = toScreen(place(far[1][0], far[1][1], terrain.heightAt(far[1][0], far[1][1]) + 0.04, _q).project(camera));
    setLine(gl.span, a, b); putLabel(gt.span, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 10, 'center');
  } else {
    const band = verses.bands[textIds[0]], y = band.top - 0.03;
    const a = toScreen(place(0.06, y, 0.01, _q).project(camera)), b = toScreen(place(0.94, y, 0.01, _q).project(camera));
    setLine(gl.rule, a, b); setLine(gl.ta, [a[0], a[1] - 5, a[2]], [a[0], a[1] + 5, a[2]]); setLine(gl.tb, [b[0], b[1] - 5, b[2]], [b[0], b[1] + 5, b[2]]);
    putLabel(gt.order, (a[0] + b[0]) / 2, a[1] - 52, 'center');
  }
  void w;
}

// Landmarks: passages people know, named where they sit, in either order; they fly with their verses.
const landmarks = [];
function placeLandmarks(placed) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  for (const l of landmarks) {
    verses.positionOf(l.i, _p); _p.y += 0.02; _p.project(camera);
    const x = (_p.x + 1) / 2 * w, y = (1 - _p.y) / 2 * h;
    const ok = _p.z < 1 && x > 10 && x < w - 10 && y > 70 && y < h - 130 && verses.isLit(l.i) && !placed.some((q) => Math.abs(q.x - x) < (q.w + l.w) / 2 + 10 && Math.abs(q.y - y) < 18);
    l.el.style.opacity = ok ? 1 : 0; l.el.style.pointerEvents = ok ? 'auto' : 'none';
    if (ok) { l.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(0, -50%)`; placed.push({ x: x + l.w / 2, y, w: l.w }); }
  }
}

// The reading playhead: one position through every text at once. It plays by itself, a full reading in three
// minutes, until paused; the line under it names the book each text is in.
const reading = { pos: 0, playing: true, seconds: 180 };
const posInput = $('pos'), playBtn = $('play'), whereEl = $('reading').querySelector('.where');
let whereKey = '';
function applyReading() {
  verses.setRead(reading.pos, !query); // a search has its own light
  if (document.activeElement !== posInput) posInput.value = Math.round(reading.pos * 1000);
  const where = textIds.map((t) => { const x = corpus.texts[t], k = Math.min(x.verses - 1, Math.floor(reading.pos * x.verses)); let s = 0; for (const [name, n] of x.books) { if (k < s + n) return [t, name]; s += n; } return [t, '']; });
  const key = where.map((w) => w[1]).join('|');
  if (key !== whereKey) { whereKey = key; whereEl.innerHTML = where.map(([t, name]) => `<span style="color:${corpus.texts[t].colour}">${esc(name)}</span>`).join(''); }
}
function setPlaying(on) { reading.playing = on; playBtn.setAttribute('aria-pressed', on); }
playBtn.addEventListener('click', () => setPlaying(!reading.playing));
posInput.addEventListener('input', () => { reading.pos = posInput.value / 1000; setPlaying(false); applyReading(); });
document.addEventListener('keydown', (ev) => { if (!ev.metaKey && !ev.ctrlKey && !ev.altKey && ev.target !== qInput && (ev.key === ' ' || ev.key === 'p')) { setPlaying(!reading.playing); ev.preventDefault(); } });

// The morph: 0 is reading order (each book a band), 1 is meaning (the terrain). It plays on load and on the toggle.
const order = { value: 1, target: 1, from: 1, t0: 0, seconds: 3, wait: 0 };
function setOrder(meaning, seconds = 3) {
  order.from = order.value; order.target = meaning ? 1 : 0; order.t0 = performance.now() / 1000; order.seconds = seconds; order.wait = 0;
  syncOrderButtons(); syncHash();
}
function syncOrderButtons() { for (const b of document.querySelectorAll('#order button')) b.setAttribute('aria-pressed', (b.dataset.order === 'meaning') === (order.target === 1)); }
document.querySelectorAll('#order button').forEach((b) => b.addEventListener('click', () => setOrder(b.dataset.order === 'meaning')));
document.addEventListener('keydown', (ev) => {
  if (ev.metaKey || ev.ctrlKey || ev.altKey || ev.target === qInput) return;
  if (ev.key === 'o') setOrder(order.target !== 1);
});
function applyOrder(m) {
  order.value = m;
  verses.setMorph(m);
  terrain.mesh.scale.y = Math.max(0.0001, m);
  terrain.mesh.material.uniforms.uRise.value = m;
}
const bandLabels = [], bookLabels = [];
let labelKey = '';
function placeBandLabels() {
  const w = canvas.clientWidth, h = canvas.clientHeight, narrow = w < 640;
  const fade = Math.max(0, 1 - order.value * 3); // gone by the time a third of the flight is done
  let lastY = -1e9;
  for (const { el, u, v } of bandLabels) {
    place(narrow ? 0.07 : u, v, 0.02, _p).project(camera);
    const y = (1 - _p.y) / 2 * h, crowded = y - lastY < 16; // a label that would sit on the previous one stays out
    if (!crowded) lastY = y;
    el.style.transform = `translate(${((_p.x + 1) / 2 * w).toFixed(1)}px, ${y.toFixed(1)}px) ${narrow ? 'translate(0, -120%)' : 'translate(-100%, -50%)'}`;
    el.style.opacity = crowded || _p.z >= 1 ? 0 : fade;
  }
  // book names, once a book is wide enough on screen to carry its name; only touched when the view changed
  const key = `${controls.target.x.toFixed(3)},${controls.target.z.toFixed(3)},${controls.distance.toFixed(3)},${order.value.toFixed(3)},${w}`;
  if (key === labelKey) return; labelKey = key;
  const show = order.value < 0.4;
  for (const { el, u0, u1, v, width } of bookLabels) {
    if (!show) { el.style.opacity = 0; continue; }
    place(u0, v, 0.01, _p).project(camera); const x0 = (_p.x + 1) / 2 * w, z0 = _p.z;
    place(u1, v, 0.01, _p).project(camera); const x1 = (_p.x + 1) / 2 * w, y = (1 - _p.y) / 2 * h;
    const fits = x1 - x0 > width + 8 && z0 < 1 && _p.z < 1 && x1 > 0 && x0 < w;
    el.style.opacity = fits ? fade : 0;
    if (fits) el.style.transform = `translate(${((x0 + x1) / 2).toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
  }
}

let lastFrame = 0;
function frame() {
  requestAnimationFrame(frame);
  controls.update();
  const now = performance.now() / 1000;
  if (order.value !== order.target) {
    const e = Math.min(1, Math.max(0, (now - order.t0 - order.wait) / order.seconds));
    applyOrder(order.from + (order.target - order.from) * (e < 0.5 ? 2 * e * e : 1 - Math.pow(-2 * e + 2, 2) / 2));
  }
  if (reading.playing && corpus) { reading.pos = (reading.pos + Math.min(0.1, now - lastFrame) / reading.seconds) % 1; applyReading(); }
  lastFrame = now;
  placeBandLabels(); placeLandmarks(placeRegionLabels()); placeGuide();
  resetBtn.hidden = controls.goalTarget.lengthSq() < 1e-4 && Math.abs(controls.goalDistance - controls.home.distance) < 1e-3;
  if (hover && corpus && !controls.dragging) {
    const { x, y } = hover; hover = null;
    const i = nearestVerse(x, y);
    canvas.style.cursor = i >= 0 ? 'pointer' : '';
    if (i !== candidate.i) candidate = { i, since: now };
  }
  // a verse is picked once the pointer has rested on it a moment, and let go the same way, so neighbours do not flicker
  // a verse shows once the pointer has rested on it a moment; letting go waits a little longer, and never while the card is under the pointer or a verse is held
  if (candidate.i !== shown && !overCard) {
    if (candidate.i >= 0 && now - candidate.since > 0.04) { held = false; showVerse(candidate.i); }
    else if (candidate.i < 0 && !held && now - candidate.since > 0.12) letGo();
  }
  // the threads recede into the verse the moment the pointer leaves it (the card waits a beat); a held verse keeps them
  if (shown >= 0 && kin && (held || overCard || candidate.i === shown)) { last = { i: shown, at: shownAt, left: 0 }; threads.show(shown, kinOf(shown), textColours, corpus.texts[corpus.verses[shown][0]].colour, (j, out) => verses.positionOf(j, out), now - shownAt); }
  else if (last.i >= 0 && kin) {
    if (!last.left) last.left = now;
    if (now - last.left < 0.1) threads.show(last.i, kinOf(last.i), textColours, corpus.texts[corpus.verses[last.i][0]].colour, (j, out) => verses.positionOf(j, out), last.left - last.at, now - last.left);
    else { threads.hide(); last.i = -1; }
  } else threads.hide();
  threads.setTrail(walk, (j, out) => verses.positionOf(j, out));
  renderer.render(scene, camera);
}

async function boot() {
  let kinBuf;
  let marks;
  [corpus, layout, kinBuf, regions, marks] = await Promise.all([fetch(`${base}data/corpus.json`).then(r => r.json()), fetch(`${base}data/layout.json`).then(r => r.json()), fetch(`${base}data/kin.bin`).then(r => r.arrayBuffer()), fetch(`${base}data/regions.json`).then(r => r.json()), fetch(`${base}data/landmarks.json`).then(r => r.json())]);
  corpus.verses.forEach((v, i) => refIndex.set(v[1], i));
  search = new Search(base, corpus);
  textIds = Object.keys(corpus.texts); textColours = textIds.map((t) => corpus.texts[t].colour);
  const N = corpus.verses.length;
  kin = { idx: new Uint16Array(kinBuf, 0, N * 7), sim: new Uint8Array(kinBuf, N * 7 * 2, N * 7) };
  scene.add(threads.group); scene.add(threads.trail); threads.resize(canvas.clientWidth, canvas.clientHeight, pixelRatio);
  scene.add(terrain.build(layout, RELIEF));
  scene.add(verses.build(corpus, layout, (u, v) => terrain.heightAt(u, v), pixelRatio));
  for (const [k, b] of Object.entries(verses.bands)) { const el = document.createElement('div'); el.className = 'band'; el.textContent = corpus.texts[k].name; el.style.color = corpus.texts[k].colour; $('labels').appendChild(el); bandLabels.push({ el, u: 0.05, v: b.mid }); }
  for (const [k, list] of Object.entries(verses.books)) {
    for (const b of list) { const el = document.createElement('div'); el.className = 'book'; el.textContent = b.name; el.style.color = corpus.texts[k].colour; $('labels').appendChild(el); bookLabels.push({ el, u0: b.u0, u1: b.u1, v: verses.bands[k].mid - verses.bands[k].thick / 2 - 0.004, width: b.name.length * 6.2 }); }
  }
  for (const r of regions.regions) {
    if (!r.name) continue;
    const el = document.createElement('div'); el.className = 'region'; el.textContent = r.name;
    el.style.fontSize = `${(12 + Math.min(8, r.n / 250)).toFixed(1)}px`;
    el.title = Object.entries(r.share).filter(([, n]) => n).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${corpus.texts[t].name} ${n.toLocaleString()}`).join(' · ');
    $('labels').appendChild(el); regionLabels.push({ el, u: r.u, v: r.v, n: r.n, w: r.name.length * (7 + Math.min(8, r.n / 250) * 0.5) });
  }
  regionLabels.sort((a, b) => b.n - a.n);
  { // the guide's anchors: the highest peak, and the two of the six largest regions furthest apart
    const G = layout.density.size, d = layout.density.values; let best = 0;
    for (let i = 1; i < d.length; i++) if (d[i] > d[best]) best = i;
    const big = regionLabels.slice(0, 6); let far = null, fd = -1;
    for (const a of big) for (const b of big) { const dd = Math.hypot(a.u - b.u, a.v - b.v); if (dd > fd) { fd = dd; far = [[a.u, a.v], [b.u, b.v]]; } }
    guidePoints = { peak: [(best % G) / (G - 1), Math.floor(best / G) / (G - 1)], far };
  }
  for (const [ref, name] of marks) {
    const i = refIndex.get(ref); if (i === undefined) { console.warn('no such landmark', ref); continue; }
    const el = document.createElement('button'); el.className = 'landmark'; el.textContent = name; el.title = ref; el.style.color = corpus.texts[corpus.verses[i][0]].colour;
    el.addEventListener('click', () => step(i));
    $('labels').appendChild(el); landmarks.push({ el, i, w: name.length * 6.2 + 18 });
  }
  about.querySelector('.texts').innerHTML = textIds.map((t) => { const x = corpus.texts[t]; return `<li><i style="background:${x.colour}"></i><b>${x.name}</b> · ${esc(x.translation)} · <a href="${x.url}" target="_blank" rel="noopener">${esc(x.source)}</a> · ${x.licence} · ${x.verses.toLocaleString()} verses</li>`; }).join('');
  applyReading();
  const want = readHash(), wanted = want.v ? (refIndex.get(want.v) ?? -1) : -1;
  applyOrder(want.reading ? 0 : 1); order.target = order.value; // the page opens on the terrain; #reading opens on the bands
  syncOrderButtons();
  if (want.w) for (const ref of want.w.split('|')) { const i = refIndex.get(ref); if (i !== undefined) walk.push(i); }
  if (wanted >= 0) { if (walk[walk.length - 1] !== wanted) walk.length = 0; hold(wanted); } // held, with the view left alone
  if (want.q) runSearch(want.q);
  let guided = false; try { guided = !!localStorage.getItem('cg-guided'); } catch {}
  if (!location.hash && !guided) { // the first visit opens with the guide, which any move of the hand dismisses
    showGuide(true);
    const off = () => { if (guideOn) showGuide(false); for (const ev of ['pointerdown', 'wheel', 'keydown']) window.removeEventListener(ev, off); };
    setTimeout(() => { for (const ev of ['pointerdown', 'wheel', 'keydown']) window.addEventListener(ev, off); }, 600);
  }
  $('legend').innerHTML = Object.entries(corpus.texts).map(([k, t]) => `<span><i style="background:${t.colour}"></i>${t.name} <b>${t.verses.toLocaleString()}</b></span>`).join('');
  $('loading').classList.add('gone');
  requestAnimationFrame(frame);
}
boot().catch((err) => { $('loading').textContent = 'The corpus failed to load. Refresh to try again.'; console.error(err); });
window.__cg = { scene, camera, controls, terrain, verses, threads, order, setOrder, hold, letGo, step, walk, reading, setPlaying, applyReading, showGuide, runSearch, clearSearch, get search() { return search; }, get kin() { return kin; }, freeze: (m) => { order.target = m; applyOrder(m); syncOrderButtons(); }, get corpus() { return corpus; }, get layout() { return layout; } };
