/**
 * Live / realtime translation models cannot run a one-shot text summary.
 * Map the user's selected translation model onto the closest generateContent /
 * chat-completions model in the same family, using the same API key.
 *
 * Gemini 2.5 Flash is blocked for new API users (retired Oct 2026); anything
 * in the 2.x line is lifted to Gemini 3.5 Flash.
 */

export const GEMINI_DEFAULT_TEXT_MODEL = 'gemini-3.5-flash';
export const OPENAI_DEFAULT_TEXT_MODEL = 'gpt-4.1-mini';

const GEMINI_CAPACITY_FALLBACKS = [
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
] as const;

const OPENAI_CAPACITY_FALLBACKS = [
  'gpt-4o-mini',
  'gpt-4.1-mini',
  'gpt-4o',
] as const;

function stripModelsPrefix(id: string): string {
  return id.replace(/^models\//, '').trim();
}

function isGeminiLiveOrRealtime(id: string): boolean {
  return /live|native-audio|realtime/.test(id);
}

function isRetiredGeminiTextModel(id: string): boolean {
  return /^gemini-2(\.|$)/.test(id) || /^gemini-1(\.|$)/.test(id);
}

/**
 * Pick a generateContent-capable Gemini model from the translation model id.
 *
 * Examples:
 *   gemini-3.5-live-translate-preview → gemini-3.5-flash
 *   gemini-3.1-flash-live-preview     → gemini-3.5-flash
 *   gemini-3.6-flash                  → gemini-3.6-flash (already text)
 *   gemini-2.5-flash-native-audio     → gemini-3.5-flash
 */
export function geminiTextModelForTranslation(translationModel: string | undefined): string {
  const id = stripModelsPrefix((translationModel || '').toLowerCase());
  if (!id) return GEMINI_DEFAULT_TEXT_MODEL;

  if (!isGeminiLiveOrRealtime(id) && id.startsWith('gemini-') && !isRetiredGeminiTextModel(id)) {
    return stripModelsPrefix(translationModel || id);
  }

  const match = id.match(/gemini-(\d+)(?:\.(\d+))?/);
  if (!match) return GEMINI_DEFAULT_TEXT_MODEL;

  const major = Number(match[1]);
  const minor = match[2] !== undefined ? Number(match[2]) : 0;

  if (major > 3 || (major === 3 && minor >= 6)) return 'gemini-3.6-flash';
  if (major === 3 && minor >= 5) return 'gemini-3.5-flash';
  // 3.1 live, 3.0, and the whole 2.x line → current GA Flash.
  return GEMINI_DEFAULT_TEXT_MODEL;
}

function isOpenAIRealtime(id: string): boolean {
  return /realtime|transcribe/.test(id);
}

/**
 * Pick a chat-completions model from the translation model id.
 *
 * Examples:
 *   gpt-realtime-2.1-mini → gpt-4.1-mini
 *   gpt-realtime-2.1      → gpt-4.1
 *   gpt-realtime-translate → gpt-4.1-mini
 *   gpt-4o-mini           → gpt-4o-mini (already chat)
 */
export function openaiTextModelForTranslation(translationModel: string | undefined): string {
  const raw = (translationModel || '').trim();
  const id = raw.toLowerCase();
  if (!id) return OPENAI_DEFAULT_TEXT_MODEL;

  if (!isOpenAIRealtime(id)) return raw;

  if (/mini/.test(id) || /translate/.test(id)) return OPENAI_DEFAULT_TEXT_MODEL;
  return 'gpt-4.1';
}

function uniqueModels(models: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const model of models) {
    const id = model.replace(/^models\//, '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Primary text model plus quieter siblings to try when the first is at
 * capacity ("high demand" / 429 / 503). Lite variants usually have more
 * headroom than the headline Flash/GPT models.
 */
export function geminiFallbackChain(primary: string): string[] {
  return uniqueModels([primary, ...GEMINI_CAPACITY_FALLBACKS]);
}

export function openaiFallbackChain(primary: string): string[] {
  return uniqueModels([primary, ...OPENAI_CAPACITY_FALLBACKS]);
}
