// The picture: a physically based sky (and the light it puts on everything, via an environment map), clouds,
// and post-processing that depends on the quality setting:
//   low     straight to the screen, nothing extra
//   medium  colour grade, vignette, hurt / suppression effects
//   high    + bloom (muzzle flashes, explosions, the sun glinting)
//   ultra   + ambient occlusion (contact shadows in corners and under things), sharper resolution
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Sky } from 'three/addons/objects/Sky.js';

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, hurt: { value: 0 }, suppress: { value: 0 }, flash: { value: 0 }, warm: { value: 0.03 }, sat: { value: 1.05 }, contrast: { value: 1.06 }, vignette: { value: 0.32 }, grain: { value: 0.035 }, res: { value: new THREE.Vector2(1, 1) } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, hurt, suppress, flash, warm, sat, contrast, vignette, grain; uniform vec2 res; varying vec2 vUv;
    float rnd(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + time * 7.13) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5; float r = length(c);
      // a touch of lens fringing at the edges, more when rattled
      float ab = (0.0012 + suppress * 0.004 + hurt * 0.003) * r;
      vec3 col = vec3(texture2D(tDiffuse, vUv + c * ab).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - c * ab).b);
      // suppressed: the edges smear
      if (suppress > 0.01) { vec3 b = vec3(0.0); for (int i = 0; i < 6; i++) { float a = float(i) * 1.047; b += texture2D(tDiffuse, vUv + vec2(cos(a), sin(a)) * r * 0.012 * suppress).rgb; } col = mix(col, b / 6.0, clamp(r * 2.0 * suppress, 0.0, 1.0)); }
      // grade: warm highlights, slightly cool shadows, contrast, saturation
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col += vec3(warm, warm * 0.4, -warm * 0.6) * smoothstep(0.3, 1.0, l) - vec3(0.0, 0.0, -0.012) * (1.0 - l);
      col = (col - 0.5) * contrast + 0.5;
      float s = sat * (1.0 - hurt * 0.75);
      col = mix(vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), col, s);
      // hurt: the edges go dark and red
      col = mix(col, col * vec3(0.55, 0.08, 0.06), clamp(hurt * smoothstep(0.25, 0.75, r) * 1.6, 0.0, 0.85));
      // vignette, darker when suppressed
      col *= 1.0 - smoothstep(0.35, 0.95, r) * (vignette + suppress * 0.35);
      // film grain
      col += (rnd(vUv * res) - 0.5) * grain;
      col = mix(col, vec3(1.0), clamp(flash, 0.0, 1.0));
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

export function createPost(renderer, scene, camera, vmScene, vmCam) {
  const P = { quality: 'high', composer: null, grade: null, bloom: null, sao: null, vmPass: null, env: null };
  // ---- the sky ----
  const sky = new Sky(); sky.scale.setScalar(1000); sky.material.depthWrite = false; scene.add(sky);
  // the scattering model is very bright: scale it to sit with the rest of the scene (tuned at exposure 1)
  sky.material.uniforms.skyGain = { value: 0.35 };
  sky.material.fragmentShader = 'uniform float skyGain;\n' + sky.material.fragmentShader.replace('gl_FragColor = vec4( retColor, 1.0 );', 'gl_FragColor = vec4( retColor * skyGain, 1.0 );');
  const U = sky.material.uniforms;
  // clouds: a big soft layer high up
  const cloudMat = new THREE.MeshBasicMaterial({ map: cloudTex(), alphaMap: edgeFade(), transparent: true, depthWrite: false, fog: false, opacity: 0.85 });
  const clouds = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), cloudMat); clouds.rotation.x = Math.PI / 2; clouds.position.y = 420; clouds.renderOrder = -1; scene.add(clouds);
  const pmrem = new THREE.PMREMGenerator(renderer);
  // the light the sky puts on things (reflections, ambient) comes from a calm gradient, so its strength is under control
  const envScene = new THREE.Scene();
  const envMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false });
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), envMat));
  const envSun = new THREE.Mesh(new THREE.SphereGeometry(6, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  envScene.add(envSun);

  // set per map: sun direction, haze, how cloudy
  P.setSky = (def) => {
    const s = def.atmo || { turbidity: 6, rayleigh: 1.6, mie: 0.005, g: 0.82, clouds: 0.25, exposure: 0.55 };
    const dir = new THREE.Vector3(...def.sun.dir).normalize();
    U.turbidity.value = s.turbidity; U.rayleigh.value = s.rayleigh; U.mieCoefficient.value = s.mie; U.mieDirectionalG.value = s.g; U.sunPosition.value.copy(dir); U.skyGain.value = s.skyGain ?? 0.35;
    envMat.map = gradientTex(def.sky); envMat.color.setScalar(s.envInt ?? 0.6); envMat.needsUpdate = true;
    envSun.position.copy(dir).multiplyScalar(90); envSun.material.color.setScalar(s.sunEnv ?? 6);
    cloudMat.opacity = s.clouds; cloudMat.color.setHex(s.cloudColor || 0xffffff);
    renderer.toneMappingExposure = s.exposure ?? 1;
    if (P.env) P.env.dispose();
    P.env = pmrem.fromScene(envScene, 0.04).texture;
    scene.environment = P.env;
  };
  // the sky and clouds have to sit inside the camera's far distance
  P.setFar = (far) => { sky.scale.setScalar(Math.min(1000, far * 1.1)); clouds.userData.h = Math.min(420, far * 0.45); clouds.scale.setScalar(Math.min(1, far / 1600)); };
  P.follow = (pos, t) => { sky.position.copy(pos); clouds.position.x = pos.x + t * 2; clouds.position.z = pos.z + t * 0.7; clouds.position.y = clouds.userData.h ?? 420; };

  // ---- post-processing ----
  function build() {
    if (P.composer) { P.composer.renderTarget1.dispose(); P.composer.renderTarget2.dispose(); P.composer = null; }
    const q = P.quality; if (q === 'low') return;
    const size = renderer.getSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q === 'ultra' ? 4 : q === 'high' ? 2 : 0 });
    const C = new EffectComposer(renderer, rt);
    C.addPass(new RenderPass(scene, camera));
    if (q === 'ultra') {
      // ground-truth ambient occlusion: contact shadows in corners, under ledges, around feet
      const ao = new GTAOPass(scene, camera, size.x, size.y);
      ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.5, scale: 1.0, samples: 12 });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      ao.blendIntensity = 0.85;
      C.addPass(ao); P.sao = ao;
    } else P.sao = null;
    // your gun and arms, drawn over the world (cleared depth so it never clips into walls)
    const vm = new RenderPass(vmScene, vmCam); vm.clear = false; vm.clearDepth = true; C.addPass(vm); P.vmPass = vm;
    if (q !== 'medium') { const b = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.35, 0.5, 0.92); C.addPass(b); P.bloom = b; } else P.bloom = null;
    C.addPass(new OutputPass());
    const g = new ShaderPass(GradeShader); C.addPass(g); P.grade = g;
    P.composer = C;
    C.setPixelRatio(renderer.getPixelRatio()); C.setSize(size.x, size.y);
  }
  P.setQuality = (q) => { P.quality = q; build(); };
  P.resize = () => { if (P.composer) { const s = renderer.getSize(new THREE.Vector2()); P.composer.setPixelRatio(renderer.getPixelRatio()); P.composer.setSize(s.x, s.y); } };
  // fx: { hurt, suppress, flash } 0..1
  P.render = (showVM, fx, t) => {
    if (!P.composer) {
      renderer.clear(); renderer.render(scene, camera);
      if (showVM) { renderer.clearDepth(); renderer.render(vmScene, vmCam); }
      return;
    }
    P.vmPass.enabled = showVM;
    const u = P.grade.uniforms; u.time.value = t % 100; u.hurt.value = fx.hurt; u.suppress.value = fx.suppress; u.flash.value = fx.flash;
    const s = renderer.getDrawingBufferSize(new THREE.Vector2()); u.res.value.copy(s);
    P.composer.render();
  };
  return P;
}

// soft, ragged clouds painted on a canvas (alpha only)
function cloudTex() {
  const s = 1024, c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d');
  let seed = 7; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 260; i++) {
    const x = r() * s, y = r() * s, rad = 20 + r() * 110, a = 0.04 + r() * 0.08;
    for (const [dx, dy] of [[0, 0], [s, 0], [-s, 0], [0, s], [0, -s]]) { const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2); }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function gradientTex([top, mid, bot]) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, top); gr.addColorStop(0.42, mid); gr.addColorStop(0.5, bot); gr.addColorStop(0.56, '#6e6252'); gr.addColorStop(1, '#3a342c');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// fades the cloud layer out towards its edges (so you never see where it ends)
function edgeFade() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 20, 128, 128, 128); gr.addColorStop(0, '#fff'); gr.addColorStop(0.55, '#fff'); gr.addColorStop(1, '#000');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}
