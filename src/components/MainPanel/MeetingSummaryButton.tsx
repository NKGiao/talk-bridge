import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import type { ConversationItem } from '../../services/interfaces/IClient';
import {
  copyToClipboard,
  downloadFile,
  formatTimestampForFilename,
  normalizeMessages,
} from '../../utils/conversationExport';
import {
  formatSummaryAsMarkdown,
  generateMeetingSummary,
  MeetingSummaryError,
  resolveSummaryLlm,
  transcriptFingerprint,
  outputLanguageName,
  type MeetingSummary,
  type SummaryLlmConfig,
} from '../../services/meetingSummary';
import {
  useGeminiSettings,
  useNavigateToSettings,
  useOpenAICompatibleSettings,
  useOpenAISettings,
  useOpenAITranslateSettings,
  useProvider,
  useUILanguage,
} from '../../stores/settingsStore';
import { useToast } from '../Toast';
import MeetingSummaryModal, { type MeetingSummaryStatus } from './MeetingSummaryModal';

interface MeetingSummaryButtonProps {
  combinedItems: Array<ConversationItem & {
    source?: string;
    sourceLanguage?: string;
    targetLanguage?: string;
  }>;
}

const MeetingSummaryButton: React.FC<MeetingSummaryButtonProps> = ({ combinedItems }) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const provider = useProvider();
  const uiLanguage = useUILanguage();
  const openai = useOpenAISettings();
  const gemini = useGeminiSettings();
  const openaiCompatible = useOpenAICompatibleSettings();
  const openaiTranslate = useOpenAITranslateSettings();
  const navigateToSettings = useNavigateToSettings();

  const messages = useMemo(() => normalizeMessages(combinedItems), [combinedItems]);
  const hasContent = messages.length > 0;
  const fingerprint = useMemo(() => transcriptFingerprint(messages), [messages]);

  const llm = useMemo(
    () => resolveSummaryLlm({
      provider,
      openai,
      gemini,
      openaiCompatible,
      openaiTranslate,
    }),
    [provider, openai, gemini, openaiCompatible, openaiTranslate],
  );

  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<MeetingSummaryStatus>('idle');
  const [summary, setSummary] = useState<MeetingSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [usedLlm, setUsedLlm] = useState<SummaryLlmConfig | null>(null);
  const cacheRef = useRef<{ fingerprint: string; summary: MeetingSummary; llm: SummaryLlmConfig } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const labels = useMemo(() => ({
    title: t('mainPanel.summary.title', 'Meeting summary'),
    generating: t('mainPanel.summary.generating', 'Generating a summary of this conversation…'),
    noLlm: t(
      'mainPanel.summary.noLlm',
      'Add an OpenAI or Gemini API key in Settings, and select that provider for translation. Meeting summaries use the same AI you translate with.',
    ),
    openSettings: t('mainPanel.summary.openSettings', 'Open provider settings'),
    retry: t('common.retry', 'Retry'),
    copy: t('mainPanel.summary.copy', 'Copy'),
    download: t('mainPanel.summary.download', 'Download .md'),
    regenerate: t('mainPanel.summary.regenerate', 'Regenerate'),
    overview: t('mainPanel.summary.overview', 'Overview'),
    keyPoints: t('mainPanel.summary.keyPoints', 'Key points'),
    decisions: t('mainPanel.summary.decisions', 'Decisions'),
    actionItems: t('mainPanel.summary.actionItems', 'Action items'),
    owner: t('mainPanel.summary.owner', 'Owner'),
    due: t('mainPanel.summary.due', 'Due'),
    emptySection: t('mainPanel.summary.emptySection', 'None captured'),
    generatedWith: t('mainPanel.summary.generatedWith', 'Generated with {{model}}'),
  }), [t]);

  const exportLabels = useMemo(() => ({
    overview: labels.overview,
    keyPoints: labels.keyPoints,
    decisions: labels.decisions,
    actionItems: labels.actionItems,
    owner: labels.owner,
    due: labels.due,
    generatedAt: t('mainPanel.export.headerGenerated', 'Generated'),
    model: t('mainPanel.export.headerModels', 'Models'),
  }), [labels, t]);

  const modelLabel = usedLlm ? `${usedLlm.kind} / ${usedLlm.model}` : null;

  const runGenerate = useCallback(async (force: boolean) => {
    abortRef.current?.abort();

    if (!llm) {
      setStatus('no_llm');
      setSummary(null);
      setUsedLlm(null);
      return;
    }

    if (!force && cacheRef.current && cacheRef.current.fingerprint === fingerprint) {
      setSummary(cacheRef.current.summary);
      setUsedLlm(cacheRef.current.llm);
      setStatus('ready');
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('loading');
    setErrorMessage(null);

    try {
      const result = await generateMeetingSummary({
        messages,
        llm,
        outputLanguage: outputLanguageName(uiLanguage),
        speakerYou: t('mainPanel.export.speakerYou', 'You'),
        speakerOther: t('mainPanel.export.speakerOther', 'Other'),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const used = { ...llm, model: result.model };
      cacheRef.current = { fingerprint, summary: result.summary, llm: used };
      setSummary(result.summary);
      setUsedLlm(used);
      setStatus('ready');
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof MeetingSummaryError && error.code === 'aborted') return;
      const message = error instanceof Error
        ? error.message
        : t('mainPanel.summary.failed', 'Could not generate a summary. Please try again.');
      setErrorMessage(message);
      setStatus('error');
    }
  }, [fingerprint, llm, messages, t, uiLanguage]);

  const handleOpen = useCallback(() => {
    setIsOpen(true);
    if (!llm) {
      setStatus('no_llm');
      setSummary(null);
      setUsedLlm(null);
      return;
    }
    if (cacheRef.current && cacheRef.current.fingerprint === fingerprint) {
      setSummary(cacheRef.current.summary);
      setUsedLlm(cacheRef.current.llm);
      setStatus('ready');
      return;
    }
    setStatus('loading');
    void runGenerate(false);
  }, [fingerprint, llm, runGenerate]);

  const handleClose = useCallback(() => {
    abortRef.current?.abort();
    setIsOpen(false);
  }, []);

  const handleCopy = useCallback(async () => {
    if (!summary || !usedLlm) return;
    const text = formatSummaryAsMarkdown(summary, exportLabels, {
      generatedAt: new Date(),
      modelLabel: `${usedLlm.kind} / ${usedLlm.model}`,
    });
    const ok = await copyToClipboard(text);
    if (ok) {
      showToast(t('mainPanel.summary.copySuccess', 'Summary copied to clipboard'), { variant: 'success' });
    } else {
      showToast(t('mainPanel.summary.copyFailed', 'Failed to copy. Check browser permissions.'), {
        variant: 'error',
        durationMs: 4000,
      });
    }
  }, [exportLabels, showToast, summary, t, usedLlm]);

  const handleDownload = useCallback(() => {
    if (!summary || !usedLlm) return;
    const text = formatSummaryAsMarkdown(summary, exportLabels, {
      generatedAt: new Date(),
      modelLabel: `${usedLlm.kind} / ${usedLlm.model}`,
    });
    downloadFile(
      text,
      `meeting-summary-${formatTimestampForFilename(Date.now())}.md`,
      'text/markdown;charset=utf-8',
    );
  }, [exportLabels, summary, usedLlm]);

  const handleOpenSettings = useCallback(() => {
    handleClose();
    navigateToSettings('provider');
  }, [handleClose, navigateToSettings]);

  return (
    <>
      <button
        className="font-size-btn"
        type="button"
        disabled={!hasContent}
        title={t('mainPanel.toolbar.summarize', 'Summarize meeting')}
        aria-label={t('mainPanel.toolbar.summarize', 'Summarize meeting')}
        onClick={handleOpen}
      >
        <Sparkles size={14} />
      </button>
      <MeetingSummaryModal
        isOpen={isOpen}
        onClose={handleClose}
        status={status}
        summary={summary}
        errorMessage={errorMessage}
        modelLabel={modelLabel}
        onRetry={() => { void runGenerate(true); }}
        onCopy={() => { void handleCopy(); }}
        onDownload={handleDownload}
        onOpenSettings={handleOpenSettings}
        labels={labels}
      />
    </>
  );
};

export default MeetingSummaryButton;
