// Threads from one verse to its nearest kin in every other text: six arcs, each in the colour of the text
// it reaches. Redrawn every frame while shown, since the verses may be mid-flight.
import * as THREE from 'three';

const SEG = 18;
export class ThreadsLayer {
  constructor() {
    const n = 7 * SEG * 2;
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 20);
    this.lines = new THREE.LineSegments(this.geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false }));
    this.lines.frustumCulled = false; this.lines.visible = false;
    this.a = new THREE.Vector3(); this.b = new THREE.Vector3(); this.c = new THREE.Color();
    // a ring that spreads from the verse and fades, the moment it is picked
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3)); pg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 20);
    this.pulseMaterial = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 1 }, uColor: { value: new THREE.Color() }, uPixelRatio: { value: 1 } }, transparent: true, depthWrite: false, depthTest: false,
      vertexShader: `uniform float uT, uPixelRatio; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = max(14.0, 22.0 * (1.0 + 7.0 * uT) * uPixelRatio / -mv.z); }`,
      fragmentShader: `uniform float uT; uniform vec3 uColor; void main() { float d = length(gl_PointCoord - 0.5) * 2.0; float ring = smoothstep(0.62, 0.8, d) * (1.0 - smoothstep(0.92, 1.0, d)); gl_FragColor = vec4(uColor, ring * (1.0 - uT) * 0.9); }`,
    });
    this.pulse = new THREE.Points(pg, this.pulseMaterial); this.pulse.frustumCulled = false; this.pulse.visible = false; this.pulse.renderOrder = 2;
  }
  pulseAt(i, colour, positionOf, t, pixelRatio) {
    if (t >= 1) { this.pulse.visible = false; return; }
    positionOf(i, this.a); this.pulse.geometry.getAttribute('position').setXYZ(0, this.a.x, this.a.y + 0.01, this.a.z); this.pulse.geometry.getAttribute('position').needsUpdate = true;
    this.pulseMaterial.uniforms.uT.value = t; this.pulseMaterial.uniforms.uColor.value.set(colour); this.pulseMaterial.uniforms.uPixelRatio.value = pixelRatio;
    this.pulse.visible = true;
  }

  /** Draw arcs from verse i to each verse in kin (skipping -1), positions from positionOf, colours per kin;
   *  progress 0..1 grows the arcs out of the verse, one a little after the other. */
  show(i, kin, colours, positionOf, progress = 1) {
    const pos = this.geo.getAttribute('position'), col = this.geo.getAttribute('color');
    positionOf(i, this.a);
    let k = 0, n = 0;
    for (let t = 0; t < kin.length; t++) {
      if (kin[t] < 0) continue;
      const tp = Math.min(1, Math.max(0, progress * 1.3 - (n++) * 0.05)), reach = 1 - Math.pow(1 - tp, 3);
      if (reach <= 0) continue;
      positionOf(kin[t], this.b); this.c.set(colours[t]);
      const lift = 0.08 + this.a.distanceTo(this.b) * 0.12;
      for (let s = 0; s < SEG; s++) {
        for (const e of [s / SEG * reach, (s + 1) / SEG * reach]) {
          const y = this.a.y + (this.b.y - this.a.y) * e + Math.sin(e * Math.PI) * lift;
          pos.setXYZ(k, this.a.x + (this.b.x - this.a.x) * e, y, this.a.z + (this.b.z - this.a.z) * e);
          col.setXYZ(k, this.c.r, this.c.g, this.c.b); k++;
        }
      }
    }
    this.geo.setDrawRange(0, k); pos.needsUpdate = true; col.needsUpdate = true;
    this.lines.visible = k > 0;
  }
  hide() { this.lines.visible = false; this.pulse.visible = false; }
}
