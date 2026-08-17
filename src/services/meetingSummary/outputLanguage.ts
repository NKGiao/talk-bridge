const OUTPUT_LANGUAGE_NAMES: Record<string, string> = {
  ar: 'Arabic',
  bn: 'Bengali',
  de: 'German',
  en: 'English',
  es: 'Spanish',
  fa: 'Persian',
  fi: 'Finnish',
  fil: 'Filipino',
  fr: 'French',
  he: 'Hebrew',
  hi: 'Hindi',
  id: 'Indonesian',
  it: 'Italian',
  ja: 'Japanese',
  ko: 'Korean',
  ms: 'Malay',
  nl: 'Dutch',
  pl: 'Polish',
  pt_BR: 'Brazilian Portuguese',
  pt_PT: 'Portuguese',
  ru: 'Russian',
  sv: 'Swedish',
  ta: 'Tamil',
  te: 'Telugu',
  th: 'Thai',
  tr: 'Turkish',
  uk: 'Ukrainian',
  vi: 'Vietnamese',
  zh_CN: 'Simplified Chinese',
  zh_TW: 'Traditional Chinese',
};

/** Map a UI language code (i18n / settings.uiLanguage) to a name the LLM understands. */
export function outputLanguageName(uiLanguage: string | undefined): string {
  if (!uiLanguage) return 'English';
  if (OUTPUT_LANGUAGE_NAMES[uiLanguage]) return OUTPUT_LANGUAGE_NAMES[uiLanguage];
  const base = uiLanguage.split(/[-_]/)[0];
  return OUTPUT_LANGUAGE_NAMES[base] ?? 'English';
}
