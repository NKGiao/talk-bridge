import type { MeetingSummary } from './types';

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
}

function asActionItems(value: unknown): MeetingSummary['actionItems'] {
  if (!Array.isArray(value)) return [];
  const items: MeetingSummary['actionItems'] = [];
  for (const raw of value) {
    if (typeof raw === 'string') {
      const text = raw.trim();
      if (text) items.push({ text });
      continue;
    }
    if (!raw || typeof raw !== 'object') continue;
    const rec = raw as Record<string, unknown>;
    const text = asNonEmptyString(rec.text) ?? asNonEmptyString(rec.task) ?? asNonEmptyString(rec.action);
    if (!text) continue;
    items.push({
      text,
      owner: asNonEmptyString(rec.owner) ?? asNonEmptyString(rec.assignee),
      due: asNonEmptyString(rec.due) ?? asNonEmptyString(rec.deadline),
    });
  }
  return items;
}

/** Pull a JSON object out of a model reply that may be wrapped in fences. */
export function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : trimmed).trim();

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new Error('Response was not valid JSON');
  }
}

export function parseMeetingSummary(raw: string): MeetingSummary {
  const parsed = extractJsonObject(raw);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Summary JSON was not an object');
  }
  const rec = parsed as Record<string, unknown>;
  const title = asNonEmptyString(rec.title) ?? 'Meeting summary';
  return {
    title,
    overview: asNonEmptyString(rec.overview) ?? '',
    keyPoints: asStringArray(rec.keyPoints ?? rec.key_points),
    decisions: asStringArray(rec.decisions),
    actionItems: asActionItems(rec.actionItems ?? rec.action_items),
  };
}

export interface SummaryExportLabels {
  overview: string;
  keyPoints: string;
  decisions: string;
  actionItems: string;
  owner: string;
  due: string;
  generatedAt: string;
  model: string;
}

export function formatSummaryAsMarkdown(
  summary: MeetingSummary,
  labels: SummaryExportLabels,
  meta: { generatedAt: Date; modelLabel: string },
): string {
  const lines: string[] = [
    `# ${summary.title}`,
    '',
    `${labels.generatedAt}: ${meta.generatedAt.toISOString()}`,
    `${labels.model}: ${meta.modelLabel}`,
    '',
    `## ${labels.overview}`,
    '',
    summary.overview || '—',
    '',
    `## ${labels.keyPoints}`,
    '',
  ];

  if (summary.keyPoints.length === 0) {
    lines.push('—');
  } else {
    for (const point of summary.keyPoints) {
      lines.push(`- ${point}`);
    }
  }

  lines.push('', `## ${labels.decisions}`, '');
  if (summary.decisions.length === 0) {
    lines.push('—');
  } else {
    for (const decision of summary.decisions) {
      lines.push(`- ${decision}`);
    }
  }

  lines.push('', `## ${labels.actionItems}`, '');
  if (summary.actionItems.length === 0) {
    lines.push('—');
  } else {
    for (const item of summary.actionItems) {
      const extras: string[] = [];
      if (item.owner) extras.push(`${labels.owner}: ${item.owner}`);
      if (item.due) extras.push(`${labels.due}: ${item.due}`);
      const suffix = extras.length > 0 ? ` (${extras.join(', ')})` : '';
      lines.push(`- ${item.text}${suffix}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

export function formatSummaryAsTxt(
  summary: MeetingSummary,
  labels: SummaryExportLabels,
  meta: { generatedAt: Date; modelLabel: string },
): string {
  return formatSummaryAsMarkdown(summary, labels, meta);
}
