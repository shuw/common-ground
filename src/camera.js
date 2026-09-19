// A map camera with two freedoms: where it looks on the ground and how far away it is. The tilt and the
// heading never change, so dragging always slides the ground and zooming always dives toward the pointer.
import * as THREE from 'three';

const TILT = 48 * Math.PI / 180; // above the ground, looking down
const _dir = new THREE.Vector3(), _ndc = new THREE.Vector3(), _pos = new THREE.Vector3();

export class GroundCamera {
  constructor(camera, canvas, { extent, minDistance, maxDistance }) {
    this.camera = camera; this.canvas = canvas; this.extent = extent;
    this.minDistance = minDistance; this.maxDistance = maxDistance;
    this.offset = new THREE.Vector3(0, Math.sin(TILT), Math.cos(TILT)); // unit vector from the target to the camera
    this.target = new THREE.Vector3(); this.goalTarget = new THREE.Vector3();
    this.distance = maxDistance; this.goalDistance = maxDistance;
    this.home = { distance: maxDistance };
    this.touched = false; this.dragging = false; this.last = performance.now();
    this.pointers = new Map();
    camera.lookAt(0, 0, 0); camera.position.copy(this.offset).multiplyScalar(this.distance); camera.lookAt(0, 0, 0);
    this.listen();
  }

  /** Where the ray through a screen pixel meets the ground when the camera sits at a given target and distance. */
  groundAt(sx, sy, target = this.goalTarget, distance = this.goalDistance, out = new THREE.Vector3()) {
    const r = this.canvas.getBoundingClientRect();
    _ndc.set(((sx - r.left) / r.width) * 2 - 1, -((sy - r.top) / r.height) * 2 + 1, 0.5);
    _dir.copy(_ndc).applyMatrix4(this.camera.projectionMatrixInverse).applyQuaternion(this.camera.quaternion).normalize();
    _pos.copy(this.offset).multiplyScalar(distance).add(target);
    const t = _dir.y < -1e-4 ? -_pos.y / _dir.y : (distance * 4); // a ray that misses the ground lands far away
    return out.copy(_dir).multiplyScalar(t).add(_pos);
  }

  clamp() {
    const lim = this.extent * 0.55;
    this.goalTarget.x = Math.min(lim, Math.max(-lim, this.goalTarget.x));
    this.goalTarget.z = Math.min(lim, Math.max(-lim, this.goalTarget.z));
    this.goalTarget.y = 0;
    this.goalDistance = Math.min(this.maxDistance, Math.max(this.minDistance, this.goalDistance));
  }

  /** Zoom by a factor with the ground under (sx, sy) staying put. */
  zoomAt(factor, sx, sy) {
    const before = this.goalDistance;
    this.goalDistance = Math.min(this.maxDistance, Math.max(this.minDistance, before * factor));
    const s = this.goalDistance / before;
    const p = this.groundAt(sx, sy, this.goalTarget, before);
    this.goalTarget.sub(p).multiplyScalar(s).add(p);
    this.clamp(); this.touched = true;
  }

  panBy(dx, dz) { this.goalTarget.x += dx; this.goalTarget.z += dz; this.clamp(); this.touched = true; }

  /** The starting view: centred, at a distance where the whole ground fits the width of the screen. */
  setHome(distance, snap) {
    this.home.distance = distance; this.maxDistance = Math.max(this.maxDistance, distance * 1.3);
    if (snap || !this.touched) { this.goalTarget.set(0, 0, 0); this.goalDistance = distance; if (snap) { this.target.set(0, 0, 0); this.distance = distance; } }
  }
  goHome() { this.goalTarget.set(0, 0, 0); this.goalDistance = this.home.distance; }
  flyTo(x, z, distance) { this.goalTarget.set(x, 0, z); this.goalDistance = distance; this.clamp(); this.touched = true; }

  listen() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, anchor: this.groundAt(e.clientX, e.clientY) });
      this.dragging = false;
    });
    c.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId); if (!p) return;
      if (this.pointers.size === 1) {
        if (!this.dragging && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 4) return;
        this.dragging = true;
        const here = this.groundAt(e.clientX, e.clientY);
        this.goalTarget.add(p.anchor).sub(here); this.clamp(); this.touched = true;
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const wasD = Math.hypot(a.x - b.x, a.y - b.y), wasMx = (a.x + b.x) / 2, wasMy = (a.y + b.y) / 2;
        p.x = e.clientX; p.y = e.clientY;
        const isD = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        this.dragging = true;
        if (wasD > 0 && isD > 0) this.zoomAt(wasD / isD, wasMx, wasMy);
        const from = this.groundAt(wasMx, wasMy), to = this.groundAt(mx, my);
        this.goalTarget.add(from).sub(to); this.clamp();
        return;
      }
      p.x = e.clientX; p.y = e.clientY;
    });
    const up = (e) => { this.pointers.delete(e.pointerId); if (!this.pointers.size) this.dragging = false; };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const k = e.deltaMode === 1 ? 0.05 : 0.0018; // lines vs pixels; a pinch on a trackpad arrives as a wheel with ctrlKey
      this.zoomAt(Math.exp(e.deltaY * (e.ctrlKey ? k * 5 : k)), e.clientX, e.clientY);
    }, { passive: false });
  }

  update() {
    const now = performance.now(), dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    const k = 1 - Math.exp(-dt * 14);
    this.target.lerp(this.goalTarget, k);
    this.distance += (this.goalDistance - this.distance) * k;
    this.camera.position.copy(this.offset).multiplyScalar(this.distance).add(this.target);
    this.camera.lookAt(this.target);
  }
}
