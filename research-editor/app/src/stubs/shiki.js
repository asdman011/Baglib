// BagLib research editor: curated shiki bundle (KEY-362).
// Drops ~8.5 MB of 280+ unused language grammars and 40+ themes, while keeping the common languages
// (JS/TS, Python, HTML/CSS, Markdown, JSON, SQL, Shell, Rust, LaTeX) and standard dark/light themes.

import {
  createBundledHighlighter,
  createSingletonShorthands,
  guessEmbeddedLanguages,
} from '@shikijs/core';
import { createJavaScriptRegexEngine, defaultJavaScriptRegexConstructor } from '@shikijs/engine-javascript';
import { createOnigurumaEngine, loadWasm } from '@shikijs/engine-oniguruma';

export * from '@shikijs/core';
export { createJavaScriptRegexEngine, defaultJavaScriptRegexConstructor };
export { createOnigurumaEngine, loadWasm };

export const bundledLanguages = {
  javascript: () => import('@shikijs/langs/javascript'),
  typescript: () => import('@shikijs/langs/typescript'),
  jsx: () => import('@shikijs/langs/jsx'),
  tsx: () => import('@shikijs/langs/tsx'),
  json: () => import('@shikijs/langs/json'),
  html: () => import('@shikijs/langs/html'),
  css: () => import('@shikijs/langs/css'),
  markdown: () => import('@shikijs/langs/markdown'),
  python: () => import('@shikijs/langs/python'),
  rust: () => import('@shikijs/langs/rust'),
  sql: () => import('@shikijs/langs/sql'),
  shellscript: () => import('@shikijs/langs/shellscript'),
  yaml: () => import('@shikijs/langs/yaml'),
  latex: () => import('@shikijs/langs/latex'),
};

export const bundledLanguagesAlias = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  md: 'markdown',
  sh: 'shellscript',
  bash: 'shellscript',
  zsh: 'shellscript',
  yml: 'yaml',
  tex: 'latex',
};

export const bundledLanguagesBase = bundledLanguages;

export const bundledLanguagesInfo = [
  { id: 'javascript', name: 'JavaScript', aliases: ['js'], import: () => import('@shikijs/langs/javascript') },
  { id: 'typescript', name: 'TypeScript', aliases: ['ts'], import: () => import('@shikijs/langs/typescript') },
  { id: 'jsx', name: 'JSX', import: () => import('@shikijs/langs/jsx') },
  { id: 'tsx', name: 'TSX', import: () => import('@shikijs/langs/tsx') },
  { id: 'json', name: 'JSON', import: () => import('@shikijs/langs/json') },
  { id: 'html', name: 'HTML', import: () => import('@shikijs/langs/html') },
  { id: 'css', name: 'CSS', import: () => import('@shikijs/langs/css') },
  { id: 'markdown', name: 'Markdown', aliases: ['md'], import: () => import('@shikijs/langs/markdown') },
  { id: 'python', name: 'Python', aliases: ['py'], import: () => import('@shikijs/langs/python') },
  { id: 'rust', name: 'Rust', aliases: ['rs'], import: () => import('@shikijs/langs/rust') },
  { id: 'sql', name: 'SQL', import: () => import('@shikijs/langs/sql') },
  { id: 'shellscript', name: 'Shell', aliases: ['bash', 'sh', 'shell', 'zsh'], import: () => import('@shikijs/langs/shellscript') },
  { id: 'yaml', name: 'YAML', aliases: ['yml'], import: () => import('@shikijs/langs/yaml') },
  { id: 'latex', name: 'LaTeX', aliases: ['tex'], import: () => import('@shikijs/langs/latex') },
];

export const bundledThemes = {
  'dark-plus': () => import('@shikijs/themes/dark-plus'),
  'light-plus': () => import('@shikijs/themes/light-plus'),
};

export const bundledThemesInfo = [
  { id: 'dark-plus', displayName: 'Dark Plus', type: 'dark', import: () => import('@shikijs/themes/dark-plus') },
  { id: 'light-plus', displayName: 'Light Plus', type: 'light', import: () => import('@shikijs/themes/light-plus') },
];

const createHighlighter = /* @__PURE__ */ createBundledHighlighter({
  langs: bundledLanguages,
  themes: bundledThemes,
  engine: () => createOnigurumaEngine(import('shiki/wasm')),
});

const {
  codeToHtml,
  codeToHast,
  codeToTokens,
  codeToTokensBase,
  codeToTokensWithThemes,
  getSingletonHighlighter,
  getLastGrammarState,
} = /* @__PURE__ */ createSingletonShorthands(
  createHighlighter,
  { guessEmbeddedLanguages }
);

export {
  codeToHast,
  codeToHtml,
  codeToTokens,
  codeToTokensBase,
  codeToTokensWithThemes,
  createHighlighter,
  getLastGrammarState,
  getSingletonHighlighter,
};
