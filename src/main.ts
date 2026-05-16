import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { SparkRenderer, SplatMesh, SparkXr } from "@sparkjsdev/spark";
import { XrObjectControls } from "./xrObjectControls";

// --- Renderer ---
const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

// --- Scene & Camera ---
const scene = new THREE.Scene();
scene.background = null;

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

const xrObjectControls = new XrObjectControls({
  renderer,
  scene,
  camera,
  localFrame,
  orbitControls: controls,
});

// --- XR ---
const vrButton = document.getElementById("vr-button") as HTMLButtonElement;
function updateXrButton(supported: boolean, presenting: boolean): void {
  vrButton.disabled = !supported;
  vrButton.textContent = presenting ? "EXIT XR" : "ENTER XR";
}

const xr = new SparkXr({
  renderer,
  element: vrButton,
  mode: "arvr",
  referenceSpaceType: "local-floor",
  onMouseLeaveOpacity: 0.5,
  onReady: (supported) => { updateXrButton(supported, false); },
  onEnterXr: () => {
    xrObjectControls.enterXr();
    updateXrButton(true, true);
    controls.enabled = false;
  },
  onExitXr:  () => {
    xrObjectControls.exitXr();
    updateXrButton(xr.xrSupported(), false);
    controls.enabled = true;
  },
});

// --- Load splat ---
const SPLAT_URL = "./3dgs/gmk.sog";
const loadingEl = document.getElementById("loading") as HTMLDivElement;

async function loadSplat(url: string): Promise<void> {
  loadingEl.classList.remove("hidden");
  let splatMesh: SplatMesh | undefined;
  let mesh3d: THREE.Object3D | undefined;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    splatMesh = new SplatMesh({ url });
    mesh3d = splatMesh as unknown as THREE.Object3D;
    mesh3d.rotation.x = Math.PI; // COLMAP 座標系補正
    scene.add(mesh3d);
    xrObjectControls.setObject(mesh3d);

    const timeout = new Promise<never>((_, reject) =>
      timeoutId = setTimeout(() => reject(new Error(`Load timeout: ${url}`)), 60000)
    );
    await Promise.race([splatMesh.initialized, timeout]);
    if (timeoutId) clearTimeout(timeoutId);

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
    xrObjectControls.setInitialViewDistance(distance);

    controls.target.copy(center);
    camera.position.copy(center).add(new THREE.Vector3(0, 0, distance));
    controls.update();
  } catch (err) {
    console.error("[3DGS] Failed to load splat:", err);
    if (mesh3d) scene.remove(mesh3d);
    xrObjectControls.setObject(undefined);
    splatMesh?.dispose();
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
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
let lastFrameTime = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const deltaTime = Math.min((now - lastFrameTime) / 1000, 0.1);
  lastFrameTime = now;

  if (renderer.xr.isPresenting) {
    xrObjectControls.update(deltaTime);
  } else {
    controls.update();
  }

  renderer.render(scene, camera);
});
