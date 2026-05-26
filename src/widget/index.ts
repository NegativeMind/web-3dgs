import { ThreeDgsViewer, type ThreeDgsSceneType } from "./3dgs-viewer";
import STYLES from "./style.scss?inline";

class ThreeDgsViewerElement extends HTMLElement {
  private viewer?: ThreeDgsViewer;

  static get observedAttributes(): string[] {
    return ["width", "height"];
  }

  attributeChangedCallback(): void {
    this.applySize();
  }

  private applySize(): void {
    const width = this.getAttribute("width");
    const height = this.getAttribute("height");
    if (width !== null) this.style.width = width;
    if (height !== null) this.style.height = height;
  }

  connectedCallback(): void {
    this.applySize();
    const shadow = this.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = STYLES;

    const canvas = document.createElement("canvas");

    const ui = document.createElement("div");
    ui.className = "ui";

    const loading = document.createElement("div");
    loading.className = "loading hidden";
    const loadingSpan = document.createElement("span");
    loadingSpan.textContent = "Loading...";
    loading.appendChild(loadingSpan);

    const vrButton = document.createElement("button");
    vrButton.type = "button";
    vrButton.className = "vr-button hidden";

    ui.append(loading, vrButton);
    shadow.append(style, canvas, ui);

    const src = this.getAttribute("src") ?? "";
    const rawSceneType = this.getAttribute("scene-type") ?? "object";
    const sceneType: ThreeDgsSceneType =
      rawSceneType === "immersive" ? "immersive" : "object";

    this.viewer = new ThreeDgsViewer({
      canvas,
      vrButton,
      loadingElement: loading,
      splatUrl: src,
      sceneType,
      container: this,
    });

    void this.viewer.start();
  }

  disconnectedCallback(): void {
    this.viewer?.dispose();
    this.viewer = undefined;
  }
}

if (!customElements.get("threedgs-viewer")) {
  customElements.define("threedgs-viewer", ThreeDgsViewerElement);
}
