import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  SparkControls,
  SparkRenderer,
  SplatMesh,
  SparkXr,
} from "@sparkjsdev/spark";
import { MeshBVH, type ExtendedTriangle } from "three-mesh-bvh";
import { XrObjectControls } from "./xrObjectControls";

export type SplatSceneType = "object" | "immersive";

export type SplatViewerOptions = {
  canvas: HTMLCanvasElement;
  vrButton: HTMLButtonElement;
  loadingElement: HTMLElement;
  splatUrl: string;
  sceneType?: SplatSceneType;
  /** URL to a .collision.glb file for BVH-based collision detection. */
  collisionUrl?: string;
  /** Show collision mesh as green wireframe for debugging. Default: false. */
  debugCollision?: boolean;
  /** If provided, sizes the renderer to this element instead of the window. */
  container?: HTMLElement;
};

export class SplatViewer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly sceneType: SplatSceneType;
  readonly orbitControls?: OrbitControls;
  readonly sparkControls?: SparkControls;

  private readonly spark: SparkRenderer;
  private readonly localFrame = new THREE.Group();
  private readonly xrObjectControls?: XrObjectControls;
  private readonly xr: SparkXr;
  private readonly cameraCollisionRadius = 0.15;
  collisionMesh?: THREE.Group;
  private _lastDebugTime = 0;
  private readonly prevCamWorld = new THREE.Vector3();

  private splatMesh?: SplatMesh;
  private splatObject?: THREE.Object3D;
  private lastFrameTime = performance.now();
  private disposed = false;
  private resizeObserver?: ResizeObserver;

  constructor(private readonly options: SplatViewerOptions) {
    this.sceneType = options.sceneType ?? "object";

    this.renderer = new THREE.WebGLRenderer({
      canvas: options.canvas,
      antialias: true,
      alpha: true,
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.viewportWidth, this.viewportHeight);

    this.scene = new THREE.Scene();
    this.scene.background = null;

    this.camera = new THREE.PerspectiveCamera(
      60,
      this.viewportWidth / this.viewportHeight,
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
      this.sparkControls.pointerControls.reverseRotate = true;
      this.sparkControls.pointerControls.reverseSlide = true;
      this.sparkControls.pointerControls.reverseSwipe = false;
      this.sparkControls.pointerControls.reverseScroll = false;
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

    if (options.container) {
      this.resizeObserver = new ResizeObserver(this.resize);
      this.resizeObserver.observe(options.container);
    } else {
      window.addEventListener("resize", this.resize);
    }
  }

  private get viewportWidth(): number {
    return Math.max(1, this.options.container?.clientWidth ?? window.innerWidth);
  }

  private get viewportHeight(): number {
    return Math.max(1, this.options.container?.clientHeight ?? window.innerHeight);
  }

  async start(): Promise<void> {
    const tasks: Promise<void>[] = [this.loadSplat(this.options.splatUrl)];
    if (this.options.collisionUrl) tasks.push(this.loadCollision(this.options.collisionUrl));
    await Promise.all(tasks);
    this.renderer.setAnimationLoop(this.render);
  }

  dispose(): void {
    this.disposed = true;
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = undefined;
    } else {
      window.removeEventListener("resize", this.resize);
    }
    this.renderer.setAnimationLoop(null);
    this.orbitControls?.dispose();
    this.clearSplat();
    this.clearCollision();
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

  private applyCameraCollision(): void {
    if (!this.collisionMesh) {
      const now = performance.now();
      if (now - this._lastDebugTime > 3000) {
        console.warn("[3DGS collision] collisionMesh is null — no collision active");
        this._lastDebugTime = now;
      }
      return;
    }

    // Capsule sweep: segment from camera position before controls ran (prevCamWorld)
    // to position after controls ran (camWorldAfter).  This catches tunneling when
    // the camera moves more than the sphere radius in a single frame.
    const camWorldAfter = this.camera.getWorldPosition(new THREE.Vector3());
    const camWorldAfterOrig = camWorldAfter.clone();

    this.collisionMesh.updateWorldMatrix(true, true);

    const triPoint = new THREE.Vector3();
    const segPoint = new THREE.Vector3();
    const pushDir = new THREE.Vector3();
    const r = this.cameraCollisionRadius;
    let totalHits = 0;
    let meshNodeCount = 0;

    this.collisionMesh.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      if (!node.geometry.boundsTree) {
        console.warn(`[3DGS collision] node "${node.name}" has no boundsTree`);
        return;
      }
      meshNodeCount++;
      const bvh = node.geometry.boundsTree as MeshBVH;
      const invMat = node.matrixWorld.clone().invert();

      // Transform sweep segment into this mesh's local space
      const segStart = this.prevCamWorld.clone().applyMatrix4(invMat);
      const segEnd   = camWorldAfter.clone().applyMatrix4(invMat);
      const segment  = new THREE.Line3(segStart, segEnd);

      // AABB enclosing the whole capsule for fast BVH node rejection
      const capsuleBox = new THREE.Box3().makeEmpty();
      capsuleBox.expandByPoint(segStart);
      capsuleBox.expandByPoint(segEnd);
      capsuleBox.min.subScalar(r);
      capsuleBox.max.addScalar(r);

      bvh.shapecast({
        intersectsBounds: (box) => box.intersectsBox(capsuleBox),
        intersectsTriangle: (tri) => {
          const distance = (tri as unknown as ExtendedTriangle).closestPointToSegment(
            segment, triPoint, segPoint
          );
          if (distance < r) {
            totalHits++;
            const depth = r - distance;
            pushDir.subVectors(segPoint, triPoint);
            if (pushDir.lengthSq() < 1e-10) tri.getNormal(pushDir);
            else pushDir.normalize();
            // Push both capsule endpoints uniformly so the segment stays intact
            segStart.addScaledVector(pushDir, depth);
            segEnd.addScaledVector(pushDir, depth);
            capsuleBox.min.addScaledVector(pushDir, depth);
            capsuleBox.max.addScaledVector(pushDir, depth);
          }
        },
      });

      // Convert pushed segment end back to world space
      camWorldAfter.copy(segEnd).applyMatrix4(node.matrixWorld);
    });

    const now = performance.now();
    if (now - this._lastDebugTime > 3000) {
      const c = camWorldAfterOrig;
      console.log(
        `[3DGS collision] nodes=${meshNodeCount} ` +
        `cam=(${c.x.toFixed(2)},${c.y.toFixed(2)},${c.z.toFixed(2)}) ` +
        `hits=${totalHits} push=${camWorldAfter.distanceTo(camWorldAfterOrig).toFixed(4)}`
      );
      this._lastDebugTime = now;
    }

    const delta = new THREE.Vector3().subVectors(camWorldAfter, camWorldAfterOrig);
    if (delta.lengthSq() < 1e-10) return;

    console.log(`[3DGS collision] PUSH len=${delta.length().toFixed(4)} delta=(${delta.x.toFixed(3)},${delta.y.toFixed(3)},${delta.z.toFixed(3)})`);

    if (this.orbitControls) {
      // Move camera AND orbit target by the same world-space delta so OrbitControls
      // recomputes the same camera-to-target offset next frame (no fighting).
      this.localFrame.worldToLocal(camWorldAfter);
      this.camera.position.copy(camWorldAfter);
      this.orbitControls.target.add(delta);
    } else {
      // SparkControls / XR: push the movement frame so controls continue from the
      // corrected position next frame.
      this.localFrame.position.add(delta);
    }
  }

  private clearSplat(): void {
    if (this.splatObject) this.scene.remove(this.splatObject);
    this.xrObjectControls?.setObject(undefined);
    this.splatMesh?.dispose();
    this.splatMesh = undefined;
    this.splatObject = undefined;
  }

  private async loadCollision(url: string): Promise<void> {
    try {
      const result = await new GLTFLoader().loadAsync(url);
      const group = result.scene;
      group.rotation.y = Math.PI;
      let meshCount = 0;
      group.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        node.geometry.boundsTree = new MeshBVH(node.geometry);
        if (this.options.debugCollision) {
          node.material = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true, transparent: true, opacity: 0.5 });
          node.visible = true;
        } else {
          node.visible = false;
        }
        meshCount++;
        console.log(
          `[3DGS collision] BVH built: "${node.name}" ` +
          `tris=${node.geometry.index ? node.geometry.index.count / 3 : node.geometry.attributes.position.count / 3}`
        );
      });
      this.scene.add(group);
      group.updateMatrixWorld(true);
      const worldBox = new THREE.Box3().setFromObject(group);
      console.log(
        `[3DGS collision] loaded ${meshCount} mesh(es). ` +
        `world box: min=${worldBox.min.toArray().map(v => v.toFixed(2))} ` +
        `max=${worldBox.max.toArray().map(v => v.toFixed(2))}`
      );
      this.collisionMesh = group;
    } catch (err) {
      console.error("[3DGS] Failed to load collision mesh:", err);
    }
  }

  private clearCollision(): void {
    if (!this.collisionMesh) return;
    this.scene.remove(this.collisionMesh);
    this.collisionMesh.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      node.geometry.boundsTree = undefined;
      node.geometry.dispose();
      if (Array.isArray(node.material)) node.material.forEach((m) => m.dispose());
      else node.material.dispose();
    });
    this.collisionMesh = undefined;
  }

  private resize = (): void => {
    const w = this.viewportWidth;
    const h = this.viewportHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private render = (): void => {
    if (this.disposed) return;

    const now = performance.now();
    const deltaTime = Math.min((now - this.lastFrameTime) / 1000, 0.1);
    this.lastFrameTime = now;

    // Save world position BEFORE controls move the camera (used by capsule sweep)
    this.camera.getWorldPosition(this.prevCamWorld);

    if (this.renderer.xr.isPresenting && this.xrObjectControls) {
      this.xrObjectControls?.update(deltaTime);
    } else if (this.orbitControls) {
      this.orbitControls.update();
    } else {
      this.sparkControls?.update(this.localFrame, this.camera);
    }

    this.applyCameraCollision();

    this.renderer.render(this.scene, this.camera);
  };
}
