const CDN_URL = "https://cdn.jsdelivr.net/gh/NegativeMind/web-3dgs@main/cdn/widget.js";

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

form.addEventListener("submit", (e: Event) => {
  e.preventDefault();

  const url = urlInput.value.trim();
  urlError.style.display = "none";

  if (!url) {
    urlError.textContent = "URL を入力してください。";
    urlError.style.display = "block";
    return;
  }

  try {
    new URL(url);
  } catch {
    urlError.textContent = "有効な URL を入力してください。";
    urlError.style.display = "block";
    return;
  }

  const sceneType = sceneTypeSelect.value;
  const width = `${Math.max(100, Math.min(3840, parseInt(widthInput.value) || 800))}px`;
  const height = `${Math.max(200, Math.min(1200, parseInt(heightInput.value) || 480))}px`;
  const collisionUrl = collisionUrlInput.value.trim();

  previewArea.innerHTML = "";
  const viewer = document.createElement("threedgs-viewer");
  viewer.setAttribute("src", url);
  viewer.setAttribute("scene-type", sceneType);
  viewer.setAttribute("width", width);
  viewer.setAttribute("height", height);
  if (collisionUrl) viewer.setAttribute("collision-src", collisionUrl);
  previewArea.appendChild(viewer);

  const collisionAttr = collisionUrl ? ` collision-src="${collisionUrl}"` : "";
  const tag = `<threedgs-viewer src="${url}"${collisionAttr} scene-type="${sceneType}" width="${width}" height="${height}"></threedgs-viewer>`;
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
