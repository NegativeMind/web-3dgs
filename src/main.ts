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

const TWO_PI = Math.PI * 2;
const XR_DEADZONE = 0.15;
const XR_ORBIT_SPEED = 1.8;
const XR_DOLLY_SPEED = 1.8;
const XR_MIN_DISTANCE = 0.05;
const XR_INITIAL_DISTANCE_MULTIPLIER = 1;

let initialViewDistance = 2;
let xrDragControllerIndex: number | undefined;
const xrDragScreenPosition = new THREE.Vector2();

function bakeLocalFrameIntoCamera(): void {
  const worldPosition = new THREE.Vector3();
  const worldQuaternion = new THREE.Quaternion();
  camera.getWorldPosition(worldPosition);
  camera.getWorldQuaternion(worldQuaternion);

  localFrame.position.set(0, 0, 0);
  localFrame.quaternion.identity();
  localFrame.scale.set(1, 1, 1);
  localFrame.updateMatrixWorld(true);

  camera.position.copy(worldPosition);
  camera.quaternion.copy(worldQuaternion);
  camera.updateMatrixWorld(true);
  controls.update();
}

function setInitialXrView(): void {
  const cameraWorldPosition = new THREE.Vector3();
  const cameraWorldQuaternion = new THREE.Quaternion();
  camera.getWorldPosition(cameraWorldPosition);
  camera.getWorldQuaternion(cameraWorldQuaternion);

  const viewOffset = cameraWorldPosition.sub(controls.target);
  if (viewOffset.lengthSq() === 0) viewOffset.set(0, 0, initialViewDistance);
  viewOffset.setLength(initialViewDistance * XR_INITIAL_DISTANCE_MULTIPLIER);

  localFrame.position.copy(controls.target).add(viewOffset);
  localFrame.quaternion.copy(cameraWorldQuaternion);
  localFrame.scale.set(1, 1, 1);
  localFrame.updateMatrixWorld(true);

  camera.position.set(0, 0, 0);
  camera.quaternion.identity();
  camera.updateMatrixWorld(true);
}

function applyDeadzone(value: number): number {
  return Math.abs(value) < XR_DEADZONE ? 0 : value;
}

function readThumbstick(gamepad?: Gamepad): THREE.Vector2 {
  if (!gamepad) return new THREE.Vector2();

  const primary = new THREE.Vector2(
    applyDeadzone(gamepad.axes[2] ?? 0),
    applyDeadzone(gamepad.axes[3] ?? 0)
  );
  const fallback = new THREE.Vector2(
    applyDeadzone(gamepad.axes[0] ?? 0),
    applyDeadzone(gamepad.axes[1] ?? 0)
  );

  return primary.lengthSq() >= fallback.lengthSq() ? primary : fallback;
}

type XrControllerInput = {
  index: number;
  source: XRInputSource;
  gamepad: Gamepad;
  controller: THREE.Group;
};

const xrControllerObjects = [renderer.xr.getController(0), renderer.xr.getController(1)];
scene.add(...xrControllerObjects);

function getXrControllerInputs(): XrControllerInput[] {
  const session = renderer.xr.getSession();
  const inputs: XrControllerInput[] = [];
  let index = 0;

  for (const source of session?.inputSources ?? []) {
    if (source.gamepad) {
      inputs.push({
        index,
        source,
        gamepad: source.gamepad,
        controller: xrControllerObjects[index] ?? renderer.xr.getController(index),
      });
    }
    index += 1;
  }

  return inputs;
}

function rotateLocalFrameAroundTarget(rotation: THREE.Quaternion): void {
  localFrame.position.sub(controls.target);
  localFrame.position.applyQuaternion(rotation);
  localFrame.position.add(controls.target);
  localFrame.quaternion.premultiply(rotation);
  localFrame.updateMatrixWorld(true);
}

function getControllerScreenPosition(controller: THREE.Object3D): THREE.Vector2 | null {
  const origin = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const direction = new THREE.Vector3(0, 0, -1);
  const inverseCamera = new THREE.Matrix4().copy(camera.matrixWorld).invert();

  controller.getWorldPosition(origin);
  controller.getWorldQuaternion(quaternion);
  direction.applyQuaternion(quaternion).normalize();

  origin.applyMatrix4(inverseCamera);
  direction.transformDirection(inverseCamera);

  if (direction.z >= -0.0001) return null;

  const distanceToViewPlane = (-1 - origin.z) / direction.z;
  if (distanceToViewPlane <= 0) return null;

  const pointOnViewPlane = origin.add(direction.multiplyScalar(distanceToViewPlane));
  const viewPlaneHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 2;

  return new THREE.Vector2(
    pointOnViewPlane.x / viewPlaneHeight,
    -pointOnViewPlane.y / viewPlaneHeight
  );
}

function updateXrDragOrbit(inputs: XrControllerInput[]): boolean {
  const draggingInput =
    inputs.find((input) => input.index === xrDragControllerIndex && input.gamepad.buttons[0]?.pressed) ??
    inputs.find((input) => input.gamepad.buttons[0]?.pressed);

  if (!draggingInput) {
    xrDragControllerIndex = undefined;
    return false;
  }

  const currentScreenPosition = getControllerScreenPosition(draggingInput.controller);
  if (!currentScreenPosition) return true;

  if (xrDragControllerIndex !== draggingInput.index) {
    xrDragControllerIndex = draggingInput.index;
    xrDragScreenPosition.copy(currentScreenPosition);
    return true;
  }

  const delta = currentScreenPosition.clone().sub(xrDragScreenPosition);
  xrDragScreenPosition.copy(currentScreenPosition);

  if (delta.lengthSq() === 0) return true;

  const rotateSpeed = controls.rotateSpeed;
  const yaw = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    -TWO_PI * delta.x * rotateSpeed
  );

  const cameraWorldQuaternion = new THREE.Quaternion();
  camera.getWorldQuaternion(cameraWorldQuaternion);
  const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraWorldQuaternion).normalize();
  const pitch = new THREE.Quaternion().setFromAxisAngle(
    cameraRight,
    -TWO_PI * delta.y * rotateSpeed
  );

  rotateLocalFrameAroundTarget(yaw);
  rotateLocalFrameAroundTarget(pitch);
  return true;
}

function getActiveThumbstickInput(inputs: XrControllerInput[]): { input?: XrControllerInput; thumbstick: THREE.Vector2 } {
  return inputs.reduce<{ input?: XrControllerInput; thumbstick: THREE.Vector2 }>((active, input) => {
    const thumbstick = readThumbstick(input.gamepad);
    return thumbstick.lengthSq() > active.thumbstick.lengthSq() ? { input, thumbstick } : active;
  }, { thumbstick: new THREE.Vector2() });
}

function updateXrOrbitControls(deltaTime: number): void {
  const inputs = getXrControllerInputs();
  const isDragging = updateXrDragOrbit(inputs);
  const { input, thumbstick } = getActiveThumbstickInput(inputs);
  const isGripPressed = input?.gamepad.buttons[1]?.pressed ?? false;

  if (!isDragging && !isGripPressed && thumbstick.lengthSq() > 0) {
    const yaw = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      -thumbstick.x * XR_ORBIT_SPEED * deltaTime
    );

    const cameraWorldQuaternion = new THREE.Quaternion();
    camera.getWorldQuaternion(cameraWorldQuaternion);
    const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraWorldQuaternion).normalize();
    const pitch = new THREE.Quaternion().setFromAxisAngle(
      cameraRight,
      -thumbstick.y * XR_ORBIT_SPEED * deltaTime
    );

    rotateLocalFrameAroundTarget(yaw);
    rotateLocalFrameAroundTarget(pitch);
  }

  const dollyInput = !isDragging && isGripPressed ? thumbstick.y : 0;
  if (dollyInput !== 0) {
    const cameraPosition = new THREE.Vector3();
    camera.getWorldPosition(cameraPosition);

    const distance = Math.max(cameraPosition.distanceTo(controls.target), XR_MIN_DISTANCE);
    const viewDirection = new THREE.Vector3();
    camera.getWorldDirection(viewDirection);

    const dolly = viewDirection.multiplyScalar(-dollyInput * XR_DOLLY_SPEED * distance * deltaTime);
    localFrame.position.add(dolly);
    localFrame.updateMatrixWorld(true);
  }
}

// --- XR ---
const vrButton = document.getElementById("vr-button") as HTMLButtonElement;
function updateXrButton(supported: boolean, presenting: boolean): void {
  vrButton.disabled = !supported;
  vrButton.textContent = presenting ? "EXIT XR" : "ENTER XR";
}

const xr = new SparkXr({
  renderer,
  element: vrButton,
  onMouseLeaveOpacity: 0.5,
  onReady: (supported) => { updateXrButton(supported, false); },
  onEnterXr: () => {
    setInitialXrView();
    updateXrButton(true, true);
    controls.enabled = false;
  },
  onExitXr:  () => {
    bakeLocalFrameIntoCamera();
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
    initialViewDistance = distance;

    controls.target.copy(center);
    camera.position.copy(center).add(new THREE.Vector3(0, 0, distance));
    controls.update();
  } catch (err) {
    console.error("[3DGS] Failed to load splat:", err);
    if (mesh3d) scene.remove(mesh3d);
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
    updateXrOrbitControls(deltaTime);
  } else {
    controls.update();
  }

  renderer.render(scene, camera);
});
