// Every verse as a point of light, coloured by its text. Each verse knows two places: where it sits in
// reading order (its book laid out as a band) and where its meaning puts it on the terrain. A single
// morph value slides every point between the two, each verse leaving a little after the one before it,
// so a book unravels from its band into the landscape.
import * as THREE from 'three';
import { place } from '../space.js';

const VERT = /* glsl */`
  attribute vec3 aMeaning; attribute vec3 aColor; attribute float aDelay;
  uniform float uPixelRatio, uScale, uMorph;
  varying vec3 vColor;
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
    gl_PointSize = swell(t) * uScale * uPixelRatio / -mv.z;
  }`;
const FRAG = /* glsl */`
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    gl_FragColor = vec4(vColor, (1.0 - d * d) * 0.85);
  }`;

/** Reading order: each text a horizontal band, its thickness by verse count, verses in order left to right. */
export function readingLayout(corpus) {
  const ids = Object.keys(corpus.texts);
  const counts = Object.fromEntries(ids.map((k) => [k, corpus.texts[k].verses]));
  const weights = ids.map((k) => Math.sqrt(counts[k]) + 6);
  const total = weights.reduce((s, w) => s + w, 0);
  const bands = {}; let v0 = 0.1;
  ids.forEach((k, i) => { const h = weights[i] / total * 0.74; bands[k] = { top: v0, height: h, mid: v0 + h / 2, thick: Math.max(0.004, h * 0.6) }; v0 += h; });
  const seen = Object.fromEntries(ids.map((k) => [k, 0]));
  const uv = corpus.verses.map(([t]) => {
    const b = bands[t], i = seen[t]++, n = counts[t];
    const u = 0.06 + 0.88 * (n > 1 ? i / (n - 1) : 0.5);
    const r = Math.sin(i * 12.9898 + 78.233) * 43758.5453, jitter = r - Math.floor(r) - 0.5; // a fixed scatter across the band's thickness
    return [u, b.mid + jitter * b.thick, i / n];
  });
  return { uv, bands };
}

export class VersesLayer {
  constructor() { this.points = null; this.meaning = null; this.morph = 1; }

  build(corpus, layout, heightAt, pixelRatio) {
    const n = layout.uv.length;
    const reading = readingLayout(corpus);
    const posA = new Float32Array(n * 3), posB = new Float32Array(n * 3), col = new Float32Array(n * 3), delay = new Float32Array(n);
    const p = new THREE.Vector3(), c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const [ru, rv, progress] = reading.uv[i];
      place(ru, rv, 0.004, p); posA[i * 3] = p.x; posA[i * 3 + 1] = p.y; posA[i * 3 + 2] = p.z;
      const [u, v] = layout.uv[i];
      place(u, v, heightAt(u, v) + 0.012, p); posB[i * 3] = p.x; posB[i * 3 + 1] = p.y; posB[i * 3 + 2] = p.z;
      c.set(corpus.texts[corpus.verses[i][0]].colour); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      delay[i] = progress;
    }
    this.meaning = posB; this.readingPositions = posA; this.delays = delay; this.bands = reading.bands;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(posA, 3));
    geo.setAttribute('aMeaning', new THREE.BufferAttribute(posB, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aDelay', new THREE.BufferAttribute(delay, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 20);
    this.material = new THREE.ShaderMaterial({ uniforms: { uPixelRatio: { value: pixelRatio }, uScale: { value: 22 }, uMorph: { value: 1 } }, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    return this.points;
  }

  /** Where verse i is right now, for hit-testing: the same blend as the shader, without the arc. */
  positionOf(i, out) {
    const t0 = Math.min(1, Math.max(0, this.morph * 1.35 - this.delays[i] * 0.35)), t = t0 * t0 * (3 - 2 * t0);
    const a = this.readingPositions, b = this.meaning;
    return out.set(a[i * 3] + (b[i * 3] - a[i * 3]) * t, a[i * 3 + 1] + (b[i * 3 + 1] - a[i * 3 + 1]) * t + Math.sin(t * Math.PI) * 0.6, a[i * 3 + 2] + (b[i * 3 + 2] - a[i * 3 + 2]) * t);
  }

  setMorph(m) { this.morph = m; if (this.material) this.material.uniforms.uMorph.value = m; }
}
