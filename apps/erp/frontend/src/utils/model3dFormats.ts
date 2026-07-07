/** Formatos 3D suportados no visualizador (Three.js + occt-import-js para CAD). */
export type Model3dFormat =
  | 'stl'
  | 'gltf'
  | 'obj'
  | 'fbx'
  | 'ply'
  | 'step'
  | 'iges';

const EXT_MAP: Record<string, Model3dFormat> = {
  stl: 'stl',
  glb: 'gltf',
  gltf: 'gltf',
  obj: 'obj',
  fbx: 'fbx',
  ply: 'ply',
  step: 'step',
  stp: 'step',
  iges: 'iges',
  igs: 'iges',
};

export function getModel3dFormat(src: string): Model3dFormat | null {
  const path = src.split('?')[0].split('#')[0];
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MAP[ext] ?? null;
}

export function isCad3dFormat(format: Model3dFormat): boolean {
  return format === 'step' || format === 'iges';
}
