import { ThreeDgsViewer } from "./3dgs-viewer";

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const vrButton = document.getElementById("vr-button") as HTMLButtonElement;
const loadingEl = document.getElementById("loading") as HTMLDivElement;

const viewer = new ThreeDgsViewer({
  canvas,
  vrButton,
  loadingElement: loadingEl,
  splatUrl: "./3dgs/gmk.sog",
  sceneType: "object",
});

void viewer.start();
