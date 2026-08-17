import { describe, it, expect } from 'vitest';
import type { NormalizedMessage } from '../../utils/conversationExport';
import { buildTranscript, transcriptFingerprint } from './buildTranscript';
import { extractJsonObject, formatSummaryAsMarkdown, parseMeetingSummary } from './formatSummary';
import { resolveSummaryLlm } from './resolveSummaryLlm';
import { geminiFallbackChain, geminiTextModelForTranslation, openaiTextModelForTranslation } from './summaryModel';
import { Provider } from '../../types/Provider';
import type { MeetingSummary } from './types';

function msg(over: Partial<NormalizedMessage>): NormalizedMessage {
  return {
    id: over.id ?? 'm1',
    createdAt: over.createdAt ?? Date.UTC(2026, 7, 14, 10, 32, 1),
    source: over.source ?? 'speaker',
    kind: over.kind ?? 'original',
    text: over.text ?? 'hello',
    sourceLanguage: over.sourceLanguage,
    targetLanguage: over.targetLanguage,
  };
}

const labels = {
  you: 'You',
  other: 'Other',
  original: 'original',
  translation: 'translation',
};

describe('buildTranscript', () => {
  it('pairs consecutive original + translation from the same speaker', () => {
    const { text, utteranceCount, truncated } = buildTranscript([
      msg({ id: '1', kind: 'original', text: 'Xin chào', createdAt: Date.UTC(2026, 7, 14, 3, 0, 0) }),
      msg({ id: '2', kind: 'translation', text: 'Hello', createdAt: Date.UTC(2026, 7, 14, 3, 0, 1) }),
      msg({
        id: '3',
        source: 'participant',
        kind: 'original',
        text: 'Hi there',
        createdAt: Date.UTC(2026, 7, 14, 3, 0, 5),
      }),
    ], labels);

    expect(truncated).toBe(false);
    expect(utteranceCount).toBe(2);
    expect(text).toContain('You (original): Xin chào');
    expect(text).toContain('You (translation): Hello');
    expect(text).toContain('Other (original): Hi there');
  });

  it('truncates from the start when over the character budget', () => {
    const messages: NormalizedMessage[] = [];
    for (let i = 0; i < 20; i += 1) {
      messages.push(msg({
        id: `m${i}`,
        text: `line-${i}-${'x'.repeat(40)}`,
        createdAt: 1_700_000_000_000 + i * 1000,
      }));
    }
    const { text, truncated } = buildTranscript(messages, labels, 200);
    expect(truncated).toBe(true);
    expect(text.startsWith('[Earlier conversation truncated]')).toBe(true);
    expect(text).toContain('line-19');
    expect(text).not.toContain('line-0-');
  });
});

describe('outputLanguageName', () => {
  it('maps UI language codes to LLM-facing names', async () => {
    const { outputLanguageName } = await import('./outputLanguage');
    expect(outputLanguageName('vi')).toBe('Vietnamese');
    expect(outputLanguageName('zh_CN')).toBe('Simplified Chinese');
    expect(outputLanguageName('en-US')).toBe('English');
    expect(outputLanguageName(undefined)).toBe('English');
  });
});

describe('transcriptFingerprint', () => {
  it('changes when a new message arrives', () => {
    const a = [msg({ id: 'a', text: 'one' })];
    const b = [msg({ id: 'a', text: 'one' }), msg({ id: 'b', text: 'two' })];
    expect(transcriptFingerprint(a)).not.toBe(transcriptFingerprint(b));
  });
});

describe('geminiTextModelForTranslation', () => {
  it('maps live translate models onto the matching Flash text model', () => {
    expect(geminiTextModelForTranslation('gemini-3.5-live-translate-preview')).toBe('gemini-3.5-flash');
    expect(geminiTextModelForTranslation('gemini-3.1-flash-live-preview')).toBe('gemini-3.5-flash');
    expect(geminiTextModelForTranslation('gemini-3.6-flash-live')).toBe('gemini-3.6-flash');
  });

  it('does not keep retired 2.5 Flash for new-user keys', () => {
    expect(geminiTextModelForTranslation('gemini-2.5-flash')).toBe('gemini-3.5-flash');
    expect(geminiTextModelForTranslation('gemini-2.5-flash-native-audio-latest')).toBe('gemini-3.5-flash');
  });

  it('keeps a current text model as-is', () => {
    expect(geminiTextModelForTranslation('gemini-3.5-flash')).toBe('gemini-3.5-flash');
    expect(geminiTextModelForTranslation('gemini-3.6-flash')).toBe('gemini-3.6-flash');
  });

  it('tries lite / sibling Flash models after the primary when capacity is tight', () => {
    expect(geminiFallbackChain('gemini-3.5-flash')).toEqual([
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.6-flash',
      'gemini-3.1-flash-lite',
    ]);
  });
});

describe('openaiTextModelForTranslation', () => {
  it('maps realtime translation models onto chat completions models', () => {
    expect(openaiTextModelForTranslation('gpt-realtime-2.1-mini')).toBe('gpt-4.1-mini');
    expect(openaiTextModelForTranslation('gpt-realtime-2.1')).toBe('gpt-4.1');
    expect(openaiTextModelForTranslation('gpt-realtime-translate')).toBe('gpt-4.1-mini');
  });

  it('keeps a chat model as-is', () => {
    expect(openaiTextModelForTranslation('gpt-4o')).toBe('gpt-4o');
  });
});

describe('resolveSummaryLlm', () => {
  it('uses the current OpenAI key and maps the realtime translation model to a chat model', () => {
    const llm = resolveSummaryLlm({
      provider: Provider.OPENAI,
      openai: { apiKey: 'sk-openai', model: 'gpt-realtime-2.1-mini' },
      gemini: { apiKey: 'gem-key', model: 'gemini-3.5-live-translate-preview' },
    });
    expect(llm).toMatchObject({ kind: 'openai', apiKey: 'sk-openai', model: 'gpt-4.1-mini' });
  });

  it('uses the current Gemini key and maps the live translation model to a text Flash model', () => {
    const llm = resolveSummaryLlm({
      provider: Provider.GEMINI,
      gemini: { apiKey: 'gem-key', model: 'gemini-3.5-live-translate-preview' },
    });
    expect(llm).toMatchObject({ kind: 'gemini', apiKey: 'gem-key', model: 'gemini-3.5-flash' });
  });

  it('does not borrow another provider when the translation provider has no chat API', () => {
    expect(resolveSummaryLlm({
      provider: Provider.SONIOX,
      openai: { apiKey: 'sk-openai' },
      gemini: { apiKey: 'gem-key' },
    })).toBeNull();
  });

  it('requires both a key and endpoint for OpenAI Compatible', () => {
    expect(resolveSummaryLlm({
      provider: Provider.OPENAI_COMPATIBLE,
      openaiCompatible: { apiKey: 'sk-x', customEndpoint: '' },
    })).toBeNull();

    expect(resolveSummaryLlm({
      provider: Provider.OPENAI_COMPATIBLE,
      openaiCompatible: { apiKey: 'sk-x', customEndpoint: 'https://proxy.example.com', model: 'gpt-4o' },
    })).toMatchObject({
      kind: 'openai',
      apiHost: 'https://proxy.example.com',
      model: 'gpt-4o',
    });
  });

  it('returns null when no chat-capable key is configured', () => {
    expect(resolveSummaryLlm({ provider: Provider.SONIOX })).toBeNull();
  });
});

describe('parseMeetingSummary', () => {
  it('accepts fenced JSON and coerces missing arrays', () => {
    const summary = parseMeetingSummary(`
\`\`\`json
{"title":"Q3 sync","overview":"We reviewed the plan."}
\`\`\`
`);
    expect(summary.title).toBe('Q3 sync');
    expect(summary.overview).toBe('We reviewed the plan.');
    expect(summary.keyPoints).toEqual([]);
    expect(summary.actionItems).toEqual([]);
  });

  it('maps string action items and owner/due fields', () => {
    const summary = parseMeetingSummary(JSON.stringify({
      title: 'Standup',
      overview: 'Daily',
      keyPoints: ['Velocity'],
      decisions: ['Ship Friday'],
      actionItems: [
        'Write the notes',
        { text: 'Send proposal', owner: 'An', due: 'Friday' },
      ],
    }));
    expect(summary.actionItems).toEqual([
      { text: 'Write the notes' },
      { text: 'Send proposal', owner: 'An', due: 'Friday' },
    ]);
  });
});

describe('extractJsonObject', () => {
  it('recovers a JSON object buried in prose', () => {
    const parsed = extractJsonObject('Here you go:\n{"title":"Hi","overview":"Ok"}\nThanks');
    expect(parsed).toEqual({ title: 'Hi', overview: 'Ok' });
  });
});

describe('formatSummaryAsMarkdown', () => {
  it('renders sections and action-item metadata', () => {
    const summary: MeetingSummary = {
      title: 'Kickoff',
      overview: 'Project start.',
      keyPoints: ['Scope'],
      decisions: ['Use OpenAI'],
      actionItems: [{ text: 'Draft spec', owner: 'Giao', due: 'Mon' }],
    };
    const md = formatSummaryAsMarkdown(summary, {
      overview: 'Overview',
      keyPoints: 'Key points',
      decisions: 'Decisions',
      actionItems: 'Action items',
      owner: 'Owner',
      due: 'Due',
      generatedAt: 'Generated',
      model: 'Model',
    }, { generatedAt: new Date('2026-08-14T00:00:00.000Z'), modelLabel: 'openai / gpt-4o-mini' });

    expect(md).toContain('# Kickoff');
    expect(md).toContain('- Draft spec (Owner: Giao, Due: Mon)');
    expect(md).toContain('openai / gpt-4o-mini');
  });
});
