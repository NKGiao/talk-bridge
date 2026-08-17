import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MeetingSummaryModal from './MeetingSummaryModal';
import type { MeetingSummary } from '../../services/meetingSummary';

const labels = {
  title: 'Meeting summary',
  generating: 'Generating…',
  noLlm: 'Add an API key',
  openSettings: 'Open provider settings',
  retry: 'Retry',
  copy: 'Copy',
  download: 'Download .md',
  regenerate: 'Regenerate',
  overview: 'Overview',
  keyPoints: 'Key points',
  decisions: 'Decisions',
  actionItems: 'Action items',
  owner: 'Owner',
  due: 'Due',
  emptySection: 'None captured',
  generatedWith: 'Generated with {{model}}',
};

const summary: MeetingSummary = {
  title: 'Q3 planning',
  overview: 'Reviewed the launch plan.',
  keyPoints: ['Need more QA'],
  decisions: ['Ship next Friday'],
  actionItems: [{ text: 'Draft the recap', owner: 'An', due: 'Mon' }],
};

describe('MeetingSummaryModal', () => {
  it('shows a loading state', () => {
    render(
      <MeetingSummaryModal
        isOpen
        onClose={() => {}}
        status="loading"
        summary={null}
        errorMessage={null}
        modelLabel={null}
        onRetry={() => {}}
        onCopy={() => {}}
        onDownload={() => {}}
        onOpenSettings={() => {}}
        labels={labels}
      />,
    );
    expect(screen.getByText('Generating…')).toBeInTheDocument();
  });

  it('renders a ready summary and fires copy', () => {
    let copied = false;
    render(
      <MeetingSummaryModal
        isOpen
        onClose={() => {}}
        status="ready"
        summary={summary}
        errorMessage={null}
        modelLabel="openai / gpt-4o-mini"
        onRetry={() => {}}
        onCopy={() => { copied = true; }}
        onDownload={() => {}}
        onOpenSettings={() => {}}
        labels={labels}
      />,
    );
    expect(screen.getByText('Q3 planning')).toBeInTheDocument();
    expect(screen.getByText('Ship next Friday')).toBeInTheDocument();
    expect(screen.getByText(/Owner: An/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Copy'));
    expect(copied).toBe(true);
  });

  it('offers settings when no LLM is configured', () => {
    let opened = false;
    render(
      <MeetingSummaryModal
        isOpen
        onClose={() => {}}
        status="no_llm"
        summary={null}
        errorMessage={null}
        modelLabel={null}
        onRetry={() => {}}
        onCopy={() => {}}
        onDownload={() => {}}
        onOpenSettings={() => { opened = true; }}
        labels={labels}
      />,
    );
    fireEvent.click(screen.getByText('Open provider settings'));
    expect(opened).toBe(true);
  });
});
