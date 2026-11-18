export interface MinigameCompletePayload {
  game: 'memory' | 'reflex';
  difficulty: 'normal' | 'dificil';
  score: number;
}

export interface MinigameModalCallbacks {
  onComplete: (payload: MinigameCompletePayload) => void;
  onClosed: () => void;
}

const RUNE_PADS = [
  { id: 0, label: 'Rubí', color: '#ef4444', glow: 'rgba(239, 68, 68, 0.7)' },
  { id: 1, label: 'Zafiro', color: '#3b82f6', glow: 'rgba(59, 130, 246, 0.7)' },
  { id: 2, label: 'Esmeralda', color: '#22c55e', glow: 'rgba(34, 197, 94, 0.7)' },
  { id: 3, label: 'Amatista', color: '#a855f7', glow: 'rgba(168, 85, 247, 0.7)' },
];

export class MinigameModal {
  private overlayEl: HTMLElement | null = null;
  private open = false;
  private game: 'memory' | 'reflex' = 'memory';
  private difficulty: 'normal' | 'dificil' = 'normal';
  private stage: 'setup' | 'playing' = 'setup';

  private timers: number[] = [];
  private intervals: number[] = [];

  // Memory state
  private memoryRound = 1;
  private memoryScore = 0;
  private memorySequence: number[] = [];
  private memoryInputIndex = 0;
  private memoryCanInput = false;

  // Reflex state
  private reflexScore = 0;
  private reflexTimeLeftMs = 8000;
  private reflexTargetPos: { x: number; y: number } = { x: 50, y: 50 };

  constructor(private readonly callbacks: MinigameModalCallbacks) {}

  public isOpen(): boolean {
    return this.open;
  }

  public show(game: 'memory' | 'reflex'): void {
    this.clearTimers();
    this.game = game;
    this.difficulty = 'normal';
    this.stage = 'setup';
    this.open = true;
    this.render();
  }

  public hide(): void {
    this.clearTimers();
    this.open = false;
    if (this.overlayEl) {
      this.overlayEl.remove();
      this.overlayEl = null;
    }
    this.callbacks.onClosed();
  }

  private clearTimers(): void {
    for (const t of this.timers) window.clearTimeout(t);
    for (const i of this.intervals) window.clearInterval(i);
    this.timers = [];
    this.intervals = [];
  }

  private render(): void {
    if (!this.overlayEl) {
      const el = document.createElement('div');
      el.id = 'minigame-modal-overlay';
      el.className = 'modal-overlay';
      document.body.appendChild(el);
      this.overlayEl = el;
    }

    const title = this.game === 'memory' ? 'Memoria de Runas' : 'Reflejos del Héroe';
    const desc =
      this.game === 'memory'
        ? 'Observa la secuencia de runas iluminadas y repítela durante 3 rondas. ¡Más rondas y mayor dificultad otorgan mejores cofres!'
        : 'Haz clic en tantas runas como puedas durante 8 segundos. ¡A mayor puntuación y dificultad, mejor cofre obtendrás!';

    if (this.stage === 'setup') {
      this.overlayEl.innerHTML = `
        <div class="modal-card minigame-modal-card" role="dialog" aria-modal="true" aria-labelledby="mg-title">
          <div class="modal-header">
            <div>
              <div class="modal-kicker" style="color:#22d3ee">Desafío de Habilidad</div>
              <h2 id="mg-title" class="modal-title">${title}</h2>
            </div>
            <button type="button" id="mg-close-btn" class="btn btn-secondary">Cerrar</button>
          </div>

          <p class="modal-narration">${desc}</p>

          <div>
            <span class="field-label">Elige dificultad</span>
            <div class="mg-diff-row">
              <button type="button" class="btn ${this.difficulty === 'normal' ? '' : 'btn-secondary'}" data-diff="normal">
                Normal (hasta Épico)
              </button>
              <button type="button" class="btn ${this.difficulty === 'dificil' ? '' : 'btn-secondary'}" data-diff="dificil">
                Difícil (hasta Legendario)
              </button>
            </div>
          </div>

          <div class="modal-footer" style="justify-content: flex-end;">
            <button type="button" id="mg-start-btn" class="btn">¡Comenzar desafío!</button>
          </div>
        </div>
      `;

      this.overlayEl.querySelector('#mg-close-btn')?.addEventListener('click', () => this.hide());
      this.overlayEl.querySelectorAll<HTMLButtonElement>('[data-diff]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.difficulty = btn.dataset.diff === 'dificil' ? 'dificil' : 'normal';
          this.render();
        });
      });
      this.overlayEl.querySelector('#mg-start-btn')?.addEventListener('click', () => {
        this.stage = 'playing';
        if (this.game === 'memory') {
          this.startMemoryGame();
        } else {
          this.startReflexGame();
        }
      });
      return;
    }

    if (this.game === 'memory') {
      this.renderMemoryPlaying();
    } else {
      this.renderReflexPlaying();
    }
  }

  private startMemoryGame(): void {
    this.memoryRound = 1;
    this.memoryScore = 0;
    this.renderMemoryPlaying();
    this.beginMemoryRound();
  }

  private renderMemoryPlaying(): void {
    if (!this.overlayEl) return;
    this.overlayEl.innerHTML = `
      <div class="modal-card minigame-modal-card" role="dialog" aria-modal="true">
        <div class="modal-header">
          <div>
            <div class="modal-kicker" style="color:#22d3ee">Memoria de Runas (${this.difficulty === 'dificil' ? 'Difícil' : 'Normal'})</div>
            <h2 class="modal-title">Ronda <span id="mg-mem-round">${this.memoryRound}</span>/3 • Aciertos: <span id="mg-mem-score">${this.memoryScore}</span></h2>
          </div>
        </div>
        <div id="mg-mem-status" class="mg-status-bar">Prepárate...</div>
        <div class="memory-grid">
          ${RUNE_PADS.map(
            (pad) => `
              <button
                type="button"
                class="memory-pad"
                data-pad="${pad.id}"
                style="--pad-color:${pad.color}; --pad-glow:${pad.glow}"
              >
                <span>${pad.label}</span>
              </button>
            `
          ).join('')}
        </div>
      </div>
    `;

    this.overlayEl.querySelectorAll<HTMLButtonElement>('.memory-pad').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!this.memoryCanInput) return;
        const padId = Number(btn.dataset.pad);
        this.flashMemoryPad(padId, 220);
        this.handleMemoryInput(padId);
      });
    });
  }

  private beginMemoryRound(): void {
    this.memoryCanInput = false;
    this.memoryInputIndex = 0;
    const baseLen = this.difficulty === 'dificil' ? 4 : 3;
    const seqLen = baseLen + (this.memoryRound - 1);
    this.memorySequence = Array.from({ length: seqLen }, () => Math.floor(Math.random() * 4));

    const roundEl = this.overlayEl?.querySelector('#mg-mem-round');
    const scoreEl = this.overlayEl?.querySelector('#mg-mem-score');
    const statusEl = this.overlayEl?.querySelector('#mg-mem-status');
    if (roundEl) roundEl.textContent = String(this.memoryRound);
    if (scoreEl) scoreEl.textContent = String(this.memoryScore);
    if (statusEl) statusEl.textContent = 'Observa la secuencia...';

    const stepMs = this.difficulty === 'dificil' ? 380 : 580;
    const flashMs = this.difficulty === 'dificil' ? 230 : 360;

    this.memorySequence.forEach((padId, idx) => {
      const t = window.setTimeout(() => {
        this.flashMemoryPad(padId, flashMs);
      }, 450 + idx * stepMs);
      this.timers.push(t);
    });

    const readyTimer = window.setTimeout(() => {
      this.memoryCanInput = true;
      const st = this.overlayEl?.querySelector('#mg-mem-status');
      if (st) st.textContent = '¡Tu turno! Repite la secuencia.';
    }, 450 + this.memorySequence.length * stepMs + 120);
    this.timers.push(readyTimer);
  }

  private flashMemoryPad(padId: number, durationMs: number): void {
    const btn = this.overlayEl?.querySelector<HTMLElement>(`.memory-pad[data-pad="${padId}"]`);
    if (!btn) return;
    btn.classList.add('lit');
    const t = window.setTimeout(() => {
      btn.classList.remove('lit');
    }, durationMs);
    this.timers.push(t);
  }

  private handleMemoryInput(padId: number): void {
    const expected = this.memorySequence[this.memoryInputIndex];
    if (padId !== expected) {
      this.memoryCanInput = false;
      const st = this.overlayEl?.querySelector('#mg-mem-status');
      if (st) st.textContent = '¡Runa equivocada! Calculando recompensa...';
      const t = window.setTimeout(() => this.finishGame(this.memoryScore), 700);
      this.timers.push(t);
      return;
    }

    this.memoryInputIndex += 1;
    if (this.memoryInputIndex >= this.memorySequence.length) {
      this.memoryCanInput = false;
      this.memoryScore += 1;
      const scoreEl = this.overlayEl?.querySelector('#mg-mem-score');
      if (scoreEl) scoreEl.textContent = String(this.memoryScore);

      if (this.memoryRound >= 3) {
        const st = this.overlayEl?.querySelector('#mg-mem-status');
        if (st) st.textContent = '¡Perfecto! Todas las rondas completadas.';
        const t = window.setTimeout(() => this.finishGame(this.memoryScore), 650);
        this.timers.push(t);
      } else {
        this.memoryRound += 1;
        const st = this.overlayEl?.querySelector('#mg-mem-status');
        if (st) st.textContent = '¡Bien! Siguiente ronda...';
        const t = window.setTimeout(() => this.beginMemoryRound(), 750);
        this.timers.push(t);
      }
    }
  }

  private startReflexGame(): void {
    this.reflexScore = 0;
    this.reflexTimeLeftMs = 8000;
    this.renderReflexPlaying();
    this.spawnReflexTarget();

    const tick = window.setInterval(() => {
      this.reflexTimeLeftMs = Math.max(0, this.reflexTimeLeftMs - 100);
      const timerEl = this.overlayEl?.querySelector('#mg-ref-time');
      if (timerEl) timerEl.textContent = (this.reflexTimeLeftMs / 1000).toFixed(1);
      if (this.reflexTimeLeftMs <= 0) {
        this.finishGame(this.reflexScore);
      }
    }, 100);
    this.intervals.push(tick);

    const respawnMs = this.difficulty === 'dificil' ? 680 : 1150;
    const mover = window.setInterval(() => {
      this.spawnReflexTarget();
    }, respawnMs);
    this.intervals.push(mover);
  }

  private renderReflexPlaying(): void {
    if (!this.overlayEl) return;
    const size = this.difficulty === 'dificil' ? 32 : 48;
    this.overlayEl.innerHTML = `
      <div class="modal-card minigame-modal-card" role="dialog" aria-modal="true">
        <div class="modal-header">
          <div>
            <div class="modal-kicker" style="color:#22d3ee">Reflejos del Héroe (${this.difficulty === 'dificil' ? 'Difícil' : 'Normal'})</div>
            <h2 class="modal-title">Puntos: <span id="mg-ref-score">0</span> • Tiempo: <span id="mg-ref-time">8.0</span>s</h2>
          </div>
        </div>
        <div class="reflex-arena" id="mg-reflex-arena">
          <button
            type="button"
            id="mg-reflex-target"
            class="reflex-target"
            style="width:${size}px; height:${size}px; left:50%; top:50%;"
            aria-label="Runa objetivo"
          >✦</button>
        </div>
      </div>
    `;

    this.overlayEl.querySelector('#mg-reflex-target')?.addEventListener('click', () => {
      this.reflexScore += 1;
      const scoreEl = this.overlayEl?.querySelector('#mg-ref-score');
      if (scoreEl) scoreEl.textContent = String(this.reflexScore);
      this.spawnReflexTarget();
    });
  }

  private spawnReflexTarget(): void {
    const target = this.overlayEl?.querySelector<HTMLElement>('#mg-reflex-target');
    if (!target) return;
    this.reflexTargetPos = {
      x: 10 + Math.random() * 80,
      y: 12 + Math.random() * 76,
    };
    target.style.left = `${this.reflexTargetPos.x}%`;
    target.style.top = `${this.reflexTargetPos.y}%`;
  }

  private finishGame(score: number): void {
    const payload: MinigameCompletePayload = {
      game: this.game,
      difficulty: this.difficulty,
      score,
    };
    this.hide();
    this.callbacks.onComplete(payload);
  }
}
