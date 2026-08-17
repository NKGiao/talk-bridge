import { buildTranscript } from './buildTranscript';
import { parseMeetingSummary } from './formatSummary';
import {
  MeetingSummaryError,
  SUMMARY_TIMEOUT_MS,
  type GenerateMeetingSummaryInput,
  type GenerateMeetingSummaryResult,
  type SummaryLlmConfig,
} from './types';

function buildPrompt(args: {
  transcript: string;
  truncated: boolean;
  outputLanguage: string;
}): string {
  const truncationNote = args.truncated
    ? '\nNote: the start of a long transcript was truncated; summarize what remains.\n'
    : '';

  return `You are a meeting secretary. Read the bilingual conversation transcript below and produce a structured meeting summary.

Write EVERY field in ${args.outputLanguage}. Be faithful to the transcript — do not invent attendees, decisions, or action items that were not discussed. If a section has nothing to report, use an empty string or empty array.

Return ONLY a JSON object with this shape:
{
  "title": "short meeting title",
  "overview": "2-4 sentence overview of what was discussed",
  "keyPoints": ["important discussion points"],
  "decisions": ["decisions that were made"],
  "actionItems": [{ "text": "task", "owner": "person if named, else omit", "due": "deadline if mentioned, else omit" }]
}
${truncationNote}
Transcript:
${args.transcript}
`;
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

export function isCapacityError(error: MeetingSummaryError): boolean {
  if (error.httpStatus === 429 || error.httpStatus === 503) return true;
  const message = error.message.toLowerCase();
  return /high demand|overloaded|unavailable|resource.?exhausted|try again later|capacity|temporarily/.test(message);
}

function withTimeout(
  parent: AbortSignal | undefined,
  ms: number,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const onAbort = () => controller.abort();
  if (parent) {
    if (parent.aborted) {
      controller.abort();
    } else {
      parent.addEventListener('abort', onAbort, { once: true });
    }
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      parent?.removeEventListener('abort', onAbort);
    },
  };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new MeetingSummaryError('aborted', 'Summary generation was cancelled');
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json() as {
      error?: { message?: string };
      message?: string;
    };
    return body.error?.message || body.message || response.statusText;
  } catch {
    return response.statusText || `HTTP ${response.status}`;
  }
}

async function callOpenAI(llm: SummaryLlmConfig, prompt: string, signal?: AbortSignal): Promise<string> {
  const host = (llm.apiHost || 'https://api.openai.com').replace(/\/$/, '');
  const response = await fetch(`${host}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${llm.apiKey}`,
    },
    body: JSON.stringify({
      model: llm.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    }),
    signal,
  });

  if (!response.ok) {
    throw new MeetingSummaryError('http', await readErrorMessage(response), response.status);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new MeetingSummaryError('parse', 'The model returned an empty reply');
  }
  return content;
}

async function callGemini(llm: SummaryLlmConfig, prompt: string, signal?: AbortSignal): Promise<string> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(llm.model.replace(/^models\//, ''))}:generateContent` +
    `?key=${encodeURIComponent(llm.apiKey)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: 'application/json',
      },
    }),
    signal,
  });

  if (!response.ok) {
    throw new MeetingSummaryError('http', await readErrorMessage(response), response.status);
  }

  const data = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) {
    throw new MeetingSummaryError('parse', 'The model returned an empty reply');
  }
  return content;
}

async function callWithFallbacks(
  llm: SummaryLlmConfig,
  prompt: string,
  signal?: AbortSignal,
): Promise<{ raw: string; model: string }> {
  const models = [llm.model, ...(llm.fallbackModels ?? [])].filter(Boolean);
  let lastError: MeetingSummaryError | undefined;

  for (let i = 0; i < models.length; i += 1) {
    throwIfAborted(signal);
    const model = models[i];
    try {
      const raw = llm.kind === 'gemini'
        ? await callGemini({ ...llm, model }, prompt, signal)
        : await callOpenAI({ ...llm, model }, prompt, signal);
      if (i > 0) {
        console.info(`[GM MeetMind] Meeting summary used fallback model ${model} after ${llm.model} was at capacity`);
      }
      return { raw, model };
    } catch (error) {
      if (error instanceof MeetingSummaryError && error.code === 'aborted') throw error;
      if (isAbortError(error)) {
        throw new MeetingSummaryError('aborted', 'Summary generation was cancelled');
      }
      if (error instanceof MeetingSummaryError && error.code === 'http' && isCapacityError(error) && i < models.length - 1) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  throw lastError ?? new MeetingSummaryError('http', 'All summarization models were at capacity');
}

export async function generateMeetingSummary(
  input: GenerateMeetingSummaryInput,
): Promise<GenerateMeetingSummaryResult> {
  if (input.messages.length === 0) {
    throw new MeetingSummaryError('empty', 'There is no conversation to summarize');
  }

  throwIfAborted(input.signal);

  const { text, truncated } = buildTranscript(input.messages, {
    you: input.speakerYou,
    other: input.speakerOther,
    original: 'original',
    translation: 'translation',
  });

  const prompt = buildPrompt({
    transcript: text,
    truncated,
    outputLanguage: input.outputLanguage,
  });

  const { signal, cleanup } = withTimeout(input.signal, SUMMARY_TIMEOUT_MS);

  try {
    const { raw, model } = await callWithFallbacks(input.llm, prompt, signal);
    try {
      return { summary: parseMeetingSummary(raw), model };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not parse the summary';
      throw new MeetingSummaryError('parse', message);
    }
  } catch (error) {
    if (error instanceof MeetingSummaryError) throw error;
    if (isAbortError(error)) {
      throw new MeetingSummaryError('aborted', 'Summary generation was cancelled');
    }
    const message = error instanceof Error ? error.message : 'Failed to call the summarization model';
    throw new MeetingSummaryError('http', message);
  } finally {
    cleanup();
  }
}
