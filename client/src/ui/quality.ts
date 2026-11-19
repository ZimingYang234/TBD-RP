export type GraphicsQuality = 'low' | 'medium' | 'high';

const QUALITY_STORAGE_KEY = 'tbd_rpg_quality_v1';
const QUALITY_STYLE_ID = 'tbd-quality-control-styles';

/** School Chromebooks and other weak devices. Used to keep the renderer cheap. */
export function isLowPowerDevice(): boolean {
  try {
    const nav = navigator as Navigator & {
      deviceMemory?: number;
      connection?: { saveData?: boolean };
    };
    const ua = nav.userAgent || '';
    const cores = nav.hardwareConcurrency || 8;
    const memory = nav.deviceMemory;
    if (/CrOS|Chromebook/i.test(ua)) return true;
    if (nav.connection?.saveData) return true;
    if (typeof memory === 'number' && memory <= 4) return true;
    if (cores <= 4) return true;
  } catch {
    // ignore
  }
  return false;
}

function getDefaultQuality(): GraphicsQuality {
  return isLowPowerDevice() ? 'low' : 'medium';
}

export const QUALITY_LEVELS: readonly GraphicsQuality[] = ['low', 'medium', 'high'];

export const QUALITY_LABELS: Record<GraphicsQuality, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
};

function isGraphicsQuality(value: unknown): value is GraphicsQuality {
  return value === 'low' || value === 'medium' || value === 'high';
}

export function getSavedQuality(): GraphicsQuality {
  try {
    const raw = window.localStorage.getItem(QUALITY_STORAGE_KEY);
    return isGraphicsQuality(raw) ? raw : getDefaultQuality();
  } catch {
    return getDefaultQuality();
  }
}

export function saveQuality(quality: GraphicsQuality): void {
  try {
    window.localStorage.setItem(QUALITY_STORAGE_KEY, quality);
  } catch {
    // Ignore storage errors in restricted environments
  }
}

export function getNextQuality(quality: GraphicsQuality): GraphicsQuality {
  if (quality === 'low') return 'medium';
  if (quality === 'medium') return 'high';
  return 'low';
}

function ensureQualityStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(QUALITY_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = QUALITY_STYLE_ID;
  style.textContent = `
    .quality-toggle {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: var(--panel-alt, #202636);
      border: 1px solid var(--border, #2f384f);
      border-radius: 8px;
      padding: 3px 5px;
      font-family: 'Segoe UI', Roboto, system-ui, sans-serif;
    }
    .quality-label {
      font-size: 0.76rem;
      font-weight: 700;
      color: var(--muted, #98a3ba);
      padding: 0 6px 0 4px;
      letter-spacing: 0.03em;
    }
    .quality-btn {
      border: 1px solid transparent;
      background: transparent;
      color: var(--muted, #98a3ba);
      font-family: inherit;
      font-size: 0.78rem;
      font-weight: 600;
      padding: 4px 9px;
      border-radius: 6px;
      cursor: pointer;
      line-height: 1.2;
      transition: background-color 0.14s ease, color 0.14s ease, border-color 0.14s ease;
    }
    .quality-btn:hover {
      color: var(--text, #eef2f9);
      background: rgba(255, 255, 255, 0.06);
    }
    .quality-btn.active {
      background: var(--accent, #f2b749);
      color: #14161f;
      border-color: var(--accent-hover, #f9ca6c);
      font-weight: 700;
    }
  `;
  document.head.appendChild(style);
}

export function renderQualityControl(
  container: HTMLElement,
  current: GraphicsQuality,
  onChange: (quality: GraphicsQuality) => void
): void {
  ensureQualityStyles();

  let activeQuality: GraphicsQuality = current;

  const buttonsHtml = QUALITY_LEVELS.map((q) => {
    const isActive = q === activeQuality;
    return `<button type="button" class="quality-btn${isActive ? ' active' : ''}" data-quality="${q}" aria-pressed="${isActive}">${QUALITY_LABELS[q]}</button>`;
  }).join('');

  container.innerHTML = `
    <div class="quality-toggle" role="group" aria-label="Calidad gráfica">
      <span class="quality-label">Calidad:</span>
      ${buttonsHtml}
    </div>
  `;

  const buttons = container.querySelectorAll<HTMLButtonElement>('.quality-btn');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.quality;
      if (!isGraphicsQuality(next) || next === activeQuality) return;

      activeQuality = next;
      saveQuality(next);

      buttons.forEach((b) => {
        const selected = b.dataset.quality === next;
        b.classList.toggle('active', selected);
        b.setAttribute('aria-pressed', String(selected));
      });

      onChange(next);
    });
  });
}
