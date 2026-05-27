import { readdirSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { join, basename } from "node:path";

const INPUT_DIR = "raw_3dgs";
const OUTPUT_DIR = "public";

mkdirSync(OUTPUT_DIR, { recursive: true });

const plyFiles: string[] = readdirSync(INPUT_DIR).filter((f: string) =>
  f.endsWith(".ply")
);

if (plyFiles.length === 0) {
  console.log("No .ply files found in raw_3dgs/");
  process.exit(0);
}

function run(args: string[]): Promise<void> {
  const proc = spawn("npx", ["splat-transform", ...args], {
    stdio: "inherit",
    shell: true,
  });
  return new Promise((resolve, reject) => {
    proc.on("close", (code: number | null) => {
      if (code === 0) resolve();
      else reject(new Error(`splat-transform exited with code ${code}`));
    });
  });
}

for (const file of plyFiles) {
  const input = join(INPUT_DIR, file);
  const name = basename(file, ".ply");
  const sogOutput = join(OUTPUT_DIR, `${name}.sog`);
  const voxelOutput = join(OUTPUT_DIR, `${name}.voxel.json`);

  console.log(`\n[1/2] Converting to SOG: ${input} → ${sogOutput}`);
  await run([input, "-N", "-w", sogOutput]);

  console.log(`[2/2] Generating collision mesh: ${input} → ${voxelOutput} + .collision.glb`);
  await run([input, "-N", "-w", voxelOutput, "-K"]);
}
