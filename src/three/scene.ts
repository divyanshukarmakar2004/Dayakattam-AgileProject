import * as THREE from 'three';
import type { GameState, RollResult, Side } from '../types';
import { LOOP, SAFE_CELLS, SIDES, DECOR_BASES, cellWorld, loopCellIndex } from '../game/board';
import { SHARED_STEPS, FINISH } from '../game/rules';

interface SelectableRef { side: Side; index: number }

interface CamState {
  theta: number; phi: number; radius: number;
  targetTheta: number; targetPhi: number; targetRadius: number;
}

export class Scene3D {
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private container!: HTMLElement;

  private boardGroup!: THREE.Group;
  private pieceMeshes: Record<Side, THREE.Group[]> = { player: [], ai: [] };
  private diceGroup!: THREE.Group;
  private diceBars: THREE.Group[] = [];

  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  private camState: CamState = { theta: 0, phi: 0.95, radius: 15.5, targetTheta: 0, targetPhi: 0.95, targetRadius: 15.5 };
  private dragging = false;
  private lastX = 0;
  private lastY = 0;

  private selectablePieces: SelectableRef[] = [];
  private onPieceClickCb: ((side: Side, index: number) => void) | null = null;

  init(rootEl: HTMLElement) {
    this.container = rootEl;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x120b06);
    this.scene.fog = new THREE.Fog(0x120b06, 22, 40);

    this.camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 100);
    this.updateCameraFromState(true);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    this.setupLights();
    this.buildTable();
    this.boardGroup = new THREE.Group();
    this.scene.add(this.boardGroup);
    this.buildBoard();
    this.buildPieces();
    this.buildDice();
    this.buildCowries();

    window.addEventListener('resize', () => this.onResize());
    this.renderer.domElement.addEventListener('pointerdown', e => this.onPointerDown(e));
    window.addEventListener('pointermove', e => this.onPointerMove(e));
    window.addEventListener('pointerup', () => this.onPointerUp());
    this.renderer.domElement.addEventListener('wheel', e => this.onWheel(e), { passive: false });
    this.renderer.domElement.addEventListener('click', e => this.onClick(e));

    this.animate();
  }

  private setupLights() {
    this.scene.add(new THREE.AmbientLight(0xffe8c0, 0.55));
    const key = new THREE.DirectionalLight(0xffdca0, 1.15);
    key.position.set(8, 14, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -14; key.shadow.camera.right = 14;
    key.shadow.camera.top = 14; key.shadow.camera.bottom = -14;
    key.shadow.camera.far = 40;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x8899ff, 0.35);
    rim.position.set(-10, 8, -8);
    this.scene.add(rim);
  }

  private buildTable() {
    const geo = new THREE.CylinderGeometry(20, 20, 1.2, 48);
    const mat = new THREE.MeshStandardMaterial({ color: 0x1c1108, roughness: 0.9, metalness: 0.05 });
    const table = new THREE.Mesh(geo, mat);
    table.position.y = -1.2;
    table.receiveShadow = true;
    this.scene.add(table);
  }

  private woodMat(color: number, rough = 0.75) {
    return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.05 });
  }

  private buildBoard() {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(15.6, 0.5, 15.6), this.woodMat(0x3e2a1c, 0.85));
    slab.position.y = -0.28;
    slab.receiveShadow = true; slab.castShadow = true;
    this.boardGroup.add(slab);

    const edge = new THREE.Mesh(new THREE.BoxGeometry(16.1, 0.18, 16.1), this.woodMat(0x2b1c14, 0.8));
    edge.position.y = -0.02;
    this.boardGroup.add(edge);

    for (let i = 0; i < LOOP.length; i++) {
      this.addTile(LOOP[i].row, LOOP[i].col, SAFE_CELLS.has(i) ? 0x5a4020 : 0x6b4a2c, SAFE_CELLS.has(i));
    }
    for (const c of SIDES.player.homeStretch) this.addTile(c.row, c.col, 0x7a3a28, false);
    for (const c of SIDES.ai.homeStretch) this.addTile(c.row, c.col, 0x2c3c5e, false);
    this.addTile(7, 7, 0xc9a24a, false, true);
    for (const c of SIDES.player.base) this.addTile(c.row, c.col, 0x5a2e22, false);
    for (const c of SIDES.ai.base) this.addTile(c.row, c.col, 0x263352, false);
    for (const grp of DECOR_BASES) for (const c of grp) this.addTile(c.row, c.col, 0x4a3a28, false);

    this.markStart(SIDES.player.startIndex, SIDES.player.color);
    this.markStart(SIDES.ai.startIndex, SIDES.ai.color);
  }

  private addTile(row: number, col: number, color: number, safe: boolean, center = false) {
    const { x, z } = cellWorld(row, col);
    const size = center ? 1.15 : 0.92;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, 0.14, size), this.woodMat(color, 0.7));
    mesh.position.set(x, 0.02, z);
    mesh.receiveShadow = true;
    this.boardGroup.add(mesh);
    if (safe) {
      const dGeo = new THREE.RingGeometry(0.12, 0.2, 4);
      const dMat = new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide });
      const diamond = new THREE.Mesh(dGeo, dMat);
      diamond.rotation.x = -Math.PI / 2; diamond.rotation.z = Math.PI / 4;
      diamond.position.set(x, 0.1, z);
      this.boardGroup.add(diamond);
    }
  }

  private markStart(loopIdx: number, color: number) {
    const { row, col } = LOOP[loopIdx];
    const { x, z } = cellWorld(row, col);
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.32, 0.06, 20),
      new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3 })
    );
    mesh.position.set(x, 0.13, z);
    this.boardGroup.add(mesh);
  }

  private buildPieces() {
    (['player', 'ai'] as Side[]).forEach(side => {
      const color = SIDES[side].color;
      for (let i = 0; i < 4; i++) {
        const group = new THREE.Group();
        const body = new THREE.Mesh(
          new THREE.CylinderGeometry(0.18, 0.24, 0.42, 16),
          new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.35 })
        );
        body.castShadow = true; body.position.y = 0.21;
        const cap = new THREE.Mesh(
          new THREE.SphereGeometry(0.16, 14, 10),
          new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.5 })
        );
        cap.position.y = 0.44; cap.castShadow = true;
        group.add(body); group.add(cap);
        group.userData = { side, index: i, selected: false, selectable: false };
        this.boardGroup.add(group);
        this.pieceMeshes[side].push(group);
      }
    });
  }

  private buildDice() {
    this.diceGroup = new THREE.Group();
    this.diceGroup.position.set(4.6, 2.2, 4.6);
    this.scene.add(this.diceGroup);
    const brass = new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.35, metalness: 0.85 });
    const brassDark = new THREE.MeshStandardMaterial({ color: 0x8a6a2e, roughness: 0.5, metalness: 0.7 });
    for (let b = 0; b < 2; b++) {
      const bar = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.32, 0.4), brass);
      body.castShadow = true;
      bar.add(body);
      for (let h = 0; h < 3; h++) {
        const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 12), brassDark);
        hole.position.set(-0.45 + h * 0.45, 0.16, 0);
        bar.add(hole);
      }
      bar.position.set(b === 0 ? -0.5 : 0.5, 0, b === 0 ? -0.1 : 0.1);
      this.diceGroup.add(bar);
      this.diceBars.push(bar);
    }
  }

  private shellGeometry(): THREE.LatheGeometry {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const r = Math.sin(t * Math.PI) * 0.16 * (1 - 0.25 * t);
      pts.push(new THREE.Vector2(r, (t - 0.5) * 0.34));
    }
    return new THREE.LatheGeometry(pts, 14);
  }

  private buildCowries() {
    const grp = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xece2c8, roughness: 0.55, metalness: 0.05 });
    for (let i = 0; i < 8; i++) {
      const shell = new THREE.Mesh(this.shellGeometry(), mat);
      shell.rotation.z = Math.PI / 2;
      shell.rotation.y = Math.random() * Math.PI;
      shell.position.set(-6.6 + Math.random() * 1.1, 0.14, -6.6 + Math.random() * 1.1 + i * 0.05);
      shell.castShadow = true;
      grp.add(shell);
    }
    this.scene.add(grp);
  }

  private worldPosFor(side: Side, progress: number) {
    let row: number, col: number;
    if (progress === FINISH) ({ row, col } = SIDES[side].homeCell);
    else if (progress >= SHARED_STEPS) ({ row, col } = SIDES[side].homeStretch[progress - SHARED_STEPS]);
    else ({ row, col } = LOOP[loopCellIndex(side, progress)]);
    return cellWorld(row, col);
  }

  layoutPieces(state: GameState, animate: boolean) {
    (['player', 'ai'] as Side[]).forEach(side => {
      let homeStackCount = 0;
      for (let i = 0; i < 4; i++) {
        const mesh = this.pieceMeshes[side][i];
        const p = state.pieces[side][i];
        let target: { x: number; z: number };

        if (p === -1) {
          const c = SIDES[side].base[i];
          target = cellWorld(c.row, c.col);
        } else if (p === FINISH) {
          const c = SIDES[side].homeCell;
          const idx = homeStackCount++;
          const off = 0.28;
          const angle = (side === 'player' ? 0 : 1) * Math.PI + idx * (Math.PI / 2);
          target = { x: (c.col - 7) + Math.cos(angle) * off, z: (c.row - 7) + Math.sin(angle) * off };
        } else {
          target = this.worldPosFor(side, p);
        }

        if (animate) this.tweenPos(mesh, target.x, target.z, 0.02, 320);
        else mesh.position.set(target.x, 0.02, target.z);
      }
    });
  }

  private tweenPos(mesh: THREE.Object3D, x: number, z: number, y: number, durMs: number) {
    const start = { x: mesh.position.x, z: mesh.position.z };
    const t0 = performance.now();
    const lift = 0.35;
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / durMs);
      const e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // easeInOutQuad
      const cy = y + Math.sin(t * Math.PI) * lift;
      mesh.position.set(start.x + (x - start.x) * e, cy, start.z + (z - start.z) * e);
      if (t < 1) requestAnimationFrame(step); else mesh.position.set(x, y, z);
    };
    requestAnimationFrame(step);
  }

  private pulsePiece(mesh: THREE.Group) {
    const t0 = performance.now();
    const step = (now: number) => {
      const t = (now - t0) / 600;
      if (t > 1 || !mesh.userData.selected) { mesh.scale.set(1, 1, 1); return; }
      const s = 1 + Math.sin(t * Math.PI * 3) * 0.08;
      mesh.scale.set(s, s, s);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  setSelectable(list: SelectableRef[]) {
    (['player', 'ai'] as Side[]).forEach(s =>
      this.pieceMeshes[s].forEach(m => { m.userData.selectable = false; m.userData.selected = false; m.scale.set(1, 1, 1); })
    );
    this.selectablePieces = list;
    for (const item of list) this.pieceMeshes[item.side][item.index].userData.selectable = true;
  }

  markSelected(side: Side, index: number) {
    (['player', 'ai'] as Side[]).forEach(s => this.pieceMeshes[s].forEach(m => (m.userData.selected = false)));
    const m = this.pieceMeshes[side][index];
    m.userData.selected = true;
    this.pulsePiece(m);
  }

  setOnPieceClick(fn: (side: Side, index: number) => void) { this.onPieceClickCb = fn; }

  private onPointerDown(e: PointerEvent) { this.dragging = true; this.lastX = e.clientX; this.lastY = e.clientY; }
  private onPointerUp() { this.dragging = false; }
  private onPointerMove(e: PointerEvent) {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastX, dy = e.clientY - this.lastY;
    this.lastX = e.clientX; this.lastY = e.clientY;
    this.camState.targetTheta -= dx * 0.005;
    this.camState.targetPhi = Math.min(1.25, Math.max(0.55, this.camState.targetPhi - dy * 0.004));
  }
  private onWheel(e: WheelEvent) {
    e.preventDefault();
    this.camState.targetRadius = Math.min(24, Math.max(9, this.camState.targetRadius + e.deltaY * 0.01));
  }

  resetCamera() {
    this.camState.targetTheta = 0; this.camState.targetPhi = 0.95; this.camState.targetRadius = 15.5;
  }

  private updateCameraFromState(instant: boolean) {
    if (instant) {
      this.camState.theta = this.camState.targetTheta;
      this.camState.phi = this.camState.targetPhi;
      this.camState.radius = this.camState.targetRadius;
    } else {
      this.camState.theta += (this.camState.targetTheta - this.camState.theta) * 0.08;
      this.camState.phi += (this.camState.targetPhi - this.camState.phi) * 0.08;
      this.camState.radius += (this.camState.targetRadius - this.camState.radius) * 0.08;
    }
    const r = this.camState.radius;
    this.camera.position.set(
      r * Math.sin(this.camState.phi) * Math.sin(this.camState.theta),
      r * Math.cos(this.camState.phi),
      r * Math.sin(this.camState.phi) * Math.cos(this.camState.theta)
    );
    this.camera.lookAt(0, 0, 0);
  }

  private onClick(e: MouseEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const meshes = this.selectablePieces.map(it => this.pieceMeshes[it.side][it.index]);
    const hits = this.raycaster.intersectObjects(meshes, true);
    if (hits.length && this.onPieceClickCb) {
      let obj: THREE.Object3D = hits[0].object;
      while (obj.parent && !obj.userData.side) obj = obj.parent;
      this.onPieceClickCb(obj.userData.side, obj.userData.index);
    }
  }

  private onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /** Dice tumble animation, decoupled from the (already-decided) result. */
  animateDiceRoll(result: RollResult, cb?: () => void) {
    const finalUp = [result.marked >= 1, result.marked === 2];
    const dur = 950;
    const t0 = performance.now();
    const spins = this.diceBars.map(() => 4 + Math.random() * 3);
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur);
      const ease = 1 - Math.pow(1 - t, 3);
      this.diceBars.forEach((bar, i) => {
        bar.rotation.x = spins[i] * Math.PI * 2 * (1 - ease) + (finalUp[i] ? 0 : Math.PI) * ease;
        bar.rotation.z = Math.sin(t * 20 + i) * (1 - ease) * 0.6;
        bar.position.y = Math.abs(Math.sin(t * Math.PI * 3.2)) * (1 - ease) * 1.1;
      });
      this.diceGroup.rotation.y = (1 - ease) * Math.PI * 0.4;
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        this.diceBars.forEach((bar, i) => { bar.rotation.x = finalUp[i] ? 0 : Math.PI; bar.rotation.z = 0; bar.position.y = 0; });
        this.diceGroup.rotation.y = 0;
        cb && cb();
      }
    };
    requestAnimationFrame(step);
  }

  private animate() {
    requestAnimationFrame(() => this.animate());
    this.updateCameraFromState(false);
    this.renderer.render(this.scene, this.camera);
  }
}
