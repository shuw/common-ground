// Every verse as a point of light on the terrain, coloured by its text, sitting just above the ground
// at its place. One Points object for the whole corpus; the colour and size live in attributes.
import * as THREE from 'three';
import { place } from '../space.js';

const VERT = /* glsl */`
  attribute vec3 aColor; attribute float aSize;
  uniform float uPixelRatio, uScale;
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uScale * uPixelRatio / -mv.z;
  }`;
const FRAG = /* glsl */`
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    gl_FragColor = vec4(vColor, (1.0 - d * d) * 0.85);
  }`;

export class VersesLayer {
  constructor() { this.points = null; this.positions = null; }

  build(corpus, layout, heightAt, pixelRatio) {
    const n = layout.uv.length;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
    const p = new THREE.Vector3(), c = new THREE.Color();
    layout.uv.forEach(([u, v], i) => {
      place(u, v, heightAt(u, v) + 0.012, p);
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      c.set(corpus.texts[corpus.verses[i][0]].colour);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      size[i] = 1;
    });
    this.positions = pos;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    this.material = new THREE.ShaderMaterial({ uniforms: { uPixelRatio: { value: pixelRatio }, uScale: { value: 22 } }, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false });
    this.points = new THREE.Points(geo, this.material);
    return this.points;
  }
}
