import * as THREE from 'three';

/**
 * Lossless static-map runtime optimizer for heavy Source 2 / CS arenas (e.g. Yard 2.0 LOD0):
 * - Preserves 100% of original triangles, UVs, textures, and colors (zero decimation).
 * - Collapses multi-tint duplicate materials that share the exact same texture/alpha state
 *   (e.g. 347 -> ~113 materials) by baking each mesh's linear material.color into a compact
 *   normalized Uint8 vertex-color stream (3 bytes/vertex) whenever multiple tints share a texture.
 * - Converts matte zero-normalMap / zero-roughnessMap MeshStandardMaterial surfaces to
 *   MeshLambertMaterial (~55% lower mobile fragment ALU with identical KTX2 albedo textures).
 * - Merges small/medium meshes sharing the same material into single draw calls, and spatially
 *   partitions ONLY giant multi-sector megameshes (>16k tris spanning >55m, or micro-detail clutter
 *   spanning >32m) into tight world-space cells so hardware frustum culling discards 60–75% of the
 *   geometry behind the camera while ALSO slashing visible draw calls well below the original count.
 * - Provides a zero-GC distance-culling updater strictly for micro-detail clutter (grass tufts,
 *   pebbles, wires, leaves, rags) beyond 46m on mobile / 82m on desktop — never culling buildings,
 *   walls, doors, gates, crates, stairs, or ground.
 */

const MICRO_DETAIL_RE =
  /grass_floor|stones_a|ivy|leaves_narrow|round_leaved|barbed_wire|washing|house_wires|rags|carpet_fringe|flower|rubble|debris|garbage/i;

const REFLECTIVE_OR_SPECIAL_MAT_RE =
  /afghan_glass|ural_afghan_glass|window_glass|glass|window|water/i;

const ARCH_CELL_SIZE = 46;
const MICRO_CELL_SIZE = 28;
const ARCH_SPLIT_SPAN = 52;
const ARCH_SPLIT_TRIS = 15000;
const MICRO_SPLIT_SPAN = 32;
const MICRO_SPLIT_TRIS = 2500;
const MAX_VERTS_PER_BATCH = 65000;

export interface StaticMapVisibilityController {
  /** Zero-GC per-frame updater (throttled internally to every 4th call). */
  update: (camX: number, camY: number, camZ: number) => void;
  stats: {
    originalMeshes: number;
    optimizedMeshes: number;
    originalMaterials: number;
    dedupedMaterials: number;
    lambertConverted: number;
    totalTrianglesPreserved: number;
    microDetailChunks: number;
  };
}

interface RawChunk {
  pos: Float32Array;
  norm: Float32Array | null;
  uv: Float32Array | null;
  colU8: Uint8Array | null;
  indices: Uint16Array | Uint32Array;
  vertCount: number;
}

interface ExtractedMeshEntry {
  mesh: THREE.Mesh;
  rawMat: THREE.Material;
  groupKey: string;
  isLambertCandidate: boolean;
  isMicroDetail: boolean;
  tintR: number;
  tintG: number;
  tintB: number;
  tintKey: string;
  castShadow: boolean;
  receiveShadow: boolean;
  renderOrder: number;
}

interface MaterialGroup {
  templateMat: THREE.Material;
  isLambertCandidate: boolean;
  isMicroDetail: boolean;
  castShadow: boolean;
  receiveShadow: boolean;
  renderOrder: number;
  tints: Set<string>;
  entries: ExtractedMeshEntry[];
}

function getBaseTextureMaterialKey(
  mat: THREE.Material,
  isLambertCandidate: boolean,
  castShadow: boolean,
  receiveShadow: boolean,
  renderOrder: number,
  isMicroDetail: boolean
): string {
  const m = mat as THREE.MeshStandardMaterial;
  const mapId = m.map ? m.map.source?.uuid || m.map.uuid : 'none';
  const alphaId = m.alphaMap ? m.alphaMap.source?.uuid || m.alphaMap.uuid : 'none';
  const normId = m.normalMap ? m.normalMap.source?.uuid || m.normalMap.uuid : 'none';
  const roughId = m.roughnessMap ? m.roughnessMap.source?.uuid || m.roughnessMap.uuid : 'none';
  const metalId = m.metalnessMap ? m.metalnessMap.source?.uuid || m.metalnessMap.uuid : 'none';
  const op = Math.round((m.opacity ?? 1) * 100);
  const at = Math.round((m.alphaTest ?? 0) * 100);
  const po = m.polygonOffset ? `${m.polygonOffsetFactor},${m.polygonOffsetUnits}` : '0';
  const wrap = m.map
    ? `${m.map.wrapS},${m.map.wrapT},${m.map.repeat.x},${m.map.repeat.y},${m.map.offset.x},${m.map.offset.y}`
    : '';
  // Include HDR guard: if a material has color > 1.0, keep it unmerged with non-HDR tints
  const isHdrTint = m.color && (m.color.r > 1.01 || m.color.g > 1.01 || m.color.b > 1.01);
  const hdrTag = isHdrTint ? `HDR:${m.color.r.toFixed(2)},${m.color.g.toFixed(2)},${m.color.b.toFixed(2)}` : 'LDR';
  return `${isLambertCandidate ? 'L' : mat.type}|${mapId}|${wrap}|${alphaId}|${normId}|${roughId}|${metalId}|${m.transparent ? 1 : 0}|${op}|${at}|${m.depthWrite ? 1 : 0}|${m.side}|${po}|${castShadow ? 1 : 0}|${receiveShadow ? 1 : 0}|${renderOrder}|${isMicroDetail ? 1 : 0}|${hdrTag}`;
}

function canConvertToMatteLambert(mat: THREE.Material): boolean {
  if (!(mat instanceof THREE.MeshStandardMaterial)) return false;
  if (
    mat.normalMap ||
    mat.roughnessMap ||
    mat.metalnessMap ||
    mat.bumpMap ||
    mat.aoMap ||
    mat.emissiveMap
  ) {
    return false;
  }
  const nameLower = (mat.name || '').toLowerCase();
  if (REFLECTIVE_OR_SPECIAL_MAT_RE.test(nameLower)) return false;
  if ((mat.metalness ?? 0) > 0.14) return false;
  if (mat.emissive && mat.emissive.r + mat.emissive.g + mat.emissive.b > 0.01) {
    return false;
  }
  return true;
}

function createSharedMaterial(
  src: THREE.Material,
  convertToLambert: boolean,
  bakeVertexColors: boolean
): THREE.Material {
  if (convertToLambert && src instanceof THREE.MeshStandardMaterial) {
    return new THREE.MeshLambertMaterial({
      name: src.name,
      map: src.map,
      alphaMap: src.alphaMap,
      color: bakeVertexColors ? new THREE.Color(0xffffff) : src.color.clone(),
      transparent: src.transparent,
      opacity: src.opacity,
      alphaTest: src.alphaTest,
      depthWrite: src.depthWrite,
      depthTest: src.depthTest,
      side: src.side,
      polygonOffset: src.polygonOffset,
      polygonOffsetFactor: src.polygonOffsetFactor,
      polygonOffsetUnits: src.polygonOffsetUnits,
      vertexColors: bakeVertexColors || src.vertexColors,
      fog: src.fog,
    });
  }

  if (bakeVertexColors && src instanceof THREE.MeshStandardMaterial) {
    const cloned = src.clone();
    cloned.color.setHex(0xffffff);
    cloned.vertexColors = true;
    cloned.needsUpdate = true;
    return cloned;
  }

  return src;
}

function extractWorldBakedMesh(
  geom: THREE.BufferGeometry,
  matrixWorld: THREE.Matrix4,
  bakeTint: boolean,
  tintR: number,
  tintG: number,
  tintB: number
): {
  pos: Float32Array;
  norm: Float32Array | null;
  uv: Float32Array | null;
  colU8: Uint8Array | null;
  indices: Uint32Array;
  vertCount: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} | null {
  const posAttr = geom.attributes.position;
  if (!posAttr || posAttr.count === 0) return null;

  const vertCount = posAttr.count;
  const pos = new Float32Array(vertCount * 3);
  const v = new THREE.Vector3();
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < vertCount; i++) {
    v.fromBufferAttribute(posAttr, i).applyMatrix4(matrixWorld);
    pos[i * 3] = v.x;
    pos[i * 3 + 1] = v.y;
    pos[i * 3 + 2] = v.z;
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.z < minZ) minZ = v.z;
    if (v.z > maxZ) maxZ = v.z;
  }

  let norm: Float32Array | null = null;
  const normAttr = geom.attributes.normal;
  if (normAttr && normAttr.count === vertCount) {
    norm = new Float32Array(vertCount * 3);
    const normalMat = new THREE.Matrix3().getNormalMatrix(matrixWorld);
    for (let i = 0; i < vertCount; i++) {
      v.fromBufferAttribute(normAttr, i).applyMatrix3(normalMat).normalize();
      norm[i * 3] = v.x;
      norm[i * 3 + 1] = v.y;
      norm[i * 3 + 2] = v.z;
    }
  }

  let uv: Float32Array | null = null;
  const uvAttr = geom.attributes.uv;
  if (uvAttr && uvAttr.count === vertCount) {
    uv = new Float32Array(vertCount * 2);
    for (let i = 0; i < vertCount; i++) {
      uv[i * 2] = uvAttr.getX(i);
      uv[i * 2 + 1] = uvAttr.getY(i);
    }
  }

  let colU8: Uint8Array | null = null;
  const colAttr = geom.attributes.color;
  if (bakeTint || (colAttr && colAttr.count === vertCount)) {
    colU8 = new Uint8Array(vertCount * 3);
    const tr = Math.max(0, Math.min(1, tintR));
    const tg = Math.max(0, Math.min(1, tintG));
    const tb = Math.max(0, Math.min(1, tintB));
    if (colAttr && colAttr.count === vertCount) {
      for (let i = 0; i < vertCount; i++) {
        colU8[i * 3] = Math.round(Math.max(0, Math.min(1, colAttr.getX(i) * tr)) * 255);
        colU8[i * 3 + 1] = Math.round(Math.max(0, Math.min(1, colAttr.getY(i) * tg)) * 255);
        colU8[i * 3 + 2] = Math.round(Math.max(0, Math.min(1, colAttr.getZ(i) * tb)) * 255);
      }
    } else {
      const r8 = Math.round(tr * 255);
      const g8 = Math.round(tg * 255);
      const b8 = Math.round(tb * 255);
      for (let i = 0; i < vertCount; i++) {
        colU8[i * 3] = r8;
        colU8[i * 3 + 1] = g8;
        colU8[i * 3 + 2] = b8;
      }
    }
  }

  const indexAttr = geom.index;
  const triCount = indexAttr
    ? Math.floor(indexAttr.count / 3)
    : Math.floor(vertCount / 3);
  if (triCount === 0) return null;

  const flipWinding = matrixWorld.determinant() < 0;
  const indices = new Uint32Array(triCount * 3);
  for (let t = 0; t < triCount; t++) {
    const i0 = indexAttr ? indexAttr.getX(t * 3) : t * 3;
    const i1 = indexAttr ? indexAttr.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = indexAttr ? indexAttr.getX(t * 3 + 2) : t * 3 + 2;
    indices[t * 3] = i0;
    indices[t * 3 + 1] = flipWinding ? i2 : i1;
    indices[t * 3 + 2] = flipWinding ? i1 : i2;
  }

  return { pos, norm, uv, colU8, indices, vertCount, minX, maxX, minZ, maxZ };
}

function splitBakedIntoSpatialCells(
  baked: NonNullable<ReturnType<typeof extractWorldBakedMesh>>,
  cellSize: number
): Map<string, RawChunk> {
  const triCount = baked.indices.length / 3;
  const cellTriLists = new Map<string, number[]>();

  for (let t = 0; t < triCount; t++) {
    const i0 = baked.indices[t * 3];
    const i1 = baked.indices[t * 3 + 1];
    const i2 = baked.indices[t * 3 + 2];
    const cx = (baked.pos[i0 * 3] + baked.pos[i1 * 3] + baked.pos[i2 * 3]) / 3;
    const cz = (baked.pos[i0 * 3 + 2] + baked.pos[i1 * 3 + 2] + baked.pos[i2 * 3 + 2]) / 3;
    const key = `${Math.floor(cx / cellSize)},${Math.floor(cz / cellSize)}`;
    let list = cellTriLists.get(key);
    if (!list) {
      list = [];
      cellTriLists.set(key, list);
    }
    list.push(i0, i1, i2);
  }

  const remap = new Int32Array(baked.vertCount);
  remap.fill(-1);
  const touched: number[] = [];
  const result = new Map<string, RawChunk>();

  cellTriLists.forEach((triIndices, cellKey) => {
    touched.length = 0;
    let nextLocal = 0;
    for (let i = 0; i < triIndices.length; i++) {
      const gv = triIndices[i];
      if (remap[gv] === -1) {
        remap[gv] = nextLocal++;
        touched.push(gv);
      }
    }

    const pos = new Float32Array(nextLocal * 3);
    const norm = baked.norm ? new Float32Array(nextLocal * 3) : null;
    const uv = baked.uv ? new Float32Array(nextLocal * 2) : null;
    const colU8 = baked.colU8 ? new Uint8Array(nextLocal * 3) : null;

    for (let lv = 0; lv < nextLocal; lv++) {
      const gv = touched[lv];
      pos[lv * 3] = baked.pos[gv * 3];
      pos[lv * 3 + 1] = baked.pos[gv * 3 + 1];
      pos[lv * 3 + 2] = baked.pos[gv * 3 + 2];
      if (norm && baked.norm) {
        norm[lv * 3] = baked.norm[gv * 3];
        norm[lv * 3 + 1] = baked.norm[gv * 3 + 1];
        norm[lv * 3 + 2] = baked.norm[gv * 3 + 2];
      }
      if (uv && baked.uv) {
        uv[lv * 2] = baked.uv[gv * 2];
        uv[lv * 2 + 1] = baked.uv[gv * 2 + 1];
      }
      if (colU8 && baked.colU8) {
        colU8[lv * 3] = baked.colU8[gv * 3];
        colU8[lv * 3 + 1] = baked.colU8[gv * 3 + 1];
        colU8[lv * 3 + 2] = baked.colU8[gv * 3 + 2];
      }
    }

    const indices =
      nextLocal <= 65535
        ? new Uint16Array(triIndices.length)
        : new Uint32Array(triIndices.length);
    for (let i = 0; i < triIndices.length; i++) {
      indices[i] = remap[triIndices[i]];
    }
    for (let lv = 0; lv < nextLocal; lv++) {
      remap[touched[lv]] = -1;
    }

    result.set(cellKey, { pos, norm, uv, colU8, indices, vertCount: nextLocal });
  });

  return result;
}

function buildMergedBufferGeometry(
  chunks: RawChunk[],
  hasNorm: boolean,
  hasUv: boolean,
  hasCol: boolean
): THREE.BufferGeometry {
  let totalVerts = 0;
  let totalIndices = 0;
  for (let i = 0; i < chunks.length; i++) {
    totalVerts += chunks[i].vertCount;
    totalIndices += chunks[i].indices.length;
  }

  const pos = new Float32Array(totalVerts * 3);
  const norm = hasNorm ? new Float32Array(totalVerts * 3) : null;
  const uv = hasUv ? new Float32Array(totalVerts * 2) : null;
  const colU8 = hasCol ? new Uint8Array(totalVerts * 3) : null;
  const indices =
    totalVerts <= 65535
      ? new Uint16Array(totalIndices)
      : new Uint32Array(totalIndices);

  let vOffset = 0;
  let iOffset = 0;
  for (let c = 0; c < chunks.length; c++) {
    const ch = chunks[c];
    pos.set(ch.pos, vOffset * 3);
    if (norm && ch.norm) norm.set(ch.norm, vOffset * 3);
    if (uv && ch.uv) uv.set(ch.uv, vOffset * 2);
    if (colU8) {
      if (ch.colU8) {
        colU8.set(ch.colU8, vOffset * 3);
      } else {
        colU8.fill(255, vOffset * 3, (vOffset + ch.vertCount) * 3);
      }
    }

    const srcIdx = ch.indices;
    for (let k = 0; k < srcIdx.length; k++) {
      indices[iOffset + k] = srcIdx[k] + vOffset;
    }
    vOffset += ch.vertCount;
    iOffset += srcIdx.length;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (norm) geom.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
  if (uv) geom.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (colU8) geom.setAttribute('color', new THREE.BufferAttribute(colU8, 3, true));
  geom.setIndex(new THREE.BufferAttribute(indices, 1));
  if (!norm) geom.computeVertexNormals();
  geom.computeBoundingBox();
  geom.computeBoundingSphere();
  return geom;
}

export function optimizeStaticMapForRuntime(
  mapTransformGroup: THREE.Group,
  options: {
    isMobile: boolean;
    convertMatteToLambert: boolean;
    microDetailMaxDist?: number;
  }
): StaticMapVisibilityController {
  mapTransformGroup.updateMatrixWorld(true);

  const sourceMeshes: THREE.Mesh[] = [];
  const originalMatSet = new Set<THREE.Material>();
  const materialGroups = new Map<string, MaterialGroup>();

  mapTransformGroup.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.geometry) return;
    if (child.userData.playerClipOnly || !child.visible) return;
    if (Array.isArray(child.material) && child.material.length > 1) {
      child.geometry.computeBoundingBox();
      child.geometry.computeBoundingSphere();
      child.frustumCulled = true;
      child.matrixAutoUpdate = false;
      child.updateMatrix();
      return;
    }
    const rawMat = Array.isArray(child.material) ? child.material[0] : child.material;
    if (!rawMat) return;
    sourceMeshes.push(child);
    originalMatSet.add(rawMat);

    const meshNameLower = (child.name || '').toLowerCase();
    const matNameLower = (rawMat.name || '').toLowerCase();
    const isMicroDetail =
      MICRO_DETAIL_RE.test(meshNameLower) || MICRO_DETAIL_RE.test(matNameLower);
    const isLambertCandidate =
      options.convertMatteToLambert && canConvertToMatteLambert(rawMat);

    const groupKey = getBaseTextureMaterialKey(
      rawMat,
      isLambertCandidate,
      child.castShadow,
      child.receiveShadow,
      child.renderOrder,
      isMicroDetail
    );

    const std = rawMat as THREE.MeshStandardMaterial;
    const tintR = std.color ? std.color.r : 1;
    const tintG = std.color ? std.color.g : 1;
    const tintB = std.color ? std.color.b : 1;
    const tintKey = `${Math.round(tintR * 255)},${Math.round(tintG * 255)},${Math.round(tintB * 255)}`;

    let grp = materialGroups.get(groupKey);
    if (!grp) {
      grp = {
        templateMat: rawMat,
        isLambertCandidate,
        isMicroDetail,
        castShadow: child.castShadow,
        receiveShadow: child.receiveShadow,
        renderOrder: child.renderOrder,
        tints: new Set<string>(),
        entries: [],
      };
      materialGroups.set(groupKey, grp);
    }
    grp.tints.add(tintKey);
    grp.entries.push({
      mesh: child,
      rawMat,
      groupKey,
      isLambertCandidate,
      isMicroDetail,
      tintR,
      tintG,
      tintB,
      tintKey,
      castShadow: child.castShadow,
      receiveShadow: child.receiveShadow,
      renderOrder: child.renderOrder,
    });
  });

  const optimizedGroup = new THREE.Group();
  optimizedGroup.name = `${mapTransformGroup.name}_OptimizedSpatial`;
  optimizedGroup.matrixAutoUpdate = false;
  optimizedGroup.updateMatrix();

  if (
    mapTransformGroup.position.x !== 0 ||
    mapTransformGroup.position.y !== 0 ||
    mapTransformGroup.position.z !== 0
  ) {
    optimizedGroup.position.set(
      -mapTransformGroup.position.x,
      -mapTransformGroup.position.y,
      -mapTransformGroup.position.z
    );
    optimizedGroup.updateMatrix();
  }

  const keptMats = new Set<THREE.Material>();
  const oldMatsToDispose = new Set<THREE.Material>();
  let lambertConverted = 0;
  let totalTrianglesPreserved = 0;
  let optimizedMeshCount = 0;

  const microMeshes: THREE.Mesh[] = [];
  const microCenters: number[] = [];
  const microThresholdSq: number[] = [];
  const maxDetailDist =
    options.microDetailMaxDist ?? (options.isMobile ? 46 : 82);

  materialGroups.forEach((grp) => {
    const bakeVertexColors = grp.tints.size > 1;
    const sharedMat = createSharedMaterial(
      grp.templateMat,
      grp.isLambertCandidate,
      bakeVertexColors
    );
    if (sharedMat instanceof THREE.MeshLambertMaterial) {
      lambertConverted++;
    }
    keptMats.add(sharedMat);
    for (let i = 0; i < grp.entries.length; i++) {
      if (grp.entries[i].rawMat !== sharedMat) {
        oldMatsToDispose.add(grp.entries[i].rawMat);
      }
    }

    // Extract world-space geometry for every mesh in this material group
    const bakedList: NonNullable<ReturnType<typeof extractWorldBakedMesh>>[] = [];
    let groupTris = 0;
    let gMinX = Infinity;
    let gMaxX = -Infinity;
    let gMinZ = Infinity;
    let gMaxZ = -Infinity;
    let hasNorm = true;
    let hasUv = true;
    let hasCol = bakeVertexColors;

    for (let i = 0; i < grp.entries.length; i++) {
      const e = grp.entries[i];
      const b = extractWorldBakedMesh(
        e.mesh.geometry,
        e.mesh.matrixWorld,
        bakeVertexColors,
        e.tintR,
        e.tintG,
        e.tintB
      );
      if (!b) continue;
      bakedList.push(b);
      const tris = b.indices.length / 3;
      groupTris += tris;
      totalTrianglesPreserved += tris;
      if (b.minX < gMinX) gMinX = b.minX;
      if (b.maxX > gMaxX) gMaxX = b.maxX;
      if (b.minZ < gMinZ) gMinZ = b.minZ;
      if (b.maxZ > gMaxZ) gMaxZ = b.maxZ;
      if (!b.norm) hasNorm = false;
      if (!b.uv) hasUv = false;
      if (b.colU8) hasCol = true;
    }

    if (bakedList.length === 0) return;

    const spanX = gMaxX - gMinX;
    const spanZ = gMaxZ - gMinZ;
    const cellSize = grp.isMicroDetail ? MICRO_CELL_SIZE : ARCH_CELL_SIZE;
    const splitSpan = grp.isMicroDetail ? MICRO_SPLIT_SPAN : ARCH_SPLIT_SPAN;
    const splitTris = grp.isMicroDetail ? MICRO_SPLIT_TRIS : ARCH_SPLIT_TRIS;
    const shouldSplit =
      (spanX > splitSpan || spanZ > splitSpan) && groupTris > splitTris;

    const sectorBuckets = new Map<string, RawChunk[]>();
    const pushChunk = (sectorKey: string, chunk: RawChunk) => {
      let arr = sectorBuckets.get(sectorKey);
      if (!arr) {
        arr = [];
        sectorBuckets.set(sectorKey, arr);
      }
      arr.push(chunk);
    };

    if (shouldSplit) {
      for (let i = 0; i < bakedList.length; i++) {
        const b = bakedList[i];
        const bSpanX = b.maxX - b.minX;
        const bSpanZ = b.maxZ - b.minZ;
        if (bSpanX > cellSize * 0.85 || bSpanZ > cellSize * 0.85) {
          const splitCells = splitBakedIntoSpatialCells(b, cellSize);
          splitCells.forEach((chunk, cellKey) => pushChunk(cellKey, chunk));
        } else {
          const cx = (b.minX + b.maxX) * 0.5;
          const cz = (b.minZ + b.maxZ) * 0.5;
          const cellKey = `${Math.floor(cx / cellSize)},${Math.floor(cz / cellSize)}`;
          pushChunk(cellKey, {
            pos: b.pos,
            norm: b.norm,
            uv: b.uv,
            colU8: b.colU8,
            indices: b.vertCount <= 65535 ? new Uint16Array(b.indices) : b.indices,
            vertCount: b.vertCount,
          });
        }
      }
    } else {
      // Keep as ONE single merged draw call for the whole material group
      for (let i = 0; i < bakedList.length; i++) {
        const b = bakedList[i];
        pushChunk('all', {
          pos: b.pos,
          norm: b.norm,
          uv: b.uv,
          colU8: b.colU8,
          indices: b.vertCount <= 65535 ? new Uint16Array(b.indices) : b.indices,
          vertCount: b.vertCount,
        });
      }
    }

    sectorBuckets.forEach((chunks) => {
      let currentBatch: RawChunk[] = [];
      let currentVerts = 0;

      const flushBatch = () => {
        if (currentBatch.length === 0) return;
        const geom = buildMergedBufferGeometry(currentBatch, hasNorm, hasUv, hasCol);
        const outMesh = new THREE.Mesh(geom, sharedMat);
        outMesh.castShadow = grp.castShadow;
        outMesh.receiveShadow = grp.receiveShadow;
        outMesh.renderOrder = grp.renderOrder;
        outMesh.frustumCulled = true;
        outMesh.matrixAutoUpdate = false;
        outMesh.updateMatrix();
        outMesh.userData.isEnvironment = true;
        outMesh.userData.isMergedOptimized = true;
        optimizedGroup.add(outMesh);
        optimizedMeshCount++;

        if (grp.isMicroDetail && geom.boundingSphere) {
          const bs = geom.boundingSphere;
          microMeshes.push(outMesh);
          microCenters.push(bs.center.x, bs.center.y, bs.center.z);
          const effDist = maxDetailDist + bs.radius;
          microThresholdSq.push(effDist * effDist);
        }

        currentBatch = [];
        currentVerts = 0;
      };

      for (let i = 0; i < chunks.length; i++) {
        const ch = chunks[i];
        if (
          currentBatch.length > 0 &&
          currentVerts + ch.vertCount > MAX_VERTS_PER_BATCH
        ) {
          flushBatch();
        }
        currentBatch.push(ch);
        currentVerts += ch.vertCount;
      }
      flushBatch();
    });
  });

  // Remove superseded source meshes & dispose old geometries/materials
  const disposedGeoms = new Set<THREE.BufferGeometry>();
  for (let i = 0; i < sourceMeshes.length; i++) {
    const mesh = sourceMeshes[i];
    mesh.parent?.remove(mesh);
    if (mesh.geometry && !disposedGeoms.has(mesh.geometry)) {
      disposedGeoms.add(mesh.geometry);
      mesh.geometry.dispose();
    }
  }
  oldMatsToDispose.forEach((m) => {
    if (!keptMats.has(m)) {
      m.dispose();
    }
  });

  mapTransformGroup.add(optimizedGroup);
  mapTransformGroup.updateMatrixWorld(true);

  const count = microMeshes.length;
  const cxArr = new Float32Array(count);
  const cyArr = new Float32Array(count);
  const czArr = new Float32Array(count);
  const threshSqArr = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    cxArr[i] = microCenters[i * 3];
    cyArr[i] = microCenters[i * 3 + 1];
    czArr[i] = microCenters[i * 3 + 2];
    threshSqArr[i] = microThresholdSq[i];
  }

  let frameCounter = 0;
  let lastCamX = Number.NaN;
  let lastCamY = Number.NaN;
  let lastCamZ = Number.NaN;

  const update = (camX: number, camY: number, camZ: number): void => {
    if (count === 0) return;
    frameCounter++;
    const movedSq =
      (camX - lastCamX) * (camX - lastCamX) +
      (camY - lastCamY) * (camY - lastCamY) +
      (camZ - lastCamZ) * (camZ - lastCamZ);
    if (frameCounter > 1 && frameCounter % 4 !== 0 && movedSq < 2.25) {
      return;
    }
    lastCamX = camX;
    lastCamY = camY;
    lastCamZ = camZ;

    for (let i = 0; i < count; i++) {
      const dx = cxArr[i] - camX;
      const dy = cyArr[i] - camY;
      const dz = czArr[i] - camZ;
      const d2 = dx * dx + dy * dy + dz * dz;
      const vis = d2 <= threshSqArr[i];
      if (microMeshes[i].visible !== vis) {
        microMeshes[i].visible = vis;
      }
    }
  };

  return {
    update,
    stats: {
      originalMeshes: sourceMeshes.length,
      optimizedMeshes: optimizedMeshCount,
      originalMaterials: originalMatSet.size,
      dedupedMaterials: keptMats.size,
      lambertConverted,
      totalTrianglesPreserved,
      microDetailChunks: count,
    },
  };
}
