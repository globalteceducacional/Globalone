import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { getModel3dFormat, isCad3dFormat, type Model3dFormat } from '../../utils/model3dFormats';
import { getOcctModule, OCCT_MESH_PARAMS } from '../../utils/occtLoader';
import { occtResultToGroup } from '../../utils/occtToThree';
import { btn } from '../../utils/buttonStyles';

type Props = {
  buffer: ArrayBuffer;
  fileName: string;
  onError?: (message: string) => void;
};

const DEFAULT_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xb8c5d6,
  metalness: 0.15,
  roughness: 0.55,
});

type ViewerApi = {
  resetView: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  toggleWireframe: () => void;
};

function fitCameraToObject(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  object: THREE.Object3D,
  grid?: THREE.GridHelper,
) {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  object.position.sub(center);
  const boxAfter = new THREE.Box3().setFromObject(object);

  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  const fovRad = (camera.fov * Math.PI) / 180;
  const distance = (maxDim / 2 / Math.tan(fovRad / 2)) * 1.55;

  camera.position.set(distance, distance * 0.72, distance);
  camera.near = Math.max(distance / 500, 0.001);
  camera.far = distance * 200;
  camera.updateProjectionMatrix();

  controls.target.set(0, 0, 0);
  controls.minDistance = maxDim * 0.08;
  controls.maxDistance = maxDim * 25;
  controls.update();

  if (grid) {
    const scale = Math.max(maxDim / 4, 1);
    grid.scale.setScalar(scale);
    grid.position.y = boxAfter.min.y - 0.01;
  }

  return { distance, maxDim };
}

function disposeObject3D(root: THREE.Object3D) {
  root.traverse((child: THREE.Object3D) => {
    if (child instanceof THREE.Mesh) {
      child.geometry?.dispose();
      const mat = child.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    }
  });
}

async function loadModelIntoGroup(
  format: Model3dFormat,
  buffer: ArrayBuffer,
  group: THREE.Group,
): Promise<void> {
  switch (format) {
    case 'stl': {
      const geometry = new STLLoader().parse(buffer);
      geometry.computeVertexNormals();
      group.add(new THREE.Mesh(geometry, DEFAULT_MATERIAL.clone()));
      return;
    }
    case 'gltf': {
      const loader = new GLTFLoader();
      const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
        loader.parse(
          buffer,
          '',
          (result: { scene: THREE.Group }) => resolve(result),
          (err: unknown) => reject(err),
        );
      });
      group.add(gltf.scene);
      return;
    }
    case 'obj': {
      const text = new TextDecoder().decode(buffer);
      const object = new OBJLoader().parse(text);
      object.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh && !child.material) {
          child.material = DEFAULT_MATERIAL.clone();
        }
      });
      group.add(object);
      return;
    }
    case 'fbx': {
      group.add(new FBXLoader().parse(buffer, ''));
      return;
    }
    case 'ply': {
      const geometry = new PLYLoader().parse(buffer);
      geometry.computeVertexNormals();
      group.add(new THREE.Mesh(geometry, DEFAULT_MATERIAL.clone()));
      return;
    }
    case 'step': {
      const occt = await getOcctModule();
      const fileBuffer = new Uint8Array(buffer);
      const result = occt.ReadStepFile(fileBuffer, OCCT_MESH_PARAMS);
      group.add(occtResultToGroup(result));
      return;
    }
    case 'iges': {
      const occt = await getOcctModule();
      const fileBuffer = new Uint8Array(buffer);
      const result = occt.ReadIgesFile(fileBuffer, OCCT_MESH_PARAMS);
      group.add(occtResultToGroup(result));
      return;
    }
    default:
      throw new Error('Formato não suportado');
  }
}

/**
 * Visualizador 3D para avaliação de trabalhos — Three.js (somente leitura).
 * Controles: girar, zoom, mover; barra com atalhos visíveis.
 */
export function Model3dViewer({ buffer, fileName, onError }: Props) {
  const fileFormat = getModel3dFormat(fileName);
  const isCad = fileFormat ? isCad3dFormat(fileFormat) : false;

  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<ViewerApi | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const [ready, setReady] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  const [statusHint, setStatusHint] = useState(
    isCad ? 'Processando arquivo CAD…' : 'Carregando modelo…',
  );

  const handleWireframe = useCallback(() => {
    apiRef.current?.toggleWireframe();
    setWireframe((v) => !v);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (!fileFormat) {
      onErrorRef.current?.('Formato 3D não suportado para pré-visualização.');
      return;
    }

    let cancelled = false;
    let frameId = 0;
    let animationId = 0;
    let renderer: THREE.WebGLRenderer | null = null;
    let controls: OrbitControls | null = null;
    let wireframeOn = false;

    const modelGroup = new THREE.Group();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x18181b);
    scene.add(modelGroup);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100000);
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.05);
    keyLight.position.set(5, 8, 6);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x99aabb, 0.4);
    fillLight.position.set(-4, 3, -5);
    scene.add(fillLight);

    const grid = new THREE.GridHelper(10, 20, 0x52525b, 0x27272a);
    scene.add(grid);

    const resetView = () => {
      if (!controls) return;
      fitCameraToObject(camera, controls, modelGroup, grid);
    };

    const dolly = (factor: number) => {
      if (!controls) return;
      const offset = camera.position.clone().sub(controls.target);
      const len = offset.length();
      const next = Math.min(
        Math.max(len * factor, controls.minDistance),
        controls.maxDistance,
      );
      offset.setLength(next);
      camera.position.copy(controls.target).add(offset);
      controls.update();
    };

    const toggleWireframeMeshes = () => {
      wireframeOn = !wireframeOn;
      modelGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((m) => {
            if (m && 'wireframe' in m) (m as THREE.MeshStandardMaterial).wireframe = wireframeOn;
          });
        }
      });
    };

    apiRef.current = {
      resetView,
      zoomIn: () => dolly(0.75),
      zoomOut: () => dolly(1.35),
      toggleWireframe: toggleWireframeMeshes,
    };

    const handleResize = () => {
      if (!renderer || !container) return;
      const w = container.clientWidth || 1;
      const h = container.clientHeight || 1;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };

    const start = async () => {
      try {
        if (isCad) {
          setStatusHint('Processando arquivo CAD (pode levar alguns segundos)…');
        }
        await loadModelIntoGroup(fileFormat, buffer, modelGroup);
        if (cancelled || !controls) return;
        resetView();
        if (!cancelled) {
          setReady(true);
          setStatusHint(
            'Arraste: girar · Scroll ou pinça: zoom · Botão direito: mover · Use os botões acima para ajustar a vista',
          );
        }
      } catch (err) {
        if (!cancelled) {
          const msg =
            err instanceof Error ? err.message : 'Não foi possível exibir o modelo 3D.';
          onErrorRef.current?.(msg);
        }
      }
    };

    frameId = requestAnimationFrame(() => {
      if (cancelled || !containerRef.current) return;

      const w = container.clientWidth || 800;
      const h = container.clientHeight || 560;

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      container.appendChild(renderer.domElement);

      camera.aspect = w / h;
      camera.updateProjectionMatrix();

      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.06;
      controls.screenSpacePanning = true;
      controls.enablePan = true;
      controls.enableZoom = true;
      controls.zoomSpeed = 1.15;
      controls.rotateSpeed = 0.9;
      controls.panSpeed = 0.8;
      controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      };
      controls.touches = {
        ONE: THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_PAN,
      };

      void start();

      const animate = () => {
        if (cancelled) return;
        animationId = requestAnimationFrame(animate);
        controls?.update();
        renderer?.render(scene, camera);
      };
      animate();

      window.addEventListener('resize', handleResize);
    });

    return () => {
      cancelled = true;
      setReady(false);
      setWireframe(false);
      apiRef.current = null;
      cancelAnimationFrame(frameId);
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
      controls?.dispose();
      disposeObject3D(modelGroup);
      renderer?.dispose();
      if (container) container.innerHTML = '';
    };
  }, [buffer, fileName, fileFormat, isCad]);

  return (
    <div
      className="model-3d-viewer relative w-full max-w-6xl rounded-lg overflow-hidden border border-white/10 bg-zinc-900"
      style={{ height: 'calc(90vh - 8rem)', maxHeight: 'calc(90vh - 8rem)', minHeight: 360 }}
    >
      <div className="absolute top-2 left-2 right-2 z-10 flex flex-wrap items-center gap-2 pointer-events-none">
        <div className="flex flex-wrap gap-1.5 pointer-events-auto rounded-lg bg-black/55 backdrop-blur-sm border border-white/10 p-1.5">
          <button
            type="button"
            disabled={!ready}
            className={`${btn.ghost} !px-2.5 !py-1 !text-xs !min-h-0`}
            onClick={() => apiRef.current?.zoomIn()}
            title="Aproximar (zoom in)"
          >
            Zoom +
          </button>
          <button
            type="button"
            disabled={!ready}
            className={`${btn.ghost} !px-2.5 !py-1 !text-xs !min-h-0`}
            onClick={() => apiRef.current?.zoomOut()}
            title="Afastar (zoom out)"
          >
            Zoom −
          </button>
          <button
            type="button"
            disabled={!ready}
            className={`${btn.ghost} !px-2.5 !py-1 !text-xs !min-h-0`}
            onClick={() => apiRef.current?.resetView()}
            title="Centralizar modelo"
          >
            Centralizar
          </button>
          <button
            type="button"
            disabled={!ready}
            className={`${btn.ghost} !px-2.5 !py-1 !text-xs !min-h-0 ${wireframe ? '!bg-primary/30' : ''}`}
            onClick={handleWireframe}
            title="Alternar malha"
          >
            Malha
          </button>
        </div>
      </div>

      <div ref={containerRef} className="absolute inset-0 w-full h-full" />

      <div className="absolute bottom-2 left-2 right-2 z-10 pointer-events-none text-center">
        <p className="inline-block text-[11px] text-white/55 bg-black/45 rounded px-2 py-1 max-w-2xl">
          {statusHint}
        </p>
      </div>
    </div>
  );
}
