/**
 * Baglib — Anti-Spoiler RAG Prompts & Academic AI Architectures (KEY-143)
 *
 * Reverse-engineered from Readest's anti-spoiler context ceiling, adapted for
 * Islamic scholarship, classical literature (Turath), and multilingual academic research.
 */

import type { BookPassage, AIResearchToolType } from '../types/ai';

export interface SystemPromptOptions {
  bookTitle: string;
  authorName?: string;
  currentPage: number;
  passages: BookPassage[];
  antiSpoilerCeiling?: boolean;
}

/**
 * Builds the Anti-Spoiler system prompt with strict page boundary ceiling:
 * `<BOOK_PASSAGES page_limit="${currentPage}">`
 */
export function buildAntiSpoilerSystemPrompt(options: SystemPromptOptions): string {
  const { bookTitle, authorName, currentPage, passages, antiSpoilerCeiling = true } = options;

  const validPassages = antiSpoilerCeiling
    ? passages.filter((p) => p.pageNumber <= currentPage)
    : passages;

  const contextSection =
    validPassages.length > 0
      ? `\n\n<BOOK_PASSAGES page_limit="${currentPage}">\n${validPassages
          .map((c) => {
            const header = c.chapterTitle || `Page ${c.pageNumber}`;
            return `[${header}, Page ${c.pageNumber}]\n${c.text}`;
          })
          .join('\n\n')}\n</BOOK_PASSAGES>`
      : '\n\n[No indexed content available for pages read up to this point.]';

  return `<SYSTEM>
You are **Baglib Scholar (باحث مكتبة بغداد)**, an erudite, respectful, and insightful academic reading companion and researcher.

IDENTITY & READING LOCATION:
- You are reading alongside the user, currently on page ${currentPage} of "${bookTitle}"${authorName ? ` by ${authorName}` : ''}.
- You remember everything from pages 1 to ${currentPage}, but you have NOT read beyond page ${currentPage}.
- You treat Arabic classical texts, Islamic sciences, world literature, and modern academia with rigor and accuracy.

ABSOLUTE ANTI-SPOILER CONSTRAINTS:
1. You can ONLY discuss content, arguments, and developments from pages 1 to ${currentPage}.
2. You must NEVER use prior training memory to reveal future events, resolutions, plot twists, or subsequent chapters of this book.
3. Natural Refusal: If asked about events or conclusions not in the provided passages, respond naturally and courteously:
   - "We haven't reached that section of the book yet! We are currently on page ${currentPage}."
   - "لم نصل إلى هذا الموضع من الكتاب بعد! نحن حالياً نتدارس ما ورد حتى الصفحة ${currentPage}."
4. Maintain academic neutrality, precision, and avoid intrusive hallucination.

</SYSTEM>
\nCite chapter titles or page references when quoting passages from the context.${contextSection}`;
}

/**
 * Builds prompt for Contextual Dictionary: explains classical/Fiqh terms in paragraph context.
 */
export function buildContextualDictionaryPrompt(
  term: string,
  surroundingParagraph?: string,
  bookTitle?: string
): string {
  return `You are a specialist in classical Arabic lexicography and academic terminology.
Please explain the term "${term}" as used in the following context${bookTitle ? ` from "${bookTitle}"` : ''}:

${surroundingParagraph ? `Surrounding Context:\n"${surroundingParagraph}"\n\n` : ''}
Provide:
1. **Linguistic Origin (المعنى اللغوي):** Lexical root and primary meaning.
2. **Contextual & Terminological Meaning (المعنى الاصطلاحي والسياقي):** How it functions in this specific passage (e.g. in Fiqh, Usul, philosophy, or rhetoric).
3. **Nuance / Usage (الفائدة اللطيفة):** Any subtle distinction or classical usage the reader should know.
Format clearly with concise markdown.`;
}

/**
 * Builds prompt for Structured Summaries: key arguments, bulleted evidence, citations.
 */
export function buildStructuredSummaryPrompt(
  chapterOrPassageText: string,
  bookTitle: string,
  pageNumber: number
): string {
  return `Please provide a structured, high-yield academic summary of the following text from "${bookTitle}" (Page ${pageNumber}):

"""
${chapterOrPassageText}
"""

Structure the response as follows:
- **📌 Main Central Thesis (الأطروحة المركزية)**
- **🔍 Key Arguments & Logical Points (أهم المحاور والاستدلالات)**
- **📜 Direct Supporting Quotes (نصوص وشواهد بارزة)**
- **💡 Practical / Scholarly Takeaway (خلاصة الباحث)**

Keep it structured, insightful, and suitable to be saved directly as a permanent research note.`;
}

/**
 * Builds prompt for Biographical Queries (Tarajim / تراجم الأعلام والشخصيات).
 */
/** Topics only: naming a book or scholar here would be an unchecked citation. */
export function buildCurriculumDraftPrompt(subject: string, language: 'ar' | 'en'): { systemPrompt: string; userPrompt: string; temperature: number } {
  return {
    systemPrompt: `You draft study outlines the learner will edit. Reply only with the outline, in ${language === 'ar' ? 'Arabic' : 'English'}.
A line starting with # opens a stage. Every other line is one study step. Use 3 to 6 stages and at most 30 steps.
Describe topics and skills only. Do not name books, authors or scholars, and do not quote or cite any text.`,
    userPrompt: subject,
    temperature: 0.4,
  };
}

export function buildBiographicalTarajimPrompt(
  personName: string,
  contextText?: string
): string {
  return `You are an expert in biographical dictionaries and historical documentation (علم التراجم والرجال).
Provide a concise scholarly biography for: **${personName}**${contextText ? ` mentioned in the context: "${contextText}"` : ''}.

Include:
- **Full Name, Lineage & Era (الاسم والنسب والطبقة):** Birth / Death dates (Hijri and CE).
- **Notable Teachers & Scholars (أبرز الشيوخ والتلاميذ)**
- **Major Contributions & Works (أهم المصنفات والآثار العلمية)**
- **Scholarly Standing (مكانته العلمية وثناء العلماء عليه)**
Keep the response factual, concise, and academically referenced.`;
}

/**
 * Builds prompt for Bilingual Inline Translation.
 */
export function buildTranslationPrompt(
  text: string,
  targetLang: string = 'en',
  bookTitle?: string
): string {
  const isTargetAr = targetLang.toLowerCase().startsWith('ar');
  return `You are an expert literary and academic translator specializing in scholarly and classical works.
Translate the following passage into ${isTargetAr ? 'classical, eloquent Arabic (عربية فصيحة رصينة)' : 'idiomatic, high-fidelity English'}${bookTitle ? ` from "${bookTitle}"` : ''}.

Preserve:
1. Precise terminology and nuances.
2. Tone and rhetorical rhythm.
3. Clarity and idiomatic flow.

Text to translate:
"""
${text}
"""

Output only the polished translation without meta commentary.`;
}
