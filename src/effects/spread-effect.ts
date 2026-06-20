import { SplatMesh, dyno } from "@sparkjsdev/spark";

const EFFECT_DURATION = 8;

export class SpreadEffect {
  private readonly animateT = dyno.dynoFloat(0);
  private elapsed = 0;
  private active = true;

  /** Playback speed multiplier. 1.0 is normal speed, 2.0 is double speed. */
  speed: number;

  constructor(private readonly mesh: SplatMesh, speed = 1.0) {
    this.speed = speed;
    this.setup();
  }

  private setup(): void {
    const animateT = this.animateT;

    const modifier = dyno.dynoBlock(
      { gsplat: dyno.Gsplat },
      { gsplat: dyno.Gsplat },
      (inputs) => {
        let { gsplat } = inputs;

        const shader = new dyno.Dyno({
          inTypes: { gsplat: dyno.Gsplat, t: "float" as const },
          outTypes: { gsplat: dyno.Gsplat },
          globals: () => [],
          statements: ({ inputs: si, outputs: so }) =>
            dyno.unindentLines(`
              ${so.gsplat!} = ${si.gsplat!};
              float t = ${si.t!};
              vec3 scales = ${si.gsplat!}.scales;
              vec3 localPos = ${si.gsplat!}.center;
              float l = length(localPos.xz);
              float tt = t*t*0.4+0.5;
              localPos.xz *= min(1., 0.3+max(0., tt*0.05));
              ${so.gsplat!}.center = localPos;
              ${so.gsplat!}.scales = max(
                mix(vec3(0.0), scales, min(tt-7.-l*2.5, 1.)),
                mix(vec3(0.0), scales*0.2, min(tt-1.-l*2., 1.))
              );
              ${so.gsplat!}.rgba = mix(vec4(0.3), ${si.gsplat!}.rgba, clamp(tt-l*2.5-3., 0., 1.));
            `),
        });

        gsplat = shader.apply({ gsplat, t: animateT }).gsplat;
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
      // Keep modifier attached (it is near-identity at this point)
    }
  }

  get isActive(): boolean {
    return this.active;
  }

  dispose(): void {
    this.active = false;
    this.mesh.objectModifier = undefined;
    this.mesh.updateGenerator();
  }
}
