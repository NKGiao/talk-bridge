import type { NormalizedMessage } from '../../utils/conversationExport';
import { MAX_TRANSCRIPT_CHARS } from './types';

export interface TranscriptLabels {
  you: string;
  other: string;
  original: string;
  translation: string;
}

export interface BuiltTranscript {
  text: string;
  truncated: boolean;
  utteranceCount: number;
}

function padTime(n: number): string {
  return String(n).padStart(2, '0');
}

function formatLocalTime(ts: number): string {
  const d = new Date(ts);
  return `${padTime(d.getHours())}:${padTime(d.getMinutes())}:${padTime(d.getSeconds())}`;
}

function speakerLabel(source: NormalizedMessage['source'], labels: TranscriptLabels): string {
  return source === 'speaker' ? labels.you : labels.other;
}

/**
 * Format conversation messages into a compact transcript for the summarizer.
 * Consecutive original + translation from the same speaker are paired onto
 * two lines so the model sees both languages together.
 */
export function buildTranscript(
  messages: NormalizedMessage[],
  labels: TranscriptLabels,
  maxChars: number = MAX_TRANSCRIPT_CHARS,
): BuiltTranscript {
  const lines: string[] = [];
  let i = 0;
  let utteranceCount = 0;

  while (i < messages.length) {
    const current = messages[i];
    const next = messages[i + 1];
    const time = formatLocalTime(current.createdAt);
    const who = speakerLabel(current.source, labels);

    const paired =
      next &&
      next.source === current.source &&
      current.kind === 'original' &&
      next.kind === 'translation';

    if (paired) {
      lines.push(`[${time}] ${who} (${labels.original}): ${current.text}`);
      lines.push(`[${formatLocalTime(next.createdAt)}] ${who} (${labels.translation}): ${next.text}`);
      i += 2;
    } else {
      const kind = current.kind === 'translation' ? labels.translation : labels.original;
      lines.push(`[${time}] ${who} (${kind}): ${current.text}`);
      i += 1;
    }
    utteranceCount += 1;
  }

  let text = lines.join('\n');
  let truncated = false;

  if (text.length > maxChars) {
    truncated = true;
    text = text.slice(text.length - maxChars);
    const firstNewline = text.indexOf('\n');
    if (firstNewline > 0) {
      text = text.slice(firstNewline + 1);
    }
    text = `[Earlier conversation truncated]\n${text}`;
  }

  return { text, truncated, utteranceCount };
}

/** Stable fingerprint so the UI can reuse a cached summary for the same transcript. */
export function transcriptFingerprint(messages: NormalizedMessage[]): string {
  if (messages.length === 0) return '';
  const last = messages[messages.length - 1];
  return `${messages.length}:${messages[0].id}:${last.id}:${last.text.length}`;
}
