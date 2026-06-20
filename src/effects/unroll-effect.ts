import { SplatMesh, dyno } from "@sparkjsdev/spark";

const EFFECT_DURATION = 8;

export class UnrollEffect {
  private readonly animateT = dyno.dynoFloat(0);
  private readonly directionSign = dyno.dynoFloat(1);
  private elapsed = 0;
  private active = true;

  /** Playback speed multiplier. 1.0 is normal speed, 2.0 is double speed. */
  speed: number;

  /** Rotation direction. 1 for clockwise, -1 for counter-clockwise. */
  get direction(): 1 | -1 {
    return this.directionSign.value as 1 | -1;
  }
  set direction(value: 1 | -1) {
    this.directionSign.value = value;
  }

  constructor(private readonly mesh: SplatMesh, speed = 1.0, direction: 1 | -1 = 1) {
    this.speed = speed;
    this.directionSign.value = direction;
    this.setup();
  }

  private setup(): void {
    const animateT = this.animateT;
    const directionSign = this.directionSign;

    const modifier = dyno.dynoBlock(
      { gsplat: dyno.Gsplat },
      { gsplat: dyno.Gsplat },
      (inputs) => {
        let { gsplat } = inputs;

        const shader = new dyno.Dyno({
          inTypes: { gsplat: dyno.Gsplat, t: "float" as const, dir: "float" as const },
          outTypes: { gsplat: dyno.Gsplat },
          globals: () => [
            dyno.unindent(`
              mat2 unrollRot(float a) {
                float s = sin(a), c = cos(a);
                return mat2(c, -s, s, c);
              }
            `),
          ],
          statements: ({ inputs: si, outputs: so }) =>
            dyno.unindentLines(`
              ${so.gsplat!} = ${si.gsplat!};
              float t = ${si.t!};
              float dir = ${si.dir!};
              vec3 scales = ${si.gsplat!}.scales;
              vec3 localPos = ${si.gsplat!}.center;
              float expand = 1. - exp(-t * 0.6);
              localPos.xz *= expand;
              localPos.xz *= unrollRot((1. - expand) * 30. * dir);
              ${so.gsplat!}.center = localPos;
              ${so.gsplat!}.scales = mix(vec3(0.002), scales, smoothstep(.3, .7, t + localPos.y - 2.));
              ${so.gsplat!}.rgba = ${si.gsplat!}.rgba * smoothstep(0., 0.1, expand);
            `),
        });

        gsplat = shader.apply({ gsplat, t: animateT, dir: directionSign }).gsplat;
        return { gsplat };
      }
    );

    this.mesh.objectModifier = modifier;
    this.mesh.updateGenerator();
  }

  update(deltaTime: number): void {
    if (!this.active) return;

    this.elapsed += deltaTime * this.speed;
    this.animateT.value = this.elapsed;
    this.mesh.updateVersion();

    if (this.elapsed >= EFFECT_DURATION) {
      this.active = false;
      // Keep objectModifier attached (at t=8, expand≈1 and reveal=1, so it is effectively a no-op)
      // Skipping updateGenerator() avoids a pipeline rebuild that causes a visual snap
    }
  }

  get isActive(): boolean {
    return this.active;
  }

  dispose(): void {
    if (!this.active) return;
    this.active = false;
    this.mesh.objectModifier = undefined;
    this.mesh.updateGenerator();
  }
}
