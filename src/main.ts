import * as THREE from "three";
import { SparkRenderer, SplatMesh, SparkControls, SparkXr } from "@sparkjsdev/spark";

// --- Renderer ---
const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

// --- Scene & Camera ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 1000);

// localFrame はカメラの親グループ。SparkControls と SparkXr はこれを動かす。
const localFrame = new THREE.Group();
scene.add(localFrame);
localFrame.add(camera);

// --- Spark renderer ---
const spark = new SparkRenderer({ renderer });
scene.add(spark);

// --- Controls (desktop: FPS マウス＋キーボード) ---
const controls = new SparkControls({ canvas });

// --- XR (Enter VR ボタンは SparkXr が自動生成) ---
const xr = new SparkXr({
  renderer,
  onMouseLeaveOpacity: 0.5,
  controllers: {},
});

// --- Load splat ---
const SPLAT_URL = "./3dgs/gmk.sog";
const loadingEl = document.getElementById("loading") as HTMLDivElement;

async function loadSplat(url: string): Promise<void> {
  loadingEl.classList.remove("hidden");
  try {
    const splatMesh = new SplatMesh({ url });
    const mesh3d = splatMesh as unknown as THREE.Object3D;
    // COLMAP SfM データは Y 軸下向きのため補正
    mesh3d.rotation.x = Math.PI;
    scene.add(mesh3d);

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Load timeout: ${url}`)), 60000)
    );
    await Promise.race([splatMesh.initialized, timeout]);

    // バウンディングボックス中心に localFrame を配置
    const box = splatMesh.getBoundingBox();
    const center = new THREE.Vector3();
    box.getCenter(center);
    scene.updateMatrixWorld();
    center.applyMatrix4(mesh3d.matrixWorld);

    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    const distance = (maxDim / 2) / Math.tan(fov / 2) * 1.5;

    localFrame.position.set(center.x, center.y, center.z + distance);
  } catch (err) {
    console.error("[3DGS] Failed to load splat:", err);
  } finally {
    loadingEl.classList.add("hidden");
  }
}

loadSplat(SPLAT_URL);

// --- Resize ---
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Render loop ---
renderer.setAnimationLoop(() => {
  xr.updateControllers(camera);
  controls.update(localFrame);
  renderer.render(scene, camera);
});
