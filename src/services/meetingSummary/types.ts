import type { NormalizedMessage } from '../../utils/conversationExport';

export type SummaryLlmKind = 'openai' | 'gemini';

export interface SummaryLlmConfig {
  kind: SummaryLlmKind;
  apiKey: string;
  model: string;
  /** OpenAI-compatible base host, e.g. https://api.openai.com (no trailing slash). */
  apiHost?: string;
  /** Extra models to try (same provider/key) when the primary is at capacity. */
  fallbackModels?: string[];
}

/** Credential slices the resolver inspects. Store-free so it is easy to test. */
export interface SummaryLlmSources {
  /** Currently selected translation provider id. */
  provider: string;
  openai?: { apiKey?: string; model?: string };
  gemini?: { apiKey?: string; model?: string };
  openaiCompatible?: { apiKey?: string; customEndpoint?: string; model?: string };
  openaiTranslate?: { apiKey?: string };
}

export interface MeetingActionItem {
  text: string;
  owner?: string;
  due?: string;
}

export interface MeetingSummary {
  title: string;
  overview: string;
  keyPoints: string[];
  decisions: string[];
  actionItems: MeetingActionItem[];
}

export interface GenerateMeetingSummaryInput {
  messages: NormalizedMessage[];
  llm: SummaryLlmConfig;
  /** Human-readable language name the model should write in, e.g. "Vietnamese". */
  outputLanguage: string;
  speakerYou: string;
  speakerOther: string;
  signal?: AbortSignal;
}

export interface GenerateMeetingSummaryResult {
  summary: MeetingSummary;
  /** Model that actually produced the summary (may differ from the primary after a capacity fallback). */
  model: string;
}

export type MeetingSummaryErrorCode =
  | 'no_llm'
  | 'empty'
  | 'http'
  | 'parse'
  | 'aborted';

export class MeetingSummaryError extends Error {
  readonly code: MeetingSummaryErrorCode;
  readonly httpStatus?: number;

  constructor(code: MeetingSummaryErrorCode, message: string, httpStatus?: number) {
    super(message);
    this.name = 'MeetingSummaryError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export const DEFAULT_OPENAI_HOST = 'https://api.openai.com';
export const MAX_TRANSCRIPT_CHARS = 80_000;
export const SUMMARY_TIMEOUT_MS = 60_000;
