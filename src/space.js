// The one placement function. The corpus arrives as points in the unit square (x, y from the embedding
// layout) with a height from local density; everything on screen is drawn through here, so the whole
// scene can be reshaped together later (a tilt into 3D, time as depth) without touching the layers.
import * as THREE from 'three';

export const EXTENT = 10;          // world units across the unit square
export const RELIEF = 1.2;         // world units of height for a density of 1

/** Unit-square (u, v) and height h (0..1) to world space; +y is up, the square lies in the x/z plane. */
export function place(u, v, h = 0, out = new THREE.Vector3()) {
  return out.set((u - 0.5) * EXTENT, h * RELIEF, (v - 0.5) * EXTENT);
}

/** World space back to unit-square (u, v). */
export function unplace(p) {
  return [p.x / EXTENT + 0.5, p.z / EXTENT + 0.5];
}
