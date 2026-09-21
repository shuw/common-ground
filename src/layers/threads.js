// Threads from one verse to its nearest kin in every other text: six arcs, each in the colour of the text it
// reaches, drawn as fat glowing lines, with the verse and its kin lit as bright marks and a ring that spreads
// from the verse the moment it is picked. Redrawn every frame while shown, since the verses may be mid-flight.
import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

const SEG = 18, MAX = 7;
export class ThreadsLayer {
  constructor() {
    this.group = new THREE.Group(); this.group.visible = false;
    this.geo = new LineSegmentsGeometry();
    this.core = new LineMaterial({ vertexColors: true, linewidth: 1.3, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false });
    this.halo = new LineMaterial({ vertexColors: true, linewidth: 4, transparent: true, opacity: 0.14, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    for (const m of [this.halo, this.core]) { const l = new LineSegments2(this.geo, m); l.frustumCulled = false; l.renderOrder = 3; this.group.add(l); }
    // the verse and its kin, lit
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array((MAX + 1) * 3), 3));
    mg.setAttribute('color', new THREE.BufferAttribute(new Float32Array((MAX + 1) * 3), 3));
    mg.setAttribute('aBig', new THREE.BufferAttribute(new Float32Array(MAX + 1), 1));
    mg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 20);
    this.markMaterial = new THREE.ShaderMaterial({
      uniforms: { uPixelRatio: { value: 1 }, uT: { value: 1 }, uOpacity: { value: 1 }, uFar: { value: 1 } }, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float aBig; uniform float uPixelRatio, uT, uFar; varying vec3 vColor; varying float vBig;
        void main() { vColor = color; vBig = aBig; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          float swell = 1.0 + 0.5 * (1.0 - uT) * aBig; gl_PointSize = max((9.0 + 5.0 * aBig) * uFar * uPixelRatio, (34.0 + 22.0 * aBig) * swell * uPixelRatio / -mv.z); }`,
      fragmentShader: `uniform float uOpacity; varying vec3 vColor; varying float vBig;
        void main() { float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard; float core = 1.0 - smoothstep(0.0, 0.35, d); float glow = pow(1.0 - d, 2.2) * 0.55;
          gl_FragColor = vec4(mix(vColor, vec3(1.0), core * 0.7), (core + glow) * (0.8 + 0.2 * vBig) * uOpacity); }`,
    });
    this.marks = new THREE.Points(mg, this.markMaterial); this.marks.frustumCulled = false; this.marks.renderOrder = 4; this.group.add(this.marks);
    // a ring that spreads from the verse and fades, the moment it is picked
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3)); pg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 20);
    this.pulseMaterial = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 1 }, uColor: { value: new THREE.Color() }, uPixelRatio: { value: 1 }, uFar: { value: 1 } }, transparent: true, depthWrite: false, depthTest: false,
      vertexShader: `uniform float uT, uPixelRatio, uFar; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = max(16.0 * uFar * (1.0 + 2.0 * uT) * uPixelRatio, 26.0 * (1.0 + 8.0 * uT) * uPixelRatio / -mv.z); }`,
      fragmentShader: `uniform float uT; uniform vec3 uColor; void main() { float d = length(gl_PointCoord - 0.5) * 2.0; float ring = smoothstep(0.6, 0.8, d) * (1.0 - smoothstep(0.92, 1.0, d)); gl_FragColor = vec4(uColor, ring * (1.0 - uT)); }`,
    });
    this.pulse = new THREE.Points(pg, this.pulseMaterial); this.pulse.frustumCulled = false; this.pulse.renderOrder = 5; this.group.add(this.pulse);
    // the spark that travels a thread when a kin is chosen
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3)); sg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 20);
    this.sparkMaterial = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color() }, uPixelRatio: { value: 1 }, uFar: { value: 1 } }, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      vertexShader: `uniform float uPixelRatio, uFar; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = max(18.0 * uFar * uPixelRatio, 90.0 * uPixelRatio / -mv.z); }`,
      fragmentShader: `uniform vec3 uColor; void main() { float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard; float core = 1.0 - smoothstep(0.0, 0.25, d); float glow = pow(1.0 - d, 2.0) * 0.7; gl_FragColor = vec4(mix(uColor, vec3(1.0), core), core + glow); }`,
    });
    this.spark = new THREE.Points(sg, this.sparkMaterial); this.spark.frustumCulled = false; this.spark.visible = false; this.spark.renderOrder = 6; this.group.add(this.spark);
    this.travelPoint = new THREE.Vector3(); this.travelAt = null; this.p = new THREE.Vector3();
    this.a = new THREE.Vector3(); this.b = new THREE.Vector3(); this.c = new THREE.Color();
    this.buf = new Float32Array(MAX * SEG * 2 * 3); this.cbuf = new Float32Array(MAX * SEG * 2 * 3);
    // the walk: a dim gold line through the verses stepped so far, drawn apart from the threads so it stays when they change
    this.trailGeo = new LineSegmentsGeometry();
    this.trailMaterial = new LineMaterial({ vertexColors: true, linewidth: 1.2, transparent: true, opacity: 0.5, depthWrite: false, depthTest: false });
    this.trail = new LineSegments2(this.trailGeo, this.trailMaterial); this.trail.frustumCulled = false; this.trail.visible = false; this.trail.renderOrder = 2;
    this.trailBuf = new Float32Array(64 * SEG * 2 * 3);
  }

  /** Draw the walk through these verses, in order. */
  setTrail(indices, positionOf, fade = 1) {
    const KEEP = 1; // only the thread just travelled, and it fades away: a wake, not litter
    const steps = indices.slice(-(KEEP + 1));
    if (steps.length < 2 || fade <= 0) { this.trail.visible = false; return; }
    this.trailMaterial.opacity = 0.5 * fade;
    if (!this.trailCol) this.trailCol = new Float32Array(this.trailBuf.length);
    let k = 0;
    for (let n = 1; n < steps.length && k + SEG * 6 <= this.trailBuf.length; n++) {
      positionOf(steps[n - 1], this.a); positionOf(steps[n], this.b);
      const lift = Math.min(0.25, 0.03 + this.a.distanceTo(this.b) * 0.04), age = (steps.length - 1 - n) / KEEP, g = 0.15 + 0.85 * (1 - age);
      for (let s = 0; s < SEG; s++) for (const e of [s / SEG, (s + 1) / SEG]) {
        this.trailBuf[k] = this.a.x + (this.b.x - this.a.x) * e; this.trailBuf[k + 1] = this.a.y + (this.b.y - this.a.y) * e + Math.sin(e * Math.PI) * lift; this.trailBuf[k + 2] = this.a.z + (this.b.z - this.a.z) * e;
        this.trailCol[k] = 0.84 * g; this.trailCol[k + 1] = 0.71 * g; this.trailCol[k + 2] = 0.42 * g; k += 3;
      }
    }
    this.trailGeo.setPositions(this.trailBuf.subarray(0, k)); this.trailGeo.setColors(this.trailCol.subarray(0, k)); this.trailGeo._maxInstanceCount = undefined; this.trail.visible = true;
  }

  /** The camera's distance, as a factor from 1 up close to about 1.8 at home: marks, rings and lines keep their presence from afar. */
  setFar(far) { const f = Math.min(1.8, Math.max(1, 0.7 + far * 0.25)); for (const m of [this.markMaterial, this.pulseMaterial, this.sparkMaterial]) m.uniforms.uFar.value = f; this.core.linewidth = 1.3 * f; this.halo.linewidth = 4 * f; this.trailMaterial.linewidth = 1.2 * f; }
  resize(w, h, pixelRatio) { for (const m of [this.core, this.halo, this.trailMaterial]) m.resolution.set(w, h); this.markMaterial.uniforms.uPixelRatio.value = pixelRatio; this.pulseMaterial.uniforms.uPixelRatio.value = pixelRatio; this.sparkMaterial.uniforms.uPixelRatio.value = pixelRatio; }

  /** Draw arcs from verse i to each verse in kin (skipping -1), positions from positionOf, colours per kin;
   *  t is the seconds since the verse was picked: the arcs grow out of it, one a little after the other. */
  /** The path of the thread from a to b, at fraction e along it; n is the thread's index among its siblings. */
  along(a, b, e, n, out) {
    const dist = a.distanceTo(b), lift = Math.min(0.3, 0.04 + dist * 0.05);
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1, side = (n - 3.5) * Math.min(dist, 3) * 0.05, bow = Math.sin(e * Math.PI);
    return out.set(a.x + dx * e + (-dz / len * side) * bow, a.y + (b.y - a.y) * e + bow * lift, a.z + dz * e + (dx / len * side) * bow);
  }

  show(i, kin, colours, colour, positionOf, t, recede = 0, focus = -1, travel = null) {
    const progress = Math.min(1, t / 0.26) * (1 - Math.min(1, recede / 0.1)), mp = this.marks.geometry.getAttribute('position'), mc = this.marks.geometry.getAttribute('color'), mb = this.marks.geometry.getAttribute('aBig');
    positionOf(i, this.a); this.c.set(colour);
    mp.setXYZ(0, this.a.x, this.a.y + 0.01, this.a.z); mc.setXYZ(0, this.c.r, this.c.g, this.c.b); mb.setX(0, 1);
    let k = 0, n = 0, m = 1;
    this.travelAt = null;
    for (let j = 0; j < kin.length; j++) {
      if (kin[j] < 0) continue;
      const tp = Math.min(1, Math.max(0, progress * 1.3 - (n++) * 0.05)), reach = 1 - Math.pow(1 - tp, 3);
      positionOf(kin[j], this.b); this.c.set(colours[j]);
      // a hovered thread stands out; the others step back. A travelling light lifts the whole of its thread.
      const dimmed = focus >= 0 && j !== focus, lit = j === focus || (travel && travel.j === j);
      const shade = dimmed ? 0.3 : 1, boost = lit ? 1.35 : 1;
      if (reach >= 0.999) { mp.setXYZ(m, this.b.x, this.b.y + 0.01, this.b.z); mc.setXYZ(m, this.c.r * shade * boost, this.c.g * shade * boost, this.c.b * shade * boost); mb.setX(m, lit ? 1 : 0); m++; }
      if (travel && travel.j === j) { this.along(this.a, this.b, travel.e, n, this.travelPoint); this.travelAt = this.travelPoint; } // n as the thread below uses it
      if (reach <= 0) continue;
      this.c.multiplyScalar(shade * boost);
      for (let s = 0; s < SEG; s++) {
        for (const e of [s / SEG * reach, (s + 1) / SEG * reach]) {
          this.along(this.a, this.b, e, n, this.p); // one path for the thread, the spark and the trail
          this.buf[k] = this.p.x; this.buf[k + 1] = this.p.y; this.buf[k + 2] = this.p.z;
          this.cbuf[k] = this.c.r; this.cbuf[k + 1] = this.c.g; this.cbuf[k + 2] = this.c.b; k += 3;
        }
      }
    }
    // the renderer remembers the instance count it first saw for a geometry and never raises it, so a geometry that
    // grew from two threads to six would stay at two: forget that memory each time the segments change
    if (k > 0) { this.geo.setPositions(this.buf.subarray(0, k)); this.geo.setColors(this.cbuf.subarray(0, k)); this.geo._maxInstanceCount = undefined; }
    this.group.children[0].visible = this.group.children[1].visible = k > 0;
    this.marks.geometry.setDrawRange(0, m); mp.needsUpdate = true; mc.needsUpdate = true; mb.needsUpdate = true;
    this.markMaterial.uniforms.uT.value = Math.min(1, t / 0.3);
    this.markMaterial.uniforms.uOpacity.value = 1 - Math.min(1, recede / 0.1); this.marks.visible = recede < 0.1;
    const pt = t / 0.3;
    if (pt < 1) { this.pulse.geometry.getAttribute('position').setXYZ(0, this.a.x, this.a.y + 0.01, this.a.z); this.pulse.geometry.getAttribute('position').needsUpdate = true; this.pulseMaterial.uniforms.uT.value = pt; this.pulseMaterial.uniforms.uColor.value.set(colour); }
    this.pulse.visible = pt < 1;
    // the travelling light: a bright spark that runs along one thread
    if (this.travelAt) { const sp = this.spark.geometry.getAttribute('position'); sp.setXYZ(0, this.travelAt.x, this.travelAt.y + 0.012, this.travelAt.z); sp.needsUpdate = true; this.sparkMaterial.uniforms.uColor.value.set(colours[travel.j]); this.spark.visible = true; }
    else this.spark.visible = false;
    this.group.visible = true;
  }
  hide() { this.group.visible = false; }
}
