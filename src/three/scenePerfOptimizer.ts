/**
 * scenePerfOptimizer.ts
 * Mobile-safe scene hardening: freeze static matrices, share simple materials,
 * and trim unnecessary shadow casters — without changing visuals meaningfully.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const SHARED_COLOR_MATERIALS = new Map<string, THREE.MeshStandardMaterial>();

function materialCacheKey(mat: THREE.MeshStandardMaterial): string | null {
  // Only share plain color materials (no maps) — safe for procedural props.
  if (
    mat.map ||
    mat.normalMap ||
    mat.roughnessMap ||
    mat.metalnessMap ||
    mat.aoMap ||
    mat.emissiveMap ||
    mat.alphaMap ||
    mat.transparent ||
    mat.opacity < 0.999
  ) {
    return null;
  }
  const color = mat.color?.getHex?.() ?? 0;
  const rough = Math.round((mat.roughness ?? 1) * 100);
  const metal = Math.round((mat.metalness ?? 0) * 100);
  const side = mat.side ?? THREE.FrontSide;
  return `${color}|${rough}|${metal}|${side}`;
}

function getSharedStandardMaterial(
  source: THREE.MeshStandardMaterial
): THREE.MeshStandardMaterial {
  const key = materialCacheKey(source);
  if (!key) return source;
  let shared = SHARED_COLOR_MATERIALS.get(key);
  if (!shared) {
    shared = source.clone();
    SHARED_COLOR_MATERIALS.set(key, shared);
  }
  return shared;
}

export interface SceneOptimizeOptions {
  /** Disable castShadow on meshes smaller than this world-space diagonal. */
  minShadowCasterSize?: number;
  /** When true, also collapse plain materials into a shared cache. */
  sharePlainMaterials?: boolean;
  /** Freeze matrixAutoUpdate on marked-static or leaf meshes under a static root. */
  freezeStaticMatrices?: boolean;
}

/**
 * Marks a group as static environment so children can freeze transforms.
 */
export function markGroupStatic(root: THREE.Object3D): void {
  root.userData.isStaticEnvironment = true;
  root.traverse((obj) => {
    obj.userData.isStaticEnvironment = true;
  });
}

function isAnimatedOrBoneNode(obj: THREE.Object3D): boolean {
  if (obj.userData?.keepMatrixAutoUpdate) return true;
  if (obj.userData?.hasSkeletalCharacter || obj.userData?.botAnimCtrl) return true;
  if ((obj as THREE.SkinnedMesh).isSkinnedMesh) return true;
  if ((obj as THREE.Bone).isBone) return true;
  // Mixamo / character bone naming — never freeze these matrices.
  if (/mixamorig|Armature|Bone/i.test(obj.name || '')) return true;
  return false;
}

/**
 * Protects skeletal characters / bones from matrix freezing.
 * Must run AFTER markGroupStatic and BEFORE optimizeSceneGraph.
 */
export function protectAnimatedSubtrees(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (
      obj.userData?.hasSkeletalCharacter ||
      obj.userData?.botAnimCtrl ||
      (obj as THREE.SkinnedMesh).isSkinnedMesh
    ) {
      obj.traverse((child) => {
        child.userData.keepMatrixAutoUpdate = true;
        child.userData.isStaticEnvironment = false;
        child.matrixAutoUpdate = true;
      });
    }
  });
}

/**
 * One-shot pass after level build / GLB load.
 * Safe to call multiple times (idempotent via userData.perfOptimized).
 */
export function optimizeSceneGraph(
  root: THREE.Object3D,
  options: SceneOptimizeOptions = {}
): { meshesTouched: number; materialsShared: number; shadowsDisabled: number } {
  const minShadow = options.minShadowCasterSize ?? 0.35;
  const shareMats = options.sharePlainMaterials !== false;
  const freeze = options.freezeStaticMatrices !== false;

  let meshesTouched = 0;
  let materialsShared = 0;
  let shadowsDisabled = 0;

  const box = new THREE.Box3();
  const size = new THREE.Vector3();

  root.traverse((obj) => {
    if (obj.userData.perfOptimized) return;

    // Never freeze bones / skinned character hierarchies — that locks Mixamo in T-pose.
    if (isAnimatedOrBoneNode(obj)) {
      obj.userData.keepMatrixAutoUpdate = true;
      obj.userData.isStaticEnvironment = false;
      obj.matrixAutoUpdate = true;
      obj.userData.perfOptimized = true;
      return;
    }

    if (freeze && (obj.userData.isStaticEnvironment || root.userData.isStaticEnvironment)) {
      if (!obj.userData.keepMatrixAutoUpdate) {
        obj.updateMatrix();
        obj.matrixAutoUpdate = false;
      }
    }

    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) {
      obj.userData.perfOptimized = true;
      return;
    }

    meshesTouched += 1;

    if (shareMats) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      let changed = false;
      const next = materials.map((m) => {
        if (!m || !(m as THREE.MeshStandardMaterial).isMeshStandardMaterial) return m;
        const std = m as THREE.MeshStandardMaterial;
        const shared = getSharedStandardMaterial(std);
        if (shared !== std) {
          materialsShared += 1;
          changed = true;
          // Dispose orphan plain material if it was unique to this mesh.
          if (!std.userData?.keepAlive) {
            // Don't dispose textures (none on plain mats); free GPU program slot.
            std.dispose();
          }
        }
        return shared;
      });
      if (changed) {
        mesh.material = Array.isArray(mesh.material) ? next : next[0];
      }
    }

    if (mesh.castShadow) {
      box.setFromObject(mesh);
      box.getSize(size);
      const diag = size.length();
      if (diag > 0 && diag < minShadow) {
        mesh.castShadow = false;
        shadowsDisabled += 1;
      }
    }

    mesh.userData.perfOptimized = true;
  });

  return { meshesTouched, materialsShared, shadowsDisabled };
}

/**
 * Builds an InstancedMesh from identical geometry/material placements.
 * Returns null if count < 2 (caller should keep individual meshes).
 */
export function buildInstancedFromTransforms(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  transforms: Array<{
    position: THREE.Vector3;
    rotation?: THREE.Euler;
    scale?: THREE.Vector3;
  }>,
  castShadow = false
): THREE.InstancedMesh | null {
  if (transforms.length < 2) return null;
  const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < transforms.length; i++) {
    const t = transforms[i];
    dummy.position.copy(t.position);
    if (t.rotation) dummy.rotation.copy(t.rotation);
    else dummy.rotation.set(0, 0, 0);
    if (t.scale) dummy.scale.copy(t.scale);
    else dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.userData.isStaticEnvironment = true;
  mesh.userData.perfOptimized = true;
  return mesh;
}

export function clearSharedMaterialCache(): void {
  SHARED_COLOR_MATERIALS.forEach((m) => m.dispose());
  SHARED_COLOR_MATERIALS.clear();
}

/**
 * Collapse duplicate Mesh nodes that share geometry+material into InstancedMesh.
 * Call AFTER triangle collider bake (buildFromGroup does not expand instances).
 * Cuts Eastern City-style 1k–4k node graphs down to ~1 draw per unique mesh.
 */
export function consolidateDuplicateMeshesToInstances(
  root: THREE.Object3D,
  minCount = 3
): number {
  type Entry = { mesh: THREE.Mesh; parent: THREE.Object3D };
  const buckets = new Map<string, Entry[]>();

  root.updateMatrixWorld(true);
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry || !mesh.parent) return;
    if ((mesh as THREE.InstancedMesh).isInstancedMesh) return;
    if (mesh.userData?.targetId || mesh.userData?.skipInstanceConsolidate) return;
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (!mat) return;
    const key = `${mesh.geometry.uuid}|${mat.uuid}`;
    let list = buckets.get(key);
    if (!list) {
      list = [];
      buckets.set(key, list);
    }
    list.push({ mesh, parent: mesh.parent });
  });

  let consolidated = 0;
  const _mat = new THREE.Matrix4();
  const _inv = new THREE.Matrix4();
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();

  buckets.forEach((list) => {
    if (list.length < minCount) return;
    const geo = list[0].mesh.geometry;
    const mat = Array.isArray(list[0].mesh.material)
      ? list[0].mesh.material[0]
      : list[0].mesh.material;
    const inst = new THREE.InstancedMesh(geo, mat, list.length);
    inst.name = `Instanced_${list[0].mesh.name || 'prop'}`;
    inst.castShadow = false;
    inst.receiveShadow = list[0].mesh.receiveShadow;
    inst.frustumCulled = true;
    inst.userData.isEnvironment = true;
    inst.userData.isStaticEnvironment = true;
    inst.matrixAutoUpdate = false;

    // Parent under root so world matrices stay valid relative to map lift group.
    root.add(inst);
    for (let i = 0; i < list.length; i++) {
      const { mesh, parent } = list[i];
      mesh.updateMatrixWorld(true);
      _mat.copy(mesh.matrixWorld).premultiply(_inv);
      inst.setMatrixAt(i, _mat);
      parent.remove(mesh);
    }
    inst.instanceMatrix.needsUpdate = true;
    consolidated += list.length;
  });

  return consolidated;
}

/**
 * Spatial-cell static geometry batching by Material (100% pixel-identical visuals).
 * Merges static environment meshes sharing exact Material, shadow flags, renderOrder,
 * and vertex attribute layout within `cellSize`-meter grid sectors so frustum culling
 * remains sharp while dramatically cutting WebGL draw calls on mobile GPUs.
 * Call AFTER triangle collider bake and AFTER consolidateDuplicateMeshesToInstances.
 */
export function mergeStaticMeshesByMaterial(
  root: THREE.Object3D,
  cellSize = 28
): { mergedGroups: number; meshesEliminated: number } {
  type MergeEntry = {
    mesh: THREE.Mesh;
    parent: THREE.Object3D;
    vertexCount: number;
  };

  const buckets = new Map<string, MergeEntry[]>();
  const geoRefCounts = new Map<string, number>();
  const invRoot = new THREE.Matrix4();
  const relMatrix = new THREE.Matrix4();
  const worldCenter = new THREE.Vector3();

  root.updateMatrixWorld(true);
  invRoot.copy(root.matrixWorld).invert();

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    geoRefCounts.set(mesh.geometry.uuid, (geoRefCounts.get(mesh.geometry.uuid) ?? 0) + 1);
    if (!mesh.visible || !mesh.parent) return;
    if ((mesh as THREE.InstancedMesh).isInstancedMesh) return;
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
    if (Array.isArray(mesh.material) || !mesh.material) return;
    if (mesh.userData?.targetId || mesh.userData?.skipStaticMerge) return;
    if (mesh.morphTargetInfluences && mesh.morphTargetInfluences.length > 0) return;
    if (isAnimatedOrBoneNode(mesh)) return;

    const geo = mesh.geometry;
    const posAttr = geo.attributes?.position;
    if (!posAttr || posAttr.count === 0) return;

    // Skip negative-scale mirrored meshes to guarantee triangle winding stays 100% identical
    if (mesh.matrixWorld.determinant() < 0) return;

    if (!geo.boundingSphere) geo.computeBoundingSphere();
    if (!geo.boundingSphere) return;
    worldCenter.copy(geo.boundingSphere.center).applyMatrix4(mesh.matrixWorld);

    const cellX = Math.floor(worldCenter.x / cellSize);
    const cellZ = Math.floor(worldCenter.z / cellSize);
    const attrSig = Object.keys(geo.attributes).sort().join(',');
    const mat = mesh.material;

    const key = `${mat.uuid}|${mesh.castShadow ? 1 : 0}|${mesh.receiveShadow ? 1 : 0}|${mesh.renderOrder}|${attrSig}|${cellX}|${cellZ}`;
    let list = buckets.get(key);
    if (!list) {
      list = [];
      buckets.set(key, list);
    }
    list.push({ mesh, parent: mesh.parent, vertexCount: posAttr.count });
  });

  const MAX_VERTS_PER_BATCH = 60000;
  let mergedGroups = 0;
  let meshesEliminated = 0;

  buckets.forEach((entries) => {
    if (entries.length < 2) return;

    // Chunk into batches <= MAX_VERTS_PER_BATCH so buffers stay mobile-friendly
    let cursor = 0;
    while (cursor < entries.length) {
      const batch: MergeEntry[] = [];
      let batchVerts = 0;
      while (cursor < entries.length) {
        const next = entries[cursor];
        if (batch.length > 0 && batchVerts + next.vertexCount > MAX_VERTS_PER_BATCH) {
          break;
        }
        batch.push(next);
        batchVerts += next.vertexCount;
        cursor += 1;
      }

      if (batch.length < 2) continue;

      let anyIndexed = false;
      let anyNonIndexed = false;
      for (let i = 0; i < batch.length; i++) {
        if (batch[i].mesh.geometry.index) anyIndexed = true;
        else anyNonIndexed = true;
      }
      const forceNonIndexed = anyIndexed && anyNonIndexed;

      const clones: THREE.BufferGeometry[] = [];
      let prepFailed = false;
      for (let i = 0; i < batch.length; i++) {
        const srcMesh = batch[i].mesh;
        try {
          const g = forceNonIndexed
            ? srcMesh.geometry.toNonIndexed()
            : srcMesh.geometry.clone();
          relMatrix.copy(srcMesh.matrixWorld).premultiply(invRoot);
          g.applyMatrix4(relMatrix);
          clones.push(g);
        } catch {
          prepFailed = true;
          break;
        }
      }

      if (prepFailed || clones.length < 2) {
        for (let i = 0; i < clones.length; i++) clones[i].dispose();
        continue;
      }

      const mergedGeo = mergeGeometries(clones, false);
      for (let i = 0; i < clones.length; i++) clones[i].dispose();
      if (!mergedGeo) continue;

      mergedGeo.computeBoundingBox();
      mergedGeo.computeBoundingSphere();

      const first = batch[0].mesh;
      const mergedMesh = new THREE.Mesh(mergedGeo, first.material);
      mergedMesh.name = `StaticBatch_${mergedGroups}`;
      mergedMesh.castShadow = first.castShadow;
      mergedMesh.receiveShadow = first.receiveShadow;
      mergedMesh.renderOrder = first.renderOrder;
      mergedMesh.frustumCulled = true;
      mergedMesh.userData.isEnvironment = true;
      mergedMesh.userData.isStaticEnvironment = true;
      mergedMesh.matrixAutoUpdate = false;
      mergedMesh.updateMatrix();

      root.add(mergedMesh);

      for (let i = 0; i < batch.length; i++) {
        const { mesh, parent } = batch[i];
        parent.remove(mesh);
        const geoUuid = mesh.geometry.uuid;
        const remaining = (geoRefCounts.get(geoUuid) ?? 1) - 1;
        geoRefCounts.set(geoUuid, remaining);
        if (remaining <= 0) {
          mesh.geometry.dispose();
        }
      }

      mergedGroups += 1;
      meshesEliminated += batch.length - 1;
    }
  });

  return { mergedGroups, meshesEliminated };
}
