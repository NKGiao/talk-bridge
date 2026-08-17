import React from 'react';
import { Copy, Download, Loader, RefreshCw, Sparkles } from 'lucide-react';
import Modal from '../Modal/Modal';
import type { MeetingSummary } from '../../services/meetingSummary';
import './MeetingSummaryModal.scss';

export type MeetingSummaryStatus = 'idle' | 'loading' | 'ready' | 'error' | 'no_llm';

interface MeetingSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: MeetingSummaryStatus;
  summary: MeetingSummary | null;
  errorMessage: string | null;
  modelLabel: string | null;
  onRetry: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onOpenSettings: () => void;
  labels: {
    title: string;
    generating: string;
    noLlm: string;
    openSettings: string;
    retry: string;
    copy: string;
    download: string;
    regenerate: string;
    overview: string;
    keyPoints: string;
    decisions: string;
    actionItems: string;
    owner: string;
    due: string;
    emptySection: string;
    generatedWith: string;
  };
}

const MeetingSummaryModal: React.FC<MeetingSummaryModalProps> = ({
  isOpen,
  onClose,
  status,
  summary,
  errorMessage,
  modelLabel,
  onRetry,
  onCopy,
  onDownload,
  onOpenSettings,
  labels,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={labels.title}>
      <div className="meeting-summary">
        {status === 'loading' && (
          <div className="meeting-summary__status" role="status">
            <Loader size={22} className="meeting-summary__spinner" />
            <p>{labels.generating}</p>
          </div>
        )}

        {status === 'no_llm' && (
          <div className="meeting-summary__status">
            <Sparkles size={22} />
            <p>{labels.noLlm}</p>
            <button type="button" className="meeting-summary__primary" onClick={onOpenSettings}>
              {labels.openSettings}
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="meeting-summary__status meeting-summary__status--error">
            <p>{errorMessage}</p>
            <button type="button" className="meeting-summary__primary" onClick={onRetry}>
              {labels.retry}
            </button>
          </div>
        )}

        {status === 'ready' && summary && (
          <>
            <h4 className="meeting-summary__heading">{summary.title}</h4>
            {modelLabel && (
              <p className="meeting-summary__meta">{labels.generatedWith.replace('{{model}}', modelLabel)}</p>
            )}

            <section className="meeting-summary__section">
              <h5>{labels.overview}</h5>
              <p>{summary.overview || labels.emptySection}</p>
            </section>

            <section className="meeting-summary__section">
              <h5>{labels.keyPoints}</h5>
              <SummaryList items={summary.keyPoints} empty={labels.emptySection} />
            </section>

            <section className="meeting-summary__section">
              <h5>{labels.decisions}</h5>
              <SummaryList items={summary.decisions} empty={labels.emptySection} />
            </section>

            <section className="meeting-summary__section">
              <h5>{labels.actionItems}</h5>
              {summary.actionItems.length === 0 ? (
                <p className="meeting-summary__empty">{labels.emptySection}</p>
              ) : (
                <ul>
                  {summary.actionItems.map((item, idx) => (
                    <li key={`${item.text}-${idx}`}>
                      <span>{item.text}</span>
                      {(item.owner || item.due) && (
                        <span className="meeting-summary__item-meta">
                          {item.owner ? `${labels.owner}: ${item.owner}` : ''}
                          {item.owner && item.due ? ' · ' : ''}
                          {item.due ? `${labels.due}: ${item.due}` : ''}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div className="meeting-summary__actions">
              <button type="button" className="meeting-summary__secondary" onClick={onCopy}>
                <Copy size={14} />
                {labels.copy}
              </button>
              <button type="button" className="meeting-summary__secondary" onClick={onDownload}>
                <Download size={14} />
                {labels.download}
              </button>
              <button type="button" className="meeting-summary__secondary" onClick={onRetry}>
                <RefreshCw size={14} />
                {labels.regenerate}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

function SummaryList({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) {
    return <p className="meeting-summary__empty">{empty}</p>;
  }
  return (
    <ul>
      {items.map((item, idx) => (
        <li key={`${idx}-${item.slice(0, 24)}`}>{item}</li>
      ))}
    </ul>
  );
}

export default MeetingSummaryModal;
