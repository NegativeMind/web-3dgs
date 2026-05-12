import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { SparkRenderer, SplatMesh, SparkXr } from "@sparkjsdev/spark";

// --- Scene setup ---
const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;

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

// --- VR button (shown only after splat is loaded AND XR is supported) ---
const vrButtonEl = document.getElementById("vr-button") as HTMLButtonElement;
let splatLoaded = false;
let xrSupported = false;

function updateVrButton(): void {
  if (splatLoaded && xrSupported) vrButtonEl.disabled = false;
}

// --- XR ---
const sparkXr = new SparkXr({
  renderer,
  mode: "vr",
  button: false,
  referenceSpaceType: "local-floor",
  controllers: {},
  onReady: (supported) => {
    xrSupported = supported;
    if (!supported) vrButtonEl.style.display = "none";
    else updateVrButton();
  },
  onEnterXr: () => {
    controls.enabled = false;
    vrButtonEl.textContent = "Exit VR";
  },
  onExitXr: () => {
    controls.enabled = true;
    vrButtonEl.textContent = "Enter VR";
  },
});

vrButtonEl.addEventListener("click", () => sparkXr.toggleXr());

// --- Load splat ---
const SPLAT_URL = "./3dgs/gmk.sog";
const loadingEl = document.getElementById("loading") as HTMLDivElement;

async function loadSplat(url: string): Promise<void> {
  loadingEl.classList.remove("hidden");
  try {
    const splatMesh = new SplatMesh({ url });
    const mesh3d = splatMesh as unknown as THREE.Object3D;
    mesh3d.rotation.x = Math.PI;
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

    controls.target.copy(center);

    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    const distance = (maxDim / 2) / Math.tan(fov / 2) * 1.5;
    camera.position.copy(center).add(new THREE.Vector3(0, 0, distance));
    controls.update();

    splatLoaded = true;
    updateVrButton();
  } catch (err) {
    console.error("[3DGS] Failed to load splat:", err);
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
  const activeCamera = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  if (renderer.xr.isPresenting) sparkXr.updateControllers(activeCamera);
  spark.update({ scene, camera: activeCamera });
  renderer.render(scene, camera);
});
