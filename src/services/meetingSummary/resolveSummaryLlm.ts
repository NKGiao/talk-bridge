import { Provider } from '../../types/Provider';
import {
  DEFAULT_OPENAI_HOST,
  type SummaryLlmConfig,
  type SummaryLlmSources,
} from './types';
import {
  geminiFallbackChain,
  geminiTextModelForTranslation,
  openaiFallbackChain,
  openaiTextModelForTranslation,
} from './summaryModel';

function hasKey(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function openaiConfig(
  apiKey: string,
  translationModel: string | undefined,
  apiHost?: string,
): SummaryLlmConfig {
  const host = (apiHost || DEFAULT_OPENAI_HOST).replace(/\/$/, '');
  const model = openaiTextModelForTranslation(translationModel);
  const chain = openaiFallbackChain(model);
  return {
    kind: 'openai',
    apiKey: apiKey.trim(),
    model,
    apiHost: host,
    fallbackModels: chain.slice(1),
  };
}

function geminiConfig(apiKey: string, translationModel: string | undefined): SummaryLlmConfig {
  const model = geminiTextModelForTranslation(translationModel);
  const chain = geminiFallbackChain(model);
  return {
    kind: 'gemini',
    apiKey: apiKey.trim(),
    model,
    fallbackModels: chain.slice(1),
  };
}

/**
 * Use the currently selected translation provider (same API key, closest
 * text model in that family) to summarize. Live/realtime translation models
 * are mapped to a generateContent / chat model because they cannot run a
 * one-shot text prompt.
 *
 * Providers with no chat API (Palabra, Soniox, Volcengine, local, Zoom,
 * Kizuna-managed) return null — we do not silently borrow another provider's
 * leftover key.
 */
export function resolveSummaryLlm(sources: SummaryLlmSources): SummaryLlmConfig | null {
  switch (sources.provider) {
    case Provider.OPENAI:
      return hasKey(sources.openai?.apiKey)
        ? openaiConfig(sources.openai.apiKey, sources.openai?.model)
        : null;
    case Provider.GEMINI:
      return hasKey(sources.gemini?.apiKey)
        ? geminiConfig(sources.gemini.apiKey, sources.gemini?.model)
        : null;
    case Provider.OPENAI_COMPATIBLE:
      return hasKey(sources.openaiCompatible?.apiKey)
        && hasKey(sources.openaiCompatible?.customEndpoint)
        ? openaiConfig(
            sources.openaiCompatible.apiKey,
            sources.openaiCompatible?.model,
            sources.openaiCompatible.customEndpoint,
          )
        : null;
    case Provider.OPENAI_TRANSLATE:
      return hasKey(sources.openaiTranslate?.apiKey)
        ? openaiConfig(sources.openaiTranslate.apiKey, 'gpt-realtime-translate')
        : null;
    default:
      return null;
  }
}
