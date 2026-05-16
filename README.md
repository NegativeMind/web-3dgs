# web-3dgs

Web 3D Gaussian Splatting viewer built with Vite, Three.js, and Spark.

## Features

- Loads a local `.sog` Gaussian splat from `public/3dgs/`.
- Desktop/browser view uses `OrbitControls`.
- WebXR mode prefers MR/AR passthrough on supported headsets, with VR fallback.
- Meta Quest-style XR controls:
  - HMD movement remains natural.
  - Trigger/squeeze drag rotates the splat object.
  - Drag release keeps object spin with inertia.
  - Joystick up/down zooms.

## Commands

```bash
npm install
npm run dev
npm run typecheck
npm run build
npm run preview
```

The dev server runs on `http://localhost:5173`.

## Project Structure

- `src/main.ts` - App bootstrap, renderer/scene setup, splat loading, render loop.
- `src/xrObjectControls.ts` - WebXR controller input, object rotation, zoom, and inertia.
- `src/style.scss` - Fullscreen canvas and XR button styling.
- `public/3dgs/` - Runtime 3DGS assets served by Vite.
- `raw_3dgs/` - Source/raw 3DGS files.

## WebXR Notes

The renderer is configured with transparent output so `immersive-ar` can show the headset passthrough feed behind the splat object. `SparkXr` is configured with `mode: "arvr"`, so supported devices enter AR/MR first and fall back to VR otherwise.

For Quest testing, open the app in Meta Quest Browser and use the `ENTER XR` button.
