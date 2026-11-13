import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { interpolatePose, matchingOrthoHalfHeight, type CameraPose, type Projection } from "./studio-view";

/** Lighting, environment and shadow rig shared by every Studio 3D mode.
 * Rendering only: it receives bounds and never touches the structural model. */
export function createStudioStage(renderer: THREE.WebGLRenderer, scene: THREE.Scene, options: { shadows: boolean; shadowMapSize: number; environmentSize: number }) {
  const resources: { dispose(): void }[] = [];
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = options.shadows; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Small procedural studio environment: soft reflections for metal, no HDR
  // download. It is generated AFTER the first frame (see loadEnvironment) so
  // opening the viewer never waits for it, and at a reduced cube size.
  let environment: THREE.Texture | null = null, environmentMs = 0;
  // Without an environment the rig is the original flat technical lighting.
  const ambient = new THREE.HemisphereLight(0xffffff, 0x8d978a, 1.7);
  const sun = new THREE.DirectionalLight(0xfff4e6, 2.5);
  const fill = new THREE.DirectionalLight(0xdfe9ff, .35);
  sun.castShadow = options.shadows; sun.shadow.mapSize.set(options.shadowMapSize, options.shadowMapSize);
  sun.shadow.bias = -.0004; sun.shadow.normalBias = .02; sun.shadow.radius = 3;
  scene.add(ambient, sun, sun.target, fill);
  const groundMaterial = new THREE.ShadowMaterial({ opacity: .2 }), groundGeometry = new THREE.PlaneGeometry(1, 1);
  const ground = new THREE.Mesh(groundGeometry, groundMaterial); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; ground.visible = options.shadows;
  scene.add(ground); resources.push(groundMaterial, groundGeometry);
  let neutral = false;
  return {
    ambient, sun, fill, ground,
    environmentMs: () => environmentMs,
    /** Build the reflection environment once; returns false when unavailable. */
    loadEnvironment() {
      if (environment) return true;
      const started = performance.now();
      try {
        const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
        environment = pmrem.fromScene(room, .04, .1, 100, { size: options.environmentSize }).texture;
        room.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } });
        pmrem.dispose(); resources.push(environment);
        scene.environment = environment; scene.environmentIntensity = neutral ? .15 : .5;
        ambient.intensity = .95; sun.intensity = 2.3; fill.intensity = .45;
      } catch { scene.environment = null; environment = null; }
      environmentMs = performance.now() - started;
      return !!environment;
    },
    /** Aim the sun and fit its shadow frustum to what is being shown. */
    frame(bounds: THREE.Box3, groundY: number, showGround: boolean) {
      const sphere = bounds.getBoundingSphere(new THREE.Sphere()), radius = Math.max(sphere.radius, 1), center = sphere.center;
      sun.position.copy(center).add(new THREE.Vector3(.55, 1.05, .45).normalize().multiplyScalar(radius * 2.4));
      fill.position.copy(center).add(new THREE.Vector3(-.7, .5, -.6).normalize().multiplyScalar(radius * 2));
      sun.target.position.copy(center); sun.target.updateMatrixWorld();
      const camera = sun.shadow.camera;
      camera.left = -radius * 1.15; camera.right = radius * 1.15; camera.top = radius * 1.15; camera.bottom = -radius * 1.15;
      camera.near = radius * .2; camera.far = radius * 5; camera.updateProjectionMatrix();
      ground.position.set(center.x, groundY - .002, center.z); ground.scale.setScalar(radius * 6);
      ground.visible = options.shadows && showGround;
    },
    /** Analysis colours are data: show them without tone mapping or tinted light. */
    setNeutral(value: boolean) {
      if (neutral === value) return; neutral = value;
      renderer.toneMapping = value ? THREE.NoToneMapping : THREE.NeutralToneMapping;
      scene.environmentIntensity = value ? .15 : .5; sun.color.set(value ? 0xffffff : 0xfff4e6);
    },
    dispose() { sun.shadow.dispose(); scene.environment = null; resources.forEach(r => r.dispose()); },
  };
}

/** Perspective + true orthographic cameras behind one pose API, with short
 * on-demand transitions. No frame is rendered while nothing changes. */
export function createCameraRig(aspect: number, onChange: () => void) {
  const perspective = new THREE.PerspectiveCamera(40, aspect, .01, 100000);
  const orthographic = new THREE.OrthographicCamera(-1, 1, 1, -1, -50000, 50000);
  let projection: Projection = "perspective", halfHeight = 1, frame = 0, currentAspect = aspect;
  const target = new THREE.Vector3();
  const active = () => projection === "perspective" ? perspective : orthographic;
  const syncOrtho = () => {
    orthographic.top = halfHeight; orthographic.bottom = -halfHeight;
    orthographic.left = -halfHeight * currentAspect; orthographic.right = halfHeight * currentAspect; orthographic.updateProjectionMatrix();
  };
  const place = (pose: CameraPose) => {
    target.copy(pose.target); halfHeight = pose.orthoHalfHeight;
    for (const camera of [perspective, orthographic]) { camera.up.copy(pose.up); camera.position.copy(pose.position); camera.lookAt(pose.target); camera.updateMatrixWorld(); }
    orthographic.zoom = 1; syncOrtho();
  };
  const current = (): CameraPose => {
    const camera = active(), distance = camera.position.distanceTo(target);
    return { position: camera.position.clone(), target: target.clone(), up: camera.up.clone(),
      orthoHalfHeight: projection === "orthographic" ? halfHeight / orthographic.zoom : matchingOrthoHalfHeight(distance, perspective.fov) };
  };
  const cancel = () => { if (frame) { cancelAnimationFrame(frame); frame = 0; } };
  return {
    perspective, orthographic, target, active, current, cancel,
    projection: () => projection,
    animating: () => frame !== 0,
    setAspect(value: number) { currentAspect = value; perspective.aspect = value; perspective.updateProjectionMatrix(); syncOrtho(); },
    /** Jump or glide to a pose. `durationMs` 0 (or reduced motion) is immediate. */
    moveTo(pose: CameraPose, durationMs: number) {
      cancel();
      if (durationMs <= 0 || typeof requestAnimationFrame !== "function") { place(pose); onChange(); return; }
      const from = current(), started = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - started) / durationMs);
        place(interpolatePose(from, pose, t)); onChange();
        frame = t < 1 ? requestAnimationFrame(step) : 0;
      };
      frame = requestAnimationFrame(step);
    },
    /** Swap projection keeping what is on screen at the orbit target. */
    setProjection(value: Projection) {
      if (value === projection) return;
      cancel(); const pose = current(), from = active();
      projection = value; const to = active();
      to.up.copy(from.up); to.quaternion.copy(from.quaternion);
      if (value === "orthographic") { halfHeight = pose.orthoHalfHeight; orthographic.zoom = 1; to.position.copy(from.position); syncOrtho(); }
      else {
        const distance = pose.orthoHalfHeight / Math.tan(THREE.MathUtils.degToRad(perspective.fov) / 2);
        const direction = from.position.clone().sub(target).normalize();
        to.position.copy(target).addScaledVector(direction, distance); to.lookAt(target);
      }
      to.updateMatrixWorld(); onChange();
    },
  };
}
