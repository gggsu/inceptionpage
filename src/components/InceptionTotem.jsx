import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';

// --- Intro: el trompo se ensambla a partir de partículas ---
const PARTICLE_COUNT = 4200;
const INTRO = {
  travel: 4.2,              // s que tarda cada partícula en llegar a su lugar
  delaySpread: 1.6,         // s de escalonado de abajo hacia arriba
  delayJitter: 0.7,         // s de retraso aleatorio extra por partícula
  meshIn: [5.2, 6.8],       // s en que el trompo sólido aparece
  spinDown: [5.6, 10.0],    // s en que el giro frena hasta quedar quieto (las partículas se apagan a la par)
  end: 10.0,                // s en que se elimina el sistema de partículas
};

// Velocidad de giro inicial (rad/s): equivale al giro original de 0.032 rad por cuadro a 60 fps
const SPIN_SPEED = 1.92;
// Separación de las partículas respecto de la superficie para que se vean sobre el trompo sólido
const SURFACE_OFFSET = 0.012;

const smoothRange = (x, a, b) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

const particleVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uTravel;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uSurface;
  attribute vec3 aStart;
  attribute vec3 aNormal;
  attribute float aDelay;
  attribute float aSize;
  attribute float aTint;
  varying float vTint;
  varying float vArrive;
  varying float vFacing;

  void main() {
    float t = clamp((uTime - aDelay) / uTravel, 0.0, 1.0);
    float e = 1.0 - pow(1.0 - t, 3.0);

    // Recorrido en espiral alrededor del eje mientras convergen
    float ang = (1.0 - e) * 2.4;
    float s = sin(ang);
    float c = cos(ang);
    vec3 from = vec3(aStart.x * c - aStart.z * s, aStart.y, aStart.x * s + aStart.z * c);
    vec3 pos = mix(from, position, e);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    // Ya posadas sobre el trompo sólido, las partículas se achican un poco
    gl_PointSize = uSize * aSize * uPixelRatio * (1.0 / -mvPosition.z) * (1.0 - 0.35 * uSurface);

    // Cuando el trompo es sólido, las partículas de la cara trasera se apagan de forma gradual
    vec3 viewNormal = normalize(normalMatrix * aNormal);
    float facing = dot(viewNormal, normalize(-mvPosition.xyz));
    vFacing = mix(1.0, smoothstep(-0.05, 0.3, facing), uSurface * e);

    vTint = aTint;
    vArrive = e;
  }
`;

const particleFragmentShader = /* glsl */ `
  uniform float uOpacity;
  uniform float uSurface;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  varying float vTint;
  varying float vArrive;
  varying float vFacing;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.0, d);
    // Sobre la porcelana blanca viran al azul de acento para que el giro siga siendo visible
    vec3 color = mix(mix(uColorA, uColorB, vTint), uColorB, uSurface * 0.85);
    gl_FragColor = vec4(color, alpha * uOpacity * vFacing * (0.35 + 0.65 * vArrive));
    #include <colorspace_fragment>
  }
`;

export default function InceptionTotem() {
  const mountRef = useRef(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    const width = container.clientWidth || 420;
    const height = container.clientHeight || 420;
    const camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 100);
    camera.position.set(0, 0.25, 4.9);
    camera.lookAt(0, 0.05, 0);

    renderer.setSize(width, height, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';

    // Iluminación de estudio limpia para cerámica blanca sobre fondo oscuro
    const ambientLight = new THREE.AmbientLight(0xdbeafe, 0.85);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
    keyLight.position.set(-3.2, 4.5, 4.2);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x94a3b8, 0.9);
    fillLight.position.set(3.5, -1.5, 2.5);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0x3b82f6, 1.4);
    rimLight.position.set(3.2, 2.2, -3.5);
    scene.add(rimLight);

    // Silueta orgánica redondeada y continua (estilo cerámica blanca de la referencia)
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.0, -0.76, 0),
      new THREE.Vector3(0.11, -0.73, 0),
      new THREE.Vector3(0.24, -0.58, 0),
      new THREE.Vector3(0.46, -0.40, 0),
      new THREE.Vector3(0.82, -0.26, 0),
      new THREE.Vector3(0.92, -0.14, 0),
      new THREE.Vector3(0.84, -0.02, 0),
      new THREE.Vector3(0.52, 0.09, 0),
      new THREE.Vector3(0.26, 0.24, 0),
      new THREE.Vector3(0.14, 0.54, 0),
      new THREE.Vector3(0.085, 0.90, 0),
      new THREE.Vector3(0.045, 1.15, 0),
      new THREE.Vector3(0.0, 1.21, 0),
    ]);

    const profilePoints = curve.getPoints(64).map((p) => new THREE.Vector2(p.x, p.y));
    const latheGeo = new THREE.LatheGeometry(profilePoints, 80);
    latheGeo.computeVertexNormals();

    const porcelainMaterial = new THREE.MeshStandardMaterial({
      color: 0xf4f7fb,
      metalness: 0.06,
      roughness: 0.28,
    });

    const pivotGroup = new THREE.Group();
    const spinGroup = new THREE.Group();

    const totemMesh = new THREE.Mesh(latheGeo, porcelainMaterial);
    spinGroup.add(totemMesh);

    // Aro sutil en la base para anclar la rotación espacial
    const baseRingGeo = new THREE.RingGeometry(0.46, 0.475, 64);
    const baseRingMat = new THREE.MeshBasicMaterial({
      color: 0x3b82f6,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
    });
    const baseRing = new THREE.Mesh(baseRingGeo, baseRingMat);
    baseRing.rotation.x = -Math.PI / 2;
    baseRing.position.y = -1.06;
    pivotGroup.add(baseRing);

    pivotGroup.add(spinGroup);
    pivotGroup.rotation.z = -0.34;
    pivotGroup.rotation.x = 0.22;
    scene.add(pivotGroup);

    const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
    const handlePointerMove = (e) => {
      pointer.targetX = (e.clientX / window.innerWidth - 0.5) * 2;
      pointer.targetY = (e.clientY / window.innerHeight - 0.5) * 2;
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });

    const resizeObserver = new ResizeObserver(() => {
      if (!container) return;
      const w = container.clientWidth || 420;
      const h = container.clientHeight || 420;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    });
    resizeObserver.observe(container);

    if (prefersReducedMotion) {
      spinGroup.rotation.y = 0.6;
      renderer.render(scene, camera);
      return () => {
        window.removeEventListener('pointermove', handlePointerMove);
        resizeObserver.disconnect();
        latheGeo.dispose();
        baseRingGeo.dispose();
        porcelainMaterial.dispose();
        baseRingMat.dispose();
        renderer.dispose();
        if (renderer.domElement.parentNode === container) {
          container.removeChild(renderer.domElement);
        }
      };
    }

    // --- Sistema de partículas de la intro ---
    let particles = null;
    let particleGeo = null;
    let particleMat = null;

    {
      const sampler = new MeshSurfaceSampler(totemMesh).build();
      const targets = new Float32Array(PARTICLE_COUNT * 3);
      const starts = new Float32Array(PARTICLE_COUNT * 3);
      const delays = new Float32Array(PARTICLE_COUNT);
      const sizes = new Float32Array(PARTICLE_COUNT);
      const tints = new Float32Array(PARTICLE_COUNT);
      const normals = new Float32Array(PARTICLE_COUNT * 3);
      const point = new THREE.Vector3();
      const normal = new THREE.Vector3();
      const dir = new THREE.Vector3();

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        sampler.sample(point, normal);
        normal.normalize();
        normals.set([normal.x, normal.y, normal.z], i * 3);
        // Destino apenas por fuera de la superficie, para quedar visibles sobre el trompo sólido
        targets.set(
          [
            point.x + normal.x * SURFACE_OFFSET,
            point.y + normal.y * SURFACE_OFFSET,
            point.z + normal.z * SURFACE_OFFSET,
          ],
          i * 3
        );

        // Origen disperso en una nube alrededor del trompo
        dir.randomDirection();
        // Radio acotado al encuadre de la cámara (~1.5 de alto visible) para que no se recorte
        const radius = 0.95 + Math.pow(Math.random(), 0.7) * 0.5;
        starts.set([dir.x * radius, dir.y * radius * 0.9 + 0.2, dir.z * radius], i * 3);

        // Se arma de abajo hacia arriba, con algo de aleatoriedad
        delays[i] = ((point.y + 0.76) / 1.97) * INTRO.delaySpread + Math.random() * INTRO.delayJitter;
        sizes[i] = 0.6 + Math.random() * 0.8;
        tints[i] = Math.random() < 0.28 ? 1 : 0;
      }

      particleGeo = new THREE.BufferGeometry();
      particleGeo.setAttribute('position', new THREE.BufferAttribute(targets, 3));
      particleGeo.setAttribute('aStart', new THREE.BufferAttribute(starts, 3));
      particleGeo.setAttribute('aNormal', new THREE.BufferAttribute(normals, 3));
      particleGeo.setAttribute('aDelay', new THREE.BufferAttribute(delays, 1));
      particleGeo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
      particleGeo.setAttribute('aTint', new THREE.BufferAttribute(tints, 1));

      particleMat = new THREE.ShaderMaterial({
        vertexShader: particleVertexShader,
        fragmentShader: particleFragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uTravel: { value: INTRO.travel },
          uSize: { value: 18 },
          uPixelRatio: { value: renderer.getPixelRatio() },
          uOpacity: { value: 1 },
          uSurface: { value: 0 },
          uColorA: { value: new THREE.Color(0xf4f7fb) },
          uColorB: { value: new THREE.Color(0x3b82f6) },
        },
        transparent: true,
        depthWrite: false,
        // La cara trasera se oculta en el shader (por la normal), así no hay cortes bruscos de profundidad
        depthTest: false,
      });

      particles = new THREE.Points(particleGeo, particleMat);
      particles.frustumCulled = false;
      particles.renderOrder = 1;
      spinGroup.add(particles);

      // El trompo sólido y el aro arrancan invisibles y aparecen al final
      porcelainMaterial.transparent = true;
      porcelainMaterial.opacity = 0;
      baseRingMat.opacity = 0;
    }

    const disposeParticles = () => {
      if (!particles) return;
      spinGroup.remove(particles);
      particleGeo.dispose();
      particleMat.dispose();
      particles = null;
    };

    // Deja el trompo exactamente con la misma configuración que antes de la intro
    const finishIntro = () => {
      disposeParticles();
      porcelainMaterial.opacity = 1;
      porcelainMaterial.transparent = false;
      porcelainMaterial.needsUpdate = true;
      baseRingMat.opacity = 0.22;
    };

    let rafId = 0;
    const clock = new THREE.Clock();
    let introTime = 0;
    let lastFrame = performance.now();

    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      // Paso de tiempo limitado: si la pestaña estaba oculta, la intro no salta al final
      const now = performance.now();
      const dt = Math.min((now - lastFrame) / 1000, 0.1);
      lastFrame = now;
      introTime += dt;

      // Giro: velocidad normal durante el ensamblado y luego frena suave hasta quedar quieto.
      // (1 - u)² hace que la desaceleración llegue a cero sin tirón final.
      let spinSpeed = 0;

      if (particles) {
        const [downStart, downEnd] = INTRO.spinDown;
        const u = Math.min(Math.max((introTime - downStart) / (downEnd - downStart), 0), 1);
        spinSpeed = SPIN_SPEED * (1 - u) * (1 - u);

        const meshK = smoothRange(introTime, ...INTRO.meshIn);
        porcelainMaterial.opacity = meshK;
        baseRingMat.opacity = 0.22 * meshK;

        // Las partículas acompañan el frenado: se apagan a medida que el giro se detiene
        particleMat.uniforms.uTime.value = introTime;
        particleMat.uniforms.uSurface.value = meshK;
        particleMat.uniforms.uOpacity.value = Math.pow(1 - u, 1.6);

        if (introTime >= INTRO.end) finishIntro();
      }

      pointer.x += (pointer.targetX - pointer.x) * 0.05;
      pointer.y += (pointer.targetY - pointer.y) * 0.05;

      spinGroup.rotation.y += spinSpeed * dt;

      // Precesión sutil y reacción al mouse y scroll
      const scrollFactor = Math.min(window.scrollY / 600, 1);
      pivotGroup.rotation.z = -0.34 + Math.sin(elapsed * 1.1) * 0.045 + pointer.x * 0.14;
      pivotGroup.rotation.x = 0.22 + Math.cos(elapsed * 0.9) * 0.035 + pointer.y * 0.1 - scrollFactor * 0.25;
      pivotGroup.position.y = Math.sin(elapsed * 1.3) * 0.04 - scrollFactor * 0.35;

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(rafId);
      disposeParticles();
      window.removeEventListener('pointermove', handlePointerMove);
      resizeObserver.disconnect();
      latheGeo.dispose();
      baseRingGeo.dispose();
      porcelainMaterial.dispose();
      baseRingMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      aria-hidden="true"
      className="w-full h-full pointer-events-none select-none"
    />
  );
}
