import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EXTENT, RELIEF } from './space.js';
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
camera.position.set(0, EXTENT * 0.95, EXTENT * 0.85);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minDistance = 1.2; controls.maxDistance = EXTENT * 2.2;
controls.maxPolarAngle = Math.PI * 0.46; // never below the ground
controls.target.set(0, 0, 0);

const terrain = new TerrainLayer(), verses = new VersesLayer();
let corpus = null, layout = null;

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// Reading: the nearest verse to the pointer, found by projecting the points (a few tens of thousands: fine on a move, not every frame).
const _p = new THREE.Vector3();
function nearestVerse(sx, sy, px = 8) {
  if (!verses.positions) return -1;
  const w = canvas.clientWidth, h = canvas.clientHeight, pos = verses.positions;
  let best = -1, bd = px * px;
  for (let i = 0; i < pos.length / 3; i++) {
    _p.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).project(camera);
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
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) { down = null; return; }
  down = null;
  const i = nearestVerse(e.clientX, e.clientY, 12);
  if (i >= 0) { pinned = i; showVerse(i, true); } else { pinned = -1; card.hidden = true; }
});
canvas.addEventListener('pointerleave', () => { hover = null; if (pinned < 0) card.hidden = true; });

function frame() {
  requestAnimationFrame(frame);
  controls.update();
  if (hover && corpus) {
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
  $('legend').innerHTML = Object.entries(corpus.texts).map(([k, t]) => `<span><i style="background:${t.colour}"></i>${t.name} <b>${t.verses.toLocaleString()}</b></span>`).join('');
  $('loading').classList.add('gone');
  requestAnimationFrame(frame);
}
boot().catch((err) => { $('loading').textContent = 'The corpus failed to load. Refresh to try again.'; console.error(err); });
window.__cg = { scene, camera, controls, terrain, verses, get corpus() { return corpus; }, get layout() { return layout; } };
