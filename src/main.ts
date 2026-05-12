import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { SparkRenderer, SplatMesh, SparkXr } from "@sparkjsdev/spark";

// --- Renderer ---
const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

// --- Scene & Camera ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 1000);

// localFrame は XR の基準フレーム。カメラをその子にすることで
// HMD の移動をシーン全体に反映できる。
const localFrame = new THREE.Group();
scene.add(localFrame);
localFrame.add(camera);

// --- Spark renderer ---
const spark = new SparkRenderer({ renderer });
scene.add(spark);

// --- OrbitControls (デスクトップ操作) ---
// カメラは localFrame の子だが、localFrame が原点にある限り
// OrbitControls の target はワールド座標と一致する。
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// --- XR ---
const xr = new SparkXr({
  renderer,
  onMouseLeaveOpacity: 0.5,
  controllers: {},
  onEnterXr: () => { controls.enabled = false; },
  onExitXr:  () => { controls.enabled = true; },
});

// --- Load splat ---
const SPLAT_URL = "./3dgs/gmk.sog";
const loadingEl = document.getElementById("loading") as HTMLDivElement;

async function loadSplat(url: string): Promise<void> {
  loadingEl.classList.remove("hidden");
  try {
    const splatMesh = new SplatMesh({ url });
    const mesh3d = splatMesh as unknown as THREE.Object3D;
    mesh3d.rotation.x = Math.PI; // COLMAP 座標系補正
    scene.add(mesh3d);

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Load timeout: ${url}`)), 60000)
    );
    await Promise.race([splatMesh.initialized, timeout]);

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

    controls.target.copy(center);
    camera.position.copy(center).add(new THREE.Vector3(0, 0, distance));
    controls.update();
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
  controls.update();
  if (renderer.xr.isPresenting) xr.updateControllers(camera);
  renderer.render(scene, camera);
});
