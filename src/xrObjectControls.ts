import * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";

const TWO_PI = Math.PI * 2;
const XR_DEADZONE = 0.15;
const XR_DRAG_POSITION_SCALE = 3.0;
const XR_DOLLY_SPEED = 1.8;
const XR_MIN_DISTANCE = 0.05;
const XR_INITIAL_DISTANCE_MULTIPLIER = 1;
const XR_SPIN_DAMPING = 1.4;
const XR_SPIN_STOP_EPSILON = 0.000001;

type XrControllerInput = {
  source: XRInputSource;
  gamepad: Gamepad;
  controller: THREE.Group;
};

type XrObjectControlsOptions = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  localFrame: THREE.Group;
  orbitControls: OrbitControls;
};

function addXrControllerEventListener(
  controller: THREE.Group,
  type: "selectstart" | "selectend",
  listener: () => void
): void {
  controller.addEventListener(type as never, listener as never);
}

export class XrObjectControls {
  private initialViewDistance = 2;
  private object?: THREE.Object3D;
  private dragController?: THREE.Group;
  private dragInputSource?: XRInputSource;
  private dragHeldBySelect = false;
  private dragInitialized = false;
  private readonly dragScreenPosition = new THREE.Vector2();
  private readonly dragViewInverse = new THREE.Matrix4();
  private dragViewPlaneHeight = 1;
  private activeSession?: XRSession;
  private readonly spinVelocity = new THREE.Vector2();
  private readonly controllers: THREE.Group[];

  constructor(private readonly options: XrObjectControlsOptions) {
    this.controllers = [
      options.renderer.xr.getController(0),
      options.renderer.xr.getController(1),
    ];
    options.scene.add(...this.controllers);

    this.controllers.forEach((controller) => {
      addXrControllerEventListener(controller, "selectstart", () => {
        this.dragController = controller;
        this.dragInputSource = undefined;
        this.dragHeldBySelect = true;
        this.dragInitialized = false;
      });
      addXrControllerEventListener(controller, "selectend", () => {
        if (this.dragController === controller) this.resetDrag();
      });
    });
  }

  setObject(object: THREE.Object3D | undefined): void {
    this.object = object;
  }

  setInitialViewDistance(distance: number): void {
    this.initialViewDistance = distance;
  }

  enterXr(): void {
    this.setInitialXrView();
    this.attachSessionInputEvents();
  }

  exitXr(): void {
    this.bakeLocalFrameIntoCamera();
    this.detachSessionInputEvents();
  }

  update(deltaTime: number): void {
    const inputs = this.getControllerInputs();
    const isDragging = this.updateDrag(inputs);
    const { thumbstick } = this.getActiveThumbstickInput(inputs);
    const dollyInput = isDragging ? 0 : thumbstick.y;

    if (dollyInput !== 0) this.applyDolly(dollyInput, deltaTime);
    this.updateSpin(deltaTime);
  }

  private bakeLocalFrameIntoCamera(): void {
    const { camera, localFrame, orbitControls } = this.options;
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
    orbitControls.update();
  }

  private setInitialXrView(): void {
    const { camera, localFrame, orbitControls } = this.options;
    const cameraWorldPosition = new THREE.Vector3();
    const cameraWorldQuaternion = new THREE.Quaternion();
    camera.getWorldPosition(cameraWorldPosition);
    camera.getWorldQuaternion(cameraWorldQuaternion);

    const viewOffset = cameraWorldPosition.sub(orbitControls.target);
    if (viewOffset.lengthSq() === 0) viewOffset.set(0, 0, this.initialViewDistance);
    viewOffset.setLength(this.initialViewDistance * XR_INITIAL_DISTANCE_MULTIPLIER);

    localFrame.position.copy(orbitControls.target).add(viewOffset);
    localFrame.quaternion.copy(cameraWorldQuaternion);
    localFrame.scale.set(1, 1, 1);
    localFrame.updateMatrixWorld(true);

    camera.position.set(0, 0, 0);
    camera.quaternion.identity();
    camera.updateMatrixWorld(true);
  }

  private attachSessionInputEvents(): void {
    const session = this.options.renderer.xr.getSession();
    if (!session || session === this.activeSession) return;

    this.activeSession = session;
    session.addEventListener("selectstart", this.onSelectStart);
    session.addEventListener("selectend", this.onSelectEnd);
    session.addEventListener("squeezestart", this.onSelectStart);
    session.addEventListener("squeezeend", this.onSelectEnd);
    session.addEventListener("end", this.detachSessionInputEvents);
  }

  private detachSessionInputEvents = (): void => {
    if (!this.activeSession) return;

    this.activeSession.removeEventListener("selectstart", this.onSelectStart);
    this.activeSession.removeEventListener("selectend", this.onSelectEnd);
    this.activeSession.removeEventListener("squeezestart", this.onSelectStart);
    this.activeSession.removeEventListener("squeezeend", this.onSelectEnd);
    this.activeSession.removeEventListener("end", this.detachSessionInputEvents);
    this.activeSession = undefined;
    this.resetDrag();
  };

  private onSelectStart = (event: XRInputSourceEvent): void => {
    this.dragInputSource = event.inputSource;
    this.dragController = this.findControllerForInputSource(event.inputSource);
    this.dragHeldBySelect = true;
    this.dragInitialized = false;
  };

  private onSelectEnd = (event: XRInputSourceEvent): void => {
    if (this.dragInputSource === event.inputSource) this.resetDrag();
  };

  private resetDrag(): void {
    this.dragController = undefined;
    this.dragInputSource = undefined;
    this.dragHeldBySelect = false;
    this.dragInitialized = false;
  }

  private findControllerForInputSource(inputSource: XRInputSource): THREE.Group | undefined {
    const session = this.options.renderer.xr.getSession();
    const index = Array.from(session?.inputSources ?? []).indexOf(inputSource);
    return index >= 0 ? this.controllers[index] ?? this.options.renderer.xr.getController(index) : undefined;
  }

  private getControllerInputs(): XrControllerInput[] {
    const session = this.options.renderer.xr.getSession();
    const inputs: XrControllerInput[] = [];
    let index = 0;

    for (const source of session?.inputSources ?? []) {
      if (source.gamepad) {
        inputs.push({
          source,
          gamepad: source.gamepad,
          controller: this.controllers[index] ?? this.options.renderer.xr.getController(index),
        });
      }
      index += 1;
    }

    return inputs;
  }

  private updateDrag(inputs: XrControllerInput[]): boolean {
    this.syncDragFromGamepads(inputs);
    const draggingController = this.dragController;

    if (!draggingController) {
      this.dragInitialized = false;
      return false;
    }

    const startedDrag = !this.dragInitialized;
    if (startedDrag) this.captureDragView();

    const currentScreenPosition = this.getControllerScreenPosition(draggingController);

    if (startedDrag) {
      this.dragScreenPosition.copy(currentScreenPosition);
      this.dragInitialized = true;
      return true;
    }

    const delta = currentScreenPosition.clone().sub(this.dragScreenPosition);
    this.dragScreenPosition.copy(currentScreenPosition);
    if (delta.lengthSq() === 0) return true;

    if (Math.abs(delta.x) > Math.abs(delta.y) * 1.25) delta.y = 0;
    if (Math.abs(delta.y) > Math.abs(delta.x) * 1.25) delta.x = 0;

    this.spinVelocity.copy(delta).multiplyScalar(60);
    this.applyObjectRotation(delta.x, delta.y);
    return true;
  }

  private captureDragView(): void {
    const { camera } = this.options;
    camera.updateMatrixWorld(true);
    this.dragViewInverse.copy(camera.matrixWorld).invert();
    this.dragViewPlaneHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 2;
  }

  private getControllerScreenPosition(controller: THREE.Object3D): THREE.Vector2 {
    const position = new THREE.Vector3();
    controller.getWorldPosition(position);
    position.applyMatrix4(this.dragViewInverse);

    return new THREE.Vector2(
      position.x * XR_DRAG_POSITION_SCALE / this.dragViewPlaneHeight,
      -position.y * XR_DRAG_POSITION_SCALE / this.dragViewPlaneHeight
    );
  }

  private syncDragFromGamepads(inputs: XrControllerInput[]): void {
    if (this.dragController) {
      const activeInput = inputs.find((input) => input.controller === this.dragController);
      if (activeInput && this.isTriggerPressed(activeInput.gamepad)) return;
      if (this.dragHeldBySelect) return;
      this.resetDrag();
    }

    const triggerInput = inputs.find((input) => this.isTriggerPressed(input.gamepad));
    if (triggerInput) {
      this.dragInputSource = triggerInput.source;
      this.dragController = triggerInput.controller;
      this.dragHeldBySelect = false;
      this.dragInitialized = false;
    }
  }

  private isTriggerPressed(gamepad: Gamepad): boolean {
    const trigger = gamepad.buttons[0];
    const squeeze = gamepad.buttons[1];
    return [trigger, squeeze].some((button) => !!button && (button.pressed || button.value > 0.5));
  }

  private getActiveThumbstickInput(inputs: XrControllerInput[]): { thumbstick: THREE.Vector2 } {
    return inputs.reduce<{ thumbstick: THREE.Vector2 }>((active, input) => {
      const thumbstick = this.readThumbstick(input.gamepad);
      return thumbstick.lengthSq() > active.thumbstick.lengthSq() ? { thumbstick } : active;
    }, { thumbstick: new THREE.Vector2() });
  }

  private readThumbstick(gamepad?: Gamepad): THREE.Vector2 {
    if (!gamepad) return new THREE.Vector2();

    const primary = new THREE.Vector2(
      this.applyDeadzone(gamepad.axes[2] ?? 0),
      this.applyDeadzone(gamepad.axes[3] ?? 0)
    );
    const fallback = new THREE.Vector2(
      this.applyDeadzone(gamepad.axes[0] ?? 0),
      this.applyDeadzone(gamepad.axes[1] ?? 0)
    );

    return primary.lengthSq() >= fallback.lengthSq() ? primary : fallback;
  }

  private applyDeadzone(value: number): number {
    return Math.abs(value) < XR_DEADZONE ? 0 : value;
  }

  private rotateObjectAroundTarget(rotation: THREE.Quaternion): void {
    const { orbitControls } = this.options;
    if (!this.object) return;

    this.object.position.sub(orbitControls.target);
    this.object.position.applyQuaternion(rotation);
    this.object.position.add(orbitControls.target);
    this.object.quaternion.premultiply(rotation);
    this.object.updateMatrixWorld(true);
  }

  private applyObjectRotation(deltaX: number, deltaY: number): void {
    const { camera, orbitControls } = this.options;
    if (!this.object) return;

    if (deltaX !== 0) {
      const yaw = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        TWO_PI * deltaX * orbitControls.rotateSpeed
      );
      this.rotateObjectAroundTarget(yaw);
    }

    if (deltaY !== 0) {
      const cameraWorldQuaternion = new THREE.Quaternion();
      camera.getWorldQuaternion(cameraWorldQuaternion);
      const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraWorldQuaternion);
      cameraRight.y = 0;

      if (cameraRight.lengthSq() > 0) {
        cameraRight.normalize();
        const pitch = new THREE.Quaternion().setFromAxisAngle(
          cameraRight,
          TWO_PI * deltaY * orbitControls.rotateSpeed
        );
        this.rotateObjectAroundTarget(pitch);
      }
    }
  }

  private updateSpin(deltaTime: number): void {
    if (this.dragController || this.spinVelocity.lengthSq() < XR_SPIN_STOP_EPSILON) return;

    this.applyObjectRotation(this.spinVelocity.x * deltaTime, this.spinVelocity.y * deltaTime);
    this.spinVelocity.multiplyScalar(Math.exp(-XR_SPIN_DAMPING * deltaTime));
  }

  private applyDolly(dollyInput: number, deltaTime: number): void {
    const { camera, localFrame, orbitControls } = this.options;
    const cameraPosition = new THREE.Vector3();
    camera.getWorldPosition(cameraPosition);

    const distance = Math.max(cameraPosition.distanceTo(orbitControls.target), XR_MIN_DISTANCE);
    const viewDirection = new THREE.Vector3();
    camera.getWorldDirection(viewDirection);

    const dolly = viewDirection.multiplyScalar(-dollyInput * XR_DOLLY_SPEED * distance * deltaTime);
    localFrame.position.add(dolly);
    localFrame.updateMatrixWorld(true);
  }
}
