import { describe, it, expect, afterEach, vi } from 'vitest';
import { generateMeetingSummary } from './generateMeetingSummary';
import { MeetingSummaryError } from './types';
import type { NormalizedMessage } from '../../utils/conversationExport';

const messages: NormalizedMessage[] = [{
  id: '1',
  createdAt: Date.UTC(2026, 7, 14, 10, 0, 0),
  source: 'speaker',
  kind: 'original',
  text: 'We should ship on Friday',
}];

const openaiLlm = {
  kind: 'openai' as const,
  apiKey: 'sk-test',
  model: 'gpt-4o-mini',
  apiHost: 'https://api.openai.com',
};

describe('generateMeetingSummary', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  it('throws empty when there are no messages', async () => {
    await expect(generateMeetingSummary({
      messages: [],
      llm: openaiLlm,
      outputLanguage: 'English',
      speakerYou: 'You',
      speakerOther: 'Other',
    })).rejects.toMatchObject({ code: 'empty' });
  });

  it('calls OpenAI chat completions and parses the JSON reply', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              title: 'Ship plan',
              overview: 'Agreed to ship Friday.',
              keyPoints: ['Friday release'],
              decisions: ['Ship Friday'],
              actionItems: [],
            }),
          },
        }],
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { summary } = await generateMeetingSummary({
      messages,
      llm: openaiLlm,
      outputLanguage: 'English',
      speakerYou: 'You',
      speakerOther: 'Other',
    });

    expect(summary.title).toBe('Ship plan');
    expect(summary.decisions).toEqual(['Ship Friday']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect((init as RequestInit).method).toBe('POST');
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages[0].content).toContain('We should ship on Friday');
  });

  it('calls Gemini generateContent when kind is gemini', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain('generativelanguage.googleapis.com');
      expect(url).toContain('gemini-3.5-flash');
      return {
        ok: true,
        json: async () => ({
          candidates: [{
            content: { parts: [{ text: '{"title":"G","overview":"O","keyPoints":[],"decisions":[],"actionItems":[]}' }] },
          }],
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const { summary } = await generateMeetingSummary({
      messages,
      llm: { kind: 'gemini', apiKey: 'gem', model: 'gemini-3.5-flash' },
      outputLanguage: 'Vietnamese',
      speakerYou: 'Bạn',
      speakerOther: 'Người khác',
    });
    expect(summary.title).toBe('G');
  });

  it('falls back to a quieter Gemini model when the primary is at capacity', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const path = String(url);
      if (path.includes('gemini-3.5-flash') && !path.includes('lite')) {
        return {
          ok: false,
          status: 503,
          json: async () => ({
            error: { message: 'This model is currently experiencing high demand. Please try again later.' },
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          candidates: [{
            content: { parts: [{ text: '{"title":"Lite","overview":"O","keyPoints":[],"decisions":[],"actionItems":[]}' }] },
          }],
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMeetingSummary({
      messages,
      llm: {
        kind: 'gemini',
        apiKey: 'gem',
        model: 'gemini-3.5-flash',
        fallbackModels: ['gemini-3.5-flash-lite'],
      },
      outputLanguage: 'English',
      speakerYou: 'You',
      speakerOther: 'Other',
    });

    expect(result.summary.title).toBe('Lite');
    expect(result.model).toBe('gemini-3.5-flash-lite');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('wraps HTTP failures as MeetingSummaryError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ error: { message: 'Incorrect API key' } }),
    })));

    try {
      await generateMeetingSummary({
        messages,
        llm: openaiLlm,
        outputLanguage: 'English',
        speakerYou: 'You',
        speakerOther: 'Other',
      });
      throw new Error('expected failure');
    } catch (error) {
      expect(error).toBeInstanceOf(MeetingSummaryError);
      expect((error as MeetingSummaryError).code).toBe('http');
      expect((error as MeetingSummaryError).message).toBe('Incorrect API key');
    }
  });
});
