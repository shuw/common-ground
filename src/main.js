import * as THREE from 'three';
import { GroundCamera } from './camera.js';
import { place, EXTENT, RELIEF } from './space.js';
import { TerrainLayer } from './layers/terrain.js';
import { VersesLayer } from './layers/verses.js';

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

const terrain = new TerrainLayer(), verses = new VersesLayer();
let corpus = null, layout = null;

let sized = false;
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  // home is the distance at which the whole ground fits the width of the screen; a tall screen sits further back
  const fit = Math.max(EXTENT * 1.275, (EXTENT * 0.55) / (Math.tan(camera.fov / 2 * Math.PI / 180) * camera.aspect));
  controls.setHome(fit, !sized); sized = true;
}
window.addEventListener('resize', resize);
resize();

// Keys: arrows slide the ground, + and - zoom, 0 goes home; 1, 2 and o pick the order.
const resetBtn = $('reset');
resetBtn.addEventListener('click', () => controls.goHome());
document.addEventListener('keydown', (ev) => {
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  const cx = canvas.clientWidth / 2, cy = canvas.clientHeight / 2, step = controls.goalDistance * 0.12;
  const pan = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[ev.key];
  if (pan) { controls.panBy(...pan); ev.preventDefault(); }
  else if (ev.key === '+' || ev.key === '=') controls.zoomAt(0.7, cx, cy);
  else if (ev.key === '-' || ev.key === '_') controls.zoomAt(1 / 0.7, cx, cy);
  else if (ev.key === '0') controls.goHome();
});

// Reading: the nearest verse to the pointer, found by projecting the points (a few tens of thousands: fine on a move, not every frame).
const _p = new THREE.Vector3();
function nearestVerse(sx, sy, px = 8) {
  if (!verses.meaning) return -1;
  const w = canvas.clientWidth, h = canvas.clientHeight, n = verses.meaning.length / 3;
  let best = -1, bd = px * px;
  for (let i = 0; i < n; i++) {
    verses.positionOf(i, _p).project(camera);
    if (_p.z > 1) continue;
    const dx = (_p.x + 1) / 2 * w - sx, dy = (1 - _p.y) / 2 * h - sy, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
const card = $('card');
function showVerse(i, isPinned) {
  const [t, ref, text] = corpus.verses[i], info = corpus.texts[t];
  card.style.setProperty('--c', info.colour);
  card.querySelector('.who').textContent = `${info.name} · ${ref}`;
  card.querySelector('.verse').textContent = text;
  card.querySelector('.tr').textContent = `${info.translation} · neighbourhood ${(layout.mixing[i] * 100).toFixed(0)}% other texts`;
  card.hidden = false; card.classList.toggle('pinned', isPinned);
}
let hover = null, pinned = -1, down = null;
canvas.addEventListener('pointermove', (e) => { hover = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerup', (e) => {
  if (!down || controls.dragging || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) { down = null; return; }
  down = null;
  const i = nearestVerse(e.clientX, e.clientY, 12);
  if (i >= 0) { pinned = i; showVerse(i, true); } else { pinned = -1; card.hidden = true; }
});
canvas.addEventListener('pointerleave', () => { hover = null; if (pinned < 0) card.hidden = true; });

// The morph: 0 is reading order (each book a band), 1 is meaning (the terrain). It plays on load and on the toggle.
const order = { value: 0, target: 1, from: 0, t0: 0, seconds: 5, wait: 1.2 };
function setOrder(meaning, seconds = 3) {
  order.from = order.value; order.target = meaning ? 1 : 0; order.t0 = performance.now() / 1000; order.seconds = seconds; order.wait = 0;
  syncOrderButtons();
  history.replaceState(null, '', location.pathname + location.search + (meaning ? '' : '#reading'));
}
function syncOrderButtons() { for (const b of document.querySelectorAll('#order button')) b.setAttribute('aria-pressed', (b.dataset.order === 'meaning') === (order.target === 1)); }
document.querySelectorAll('#order button').forEach((b) => b.addEventListener('click', () => setOrder(b.dataset.order === 'meaning')));
document.addEventListener('keydown', (ev) => {
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  if (ev.key === 'o') setOrder(order.target !== 1);
  else if (ev.key === '1') setOrder(false);
  else if (ev.key === '2') setOrder(true);
});
function applyOrder(m) {
  order.value = m;
  verses.setMorph(m);
  terrain.mesh.scale.y = Math.max(0.0001, m);
  terrain.mesh.material.uniforms.uRise.value = m;
}
const bandLabels = [];
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
}

function frame() {
  requestAnimationFrame(frame);
  controls.update();
  const now = performance.now() / 1000;
  if (order.value !== order.target) {
    const e = Math.min(1, Math.max(0, (now - order.t0 - order.wait) / order.seconds));
    applyOrder(order.from + (order.target - order.from) * (e < 0.5 ? 2 * e * e : 1 - Math.pow(-2 * e + 2, 2) / 2));
  }
  placeBandLabels();
  resetBtn.hidden = controls.goalTarget.lengthSq() < 1e-4 && Math.abs(controls.goalDistance - controls.home.distance) < 1e-3;
  if (hover && corpus && !controls.dragging) {
    const { x, y } = hover; hover = null;
    const i = nearestVerse(x, y);
    canvas.style.cursor = i >= 0 ? 'pointer' : '';
    if (pinned < 0) { if (i >= 0) showVerse(i, false); else card.hidden = true; }
  }
  renderer.render(scene, camera);
}

async function boot() {
  [corpus, layout] = await Promise.all([fetch(`${base}data/corpus.json`).then(r => r.json()), fetch(`${base}data/layout.json`).then(r => r.json())]);
  scene.add(terrain.build(layout, RELIEF));
  scene.add(verses.build(corpus, layout, (u, v) => terrain.heightAt(u, v), pixelRatio));
  for (const [k, b] of Object.entries(verses.bands)) { const el = document.createElement('div'); el.className = 'band'; el.textContent = corpus.texts[k].name; el.style.color = corpus.texts[k].colour; $('labels').appendChild(el); bandLabels.push({ el, u: 0.05, v: b.mid }); }
  applyOrder(0);
  if (location.hash === '#reading') order.target = 0; else order.t0 = performance.now() / 1000; // the opening: the books unravel into the landscape
  syncOrderButtons();
  $('legend').innerHTML = Object.entries(corpus.texts).map(([k, t]) => `<span><i style="background:${t.colour}"></i>${t.name} <b>${t.verses.toLocaleString()}</b></span>`).join('');
  $('loading').classList.add('gone');
  requestAnimationFrame(frame);
}
boot().catch((err) => { $('loading').textContent = 'The corpus failed to load. Refresh to try again.'; console.error(err); });
window.__cg = { scene, camera, controls, terrain, verses, order, setOrder, freeze: (m) => { order.target = m; applyOrder(m); syncOrderButtons(); }, get corpus() { return corpus; }, get layout() { return layout; } };
