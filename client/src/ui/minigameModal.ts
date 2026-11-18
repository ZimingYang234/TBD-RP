export type MinigameType = 'memory' | 'reflex' | 'chest_guess' | 'riddle';

export interface MinigameCompletePayload {
  game: MinigameType;
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

const RIDDLES = [
  {
    q: 'Tengo ciudades, pero no casas; montañas, pero no árboles; y agua, pero no peces. ¿Qué soy?',
    options: ['Un mapa', 'Un sueño', 'Un espejo', 'Una nube'],
    answer: 0,
  },
  {
    q: 'Cuanto más quitas de mí, más grande me hago. ¿Qué soy?',
    options: ['Una espada', 'Un agujero', 'Un cofre', 'Una sombra'],
    answer: 1,
  },
  {
    q: 'No tengo boca pero siempre respondo cuando me hablan en las cuevas. ¿Qué soy?',
    options: ['El viento', 'El eco', 'Un espectro', 'La lluvia'],
    answer: 1,
  },
  {
    q: 'Si me alimentas vivo, pero si me das agua muero. ¿Qué soy?',
    options: ['Un dragón', 'El fuego', 'La arena', 'Un árbol'],
    answer: 1,
  },
  {
    q: 'Siempre corro pero nunca camino; tengo lecho pero nunca duermo. ¿Qué soy?',
    options: ['Un lobo', 'Un río', 'El tiempo', 'Un jinete'],
    answer: 1,
  },
];

export class MinigameModal {
  private overlayEl: HTMLElement | null = null;
  private open = false;
  private game: MinigameType = 'memory';
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

  // Chest Guess state
  private chestRound = 1;
  private chestScore = 0;
  private chestOrder: number[] = [0, 1, 2];
  private chestWinningId = 0;
  private chestRevealed = true;
  private chestCanPick = false;

  // Riddle state
  private riddleIndices: number[] = [];
  private riddleStep = 0;
  private riddleScore = 0;

  constructor(private readonly callbacks: MinigameModalCallbacks) {}

  public isOpen(): boolean {
    return this.open;
  }

  public show(game: MinigameType): void {
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

  private ensureOverlay(): HTMLElement {
    if (!this.overlayEl) {
      const el = document.createElement('div');
      el.id = 'minigame-modal-overlay';
      el.className = 'modal-overlay';
      document.body.appendChild(el);
      this.overlayEl = el;
    }
    return this.overlayEl;
  }

  private getGameTitle(): string {
    switch (this.game) {
      case 'memory':
        return 'Memoria de Runas';
      case 'reflex':
        return 'Reflejos del Héroe';
      case 'chest_guess':
        return 'Adivina el Cofre Bueno';
      case 'riddle':
        return 'Acertijos del Sabio';
    }
  }

  private getGameInstructions(): string {
    switch (this.game) {
      case 'memory':
        return 'Observa el orden en que brillan las 4 runas y repítelo durante 3 rondas. ¡Más rondas y dificultad Difícil dan mejores cofres!';
      case 'reflex':
        return 'Haz clic en tantas runas brillantes como puedas en 8 segundos. ¡Más puntos = cofre de mayor rareza!';
      case 'chest_guess':
        return 'Sigue con la vista el cofre dorado mientras se mezclan en 3 rondas. ¡Elige el correcto para sumar puntos!';
      case 'riddle':
        return 'Responde 3 acertijos rápidos de fantasía. ¡Cada acierto mejora tu cofre!';
    }
  }

  private render(): void {
    if (!this.open) return;
    const overlay = this.ensureOverlay();

    if (this.stage === 'setup') {
      const tabsHtml = (
        [
          { id: 'memory', label: 'Memoria' },
          { id: 'reflex', label: 'Reflejos' },
          { id: 'chest_guess', label: 'Cofres' },
          { id: 'riddle', label: 'Acertijos' },
        ] as const
      )
        .map(
          (t) =>
            `<button type="button" class="quality-btn ${this.game === t.id ? 'active' : ''}" data-game="${t.id}">${t.label}</button>`
        )
        .join('');

      overlay.innerHTML = `
        <div class="modal-card shop-modal-card" role="dialog" aria-modal="true" aria-labelledby="mg-title">
          <div class="modal-header">
            <div>
              <div class="modal-kicker">Desafío de Minijuego</div>
              <h2 id="mg-title" class="modal-title">${this.getGameTitle()}</h2>
            </div>
            <button type="button" id="mg-cancel-btn" class="btn btn-secondary">Salir</button>
          </div>

          <div class="quality-toggle" style="align-self:flex-start;">${tabsHtml}</div>

          <p class="modal-narration">${this.getGameInstructions()}</p>

          <div>
            <div class="field-label">Elige dificultad</div>
            <div class="actions-row" style="margin-top: 8px;">
              <button type="button" id="mg-diff-normal" class="class-card ${this.difficulty === 'normal' ? 'selected' : ''}">
                <div class="class-name">Normal</div>
                <div class="class-desc">Ritmo estándar (hasta cofre Épico)</div>
              </button>
              <button type="button" id="mg-diff-hard" class="class-card ${this.difficulty === 'dificil' ? 'selected' : ''}">
                <div class="class-name">Difícil</div>
                <div class="class-desc">Más rápido/largo (¡hasta Legendario!)</div>
              </button>
            </div>
          </div>

          <div class="modal-footer" style="justify-content: flex-end;">
            <button type="button" id="mg-start-btn" class="btn">¡Empezar desafío!</button>
          </div>
        </div>
      `;

      overlay.querySelectorAll<HTMLButtonElement>('[data-game]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.game = btn.dataset.game as MinigameType;
          this.render();
        });
      });
      overlay.querySelector('#mg-cancel-btn')?.addEventListener('click', () => this.hide());
      overlay.querySelector('#mg-diff-normal')?.addEventListener('click', () => {
        this.difficulty = 'normal';
        this.render();
      });
      overlay.querySelector('#mg-diff-hard')?.addEventListener('click', () => {
        this.difficulty = 'dificil';
        this.render();
      });
      overlay.querySelector('#mg-start-btn')?.addEventListener('click', () => {
        this.startPlaying();
      });
      return;
    }

    if (this.game === 'memory') {
      this.renderMemoryBoard(overlay);
    } else if (this.game === 'reflex') {
      this.renderReflexBoard(overlay);
    } else if (this.game === 'chest_guess') {
      this.renderChestGuessBoard(overlay);
    } else {
      this.renderRiddleBoard(overlay);
    }
  }

  private startPlaying(): void {
    this.clearTimers();
    this.stage = 'playing';

    if (this.game === 'memory') {
      this.memoryRound = 1;
      this.memoryScore = 0;
      this.render();
      this.startMemoryRound();
    } else if (this.game === 'reflex') {
      this.reflexScore = 0;
      this.reflexTimeLeftMs = 8000;
      this.moveReflexTarget();
      this.render();
      this.startReflexLoop();
    } else if (this.game === 'chest_guess') {
      this.chestRound = 1;
      this.chestScore = 0;
      this.render();
      this.startChestGuessRound();
    } else {
      const indices = RIDDLES.map((_, idx) => idx).sort(() => Math.random() - 0.5);
      this.riddleIndices = indices.slice(0, 3);
      this.riddleStep = 0;
      this.riddleScore = 0;
      this.render();
    }
  }

  private startMemoryRound(): void {
    const baseLen = this.difficulty === 'dificil' ? 4 : 3;
    const seqLen = baseLen + (this.memoryRound - 1);
    this.memorySequence = [];
    for (let i = 0; i < seqLen; i++) {
      this.memorySequence.push(Math.floor(Math.random() * RUNE_PADS.length));
    }
    this.memoryInputIndex = 0;
    this.memoryCanInput = false;
    this.updateMemoryStatus(`Ronda ${this.memoryRound}/3 — Observa la secuencia...`);

    const stepMs = this.difficulty === 'dificil' ? 460 : 620;
    const flashMs = this.difficulty === 'dificil' ? 280 : 380;

    this.memorySequence.forEach((padId, idx) => {
      const t1 = window.setTimeout(() => {
        this.flashPad(padId, flashMs);
      }, 450 + idx * stepMs);
      this.timers.push(t1);
    });

    const readyAt = 450 + this.memorySequence.length * stepMs + 120;
    const tReady = window.setTimeout(() => {
      this.memoryCanInput = true;
      this.updateMemoryStatus(`Ronda ${this.memoryRound}/3 — ¡Tu turno! (${seqLen} runas)`);
    }, readyAt);
    this.timers.push(tReady);
  }

  private flashPad(padId: number, durationMs: number): void {
    const padEl = this.overlayEl?.querySelector<HTMLElement>(`.rune-pad[data-pad="${padId}"]`);
    if (!padEl) return;
    padEl.classList.add('lit');
    const t = window.setTimeout(() => {
      padEl.classList.remove('lit');
    }, durationMs);
    this.timers.push(t);
  }

  private updateMemoryStatus(text: string): void {
    const el = this.overlayEl?.querySelector<HTMLElement>('#mg-status-line');
    if (el) el.textContent = text;
  }

  private renderMemoryBoard(overlay: HTMLElement): void {
    const padsHtml = RUNE_PADS.map(
      (p) => `
      <button
        type="button"
        class="rune-pad"
        data-pad="${p.id}"
        style="--pad-color:${p.color}; --pad-glow:${p.glow}"
      >
        <span>${p.label}</span>
      </button>
    `
    ).join('');

    overlay.innerHTML = `
      <div class="modal-card shop-modal-card" role="dialog" aria-modal="true" aria-labelledby="mg-title">
        <div class="modal-header">
          <div>
            <div class="modal-kicker">Memoria de Runas (${this.difficulty === 'dificil' ? 'Difícil' : 'Normal'})</div>
            <h2 id="mg-title" class="modal-title">Puntos: <span id="mg-score-val">${this.memoryScore}</span></h2>
          </div>
          <button type="button" id="mg-abort-btn" class="btn btn-secondary">Abandonar</button>
        </div>

        <div id="mg-status-line" class="mg-status-line">Preparando...</div>
        <div class="rune-grid">${padsHtml}</div>
      </div>
    `;

    overlay.querySelector('#mg-abort-btn')?.addEventListener('click', () => this.hide());
    overlay.querySelectorAll<HTMLButtonElement>('.rune-pad').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!this.memoryCanInput) return;
        const padId = Number(btn.dataset.pad);
        this.flashPad(padId, 200);

        if (padId === this.memorySequence[this.memoryInputIndex]) {
          this.memoryInputIndex += 1;
          if (this.memoryInputIndex >= this.memorySequence.length) {
            this.memoryCanInput = false;
            this.memoryScore += 4;
            const scoreEl = overlay.querySelector('#mg-score-val');
            if (scoreEl) scoreEl.textContent = String(this.memoryScore);

            if (this.memoryRound >= 3) {
              this.finishMinigame(this.memoryScore);
              return;
            }
            this.memoryRound += 1;
            const nextT = window.setTimeout(() => this.startMemoryRound(), 550);
            this.timers.push(nextT);
          }
        } else {
          this.memoryCanInput = false;
          this.updateMemoryStatus('¡Fallo! Calculando tu cofre...');
          const endT = window.setTimeout(() => this.finishMinigame(this.memoryScore), 600);
          this.timers.push(endT);
        }
      });
    });
  }

  private moveReflexTarget(): void {
    this.reflexTargetPos = {
      x: 12 + Math.floor(Math.random() * 76),
      y: 15 + Math.floor(Math.random() * 70),
    };
  }

  private startReflexLoop(): void {
    const tick = window.setInterval(() => {
      this.reflexTimeLeftMs -= 100;
      const timerEl = this.overlayEl?.querySelector('#mg-timer-val');
      if (timerEl) {
        timerEl.textContent = `${Math.max(0, this.reflexTimeLeftMs / 1000).toFixed(1)}s`;
      }
      if (this.reflexTimeLeftMs <= 0) {
        this.finishMinigame(this.reflexScore);
      }
    }, 100);
    this.intervals.push(tick);
  }

  private renderReflexBoard(overlay: HTMLElement): void {
    const targetSize = this.difficulty === 'dificil' ? 38 : 50;
    overlay.innerHTML = `
      <div class="modal-card shop-modal-card" role="dialog" aria-modal="true" aria-labelledby="mg-title">
        <div class="modal-header">
          <div>
            <div class="modal-kicker">Reflejos del Héroe (${this.difficulty === 'dificil' ? 'Difícil' : 'Normal'})</div>
            <h2 id="mg-title" class="modal-title">Aciertos: <span id="mg-score-val">${this.reflexScore}</span></h2>
          </div>
          <span class="gold-badge" id="mg-timer-val">8.0s</span>
        </div>

        <div class="reflex-arena" id="reflex-arena">
          <button
            type="button"
            id="reflex-target"
            class="reflex-target"
            style="left:${this.reflexTargetPos.x}%; top:${this.reflexTargetPos.y}%; width:${targetSize}px; height:${targetSize}px;"
            aria-label="Runa objetivo"
          ></button>
        </div>

        <div class="modal-footer" style="justify-content: flex-end;">
          <button type="button" id="mg-abort-btn" class="btn btn-secondary">Abandonar</button>
        </div>
      </div>
    `;

    overlay.querySelector('#mg-abort-btn')?.addEventListener('click', () => this.hide());
    const targetBtn = overlay.querySelector<HTMLButtonElement>('#reflex-target');
    targetBtn?.addEventListener('click', () => {
      this.reflexScore += 1;
      const scoreEl = overlay.querySelector('#mg-score-val');
      if (scoreEl) scoreEl.textContent = String(this.reflexScore);
      this.moveReflexTarget();
      targetBtn.style.left = `${this.reflexTargetPos.x}%`;
      targetBtn.style.top = `${this.reflexTargetPos.y}%`;
    });
  }

  private startChestGuessRound(): void {
    const count = this.difficulty === 'dificil' ? 4 : 3;
    this.chestOrder = Array.from({ length: count }, (_, i) => i);
    this.chestWinningId = Math.floor(Math.random() * count);
    this.chestRevealed = true;
    this.chestCanPick = false;
    this.renderChestGuessBoard(this.ensureOverlay());

    const shuffleCount = this.difficulty === 'dificil' ? 6 : 4;
    const shuffleStepMs = this.difficulty === 'dificil' ? 280 : 380;

    const tHide = window.setTimeout(() => {
      this.chestRevealed = false;
      this.renderChestGuessBoard(this.ensureOverlay());
    }, 900);
    this.timers.push(tHide);

    for (let s = 0; s < shuffleCount; s++) {
      const tShuf = window.setTimeout(() => {
        const a = Math.floor(Math.random() * count);
        const b = (a + 1 + Math.floor(Math.random() * (count - 1))) % count;
        const tmp = this.chestOrder[a];
        this.chestOrder[a] = this.chestOrder[b];
        this.chestOrder[b] = tmp;
        this.renderChestGuessBoard(this.ensureOverlay());
      }, 1150 + s * shuffleStepMs);
      this.timers.push(tShuf);
    }

    const tPick = window.setTimeout(() => {
      this.chestCanPick = true;
      this.renderChestGuessBoard(this.ensureOverlay());
    }, 1150 + shuffleCount * shuffleStepMs + 100);
    this.timers.push(tPick);
  }

  private renderChestGuessBoard(overlay: HTMLElement): void {
    const cardsHtml = this.chestOrder
      .map((slotId, idx) => {
        const isGolden = this.chestRevealed && slotId === this.chestWinningId;
        return `
          <button
            type="button"
            class="guess-chest-btn ${isGolden ? 'golden' : ''}"
            data-chest-id="${slotId}"
            ${!this.chestCanPick ? 'disabled' : ''}
          >
            <div class="guess-chest-num">${idx + 1}</div>
            <div class="guess-chest-label">${isGolden ? '¡DORADO!' : 'Cofre'}</div>
          </button>
        `;
      })
      .join('');

    overlay.innerHTML = `
      <div class="modal-card shop-modal-card" role="dialog" aria-modal="true" aria-labelledby="mg-title">
        <div class="modal-header">
          <div>
            <div class="modal-kicker">Adivina el Cofre (${this.difficulty === 'dificil' ? 'Difícil' : 'Normal'})</div>
            <h2 id="mg-title" class="modal-title">Ronda ${this.chestRound}/3 • Puntos: ${this.chestScore}</h2>
          </div>
          <button type="button" id="mg-abort-btn" class="btn btn-secondary">Abandonar</button>
        </div>

        <div class="mg-status-line">
          ${
            this.chestRevealed
              ? '¡Mira dónde está el cofre dorado!'
              : this.chestCanPick
                ? '¿Cuál era el cofre dorado?'
                : 'Mezclando cofres...'
          }
        </div>
        <div class="guess-chest-grid">${cardsHtml}</div>
      </div>
    `;

    overlay.querySelector('#mg-abort-btn')?.addEventListener('click', () => this.hide());
    overlay.querySelectorAll<HTMLButtonElement>('.guess-chest-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!this.chestCanPick) return;
        this.chestCanPick = false;
        const picked = Number(btn.dataset.chestId);
        if (picked === this.chestWinningId) {
          this.chestScore += 4;
        }
        this.chestRevealed = true;
        this.renderChestGuessBoard(overlay);

        const nextT = window.setTimeout(() => {
          if (this.chestRound >= 3) {
            this.finishMinigame(this.chestScore);
          } else {
            this.chestRound += 1;
            this.startChestGuessRound();
          }
        }, 700);
        this.timers.push(nextT);
      });
    });
  }

  private renderRiddleBoard(overlay: HTMLElement): void {
    const r = RIDDLES[this.riddleIndices[this.riddleStep] ?? 0];
    const optionsHtml = r.options
      .map(
        (opt, idx) =>
          `<button type="button" class="choice-btn riddle-opt-btn" data-opt="${idx}">${opt}</button>`
      )
      .join('');

    overlay.innerHTML = `
      <div class="modal-card shop-modal-card" role="dialog" aria-modal="true" aria-labelledby="mg-title">
        <div class="modal-header">
          <div>
            <div class="modal-kicker">Acertijos del Sabio (${this.difficulty === 'dificil' ? 'Difícil' : 'Normal'})</div>
            <h2 id="mg-title" class="modal-title">Pregunta ${this.riddleStep + 1}/3 • Puntos: ${this.riddleScore}</h2>
          </div>
          <button type="button" id="mg-abort-btn" class="btn btn-secondary">Abandonar</button>
        </div>

        <p class="modal-narration">${r.q}</p>
        <div class="choice-list">${optionsHtml}</div>
      </div>
    `;

    overlay.querySelector('#mg-abort-btn')?.addEventListener('click', () => this.hide());
    overlay.querySelectorAll<HTMLButtonElement>('.riddle-opt-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const picked = Number(btn.dataset.opt);
        if (picked === r.answer) {
          this.riddleScore += 4;
        }
        if (this.riddleStep + 1 >= this.riddleIndices.length) {
          this.finishMinigame(this.riddleScore);
        } else {
          this.riddleStep += 1;
          this.renderRiddleBoard(overlay);
        }
      });
    });
  }

  private finishMinigame(score: number): void {
    const payload: MinigameCompletePayload = {
      game: this.game,
      difficulty: this.difficulty,
      score,
    };
    this.hide();
    this.callbacks.onComplete(payload);
  }
}
