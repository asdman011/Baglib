/**
 * Bi-Directional (RTL/LTR) & Classical Arabic Typography Engine
 * Provides language detection, Tashkeel/ligature protection, CSS logical properties,
 * and classical commentary glosses (Warichu / Sharh).
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
 * Transforms classical commentary tags (<sharh>, <warichu>, etc.) into structured
 * two-line inline commentary elements without altering underlying DOM semantics.
 */
export function transformClassicalGlosses(html: string): string {
  if (!html || (!html.includes('<sharh') && !html.includes('<warichu') && !html.includes('class="sharh') && !html.includes('class="warichu'))) {
    return html;
  }

  // Replace <sharh>...</sharh> or <span class="sharh">...</span>
  let result = html;

  const replaceGloss = (content: string, type: 'sharh' | 'warichu') => {
    const trimmed = content.trim();
    // Split into two balanced lines for the interlinear gloss
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

  return result;
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
  theme?: 'light' | 'dark' | 'sepia' | 'night' | 'e-ink';
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
    margin = 24,
    brightness = 100,
    contrast = 100,
    fontFamily = direction === 'rtl'
      ? "'Amiri', 'Scheherazade New', 'Traditional Arabic', 'Cairo', serif"
      : "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    theme = 'light',
  } = options;

  const themes = {
    light: {
      bg: '#ffffff',
      text: '#1e293b',
      link: '#0284c7',
      subtle: '#64748b',
      border: '#e2e8f0',
      sharhBg: '#f8fafc',
      sharhBorder: '#cbd5e1',
      codeBg: '#f1f5f9',
    },
    dark: {
      bg: '#0f172a',
      text: '#f1f5f9',
      link: '#38bdf8',
      subtle: '#94a3b8',
      border: '#334155',
      sharhBg: '#1e293b',
      sharhBorder: '#475569',
      codeBg: '#1e293b',
    },
    sepia: {
      bg: '#fbf0d9',
      text: '#5f4b32',
      link: '#8f5a2b',
      subtle: '#8c7b66',
      border: '#e6d5b8',
      sharhBg: '#f4e3c3',
      sharhBorder: '#d6c09b',
      codeBg: '#efe2c8',
    },
    night: {
      bg: '#000000',
      text: '#999999',
      link: '#58a6ff',
      subtle: '#666666',
      border: '#222222',
      sharhBg: '#111111',
      sharhBorder: '#333333',
      codeBg: '#111111',
    },
    'e-ink': {
      bg: '#ffffff',
      text: '#000000',
      link: '#000000',
      subtle: '#222222',
      border: '#000000',
      sharhBg: '#ffffff',
      sharhBorder: '#000000',
      codeBg: '#f4f4f4',
    },
  };

  const t = themes[theme] || themes.light;
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
      ${filterStyle}
    }

    /* Directional CSS Logical Properties with User Margins */
    body {
      padding-inline-start: ${margin}px !important;
      padding-inline-end: ${margin}px !important;
      padding-block-start: 1rem !important;
      padding-block-end: 2rem !important;
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
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace !important;
      font-size: 0.88em !important;
      line-height: 1.5 !important;
    }

    code {
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace !important;
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
  theme?: 'light' | 'dark' | 'sepia' | 'night' | 'e-ink';
  fontSize?: number;
  lineSpacing?: number;
  paragraphSpacing?: number;
  margin?: number;
  brightness?: number;
  contrast?: number;
  fontFamily?: string;
}): React.CSSProperties {
  const themes = {
    light: { bg: '#ffffff', text: '#1e293b' },
    dark: { bg: '#0f172a', text: '#f1f5f9' },
    sepia: { bg: '#fbf0d9', text: '#5f4b32' },
    night: { bg: '#000000', text: '#999999' },
    'e-ink': { bg: '#ffffff', text: '#000000' },
  };

  const currentTheme = themes[settings.theme || 'light'] || themes.light;

  return {
    ['--reader-bg' as any]: currentTheme.bg,
    ['--reader-text' as any]: currentTheme.text,
    ['--reader-font-size' as any]: `${settings.fontSize ?? 18}px`,
    ['--reader-line-height' as any]: `${settings.lineSpacing ?? 1.85}`,
    ['--reader-p-spacing' as any]: `${settings.paragraphSpacing ?? 0.8}em`,
    ['--reader-margin' as any]: `${settings.margin ?? 24}px`,
    ['--reader-filter' as any]: `brightness(${settings.brightness ?? 100}%) contrast(${settings.contrast ?? 100}%)`,
    ['--reader-font-family' as any]: settings.fontFamily ?? 'inherit',
  };
}

