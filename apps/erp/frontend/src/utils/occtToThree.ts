import * as THREE from 'three';
import type { OcctImportResult, OcctMesh, OcctNode } from './occtLoader';

const DEFAULT_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xb8c5d6,
  metalness: 0.15,
  roughness: 0.55,
});

function meshToThree(mesh: OcctMesh): THREE.Mesh {
  const pos = mesh.attributes.position.array;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));

  if (mesh.attributes.index?.array?.length) {
    geometry.setIndex(mesh.attributes.index.array);
  }

  if (mesh.attributes.normal?.array?.length) {
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.attributes.normal.array, 3));
  } else {
    geometry.computeVertexNormals();
  }

  const material = DEFAULT_MATERIAL.clone();
  if (mesh.color && mesh.color.length >= 3) {
    material.color.setRGB(mesh.color[0], mesh.color[1], mesh.color[2]);
  }

  return new THREE.Mesh(geometry, material);
}

function addOcctNode(node: OcctNode, meshes: OcctMesh[], parent: THREE.Group) {
  for (const idx of node.meshes ?? []) {
    if (meshes[idx]) parent.add(meshToThree(meshes[idx]));
  }
  for (const child of node.children ?? []) {
    addOcctNode(child, meshes, parent);
  }
}

/** Converte resultado do occt-import-js em grupo Three.js. */
export function occtResultToGroup(result: OcctImportResult): THREE.Group {
  if (!result.success) {
    throw new Error('Não foi possível interpretar o arquivo CAD.');
  }
  const group = new THREE.Group();
  if (result.root) {
    addOcctNode(result.root, result.meshes ?? [], group);
  } else {
    for (const mesh of result.meshes ?? []) {
      group.add(meshToThree(mesh));
    }
  }
  if (group.children.length === 0) {
    throw new Error('O arquivo CAD não contém geometria visível.');
  }
  return group;
}
