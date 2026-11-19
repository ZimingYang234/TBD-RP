export interface ArenaModalCallbacks {
  onComplete: (score: number, difficulty: 'normal' | 'dificil') => void;
  onBossComplete?: (victory: boolean, regionId: string) => void;
  onClosed: () => void;
}

interface ArenaEnemy {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  radius: number;
  color: string;
  hitFlashMs: number;
  isBoss?: boolean;
  shootCdMs?: number;
}

interface ArenaProjectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  lifeMs: number;
  fromEnemy?: boolean;
}

interface ArenaPickup {
  x: number;
  y: number;
}

const ARENA_SIZE = 440;

export class ArenaModal {
  private overlayEl: HTMLElement | null = null;
  private open = false;
  private rafId: number | null = null;
  private difficulty: 'normal' | 'dificil' = 'normal';

  // Input state
  private keys = new Set<string>();
  private aimAngle = 0;

  // Player state
  private px = ARENA_SIZE / 2;
  private py = ARENA_SIZE / 2;
  private hp = 5;
  private maxHp = 5;
  private invulnMs = 0;
  private dashMs = 0;
  private dashCooldownMs = 0;
  private swordCooldownMs = 0;
  private swordSwingMs = 0;
  private swordAngle = 0;
  private spellCooldownMs = 0;

  // World state
  private bossMode: { bossName: string; bossHp: number; regionId: string } | null = null;
  private bossCycleMs = 0;
  private bossVulnerable = false;
  private wave = 1;
  private kills = 0;
  private finished = false;
  private enemies: ArenaEnemy[] = [];
  private projectiles: ArenaProjectile[] = [];
  private pickups: ArenaPickup[] = [];
  private lastTs = 0;
  private arenaAccum = 0;

  private onKeyDownBound = (e: KeyboardEvent) => this.handleKeyDown(e);
  private onKeyUpBound = (e: KeyboardEvent) => this.handleKeyUp(e);

  constructor(private readonly callbacks: ArenaModalCallbacks) {}

  public isOpen(): boolean {
    return this.open;
  }

  public show(difficulty: 'normal' | 'dificil' = 'normal'): void {
    this.bossMode = null;
    this.difficulty = difficulty;
    this.open = true;
    this.resetRun();
    this.render();
    window.addEventListener('keydown', this.onKeyDownBound);
    window.addEventListener('keyup', this.onKeyUpBound);
    this.lastTs = performance.now();
    this.loop(this.lastTs);
  }

  public showBossBattle(bossName: string, bossHp: number, regionId: string): void {
    this.bossMode = { bossName, bossHp, regionId };
    this.bossCycleMs = 0;
    this.bossVulnerable = false;
    this.difficulty = 'normal';
    this.open = true;
    this.resetRun();
    this.render();
    window.addEventListener('keydown', this.onKeyDownBound);
    window.addEventListener('keyup', this.onKeyUpBound);
    this.lastTs = performance.now();
    this.loop(this.lastTs);
  }

  public hide(): void {
    this.open = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    window.removeEventListener('keydown', this.onKeyDownBound);
    window.removeEventListener('keyup', this.onKeyUpBound);
    this.keys.clear();
    if (this.overlayEl) {
      this.overlayEl.remove();
      this.overlayEl = null;
    }
    this.callbacks.onClosed();
  }

  private resetRun(): void {
    this.px = ARENA_SIZE / 2;
    this.py = ARENA_SIZE / 2;
    this.hp = 5;
    this.maxHp = 5;
    this.invulnMs = 0;
    this.dashMs = 0;
    this.dashCooldownMs = 0;
    this.swordCooldownMs = 0;
    this.swordSwingMs = 0;
    this.spellCooldownMs = 0;
    this.wave = 1;
    this.kills = 0;
    this.finished = false;
    this.projectiles = [];
    this.pickups = [];
    this.spawnWave(1);
  }

  private spawnWave(waveNum: number): void {
    this.enemies = [];
    if (this.bossMode) {
      this.enemies.push({
        x: 44 + 22,
        y: ARENA_SIZE - 44 - 22,
        hp: this.bossMode.bossHp,
        maxHp: this.bossMode.bossHp,
        speed: 82,
        radius: 22,
        color: '#f59e0b',
        hitFlashMs: 0,
        isBoss: true,
        shootCdMs: 1400,
      });
      return;
    }

    const count = (this.difficulty === 'dificil' ? 4 : 3) + (waveNum - 1);
    for (let i = 0; i < count; i++) {
      const edge = i % 4;
      let x = 24;
      let y = 24;
      if (edge === 0) {
        x = 30 + Math.random() * (ARENA_SIZE - 60);
        y = 24;
      } else if (edge === 1) {
        x = ARENA_SIZE - 24;
        y = 30 + Math.random() * (ARENA_SIZE - 60);
      } else if (edge === 2) {
        x = 30 + Math.random() * (ARENA_SIZE - 60);
        y = ARENA_SIZE - 24;
      } else {
        x = 24;
        y = 30 + Math.random() * (ARENA_SIZE - 60);
      }

      const isFast = i % 3 === 1;
      const isElite = waveNum >= 3 && i === 0;
      const baseSpeed = this.difficulty === 'dificil' ? 88 : 68;
      this.enemies.push({
        x,
        y,
        hp: isElite ? 6 : isFast ? 2 : 3,
        maxHp: isElite ? 6 : isFast ? 2 : 3,
        speed: baseSpeed + (isFast ? 26 : 0) + waveNum * 4,
        radius: isElite ? 16 : 11,
        color: isElite ? '#fbbf24' : isFast ? '#a855f7' : '#ef4444',
        hitFlashMs: 0,
      });
    }
  }

  private render(): void {
    if (!this.overlayEl) {
      const el = document.createElement('div');
      el.id = 'arena-modal-overlay';
      el.className = 'modal-overlay';
      document.body.appendChild(el);
      this.overlayEl = el;
    }

    this.overlayEl.innerHTML = `
      <div class="modal-card shop-modal-card" role="dialog" aria-modal="true" aria-labelledby="arena-title">
        <div class="modal-header">
          <div>
            <div class="modal-kicker">${this.bossMode ? 'Jefe del Reino • Acción en Tiempo Real' : 'Portal Minijuego • Roguelike'}</div>
            <h2 id="arena-title" class="modal-title">${this.bossMode ? this.bossMode.bossName : 'Arena de Supervivencia'}</h2>
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            <span class="badge" id="arena-wave-badge">${this.bossMode ? 'JEFE' : 'Oleada 1'}</span>
            <span class="gold-badge" id="arena-kills-badge">${this.bossMode ? `PV Jefe: ${this.bossMode.bossHp}` : 'Bajas: 0'}</span>
          </div>
        </div>

        <div class="shop-stats-bar" style="justify-content:space-between;">
          <span id="arena-hp-text">Vida: <strong>5/5</strong></span>
          <span>Mover: <strong>WASD / Flechas</strong></span>
          <span id="arena-cd-text">Espada • Hechizo • Esquivar</span>
        </div>

        <div class="arena-canvas-wrap">
          <canvas id="arena-canvas" width="${ARENA_SIZE}" height="${ARENA_SIZE}"></canvas>
        </div>

        <div class="arena-controls-row">
          <button type="button" id="arena-sword-btn" class="btn btn-sm">Espada (Espacio / Clic)</button>
          <button type="button" id="arena-spell-btn" class="btn btn-special btn-sm">Hechizo (E / Clic Der.)</button>
          <button type="button" id="arena-dash-btn" class="btn btn-secondary btn-sm">Esquivar (Shift / Q)</button>
          <button type="button" id="arena-cashout-btn" class="btn btn-secondary btn-sm">Cobrar y salir</button>
        </div>
      </div>
    `;

    const canvas = this.overlayEl.querySelector<HTMLCanvasElement>('#arena-canvas');
    canvas?.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * ARENA_SIZE;
      const my = ((e.clientY - rect.top) / rect.height) * ARENA_SIZE;
      this.aimAngle = Math.atan2(my - this.py, mx - this.px);
    });
    canvas?.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * ARENA_SIZE;
      const my = ((e.clientY - rect.top) / rect.height) * ARENA_SIZE;
      this.aimAngle = Math.atan2(my - this.py, mx - this.px);
      if (e.button === 2) this.castSpell();
      else this.swingSword();
    });
    canvas?.addEventListener('contextmenu', (e) => e.preventDefault());

    this.overlayEl.querySelector('#arena-sword-btn')?.addEventListener('click', () => this.swingSword());
    this.overlayEl.querySelector('#arena-spell-btn')?.addEventListener('click', () => this.castSpell());
    this.overlayEl.querySelector('#arena-dash-btn')?.addEventListener('click', () => this.triggerDash());
    this.overlayEl.querySelector('#arena-cashout-btn')?.addEventListener('click', () => {
      this.finishRun();
    });
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.open) return;
    const k = e.key.toLowerCase();
    this.keys.add(k);
    if (k === ' ') {
      e.preventDefault();
      this.swingSword();
    } else if (k === 'e') {
      e.preventDefault();
      this.castSpell();
    } else if (k === 'shift' || k === 'q') {
      e.preventDefault();
      this.triggerDash();
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    this.keys.delete(e.key.toLowerCase());
  }

  private swingSword(): void {
    if (this.finished || this.swordCooldownMs > 0) return;
    if (this.bossMode && !this.bossVulnerable) return;
    this.swordCooldownMs = 300;
    this.swordSwingMs = 150;
    this.swordAngle = this.aimAngle;

    const reach = this.bossMode ? 92 : 64;
    const dmg = this.bossMode ? 18 : 2;
    for (const enemy of this.enemies) {
      const dx = enemy.x - this.px;
      const dy = enemy.y - this.py;
      const dist = Math.hypot(dx, dy);
      if (dist <= reach + enemy.radius) {
        const angleToEnemy = Math.atan2(dy, dx);
        const diff = Math.abs(Math.atan2(Math.sin(angleToEnemy - this.swordAngle), Math.cos(angleToEnemy - this.swordAngle)));
        if (diff <= 1.25 || dist < 24) {
          enemy.hp -= dmg;
          enemy.hitFlashMs = 140;
          const push = dist > 0 ? 18 / dist : 0;
          enemy.x = Math.max(16, Math.min(ARENA_SIZE - 16, enemy.x + dx * push));
          enemy.y = Math.max(16, Math.min(ARENA_SIZE - 16, enemy.y + dy * push));
        }
      }
    }
    this.cleanupDeadEnemies();
  }

  private castSpell(): void {
    if (this.finished || this.spellCooldownMs > 0) return;
    if (this.bossMode && !this.bossVulnerable) return;
    this.spellCooldownMs = 1100;
    const speed = 340;
    this.projectiles.push({
      x: this.px + Math.cos(this.aimAngle) * 14,
      y: this.py + Math.sin(this.aimAngle) * 14,
      vx: Math.cos(this.aimAngle) * speed,
      vy: Math.sin(this.aimAngle) * speed,
      lifeMs: 1200,
    });
  }

  private triggerDash(): void {
    if (this.finished || this.dashCooldownMs > 0) return;
    this.dashCooldownMs = 1500;
    this.dashMs = 160;
    this.invulnMs = Math.max(this.invulnMs, 240);
  }

  private cleanupDeadEnemies(): void {
    const alive: ArenaEnemy[] = [];
    for (const e of this.enemies) {
      if (e.hp <= 0) {
        this.kills += 1;
        if (Math.random() < 0.25) {
          this.pickups.push({ x: e.x, y: e.y });
        }
      } else {
        alive.push(e);
      }
    }
    this.enemies = alive;

    if (this.enemies.length === 0 && !this.finished) {
      if (this.bossMode) {
        this.finishRun(true);
        return;
      }
      this.wave += 1;
      if (this.wave > 5) {
        this.finishRun(true);
        return;
      }
      this.spawnWave(this.wave);
    }
  }

  private finishRun(victory = false): void {
    if (this.finished) return;
    this.finished = true;
    const boss = this.bossMode;
    const score = this.kills + (this.wave - 1) * 3;
    const diff = this.difficulty;
    this.hide();
    if (boss && this.callbacks.onBossComplete) {
      this.callbacks.onBossComplete(victory, boss.regionId);
      return;
    }
    this.callbacks.onComplete(score, diff);
  }

  private loop(now: number): void {
    if (!this.open) return;
    const dtMs = Math.min(50, Math.max(1, now - this.lastTs));
    this.lastTs = now;
    this.arenaAccum = (this.arenaAccum ?? 0) + dtMs;
    if (this.arenaAccum < 33) {
      this.rafId = requestAnimationFrame((ts) => this.loop(ts));
      return;
    }
    const step = this.arenaAccum;
    this.arenaAccum = 0;
    this.updateState(step);
    this.draw();
    if (!this.finished) {
      this.rafId = requestAnimationFrame((ts) => this.loop(ts));
    }
  }

  private updateState(dtMs: number): void {
    const dt = dtMs / 1000;
    if (this.bossMode) this.bossCycleMs += dtMs;
    this.invulnMs = Math.max(0, this.invulnMs - dtMs);
    this.dashMs = Math.max(0, this.dashMs - dtMs);
    this.dashCooldownMs = Math.max(0, this.dashCooldownMs - dtMs);
    this.swordCooldownMs = Math.max(0, this.swordCooldownMs - dtMs);
    this.swordSwingMs = Math.max(0, this.swordSwingMs - dtMs);
    this.spellCooldownMs = Math.max(0, this.spellCooldownMs - dtMs);

    let mx = 0;
    let my = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) my -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) my += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) mx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) mx += 1;

    if (mx !== 0 || my !== 0) {
      const len = Math.hypot(mx, my);
      mx /= len;
      my /= len;
      const speed = this.dashMs > 0 ? 420 : 175;
      this.px = Math.max(16, Math.min(ARENA_SIZE - 16, this.px + mx * speed * dt));
      this.py = Math.max(16, Math.min(ARENA_SIZE - 16, this.py + my * speed * dt));
      this.aimAngle = Math.atan2(my, mx);
    }

    // Projectiles
    const nextProj: ArenaProjectile[] = [];
    for (const p of this.projectiles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.lifeMs -= dtMs;
      if (p.lifeMs <= 0 || p.x < 0 || p.y < 0 || p.x > ARENA_SIZE || p.y > ARENA_SIZE) {
        continue;
      }
      if (p.fromEnemy) {
        if (Math.hypot(this.px - p.x, this.py - p.y) <= 16 && this.invulnMs <= 0) {
          this.hp -= 1;
          this.invulnMs = 750;
          if (this.hp <= 0) {
            this.finishRun(false);
            return;
          }
          continue;
        }
        nextProj.push(p);
        continue;
      }
      let hitAny = false;
      for (const e of this.enemies) {
        if (Math.hypot(e.x - p.x, e.y - p.y) <= e.radius + 7) {
          e.hp -= 3;
          e.hitFlashMs = 150;
          hitAny = true;
          break;
        }
      }
      if (!hitAny) nextProj.push(p);
    }
    this.projectiles = nextProj;
    this.cleanupDeadEnemies();

    // Enemies
    for (const e of this.enemies) {
      e.hitFlashMs = Math.max(0, e.hitFlashMs - dtMs);
      const dx = this.px - e.x;
      const dy = this.py - e.y;
      const dist = Math.hypot(dx, dy);
      const isPhase2 = Boolean(e.isBoss && e.hp <= e.maxHp * 0.5);
      const curSpeed = isPhase2 ? e.speed * 1.25 : e.speed;

      if (e.isBoss && this.bossMode) {
        e.x = 44 + 22;
        e.y = ARENA_SIZE - 44 - 22;
        const cycle = 19000;
        const beat = this.bossCycleMs % cycle;
        this.bossVulnerable = beat >= 15000;
        e.shootCdMs = (e.shootCdMs ?? 0) - dtMs;
        if (!this.bossVulnerable && e.shootCdMs <= 0) {
          const baseAng = Math.atan2(this.py - e.y, this.px - e.x);
          if (beat < 5000) {
            e.shootCdMs = 380;
            for (const off of [-0.28, 0, 0.28]) {
              this.projectiles.push({
                x: e.x,
                y: e.y,
                vx: Math.cos(baseAng + off) * 210,
                vy: Math.sin(baseAng + off) * 210,
                lifeMs: 2400,
                fromEnemy: true,
              });
            }
          } else if (beat < 10000) {
            e.shootCdMs = 860;
            for (let i = 0; i < 10; i++) {
              const ang = (Math.PI * 2 * i) / 10 + beat / 900;
              this.projectiles.push({
                x: e.x,
                y: e.y,
                vx: Math.cos(ang) * 150,
                vy: Math.sin(ang) * 150,
                lifeMs: 2600,
                fromEnemy: true,
              });
            }
          } else {
            e.shootCdMs = 640;
            for (let i = -2; i <= 2; i++) {
              this.projectiles.push({
                x: 20,
                y: e.y + i * 28,
                vx: 120,
                vy: 0,
                lifeMs: 2800,
                fromEnemy: true,
              });
              this.projectiles.push({
                x: e.x + i * 28,
                y: 20,
                vx: 0,
                vy: 110,
                lifeMs: 2800,
                fromEnemy: true,
              });
            }
          }
        }
      } else if (e.isBoss) {
        e.shootCdMs = (e.shootCdMs ?? 1400) - dtMs;
        if (e.shootCdMs <= 0) {
          e.shootCdMs = isPhase2 ? 1050 : 1650;
          const baseAng = Math.atan2(dy, dx);
          const offsets = isPhase2 ? [-0.35, 0, 0.35] : [0];
          for (const off of offsets) {
            this.projectiles.push({
              x: e.x,
              y: e.y,
              vx: Math.cos(baseAng + off) * 190,
              vy: Math.sin(baseAng + off) * 190,
              lifeMs: 2200,
              fromEnemy: true,
            });
          }
        }
      }

      if (this.bossMode && e.isBoss) {
        if (!this.bossVulnerable && dist <= e.radius + 16 && this.invulnMs <= 0) {
          this.hp -= 1;
          this.invulnMs = 700;
          if (this.hp <= 0) {
            this.finishRun(false);
            return;
          }
        }
        continue;
      }

      if (dist > 1) {
        e.x += (dx / dist) * curSpeed * dt;
        e.y += (dy / dist) * curSpeed * dt;
      }
      if (dist <= e.radius + 11 && this.invulnMs <= 0) {
        this.hp -= 1;
        this.invulnMs = 750;
        if (this.hp <= 0) {
          this.finishRun(false);
          return;
        }
      }
    }

    // Pickups
    this.pickups = this.pickups.filter((pk) => {
      if (Math.hypot(pk.x - this.px, pk.y - this.py) <= 20) {
        this.hp = Math.min(this.maxHp, this.hp + 1);
        return false;
      }
      return true;
    });

    // Update HUD labels
    const waveEl = this.overlayEl?.querySelector('#arena-wave-badge');
    const killsEl = this.overlayEl?.querySelector('#arena-kills-badge');
    const hpEl = this.overlayEl?.querySelector('#arena-hp-text');
    if (this.bossMode) {
      const boss = this.enemies[0];
      if (waveEl) waveEl.textContent = this.bossVulnerable ? '¡ATACA!' : 'Esquiva';
      if (killsEl) killsEl.textContent = `PV Jefe: ${Math.max(0, boss?.hp ?? 0)}`;
    } else {
      if (waveEl) waveEl.textContent = `Oleada ${this.wave}/5`;
      if (killsEl) killsEl.textContent = `Bajas: ${this.kills}`;
    }
    if (hpEl) hpEl.innerHTML = `Vida: <strong>${this.hp}/${this.maxHp}</strong>`;
  }

  private draw(): void {
    const canvas = this.overlayEl?.querySelector<HTMLCanvasElement>('#arena-canvas');
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    // Background square tiles
    ctx.fillStyle = '#141824';
    ctx.fillRect(0, 0, ARENA_SIZE, ARENA_SIZE);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= ARENA_SIZE; i += 44) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, ARENA_SIZE);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(ARENA_SIZE, i);
      ctx.stroke();
    }

    // Pickups (hearts)
    for (const pk of this.pickups) {
      ctx.fillStyle = '#4ade80';
      ctx.beginPath();
      ctx.arc(pk.x, pk.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Projectiles
    for (const p of this.projectiles) {
      ctx.fillStyle = p.fromEnemy ? '#f87171' : '#60a5fa';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.fromEnemy ? 7 : 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Enemies
    for (const e of this.enemies) {
      ctx.fillStyle = e.hitFlashMs > 0 ? '#ffffff' : e.color;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#090b10';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Sword arc
    if (this.swordSwingMs > 0) {
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.85)';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(this.px, this.py, 44, this.swordAngle - 1.1, this.swordAngle + 1.1);
      ctx.stroke();
    }

    // Player
    ctx.fillStyle = this.dashMs > 0 ? '#38bdf8' : this.invulnMs > 0 ? '#fde68a' : '#f0b44c';
    ctx.beginPath();
    ctx.arc(this.px, this.py, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}
