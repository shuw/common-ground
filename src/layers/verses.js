// Every verse as a point of light, coloured by its text. Each verse knows two places: where it sits in
// reading order (its book laid out as a band, with a seam between books) and where its meaning puts it
// on the terrain. A single morph value slides every point between the two, each verse leaving a little
// after the one before it, so a book unravels from its band into the landscape. Each verse also carries
// its kinship: how much of its neighbourhood belongs to other texts, against what a shuffle would give.
import * as THREE from 'three';
import { place } from '../space.js';

const VERT = /* glsl */`
  attribute vec3 aMeaning; attribute vec3 aColor; attribute float aDelay; attribute float aKin; attribute float aHit;
  uniform float uPixelRatio, uScale, uMorph, uKin, uSearch, uRead, uReadOn, uTime;
  varying vec3 vColor; varying float vAlpha;
  float swell(float t) { return 1.0 + 0.6 * sin(t * 3.14159); } // a little bigger mid-flight
  void main() {
    vColor = aColor;
    // each verse starts its journey a little after the previous one in its book
    float t = clamp((uMorph * 1.35 - aDelay * 0.35), 0.0, 1.0);
    t = t * t * (3.0 - 2.0 * t);
    vec3 p = mix(position, aMeaning, t);
    p.y += sin(t * 3.14159) * 0.6; // an arc on the way, so the flight reads as flight
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    // in reading order a verse shines by its kinship; below the threshold it all but goes out
    float lit = smoothstep(uKin - 0.08, uKin, aKin);
    // a search leaves only its hits shining
    float hit = mix(1.0, mix(0.06, 1.0, aHit), uSearch);
    // at rest every verse twinkles a little on its own phase; the reading playhead, when it is on, takes over:
    // verses just behind it glow, verses read stay lit, verses ahead sit dimmer. uReadOn eases between the two.
    float ph = aDelay * 61.0 + aKin * 17.0, twinkle = 1.0 + 0.2 * sin(uTime * 1.3 + ph) * (1.0 - uReadOn);
    float rel = aDelay - uRead, ahead = step(0.0, rel), front = smoothstep(-0.045, 0.0, rel) * (1.0 - ahead);
    float read = mix(1.0, mix(0.6 + 0.4 * front, 0.35, ahead), uReadOn);
    vColor = mix(vColor, vec3(1.0), 0.6 * front * uReadOn);
    vAlpha = mix(mix(0.3, 1.0, aKin), 1.0, t) * mix(0.05, 1.0, lit) * hit * read * twinkle;
    gl_PointSize = swell(t) * (0.8 + 0.2 * lit) * (1.0 + 0.6 * aHit * uSearch) * (1.0 + 1.3 * front * uReadOn) * uScale * uPixelRatio / -mv.z;
  }`;
const FRAG = /* glsl */`
  varying vec3 vColor; varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    gl_FragColor = vec4(vColor, (1.0 - d * d) * 0.85 * vAlpha);
  }`;

const U0 = 0.06, UW = 0.88; // the run of a band across the ground

/** Reading order: each text a horizontal band, its thickness by verse count, verses in order left to right, a seam between books. */
export function readingLayout(corpus) {
  const ids = Object.keys(corpus.texts);
  const counts = Object.fromEntries(ids.map((k) => [k, corpus.texts[k].verses]));
  const weights = ids.map((k) => Math.sqrt(counts[k]) + 6);
  const total = weights.reduce((s, w) => s + w, 0);
  const bands = {}; let v0 = 0.1;
  ids.forEach((k, i) => { const h = weights[i] / total * 0.74; bands[k] = { top: v0, height: h, mid: v0 + h / 2, thick: Math.max(0.004, h * 0.6) }; v0 += h; });
  // books share the band's run by verse count, with a small seam between them
  const books = {};
  for (const k of ids) {
    const list = corpus.texts[k].books || [[corpus.texts[k].name, counts[k]]];
    const gap = Math.min(0.004, 0.12 / Math.max(1, list.length - 1)), run = UW - gap * (list.length - 1);
    let u = U0; books[k] = [];
    for (const [name, n] of list) { const w = run * n / counts[k]; books[k].push({ name, n, u0: u, u1: u + w }); u += w + gap; }
  }
  indexBooks(books);
  const seen = Object.fromEntries(ids.map((k) => [k, 0])), cursor = Object.fromEntries(ids.map((k) => [k, 0]));
  const uv = corpus.verses.map(([t]) => {
    const b = bands[t], i = seen[t]++, n = counts[t];
    let book = books[t][cursor[t]]; while (i >= book.end) { book = books[t][++cursor[t]]; }
    const u = book.u0 + (i - book.start + 0.5) / book.n * (book.u1 - book.u0);
    const r = Math.sin(i * 12.9898 + 78.233) * 43758.5453, jitter = r - Math.floor(r) - 0.5; // a fixed scatter across the band's thickness
    return [u, b.mid + jitter * b.thick, i / n];
  });
  return { uv, bands, books };
}
// each book knows which run of its text's verses it holds
function indexBooks(books) { for (const list of Object.values(books)) { let s = 0; for (const b of list) { b.start = s; b.end = s + b.n; s = b.end; } } }

export class VersesLayer {
  constructor() { this.points = null; this.meaning = null; this.morph = 1; this.threshold = 0; }

  build(corpus, layout, heightAt, pixelRatio) {
    const n = layout.uv.length, N = corpus.verses.length;
    const reading = readingLayout(corpus);
    const posA = new Float32Array(n * 3), posB = new Float32Array(n * 3), col = new Float32Array(n * 3), delay = new Float32Array(n), kin = new Float32Array(n);
    const p = new THREE.Vector3(), c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const [ru, rv, progress] = reading.uv[i], t = corpus.verses[i][0];
      place(ru, rv, 0.004, p); posA[i * 3] = p.x; posA[i * 3 + 1] = p.y; posA[i * 3 + 2] = p.z;
      const [u, v] = layout.uv[i];
      place(u, v, heightAt(u, v) + 0.012, p); posB[i * 3] = p.x; posB[i * 3 + 1] = p.y; posB[i * 3 + 2] = p.z;
      c.set(corpus.texts[t].colour); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      delay[i] = progress;
      // kinship: foreign neighbours against what a shuffle would give this text, so a small text is not shared just for being small
      kin[i] = Math.min(1, (layout.mixing?.[i] ?? 0) / (1 - corpus.texts[t].verses / N));
    }
    this.meaning = posB; this.readingPositions = posA; this.delays = delay; this.kin = kin; this.bands = reading.bands; this.books = reading.books;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(posA, 3));
    geo.setAttribute('aMeaning', new THREE.BufferAttribute(posB, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aDelay', new THREE.BufferAttribute(delay, 1));
    geo.setAttribute('aKin', new THREE.BufferAttribute(kin, 1));
    this.hit = new Float32Array(n); geo.setAttribute('aHit', new THREE.BufferAttribute(this.hit, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 20);
    this.material = new THREE.ShaderMaterial({ uniforms: { uPixelRatio: { value: pixelRatio }, uScale: { value: 22 }, uMorph: { value: 1 }, uKin: { value: 0 }, uSearch: { value: 0 }, uRead: { value: 0 }, uReadOn: { value: 0 }, uTime: { value: 0 } }, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    return this.points;
  }

  /** Where verse i is right now, for hit-testing: the same blend as the shader. */
  positionOf(i, out) {
    const t0 = Math.min(1, Math.max(0, this.morph * 1.35 - this.delays[i] * 0.35)), t = t0 * t0 * (3 - 2 * t0);
    const a = this.readingPositions, b = this.meaning;
    return out.set(a[i * 3] + (b[i * 3] - a[i * 3]) * t, a[i * 3 + 1] + (b[i * 3 + 1] - a[i * 3 + 1]) * t + Math.sin(t * Math.PI) * 0.6, a[i * 3 + 2] + (b[i * 3 + 2] - a[i * 3 + 2]) * t);
  }
  /** Whether verse i is lit under the current threshold (a dimmed verse should not catch the pointer). */
  isLit(i) { return this.kin[i] >= this.threshold - 0.04 && (!this.searching || this.hit[i] > 0); }
  /** Light only these verses (null to light everything again). */
  setHits(indices) {
    this.searching = !!indices;
    this.hit.fill(0); if (indices) for (const i of indices) this.hit[i] = 1;
    this.points.geometry.getAttribute('aHit').needsUpdate = true;
    this.material.uniforms.uSearch.value = indices ? 1 : 0;
  }

  /** The reading playhead: a position 0..1 through every text, and how far on it is (0 off, 1 fully on). */
  setRead(pos, on) { if (this.material) { this.material.uniforms.uRead.value = pos; this.material.uniforms.uReadOn.value = on; } }
  setTime(t) { if (this.material) this.material.uniforms.uTime.value = t; }
  setMorph(m) { this.morph = m; if (this.material) this.material.uniforms.uMorph.value = m; }
  setKin(k) { this.threshold = k; if (this.material) this.material.uniforms.uKin.value = k; }
}
