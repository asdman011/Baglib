import hljs from 'highlight.js';

/**
 * Automatically detects and syntax-highlights <pre><code> blocks in loaded book chapters.
 */
export function highlightCodeBlocks(
  containerOrDoc: Document | HTMLElement
): void {
  try {
    const codeBlocks = containerOrDoc.querySelectorAll('pre code');
    codeBlocks.forEach((block) => {
      const el = block as HTMLElement;
      if (!el.classList.contains('hljs')) {
        // Read language class e.g. language-js, lang-python
        const langMatch = el.className.match(/\b(?:lang|language)-([a-zA-Z0-9_-]+)\b/);
        if (langMatch && langMatch[1] && hljs.getLanguage(langMatch[1])) {
          try {
            const res = hljs.highlight(el.textContent || '', { language: langMatch[1] });
            el.innerHTML = res.value;
            el.classList.add('hljs');
          } catch {
            hljs.highlightElement(el);
          }
        } else {
          hljs.highlightElement(el);
        }
      }
    });
  } catch (err) {
    console.warn('[baglib:syntax-highlight] Highlighting skipped:', err);
  }
}

/**
 * Returns theme-aware CSS stylesheet for highlighted code blocks.
 */
export function getSyntaxHighlightStyles(isDark: boolean = false): string {
  if (isDark) {
    return `
      .hljs { color: #abb2bf; background: #1e293b; }
      .hljs-comment, .hljs-quote { color: #5c6370; font-style: italic; }
      .hljs-doctag, .hljs-keyword, .hljs-formula { color: #c678dd; }
      .hljs-section, .hljs-name, .hljs-selector-tag, .hljs-deletion, .hljs-subst { color: #e06c75; }
      .hljs-literal { color: #56b6c2; }
      .hljs-string, .hljs-regexp, .hljs-addition, .hljs-attribute, .hljs-meta .hljs-string { color: #98c379; }
      .hljs-attr, .hljs-variable, .hljs-template-variable, .hljs-type, .hljs-selector-class, .hljs-selector-attr, .hljs-selector-pseudo, .hljs-number { color: #d19a66; }
      .hljs-symbol, .hljs-bullet, .hljs-link, .hljs-meta, .hljs-selector-id, .hljs-title { color: #61afef; }
      .hljs-built_in, .hljs-title.class_, .hljs-class .hljs-title { color: #e5c07b; }
      .hljs-emphasis { font-style: italic; }
      .hljs-strong { font-weight: bold; }
      .hljs-link { text-decoration: underline; }
    `;
  }

  return `
    .hljs { color: #24292e; background: #f6f8fa; }
    .hljs-comment, .hljs-quote { color: #6a737d; font-style: italic; }
    .hljs-keyword, .hljs-selector-tag { color: #d73a49; }
    .hljs-subst { color: #24292e; }
    .hljs-string, .hljs-title, .hljs-section, .hljs-selector-id, .hljs-type { color: #005cc5; }
    .hljs-attribute, .hljs-name, .hljs-number { color: #005cc5; }
    .hljs-variable, .hljs-template-variable { color: #e36209; }
    .hljs-symbol, .hljs-bullet { color: #005cc5; }
    .hljs-built_in, .hljs-builtin-name { color: #6f42c1; }
    .hljs-meta { color: #6a737d; }
    .hljs-deletion { background: #ffeef0; }
    .hljs-addition { background: #f0fff4; }
    .hljs-emphasis { font-style: italic; }
    .hljs-strong { font-weight: bold; }
  `;
}
