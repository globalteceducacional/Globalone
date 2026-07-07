import occtimportjs from 'occt-import-js';
import wasmUrl from 'occt-import-js/dist/occt-import-js.wasm?url';

export type OcctMesh = {
  name?: string;
  color?: [number, number, number];
  attributes: {
    position: { array: number[] };
    normal?: { array: number[] };
    index?: { array: number[] };
  };
};

export type OcctNode = {
  name?: string;
  meshes?: number[];
  children?: OcctNode[];
};

export type OcctImportResult = {
  success: boolean;
  meshes: OcctMesh[];
  root: OcctNode;
};

export type OcctModule = {
  ReadStepFile: (content: Uint8Array, params: OcctTriangulationParams | null) => OcctImportResult;
  ReadIgesFile: (content: Uint8Array, params: OcctTriangulationParams | null) => OcctImportResult;
};

export type OcctTriangulationParams = {
  linearUnit?: 'millimeter' | 'centimeter' | 'meter' | 'inch' | 'foot';
  linearDeflectionType?: 'bounding_box_ratio' | 'absolute_value';
  linearDeflection?: number;
  angularDeflection?: number;
};

let occtPromise: Promise<OcctModule> | null = null;

/** Inicializa OpenCascade WASM (uma vez por sessão). */
export function getOcctModule(): Promise<OcctModule> {
  if (!occtPromise) {
    occtPromise = occtimportjs({
      locateFile: (path: string) => (path.endsWith('.wasm') ? wasmUrl : path),
    }) as Promise<OcctModule>;
  }
  return occtPromise;
}

export const OCCT_MESH_PARAMS: OcctTriangulationParams = {
  linearUnit: 'millimeter',
  linearDeflectionType: 'bounding_box_ratio',
  linearDeflection: 0.008,
  angularDeflection: 0.35,
};
