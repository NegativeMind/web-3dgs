import { ThreeDgsViewer, type ThreeDgsSceneType } from "./3dgs-viewer";

const app = document.getElementById("app") as HTMLDivElement;
const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const vrButton = document.getElementById("vr-button") as HTMLButtonElement;
const loadingEl = document.getElementById("loading") as HTMLDivElement;

function readSceneType(value: string | undefined): ThreeDgsSceneType {
  if (value === "object" || value === "immersive") return value;
  throw new Error(`Invalid data-scene-type: ${value ?? "(missing)"}`);
}

const splatUrl = app.dataset.splatUrl;
if (!splatUrl) throw new Error("Missing data-splat-url on #app");

const viewer = new ThreeDgsViewer({
  canvas,
  vrButton,
  loadingElement: loadingEl,
  splatUrl,
  sceneType: readSceneType(app.dataset.sceneType),
});

void viewer.start();
