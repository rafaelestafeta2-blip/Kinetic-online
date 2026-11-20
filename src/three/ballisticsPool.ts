import * as THREE from 'three';
import { soundEngine } from '../audio/soundEngine';

interface BrassShellInstance {
  mesh: THREE.Mesh;
  active: boolean;
  age: number;
  bounced: boolean;
  vel: THREE.Vector3;
  angVel: THREE.Vector3;
}

interface DroppedMagInstance {
  mesh: THREE.Mesh;
  active: boolean;
  age: number;
  bounced: boolean;
  vel: THREE.Vector3;
  angVel: THREE.Vector3;
}

interface SparkParticle {
  active: boolean;
  age: number;
  maxAge: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
}

interface TracerBeamInstance {
  line: THREE.Line;
  mat: THREE.LineBasicMaterial;
  active: boolean;
  age: number;
  maxAge: number;
  start: THREE.Vector3;
  end: THREE.Vector3;
  dir: THREE.Vector3;
  totalDist: number;
  travelDist: number;
}

const SPARK_COUNT = 64;
const DECAL_COUNT = 45;

// Module-scope reusable math temporaries (Zero GC in hot combat loops)
const _upVec = new THREE.Vector3(0, 0, 1);
const _quat = new THREE.Quaternion();
const _jitterVec = new THREE.Vector3();
const _sparkTarget = new THREE.Vector3();
const _sparkColor = new THREE.Color();
const _dummy = new THREE.Object3D();
const _zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

export class BallisticsFXPool {
  private scene: THREE.Scene;
  private group = new THREE.Group();

  private shells: BrassShellInstance[] = [];
  private shellCursor = 0;
  private shellGeo: THREE.BufferGeometry;
  private shellMat: THREE.MeshStandardMaterial;

  private droppedMags: DroppedMagInstance[] = [];
  private magCursor = 0;
  private magGeo: THREE.BufferGeometry;
  private magMat: THREE.MeshStandardMaterial;

  private sparks: SparkParticle[] = [];
  private sparkCursor = 0;
  private sparkMesh: THREE.InstancedMesh;
  private sparkGeo: THREE.BufferGeometry;
  private sparkMat: THREE.MeshBasicMaterial;
  private sparksDirty = false;

  private decalMesh: THREE.InstancedMesh;
  private decalGeo: THREE.BufferGeometry;
  private decalMat: THREE.MeshBasicMaterial;
  private decalCursor = 0;

  private tracers: TracerBeamInstance[] = [];
  private tracerCursor = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    scene.add(this.group);

    // 1. Pool of 32 Brass 5.56mm Casings
    this.shellGeo = new THREE.CylinderGeometry(0.0048, 0.005, 0.044, 8);
    this.shellMat = new THREE.MeshStandardMaterial({
      color: 0xeab308,
      metalness: 0.94,
      roughness: 0.2,
    });
    for (let i = 0; i < 32; i++) {
      const mesh = new THREE.Mesh(this.shellGeo, this.shellMat);
      mesh.visible = false;
      this.group.add(mesh);
      this.shells.push({
        mesh,
        active: false,
        age: 0,
        bounced: false,
        vel: new THREE.Vector3(),
        angVel: new THREE.Vector3(),
      });
    }

    // 2. Pool of 8 Dropped Polymer Magazines (for Emergency Speed Reloads)
    this.magGeo = new THREE.BoxGeometry(0.028, 0.165, 0.068);
    this.magMat = new THREE.MeshStandardMaterial({
      color: 0x8c7355,
      roughness: 0.78,
      metalness: 0.1,
    });
    for (let i = 0; i < 8; i++) {
      const mesh = new THREE.Mesh(this.magGeo, this.magMat);
      mesh.visible = false;
      this.group.add(mesh);
      this.droppedMags.push({
        mesh,
        active: false,
        age: 0,
        bounced: false,
        vel: new THREE.Vector3(),
        angVel: new THREE.Vector3(),
      });
    }

    // 3. Instanced Pool of 64 Impact Spark Particles (1 draw call total)
    this.sparkGeo = new THREE.BoxGeometry(0.018, 0.018, 0.065);
    this.sparkMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.sparkMesh = new THREE.InstancedMesh(
      this.sparkGeo,
      this.sparkMat,
      SPARK_COUNT
    );
    this.sparkMesh.frustumCulled = false;
    this.sparkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    _sparkColor.setHex(0xfbbf24);
    for (let i = 0; i < SPARK_COUNT; i++) {
      this.sparkMesh.setMatrixAt(i, _zeroMatrix);
      this.sparkMesh.setColorAt(i, _sparkColor);
      this.sparks.push({
        active: false,
        age: 0,
        maxAge: 0.28,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
      });
    }
    this.sparkMesh.instanceMatrix.needsUpdate = true;
    if (this.sparkMesh.instanceColor) {
      this.sparkMesh.instanceColor.needsUpdate = true;
    }
    this.group.add(this.sparkMesh);

    // 4. Instanced Pool of 45 Bullet Hole Decals (1 draw call total)
    this.decalGeo = new THREE.CircleGeometry(0.026, 10);
    this.decalMat = new THREE.MeshBasicMaterial({
      color: 0x090b0f,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      depthWrite: false,
    });
    this.decalMesh = new THREE.InstancedMesh(
      this.decalGeo,
      this.decalMat,
      DECAL_COUNT
    );
    this.decalMesh.frustumCulled = false;
    for (let i = 0; i < DECAL_COUNT; i++) {
      this.decalMesh.setMatrixAt(i, _zeroMatrix);
    }
    this.decalMesh.instanceMatrix.needsUpdate = true;
    this.group.add(this.decalMesh);

    // 5. Pool of 16 Supersonic Flying Ballistic Tracer Streaks (Zero-GC)
    for (let i = 0; i < 16; i++) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3(0, 0, -1),
      ]);
      const mat = new THREE.LineBasicMaterial({
        color: 0xfef08a,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
      });
      const line = new THREE.Line(geo, mat);
      line.visible = false;
      line.frustumCulled = false;
      this.group.add(line);
      this.tracers.push({
        line,
        mat,
        active: false,
        age: 0,
        maxAge: 0.06,
        start: new THREE.Vector3(),
        end: new THREE.Vector3(),
        dir: new THREE.Vector3(0, 0, -1),
        totalDist: 1,
        travelDist: 0,
      });
    }
  }

  /**
   * Pre-compiles ballistics FX shaders during loading so the first shot/impact
   * never stalls WebGL on mobile GPUs.
   */
  public prewarm(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    isSoftwareGl = false
  ): void {
    if (isSoftwareGl) return;
    const prevShell = this.shells[0]?.mesh.visible ?? false;
    const prevTracer = this.tracers[0]?.line.visible ?? false;
    if (this.shells[0]) this.shells[0].mesh.visible = true;
    if (this.tracers[0]) this.tracers[0].line.visible = true;
    try {
      renderer.compile(scene, camera);
    } catch {
      // non-fatal
    }
    if (this.shells[0]) this.shells[0].mesh.visible = prevShell;
    if (this.tracers[0]) this.tracers[0].line.visible = prevTracer;
  }

  public spawnBrassCasing(
    worldPos: THREE.Vector3,
    cameraRight: THREE.Vector3,
    cameraUp: THREE.Vector3
  ): void {
    const item = this.shells[this.shellCursor];
    this.shellCursor = (this.shellCursor + 1) % this.shells.length;

    item.active = true;
    item.age = 0;
    item.bounced = false;
    item.mesh.visible = true;
    item.mesh.position.copy(worldPos);
    item.mesh.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );

    item.vel
      .copy(cameraRight)
      .multiplyScalar(2.2 + Math.random() * 0.9)
      .addScaledVector(cameraUp, 1.35 + Math.random() * 0.55);

    item.angVel.set(
      (Math.random() - 0.5) * 28,
      (Math.random() - 0.5) * 28,
      (Math.random() - 0.5) * 28
    );
  }

  public spawnDroppedMagazine(
    worldPos: THREE.Vector3,
    forwardDir: THREE.Vector3
  ): void {
    const item = this.droppedMags[this.magCursor];
    this.magCursor = (this.magCursor + 1) % this.droppedMags.length;

    item.active = true;
    item.age = 0;
    item.bounced = false;
    item.mesh.visible = true;
    item.mesh.position.copy(worldPos);
    item.vel.copy(forwardDir).multiplyScalar(0.8).setY(-1.4);
    item.angVel.set(4.5, (Math.random() - 0.5) * 6, 3.2);
  }

  public spawnImpactFX(
    hitPoint: THREE.Vector3,
    hitNormal: THREE.Vector3,
    isMetallic: boolean,
    isCrit: boolean
  ): void {
    // 1. Place bullet decal into instanced ring buffer
    const decalIdx = this.decalCursor;
    this.decalCursor = (this.decalCursor + 1) % DECAL_COUNT;
    _dummy.position.copy(hitPoint).addScaledVector(hitNormal, 0.004);
    _quat.setFromUnitVectors(_upVec, hitNormal);
    _dummy.quaternion.copy(_quat);
    _dummy.scale.setScalar(1);
    _dummy.updateMatrix();
    this.decalMesh.setMatrixAt(decalIdx, _dummy.matrix);
    this.decalMesh.instanceMatrix.needsUpdate = true;

    // 2. Burst of pooled instanced sparks (Zero GC)
    const count = isMetallic || isCrit ? 12 : 6;
    const sparkColorHex = isCrit ? 0xef4444 : isMetallic ? 0xfbbf24 : 0x94a3b8;
    _sparkColor.setHex(sparkColorHex);

    for (let i = 0; i < count; i++) {
      const idx = this.sparkCursor;
      this.sparkCursor = (this.sparkCursor + 1) % SPARK_COUNT;
      const sp = this.sparks[idx];

      sp.active = true;
      sp.age = 0;
      sp.maxAge = 0.18 + Math.random() * 0.18;
      sp.pos.copy(hitPoint).addScaledVector(hitNormal, 0.02);

      const speed = isMetallic
        ? 5.5 + Math.random() * 6.5
        : 2.5 + Math.random() * 3.5;
      _jitterVec.set(
        (Math.random() - 0.5) * 1.4,
        Math.random() * 1.1,
        (Math.random() - 0.5) * 1.4
      );
      sp.vel
        .copy(hitNormal)
        .add(_jitterVec)
        .normalize()
        .multiplyScalar(speed);

      this.sparkMesh.setColorAt(idx, _sparkColor);
      _dummy.position.copy(sp.pos);
      _sparkTarget.copy(sp.pos).add(sp.vel);
      _dummy.lookAt(_sparkTarget);
      _dummy.scale.setScalar(1);
      _dummy.updateMatrix();
      this.sparkMesh.setMatrixAt(idx, _dummy.matrix);
    }

    this.sparkMesh.instanceMatrix.needsUpdate = true;
    if (this.sparkMesh.instanceColor) {
      this.sparkMesh.instanceColor.needsUpdate = true;
    }
    this.sparksDirty = true;
  }

  public spawnTracer(
    startPos: THREE.Vector3,
    endPos: THREE.Vector3,
    colorHex = 0xfef08a
  ): void {
    const tr = this.tracers[this.tracerCursor];
    this.tracerCursor = (this.tracerCursor + 1) % this.tracers.length;

    tr.start.copy(startPos);
    tr.end.copy(endPos);
    tr.dir.subVectors(endPos, startPos);
    const dist = tr.dir.length();
    tr.totalDist = Math.max(0.25, dist);
    if (dist > 0.001) {
      tr.dir.divideScalar(dist);
    } else {
      tr.dir.set(0, 0, -1);
    }

    // Initial streak leaving the barrel immediately so shot feels snappy & fast
    const initialHead = Math.min(tr.totalDist, 4.5);
    const initialTail = Math.max(0, initialHead - 3.8);
    tr.travelDist = initialHead;
    tr.maxAge = Math.min(0.09, Math.max(0.032, tr.totalDist / 260));

    const posAttr = tr.line.geometry.getAttribute(
      'position'
    ) as THREE.BufferAttribute;
    posAttr.setXYZ(
      0,
      tr.start.x + tr.dir.x * initialTail,
      tr.start.y + tr.dir.y * initialTail,
      tr.start.z + tr.dir.z * initialTail
    );
    posAttr.setXYZ(
      1,
      tr.start.x + tr.dir.x * initialHead,
      tr.start.y + tr.dir.y * initialHead,
      tr.start.z + tr.dir.z * initialHead
    );
    posAttr.needsUpdate = true;

    tr.mat.color.setHex(colorHex);
    tr.mat.opacity = 0.88;
    tr.active = true;
    tr.age = 0;
    tr.line.visible = true;
  }

  public update(dt: number): void {
    // Update Brass Shells
    for (let i = 0; i < this.shells.length; i++) {
      const s = this.shells[i];
      if (!s.active) continue;
      s.age += dt;
      if (s.age > 8.0) {
        s.active = false;
        s.mesh.visible = false;
        continue;
      }
      if (s.mesh.position.y > 0.012 || s.vel.y > 0) {
        s.vel.y -= 13.5 * dt;
        s.mesh.position.addScaledVector(s.vel, dt);
        s.mesh.rotation.x += s.angVel.x * dt;
        s.mesh.rotation.y += s.angVel.y * dt;
        s.mesh.rotation.z += s.angVel.z * dt;

        if (s.mesh.position.y <= 0.012) {
          s.mesh.position.y = 0.012;
          s.vel.y = Math.abs(s.vel.y) * 0.35;
          s.vel.x *= 0.55;
          s.vel.z *= 0.55;
          s.angVel.multiplyScalar(0.4);
          if (!s.bounced) {
            s.bounced = true;
            soundEngine.playShellBounce();
          }
          if (s.vel.y < 0.35) {
            s.vel.set(0, 0, 0);
            s.angVel.set(0, 0, 0);
          }
        }
      }
    }

    // Update Dropped Magazines
    for (let i = 0; i < this.droppedMags.length; i++) {
      const m = this.droppedMags[i];
      if (!m.active) continue;
      m.age += dt;
      if (m.mesh.position.y > 0.03 || m.vel.y > 0) {
        m.vel.y -= 14.0 * dt;
        m.mesh.position.addScaledVector(m.vel, dt);
        m.mesh.rotation.x += m.angVel.x * dt;
        m.mesh.rotation.y += m.angVel.y * dt;
        m.mesh.rotation.z += m.angVel.z * dt;

        if (m.mesh.position.y <= 0.03) {
          m.mesh.position.y = 0.03;
          m.vel.set(0, 0, 0);
          m.angVel.set(0, 0, 0);
          m.mesh.rotation.x = Math.PI / 2;
          if (!m.bounced) {
            m.bounced = true;
            soundEngine.playReloadStage('MAG_DROP_FLOOR');
          }
        }
      }
    }

    // Update Instanced Sparks
    if (this.sparksDirty) {
      let anyActive = false;
      for (let i = 0; i < SPARK_COUNT; i++) {
        const sp = this.sparks[i];
        if (!sp.active) continue;
        sp.age += dt;
        if (sp.age >= sp.maxAge) {
          sp.active = false;
          this.sparkMesh.setMatrixAt(i, _zeroMatrix);
          continue;
        }
        anyActive = true;
        sp.vel.y -= 12.0 * dt;
        sp.pos.addScaledVector(sp.vel, dt);
        const fade = Math.max(0.05, 1 - sp.age / sp.maxAge);
        _dummy.position.copy(sp.pos);
        _sparkTarget.copy(sp.pos).add(sp.vel);
        _dummy.lookAt(_sparkTarget);
        _dummy.scale.set(fade, fade, fade);
        _dummy.updateMatrix();
        this.sparkMesh.setMatrixAt(i, _dummy.matrix);
      }
      this.sparkMesh.instanceMatrix.needsUpdate = true;
      this.sparksDirty = anyActive;
    }

    // Update High-Speed Supersonic Flying Tracers (Zero-GC)
    const TRACER_SPEED = 240; // meters/sec visual flight speed
    const TRACER_LENGTH = 7.5; // crisp supersonic streak length
    for (let i = 0; i < this.tracers.length; i++) {
      const tr = this.tracers[i];
      if (!tr.active) continue;
      tr.age += dt;
      tr.travelDist += TRACER_SPEED * dt;
      const tailDist = Math.max(0, tr.travelDist - TRACER_LENGTH);
      if (tailDist >= tr.totalDist || tr.age >= tr.maxAge + 0.03) {
        tr.active = false;
        tr.line.visible = false;
      } else {
        const headDist = Math.min(tr.totalDist, tr.travelDist);
        const posAttr = tr.line.geometry.getAttribute(
          'position'
        ) as THREE.BufferAttribute;
        posAttr.setXYZ(
          0,
          tr.start.x + tr.dir.x * tailDist,
          tr.start.y + tr.dir.y * tailDist,
          tr.start.z + tr.dir.z * tailDist
        );
        posAttr.setXYZ(
          1,
          tr.start.x + tr.dir.x * headDist,
          tr.start.y + tr.dir.y * headDist,
          tr.start.z + tr.dir.z * headDist
        );
        posAttr.needsUpdate = true;
        const lifeFade = Math.max(0.15, 1 - tr.age / (tr.maxAge + 0.03));
        tr.mat.opacity = 0.88 * lifeFade;
      }
    }
  }

  public dispose(): void {
    this.scene.remove(this.group);
    this.shellGeo.dispose();
    this.shellMat.dispose();
    this.magGeo.dispose();
    this.magMat.dispose();
    this.sparkGeo.dispose();
    this.sparkMat.dispose();
    this.sparkMesh.dispose();
    this.decalGeo.dispose();
    this.decalMat.dispose();
    this.decalMesh.dispose();
    for (let i = 0; i < this.tracers.length; i++) {
      this.tracers[i].line.geometry.dispose();
      this.tracers[i].mat.dispose();
    }
  }
}
