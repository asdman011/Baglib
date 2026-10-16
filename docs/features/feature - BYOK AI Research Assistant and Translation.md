# Feature Document: BYOK AI Research Assistant & Translation Engine

## 1. Executive Summary

This feature document synthesizes reverse-engineering findings and architectural designs for integrating a **Bring Your Own Key (BYOK)** and **Local Offline LLM** AI Research Assistant and Translator into Baglib.

Inspired by **Readest**'s innovative **Anti-Spoiler RAG Context Ceiling** (`<BOOK_PASSAGES page_limit="${currentPage}">`), Baglib provides readers and scholars of classical Arabic literature (*Turath*), Islamic sciences, and academic works with an intelligent companion that respects the reader's current place in the book, prevents spoilers, and operates with zero subscription lock-in or forced cloud dependency.

---

## 2. Examined Applications & Architectural Comparison

### A. Readest
- **Source Paths:** `apps/readest-app/src/services/ai/prompts.ts`, `apps/readest-app/src/services/ai/providers/OllamaProvider.ts`, `apps/readest-app/src/services/ai/providers/OpenRouterProvider.ts`
- **Core Pattern:**
  - Wraps retrieved book passages in `<BOOK_PASSAGES page_limit="${currentPage}">`.
  - Strictly purges any text chunk or vector embedding whose page index exceeds `currentPage`.
  - Injects anti-spoiler instructions and varied polite refusal responses into the system prompt.
  - BYOK abstraction via `@ai-sdk/ollama` and OpenRouter with customizable temperature and base URLs.

### B. Ollama (Local & Offline Inference)
- **Protocol:** HTTP REST over local loopback (`http://127.0.0.1:11434`).
- **Endpoints:**
  - `GET /api/tags`: Returns list of locally installed models (`llama3.2`, `mistral`, `qwen2.5`, `nomic-embed-text`).
  - `POST /api/chat`: Non-streaming or NDJSON streaming multi-turn completion with model and option parameters.
- **Privacy & Security:** 100% offline, zero network requests, complete data sovereignty.

### C. Commercial BYOK Cloud Providers (OpenAI, Google Gemini, Anthropic Claude)
- **OpenAI-Compatible:** Standard `POST /v1/chat/completions` protocol supported by OpenAI, Groq, DeepSeek, Together AI, and self-hosted vLLM/LocalAI servers.
- **Google Gemini:** `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}` with distinct `systemInstruction` and `contents` payload format.
- **Anthropic Claude:** `POST https://api.anthropic.com/v1/messages` with `x-api-key` and `anthropic-version: 2023-06-01`.

---

## 3. Comparison Matrix

| Dimension | Readest | Standard Reader Plugins | Baglib Implementation |
| :--- | :--- | :--- | :--- |
| **Context Boundary** | Page-level RAG ceiling `<BOOK_PASSAGES>` | Unbounded full-text search / prone to spoilers | Strict SQLite FTS5 page ceiling (`page_number <= currentPage`) |
| **Model Freedom** | Ollama + OpenRouter | Cloud API only or fixed model | Ollama (Local), OpenAI, Gemini, Claude, Custom Proxy |
| **Specialized Prompts** | General fiction book buddy | Generic summary / dictionary | Academic Turath Lexicon, Structured Thesis/Evidence, Tarajim (*Rijal*), Eloquent Arabic Translation |
| **Note Persistence** | Ephemeral chat drawer | Separate note taking | One-click persistence to `annotations` table with tags |
| **Dedicated Translation** | Basic LLM translation | Single Google Translate endpoint | Multi-engine (DeepL, Google, Yandex) + Scholarly LLM fallback |
| **Bilingual UI / UX** | Mixed LTR/RTL | Mostly English | First-class Arabic (RTL) & English (LTR) with CSS logical properties |

---

## 4. Baglib Implementation Architecture

### A. Anti-Spoiler RAG Context Ceiling
Located in [src/shared/utils/ai-prompts.ts](file:///d:/Ammar's/Projects/Baglib/repo/Baglib/src/shared/utils/ai-prompts.ts):
```ts
export function buildAntiSpoilerSystemPrompt(options: SystemPromptOptions): string {
  const { bookTitle, authorName, currentPage, passages, antiSpoilerCeiling = true } = options;

  const validPassages = antiSpoilerCeiling
    ? passages.filter((p) => p.pageNumber <= currentPage)
    : passages;

  return `<SYSTEM>
You are **Baglib Scholar (باحث مكتبة بغداد)**, an erudite, respectful, and insightful academic reading companion and researcher.
...
ABSOLUTE ANTI-SPOILER CONSTRAINTS:
1. You can ONLY discuss content, arguments, and developments from pages 1 to ${currentPage}.
2. You must NEVER use prior training memory to reveal future events, resolutions, plot twists, or subsequent chapters of this book.
3. Natural Refusal: If asked about events or conclusions not in the provided passages, respond naturally and courteously...
</SYSTEM>
<BOOK_PASSAGES page_limit="${currentPage}">
${validPassages.map(p => `[${p.chapterTitle || `Page ${p.pageNumber}`}]\n${p.text}`).join('\n\n')}
</BOOK_PASSAGES>`;
}
```

### B. Specialized Academic Research Tools
1. **Contextual Lexicon (المعجم السياقي):**
   - Analyzes selected classical terms (e.g. *Istihsan*, *Jawhar*, *Kalam*) within the context of the active chapter, distinguishing lexical root (*al-Ma'na al-Lughawi*) from terminological application (*al-Ma'na al-Istilahi*).
2. **Structured Summary (التلخيص المنهجي):**
   - Automatically breaks chapters and passages into:
     - 📌 Main Central Thesis (الأطروحة المركزية)
     - 🔍 Key Arguments & Logical Points (أهم المحاور والاستدلالات)
     - 📜 Direct Supporting Quotes (نصوص وشواهد بارزة)
     - 💡 Practical / Scholarly Takeaway (خلاصة الباحث)
3. **Biographical Queries (تراجم الأعلام والرجال):**
   - Extracts historical profiles formatted to classical Islamic and academic conventions (Lineage, Era, Teachers, Notable Works, Scholarly Standing).
4. **Scholarly & Literary Translation (الترجمة الرصينة):**
   - Specialized in translating between classical Arabic and idiomatic English without clumsy machine literalism.

### C. Persistent Storage in Reader Annotations
When the user executes a structured summary or research query with `saveAsNote: true`, [AIResearchService](file:///d:/Ammar's/Projects/Baglib/repo/Baglib/src/main/services/ai/ai-research.service.ts) automatically persists the output to SQLite:
- `book_id`: Active book UUID.
- `location_cfi_or_page`: Active page number string.
- `note_content`: Markdown formatted summary.
- `tags`: `['AI-Research', toolType]`.
- Directly visible and editable in the reader's **Annotations Drawer** (`AnnotationsDrawer.tsx`) and exportable to Anki/Obsidian.

---

## 5. Verification & Completion Checklist

- [x] Reverse-engineered Readest anti-spoiler context ceiling recorded in `docs/features/readest.md`.
- [x] Dedicated cross-application feature document created (`feature - BYOK AI Research Assistant and Translation.md`).
- [x] BYOK multi-provider service supporting Ollama, OpenAI-compatible, Google Gemini, Anthropic Claude.
- [x] Multi-engine translation service (DeepL, Google, Yandex, LLM fallback).
- [x] Anti-spoiler RAG coordinator with SQLite FTS5 passage extraction bounded strictly to `page <= currentPage`.
- [x] One-click save of structured summaries to book annotations.
- [x] Bilingual (RTL/LTR) settings modal and slide-out research assistant drawer.
- [x] All 558 unit and integration tests passing (`npm test`).
