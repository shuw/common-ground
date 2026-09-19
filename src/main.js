import * as THREE from 'three';
import { place, EXTENT } from './space.js';

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f1316);
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
camera.position.set(0, EXTENT * 1.1, EXTENT * 0.9);
camera.lookAt(0, 0, 0);

// A first, empty ground: the unit square drawn as a faint frame, so the placement function has something to place.
const frame = new THREE.LineLoop(
  new THREE.BufferGeometry().setFromPoints([place(0, 0), place(1, 0), place(1, 1), place(0, 1)]),
  new THREE.LineBasicMaterial({ color: 0x2a3138 }),
);
scene.add(frame);

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

function frameLoop() {
  requestAnimationFrame(frameLoop);
  renderer.render(scene, camera);
}
requestAnimationFrame(frameLoop);
document.getElementById('loading').classList.add('gone');
