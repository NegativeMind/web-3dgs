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
const XR_DRAG_POSITION_SCALE = 1.2;
const XR_DOLLY_SPEED = 1.8;
const XR_MIN_DISTANCE = 0.05;
const XR_INITIAL_DISTANCE_MULTIPLIER = 1;

let initialViewDistance = 2;
let xrDragController: THREE.Group | undefined;
let xrDragInputSource: XRInputSource | undefined;
let xrDragHeldBySelect = false;
let xrDragInitialized = false;
const xrDragScreenPosition = new THREE.Vector2();
const xrDragViewInverse = new THREE.Matrix4();
let xrDragViewPlaneHeight = 1;
let activeXrSession: XRSession | undefined;
let splatObject: THREE.Object3D | undefined;

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

function placeLocalFrameForCameraWorld(position: THREE.Vector3, quaternion: THREE.Quaternion): void {
  camera.updateMatrix();

  const desiredCameraWorld = new THREE.Matrix4().compose(
    position,
    quaternion,
    new THREE.Vector3(1, 1, 1)
  );
  const inverseCameraLocal = new THREE.Matrix4().copy(camera.matrix).invert();
  const localFrameMatrix = desiredCameraWorld.multiply(inverseCameraLocal);

  localFrameMatrix.decompose(localFrame.position, localFrame.quaternion, localFrame.scale);
  localFrame.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
}

function applyOrbitControlsRotation(deltaX: number, deltaY: number): void {
  const cameraPosition = new THREE.Vector3();
  camera.getWorldPosition(cameraPosition);

  const offset = cameraPosition.sub(controls.target);
  const spherical = new THREE.Spherical().setFromVector3(offset);

  spherical.theta -= TWO_PI * deltaX * controls.rotateSpeed;
  spherical.phi -= TWO_PI * deltaY * controls.rotateSpeed;
  spherical.makeSafe();

  offset.setFromSpherical(spherical);
  const nextPosition = controls.target.clone().add(offset);

  const lookAtMatrix = new THREE.Matrix4().lookAt(nextPosition, controls.target, camera.up);
  const nextQuaternion = new THREE.Quaternion().setFromRotationMatrix(lookAtMatrix);

  placeLocalFrameForCameraWorld(nextPosition, nextQuaternion);
}

function rotateObjectAroundTarget(object: THREE.Object3D, rotation: THREE.Quaternion): void {
  object.position.sub(controls.target);
  object.position.applyQuaternion(rotation);
  object.position.add(controls.target);
  object.quaternion.premultiply(rotation);
  object.updateMatrixWorld(true);
}

function applyObjectRotation(deltaX: number, deltaY: number): void {
  if (!splatObject) return;

  const yaw = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    TWO_PI * deltaX * controls.rotateSpeed
  );

  const cameraWorldQuaternion = new THREE.Quaternion();
  camera.getWorldQuaternion(cameraWorldQuaternion);
  const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraWorldQuaternion).normalize();
  const pitch = new THREE.Quaternion().setFromAxisAngle(
    cameraRight,
    TWO_PI * deltaY * controls.rotateSpeed
  );

  rotateObjectAroundTarget(splatObject, yaw);
  rotateObjectAroundTarget(splatObject, pitch);
}

type XrControllerInput = {
  index: number;
  source: XRInputSource;
  gamepad: Gamepad;
  controller: THREE.Group;
};

const xrControllerObjects = [renderer.xr.getController(0), renderer.xr.getController(1)];
scene.add(...xrControllerObjects);

function resetXrDrag(): void {
  xrDragController = undefined;
  xrDragInputSource = undefined;
  xrDragHeldBySelect = false;
  xrDragInitialized = false;
}

function findControllerForInputSource(inputSource: XRInputSource): THREE.Group | undefined {
  const session = renderer.xr.getSession();
  const index = Array.from(session?.inputSources ?? []).indexOf(inputSource);
  return index >= 0 ? xrControllerObjects[index] ?? renderer.xr.getController(index) : undefined;
}

function beginXrDrag(inputSource: XRInputSource): void {
  xrDragInputSource = inputSource;
  xrDragController = findControllerForInputSource(inputSource);
  xrDragHeldBySelect = true;
  xrDragInitialized = false;
}

function beginXrControllerDrag(controller: THREE.Group, inputSource?: XRInputSource): void {
  xrDragInputSource = inputSource;
  xrDragController = controller;
  xrDragHeldBySelect = false;
  xrDragInitialized = false;
}

function endXrDrag(inputSource: XRInputSource): void {
  if (xrDragInputSource === inputSource) resetXrDrag();
}

function attachXrSessionInputEvents(): void {
  const session = renderer.xr.getSession();
  if (!session || session === activeXrSession) return;

  activeXrSession = session;
  session.addEventListener("selectstart", onXrSelectStart);
  session.addEventListener("selectend", onXrSelectEnd);
  session.addEventListener("squeezestart", onXrSelectStart);
  session.addEventListener("squeezeend", onXrSelectEnd);
  session.addEventListener("end", detachXrSessionInputEvents);
}

function detachXrSessionInputEvents(): void {
  if (!activeXrSession) return;

  activeXrSession.removeEventListener("selectstart", onXrSelectStart);
  activeXrSession.removeEventListener("selectend", onXrSelectEnd);
  activeXrSession.removeEventListener("squeezestart", onXrSelectStart);
  activeXrSession.removeEventListener("squeezeend", onXrSelectEnd);
  activeXrSession.removeEventListener("end", detachXrSessionInputEvents);
  activeXrSession = undefined;
  resetXrDrag();
}

function onXrSelectStart(event: XRInputSourceEvent): void {
  beginXrDrag(event.inputSource);
}

function onXrSelectEnd(event: XRInputSourceEvent): void {
  endXrDrag(event.inputSource);
}

xrControllerObjects.forEach((controller) => {
  controller.addEventListener("selectstart", () => {
    xrDragController = controller;
    xrDragInputSource = undefined;
    xrDragHeldBySelect = true;
    xrDragInitialized = false;
  });
  controller.addEventListener("selectend", () => {
    if (xrDragController === controller) {
      resetXrDrag();
    }
  });
});

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

function getControllerScreenPosition(controller: THREE.Object3D, inverseCamera: THREE.Matrix4, viewPlaneHeight: number): THREE.Vector2 {
  const position = new THREE.Vector3();
  controller.getWorldPosition(position);
  position.applyMatrix4(inverseCamera);

  return new THREE.Vector2(
    position.x * XR_DRAG_POSITION_SCALE / viewPlaneHeight,
    -position.y * XR_DRAG_POSITION_SCALE / viewPlaneHeight
  );
}

function isTriggerPressed(gamepad: Gamepad): boolean {
  const trigger = gamepad.buttons[0];
  const squeeze = gamepad.buttons[1];
  return [trigger, squeeze].some((button) => !!button && (button.pressed || button.value > 0.5));
}

function syncXrDragFromGamepads(inputs: XrControllerInput[]): void {
  if (xrDragController) {
    const activeInput = inputs.find((input) => input.controller === xrDragController);
    if (activeInput && isTriggerPressed(activeInput.gamepad)) return;
    if (xrDragHeldBySelect) return;
    resetXrDrag();
  }

  const triggerInput = inputs.find((input) => isTriggerPressed(input.gamepad));
  if (triggerInput) beginXrControllerDrag(triggerInput.controller, triggerInput.source);
}

function updateXrDragOrbit(inputs: XrControllerInput[]): boolean {
  syncXrDragFromGamepads(inputs);
  const draggingController = xrDragController;

  if (!draggingController) {
    xrDragInitialized = false;
    return false;
  }

  const startedDrag = !xrDragInitialized;

  if (startedDrag) {
    camera.updateMatrixWorld(true);
    xrDragViewInverse.copy(camera.matrixWorld).invert();
    xrDragViewPlaneHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 2;
  }

  const currentScreenPosition = getControllerScreenPosition(draggingController, xrDragViewInverse, xrDragViewPlaneHeight);

  if (startedDrag) {
    xrDragScreenPosition.copy(currentScreenPosition);
    xrDragInitialized = true;
    return true;
  }

  const delta = currentScreenPosition.clone().sub(xrDragScreenPosition);
  xrDragScreenPosition.copy(currentScreenPosition);

  if (delta.lengthSq() === 0) return true;

  applyObjectRotation(delta.x, delta.y);
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
    applyOrbitControlsRotation(
      thumbstick.x * XR_ORBIT_SPEED * deltaTime / TWO_PI,
      thumbstick.y * XR_ORBIT_SPEED * deltaTime / TWO_PI
    );
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
    attachXrSessionInputEvents();
    updateXrButton(true, true);
    controls.enabled = false;
  },
  onExitXr:  () => {
    bakeLocalFrameIntoCamera();
    detachXrSessionInputEvents();
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
    splatObject = mesh3d;

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
    if (splatObject === mesh3d) splatObject = undefined;
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
