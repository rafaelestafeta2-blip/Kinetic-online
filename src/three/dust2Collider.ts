import * as THREE from 'three';

export interface Dust2TriEntry {
  a: THREE.Vector3;
  b: THREE.Vector3;
  c: THREE.Vector3;
  normal: THREE.Vector3;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  playerClipOnly?: boolean;
}

export interface LadderZone {
  id: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

const _tri = new THREE.Triangle();
const _pt = new THREE.Vector3();
const _closest = new THREE.Vector3();
const _ray = new THREE.Ray();
const _hitPt = new THREE.Vector3();
const _sampleHeights = new Float64Array(3);

/**
 * High-performance 2D Spatial Hash Triangle Collider for CS de_dust2 & cs_assault (.glb).
 * Zero per-frame GC allocations — designed for 60 FPS Android mobile WebGL.
 */
export class Dust2TriangleCollider {
  private readonly cellSize = 3.0;
  private floorGrid = new Map<number, Dust2TriEntry[]>();
  private wallGrid = new Map<number, Dust2TriEntry[]>();
  public boundingBoxes: THREE.Box3[] = [];
  public worldBounds = new THREE.Box3();
  public ladders: LadderZone[] = [];
  public triangleCount = 0;
  public ready = false;
  public radarDataUrl = '';

  private cellKey(cx: number, cz: number): number {
    return ((cx + 32768) << 16) | ((cz + 32768) & 0xffff);
  }

  public clear(): void {
    this.floorGrid.clear();
    this.wallGrid.clear();
    this.boundingBoxes.length = 0;
    this.ladders.length = 0;
    this.worldBounds.makeEmpty();
    this.triangleCount = 0;
    this.ready = false;
    this.radarDataUrl = '';
  }

  public buildFromGroup(
    rootGroup: THREE.Object3D,
    customLadders: LadderZone[] = [],
    xzBounds?: { minX: number; maxX: number; minZ: number; maxZ: number }
  ): void {
    this.clear();
    this.ladders = customLadders.map((l) => ({ ...l }));
    rootGroup.updateMatrixWorld(true);

    const allFloors: Dust2TriEntry[] = [];
    const allWalls: Dust2TriEntry[] = [];
    let totalTris = 0;

    rootGroup.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.geometry) return;
      if (child.userData.targetId || child.userData.ignoreCollider) return;
      const isPlayerClipOnly = Boolean(child.userData.playerClipOnly);

      const geom = child.geometry as THREE.BufferGeometry;
      if (!geom.boundingBox) geom.computeBoundingBox();
      if (geom.boundingBox && !isPlayerClipOnly) {
        const worldBox = geom.boundingBox.clone().applyMatrix4(child.matrixWorld);
        if (xzBounds) {
          if (
            worldBox.max.x < xzBounds.minX ||
            worldBox.min.x > xzBounds.maxX ||
            worldBox.max.z < xzBounds.minZ ||
            worldBox.min.z > xzBounds.maxZ
          ) {
            return;
          }
          worldBox.min.x = Math.max(worldBox.min.x, xzBounds.minX);
          worldBox.max.x = Math.min(worldBox.max.x, xzBounds.maxX);
          worldBox.min.z = Math.max(worldBox.min.z, xzBounds.minZ);
          worldBox.max.z = Math.min(worldBox.max.z, xzBounds.maxZ);
        }
        this.boundingBoxes.push(worldBox);
        this.worldBounds.union(worldBox);
      }

      const posAttr = geom.attributes.position;
      if (!posAttr) return;

      const indexAttr = geom.index;
      const matWorld = child.matrixWorld;
      const triCount = indexAttr
        ? Math.floor(indexAttr.count / 3)
        : Math.floor(posAttr.count / 3);
      totalTris += triCount;

      const _bA = new THREE.Vector3();
      const _bB = new THREE.Vector3();
      const _bC = new THREE.Vector3();
      const _bE1 = new THREE.Vector3();
      const _bE2 = new THREE.Vector3();
      const _bN = new THREE.Vector3();

      for (let i = 0; i < triCount; i++) {
        const i0 = indexAttr ? indexAttr.getX(i * 3) : i * 3;
        const i1 = indexAttr ? indexAttr.getX(i * 3 + 1) : i * 3 + 1;
        const i2 = indexAttr ? indexAttr.getX(i * 3 + 2) : i * 3 + 2;

        _bA.fromBufferAttribute(posAttr, i0).applyMatrix4(matWorld);
        _bB.fromBufferAttribute(posAttr, i1).applyMatrix4(matWorld);
        _bC.fromBufferAttribute(posAttr, i2).applyMatrix4(matWorld);

        const minX = Math.min(_bA.x, _bB.x, _bC.x);
        const maxX = Math.max(_bA.x, _bB.x, _bC.x);
        const minZ = Math.min(_bA.z, _bB.z, _bC.z);
        const maxZ = Math.max(_bA.z, _bB.z, _bC.z);
        if (
          xzBounds &&
          !isPlayerClipOnly &&
          (maxX < xzBounds.minX ||
            minX > xzBounds.maxX ||
            maxZ < xzBounds.minZ ||
            minZ > xzBounds.maxZ)
        ) {
          continue;
        }

        _bE1.subVectors(_bB, _bA);
        _bE2.subVectors(_bC, _bA);
        _bN.crossVectors(_bE1, _bE2);
        const areaSq = _bN.lengthSq();
        if (areaSq < 1e-4) continue;
        const area = Math.sqrt(areaSq) * 0.5;
        _bN.normalize();

        const a = _bA.clone();
        const b = _bB.clone();
        const c = _bC.clone();
        const normal = _bN.clone();

        const minY = Math.min(a.y, b.y, c.y);
        const maxY = Math.max(a.y, b.y, c.y);

        const spanX = maxX - minX;
        const spanZ = maxZ - minZ;
        if (
          area < 0.26 &&
          spanX < 1.05 &&
          spanZ < 1.05 &&
          this.isBoxInLadderZone(minX, maxX, minY, maxY, minZ, maxZ)
        ) {
          continue;
        }

        const entry: Dust2TriEntry = {
          a,
          b,
          c,
          normal,
          minX,
          maxX,
          minY,
          maxY,
          minZ,
          maxZ,
          playerClipOnly: isPlayerClipOnly || undefined,
        };

        const absNy = Math.abs(normal.y);
        const minCx = Math.floor(entry.minX / this.cellSize);
        const maxCx = Math.floor(entry.maxX / this.cellSize);
        const minCz = Math.floor(entry.minZ / this.cellSize);
        const maxCz = Math.floor(entry.maxZ / this.cellSize);

        if (absNy >= 0.45) {
          if (!isPlayerClipOnly) {
            allFloors.push(entry);
          }
          for (let cx = minCx; cx <= maxCx; cx++) {
            for (let cz = minCz; cz <= maxCz; cz++) {
              const key = this.cellKey(cx, cz);
              let bucket = this.floorGrid.get(key);
              if (!bucket) {
                bucket = [];
                this.floorGrid.set(key, bucket);
              }
              bucket.push(entry);
            }
          }
        }

        if (absNy < 0.55) {
          if (!isPlayerClipOnly) {
            allWalls.push(entry);
          }
          for (let cx = minCx; cx <= maxCx; cx++) {
            for (let cz = minCz; cz <= maxCz; cz++) {
              const key = this.cellKey(cx, cz);
              let bucket = this.wallGrid.get(key);
              if (!bucket) {
                bucket = [];
                this.wallGrid.set(key, bucket);
              }
              bucket.push(entry);
            }
          }
        }
      }
    });

    this.triangleCount = totalTris;
    // Mark ready BEFORE radar bake. Radar can take tens of seconds on Eastern
    // (~1.3M floors) and used to leave ready=false while Loading 2 timed out and
    // startGame disposed the in-flight GLB → empty arena / white void.
    this.ready = true;
    try {
      this.generateTopDownRadarDataUrl(allFloors, allWalls);
    } catch {
      this.radarDataUrl = '';
    }
  }

  private isBoxInLadderZone(
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
    minZ: number,
    maxZ: number
  ): boolean {
    for (let i = 0; i < this.ladders.length; i++) {
      const l = this.ladders[i];
      if (
        maxX >= l.minX &&
        minX <= l.maxX &&
        maxZ >= l.minZ &&
        minZ <= l.maxZ &&
        maxY >= l.minY &&
        minY <= l.maxY
      ) {
        return true;
      }
    }
    return false;
  }

  public getActiveLadder(x: number, yBottom: number, z: number): LadderZone | null {
    if (!this.ready || this.ladders.length === 0) return null;
    for (let i = 0; i < this.ladders.length; i++) {
      const l = this.ladders[i];
      if (
        x >= l.minX &&
        x <= l.maxX &&
        z >= l.minZ &&
        z <= l.maxZ &&
        yBottom >= l.minY - 0.5 &&
        yBottom <= l.maxY + 0.08
      ) {
        return l;
      }
    }
    return null;
  }

  /**
   * Max Y considered a walkable floor (not a skybox/prop spike).
   * Dust2 used a hard 10.5m cap — that dropped players UNDER Industria/Hangar/
   * Eastern/Mirage walkables (post-lift roofs/courts sit at 12–45m).
   */
  private walkableYCap(): number {
    if (!this.worldBounds.isEmpty()) {
      return this.worldBounds.max.y + 0.5;
    }
    return 80;
  }

  /**
   * Computes exact barycentric Y height on floor/ramp/stair triangles under (x, z).
   * Ignores downward-facing ceiling triangles (`normal.y < -0.45`) above feet so climbing
   * near a ceiling never snaps the player onto the roof of the map, and rescues the player
   * onto the nearest walkable floor above if `yBottom` ever drops below the terrain.
   */
  /**
   * Samples upward floor support directly near feet (`yBottom - 0.85 .. yBottom + 0.65`)
   * at a single `(x, z)` column. Zero-GC helper used for foot-capsule crack bridging.
   */
  private sampleNearFeetFloor(
    x: number,
    yBottom: number,
    z: number,
    skyCut: number
  ): number {
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    let bestY = -999;

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const bucket = this.floorGrid.get(this.cellKey(cx + dx, cz + dz));
        if (!bucket || bucket.length === 0) continue;

        for (let i = 0; i < bucket.length; i++) {
          const t = bucket[i];
          if (t.playerClipOnly && (t.normal.y < 0.55 || t.normal.y > 0.94)) continue;
          if (
            x < t.minX - 0.05 ||
            x > t.maxX + 0.05 ||
            z < t.minZ - 0.05 ||
            z > t.maxZ + 0.05
          ) {
            continue;
          }
          if (t.normal.y < 0.45) continue;
          const yOnTri = this.sampleTriangleY(t, x, z);
          if (yOnTri === null || yOnTri > skyCut) continue;
          if (
            yOnTri <= yBottom + 0.65 &&
            yOnTri >= yBottom - 0.85 &&
            yOnTri > bestY
          ) {
            bestY = yOnTri;
          }
        }
      }
    }
    return bestY;
  }

  public getGroundHeight(x: number, yBottom: number, z: number): number {
    if (!this.ready) return yBottom;

    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    // Drop sky-lid / roof-cap band (Mirage lid ≈ max.y) — same cut as snapToWalkableFloor.
    const skyCut = !this.worldBounds.isEmpty()
      ? this.worldBounds.max.y - 1.5
      : this.walkableYCap();
    let bestY = -999;
    let bestBelowY = -999;
    let bestFlippedY = -999;
    let bestFlippedBelowY = -999;
    let closestWalkableAboveY = 999;
    let closestFlippedAboveY = 999;

    // Search home cell + 8-neighborhood (spawns near cell borders / thin floors).
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const bucket = this.floorGrid.get(this.cellKey(cx + dx, cz + dz));
        if (!bucket || bucket.length === 0) continue;

        for (let i = 0; i < bucket.length; i++) {
          const t = bucket[i];
          if (t.playerClipOnly && (t.normal.y < 0.55 || t.normal.y > 0.94)) continue;
          if (
            x < t.minX - 0.05 ||
            x > t.maxX + 0.05 ||
            z < t.minZ - 0.05 ||
            z > t.maxZ + 0.05
          ) {
            continue;
          }

          const yOnTri = this.sampleTriangleY(t, x, z);
          if (yOnTri === null) continue;
          if (yOnTri > skyCut) continue;
          const upward = t.normal.y >= 0.45;
          // Unity floors often wind downward. Use them only when this column
          // has no real upward street — a ceiling stays a ceiling if a floor exists.
          const flippedFloor = t.normal.y <= -0.45;
          if (!upward && !flippedFloor) continue;

          if (flippedFloor) {
            if (yOnTri > yBottom + 0.05 && yOnTri < closestFlippedAboveY) {
              closestFlippedAboveY = yOnTri;
            }
            if (yOnTri <= yBottom + 0.65 && yOnTri > bestFlippedBelowY) {
              bestFlippedBelowY = yOnTri;
            }
            if (
              yOnTri <= yBottom + 0.65 &&
              yOnTri >= yBottom - 0.85 &&
              yOnTri > bestFlippedY
            ) {
              bestFlippedY = yOnTri;
            }
            continue;
          }

          if (yOnTri > yBottom + 0.05 && yOnTri < closestWalkableAboveY) {
            closestWalkableAboveY = yOnTri;
          }

          if (yOnTri <= yBottom + 0.65 && yOnTri > bestBelowY) {
            bestBelowY = yOnTri;
          }

          // Support surface near feet (step-up ≤0.65, step-down ≤0.85).
          if (
            yOnTri <= yBottom + 0.65 &&
            yOnTri >= yBottom - 0.85 &&
            yOnTri > bestY
          ) {
            bestY = yOnTri;
          }
        }
      }
    }

    // 1. Direct near-feet support surface always wins.
    if (bestY > -900) return bestY;

    // 1b. Foot-capsule crack bridge (±0.28m): walking across broken tiles, potholes, or narrow
    // floor seams never drops the player into an underground foundation or void below the map.
    const r = 0.28;
    const f1 = this.sampleNearFeetFloor(x + r, yBottom, z, skyCut);
    const f2 = this.sampleNearFeetFloor(x - r, yBottom, z, skyCut);
    const f3 = this.sampleNearFeetFloor(x, yBottom, z + r, skyCut);
    const f4 = this.sampleNearFeetFloor(x, yBottom, z - r, skyCut);
    const footSupportY = Math.max(f1, f2, f3, f4);
    if (footSupportY > -900) return footSupportY;

    // 2. Airborne above a valid floor (jumping or dropping from a ledge):
    // return the highest floor below feet so gravity brings the player back down
    // instead of rescuing UP onto an overhead roof, awning, or 2nd floor!
    if (bestBelowY > -900) return bestBelowY;

    // 3. Only if there is NO upward floor anywhere below the player (fell below map slab),
    // rescue upward if a walkable floor is within 2.4m above feet.
    if (closestWalkableAboveY < 900 && closestWalkableAboveY - yBottom < 2.4) {
      return closestWalkableAboveY;
    }

    // 4. Fallback for Unity maps with downward-flipped street normals when no upward floor exists.
    if (bestFlippedY > -900) return bestFlippedY;
    if (bestFlippedBelowY > -900) return bestFlippedBelowY;
    if (
      closestFlippedAboveY < 900 &&
      closestFlippedAboveY - yBottom < 2.4
    ) {
      return closestFlippedAboveY;
    }

    if (!this.worldBounds.isEmpty() && yBottom < this.worldBounds.min.y - 1) {
      return Math.max(yBottom, this.worldBounds.min.y);
    }
    return yBottom;
  }

  /**
   * Resolve a playable spawn inside the collider footprint (XZ + Y).
   * Prefer hint; if that column has no street-band floor, search nearby then AABB.
   */
  public findPlayableSpawn(
    hintX: number,
    hintZ: number,
    hintY = 0.35
  ): { x: number; y: number; z: number } {
    if (!this.ready || this.worldBounds.isEmpty()) {
      return { x: hintX, y: hintY, z: hintZ };
    }

    const skyCut = this.worldBounds.max.y - 1.5;
    const streetMax = Math.min(
      skyCut,
      Math.max(hintY + 6, this.worldBounds.min.y + 10)
    );

    const tryPoint = (x: number, z: number): number | null => {
      const y = this.snapToWalkableFloor(x, z, hintY);
      if (!Number.isFinite(y)) return null;
      if (y < this.worldBounds.min.y - 0.1 || y > streetMax) return null;
      // Must actually have upward floor support at result.
      const gh = this.getGroundHeight(x, y + 0.1, z);
      if (Math.abs(gh - y) > 0.75) return null;
      return y;
    };

    const atHint = tryPoint(hintX, hintZ);
    if (atHint !== null) return { x: hintX, y: atHint, z: hintZ };

    const radii = [4, 8, 12, 20, 32, 48];
    let best: { x: number; y: number; z: number; dist: number } | null = null;
    for (const r of radii) {
      for (let ang = 0; ang < Math.PI * 2; ang += Math.PI / 6) {
        const x = hintX + Math.cos(ang) * r;
        const z = hintZ + Math.sin(ang) * r;
        if (
          x < this.worldBounds.min.x + 1 ||
          x > this.worldBounds.max.x - 1 ||
          z < this.worldBounds.min.z + 1 ||
          z > this.worldBounds.max.z - 1
        ) {
          continue;
        }
        const y = tryPoint(x, z);
        if (y === null) continue;
        const dist = Math.hypot(x - hintX, z - hintZ);
        if (!best || dist < best.dist) best = { x, y, z, dist };
      }
      if (best && best.dist <= r + 0.1) break;
    }
    if (best) return { x: best.x, y: best.y, z: best.z };

    // Last resort: AABB center column.
    const cx = (this.worldBounds.min.x + this.worldBounds.max.x) * 0.5;
    const cz = (this.worldBounds.min.z + this.worldBounds.max.z) * 0.5;
    const cy = tryPoint(cx, cz);
    if (cy !== null) return { x: cx, y: cy, z: cz };

    const snapped = this.snapToWalkableFloor(hintX, hintZ, hintY);
    // Roof-only columns used to glue bots ~14m up, so they read as floating in the sky.
    const y = snapped <= hintY + 6 ? snapped : hintY;
    return { x: hintX, y, z: hintZ };
  }

  /**
   * Snap spawn/bot onto the correct walkable floor at (x,z).
   *
   * IMPORTANT: probing via getGroundHeight(from AABB max) picks the *highest*
   * triangle (roofs / Mirage sky-lid ≈ max.y) — that left players on lids or,
   * when collider wasn't ready yet, at authored Y under FrontSide floors
   * (white void). Collect upward floors, drop sky-lid band, pick closest to hint.
   */
  public snapToWalkableFloor(
    x: number,
    z: number,
    hintY = 0.2
  ): number {
    if (!this.ready) return hintY;

    const skyCut = !this.worldBounds.isEmpty()
      ? this.worldBounds.max.y - 1.5
      : 1e9;
    const minY = !this.worldBounds.isEmpty()
      ? this.worldBounds.min.y - 0.25
      : -5;

    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    const candidates: number[] = [];
    const flipped: number[] = [];

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const bucket = this.floorGrid.get(this.cellKey(cx + dx, cz + dz));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const t = bucket[i];
          if (t.playerClipOnly) continue;
          const upward = t.normal.y >= 0.45;
          const flippedFloor = t.normal.y <= -0.45;
          if (!upward && !flippedFloor) continue;
          if (
            x < t.minX - 0.08 ||
            x > t.maxX + 0.08 ||
            z < t.minZ - 0.08 ||
            z > t.maxZ + 0.08
          ) {
            continue;
          }
          const yOnTri = this.sampleTriangleY(t, x, z);
          if (yOnTri === null) continue;
          if (yOnTri < minY || yOnTri > skyCut) continue;
          if (flippedFloor) flipped.push(yOnTri);
          else candidates.push(yOnTri);
        }
      }
    }

    const pick = (list: number[]): number | null => {
      if (list.length === 0) return null;
      list.sort((a, b) => a - b);
      let best = list[0];
      let bestDist = Math.abs(best - hintY);
      for (let i = 1; i < list.length; i++) {
        const d = Math.abs(list[i] - hintY);
        if (d < bestDist) {
          best = list[i];
          bestDist = d;
        }
      }
      // Hint below every surface: take the lowest, but not a roof far above the feet.
      if (hintY < list[0] - 0.75) {
        return list[0] - hintY <= 12 ? list[0] : null;
      }
      return bestDist <= 12 ? best : null;
    };

    const upwardPick = pick(candidates);
    if (upwardPick !== null) return upwardPick;
    const flippedPick = pick(flipped);
    if (flippedPick !== null) return flippedPick;
    return hintY;
  }


  /**
   * Clamps upward vertical motion (`nextY > prevY`) so the player's head (`nextY + playerHeight`)
   * never clips upward through a ceiling or the skybox roof.
   */
  public clampCeilingHeight(
    x: number,
    prevY: number,
    nextY: number,
    z: number,
    playerHeight: number
  ): number {
    if (!this.ready || nextY <= prevY) return nextY;
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    const bucket = this.floorGrid.get(this.cellKey(cx, cz));
    if (!bucket) return nextY;

    let clampedY = nextY;
    for (let i = 0; i < bucket.length; i++) {
      const t = bucket[i];
      if (t.normal.y > -0.45) continue;
      if (t.playerClipOnly && t.normal.y > -0.92) continue;
      if (x < t.minX || x > t.maxX || z < t.minZ || z > t.maxZ) continue;
      const yOnTri = this.sampleTriangleY(t, x, z);
      if (yOnTri === null) continue;

      if (yOnTri >= prevY + 0.85 && clampedY + playerHeight > yOnTri - 0.04) {
        clampedY = Math.min(clampedY, Math.max(prevY, yOnTri - playerHeight - 0.04));
      }
    }
    return clampedY;
  }

  public hasLowCeiling(x: number, yBottom: number, z: number): boolean {
    if (!this.ready) return false;
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    const bucket = this.floorGrid.get(this.cellKey(cx, cz));
    if (!bucket) return false;

    for (let i = 0; i < bucket.length; i++) {
      const t = bucket[i];
      if (t.playerClipOnly || t.normal.y > -0.45) continue;
      if (t.maxY < yBottom + 0.82 || t.minY > yBottom + 1.58) continue;
      if (x < t.minX || x > t.maxX || z < t.minZ || z > t.maxZ) continue;
      const yOnTri = this.sampleTriangleY(t, x, z);
      if (yOnTri !== null && yOnTri >= yBottom + 0.82 && yOnTri < yBottom + 1.58) {
        return true;
      }
    }
    return false;
  }

  public resolveHorizontal(
    nextX: number,
    nextZ: number,
    yBottom: number,
    playerHeight: number,
    radius: number,
    outPos: { x: number; z: number }
  ): boolean {
    const minWorldX = !this.worldBounds.isEmpty() ? this.worldBounds.min.x + 0.45 : -66.0;
    const maxWorldX = !this.worldBounds.isEmpty() ? this.worldBounds.max.x - 0.45 : 46.0;
    const minWorldZ = !this.worldBounds.isEmpty() ? this.worldBounds.min.z + 0.45 : -79.0;
    const maxWorldZ = !this.worldBounds.isEmpty() ? this.worldBounds.max.z - 0.45 : 84.0;

    let rx = THREE.MathUtils.clamp(nextX, minWorldX, maxWorldX);
    let rz = THREE.MathUtils.clamp(nextZ, minWorldZ, maxWorldZ);
    let collided = rx !== nextX || rz !== nextZ;

    if (!this.ready) {
      outPos.x = rx;
      outPos.z = rz;
      return collided;
    }

    const waistMinY = yBottom + 0.58;
    const headMaxY = yBottom + Math.min(playerHeight - 0.2, 1.5);
    let sampleCount = 1;
    _sampleHeights[0] = waistMinY + 0.04;
    if (headMaxY > waistMinY + 0.15) {
      _sampleHeights[1] = (waistMinY + headMaxY) * 0.5;
      _sampleHeights[2] = headMaxY - 0.04;
      sampleCount = 3;
    }

    const minCx = Math.floor((rx - radius - 0.2) / this.cellSize);
    const maxCx = Math.floor((rx + radius + 0.2) / this.cellSize);
    const minCz = Math.floor((rz - radius - 0.2) / this.cellSize);
    const maxCz = Math.floor((rz + radius + 0.2) / this.cellSize);
    const radiusSq = radius * radius;

    for (let iter = 0; iter < 2; iter++) {
      let hitThisIter = false;
      for (let cx = minCx; cx <= maxCx; cx++) {
        for (let cz = minCz; cz <= maxCz; cz++) {
          const bucket = this.wallGrid.get(this.cellKey(cx, cz));
          if (!bucket) continue;

          for (let i = 0; i < bucket.length; i++) {
            const w = bucket[i];
            if (w.maxY <= waistMinY || w.minY >= headMaxY) continue;
            if (
              rx + radius < w.minX ||
              rx - radius > w.maxX ||
              rz + radius < w.minZ ||
              rz - radius > w.maxZ
            ) {
              continue;
            }

            _tri.set(w.a, w.b, w.c);

            for (let s = 0; s < sampleCount; s++) {
              const sy = _sampleHeights[s];
              if (sy < w.minY - 0.05 || sy > w.maxY + 0.05) continue;

              _pt.set(rx, sy, rz);
              _tri.closestPointToPoint(_pt, _closest);

              if (Math.abs(_closest.y - sy) > 0.28) continue;

              const dx = rx - _closest.x;
              const dz = rz - _closest.z;
              const distSq = dx * dx + dz * dz;
              if (distSq < radiusSq && distSq > 1e-8) {
                const dist = Math.sqrt(distSq);
                const push = radius - dist + 0.002;
                rx += (dx / dist) * push;
                rz += (dz / dist) * push;
                collided = true;
                hitThisIter = true;
              }
            }
          }
        }
      }
      if (!hitThisIter) break;
    }

    outPos.x = rx;
    outPos.z = rz;
    return collided;
  }

  /** Fast inline 3D ray-vs-AABB slab test against a triangle entry (rejects ~96% of non-hitting tris). */
  private rayHitsTriAabb(
    ox: number,
    oy: number,
    oz: number,
    invDx: number,
    invDy: number,
    invDz: number,
    tMaxLimit: number,
    tri: Dust2TriEntry
  ): boolean {
    let t1 = (tri.minX - ox) * invDx;
    let t2 = (tri.maxX - ox) * invDx;
    let tmin = t1 < t2 ? t1 : t2;
    let tmax = t1 > t2 ? t1 : t2;

    t1 = (tri.minY - oy) * invDy;
    t2 = (tri.maxY - oy) * invDy;
    const tymin = t1 < t2 ? t1 : t2;
    const tymax = t1 > t2 ? t1 : t2;
    if (tmin > tymax || tymin > tmax) return false;
    if (tymin > tmin) tmin = tymin;
    if (tymax < tmax) tmax = tymax;

    t1 = (tri.minZ - oz) * invDz;
    t2 = (tri.maxZ - oz) * invDz;
    const tzmin = t1 < t2 ? t1 : t2;
    const tzmax = t1 > t2 ? t1 : t2;
    if (tmin > tzmax || tzmin > tmax) return false;
    if (tzmin > tmin) tmin = tzmin;
    if (tzmax < tmax) tmax = tzmax;

    return tmax >= 0 && tmin <= tMaxLimit;
  }

  /**
   * Ultra-fast early-exit Line-of-Sight occlusion check using 2D Grid DDA + 3D AABB slab reject.
   * Returns `true` immediately on the first solid triangle hit within [0, maxDist].
   */
  public raycastBlocked(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    maxDist: number
  ): boolean {
    if (!this.ready || maxDist <= 0) return false;
    const ox = origin.x;
    const oy = origin.y;
    const oz = origin.z;
    const dx = dir.x;
    const dy = dir.y;
    const dz = dir.z;
    const invDx = Math.abs(dx) > 1e-8 ? 1 / dx : 1e12;
    const invDy = Math.abs(dy) > 1e-8 ? 1 / dy : 1e12;
    const invDz = Math.abs(dz) > 1e-8 ? 1 / dz : 1e12;

    _ray.set(origin, dir);
    const cs = this.cellSize;
    let cx = Math.floor(ox / cs);
    let cz = Math.floor(oz / cs);

    const stepX = dx > 1e-8 ? 1 : dx < -1e-8 ? -1 : 0;
    const stepZ = dz > 1e-8 ? 1 : dz < -1e-8 ? -1 : 0;
    const tDeltaX = stepX !== 0 ? Math.abs(cs * invDx) : 1e12;
    const tDeltaZ = stepZ !== 0 ? Math.abs(cs * invDz) : 1e12;

    let tMaxX =
      stepX > 0
        ? ((cx + 1) * cs - ox) * invDx
        : stepX < 0
          ? (cx * cs - ox) * invDx
          : 1e12;
    let tMaxZ =
      stepZ > 0
        ? ((cz + 1) * cs - oz) * invDz
        : stepZ < 0
          ? (cz * cs - oz) * invDz
          : 1e12;

    const maxCells = Math.ceil((maxDist / cs) * 2.2) + 4;
    let tCurrent = 0;

    for (let iter = 0; iter < maxCells && tCurrent <= maxDist; iter++) {
      const key = this.cellKey(cx, cz);
      const tNext = tMaxX < tMaxZ ? tMaxX : tMaxZ;
      const tExit = tNext < maxDist ? tNext : maxDist;
      const yA = oy + dy * tCurrent;
      const yB = oy + dy * tExit;
      const segMinY = (yA < yB ? yA : yB) - 0.15;
      const segMaxY = (yA > yB ? yA : yB) + 0.15;

      const walls = this.wallGrid.get(key);
      if (walls) {
        for (let i = 0; i < walls.length; i++) {
          const w = walls[i];
          if (w.playerClipOnly) continue;
          if (w.maxY < segMinY || w.minY > segMaxY) continue;
          if (!this.rayHitsTriAabb(ox, oy, oz, invDx, invDy, invDz, maxDist, w)) continue;
          if (_ray.intersectTriangle(w.a, w.b, w.c, false, _hitPt)) {
            const hx = _hitPt.x - ox;
            const hy = _hitPt.y - oy;
            const hz = _hitPt.z - oz;
            if (hx * hx + hy * hy + hz * hz <= maxDist * maxDist) {
              return true;
            }
          }
        }
      }

      const floors = this.floorGrid.get(key);
      if (floors) {
        for (let i = 0; i < floors.length; i++) {
          const f = floors[i];
          if (f.playerClipOnly) continue;
          if (f.maxY < segMinY || f.minY > segMaxY) continue;
          if (!this.rayHitsTriAabb(ox, oy, oz, invDx, invDy, invDz, maxDist, f)) continue;
          if (_ray.intersectTriangle(f.a, f.b, f.c, false, _hitPt)) {
            const hx = _hitPt.x - ox;
            const hy = _hitPt.y - oy;
            const hz = _hitPt.z - oz;
            if (hx * hx + hy * hy + hz * hz <= maxDist * maxDist) {
              return true;
            }
          }
        }
      }

      if (tMaxX < tMaxZ) {
        tCurrent = tMaxX;
        tMaxX += tDeltaX;
        cx += stepX;
      } else {
        tCurrent = tMaxZ;
        tMaxZ += tDeltaZ;
        cz += stepZ;
      }
    }

    return false;
  }

  public raycastDistance(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    maxDist: number
  ): number | null {
    const hit = this.raycastDetailed(origin, dir, maxDist);
    return hit ? hit.distance : null;
  }

  /**
   * Spatial-hash triangle raycast with hit point + face normal using 2D Grid DDA + 3D AABB slab reject.
   * Used for bullet world impacts without Three.js mesh traversal of the whole GLB.
   */
  public raycastDetailed(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    maxDist: number,
    outPoint?: THREE.Vector3,
    outNormal?: THREE.Vector3
  ): { distance: number } | null {
    if (!this.ready || maxDist <= 0) return null;
    const ox = origin.x;
    const oy = origin.y;
    const oz = origin.z;
    const dx = dir.x;
    const dy = dir.y;
    const dz = dir.z;
    const invDx = Math.abs(dx) > 1e-8 ? 1 / dx : 1e12;
    const invDy = Math.abs(dy) > 1e-8 ? 1 / dy : 1e12;
    const invDz = Math.abs(dz) > 1e-8 ? 1 / dz : 1e12;

    _ray.set(origin, dir);
    let closestDist = maxDist + 1;
    let hitTri: Dust2TriEntry | null = null;

    const cs = this.cellSize;
    let cx = Math.floor(ox / cs);
    let cz = Math.floor(oz / cs);

    const stepX = dx > 1e-8 ? 1 : dx < -1e-8 ? -1 : 0;
    const stepZ = dz > 1e-8 ? 1 : dz < -1e-8 ? -1 : 0;
    const tDeltaX = stepX !== 0 ? Math.abs(cs * invDx) : 1e12;
    const tDeltaZ = stepZ !== 0 ? Math.abs(cs * invDz) : 1e12;

    let tMaxX =
      stepX > 0
        ? ((cx + 1) * cs - ox) * invDx
        : stepX < 0
          ? (cx * cs - ox) * invDx
          : 1e12;
    let tMaxZ =
      stepZ > 0
        ? ((cz + 1) * cs - oz) * invDz
        : stepZ < 0
          ? (cz * cs - oz) * invDz
          : 1e12;

    const maxCells = Math.ceil((maxDist / cs) * 2.2) + 4;
    let tCurrent = 0;

    for (let iter = 0; iter < maxCells && tCurrent <= maxDist; iter++) {
      if (tCurrent > closestDist) break;
      const key = this.cellKey(cx, cz);
      const tNext = tMaxX < tMaxZ ? tMaxX : tMaxZ;
      const tLimit = closestDist < maxDist ? closestDist : maxDist;
      const tExit = tNext < tLimit ? tNext : tLimit;
      const yA = oy + dy * tCurrent;
      const yB = oy + dy * tExit;
      const segMinY = (yA < yB ? yA : yB) - 0.15;
      const segMaxY = (yA > yB ? yA : yB) + 0.15;

      const walls = this.wallGrid.get(key);
      if (walls) {
        for (let i = 0; i < walls.length; i++) {
          const w = walls[i];
          if (w.playerClipOnly) continue;
          if (w.maxY < segMinY || w.minY > segMaxY) continue;
          const curLim = closestDist < maxDist ? closestDist : maxDist;
          if (!this.rayHitsTriAabb(ox, oy, oz, invDx, invDy, invDz, curLim, w)) continue;
          if (_ray.intersectTriangle(w.a, w.b, w.c, false, _hitPt)) {
            const hx = _hitPt.x - ox;
            const hy = _hitPt.y - oy;
            const hz = _hitPt.z - oz;
            const dist = Math.sqrt(hx * hx + hy * hy + hz * hz);
            if (dist <= maxDist && dist < closestDist) {
              closestDist = dist;
              hitTri = w;
            }
          }
        }
      }

      const floors = this.floorGrid.get(key);
      if (floors) {
        for (let i = 0; i < floors.length; i++) {
          const f = floors[i];
          if (f.playerClipOnly) continue;
          if (f.maxY < segMinY || f.minY > segMaxY) continue;
          const curLim = closestDist < maxDist ? closestDist : maxDist;
          if (!this.rayHitsTriAabb(ox, oy, oz, invDx, invDy, invDz, curLim, f)) continue;
          if (_ray.intersectTriangle(f.a, f.b, f.c, false, _hitPt)) {
            const hx = _hitPt.x - ox;
            const hy = _hitPt.y - oy;
            const hz = _hitPt.z - oz;
            const dist = Math.sqrt(hx * hx + hy * hy + hz * hz);
            if (dist <= maxDist && dist < closestDist) {
              closestDist = dist;
              hitTri = f;
            }
          }
        }
      }

      if (tMaxX < tMaxZ) {
        tCurrent = tMaxX;
        tMaxX += tDeltaX;
        cx += stepX;
      } else {
        tCurrent = tMaxZ;
        tMaxZ += tDeltaZ;
        cz += stepZ;
      }
    }

    if (closestDist > maxDist || !hitTri) return null;

    if (outPoint) {
      outPoint.copy(origin).addScaledVector(dir, closestDist);
    }
    if (outNormal) {
      outNormal.copy(hitTri.normal);
      // Ensure normal faces the shooter
      if (outNormal.dot(dir) > 0) outNormal.negate();
    }
    return { distance: closestDist };
  }

  private sampleTriangleY(t: Dust2TriEntry, x: number, z: number): number | null {
    const denom = (t.b.z - t.c.z) * (t.a.x - t.c.x) + (t.c.x - t.b.x) * (t.a.z - t.c.z);
    if (Math.abs(denom) < 1e-6) return null;

    const u = ((t.b.z - t.c.z) * (x - t.c.x) + (t.c.x - t.b.x) * (z - t.c.z)) / denom;
    const v = ((t.c.z - t.a.z) * (x - t.c.x) + (t.a.x - t.c.x) * (z - t.c.z)) / denom;
    const w = 1 - u - v;

    if (u >= -0.025 && v >= -0.025 && w >= -0.025) {
      return u * t.a.y + v * t.b.y + w * t.c.y;
    }
    return null;
  }

  private generateTopDownRadarDataUrl(floors: Dust2TriEntry[], walls: Dust2TriEntry[]): void {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#0b1017';
    ctx.fillRect(0, 0, 256, 256);

    const minX = !this.worldBounds.isEmpty() ? this.worldBounds.min.x : -60;
    const maxX = !this.worldBounds.isEmpty() ? this.worldBounds.max.x : 48;
    const minZ = !this.worldBounds.isEmpty() ? this.worldBounds.min.z : -80;
    const maxZ = !this.worldBounds.isEmpty() ? this.worldBounds.max.z : 30;
    const spanX = Math.max(10, maxX - minX);
    const spanZ = Math.max(10, maxZ - minZ);

    const toPx = (wx: number) => ((wx - minX) / spanX) * 256;
    const toPz = (wz: number) => ((wz - minZ) / spanZ) * 256;

    // Subsample huge maps (Eastern) — full 1M+ fills freeze Android WebView.
    const floorStep = floors.length > 80000 ? Math.ceil(floors.length / 40000) : 1;
    for (let i = 0; i < floors.length; i += floorStep) {
      const f = floors[i];
      if (f.maxY > 9.6) continue;
      ctx.beginPath();
      ctx.moveTo(toPx(f.a.x), toPz(f.a.z));
      ctx.lineTo(toPx(f.b.x), toPz(f.b.z));
      ctx.lineTo(toPx(f.c.x), toPz(f.c.z));
      ctx.closePath();
      ctx.fillStyle = f.minY > 5.8 ? '#2b3948' : f.minY < 3.2 ? '#16202a' : '#212d3a';
      ctx.fill();
    }

    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.1;
    const wallStep = walls.length > 40000 ? Math.ceil(walls.length / 20000) : 1;
    for (let i = 0; i < walls.length; i += wallStep) {
      const w = walls[i];
      if (w.minY > 8.5 || w.maxY < 1.0) continue;
      ctx.beginPath();
      ctx.moveTo(toPx(w.a.x), toPz(w.a.z));
      ctx.lineTo(toPx(w.b.x), toPz(w.b.z));
      ctx.stroke();
    }

    this.radarDataUrl = canvas.toDataURL('image/png');
  }
}
