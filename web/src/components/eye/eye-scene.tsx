"use client";

// three.js uniforms, colours and materials are mutable by design: the render loop updates them
// every frame without re-rendering React, so the compiler's immutability rule doesn't apply here.
/* eslint-disable react-hooks/immutability */

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import * as THREE from "three";
import { Iris } from "@/components/iris/iris";
import { blinkClosure, gazeAngles, type Point } from "@/lib/gaze";
import { pointer, startPointerTracking } from "@/lib/pointer";

export type EyeMood = "idle" | "watching" | "scanning" | "safe" | "danger";

export type EyeSceneProps = {
  mood?: EyeMood;
  className?: string;
  /** Camera distance: larger means a smaller eye. */
  distance?: number;
  /** Vertical offset of the eye, in eye radii. */
  offsetY?: number;
  /** 0..1 scroll progress for the dive into the pupil. */
  dive?: () => number;
  /** Client-space point to look at instead of the cursor (e.g. the field being typed in). */
  target?: () => Point | null;
};

const BG = "#08080a";
const IRIS_EDGE = 0.6; // angular radius of the iris on the eyeball, radians

// lid: opening angle in radians · pupil: angular radius · spin: iris ring speed
const MOODS: Record<EyeMood, { lid: number; pupil: number; spin: number; colors: [string, string, string] }> = {
  idle: { lid: 0.42, pupil: 0.2, spin: 1, colors: ["#6d6bff", "#a66bff", "#ff8a7a"] },
  watching: { lid: 0.56, pupil: 0.24, spin: 1.4, colors: ["#8a86ff", "#bf82ff", "#ff9d88"] },
  scanning: { lid: 0.34, pupil: 0.13, spin: 6, colors: ["#9c98ff", "#cf95ff", "#ffb8a2"] },
  safe: { lid: 0.5, pupil: 0.22, spin: 0.7, colors: ["#5ed3b0", "#6fa8ff", "#5ed3b0"] },
  danger: { lid: 0.24, pupil: 0.11, spin: 2.4, colors: ["#ff4d61", "#ff8a7a", "#ff2e4d"] },
};

const NOISE = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
`;

function makeDotGeometry() {
  const t: number[] = [];
  const az: number[] = [];
  const spin: number[] = [];
  const phase: number[] = [];
  const size: number[] = [];
  const rings = 8;
  for (let k = 0; k < rings; k++) {
    const tt = k / (rings - 1);
    const n = 30 + k * 9;
    const speed = (k % 2 ? -1 : 1) * (0.35 + 0.3 * (1 - tt));
    for (let j = 0; j < n; j++) {
      t.push(tt);
      az.push((j / n) * Math.PI * 2 + k * 0.37);
      spin.push(speed);
      phase.push(Math.random());
      size.push(k === 0 ? 7 : 6 - tt * 2.6);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(t.length * 3), 3));
  g.setAttribute("aT", new THREE.Float32BufferAttribute(t, 1));
  g.setAttribute("aAz", new THREE.Float32BufferAttribute(az, 1));
  g.setAttribute("aSpin", new THREE.Float32BufferAttribute(spin, 1));
  g.setAttribute("aPhase", new THREE.Float32BufferAttribute(phase, 1));
  g.setAttribute("aSize", new THREE.Float32BufferAttribute(size, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.2); // positions live in the shader
  return g;
}

function EyeModel({ mood, distance, offsetY, dive, target }: Required<Pick<EyeSceneProps, "mood" | "distance" | "offsetY">> & Pick<EyeSceneProps, "dive" | "target">) {
  const ball = useRef<THREE.Group>(null);
  const upper = useRef<THREE.Mesh>(null);
  const lower = useRef<THREE.Mesh>(null);
  const { camera, gl, size } = useThree();

  const reduced = useMemo(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);

  const colors = useMemo(() => MOODS.idle.colors.map((c) => new THREE.Color(c)), []);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSpin: { value: 0 },
      uPupil: { value: MOODS.idle.pupil },
      uScale: { value: 1 },
      uC1: { value: colors[0] },
      uC2: { value: colors[1] },
      uC3: { value: colors[2] },
    }),
    [colors],
  );

  const geo = useMemo(
    () => ({
      ball: new THREE.SphereGeometry(1, 96, 64),
      iris: new THREE.SphereGeometry(1.003, 128, 32, 0, Math.PI * 2, 0, IRIS_EDGE + 0.04),
      cornea: new THREE.SphereGeometry(1.014, 96, 64),
      lid: new THREE.SphereGeometry(1.04, 96, 32, 0, Math.PI * 2, 0, Math.PI / 2),
      dots: makeDotGeometry(),
    }),
    [],
  );

  const mats = useMemo(() => {
    const sclera = new THREE.ShaderMaterial({
      uniforms: { uRim: { value: colors[0] }, uBase: { value: new THREE.Color("#0f0e13") } },
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec3 vV;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uRim; uniform vec3 uBase;
        varying vec3 vN; varying vec3 vV;
        void main() {
          float facing = max(dot(normalize(vN), normalize(vV)), 0.0);
          float rim = pow(1.0 - facing, 3.0);
          vec3 col = uBase * (0.6 + 0.4 * facing) + uRim * rim * 0.32;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const iris = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      vertexShader: /* glsl */ `
        varying vec3 vPos;
        void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uPupil; uniform float uTime; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3;
        varying vec3 vPos;
        ${NOISE}
        void main() {
          vec3 p = normalize(vPos);
          float ang = acos(clamp(p.y, -1.0, 1.0));
          float az = atan(p.z, p.x);
          if (ang < uPupil) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
          float t = clamp((ang - uPupil) / (${IRIS_EDGE.toFixed(2)} - uPupil), 0.0, 1.0);
          vec3 grad = mix(mix(uC1, uC2, smoothstep(0.0, 0.6, t)), uC3, smoothstep(0.55, 1.0, t));
          float fibre = noise(vec2(az * 22.0, t * 4.0 - uTime * 0.04));
          float edge = exp(-pow((ang - uPupil) / 0.02, 2.0));
          float limbus = smoothstep(${(IRIS_EDGE + 0.02).toFixed(2)}, ${(IRIS_EDGE - 0.05).toFixed(2)}, ang);
          vec3 col = grad * (0.035 + 0.1 * fibre * (1.0 - t * 0.5)) + grad * edge * 2.2;
          gl_FragColor = vec4(col, limbus);
        }`,
    });
    const dots = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uTime; uniform float uSpin; uniform float uPupil; uniform float uScale;
        attribute float aT; attribute float aAz; attribute float aSpin; attribute float aPhase; attribute float aSize;
        varying float vT; varying float vTwinkle;
        void main() {
          float theta = mix(uPupil + 0.045, ${IRIS_EDGE.toFixed(2)}, aT);
          float az = aAz + aSpin * uSpin;
          vec3 p = vec3(sin(theta) * cos(az), sin(theta) * sin(az), cos(theta)) * 1.008;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uScale / -mv.z;
          vT = aT;
          vTwinkle = 0.45 + 0.55 * sin(uTime * (1.3 + aPhase * 1.7) + aPhase * 6.2831);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3;
        varying float vT; varying float vTwinkle;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.05, d);
          vec3 grad = mix(mix(uC1, uC2, smoothstep(0.0, 0.6, vT)), uC3, smoothstep(0.55, 1.0, vT));
          gl_FragColor = vec4(grad * (1.1 + 1.1 * vTwinkle) * a, a);
        }`,
    });
    // Black + additive: only the reflections of the studio lights show, like a wet cornea.
    const cornea = new THREE.MeshPhysicalMaterial({
      color: "#000000",
      roughness: 0.04,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
      envMapIntensity: 1.6,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const lid = new THREE.MeshBasicMaterial({ color: BG, side: THREE.DoubleSide, toneMapped: false });
    return { sclera, iris, dots, cornea, lid };
  }, [colors, uniforms]);

  // Mutable animation state kept outside React so a frame never re-renders anything.
  const anim = useRef({
    yaw: 0,
    pitch: 0,
    lid: 0,
    pupil: MOODS.idle.pupil,
    spinSpeed: 1,
    nextBlink: 1800,
    blinkAt: -10,
    glanceAt: 0,
    glance: { yaw: 0, pitch: 0 },
    born: -1,
  });
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const targetColors = useMemo(() => [new THREE.Color(), new THREE.Color(), new THREE.Color()], []);

  useFrame((state, delta) => {
    const a = anim.current;
    const dt = Math.min(delta, 0.05);
    const now = state.clock.elapsedTime * 1000;
    if (a.born < 0) a.born = now;
    const m = MOODS[mood];
    const p = dive ? Math.min(1, Math.max(0, dive())) : 0;
    const dived = p * p * (3 - 2 * p);

    // Camera: fit the eye in portrait screens, then push into the pupil on scroll.
    const fit = Math.max(distance, 4.85 / Math.max(0.35, size.width / size.height));
    const camY = offsetY * dived; // the eye sits off-centre, then the dive lines the camera up with the pupil
    camera.position.set(0, camY, THREE.MathUtils.lerp(fit, 1.55, dived));
    camera.lookAt(0, camY, 0);

    // Where to look: a DOM target, the cursor, or idle glances.
    const rect = gl.domElement.getBoundingClientRect();
    tmp.set(0, offsetY, 0).project(camera);
    const eyeX = rect.left + ((tmp.x + 1) / 2) * rect.width;
    const eyeY = rect.top + ((1 - tmp.y) / 2) * rect.height;
    const aim = target?.() ?? pointer;
    let { yaw, pitch } = gazeAngles({ left: eyeX, top: eyeY, width: 0, height: 0 }, aim, Math.max(420, rect.height * 0.9), 0.55);

    const idle = now - pointer.lastMove > 2600 && !target?.();
    if (!reduced && (mood === "scanning" || idle) && now > a.glanceAt) {
      const wide = mood === "scanning" ? 0.38 : 0.14;
      a.glance = { yaw: (Math.random() - 0.5) * 2 * wide, pitch: (Math.random() - 0.5) * wide };
      a.glanceAt = now + (mood === "scanning" ? 110 + Math.random() * 160 : 700 + Math.random() * 1300);
    }
    if (mood === "scanning") {
      yaw = a.glance.yaw;
      pitch = a.glance.pitch;
    } else if (idle && !reduced) {
      yaw += a.glance.yaw;
      pitch += a.glance.pitch;
    }
    yaw *= 1 - dived;
    pitch *= 1 - dived;
    const follow = 1 - Math.exp(-dt * (mood === "scanning" ? 22 : 11));
    a.yaw += (yaw - a.yaw) * follow;
    a.pitch += (pitch - a.pitch) * follow;
    if (ball.current) ball.current.rotation.set(a.pitch, a.yaw, 0);

    // Lids: wake up, blink at random, squint on danger, open wide during the dive.
    if (now > a.nextBlink && now - a.born > 1500) {
      a.blinkAt = now;
      a.nextBlink = now + 2200 + Math.random() * 4200 + (Math.random() < 0.18 ? -1900 : 0);
    }
    const closure = blinkClosure((now - a.blinkAt) / 170);
    const wanted = THREE.MathUtils.lerp(m.lid + (pointer.attention ? 0.08 : 0), 1.62, dived) * (1 - closure);
    const lidRate = now - a.born < 1400 ? 2.2 : closure > 0 ? 60 : 9;
    a.lid += (wanted - a.lid) * (1 - Math.exp(-dt * lidRate));
    upper.current?.rotation.set(-a.lid, 0, 0);
    lower.current?.rotation.set(a.lid, 0, Math.PI);

    // Pupil: tightens with fast cursor moves, widens on attention, fills the iris during the dive.
    const pupilWanted = THREE.MathUtils.lerp(
      m.pupil + (pointer.attention ? 0.03 : 0) - Math.min(0.05, pointer.speed * 0.02),
      IRIS_EDGE + 0.08,
      Math.pow(dived, 1.6),
    );
    a.pupil += (pupilWanted - a.pupil) * (1 - Math.exp(-dt * 6));
    a.spinSpeed += ((reduced ? 0.2 : m.spin) - a.spinSpeed) * (1 - Math.exp(-dt * 3));

    mats.cornea.opacity = 1 - Math.min(1, dived * 1.6); // reflections would balloon as the camera enters the pupil

    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uSpin.value += dt * a.spinSpeed * 0.25;
    uniforms.uPupil.value = a.pupil;
    uniforms.uScale.value = (size.height * state.viewport.dpr) / 190;
    m.colors.forEach((c, i) => {
      targetColors[i].set(c);
      colors[i].lerp(targetColors[i], 1 - Math.exp(-dt * 3));
    });
  });

  return (
    <group position={[0, offsetY, 0]}>
      <group ref={ball}>
        <mesh geometry={geo.ball} material={mats.sclera} />
        <mesh geometry={geo.iris} material={mats.iris} rotation-x={Math.PI / 2} renderOrder={1} />
        <points geometry={geo.dots} material={mats.dots} renderOrder={2} />
        <mesh geometry={geo.cornea} material={mats.cornea} renderOrder={3} />
      </group>
      <mesh ref={upper} geometry={geo.lid} material={mats.lid} rotation-x={0} />
      <mesh ref={lower} geometry={geo.lid} material={mats.lid} rotation-z={Math.PI} />
    </group>
  );
}

export function EyeScene({ mood = "idle", className, distance = 4.6, offsetY = 0, dive, target }: EyeSceneProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    startPointerTracking();
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: "120px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={wrap} className={className}>
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 0, distance], fov: 30, near: 0.05, far: 50 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        frameloop={visible ? "always" : "never"}
        fallback={<Iris size={420} className="mx-auto h-full w-auto" />}
      >
        <color attach="background" args={[BG]} />
        <Environment resolution={256} frames={1}>
          <Lightformer form="rect" intensity={2.6} position={[-2.5, 3, 4]} scale={[2.6, 1.1, 1]} target={[0, 0, 0]} />
          <Lightformer form="circle" intensity={2} position={[3, 1, 3]} scale={0.8} target={[0, 0, 0]} />
          <Lightformer form="rect" intensity={0.8} color="#a66bff" position={[0, -3, 2]} scale={[5, 0.6, 1]} target={[0, 0, 0]} />
        </Environment>
        <EyeModel mood={mood} distance={distance} offsetY={offsetY} dive={dive} target={target} />
        <EffectComposer multisampling={4}>
          <Bloom mipmapBlur intensity={1.15} luminanceThreshold={0.18} luminanceSmoothing={0.25} radius={0.72} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
