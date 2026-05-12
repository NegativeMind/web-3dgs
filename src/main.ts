import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";

// --- Scene setup ---
const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 1000);
camera.position.set(0, 0, 3);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// --- Spark renderer ---
const spark = new SparkRenderer({ renderer });
scene.add(spark);

// --- Load splat ---
// Replace this URL with your own .ply / .spz / .splat / .ksplat file
const SPLAT_URL = "./3dgs/gmk.sog";

const loadingEl = document.getElementById("loading") as HTMLDivElement;

async function loadSplat(url: string): Promise<void> {
  loadingEl.classList.remove("hidden");
  try {
    const splatMesh = new SplatMesh({ url });
    const mesh3d = splatMesh as unknown as THREE.Object3D;
    mesh3d.rotation.x = Math.PI;
    scene.add(mesh3d);

    await splatMesh.initialized;

    const box = splatMesh.getBoundingBox();
    const center = new THREE.Vector3();
    box.getCenter(center);

    // ローカル空間の中心をワールド空間に変換（rotation.x = π が適用済み）
    scene.updateMatrixWorld();
    center.applyMatrix4(mesh3d.matrixWorld);

    controls.target.copy(center);

    // バウンディングボックスのサイズからカメラ距離を算出
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    const distance = (maxDim / 2) / Math.tan(fov / 2) * 1.5;
    camera.position.copy(center).add(new THREE.Vector3(0, 0, distance));
    controls.update();
  } finally {
    loadingEl.classList.add("hidden");
  }
}

loadSplat(SPLAT_URL);

// --- Resize handler ---
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Render loop ---
renderer.setAnimationLoop(() => {
  controls.update();
  spark.update({ scene, camera });
  renderer.render(scene, camera);
});
