const CDN_URL = "https://cdn.jsdelivr.net/gh/NegativeMind/web-3dgs@main/dist/3dgs-viewer.js";

const form = document.getElementById("generatorForm") as HTMLFormElement;
const urlInput = document.getElementById("splatUrl") as HTMLInputElement;
const collisionUrlInput = document.getElementById("collisionUrl") as HTMLInputElement;
const sceneTypeSelect = document.getElementById("sceneType") as HTMLSelectElement;
const widthInput = document.getElementById("viewerWidth") as HTMLInputElement;
const heightInput = document.getElementById("viewerHeight") as HTMLInputElement;
const urlError = document.getElementById("urlError") as HTMLElement;
const previewSection = document.getElementById("previewSection") as HTMLElement;
const previewArea = document.getElementById("previewArea") as HTMLElement;
const codeSection = document.getElementById("codeSection") as HTMLElement;
const embedCode = document.getElementById("embedCode") as HTMLElement;
const copyBtn = document.getElementById("copyBtn") as HTMLButtonElement;

function escapeHtmlAttribute(value: string): string {
  return value.replace(/[&"<>]/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "\"":
        return "&quot;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      default:
        return char;
    }
  });
}

form.addEventListener("submit", (e: Event) => {
  e.preventDefault();

  const url = urlInput.value.trim();
  const collisionUrl = collisionUrlInput.value.trim();
  urlError.style.display = "none";

  if (!url) {
    urlError.textContent = "URL を入力してください。";
    urlError.style.display = "block";
    return;
  }

  let splatUrl: string;
  let normalizedCollisionUrl = "";

  try {
    splatUrl = new URL(url).href;
  } catch {
    urlError.textContent = "有効な URL を入力してください。";
    urlError.style.display = "block";
    return;
  }

  if (collisionUrl) {
    try {
      normalizedCollisionUrl = new URL(collisionUrl).href;
    } catch {
      urlError.textContent = "有効な衝突メッシュ URL を入力してください。";
      urlError.style.display = "block";
      return;
    }
  }

  const sceneType = sceneTypeSelect.value === "immersive" ? "immersive" : "object";
  const width = widthInput.value.trim();
  const height = heightInput.value.trim();

  previewArea.innerHTML = "";
  const viewer = document.createElement("splat-viewer");
  viewer.setAttribute("src", splatUrl);
  viewer.setAttribute("scene-type", sceneType);
  if (width) viewer.setAttribute("width", width);
  if (height) viewer.setAttribute("height", height);
  if (normalizedCollisionUrl) viewer.setAttribute("collision-src", normalizedCollisionUrl);
  previewArea.appendChild(viewer);

  const collisionAttr = normalizedCollisionUrl
    ? ` collision-src="${escapeHtmlAttribute(normalizedCollisionUrl)}"`
    : "";
  const widthAttr = width ? ` width="${escapeHtmlAttribute(width)}"` : "";
  const heightAttr = height ? ` height="${escapeHtmlAttribute(height)}"` : "";
  const tag = `<splat-viewer src="${escapeHtmlAttribute(splatUrl)}"${collisionAttr} scene-type="${sceneType}"${widthAttr}${heightAttr}></splat-viewer>`;
  const script = `<script src="${CDN_URL}"><\/script>`;
  embedCode.textContent = `${tag}\n${script}`;

  previewSection.style.display = "block";
  codeSection.style.display = "block";
  previewSection.scrollIntoView({ behavior: "smooth", block: "start" });
});

copyBtn.addEventListener("click", () => {
  void navigator.clipboard.writeText(embedCode.textContent ?? "").then(() => {
    copyBtn.textContent = "コピー完了!";
    copyBtn.classList.add("copied");
    setTimeout(() => {
      copyBtn.textContent = "コピー";
      copyBtn.classList.remove("copied");
    }, 2000);
  });
});
