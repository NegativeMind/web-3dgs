import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  SparkControls,
  SparkRenderer,
  SplatMesh,
  SparkXr,
} from "@sparkjsdev/spark";
import { XrObjectControls } from "./xrObjectControls";

export type ThreeDgsSceneType = "object" | "immersive";

export type ThreeDgsViewerOptions = {
  canvas: HTMLCanvasElement;
  vrButton: HTMLButtonElement;
  loadingElement: HTMLElement;
  splatUrl: string;
  sceneType?: ThreeDgsSceneType;
};

export class ThreeDgsViewer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly sceneType: ThreeDgsSceneType;
  readonly orbitControls?: OrbitControls;
  readonly sparkControls?: SparkControls;

  private readonly spark: SparkRenderer;
  private readonly localFrame = new THREE.Group();
  private readonly xrObjectControls?: XrObjectControls;
  private readonly xr: SparkXr;
  private splatMesh?: SplatMesh;
  private splatObject?: THREE.Object3D;
  private lastFrameTime = performance.now();
  private disposed = false;

  constructor(private readonly options: ThreeDgsViewerOptions) {
    this.sceneType = options.sceneType ?? "object";

    this.renderer = new THREE.WebGLRenderer({
      canvas: options.canvas,
      antialias: true,
      alpha: true,
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.scene = new THREE.Scene();
    this.scene.background = null;

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.01,
      1000
    );

    this.scene.add(this.localFrame);
    this.localFrame.add(this.camera);

    this.spark = new SparkRenderer({ renderer: this.renderer });
    this.scene.add(this.spark);

    if (this.sceneType === "object") {
      this.orbitControls = new OrbitControls(this.camera, options.canvas);
      this.orbitControls.enableDamping = true;
      this.orbitControls.dampingFactor = 0.05;

      this.xrObjectControls = new XrObjectControls({
        renderer: this.renderer,
        scene: this.scene,
        camera: this.camera,
        localFrame: this.localFrame,
        orbitControls: this.orbitControls,
      });
    } else {
      this.sparkControls = new SparkControls({ canvas: options.canvas });
      this.sparkControls.fpsMovement.xr = this.renderer.xr;
    }

    this.xr = new SparkXr({
      renderer: this.renderer,
      element: options.vrButton,
      mode: "arvr",
      referenceSpaceType: "local-floor",
      onMouseLeaveOpacity: 0.5,
      onReady: (supported) => {
        this.updateXrButton(supported, false);
      },
      onEnterXr: () => {
        this.xrObjectControls?.enterXr();
        this.updateXrButton(true, true);
        if (this.orbitControls) this.orbitControls.enabled = false;
        if (this.sparkControls) this.sparkControls.pointerControls.enable = false;
      },
      onExitXr: () => {
        this.xrObjectControls?.exitXr();
        this.updateXrButton(this.xr.xrSupported(), false);
        if (this.orbitControls) this.orbitControls.enabled = true;
        if (this.sparkControls) this.sparkControls.pointerControls.enable = true;
      },
    });

    window.addEventListener("resize", this.resize);
  }

  async start(): Promise<void> {
    await this.loadSplat(this.options.splatUrl);
    this.renderer.setAnimationLoop(this.render);
  }

  dispose(): void {
    this.disposed = true;
    window.removeEventListener("resize", this.resize);
    this.renderer.setAnimationLoop(null);
    this.orbitControls?.dispose();
    this.clearSplat();
    this.renderer.dispose();
  }

  private updateXrButton(supported: boolean, presenting: boolean): void {
    this.options.vrButton.disabled = !supported;
    this.options.vrButton.textContent = presenting ? "EXIT XR" : "ENTER XR";
  }

  private async loadSplat(url: string): Promise<void> {
    this.options.loadingElement.classList.remove("hidden");
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      this.clearSplat();

      const splatMesh = new SplatMesh({ url });
      const mesh3d = splatMesh as unknown as THREE.Object3D;
      mesh3d.rotation.x = Math.PI;
      this.scene.add(mesh3d);
      this.xrObjectControls?.setObject(mesh3d);
      this.splatMesh = splatMesh;
      this.splatObject = mesh3d;

      const timeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`Load timeout: ${url}`)), 60000);
      });
      await Promise.race([splatMesh.initialized, timeout]);

      if (this.sceneType === "object") this.fitCameraToSplat(splatMesh, mesh3d);
    } catch (err) {
      console.error("[3DGS] Failed to load splat:", err);
      this.clearSplat();
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      this.options.loadingElement.classList.add("hidden");
    }
  }

  private fitCameraToSplat(splatMesh: SplatMesh, mesh3d: THREE.Object3D): void {
    const box = splatMesh.getBoundingBox();
    const center = new THREE.Vector3();
    box.getCenter(center);
    this.scene.updateMatrixWorld();
    center.applyMatrix4(mesh3d.matrixWorld);

    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const distance = (maxDim / 2) / Math.tan(fov / 2) * 1.5;
    this.xrObjectControls?.setInitialViewDistance(distance);

    if (!this.orbitControls) return;

    this.orbitControls.target.copy(center);
    this.camera.position.copy(center).add(new THREE.Vector3(0, 0, distance));
    this.orbitControls.update();
  }

  private clearSplat(): void {
    if (this.splatObject) this.scene.remove(this.splatObject);
    this.xrObjectControls?.setObject(undefined);
    this.splatMesh?.dispose();
    this.splatMesh = undefined;
    this.splatObject = undefined;
  }

  private resize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  private render = (): void => {
    if (this.disposed) return;

    const now = performance.now();
    const deltaTime = Math.min((now - this.lastFrameTime) / 1000, 0.1);
    this.lastFrameTime = now;

    if (this.renderer.xr.isPresenting && this.xrObjectControls) {
      this.xrObjectControls?.update(deltaTime);
    } else if (this.orbitControls) {
      this.orbitControls.update();
    } else {
      this.sparkControls?.update(this.localFrame, this.camera);
    }

    this.renderer.render(this.scene, this.camera);
  };
}
