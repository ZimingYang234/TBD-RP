import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PlayerClass } from '@tbd/shared';

export type DmChoiceId = 'a' | 'b' | 'c';

export interface DmEffects {
  hpDelta?: number;
  xpDelta?: number;
  goldDelta?: number;
  summary: string;
}

export interface DmChoice {
  id: DmChoiceId;
  label: string;
  outcomeNarration: string;
  effects: DmEffects;
}

export interface DmEvent {
  id: string;
  regionId: string;
  title: string;
  narration: string;
  choices: [DmChoice, DmChoice, DmChoice];
}

export interface DmPartyMemberContext {
  name: string;
  playerClass: PlayerClass;
  hp: number;
  maxHp: number;
}

export interface GenerateEventInput {
  regionId: string;
  regionName?: string;
  regionSubtitle?: string;
  tileX?: number;
  tileY?: number;
  triggerContext?: string;
  party?: DmPartyMemberContext[];
  avoidEventIds?: string[];
  bypassCache?: boolean;
}

export type DmEventSource = 'ai' | 'cache' | 'fallback';

export interface GenerateEventResult {
  event: DmEvent;
  source: DmEventSource;
  aiCallsMade: number;
  fallbackReason?: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_TIMEOUT_MS = 5000;
const MAX_NARRATION_WORDS = 120;
const MIN_HP_DELTA = -10;
const MAX_HP_DELTA = 10;
const MIN_XP_DELTA = 0;
const MAX_XP_DELTA = 100;
const MIN_GOLD_DELTA = -50;
const MAX_GOLD_DELTA = 100;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 100;

const CLASS_NAME_ES: Record<PlayerClass, string> = {
  Fighter: 'Guerrero',
  Wizard: 'Mago',
  Rogue: 'Pícaro',
};

const REGION_DESCRIPTIONS_ES: Record<string, { name: string; flavor: string }> = {
  valderroble: {
    name: 'Reino de Valderroble',
    flavor: 'Encrucijada esmeralda de bosques antiguos, arroyos claros, aldeas y bandidos.',
  },
  solceniza: {
    name: 'Reino de Solceniza',
    flavor: 'Desierto de dunas rojizas, oasis ocultos, ruinas solares y forjas ardientes.',
  },
  ventisca: {
    name: 'Reino de Ventisca',
    flavor: 'Cumbres del invierno eterno, cuevas de hielo, lagos helados y auroras boreales.',
  },
  'plano-astral': {
    name: 'Plano Astral',
    flavor: 'Santuario cósmico entre estrellas, plataformas flotantes, ecos temporales y constructos arcanos.',
  },
};

interface CacheEntry {
  event: DmEvent;
  cachedAt: number;
  hits: number;
}

const eventCache = new Map<string, CacheEntry>();
let cachedFallbackEvents: DmEvent[] | null = null;

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractJsonText(rawText: string): string {
  const trimmed = rawText.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

function normalizeChoiceId(rawId: unknown, index: number): DmChoiceId | null {
  if (rawId === 'a' || rawId === 'b' || rawId === 'c') return rawId;
  if (rawId === '1') return 'a';
  if (rawId === '2') return 'b';
  if (rawId === '3') return 'c';
  if (rawId === undefined && index >= 0 && index <= 2) {
    return (['a', 'b', 'c'] as const)[index];
  }
  return null;
}

export function validateDmEventPayload(
  raw: unknown,
  defaults?: { id?: string; regionId?: string }
): ValidationResult<DmEvent> {
  let parsed: unknown = raw;

  if (typeof raw === 'string') {
    const cleaned = extractJsonText(raw);
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return { ok: false, error: 'El contenido devuelto no es un JSON válido.' };
    }
  }

  if (!isPlainObject(parsed)) {
    return { ok: false, error: 'La raíz del evento debe ser un objeto JSON.' };
  }

  const rawId = typeof parsed.id === 'string' && parsed.id.trim()
    ? parsed.id.trim()
    : defaults?.id ?? `ai-${crypto.randomUUID().slice(0, 8)}`;

  const rawRegionId = typeof parsed.regionId === 'string' && parsed.regionId.trim()
    ? parsed.regionId.trim()
    : defaults?.regionId ?? 'any';

  if (typeof parsed.title !== 'string' || !parsed.title.trim()) {
    return { ok: false, error: 'El evento debe incluir un título no vacío.' };
  }
  const title = parsed.title.trim();
  if (title.length > 100) {
    return { ok: false, error: 'El título del evento excede los 100 caracteres.' };
  }

  if (typeof parsed.narration !== 'string' || !parsed.narration.trim()) {
    return { ok: false, error: 'El evento debe incluir una narración no vacía.' };
  }
  const narration = parsed.narration.trim();
  const narrationWords = countWords(narration);
  if (narrationWords === 0 || narrationWords > MAX_NARRATION_WORDS) {
    return {
      ok: false,
      error: `La narración debe tener entre 1 y ${MAX_NARRATION_WORDS} palabras (tiene ${narrationWords}).`,
    };
  }

  if (!Array.isArray(parsed.choices) || parsed.choices.length !== 3) {
    return { ok: false, error: 'El evento debe contener exactamente 3 opciones en "choices".' };
  }

  const seenIds = new Set<DmChoiceId>();
  const validatedChoices: DmChoice[] = [];

  for (let i = 0; i < parsed.choices.length; i++) {
    const item = parsed.choices[i];
    if (!isPlainObject(item)) {
      return { ok: false, error: `La opción ${i + 1} debe ser un objeto.` };
    }

    const choiceId = normalizeChoiceId(item.id, i);
    if (!choiceId || seenIds.has(choiceId)) {
      return { ok: false, error: `La opción ${i + 1} tiene un id inválido o duplicado.` };
    }
    seenIds.add(choiceId);

    if (typeof item.label !== 'string' || !item.label.trim()) {
      return { ok: false, error: `La opción "${choiceId}" debe tener un texto "label" no vacío.` };
    }
    const label = item.label.trim();
    if (label.length > 120) {
      return { ok: false, error: `El label de la opción "${choiceId}" excede los 120 caracteres.` };
    }

    if (typeof item.outcomeNarration !== 'string' || !item.outcomeNarration.trim()) {
      return {
        ok: false,
        error: `La opción "${choiceId}" debe tener un "outcomeNarration" no vacío.`,
      };
    }
    const outcomeNarration = item.outcomeNarration.trim();
    const outcomeWords = countWords(outcomeNarration);
    if (outcomeWords === 0 || outcomeWords > MAX_NARRATION_WORDS) {
      return {
        ok: false,
        error: `El desenlace de "${choiceId}" debe tener entre 1 y ${MAX_NARRATION_WORDS} palabras (tiene ${outcomeWords}).`,
      };
    }

    if (!isPlainObject(item.effects)) {
      return { ok: false, error: `La opción "${choiceId}" debe incluir un objeto "effects".` };
    }

    const rawEffects = item.effects;
    if (typeof rawEffects.summary !== 'string' || !rawEffects.summary.trim()) {
      return {
        ok: false,
        error: `Los efectos de "${choiceId}" deben incluir un "summary" no vacío.`,
      };
    }

    const effects: DmEffects = {
      summary: rawEffects.summary.trim().slice(0, 120),
    };

    if (rawEffects.hpDelta !== undefined) {
      if (
        typeof rawEffects.hpDelta !== 'number' ||
        !Number.isInteger(rawEffects.hpDelta) ||
        rawEffects.hpDelta < MIN_HP_DELTA ||
        rawEffects.hpDelta > MAX_HP_DELTA
      ) {
        return {
          ok: false,
          error: `hpDelta en "${choiceId}" debe ser un entero entre ${MIN_HP_DELTA} y ${MAX_HP_DELTA}.`,
        };
      }
      effects.hpDelta = rawEffects.hpDelta;
    }

    if (rawEffects.xpDelta !== undefined) {
      if (
        typeof rawEffects.xpDelta !== 'number' ||
        !Number.isInteger(rawEffects.xpDelta) ||
        rawEffects.xpDelta < MIN_XP_DELTA ||
        rawEffects.xpDelta > MAX_XP_DELTA
      ) {
        return {
          ok: false,
          error: `xpDelta en "${choiceId}" debe ser un entero entre ${MIN_XP_DELTA} y ${MAX_XP_DELTA}.`,
        };
      }
      effects.xpDelta = rawEffects.xpDelta;
    }

    if (rawEffects.goldDelta !== undefined) {
      if (
        typeof rawEffects.goldDelta !== 'number' ||
        !Number.isInteger(rawEffects.goldDelta) ||
        rawEffects.goldDelta < MIN_GOLD_DELTA ||
        rawEffects.goldDelta > MAX_GOLD_DELTA
      ) {
        return {
          ok: false,
          error: `goldDelta en "${choiceId}" debe ser un entero entre ${MIN_GOLD_DELTA} y ${MAX_GOLD_DELTA}.`,
        };
      }
      effects.goldDelta = rawEffects.goldDelta;
    }

    validatedChoices.push({
      id: choiceId,
      label,
      outcomeNarration,
      effects,
    });
  }

  return {
    ok: true,
    value: {
      id: rawId,
      regionId: rawRegionId,
      title,
      narration,
      choices: validatedChoices as [DmChoice, DmChoice, DmChoice],
    },
  };
}

function resolveEventsJsonPath(): string {
  const candidates = [
    path.resolve(__dirname, 'events.json'),
    path.resolve(__dirname, '../src/events.json'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`No se encontró events.json en: ${candidates.join(', ')}`);
}

export function loadFallbackEvents(): DmEvent[] {
  if (cachedFallbackEvents) {
    return cachedFallbackEvents;
  }

  const filePath = resolveEventsJsonPath();
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error('events.json debe contener un arreglo de eventos.');
  }

  const validEvents: DmEvent[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < parsed.length; i++) {
    const res = validateDmEventPayload(parsed[i]);
    if (!res.ok) {
      throw new Error(`Evento inválido en events.json [${i}]: ${res.error}`);
    }
    if (seenIds.has(res.value.id)) {
      throw new Error(`ID duplicado en events.json: ${res.value.id}`);
    }
    seenIds.add(res.value.id);
    validEvents.push(res.value);
  }

  cachedFallbackEvents = validEvents;
  return cachedFallbackEvents;
}

export function pickFallbackEvent(regionId?: string, avoidEventIds: string[] = []): DmEvent {
  const events = loadFallbackEvents();
  if (events.length === 0) {
    throw new Error('El conjunto de eventos de respaldo está vacío.');
  }

  const avoidSet = new Set(avoidEventIds);
  const normalizedRegion = regionId?.trim();

  const regionSpecific = normalizedRegion
    ? events.filter((e) => e.regionId === normalizedRegion)
    : [];
  const generalEvents = events.filter((e) => e.regionId === 'any');

  const candidatePools: DmEvent[][] = [
    regionSpecific.filter((e) => !avoidSet.has(e.id)),
    generalEvents.filter((e) => !avoidSet.has(e.id)),
    regionSpecific,
    generalEvents,
    events.filter((e) => !avoidSet.has(e.id)),
    events,
  ];

  for (const pool of candidatePools) {
    if (pool.length > 0) {
      const idx = Math.floor(Math.random() * pool.length);
      return pool[idx];
    }
  }

  return events[0];
}

function isApiKeyUsable(apiKey: string | undefined): apiKey is string {
  if (!apiKey) return false;
  const trimmed = apiKey.trim();
  if (trimmed.length < 16) return false;

  const lower = trimmed.toLowerCase();
  const placeholderPatterns = [
    'your_',
    'your-',
    'placeholder',
    'changeme',
    'gemini_api_key',
    'replace_me',
    'example',
    'tu_clave',
    'xxxx',
  ];
  return !placeholderPatterns.some((pattern) => lower.includes(pattern));
}

function buildCacheKey(input: GenerateEventInput): string {
  const region = input.regionId.trim() || 'any';
  const coords =
    input.tileX !== undefined && input.tileY !== undefined
      ? `${input.tileX},${input.tileY}`
      : 'any';
  const trigger = (input.triggerContext ?? 'event').trim().toLowerCase().slice(0, 64);
  return `${region}:${coords}:${trigger}`;
}

function getCachedEvent(cacheKey: string, avoidSet: Set<string>): DmEvent | null {
  const entry = eventCache.get(cacheKey);
  if (!entry) return null;

  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    eventCache.delete(cacheKey);
    return null;
  }

  if (avoidSet.has(entry.event.id)) {
    return null;
  }

  entry.hits += 1;
  return entry.event;
}

function setCachedEvent(cacheKey: string, event: DmEvent): void {
  if (eventCache.size >= CACHE_MAX_ENTRIES) {
    const oldestKey = eventCache.keys().next().value;
    if (oldestKey !== undefined) {
      eventCache.delete(oldestKey);
    }
  }
  eventCache.set(cacheKey, {
    event,
    cachedAt: Date.now(),
    hits: 0,
  });
}

export function clearAiDmCache(): void {
  eventCache.clear();
}

export function getAiDmCacheStats(): { size: number; entries: Array<{ key: string; hits: number }> } {
  return {
    size: eventCache.size,
    entries: Array.from(eventCache.entries()).map(([key, entry]) => ({
      key,
      hits: entry.hits,
    })),
  };
}

function buildGeminiPrompt(input: GenerateEventInput): string {
  const regionMeta = REGION_DESCRIPTIONS_ES[input.regionId];
  const regionName = input.regionName ?? regionMeta?.name ?? input.regionId;
  const regionFlavor =
    input.regionSubtitle ??
    regionMeta?.flavor ??
    'Tierras de fantasía medieval llenas de misterio y aventura.';

  const partyDesc =
    input.party && input.party.length > 0
      ? input.party
          .map(
            (m) =>
              `${m.name} (${CLASS_NAME_ES[m.playerClass] ?? m.playerClass}, PV ${m.hp}/${m.maxHp})`
          )
          .join(', ')
      : 'Un grupo de aventureros';

  const triggerDesc = input.triggerContext
    ? `Contexto del encuentro: ${input.triggerContext}.`
    : 'Encuentro aleatorio al explorar una casilla de evento.';

  return [
    'Eres un Director de Juego (Dungeon Master) de un RPG cooperativo de fantasía en español.',
    `Región actual: ${regionName} — ${regionFlavor}`,
    `Grupo: ${partyDesc}.`,
    triggerDesc,
    '',
    'Genera UN único evento breve de rol en formato JSON estricto (sin markdown ni texto adicional).',
    'Reglas estrictas:',
    '- Todo el texto debe estar en español natural y evocador.',
    '- "title": título corto (máx. 60 caracteres).',
    '- "narration": narración de la escena entre 35 y 95 palabras (NUNCA más de 120 palabras).',
    '- "choices": arreglo de EXACTAMENTE 3 opciones con id "a", "b", "c".',
    '- Cada opción debe tener:',
    '  - "id": "a", "b" o "c"',
    '  - "label": acción breve del jugador (máx. 12 palabras)',
    '  - "outcomeNarration": desenlace entre 25 y 85 palabras (NUNCA más de 120 palabras)',
    '  - "effects": objeto con:',
    '    - "hpDelta": entero opcional entre -10 y 10',
    '    - "xpDelta": entero opcional entre 0 y 50',
    '    - "goldDelta": entero opcional entre -20 y 40',
    '    - "summary": resumen breve en español (ej. "+4 PV y +15 EXP")',
    '',
    'Esquema JSON esperado:',
    '{',
    '  "title": "string",',
    '  "narration": "string",',
    '  "choices": [',
    '    {',
    '      "id": "a",',
    '      "label": "string",',
    '      "outcomeNarration": "string",',
    '      "effects": { "hpDelta": 0, "xpDelta": 20, "goldDelta": 0, "summary": "string" }',
    '    },',
    '    { "id": "b", "label": "string", "outcomeNarration": "string", "effects": { "summary": "string" } },',
    '    { "id": "c", "label": "string", "outcomeNarration": "string", "effects": { "summary": "string" } }',
    '  ]',
    '}',
  ].join('\n');
}

async function callGeminiOnce(
  input: GenerateEventInput,
  apiKey: string
): Promise<{ ok: true; event: DmEvent } | { ok: false; reason: string }> {
  const model = (process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL).trim() || DEFAULT_GEMINI_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent`;

  const prompt = buildGeminiPrompt(input);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.9,
          maxOutputTokens: 1024,
          responseMimeType: 'application/json',
        },
      }),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `Gemini request failed/timed out: ${message}` };
  }

  if (!response.ok) {
    return {
      ok: false,
      reason: `Gemini HTTP ${response.status} ${response.statusText}`,
    };
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return { ok: false, reason: 'Gemini HTTP body was not valid JSON' };
  }

  const text = (
    data as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    }
  )?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (typeof text !== 'string' || !text.trim()) {
    return { ok: false, reason: 'Gemini response contained no candidate text' };
  }

  const validation = validateDmEventPayload(text, {
    id: `ai-${input.regionId}-${crypto.randomUUID().slice(0, 6)}`,
    regionId: input.regionId,
  });

  if (!validation.ok) {
    return { ok: false, reason: `Invalid AI payload: ${validation.error}` };
  }

  return { ok: true, event: validation.value };
}

export async function generateEventForParty(
  input: GenerateEventInput
): Promise<GenerateEventResult> {
  const avoidIds = input.avoidEventIds ?? [];
  const avoidSet = new Set(avoidIds);
  const cacheKey = buildCacheKey(input);

  if (!input.bypassCache) {
    const cached = getCachedEvent(cacheKey, avoidSet);
    if (cached) {
      return {
        event: cached,
        source: 'cache',
        aiCallsMade: 0,
      };
    }
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!isApiKeyUsable(apiKey)) {
    return {
      event: pickFallbackEvent(input.regionId, avoidIds),
      source: 'fallback',
      aiCallsMade: 0,
      fallbackReason: 'GEMINI_API_KEY missing or placeholder',
    };
  }

  // Max 1 AI call per event
  const aiResult = await callGeminiOnce(input, apiKey);
  if (aiResult.ok) {
    setCachedEvent(cacheKey, aiResult.event);
    return {
      event: aiResult.event,
      source: 'ai',
      aiCallsMade: 1,
    };
  }

  console.warn(`[aiDm] Falling back to static events (${aiResult.reason})`);
  return {
    event: pickFallbackEvent(input.regionId, avoidIds),
    source: 'fallback',
    aiCallsMade: 1,
    fallbackReason: aiResult.reason,
  };
}
