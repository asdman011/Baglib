/**
 * Baglib — Robust Filename Metadata Parser
 *
 * Extracts bibliographic candidates (title, author, translator, publisher, year, edition, ISBN, investigator)
 * from local book filenames across English, Arabic, and mixed text.
 *
 * Developed and verified against real-world digital libraries (Anna's Archive, LibGen, Noor-Book,
 * Classical Arabic critical editions, and catalog collections).
 *
 * Core principles:
 * - Non-destructive: Preserves canonical Arabic diacritics and exact original spelling.
 * - Layered extraction: Recognizes structural paradigms (Anna's Archive, LibGen, Arabic Critical Editions)
 *   while maintaining robust generic fallback parsing.
 * - Checksum-verified ISBN extraction (ISBN-10 and ISBN-13).
 * - Cultural and linguistic awareness (Arabic attribution particles, honorifics, prayers, critical editions).
 */

import path from 'path';
import { isValidIsbn10, isValidIsbn13, isValidIsbn } from '../../../shared/validators/metadata-validator';

export interface ParsedFilenameMetadata {
  originalFilename: string;
  cleanedFilename: string;
  title?: string;
  titleConfidence: number;
  authors: string[];
  authorConfidence: number;
  translators: string[];
  translatorConfidence: number;
  publisher?: string;
  publisherConfidence: number;
  publicationYear?: number;
  yearConfidence: number;
  edition?: string;
  editionConfidence: number;
  isbn?: string;
  isbn10?: string;
  isbn13?: string;
  isbnConfidence: number;
  language?: 'ar' | 'en' | 'mixed';
  overallConfidence: number;
  investigator?: string;
  investigatorConfidence?: number;
}

// Common irrelevant sharing/tracker tokens and site brands to strip out cleanly
const TRACKER_TAG_PATTERNS = [
  /\[\s*(?:z-lib|libgen|annas-archive|oceanofpdf|vk|pdfdrive)[^\]]*\]/gi,
  /\(\s*(?:z-lib(?:\.sk|\.org|\.is|\.li)?|libgen(?:\.li|\.rs|\.is|\.lc)?|1lib\.sk|annas-archive|oceanofpdf|vk|pdfdrive|z-library)[^\)]*\)/gi,
  /\b(?:z-lib(?:\.org|\.is|\.li|\.sk)?|b-ok(?:\.org)?|libgen(?:\.li|\.rs|\.is|\.lc)?|1lib\.sk|oceanofpdf(?:\.com)?|annas-archive(?:\.org|\.li|\.gl)?)\b/gi,
  /\s*\(\s*\d{1,2}\s*\)\s*(?=\.[^.]+$|$)/g, // e.g. " (1)" duplicate download indicator
  /\s*\[\s*\d{1,2}\s*\]\s*(?=\.[^.]+$|$)/g, // e.g. " [1]"
  /\s*-\s*copy(?:\s*\(\d+\))?\b/gi,
  /\s*[-_]\s*libgen\.(?:li|rs|is|lc|org)\b.*$/i,
  /\s*[-_]\s*Ktaab\.com\b.*$/i,
  /\s*(?:كتاب\s+)?اقرأ?\s+اونلاين.*$/i,
  /\s*---\s*.*\(مؤلف\).*$/,
  /\s*\(\s*مقدمة\s*\)$/,
  /\s*نسخة\s+مصورة(?:\s+\d+)?$/i,
];

// Arabic role markers
const ARABIC_TRANSLATOR_PREFIX = /(?:^|\s)(?:ترجمة|المترجم|نقل|تعريب)(?::|\s)\s*/i;
const ARABIC_AUTHOR_PREFIX = /(?:^|\s)(?:بقلم|تأليف|لـ|للمؤلف|المؤلف)(?::|\s)\s*/i;
const ARABIC_PUBLISHER_LABEL_PREFIX = /^(?:دار\s+النشر|الناشر)\s*:\s*/i;
const ARABIC_PUBLISHER_PREFIX = /(?:^|\s)(?:دار\s+النشر|الناشر)(?::|\s)\s*/i;
const ARABIC_PUBLISHER_FULL_PREFIX = /^(?:دار\s+|منشورات\s+|مؤسسة\s+|مطبعة\s+|مركز\s+|مكتبة\s+|دار\s+النشر$)/i;
const ARABIC_EDITION_PATTERN = /(?:الطبعة\s+[^\s\-\(\)\[\]]+|ط\s*\d+)/i;

// English role markers
const ENGLISH_TRANSLATOR_PREFIX = /(?:^|\s)(?:translated\s+by|translator:?)\s+/i;
const ENGLISH_AUTHOR_PREFIX = /(?:^|\s)(?:written\s+by|by|author:?)\s+/i;
const ENGLISH_PUBLISHER_PREFIX = /(?:^|\s)(?:published\s+by|publisher:?)\s+/i;
const ENGLISH_EDITION_PATTERN = /(?:\b\d+(?:st|nd|rd|th)?\s+(?:ed\.?|edition)\b|\b(?:first|second|third|fourth|fifth|revised|anniversary)\s+edition\b)/i;

// Known global publisher names & imprints (expanded with real-world libraries)
const KNOWN_PUBLISHERS = new Set([
  "o'reilly",
  "o'reilly media",
  "o reilly",
  "oreilly",
  "oreilly media",
  "addison-wesley",
  "addison wesley",
  "prentice hall",
  "mcgraw-hill",
  "mcgraw-hill school",
  "mcgraw hill",
  "pearson",
  "pearson education",
  "pearson education limited",
  "pearson education esl",
  "wiley",
  "john wiley",
  "john wiley & sons",
  "springer",
  "packt",
  "packt publishing",
  "manning",
  "manning publications",
  "cambridge",
  "cambridge university press",
  "oxford",
  "oxford university press",
  "mit press",
  "harvard university press",
  "routledge",
  "harpercollins",
  "harper collins",
  "harper wave",
  "penguin",
  "penguin books",
  "penguin random house",
  "random house",
  "simon & schuster",
  "simon and schuster",
  "macmillan",
  "no starch press",
  "no starch",
  "apress",
  "wrox",
  "wrox press",
  "for dummies",
  "dummies",
  "bloomsbury",
  "hachette",
  "vintage",
  "anchor books",
  "anchor",
  "tor books",
  "baen",
  "del rey",
  "bantam",
  "yale university press",
  "verso",
  "cengage",
  "cengage learning",
  "elsevier",
  "academic press",
  "de gruyter",
  "brill",
  "haynes",
  "scholastic",
  "free press",
  "farrar, straus and giroux",
  "farrar straus and giroux",
  "dover",
  "dover publications",
  "amana publications",
  "amana publ.",
  "gorgias press",
  "oneworld publications",
  "oneworld",
  "mariner books",
  "henry holt",
  "henry holt and co.",
  "cornell university press",
  "crc press",
  "crc",
  "metropolitan books",
  "hodder arnold",
  "butterworth-heinemann",
  "university of chicago press",
  "healing arts press",
  "open university press",
  "international institute of islamic thought",
  // Arabic Publishers
  "دار المعارف",
  "المعارف",
  "دار سينا",
  "دار العروبة",
  "العروبة",
  "دار الفكر",
  "دار الشروق",
  "دار القلم",
  "مؤسسة الرسالة",
  "المكتب الإسلامي",
  "دار ابن حزم",
  "دار النفائس",
  "دار الكتب العلمية",
  "مكتبة العبيكان",
  "دار المنهاج",
  "دار السلام",
  "دار الوطن",
  "دار صادر",
  "دار الغرب الإسلامي",
]);

// English publisher suffixes
const ENGLISH_PUBLISHER_SUFFIX_REGEX = /\b(?:press|publishing|publishers?|publications?|media|house|imprint|books|editions?|company|co\.|ltd|inc|group)\b/i;

// Arabic publisher keywords and prefixes
const ARABIC_PUBLISHER_PREFIX_REGEX = /^(?:دار\s+|منشورات\s+|مؤسسة\s+|مطبعة\s+|مركز\s+|مكتبة\s+|هيئة\s+|مجمع\s+|جامعة\s+|عالم\s+الكتب|الهيئة\s+العامة|الدار\s+المصرية|الدار\s+العربية|المؤسسة\s+العربية)/i;

// Subtitle prefix / pattern identifiers
const SUBTITLE_INDICATOR_REGEX = /^(?:a|an)\s+(?:guide|handbook|introduction|comprehensive|practical|complete|modern|systems?|behavioral|craftsman'?s|definitive|companion|survey|history|story|rise|fall|approach|perspective|overview|study|manual|primer|tutorial|reference)\b/i;
const SUBTITLE_OF_REGEX = /^(?:elements|principles|foundations|fundamentals|concepts|introduction|theory|methods?|techniques?|essentials?|practice|applications?)\s+of\b/i;
const SUBTITLE_HOWTO_REGEX = /^(?:how\s+to|why|what|when)\b/i;
const SUBTITLE_PHRASE_REGEX = /^(?:in\s+\d+\s+(?:hours|days|weeks|steps)|for\s+(?:beginners|dummies|pros|programmers|students|professionals)|early\s+transcendentals|theory\s+and\s+practice|concepts\s+and\s+applications|design\s+and\s+implementation)\b/i;
const SUBTITLE_SERIES_REGEX = /^(?:vol\.?|volume|part|ch\.?|chapter|book|no\.?|العدد|الجزء|المجلد|القسم|الطبعه|طبعة)\s*[\divxlcdm]+/i;
const ARABIC_SUBTITLE_INDICATOR_REGEX = /^(?:دراسة\s+وتحقيق|تحقيق\s+ودراسة|شرح\s+وتعليق|دراسة\s+نقدية|قراءة\s+معاصرة|رؤية\s+نقدية|شرح\s+|تحقيق\s+|دراسة\s+|تلخيص\s+|تهذيب\s+|مختصر\s+|تعليق\s+|تخريج\s+|مدخل\s+إلى|مقدمة\s+في|أصول\s+|مبادئ\s+|الجزء|المجلد|القسم)/i;

// Nouns that characterize book titles, subtitles, or topics — not author names
const NON_AUTHOR_TITLE_WORDS = /\b(?:book|title|author|publisher|novel|story|vol|volume|part|guide|handbook|introduction|elements|principles|fundamentals|architecture|patterns|programming|algorithms|approach|concepts|applications|practice|definitive|comprehensive|practical|advanced|beginning|mastering|essential|crash\s+course|cookbook|tutorial|reference|solutions?|manual|workbook|textbook|code|system|design|software|computer|data|learning|database|web|cloud|network|security|calculus|physics|economics|edition)\b/i;

const ARABIC_NON_AUTHOR_TITLE_WORDS = /(?:^|\s)(?:كتاب|الكتاب|شرح|الشرح|تحقيق|التحقيق|دراسة|الدراسة|تلخيص|تهذيب|مختصر|حاشية|تعليق|تخريج|سلسلة|تاريخ|التاريخ|رواية|الرواية|قصة|القصة|ديوان|الديوان|صحيح|سنن|تفسير|التفسير|معجم|المعجم|أصول|الأصول|فقه|الفقه|علوم|العلوم|دراسات|منهاج|المنهاج|مقدمة|المقدمة|أدب|الأدب|شعر|الشعر|لسان|بيان)(?:\s|$)/;

export class FilenameParser {
  /**
   * Main entry point: Parses a file path or filename into candidate bibliographic fields with confidence scores.
   */
  static parse(filePathOrName: string): ParsedFilenameMetadata {
    if (!filePathOrName || typeof filePathOrName !== 'string') {
      return this.createEmptyResult(filePathOrName || '');
    }

    // 1. Extract base name without directory path
    const rawBaseName = path.basename(filePathOrName);

    // 2. Remove file extension
    const extMatch = rawBaseName.match(/\.([a-zA-Z0-9]{2,6})$/);
    let nameWithoutExt = extMatch ? rawBaseName.slice(0, extMatch.index) : rawBaseName;

    // 3. PARADIGM 1: Anna's Archive Multi-Segment Pattern (`--`)
    if (
      nameWithoutExt.includes('--') &&
      (nameWithoutExt.includes("Anna’s Archive") ||
        nameWithoutExt.includes("Anna's Archive") ||
        nameWithoutExt.includes("Anna’s Ar") ||
        /--\s*[a-f0-9]{32}\s*--/i.test(nameWithoutExt) ||
        /--\s*(?:isbn13\s*)?97[89]\d{10}\s*--/i.test(nameWithoutExt))
    ) {
      const annasResult = this.parseAnnasArchivePattern(rawBaseName, nameWithoutExt);
      if (annasResult) return annasResult;
    }

    // 4. Clean tracker tags & file-management noise
    let workingString = nameWithoutExt;
    for (const tagPattern of TRACKER_TAG_PATTERNS) {
      workingString = workingString.replace(tagPattern, ' ');
    }
    workingString = workingString.replace(/[\(\[]\s*[\)\]]/g, ' ');

    // Normalize underscores: replace "_-_" with " - "
    workingString = workingString.replace(/_-_/g, ' - ');
    // If not LibGen multi-author pattern ("Last, First_Last, First_..."), convert underscores to spaces
    if (!/^[A-Z\p{L}'-]+,\s*[A-Z\p{L}\s.'-]+_/u.test(workingString)) {
      workingString = workingString.replace(/_\s+/g, ': ').replace(/_/g, ' ');
    }

    // Strip site brand prefixes: "Noor-Book.com ", "مكتبة نور "
    workingString = workingString.replace(/^(?:Noor-Book\.com|مكتبة\s+نور)\s+/i, '');
    workingString = workingString.replace(/^\[\d{5,8}\]\s*---\s*/, '');
    workingString = workingString.replace(/^\d{2,4}-\d{2}-\d{4}-\d{6}/, ''); // Download timestamp "31-10-2020-084952"

    // Strip leading track / index / series prefixes (e.g., "01 - ", "01. ", "[01] ", "Vol. 1 - ", "3716 - ")
    const LEADING_INDEX_REGEX = /^(?:\[\s*\d{1,5}\s*\]|\(\s*\d{1,5}\s*\)|\b(?:vol|v|part|ch|ج|العدد|الجزء)\.?\s*\d{1,5}\s*[-–—.]?|\d{1,5}\s*[-–—.]\s*)\s*/i;
    workingString = workingString.replace(LEADING_INDEX_REGEX, '');
    workingString = workingString.replace(/\s+/g, ' ').trim();

    // Determine language affinity
    const hasArabic = /[\u0600-\u06FF]/.test(workingString);
    const hasLatin = /[a-zA-Z]/.test(workingString);
    const language: 'ar' | 'en' | 'mixed' | undefined =
      hasArabic && hasLatin ? 'mixed' : hasArabic ? 'ar' : hasLatin ? 'en' : undefined;

    // 5. PARADIGM 2: Parenthetical Publisher and Year (LibGen format: e.g. "(1992, Free Press)", "(2013, Healing Arts Press)")
    const parentheticalPub = this.extractParentheticalPublisherAndYear(workingString);
    let extractedPublisher = parentheticalPub.publisher;
    let extractedYear = parentheticalPub.year;
    let publisherConfidence = parentheticalPub.publisherConfidence;
    let yearConfidence = parentheticalPub.yearConfidence;
    workingString = parentheticalPub.remainingText;

    // 6. Detect and extract ISBN (with checksum verification)
    const isbnResult = this.extractAndRemoveIsbn(workingString);
    workingString = isbnResult.remainingText.replace(/[\(\[]\s*[\)\]]/g, ' ').replace(/\s+/g, ' ').trim();

    // 7. Detect and extract Publication Year (if not already extracted from parenthetical)
    if (!extractedYear) {
      const yearResult = this.extractAndRemoveYear(workingString);
      extractedYear = yearResult.year;
      yearConfidence = yearResult.confidence;
      workingString = yearResult.remainingText;
    }

    // 8. Detect and extract Edition
    const editionResult = this.extractAndRemoveEdition(workingString);
    workingString = editionResult.remainingText;

    // 9. PARADIGM 3: Arabic Critical Edition, Attribution, and Cultural Attributes
    const arabicCultural = this.extractArabicCulturalAttributes(workingString);
    workingString = arabicCultural.remainingText;

    // 10. Parse remaining segments & parentheticals for Title, Author, Translator, Publisher
    const semanticResult = this.extractSemanticFields(workingString, {
      hasYear: !!extractedYear,
      hasEdition: !!editionResult.edition,
      existingPublisher: extractedPublisher,
      existingAuthors: arabicCultural.authors,
      existingInvestigator: arabicCultural.investigator,
    });

    // Merge publishers and authors
    const finalPublisher = extractedPublisher || semanticResult.publisher || arabicCultural.publisher;
    const finalPublisherConfidence = extractedPublisher ? publisherConfidence : semanticResult.publisherConfidence;
    const finalAuthors = semanticResult.authors.length > 0 ? semanticResult.authors : arabicCultural.authors;
    const finalAuthorConfidence = semanticResult.authors.length > 0 ? semanticResult.authorConfidence : arabicCultural.authorConfidence;
    const finalTranslators = [...semanticResult.translators, ...arabicCultural.translators];
    const finalTranslatorConfidence = Math.max(semanticResult.translatorConfidence, arabicCultural.translatorConfidence);

    // 11. Calculate overall confidence
    const overallConfidence = this.calculateOverallConfidence({
      titleConfidence: semanticResult.titleConfidence,
      authorConfidence: finalAuthorConfidence,
      isbnConfidence: isbnResult.confidence,
      yearConfidence,
      publisherConfidence: finalPublisherConfidence,
      translatorConfidence: finalTranslatorConfidence,
    });

    return {
      originalFilename: rawBaseName,
      cleanedFilename: workingString,
      title: semanticResult.title,
      titleConfidence: semanticResult.titleConfidence,
      authors: finalAuthors,
      authorConfidence: finalAuthorConfidence,
      translators: finalTranslators,
      translatorConfidence: finalTranslatorConfidence,
      publisher: finalPublisher,
      publisherConfidence: finalPublisherConfidence,
      publicationYear: extractedYear,
      yearConfidence,
      edition: editionResult.edition,
      editionConfidence: editionResult.confidence,
      isbn: isbnResult.isbn,
      isbn10: isbnResult.isbn10,
      isbn13: isbnResult.isbn13,
      isbnConfidence: isbnResult.confidence,
      language,
      overallConfidence,
      investigator: arabicCultural.investigator,
      investigatorConfidence: arabicCultural.investigatorConfidence,
    };
  }

  /**
   * Dedicated multi-segment parser for Anna's Archive filenames:
   * e.g., "50 Secrets of Magic Craftsmanship -- Dalí, Salvador [Dalí, Salvador] -- 2012 -- Dover Publications -- 9780486271323 -- 6a2f... -- Anna’s Archive.pdf"
   */
  private static parseAnnasArchivePattern(
    originalFilename: string,
    textWithoutExt: string
  ): ParsedFilenameMetadata | null {
    const segments = textWithoutExt
      .split(/\s*--\s*/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (segments.length < 3) return null;

    let title = segments[0]
      .replace(/_\s+/g, ': ')
      .replace(/[{}]/g, '')
      .replace(/[\(\[]\s*[\)\]]/g, '')
      .trim();

    // Segment 1: Authors
    let rawAuthor = segments[1].replace(/\[[^\]]+\]/g, '').trim();
    const rawTokens = rawAuthor.split(/;\s*|\s*,\s*(?=[A-Z\p{L}])/u);
    const authors: string[] = [];

    for (const tok of rawTokens) {
      let clean = tok.replace(/,\s*\d{4}.*$/, '').trim(); // strip birth/death years ", 1918-1986"
      clean = clean.replace(/^_|_$/g, '').replace(/_/g, ' ').trim();
      if (clean.length < 2 || /^\d+$/.test(clean)) continue;

      const inverted = clean.match(/^([^,]+),\s*([^,]+)$/);
      authors.push(inverted ? `${inverted[2].trim()} ${inverted[1].trim()}` : clean);
    }

    const uniqueAuthors = Array.from(new Set(authors));

    let publisher: string | undefined;
    let publicationYear: number | undefined;
    let edition: string | undefined;
    let isbn: string | undefined;
    let isbn10: string | undefined;
    let isbn13: string | undefined;

    for (let i = 2; i < segments.length; i++) {
      const seg = segments[i];
      if (/Anna’s|Anna's/i.test(seg) || /^[a-f0-9]{32}$/i.test(seg)) continue;

      // ISBN check
      const isbnMatch = seg.match(/(?:isbn13\s*)?(97[89][0-9]{10}|[0-9]{9}[0-9X])/i);
      if (isbnMatch && !isbn) {
        const cleanIsbn = isbnMatch[1].toUpperCase();
        if (cleanIsbn.length === 13 && isValidIsbn13(cleanIsbn)) {
          isbn = cleanIsbn;
          isbn13 = cleanIsbn;
        } else if (cleanIsbn.length === 10 && isValidIsbn10(cleanIsbn)) {
          isbn = cleanIsbn;
          isbn10 = cleanIsbn;
        }
        if (isbn) continue;
      }

      // Year check
      const yrMatch = seg.match(/\b(18\d\d|19\d\d|20[0-2]\d)\b/);
      if (yrMatch && !publicationYear) {
        publicationYear = parseInt(yrMatch[1], 10);
      }

      // Edition check
      const edMatch = seg.match(/(?:\b\d+(?:st|nd|rd|th)?\s+(?:ed\.?|edition)\b|\b(?:First|Second|Third|Fourth|Fifth)\s+Edition\b)/i);
      if (edMatch && !edition) {
        edition = edMatch[0];
      }

      // Publisher check
      if (
        (FilenameParser.isRecognizedPublisher(seg) ||
          /(?:Press|Books|Publications?|Publishing|House|Metropolitan|Dover|Pearson|McGraw-Hill|CRC|Harper|Macmillan|Oxford|Cambridge)/i.test(seg)) &&
        !publisher &&
        !/^[0-9,\s]+$/.test(seg)
      ) {
        publisher = seg.replace(/^[0-9,\s]+/, '').trim();
      }
    }

    const hasArabic = /[\u0600-\u06FF]/.test(title);
    const hasLatin = /[a-zA-Z]/.test(title);
    const language: 'ar' | 'en' | 'mixed' | undefined =
      hasArabic && hasLatin ? 'mixed' : hasArabic ? 'ar' : hasLatin ? 'en' : undefined;

    return {
      originalFilename,
      cleanedFilename: textWithoutExt,
      title,
      titleConfidence: 0.95,
      authors: uniqueAuthors,
      authorConfidence: uniqueAuthors.length > 0 ? 0.9 : 0,
      translators: [],
      translatorConfidence: 0,
      publisher,
      publisherConfidence: publisher ? 0.9 : 0,
      publicationYear,
      yearConfidence: publicationYear ? 0.9 : 0,
      edition,
      editionConfidence: edition ? 0.85 : 0,
      isbn,
      isbn10,
      isbn13,
      isbnConfidence: isbn ? 1.0 : 0,
      language,
      overallConfidence: 0.95,
    };
  }

  /**
   * Extracts parenthetical publisher and year combinations common in LibGen and online catalogs:
   * e.g., "(1992, Free Press)", "(2010, McGraw-Hill_Open University Press)", "(Farrar, Straus and Giroux)", "-Gorgias Press (2019)"
   */
  private static extractParentheticalPublisherAndYear(text: string): {
    publisher?: string;
    publisherConfidence: number;
    year?: number;
    yearConfidence: number;
    remainingText: string;
  } {
    let working = text;
    let publisher: string | undefined;
    let publisherConfidence = 0;
    let year: number | undefined;
    let yearConfidence = 0;

    // Pattern A: "(1992, Free Press)" or "(2012, Farrar, Straus and Giroux)"
    const yearPubMatch = working.match(/\(\s*(\d{4})\s*,\s*([^\)]+)\)/);
    if (yearPubMatch) {
      year = parseInt(yearPubMatch[1], 10);
      yearConfidence = 0.9;
      publisher = yearPubMatch[2].replace(/_/g, ' ').trim();
      publisherConfidence = 0.85;
      working = working.replace(yearPubMatch[0], ' ');
      return { publisher, publisherConfidence, year, yearConfidence, remainingText: working };
    }

    // Pattern B: Suffix publisher with year: "-Gorgias Press (2019)" or "-Oneworld Publications (2014)"
    const sufPubMatch = working.match(/[-–—]\s*([A-Z][a-zA-Z\s&]+(?:Press|Publications?|Books|Publishing))\s*\((\d{4})\)/);
    if (sufPubMatch) {
      publisher = sufPubMatch[1].trim();
      publisherConfidence = 0.9;
      year = parseInt(sufPubMatch[2], 10);
      yearConfidence = 0.9;
      working = working.replace(sufPubMatch[0], ' ');
      return { publisher, publisherConfidence, year, yearConfidence, remainingText: working };
    }

    // Pattern C: Parenthetical publisher alone: "(Farrar, Straus and Giroux)"
    const parenPubMatch = working.match(/\(\s*([^\)]+)\s*\)$/);
    if (parenPubMatch) {
      const candidate = parenPubMatch[1].trim();
      if (FilenameParser.isRecognizedPublisher(candidate)) {
        publisher = candidate;
        publisherConfidence = 0.85;
        working = working.replace(parenPubMatch[0], ' ');
      }
    }

    return { publisher, publisherConfidence, year, yearConfidence, remainingText: working };
  }

  /**
   * Extracts Arabic cultural and publishing metadata:
   * - Critical Edition Investigator: "تحقيق محمود شاكر", "ت. طه الحاجري", "صنعة السكري", "برواية الصولي"
   * - Arabic Translator: "ترجمة ابراهيم سالم"
   * - Arabic Publisher: "طبعة دار سينا", "ط المعارف", "ط. دار المعارف"
   * - Arabic Attribution Particle (Lām): "البخلاء للجاحظ", "الماجريات لإبراهيم السكران", "للأستاذ محمود شاكر"
   * - Arabic Diwan / Poetic anthology: "ديوان امرئ القيس"
   */
  private static extractArabicCulturalAttributes(text: string): {
    investigator?: string;
    investigatorConfidence?: number;
    translators: string[];
    translatorConfidence: number;
    publisher?: string;
    authors: string[];
    authorConfidence: number;
    remainingText: string;
  } {
    let working = text;
    let investigator: string | undefined;
    let investigatorConfidence = 0;
    const translators: string[] = [];
    let translatorConfidence = 0;
    let publisher: string | undefined;
    const authors: string[] = [];
    let authorConfidence = 0;

    // 1. Investigator / Critical Editor (`تحقيق` / `ت.` / `صنعة` / `برواية` / `عناية`)
    const invMatch = working.match(
      /(?:\s+[-_]?\s*|\s+)(?:تحقيق|ت\.|ت\s|صنعة|برواية|عناية)\s+([\p{L}\s]+?)(?:\s*[-_]\s*|\s+ط\s*|\s+طبعة|\s+القسم|\s*$)/u
    );
    if (invMatch) {
      const rawInv = invMatch[1].replace(/^(?:الدكتور|الأستاذ|الشيخ|الإمام)\s+/, '').trim();
      if (rawInv.length >= 3 && !/^(?:دار|طبعة|مكتبة)/.test(rawInv)) {
        investigator = rawInv;
        investigatorConfidence = 0.9;
        working = working.replace(invMatch[0], ' ');
      }
    }

    // 2. Arabic Translator (`ترجمة ابراهيم سالم بن عامر`)
    const transMatch = working.match(/(?:\s+[-_]?\s*|\s+)ترجمة\s+([\p{L}\s]+?)(?:\s*[-_]\s*|\s*$)/u);
    if (transMatch) {
      const transName = transMatch[1].trim();
      if (transName.length >= 3) {
        translators.push(transName);
        translatorConfidence = 0.95;
        working = working.replace(transMatch[0], ' ');
      }
    }

    // 3. Arabic Publisher (`ط المعارف` / `ط. دار المعارف` / `طبعة دار سينا`)
    // Must be preceded by start or space and followed by dot or space to avoid matching letters inside words (e.g. مصطفى)
    const pubMatch = working.match(/(?:^|\s)(?:ط\.?\s*|ط\s+|طبعة\s+)(دار\s+[\p{L}\s]+|[\p{L}\s]+?)(?:\s*[-_]\s*|\s*$)/u);
    if (pubMatch) {
      let pubName = pubMatch[1].trim();
      if (pubName.startsWith('المعارف')) pubName = 'دار المعارف';
      if (pubName.length >= 3 && !/^(?:الأولى|الثانية|الثالثة|الرابعة|الخامسة|السادسة)/.test(pubName)) {
        publisher = pubName;
        working = working.replace(pubMatch[0], ' ');
      }
    }

    // 4. Arabic Attribution Particle (`لـ` / `للـ` / `لأبي` / `لابن` / `للشيخ` / `للأستاذ` / `للدكتور`)
    // Preceded by boundary, requiring definite article or specific honorific
    const arAuthorMatch = working.match(
      /(?:[،,]\s*|\s+[-_]\s*|\s+)(?:لـ\s*|للشيخ\s+|للإمام\s+|للدكتور\s+|للأستاذ\s+|للعلامة\s+|للسيد\s+|للقاضي\s+|لأبي\s+|لابن\s+|لل(?=[\p{L}]))([\p{L}\s]+?)(?:\s*[-_]\s*|\s*$)/u
    );
    if (arAuthorMatch) {
      const fullMatch = arAuthorMatch[0];
      let candidate = arAuthorMatch[1].trim();

      if (fullMatch.includes('لأبي')) candidate = 'أبو ' + candidate;
      else if (fullMatch.includes('لابن')) candidate = 'ابن ' + candidate;
      else if (fullMatch.includes('لل')) candidate = 'ال' + candidate;

      // Strip honorific prayers: "رحمه الله", "رضي الله عنه", "حفظه الله", "عفا عنه"
      candidate = candidate.replace(/\s*(?:رحمه\s+الله|رضي\s+الله\s+عنه|حفظه\s+الله|عفا\s+عنه).*$/, '').trim();

      // Guard against non-authors (poetic meters, publishers, parts)
      if (candidate.length >= 3 && !/^(?:طبعة|دار|تحقيق|مجلد|جزء|كتاب|امية|يلى|نخبة)/.test(candidate)) {
        authors.push(candidate);
        authorConfidence = 0.85;
        working = working.replace(arAuthorMatch[0], ' ');
      }
    }

    return {
      investigator,
      investigatorConfidence,
      translators,
      translatorConfidence,
      publisher,
      authors,
      authorConfidence,
      remainingText: working,
    };
  }

  /**
   * Extracts ISBN from filename and verifies checksum.
   */
  private static extractAndRemoveIsbn(text: string): {
    isbn?: string;
    isbn10?: string;
    isbn13?: string;
    confidence: number;
    remainingText: string;
  } {
    const isbnRegex = /(?:\[|\(|\b)(?:ISBN(?:-?1[03])?:?\s*)?(97[89][-\s]?[0-9]{1,5}[-\s]?[0-9]+[-\s]?[0-9]+[-\s]?[0-9]|[0-9]{1,5}[-\s]?[0-9]+[-\s]?[0-9]+[-\s]?[0-9X])(?:\]|\)|\b)/i;
    const match = text.match(isbnRegex);

    if (match) {
      const candidateRaw = match[1];
      const cleanCandidate = candidateRaw.replace(/[-\s]/g, '').toUpperCase();

      if (cleanCandidate.length === 13 && isValidIsbn13(cleanCandidate)) {
        const remaining = text.replace(match[0], ' ').replace(/\s+/g, ' ').trim();
        return {
          isbn: cleanCandidate,
          isbn13: cleanCandidate,
          confidence: 1.0,
          remainingText: remaining,
        };
      } else if (cleanCandidate.length === 10 && isValidIsbn10(cleanCandidate)) {
        const remaining = text.replace(match[0], ' ').replace(/\s+/g, ' ').trim();
        return {
          isbn: cleanCandidate,
          isbn10: cleanCandidate,
          confidence: 1.0,
          remainingText: remaining,
        };
      }
    }

    return { confidence: 0, remainingText: text };
  }

  /**
   * Extracts 4-digit publication year (1800-2099) from parentheses, brackets, or isolated tokens.
   */
  private static extractAndRemoveYear(text: string): {
    year?: number;
    confidence: number;
    remainingText: string;
  } {
    // 1. Explicit in parentheses/brackets e.g. (2022) or [1999] or (1980م)
    const bracketYearRegex = /[\(\[]\s*(18\d{2}|19\d{2}|20\d{2})(?:م|\s*h)?\s*[\)\]]/i;
    const bracketMatch = text.match(bracketYearRegex);
    if (bracketMatch) {
      const year = parseInt(bracketMatch[1], 10);
      const remaining = text.replace(bracketMatch[0], ' ').replace(/\s+/g, ' ').trim();
      return { year, confidence: 0.95, remainingText: remaining };
    }

    // 2. Check year separated by hyphens or at the very end: e.g. " - 2022" or "- 2022 -"
    const isolatedYearRegex = /(?:^|\s*[-–—]\s*)(18\d{2}|19\d{2}|20\d{2})(?:\s*[-–—]|\s*$)/;
    const isolatedMatch = text.match(isolatedYearRegex);
    if (isolatedMatch) {
      const year = parseInt(isolatedMatch[1], 10);
      const remaining = text.replace(isolatedMatch[0], ' ').replace(/\s+/g, ' ').trim();
      return { year, confidence: 0.85, remainingText: remaining };
    }

    return { confidence: 0, remainingText: text };
  }

  /**
   * Extracts edition phrases in English and Arabic.
   */
  private static extractAndRemoveEdition(text: string): {
    edition?: string;
    confidence: number;
    remainingText: string;
  } {
    // 1. English edition patterns
    const enMatch = text.match(ENGLISH_EDITION_PATTERN);
    if (enMatch) {
      const edition = enMatch[0].trim();
      const fullToken = text.match(new RegExp(`[\\(\\[]?\\s*${this.escapeRegex(edition)}\\s*[\\)\\]]?`, 'i'));
      const toRemove = fullToken ? fullToken[0] : enMatch[0];
      const remaining = text.replace(toRemove, ' ').replace(/\s+/g, ' ').trim();
      return { edition, confidence: 0.9, remainingText: remaining };
    }

    // 2. Arabic edition patterns
    const arMatch = text.match(ARABIC_EDITION_PATTERN);
    if (arMatch) {
      const edition = arMatch[0].trim();
      const fullToken = text.match(new RegExp(`[\\(\\[]?\\s*${this.escapeRegex(edition)}\\s*[\\)\\]]?`, 'i'));
      const toRemove = fullToken ? fullToken[0] : arMatch[0];
      const remaining = text.replace(toRemove, ' ').replace(/\s+/g, ' ').trim();
      return { edition, confidence: 0.9, remainingText: remaining };
    }

    return { confidence: 0, remainingText: text };
  }

  /**
   * Extracts Title, Author, Translator, Publisher from remaining text segments and labels.
   */
  private static extractSemanticFields(
    text: string,
    context: {
      hasYear: boolean;
      hasEdition: boolean;
      existingPublisher?: string;
      existingAuthors?: string[];
      existingInvestigator?: string;
    }
  ): {
    title?: string;
    titleConfidence: number;
    authors: string[];
    authorConfidence: number;
    translators: string[];
    translatorConfidence: number;
    publisher?: string;
    publisherConfidence: number;
  } {
    const authors: string[] = context.existingAuthors ? [...context.existingAuthors] : [];
    const translators: string[] = [];
    let publisher: string | undefined = context.existingPublisher;
    let authorConfidence = authors.length > 0 ? 0.85 : 0;
    let translatorConfidence = 0;
    let publisherConfidence = publisher ? 0.85 : 0;

    let working = text;

    // 1. Check leading bracketed author or publisher: e.g. "[Robert C. Martin] Clean Code"
    const leadingBracketMatch = working.match(/^[\(\[]([^\)\]]+)[\)\]]\s+(.+)$/);
    if (leadingBracketMatch) {
      const candidateInside = leadingBracketMatch[1].trim();
      const remainder = leadingBracketMatch[2].trim();
      if (!/\d{4}/.test(candidateInside) && !ENGLISH_EDITION_PATTERN.test(candidateInside) && !ARABIC_EDITION_PATTERN.test(candidateInside)) {
        if (FilenameParser.isRecognizedPublisher(candidateInside)) {
          publisher = candidateInside.replace(ARABIC_PUBLISHER_PREFIX, '').replace(ENGLISH_PUBLISHER_PREFIX, '').trim();
          publisherConfidence = 0.9;
        } else if (ARABIC_TRANSLATOR_PREFIX.test(candidateInside) || ENGLISH_TRANSLATOR_PREFIX.test(candidateInside)) {
          const transName = candidateInside.replace(ARABIC_TRANSLATOR_PREFIX, '').replace(ENGLISH_TRANSLATOR_PREFIX, '').trim();
          translators.push(...this.splitMultiAuthors(transName));
          translatorConfidence = 0.95;
        } else if (FilenameParser.isLikelyPersonName(candidateInside) || /,\s*|\s+(?:and|&|و)\s+/i.test(candidateInside)) {
          authors.push(...this.splitMultiAuthors(candidateInside));
          authorConfidence = 0.85;
        }
        working = remainder;
      }
    }

    // 2. Check trailing parenthetical author, publisher, or subtitle: e.g. "The Pragmatic Programmer (Andrew Hunt, David Thomas)"
    const parenAuthorMatch = working.match(/^([^\(\[]+)\s*[\(\[]([^\)\]]+)[\)\]]\s*$/);
    if (parenAuthorMatch) {
      const candidateInside = parenAuthorMatch[2].trim();
      if (!/\d{4}/.test(candidateInside) && !ENGLISH_EDITION_PATTERN.test(candidateInside) && !ARABIC_EDITION_PATTERN.test(candidateInside)) {
        if (FilenameParser.isRecognizedPublisher(candidateInside)) {
          publisher = candidateInside.replace(ARABIC_PUBLISHER_PREFIX, '').replace(ENGLISH_PUBLISHER_PREFIX, '').trim();
          publisherConfidence = 0.9;
          working = parenAuthorMatch[1].trim();
        } else if (ARABIC_TRANSLATOR_PREFIX.test(candidateInside) || ENGLISH_TRANSLATOR_PREFIX.test(candidateInside)) {
          const transName = candidateInside.replace(ARABIC_TRANSLATOR_PREFIX, '').replace(ENGLISH_TRANSLATOR_PREFIX, '').trim();
          translators.push(...this.splitMultiAuthors(transName));
          translatorConfidence = 0.95;
          working = parenAuthorMatch[1].trim();
        } else if (FilenameParser.isRecognizedSubtitle(candidateInside)) {
          working = `${parenAuthorMatch[1].trim()}: ${candidateInside}`;
        } else if (FilenameParser.isLikelyPersonName(candidateInside) || /,\s*|\s+(?:and|&|و)\s+/i.test(candidateInside)) {
          authors.push(...this.splitMultiAuthors(candidateInside));
          authorConfidence = 0.85;
          working = parenAuthorMatch[1].trim();
        }
      }
    }

    // 3. Check explicit author connector phrases: "Clean Code by Robert C. Martin", "CAPITAL ... BY KARL MARX", "عبقرية الصديق بقلم عباس العقاد"
    const byAuthorMatch = working.match(/^(.+?)\s+(?:written\s+by|by)\s+([^\-\(\)\[\]]+)$/i);
    const arabicByAuthorMatch = !byAuthorMatch ? working.match(/^(.+?)\s+(?:بقلم|تأليف|لـ|للمؤلف)\s+([^\-\(\)\[\]]+)$/i) : null;
    if (byAuthorMatch) {
      const titleCandidate = byAuthorMatch[1].trim();
      const authorCandidate = byAuthorMatch[2].trim();
      if (titleCandidate && authorCandidate) {
        authors.push(...this.splitMultiAuthors(authorCandidate));
        return {
          title: this.cleanTitle(titleCandidate),
          titleConfidence: 0.85,
          authors: Array.from(new Set(authors)),
          authorConfidence: 0.9,
          translators,
          translatorConfidence,
          publisher,
          publisherConfidence,
        };
      }
    } else if (arabicByAuthorMatch) {
      const titleCandidate = arabicByAuthorMatch[1].trim();
      const authorCandidate = arabicByAuthorMatch[2].trim();
      if (titleCandidate && authorCandidate) {
        authors.push(...this.splitMultiAuthors(authorCandidate));
        return {
          title: this.cleanTitle(titleCandidate),
          titleConfidence: 0.85,
          authors: Array.from(new Set(authors)),
          authorConfidence: 0.9,
          translators,
          translatorConfidence,
          publisher,
          publisherConfidence,
        };
      }
    }

    // 4. Split by major separators: " - ", " – ", " — ", " ~ "
    const segments = working
      .split(/\s*[-–—~]\s+|\s+[-–—~]\s*/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    let title: string | undefined;
    let titleConfidence = 0;

    const unassignedSegments: string[] = [];

    for (const segment of segments) {
      if (ARABIC_TRANSLATOR_PREFIX.test(segment) || ENGLISH_TRANSLATOR_PREFIX.test(segment)) {
        const transName = segment.replace(ARABIC_TRANSLATOR_PREFIX, '').replace(ENGLISH_TRANSLATOR_PREFIX, '').trim();
        translators.push(...this.splitMultiAuthors(transName));
        translatorConfidence = 0.95;
      } else if (ARABIC_AUTHOR_PREFIX.test(segment) || ENGLISH_AUTHOR_PREFIX.test(segment)) {
        const authorName = segment.replace(ARABIC_AUTHOR_PREFIX, '').replace(ENGLISH_AUTHOR_PREFIX, '').trim();
        authors.push(...this.splitMultiAuthors(authorName));
        authorConfidence = 0.9;
      } else if (ARABIC_PUBLISHER_LABEL_PREFIX.test(segment)) {
        publisher = segment.replace(ARABIC_PUBLISHER_LABEL_PREFIX, '').trim();
        publisherConfidence = 0.9;
      } else if (ARABIC_PUBLISHER_FULL_PREFIX.test(segment)) {
        publisher = segment.trim();
        publisherConfidence = 0.9;
      } else if (ENGLISH_PUBLISHER_PREFIX.test(segment)) {
        publisher = segment.replace(ENGLISH_PUBLISHER_PREFIX, '').trim();
        publisherConfidence = 0.9;
      } else {
        unassignedSegments.push(segment);
      }
    }

    // Helper for two segments
    const resolveTwoSegments = (segA: string, segB: string) => {
      // Check multi-author underscore pattern in segA: "Abu-Asab, Mones_Amri, Hakima..."
      if (segA.includes('_') && /^[A-Z\p{L}'-]+,\s*[A-Z\p{L}\s.'-]+_/u.test(segA)) {
        title = segB;
        titleConfidence = 0.85;
        authors.push(...this.splitMultiAuthors(segA));
        authorConfidence = 0.85;
        return;
      }

      // Check publisher in segB
      if (FilenameParser.isRecognizedPublisher(segB)) {
        publisher = segB;
        publisherConfidence = 0.85;
        title = segA;
        titleConfidence = 0.75;
        return;
      }

      // Check publisher in segA
      if (FilenameParser.isRecognizedPublisher(segA)) {
        publisher = segA;
        publisherConfidence = 0.85;
        title = segB;
        titleConfidence = 0.75;
        return;
      }

      // Check subtitle in segB
      if (FilenameParser.isRecognizedSubtitle(segB)) {
        title = `${segA}: ${segB}`;
        titleConfidence = 0.8;
        return;
      }

      // Check subtitle in segA
      if (FilenameParser.isRecognizedSubtitle(segA)) {
        title = `${segB}: ${segA}`;
        titleConfidence = 0.8;
        return;
      }

      // Check inverted author in segA e.g. "Martin, Robert C. - Clean Code"
      const isSegAInverted = /^[\p{L}'-]+,\s*[\p{L}\s.'-]+$/u.test(segA);
      if (isSegAInverted) {
        title = segB;
        titleConfidence = 0.85;
        authors.push(...this.splitMultiAuthors(segA));
        authorConfidence = 0.85;
        return;
      }

      // Check inverted author in segB e.g. "Clean Code - Martin, Robert C., 1818-1883"
      const isSegBInverted = /^[\p{L}'-]+,\s*[\p{L}\s.'-]+(?:,\s*\d{4}.*)?$/u.test(segB);
      if (isSegBInverted) {
        title = segA;
        titleConfidence = 0.85;
        authors.push(...this.splitMultiAuthors(segB));
        authorConfidence = 0.85;
        return;
      }

      // Disambiguation between Person and Title
      const isSegAPerson = FilenameParser.isLikelyPersonName(segA);
      const isSegBPerson = FilenameParser.isLikelyPersonName(segB);

      const isSegATitle =
        NON_AUTHOR_TITLE_WORDS.test(segA) ||
        ARABIC_NON_AUTHOR_TITLE_WORDS.test(segA.replace(/[\u064B-\u065F\u0670]/g, '')) ||
        /^(?:the|a|an)\s+/i.test(segA);

      const isSegBAuthor =
        isSegBPerson ||
        /author/i.test(segB) ||
        /المؤلف/i.test(segB);

      if (isSegAPerson && !isSegBPerson && !isSegBAuthor) {
        title = segB;
        titleConfidence = 0.8;
        authors.push(...this.splitMultiAuthors(segA));
        authorConfidence = 0.75;
        return;
      }

      if ((isSegBPerson || isSegBAuthor) && (!isSegAPerson || isSegATitle)) {
        title = segA;
        titleConfidence = 0.8;
        authors.push(...this.splitMultiAuthors(segB));
        authorConfidence = 0.75;
        return;
      }

      // If both appear as person names, check honorific priority:
      const normA = segA.replace(/[\u064B-\u065F\u0670]/g, '');
      const normB = segB.replace(/[\u064B-\u065F\u0670]/g, '');
      const hasHonorificA = /^(?:dr\.?|prof\.?|د\.?|دكتور|الشيخ|الإمام|الأستاذ|ابن|أبو)\s+/i.test(normA);
      const hasHonorificB = /^(?:dr\.?|prof\.?|د\.?|دكتور|الشيخ|الإمام|الأستاذ|ابن|أبو)\s+/i.test(normB);

      if (hasHonorificA && !hasHonorificB) {
        title = segB;
        titleConfidence = 0.8;
        authors.push(...this.splitMultiAuthors(segA));
        authorConfidence = 0.75;
        return;
      }

      if (hasHonorificB && !hasHonorificA) {
        title = segA;
        titleConfidence = 0.8;
        authors.push(...this.splitMultiAuthors(segB));
        authorConfidence = 0.75;
        return;
      }

      // Neither is a person name: combine as Title - Subtitle
      title = `${segA}: ${segB}`;
      titleConfidence = 0.8;
    };

    if (unassignedSegments.length === 1) {
      title = unassignedSegments[0];
      titleConfidence = authors.length > 0 ? 0.9 : 0.6;
    } else if (unassignedSegments.length === 2) {
      resolveTwoSegments(unassignedSegments[0], unassignedSegments[1]);
    } else if (unassignedSegments.length >= 3) {
      const lastSeg = unassignedSegments[unassignedSegments.length - 1];
      const firstSeg = unassignedSegments[0];

      if (!publisher && FilenameParser.isRecognizedPublisher(lastSeg)) {
        publisher = lastSeg;
        publisherConfidence = 0.85;
        unassignedSegments.pop();
        if (unassignedSegments.length === 2) {
          resolveTwoSegments(unassignedSegments[0], unassignedSegments[1]);
        } else {
          title = unassignedSegments.join(' - ');
          titleConfidence = 0.7;
        }
      } else if (!publisher && FilenameParser.isRecognizedPublisher(firstSeg)) {
        publisher = firstSeg;
        publisherConfidence = 0.85;
        unassignedSegments.shift();
        if (unassignedSegments.length === 2) {
          resolveTwoSegments(unassignedSegments[0], unassignedSegments[1]);
        } else {
          title = unassignedSegments.join(' - ');
          titleConfidence = 0.7;
        }
      } else {
        const isSeg0Inverted = /^[\p{L}'-]+,\s*[\p{L}\s.'-]+$/u.test(unassignedSegments[0]);
        const isSeg0Person = isSeg0Inverted || FilenameParser.isLikelyPersonName(unassignedSegments[0]);
        if (isSeg0Person) {
          title = `${unassignedSegments[1]}: ${unassignedSegments[2]}`;
          titleConfidence = 0.8;
          if (authors.length === 0) {
            authors.push(...this.splitMultiAuthors(unassignedSegments[0]));
            authorConfidence = 0.8;
          }
        } else {
          title = unassignedSegments[0];
          titleConfidence = 0.8;
          if (authors.length === 0 && FilenameParser.isLikelyPersonName(unassignedSegments[1])) {
            authors.push(...this.splitMultiAuthors(unassignedSegments[1]));
            authorConfidence = 0.75;
          }
          if (!publisher && unassignedSegments[2]) {
            publisher = unassignedSegments[2];
            publisherConfidence = 0.7;
          }
        }
      }
    }

    if (!title) {
      title = text ? text.trim() : '';
      if (!titleConfidence) titleConfidence = 0.4;
    }

    // Arabic Diwan pattern check: if title is "ديوان <اسم>" and no author is present
    if (authors.length === 0) {
      const diwanMatch = title.match(/^ديوان\s+([\p{L}\s]+?)(?:\s+\d+|\s*$)/u);
      if (diwanMatch) {
        authors.push(diwanMatch[1].trim());
        authorConfidence = 0.85;
      }
    }

    title = this.cleanTitle(title);

    return {
      title,
      titleConfidence,
      authors: Array.from(new Set(authors)),
      authorConfidence,
      translators: Array.from(new Set(translators)),
      translatorConfidence,
      publisher,
      publisherConfidence,
    };
  }

  /**
   * Sanitizes and normalizes titles:
   * - Converts subtitle underscores "_ " to ": "
   * - Strips curly brackets "{...}"
   * - Strips empty brackets "()" / "[]"
   */
  private static cleanTitle(raw: string): string {
    if (!raw) return '';
    return raw
      .replace(/_\s+/g, ': ')
      .replace(/[{}]/g, '')
      .replace(/[\(\[]\s*[\)\]]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Checks whether a string segment is a recognized publisher name or imprint.
   */
  public static isRecognizedPublisher(text: string): boolean {
    if (!text || typeof text !== 'string') return false;
    const clean = text.trim();
    const lower = clean.toLowerCase();
    const norm = lower.replace(/['’\-]/g, ' ').replace(/\s+/g, ' ').trim();
    const noSpace = lower.replace(/['’\-\s]/g, '');
    if (KNOWN_PUBLISHERS.has(lower) || KNOWN_PUBLISHERS.has(norm) || KNOWN_PUBLISHERS.has(noSpace)) return true;

    if (ARABIC_PUBLISHER_PREFIX_REGEX.test(clean) && clean.length > 5) return true;
    if (ENGLISH_PUBLISHER_SUFFIX_REGEX.test(clean) && !NON_AUTHOR_TITLE_WORDS.test(clean)) return true;

    return false;
  }

  /**
   * Checks whether a segment is a recognizable subtitle phrase.
   */
  public static isRecognizedSubtitle(text: string): boolean {
    if (!text || typeof text !== 'string') return false;
    const clean = text.trim();

    if (
      SUBTITLE_INDICATOR_REGEX.test(clean) ||
      SUBTITLE_OF_REGEX.test(clean) ||
      SUBTITLE_HOWTO_REGEX.test(clean) ||
      SUBTITLE_PHRASE_REGEX.test(clean) ||
      SUBTITLE_SERIES_REGEX.test(clean) ||
      ARABIC_SUBTITLE_INDICATOR_REGEX.test(clean)
    ) {
      return true;
    }

    return false;
  }

  /**
   * Evaluates if a segment has the characteristics of a genuine person name (Author).
   */
  public static isLikelyPersonName(candidate: string): boolean {
    if (!candidate || typeof candidate !== 'string') return false;
    const clean = candidate.trim();
    if (clean.length < 2) return false;

    if (this.isRecognizedPublisher(clean) || this.isRecognizedSubtitle(clean)) {
      return false;
    }

    // English definite/indefinite articles at the start indicate a title, not a person name
    if (/^(?:the|a|an)\s+/i.test(clean)) {
      return false;
    }

    // Inverted author: "Martin, Robert C." or "محفوظ, نجيب"
    if (/^[\p{L}'-]+,\s*[\p{L}\s.'-]+(?:,\s*\d{4}.*)?$/u.test(clean)) {
      return true;
    }

    // Arabic person name check
    if (/[\u0600-\u06FF]/.test(clean)) {
      const normalizedArabic = clean.replace(/[\u064B-\u065F\u0670]/g, '');
      if (ARABIC_NON_AUTHOR_TITLE_WORDS.test(normalizedArabic)) {
        return false;
      }
      if (/^(?:د\.?|دكتور|الشيخ|الإمام|الأستاذ|ابن|أبو|العلامة|القاضي)\s+/i.test(normalizedArabic)) {
        return true;
      }
      const arWords = normalizedArabic.split(/\s+/).filter(Boolean);
      return arWords.length >= 2 && arWords.length <= 5;
    }

    // English honorific: Dr., Prof., Sir, etc.
    if (/^(?:dr\.?|prof\.?|sir|mr\.?|ms\.?|mrs\.)\s+/i.test(clean)) {
      return true;
    }

    // Word count test: single word without honorific is almost always a title
    const words = clean.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 4) {
      return false;
    }

    // Check for title punctuation (?, !, :, +, =, /, \) or digits
    if (/[\?!:\+=/\\0-9]/.test(clean)) {
      return false;
    }

    // English person name check:
    if (NON_AUTHOR_TITLE_WORDS.test(clean)) {
      return false;
    }

    // In English, author names are capitalized words (e.g. Robert C. Martin, F. Scott Fitzgerald)
    const allCapitalized = words.every(
      (w) =>
        /^[A-Z][a-zA-Z.'-]*$/.test(w) ||
        /^[A-Z]\.$/.test(w) ||
        /^(?:van|von|de|la|du|da|al|el|bin|ben|ibn)$/i.test(w) ||
        /^(?:al|el|bin|ben|ibn)-[A-Z][a-zA-Z.'-]*$/i.test(w)
    );

    return allCapitalized;
  }

  /**
   * Splits multi-author strings by semicolon, underscore, comma, 'and', '&', or Arabic 'و'.
   * Normalizes inverted names ("Martin, Robert C." -> "Robert C. Martin").
   * Strips catalog birth/death dates ("Marx, Karl, 1818-1883" -> "Karl Marx").
   */
  public static splitMultiAuthors(raw: string): string[] {
    if (!raw) return [];

    let clean = raw.trim();

    // Split by semicolons first if present (catalog multi-author standard)
    if (clean.includes(';')) {
      return clean
        .split(';')
        .map((a) => this.normalizeSingleAuthor(a))
        .filter((a) => a.length > 1);
    }

    // Split by underscores if present (LibGen multi-author standard)
    if (clean.includes('_') && /^[A-Z\p{L}'-]+,\s*[A-Z\p{L}\s.'-]+_/u.test(clean)) {
      return clean
        .split('_')
        .map((a) => this.normalizeSingleAuthor(a))
        .filter((a) => a.length > 1);
    }

    // Check if the string is a single inverted author name: "Lastname, Firstname"
    const singleInverted = this.normalizeSingleAuthor(clean);
    if (singleInverted !== clean) {
      return [singleInverted];
    }

    // Protect words starting with 'و' by requiring whitespace: " و "
    return clean
      .split(/,\s*|\s+(?:and|&)\s+|\s+و\s+/i)
      .map((a) => this.normalizeSingleAuthor(a))
      .filter((a) => a.length > 1);
  }

  /**
   * Normalizes an individual author name:
   * - Strips catalog dates: ", 1818-1883" or " 1918-"
   * - Inverts "Last, First" -> "First Last"
   */
  private static normalizeSingleAuthor(raw: string): string {
    let a = raw.trim();
    // Strip lifespan dates attached to author names
    a = a.replace(/,\s*\d{4}(?:-\d{2,4})?.*$/, '').replace(/\s+\d{4}-.*$/, '').trim();

    const invertedMatch = a.match(/^([\p{L}'-]+),\s*([\p{L}\s.'-]+)$/u);
    if (invertedMatch) {
      const lastName = invertedMatch[1].trim();
      const firstName = invertedMatch[2].trim();
      if (!firstName.includes(',') && !firstName.includes('&') && !/\b(?:and|و)\b/i.test(firstName)) {
        return `${firstName} ${lastName}`;
      }
    }
    return a;
  }

  private static calculateOverallConfidence(c: {
    titleConfidence: number;
    authorConfidence: number;
    isbnConfidence: number;
    yearConfidence: number;
    publisherConfidence: number;
    translatorConfidence: number;
  }): number {
    if (c.isbnConfidence === 1.0) {
      return 0.95;
    }

    let score = c.titleConfidence * 0.45 + c.authorConfidence * 0.35;
    if (c.yearConfidence > 0) score += c.yearConfidence * 0.1;
    if (c.publisherConfidence > 0) score += c.publisherConfidence * 0.1;

    return Math.min(1.0, Math.round(score * 100) / 100);
  }

  private static createEmptyResult(originalFilename: string): ParsedFilenameMetadata {
    return {
      originalFilename,
      cleanedFilename: originalFilename,
      titleConfidence: 0,
      authors: [],
      authorConfidence: 0,
      translators: [],
      translatorConfidence: 0,
      publisherConfidence: 0,
      yearConfidence: 0,
      editionConfidence: 0,
      isbnConfidence: 0,
      overallConfidence: 0,
    };
  }

  private static escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
