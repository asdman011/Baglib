/**
 * Bi-Directional (RTL/LTR) & Classical Arabic Typography Engine
 * Provides language detection, Tashkeel/ligature protection, CSS logical properties,
 * smart Islamic text formatting (Quranic verses, Hadith blessings, poetry couplets),
 * and 4 calibrated reading themes (Paper, Sepia, Dusk, Midnight).
 */

const RTL_LANG_PREFIXES = [
  'ar',   // Arabic
  'ara',
  'fa',   // Persian / Farsi
  'fas',
  'per',
  'ur',   // Urdu
  'urd',
  'he',   // Hebrew
  'heb',
  'yi',   // Yiddish
  'ps',   // Pashto
  'pus',
  'sd',   // Sindhi
  'ug',   // Uyghur
  'ckb',  // Central Kurdish (Sorani)
  'syr',  // Syriac
  'arc',  // Aramaic
  'dv',   // Divehi
];

// Regex matching Arabic and RTL Unicode blocks
const RTL_UNICODE_REGEX =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0590-\u05FF]/;

/**
 * Detects whether a document language or text snippet indicates RTL reading direction.
 */
export function getDirFromLanguage(
  lang?: string | string[] | null,
  textSample?: string | null
): 'rtl' | 'ltr' {
  if (lang) {
    const list = Array.isArray(lang) ? lang : [lang];
    for (const code of list) {
      if (!code) continue;
      const clean = code.trim().toLowerCase().split(/[-_]/)[0];
      if (RTL_LANG_PREFIXES.includes(clean)) {
        return 'rtl';
      }
    }
  }

  // Heuristic probe on actual sample text if provided
  if (textSample && textSample.trim().length > 0) {
    const rtlMatches = textSample.match(new RegExp(RTL_UNICODE_REGEX.source, 'g'));
    const rtlCount = rtlMatches ? rtlMatches.length : 0;
    // If more than 15% of characters in sample belong to RTL scripts
    if (rtlCount / textSample.length > 0.15) {
      return 'rtl';
    }
  }

  return 'ltr';
}

/**
 * Transforms classical commentary tags, Quranic verses, and poetry couplets
 * without altering underlying document semantics.
 */
export function transformClassicalGlosses(html: string): string {
  if (!html) return html;
  let result = html;

  // 1. Quranic verses formatted with ornate brackets: ﴿ ... ﴾
  result = result.replace(/﴿([\s\S]*?)﴾/g, (_, verse) => {
    return `<span class="quran-verse" dir="rtl"><span class="quran-bracket">﴿</span><span class="quran-text font-serif">${verse.trim()}</span><span class="quran-bracket">﴾</span></span>`;
  });

  // 2. Classical Commentary / Warichu interlinear glosses
  if (result.includes('<sharh') || result.includes('<warichu') || result.includes('class="sharh') || result.includes('class="warichu')) {
    const replaceGloss = (content: string, type: 'sharh' | 'warichu') => {
      const trimmed = content.trim();
      const midpoint = Math.ceil(trimmed.length / 2);
      let splitIdx = trimmed.indexOf(' ', midpoint - 5);
      if (splitIdx === -1 || splitIdx > midpoint + 15) {
        splitIdx = midpoint;
      }
      const line1 = trimmed.slice(0, splitIdx).trim();
      const line2 = trimmed.slice(splitIdx).trim();

      return (
        `<span class="${type}-chunk" data-${type}-id="g_${Math.random().toString(36).substring(2, 7)}">` +
        `<span class="${type}-open">[</span>` +
        `<span class="${type}-line">${line1}</span>` +
        (line2 ? `<span class="${type}-sep">/</span><span class="${type}-line">${line2}</span>` : '') +
        `<span class="${type}-close">]</span>` +
        `</span>`
      );
    };

    result = result.replace(/<sharh(?:\s+[^>]*)?>([\s\S]*?)<\/sharh>/gi, (_, inner) => replaceGloss(inner, 'sharh'));
    result = result.replace(/<warichu(?:\s+[^>]*)?>([\s\S]*?)<\/warichu>/gi, (_, inner) => replaceGloss(inner, 'warichu'));
    result = result.replace(/<span\s+[^>]*class=["'][^"']*\bsharh\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi, (_, inner) => replaceGloss(inner, 'sharh'));
    result = result.replace(/<span\s+[^>]*class=["'][^"']*\bwarichu\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi, (_, inner) => replaceGloss(inner, 'warichu'));
  }

  // 3. Classical Arabic Poetry Couplets (الصدر والعجز)
  // Matches lines containing traditional hemistich separators: " ... " or " * * * "
  result = result.replace(/^([^\n<]+?)\s+(?:\.{3,4}|\*{3,5})\s+([^\n<]+)$/gm, (match, sadr, ajz) => {
    if (sadr.length > 5 && ajz.length > 5 && !match.includes('<')) {
      return `<div class="poetry-bayt"><span class="poetry-sadr">${sadr.trim()}</span><span class="poetry-sep">❊</span><span class="poetry-ajz">${ajz.trim()}</span></div>`;
    }
    return match;
  });

  return result;
}

export type CalibratedThemeKey = 'paper' | 'sepia' | 'dusk' | 'midnight' | 'light' | 'dark' | 'night' | 'e-ink';

export interface ThemeColors {
  bg: string;
  text: string;
  link: string;
  subtle: string;
  border: string;
  surface: string;
  sharhBg: string;
  sharhBorder: string;
  codeBg: string;
  pdfFilter: string;
}

export const CALIBRATED_THEMES: Record<string, ThemeColors> = {
  paper: {
    bg: '#FAF8F5',
    text: '#1C1B18',
    link: '#0284c7',
    subtle: '#6B6862',
    border: '#E8E3D9',
    surface: '#F0ECE4',
    sharhBg: '#F2EDE4',
    sharhBorder: '#DDD6C8',
    codeBg: '#F3EFE7',
    pdfFilter: 'none',
  },
  sepia: {
    bg: '#fbf0d9',
    text: '#5f4b32',
    link: '#8f5a2b',
    subtle: '#8c7b66',
    border: '#e6d5b8',
    surface: '#f4e8cb',
    sharhBg: '#f4e3c3',
    sharhBorder: '#d6c09b',
    codeBg: '#efe2c8',
    pdfFilter: 'sepia(0.28) contrast(0.96)',
  },
  dusk: {
    bg: '#1E222A',
    text: '#D8DEE9',
    link: '#88C0D0',
    subtle: '#7E8EAA',
    border: '#2E3440',
    surface: '#272C36',
    sharhBg: '#282D37',
    sharhBorder: '#3B4252',
    codeBg: '#252A34',
    pdfFilter: 'invert(0.88) hue-rotate(180deg) contrast(1.05)',
  },
  midnight: {
    bg: '#0B0C0E',
    text: '#B8C0CC',
    link: '#58A6FF',
    subtle: '#626C7D',
    border: '#1E222A',
    surface: '#15181E',
    sharhBg: '#13161C',
    sharhBorder: '#272C36',
    codeBg: '#13161C',
    pdfFilter: 'invert(0.94) hue-rotate(180deg) contrast(1.1)',
  },
  light: {
    bg: '#ffffff',
    text: '#1e293b',
    link: '#0284c7',
    subtle: '#64748b',
    border: '#e2e8f0',
    surface: '#f8fafc',
    sharhBg: '#f8fafc',
    sharhBorder: '#cbd5e1',
    codeBg: '#f1f5f9',
    pdfFilter: 'none',
  },
  dark: {
    bg: '#0f172a',
    text: '#f1f5f9',
    link: '#38bdf8',
    subtle: '#94a3b8',
    border: '#334155',
    surface: '#1e293b',
    sharhBg: '#1e293b',
    sharhBorder: '#475569',
    codeBg: '#1e293b',
    pdfFilter: 'invert(0.90) hue-rotate(180deg)',
  },
  night: {
    bg: '#000000',
    text: '#999999',
    link: '#58a6ff',
    subtle: '#666666',
    border: '#222222',
    surface: '#111111',
    sharhBg: '#111111',
    sharhBorder: '#333333',
    codeBg: '#111111',
    pdfFilter: 'invert(1) hue-rotate(180deg) contrast(1.2)',
  },
  'e-ink': {
    bg: '#ffffff',
    text: '#000000',
    link: '#000000',
    subtle: '#222222',
    border: '#000000',
    surface: '#ffffff',
    sharhBg: '#ffffff',
    sharhBorder: '#000000',
    codeBg: '#f4f4f4',
    pdfFilter: 'grayscale(1) contrast(1.5)',
  },
};

export function resolveTheme(key?: string): ThemeColors {
  if (!key) return CALIBRATED_THEMES.sepia;
  if (CALIBRATED_THEMES[key]) return CALIBRATED_THEMES[key];
  return CALIBRATED_THEMES.sepia;
}

export function getPdfThemeFilter(themeKey?: string): string {
  return resolveTheme(themeKey).pdfFilter;
}

export interface ReaderStyleOptions {
  direction?: 'rtl' | 'ltr';
  fontSize?: number; // in px
  lineHeight?: number;
  fontFamily?: string;
  paragraphSpacing?: number; // in em
  margin?: number; // in px
  brightness?: number; // 50 to 150
  contrast?: number; // 50 to 150
  theme?: CalibratedThemeKey;
}

/**
 * Returns complete theme and typography CSS stylesheet string for injection
 * into sandboxed book render frames.
 */
export function getReaderStyles(options: ReaderStyleOptions = {}): string {
  const {
    direction = 'ltr',
    fontSize = 18,
    lineHeight = direction === 'rtl' ? 1.85 : 1.6,
    paragraphSpacing = 0.8,
    margin = 28,
    brightness = 100,
    contrast = 100,
    fontFamily = direction === 'rtl'
      ? "'Amiri', 'Scheherazade New', 'Noto Naskh Arabic', 'Cairo', 'IBM Plex Sans Arabic', serif"
      : "'Literata', 'Merriweather', 'Charter', 'Inter', serif",
    theme = 'sepia',
  } = options;

  const t = resolveTheme(theme);
  const filterStyle = (brightness !== 100 || contrast !== 100)
    ? `filter: brightness(${brightness}%) contrast(${contrast}%) !important;`
    : '';

  return `
    :root {
      --baglib-bg: ${t.bg};
      --baglib-text: ${t.text};
      --baglib-link: ${t.link};
      --baglib-subtle: ${t.subtle};
      --baglib-border: ${t.border};
      --baglib-sharh-bg: ${t.sharhBg};
      --baglib-sharh-border: ${t.sharhBorder};
      --baglib-code-bg: ${t.codeBg};
    }

    html, body {
      background-color: var(--baglib-bg) !important;
      color: var(--baglib-text) !important;
      direction: ${direction} !important;
      font-family: ${fontFamily} !important;
      font-size: ${fontSize}px !important;
      line-height: ${lineHeight} !important;
      margin: 0 !important;
      padding: 0 !important;
      box-sizing: border-box !important;
      text-rendering: optimizeLegibility !important;
      -webkit-font-smoothing: antialiased !important;
      font-feature-settings: "kern" 1, "liga" 1, "calt" 1 !important;
      letter-spacing: 0 !important;
      ${filterStyle}
    }

    ::selection {
      background-color: rgba(59, 130, 246, 0.35) !important;
      color: inherit !important;
    }

    /* Directional CSS Logical Properties with User Margins */
    body {
      padding-inline-start: ${margin}px !important;
      padding-inline-end: ${margin}px !important;
      padding-block-start: 1.5rem !important;
      padding-block-end: 2.5rem !important;
      text-align: start !important;
    }

    p {
      margin-block-start: ${paragraphSpacing}em !important;
      margin-block-end: ${paragraphSpacing}em !important;
      text-align: justify !important;
      text-justify: inter-word !important;
      line-height: ${lineHeight} !important;
      overflow: visible !important;
    }

    /* Tashkeel & Arabic Diacritic Protection */
    [dir="rtl"], [lang="ar"], [lang="ara"], [lang="fa"], [lang="ur"] {
      line-height: ${Math.max(1.85, lineHeight)} !important;
      word-spacing: 0.05em !important;
      letter-spacing: 0 !important;
    }

    /* Quranic Verses */
    .quran-verse {
      display: inline !important;
      color: #0d9488 !important;
      font-family: 'Amiri', 'Scheherazade New', serif !important;
      font-size: 1.05em !important;
      padding-inline: 2px !important;
    }
    .quran-bracket {
      color: #d97706 !important;
      font-weight: bold !important;
      font-size: 1.1em !important;
    }

    /* Arabic Poetry Couplets (الصدر والعجز) */
    .poetry-bayt {
      display: flex !important;
      justify-content: space-between !important;
      align-items: center !important;
      max-width: 600px !important;
      margin-inline: auto !important;
      margin-block: 0.75rem !important;
      padding-inline: 1rem !important;
      text-align: center !important;
    }
    .poetry-sadr, .poetry-ajz {
      flex: 1 !important;
      white-space: nowrap !important;
    }
    .poetry-sep {
      color: var(--baglib-subtle) !important;
      font-size: 0.75em !important;
      padding-inline: 0.75rem !important;
    }

    /* Classical Commentary (Sharh / Warichu) Styles */
    .sharh-chunk, .warichu-chunk {
      display: inline-block !important;
      vertical-align: baseline !important;
      font-size: 0.68em !important;
      line-height: 1.25 !important;
      background-color: var(--baglib-sharh-bg) !important;
      border: 1px solid var(--baglib-sharh-border) !important;
      border-radius: 4px !important;
      padding-inline-start: 4px !important;
      padding-inline-end: 4px !important;
      padding-block: 2px !important;
      margin-inline: 3px !important;
      text-align: center !important;
      color: var(--baglib-subtle) !important;
    }

    .sharh-line, .warichu-line {
      display: block !important;
      white-space: nowrap !important;
    }

    .sharh-sep, .warichu-sep {
      display: none !important;
    }

    .sharh-open, .sharh-close, .warichu-open, .warichu-close {
      color: var(--baglib-border) !important;
      font-size: 0.85em !important;
      user-select: none !important;
    }

    /* Links & Accents */
    a, a:visited {
      color: var(--baglib-link) !important;
      text-decoration: underline !important;
      text-underline-offset: 3px !important;
    }

    /* Code blocks */
    pre {
      background-color: var(--baglib-code-bg) !important;
      border: 1px solid var(--baglib-border) !important;
      border-radius: 8px !important;
      padding: 1rem !important;
      overflow-x: auto !important;
      direction: ltr !important;
      text-align: left !important;
      font-family: 'JetBrains Mono', 'Consolas', monospace !important;
      font-size: 0.88em !important;
      line-height: 1.5 !important;
    }

    code {
      font-family: 'JetBrains Mono', 'Consolas', monospace !important;
      font-size: 0.9em !important;
      direction: ltr !important;
      unicode-bidi: isolate !important;
    }

    img, svg {
      max-width: 100% !important;
      height: auto !important;
      display: block !important;
      margin-inline: auto !important;
      margin-block: 1rem !important;
    }

    /* Prevent clipping of diacritics */
    * {
      overflow-clip-margin: 8px !important;
    }
  `;
}

/**
 * Returns React inline style object with CSS custom properties for container styling.
 */
export function getViewportCssVariables(settings: {
  theme?: CalibratedThemeKey;
  fontSize?: number;
  lineSpacing?: number;
  paragraphSpacing?: number;
  margin?: number;
  brightness?: number;
  contrast?: number;
  fontFamily?: string;
}): React.CSSProperties {
  const currentTheme = resolveTheme(settings.theme);

  return {
    ['--reader-bg' as any]: currentTheme.bg,
    ['--reader-text' as any]: currentTheme.text,
    ['--reader-surface' as any]: currentTheme.surface,
    ['--reader-border' as any]: currentTheme.border,
    ['--reader-font-size' as any]: `${settings.fontSize ?? 18}px`,
    ['--reader-line-height' as any]: `${settings.lineSpacing ?? 1.85}`,
    ['--reader-p-spacing' as any]: `${settings.paragraphSpacing ?? 0.8}em`,
    ['--reader-margin' as any]: `${settings.margin ?? 28}px`,
    ['--reader-filter' as any]: `brightness(${settings.brightness ?? 100}%) contrast(${settings.contrast ?? 100}%)`,
    ['--reader-pdf-filter' as any]: currentTheme.pdfFilter,
    ['--reader-font-family' as any]: settings.fontFamily ?? 'inherit',
  };
}
