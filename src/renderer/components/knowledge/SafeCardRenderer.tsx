'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_IMAGE_OCCLUSION_FRAME_STRINGS,
  imageOcclusionFrameScript,
  type ImageOcclusionFrameStrings,
} from '../../../shared/revision/image-occlusion-frame';

export type CardFrameTheme = 'light' | 'dark';

/** `<img src="<sha1>.png">` references to card media (KEY-391). */
const CARD_MEDIA_SRC = /(<img\b[^>]*?\bsrc\s*=\s*)(["'])([a-f0-9]{40}\.(?:png|jpg|gif|webp|bmp))\2/giu;
const mediaCache = new Map<string, string>();

/** True when a card's stored back is HTML rendered from a note template (shown in the frame, not as text). */
export function isTemplateHtml(value: string | null | undefined): boolean {
  return !!value && /<(?:div|span|img|canvas|br|hr|script|style|p|details)\b/iu.test(value);
}

export function cardMediaNames(html: string): string[] {
  return [...new Set([...html.matchAll(CARD_MEDIA_SRC)].map(m => m[3].toLowerCase()))];
}

/** Swaps card-media names for data: URLs; the frame's CSP allows no other image source. */
export function substituteCardMedia(html: string, dataUrls: ReadonlyMap<string, string>): string {
  return html.replace(CARD_MEDIA_SRC, (full, head: string, quote: string, name: string) => {
    const url = dataUrls.get(name.toLowerCase());
    return url ? `${head}${quote}${url}${quote}` : full;
  });
}

/** The card HTML with its media inlined; null while the images are still loading. */
export function useResolvedCardMedia(html: string): string | null {
  const names = useMemo(() => cardMediaNames(html), [html]);
  const [version, setVersion] = useState(0);
  const missing = names.filter(name => !mediaCache.has(name));
  useEffect(() => {
    if (!missing.length) return;
    const api = typeof window !== 'undefined' ? window.electronAPI?.cardMedia : undefined;
    let active = true;
    void Promise.all(
      missing.map(async name => {
        try {
          const stored = api ? await api.read(name) : null;
          mediaCache.set(name, stored?.dataUrl ?? '');
        } catch {
          mediaCache.set(name, '');
        }
      })
    ).then(() => {
      if (active) setVersion(v => v + 1);
    });
    return () => {
      active = false;
    };
    // `missing` is derived from `names`; re-run only when the referenced media change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [names.join('|')]);
  return useMemo(() => {
    if (!names.length) return html;
    if (names.some(name => !mediaCache.has(name))) return null;
    return substituteCardMedia(html, mediaCache);
    // `version` re-evaluates after the cache fills.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, names, version]);
}

function readAppTheme(): CardFrameTheme {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

/** Follows the app theme (the `dark` class on the app root), not the operating-system setting. */
export function useAppTheme(): CardFrameTheme {
  const [theme, setTheme] = useState<CardFrameTheme>(readAppTheme);
  useEffect(() => {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(() => setTheme(readAppTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return theme;
}

export interface SafeCardRendererProps {
  html: string;
  css?: string;
  side: 'front' | 'back';
  rtl?: boolean;
  typedAnswer?: string;
  onTypedAnswerChange?: (val: string) => void;
  onPlayTts?: (text: string, lang: string) => void;
  className?: string;
  /** Overrides the app theme, for tests and previews. */
  theme?: CardFrameTheme;
  /** Localised labels for image-occlusion cards (KEY-391). */
  ioStrings?: ImageOcclusionFrameStrings;
}

export function filterCardFrameMessage(
  eventSource: unknown,
  expectedWindow: unknown,
  data: unknown,
  expectedFrameId: string
): { type: string; value?: string; text?: string; lang?: string; height?: number } | null {
  if (!expectedWindow || eventSource !== expectedWindow) return null;
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (d.frameId !== expectedFrameId) return null;

  if (d.type === 'baglib-card-type-answer' && typeof d.value === 'string') {
    return { type: d.type, value: d.value.slice(0, 2000) };
  }
  if (d.type === 'baglib-card-tts-play' && typeof d.text === 'string') {
    return {
      type: d.type,
      text: d.text.slice(0, 2000),
      lang: typeof d.lang === 'string' ? d.lang.slice(0, 32) : 'en_US',
    };
  }
  if (d.type === 'baglib-card-resize' && typeof d.height === 'number' && Number.isFinite(d.height)) {
    return { type: d.type, height: Math.max(60, Math.min(d.height + 20, 1600)) };
  }
  return null;
}

export const SafeCardRenderer: React.FC<SafeCardRendererProps> = ({
  html,
  css = '',
  side,
  rtl = false,
  typedAnswer = '',
  onTypedAnswerChange,
  onPlayTts,
  className = '',
  theme: themeOverride,
  ioStrings = DEFAULT_IMAGE_OCCLUSION_FRAME_STRINGS,
}) => {
  const appTheme = useAppTheme();
  const theme = themeOverride ?? appTheme;
  const frameRef = useRef<HTMLIFrameElement>(null);
  const frameId = useId();
  const resolvedHtml = useResolvedCardMedia(html);
  const ioScript = useMemo(() => imageOcclusionFrameScript(ioStrings), [ioStrings]);

  // Build the sandboxed HTML document
  const srcDoc = useMemo(() => {
    if (resolvedHtml === null) return '';
    const escapedTyped = typedAnswer.replace(/["\\]/gu, '\\$&');

    return `<!DOCTYPE html>
<html lang="${rtl ? 'ar' : 'en'}" dir="${rtl ? 'rtl' : 'ltr'}" class="theme-${theme}">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:;">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script>${ioScript}</script>
  <style>
    :root {
      color-scheme: light;
      --bg: #ffffff;
      --fg: #0f172a;
      --muted: #64748b;
      --border: #e2e8f0;
      --cloze: #2563eb;
    }
    :root.theme-dark {
      color-scheme: dark;
      --bg: #0f172a;
      --fg: #f8fafc;
      --muted: #94a3b8;
      --border: #334155;
      --cloze: #60a5fa;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: transparent;
      color: var(--fg);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Amiri", "Traditional Arabic", sans-serif;
      font-size: 18px;
      line-height: 2.2; /* Generous line height to ensure Arabic diacritics never clip */
      box-sizing: border-box;
      overflow-wrap: break-word;
      word-break: break-word;
    }
    body {
      padding: 16px;
      direction: ${rtl ? 'rtl' : 'ltr'};
      text-align: ${rtl ? 'right' : 'center'};
    }
    .card {
      max-width: 100%;
      margin: 0 auto;
    }
    hr#answer {
      border: 0;
      height: 1px;
      background: var(--border);
      margin: 20px 0;
    }
    .cloze {
      font-weight: bold;
      color: var(--cloze);
    }
    .context-blurred {
      filter: blur(4px);
      opacity: 0.6;
      user-select: none;
    }
    details.hint {
      margin: 12px 0;
      padding: 8px 12px;
      border: 1px solid var(--border);
      border-radius: 8px;
      cursor: pointer;
      text-align: start;
    }
    details.hint summary {
      font-weight: 600;
      color: var(--cloze);
    }
    details.hint .hint-body {
      margin-top: 8px;
    }
    .type-answer-input {
      font-size: 1.1em;
      padding: 8px 12px;
      width: 85%;
      max-width: 400px;
      margin: 12px auto;
      display: block;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--bg);
      color: var(--fg);
      outline: none;
      box-sizing: border-box;
      direction: ${rtl ? 'rtl' : 'ltr'};
    }
    .type-answer-input:focus {
      border-color: var(--cloze);
      box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
    }
    .type-diff {
      display: inline-block;
      font-family: monospace;
      font-size: 1.1em;
      padding: 6px 10px;
      border: 1px solid var(--border);
      border-radius: 6px;
      margin-top: 8px;
      background: rgba(0, 0, 0, 0.03);
    }
    .type-good {
      color: #16a34a;
      background-color: rgba(22, 163, 74, 0.15);
      border-radius: 2px;
    }
    .type-bad {
      color: #dc2626;
      background-color: rgba(220, 38, 38, 0.15);
      text-decoration: line-through;
      border-radius: 2px;
    }
    .type-missed {
      color: #9333ea;
      background-color: rgba(147, 51, 234, 0.15);
      border-radius: 2px;
    }
    .type-expected-label {
      font-size: 0.85em;
      color: var(--muted);
      margin-bottom: 4px;
    }
    .tts-play-btn {
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 4px 8px;
      cursor: pointer;
      font-size: 1rem;
      margin: 0 4px;
    }
    /* Image occlusion layout (Anki review.scss), applied to every card like Anki does. */
    #image-occlusion-container { position: relative; margin: 0 auto; max-height: calc(95vh - 40px); }
    #image-occlusion-container img { position: absolute; top: 0; left: 0; width: 100%; height: 100%; max-width: unset; max-height: unset; }
    #image-occlusion-canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
    #toggle { margin-top: 12px; padding: 6px 14px; border: 1px solid var(--border); border-radius: 8px; background: transparent; color: var(--fg); cursor: pointer; font: inherit; font-size: 0.9em; }
    ${css}
  </style>
</head>
<body>
  <div class="card" id="card-content">
    ${resolvedHtml}
  </div>
  <script>
    // Wire up type-in input
    const typeInput = document.querySelector('.type-answer-input');
    if (typeInput) {
      typeInput.value = "${escapedTyped}";
      typeInput.addEventListener('input', (e) => {
        window.parent.postMessage({ type: 'baglib-card-type-answer', value: e.target.value, frameId: "${frameId}" }, '*');
      });
      typeInput.focus();
    }

    // Wire up TTS buttons
    document.querySelectorAll('.tts-play-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const text = decodeURIComponent(btn.dataset.text || '');
        const lang = btn.dataset.lang || 'en_US';
        window.parent.postMessage({ type: 'baglib-card-tts-play', text, lang, frameId: "${frameId}" }, '*');
      });
    });

    // Notify parent of content height
    function reportHeight() {
      const height = document.documentElement.scrollHeight || document.body.scrollHeight;
      window.parent.postMessage({ type: 'baglib-card-resize', height, frameId: "${frameId}" }, '*');
    }
    window.addEventListener('load', reportHeight);
    new ResizeObserver(reportHeight).observe(document.body);
  </script>
</body>
</html>`;
  }, [resolvedHtml, css, rtl, typedAnswer, frameId, theme, ioScript]);

  // Listen to messages from sandboxed frame
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      const filtered = filterCardFrameMessage(e.source, frameRef.current?.contentWindow, e.data, frameId);
      if (!filtered) return;

      if (filtered.type === 'baglib-card-type-answer') {
        onTypedAnswerChange?.(filtered.value ?? '');
      } else if (filtered.type === 'baglib-card-tts-play') {
        onPlayTts?.(filtered.text ?? '', filtered.lang ?? 'en_US');
      } else if (filtered.type === 'baglib-card-resize' && frameRef.current) {
        frameRef.current.style.height = `${filtered.height}px`;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [frameId, onTypedAnswerChange, onPlayTts]);

  return (
    <div className={`w-full overflow-hidden ${className}`}>
      <iframe
        ref={frameRef}
        data-card-frame
        data-card-side={side}
        sandbox="allow-scripts"
        srcDoc={srcDoc}
        title="Card Content"
        className="w-full border-0 transition-[height] duration-150"
        data-card-theme={theme}
        style={{ minHeight: '140px', width: '100%', display: 'block', colorScheme: theme, background: 'transparent' }}
      />
    </div>
  );
};
