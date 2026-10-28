import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    settings: { next: { rootDir: 'src/renderer/' } },
  },
  {
    // These Node/Electron entry points run as CommonJS, unlike application TS.
    files: ['**/*.cjs', 'scripts/copy-pdfjs-assets.js', 'scripts/test-runner.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "**/.next/**",
    "**/out/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "repos/**",
    ".baglib-data/**",
    "dist/**",
    "release/**",
    "src/renderer/public/**",
    "assets/**",
    "public/vendor/**",
    "libgen-calibre-store-plugin-main/**",
  ]),
]);

export default eslintConfig;
