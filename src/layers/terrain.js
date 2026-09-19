// The ground: a relief mesh whose height is the density of verses, lit from a low sun so ridges catch
// light and valleys stay dark. Built from the density grid in layout.json, placed through space.js.
import * as THREE from 'three';
import { place } from '../space.js';

const VERT = /* glsl */`
  varying float vH; varying vec3 vNormal;
  void main() {
    vH = position.y;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const FRAG = /* glsl */`
  uniform float uRelief;
  varying float vH; varying vec3 vNormal;
  void main() {
    float h = clamp(vH / uRelief, 0.0, 1.0);
    vec3 sun = normalize(vec3(-0.6, 0.5, 0.4));
    float lit = 0.35 + 0.65 * max(dot(vNormal, sun), 0.0);
    vec3 low = vec3(0.075, 0.095, 0.11), high = vec3(0.34, 0.33, 0.30);
    vec3 c = mix(low, high, pow(h, 0.7)) * lit;
    gl_FragColor = vec4(c, 1.0);
  }`;

export class TerrainLayer {
  constructor() { this.mesh = null; this.grid = null; }

  build(layout, relief) {
    const G = layout.density.size, vals = layout.density.values;
    this.grid = { size: G, values: vals };
    const geo = new THREE.PlaneGeometry(1, 1, G - 1, G - 1);
    const pos = geo.getAttribute('position');
    const p = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      const col = i % G, row = Math.floor(i / G);
      const u = col / (G - 1), v = row / (G - 1);
      place(u, v, vals[row * G + col], p);
      pos.setXYZ(i, p.x, p.y, p.z);
    }
    geo.computeVertexNormals();
    const mat = new THREE.ShaderMaterial({ uniforms: { uRelief: { value: relief } }, vertexShader: VERT, fragmentShader: FRAG });
    this.mesh = new THREE.Mesh(geo, mat);
    return this.mesh;
  }

  /** The terrain height (0..1) under a unit-square point, bilinear on the density grid. */
  heightAt(u, v) {
    if (!this.grid) return 0;
    const G = this.grid.size, x = Math.min(G - 1.001, Math.max(0, u * (G - 1))), y = Math.min(G - 1.001, Math.max(0, v * (G - 1)));
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, g = this.grid.values;
    const a = g[y0 * G + x0], b = g[y0 * G + x0 + 1], c = g[(y0 + 1) * G + x0], d = g[(y0 + 1) * G + x0 + 1];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }
}
