/**
 * Baglib — Material Language Detection Service
 *
 * Automatically detects the language of library materials using:
 * 1. Material Content: sample text extracted directly from digital files (PDF, EPUB, TXT, HTML).
 * 2. Bibliographic Metadata: title, description, abstract, author, and subject tags as fallback.
 * 3. Embedded Language Tags: ISO-639 normalization from OPF, XMP, and publisher metadata.
 *
 * Implements strict confidence scoring to populate the language field only when detection
 * is sufficiently reliable, handling uncertain or unsupported cases gracefully without
 * assigning arbitrary defaults.
 */

export interface LanguageDetectionResult {
  language?: string; // Canonical Baglib display name (e.g., 'العربية', 'English', 'الفرنسية', etc.)
  languageCode?: string; // ISO 639-1 code (e.g., 'ar', 'en', 'fr', 'fa', 'tr', 'de', 'es', 'ru', 'ur', 'it')
  confidence: number; // 0.0 to 1.0
  isReliable: boolean; // true if confidence >= threshold and clear separation
  detectedFrom: 'content' | 'metadata' | 'embedded_tag' | 'none';
  reason?: string;
}

export interface DetectLanguageOptions {
  contentSample?: string;
  title?: string;
  description?: string;
  author?: string;
  tags?: string[];
  embeddedLanguage?: string;
}

export class LanguageDetectorService {
  private static instance: LanguageDetectorService;

  // Confidence threshold required for a detection to be considered "reliable"
  public static readonly RELIABILITY_THRESHOLD = 0.65;
  // Minimum characters required for content-based statistical detection
  public static readonly MIN_CONTENT_SAMPLE_CHARS = 20;

  public static getInstance(): LanguageDetectorService {
    if (!this.instance) {
      this.instance = new LanguageDetectorService();
    }
    return this.instance;
  }

  // Canonical mapping of ISO 639 codes and names to Baglib standard language names
  private static readonly ISO_CODE_MAP: Record<string, { name: string; code: string }> = {
    ar: { name: 'العربية', code: 'ar' },
    ara: { name: 'العربية', code: 'ar' },
    arabic: { name: 'العربية', code: 'ar' },

    en: { name: 'English', code: 'en' },
    eng: { name: 'English', code: 'en' },
    english: { name: 'English', code: 'en' },

    fr: { name: 'الفرنسية', code: 'fr' },
    fra: { name: 'الفرنسية', code: 'fr' },
    fre: { name: 'الفرنسية', code: 'fr' },
    french: { name: 'الفرنسية', code: 'fr' },

    fa: { name: 'الفارسية', code: 'fa' },
    fas: { name: 'الفارسية', code: 'fa' },
    per: { name: 'الفارسية', code: 'fa' },
    farsi: { name: 'الفارسية', code: 'fa' },
    persian: { name: 'الفارسية', code: 'fa' },

    tr: { name: 'التركية', code: 'tr' },
    tur: { name: 'التركية', code: 'tr' },
    turkish: { name: 'التركية', code: 'tr' },

    de: { name: 'الألمانية', code: 'de' },
    deu: { name: 'الألمانية', code: 'de' },
    ger: { name: 'الألمانية', code: 'de' },
    german: { name: 'الألمانية', code: 'de' },

    es: { name: 'الإسبانية', code: 'es' },
    spa: { name: 'الإسبانية', code: 'es' },
    spanish: { name: 'الإسبانية', code: 'es' },

    ru: { name: 'الروسية', code: 'ru' },
    rus: { name: 'الروسية', code: 'ru' },
    russian: { name: 'الروسية', code: 'ru' },

    ur: { name: 'الأردية', code: 'ur' },
    urd: { name: 'الأردية', code: 'ur' },
    urdu: { name: 'الأردية', code: 'ur' },

    it: { name: 'الإيطالية', code: 'it' },
    ita: { name: 'الإيطالية', code: 'it' },
    italian: { name: 'الإيطالية', code: 'it' },
  };

  // High-frequency, distinctive stopwords per language
  private static readonly STOPWORDS: Record<string, string[]> = {
    ar: [
      'في', 'من', 'على', 'إلى', 'هذا', 'هذه', 'التي', 'الذي', 'مع', 'عن',
      'كل', 'كان', 'كانت', 'لم', 'لن', 'ثم', 'هو', 'هي', 'أو', 'ما',
      'بعد', 'بين', 'غير', 'ذلك', 'إن', 'أن', 'قد', 'لا', 'له', 'لها',
      'لهم', 'به', 'بها', 'فيه', 'فيها', 'حتى', 'إذا', 'هناك', 'عندما'
    ],
    fa: [
      'در', 'به', 'از', 'که', 'این', 'برای', 'با', 'است', 'را', 'های',
      'یک', 'می', 'شد', 'بر', 'بود', 'دارد', 'کند', 'شده', 'آن', 'هم',
      'اما', 'نیز', 'وی', 'خود', 'تا', 'چون', 'پس', 'دیگر', 'اگر'
    ],
    ur: [
      'کا', 'کے', 'کی', 'میں', 'ہے', 'سے', 'کو', 'پر', 'اور', 'تھا',
      'تھی', 'تھے', 'ہیں', 'نے', 'یہ', 'وہ', 'بھی', 'تو', 'تک', 'کیا',
      'ہو', 'ہونا', 'جاتا', 'گیا', 'اس', 'ان', 'ہم', 'آپ'
    ],
    en: [
      'the', 'of', 'and', 'to', 'a', 'in', 'is', 'that', 'for', 'it',
      'as', 'was', 'with', 'on', 'by', 'at', 'from', 'this', 'are', 'or',
      'an', 'be', 'which', 'their', 'has', 'have', 'not', 'were', 'had', 'been'
    ],
    fr: [
      'le', 'la', 'les', 'de', 'du', 'des', 'et', 'en', 'un', 'une',
      'dans', 'pour', 'qui', 'que', 'est', 'ce', 'pas', 'sur', 'avec', 'sont',
      'par', 'plus', 'au', 'aux', 'ne', 'se', 'ont', 'ses', 'cette', 'mais'
    ],
    de: [
      'der', 'die', 'das', 'und', 'in', 'den', 'von', 'zu', 'dem', 'mit',
      'sich', 'des', 'auf', 'für', 'ist', 'im', 'nicht', 'ein', 'eine', 'einer',
      'einem', 'einen', 'sie', 'er', 'es', 'als', 'auch', 'nach', 'wie', 'an'
    ],
    es: [
      'el', 'la', 'de', 'que', 'y', 'en', 'un', 'una', 'los', 'del',
      'las', 'por', 'con', 'para', 'se', 'no', 'es', 'al', 'lo', 'como',
      'más', 'pero', 'sus', 'le', 'ya', 'o', 'fue', 'este', 'ha', 'su'
    ],
    tr: [
      've', 'bir', 'bu', 'da', 'de', 'için', 'ile', 'o', 'gibi', 'çok',
      'daha', 'ama', 'en', 'kadar', 'ne', 'her', 'olan', 'var', 'olarak', 'sonra',
      'ise', 'ancak', 'kendi', 'göre', 'yok', 'diye', 'bunu', 'önce'
    ],
    it: [
      'il', 'la', 'di', 'e', 'che', 'in', 'un', 'una', 'per', 'con',
      'non', 'sono', 'da', 'del', 'della', 'dei', 'delle', 'su', 'al', 'alla',
      'ha', 'era', 'ed', 'anche', 'come', 'nel', 'nella', 'se', 'ci'
    ],
    ru: [
      'и', 'в', 'не', 'на', 'я', 'что', 'тот', 'быть', 'с', 'он',
      'а', 'как', 'это', 'по', 'этот', 'к', 'но', 'они', 'мы', 'к',
      'у', 'который', 'из', 'за', 'свой', 'что', 'еще', 'для', 'от'
    ],
  };

  /**
   * Main entry point: Detects the language of a material given its content, metadata, and optional tags.
   */
  public detectLanguage(options: DetectLanguageOptions): LanguageDetectionResult {
    const { contentSample, title, description, author, tags, embeddedLanguage } = options;

    // 1. If explicit content sample is available and has substantial text, analyze content
    if (contentSample && contentSample.trim().length >= LanguageDetectorService.MIN_CONTENT_SAMPLE_CHARS) {
      const contentResult = this.analyzeText(contentSample);
      if (contentResult.isReliable) {
        return {
          ...contentResult,
          detectedFrom: 'content',
        };
      }
    }

    // 2. If embedded language code is present, check if it maps to a recognized language
    if (embeddedLanguage && typeof embeddedLanguage === 'string') {
      const normalizedEmbedded = this.normalizeLanguageCode(embeddedLanguage);
      if (normalizedEmbedded) {
        // If content was analyzed but fell just short of threshold, cross-verify
        if (contentSample && contentSample.trim().length >= 10) {
          const contentResult = this.analyzeText(contentSample);
          if (contentResult.languageCode === normalizedEmbedded.code) {
            return {
              language: normalizedEmbedded.name,
              languageCode: normalizedEmbedded.code,
              confidence: Math.max(0.75, contentResult.confidence),
              isReliable: true,
              detectedFrom: 'content',
            };
          }
        }

        // Embedded tag is reliable if not 'und' / 'mul' / 'zxx'
        return {
          language: normalizedEmbedded.name,
          languageCode: normalizedEmbedded.code,
          confidence: 0.85,
          isReliable: true,
          detectedFrom: 'embedded_tag',
        };
      }
    }

    // 3. Fallback: Aggregate metadata fields (Title + Description + Author + Tags)
    const metadataTextParts: string[] = [];
    if (title && !this.isPlaceholder(title)) metadataTextParts.push(title);
    if (description) metadataTextParts.push(description);
    if (author && !this.isPlaceholder(author)) metadataTextParts.push(author);
    if (tags && tags.length > 0) metadataTextParts.push(tags.join(' '));

    const metadataText = metadataTextParts.join(' ').trim();
    if (metadataText.length >= 10) {
      const metaResult = this.analyzeText(metadataText);
      if (metaResult.isReliable) {
        return {
          ...metaResult,
          detectedFrom: 'metadata',
        };
      }
    }

    // 4. Uncertain or unsupported case: Return unassigned gracefully
    return {
      language: undefined,
      languageCode: undefined,
      confidence: 0,
      isReliable: false,
      detectedFrom: 'none',
      reason: 'insufficient_or_ambiguous_evidence',
    };
  }

  /**
   * Normalizes an ISO code or language string to canonical Baglib name and code.
   */
  public normalizeLanguageCode(rawCode: string): { name: string; code: string } | undefined {
    if (!rawCode || typeof rawCode !== 'string') return undefined;

    const cleaned = rawCode
      .toLowerCase()
      .split(/[-_;,.]/)[0]
      .trim();

    if (LanguageDetectorService.ISO_CODE_MAP[cleaned]) {
      return LanguageDetectorService.ISO_CODE_MAP[cleaned];
    }

    // Check full cleaned string
    const fullClean = rawCode.toLowerCase().trim();
    if (LanguageDetectorService.ISO_CODE_MAP[fullClean]) {
      return LanguageDetectorService.ISO_CODE_MAP[fullClean];
    }

    return undefined;
  }

  /**
   * Performs statistical script and stopword analysis on text.
   */
  public analyzeText(text: string): { language?: string; languageCode?: string; confidence: number; isReliable: boolean } {
    if (!text || text.trim().length === 0) {
      return { confidence: 0, isReliable: false };
    }

    const clean = text.trim();

    // Count character scripts
    let arabicCount = 0;
    let latinCount = 0;
    let cyrillicCount = 0;
    let otherCount = 0;

    for (const char of clean) {
      const code = char.charCodeAt(0);
      if ((code >= 0x0600 && code <= 0x06ff) || (code >= 0x0750 && code <= 0x077f) || (code >= 0x08a0 && code <= 0x08ff)) {
        arabicCount++;
      } else if ((code >= 0x0041 && code <= 0x005a) || (code >= 0x0061 && code <= 0x007a) || (code >= 0x00c0 && code <= 0x024f)) {
        latinCount++;
      } else if (code >= 0x0400 && code <= 0x04ff) {
        cyrillicCount++;
      } else if (char.match(/[\p{L}]/u)) {
        otherCount++;
      }
    }

    const totalAlpha = arabicCount + latinCount + cyrillicCount + otherCount;
    if (totalAlpha < 6) {
      return { confidence: 0, isReliable: false };
    }

    // Tokenize into lowercase words
    const tokens = clean
      .toLowerCase()
      .split(/[\s,.;:!?"'()\[\]{}«»/\-—\\]+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 0);

    if (tokens.length === 0) {
      return { confidence: 0, isReliable: false };
    }

    // Branch A: Arabic Script Dominates
    if (arabicCount / totalAlpha >= 0.6) {
      return this.disambiguateArabicScript(clean, tokens);
    }

    // Branch B: Cyrillic Script Dominates
    if (cyrillicCount / totalAlpha >= 0.6) {
      return {
        language: 'الروسية',
        languageCode: 'ru',
        confidence: Math.min(1.0, 0.7 + (cyrillicCount / totalAlpha) * 0.3),
        isReliable: true,
      };
    }

    // Branch C: Latin Script Dominates
    if (latinCount / totalAlpha >= 0.6) {
      return this.disambiguateLatinScript(clean, tokens);
    }

    // Ambiguous mixed scripts
    return {
      confidence: 0.3,
      isReliable: false,
    };
  }

  /**
   * Disambiguates between Arabic, Persian (Farsi), and Urdu in Arabic-script texts.
   */
  private disambiguateArabicScript(text: string, tokens: string[]): { language?: string; languageCode?: string; confidence: number; isReliable: boolean } {
    // 1. Check for exclusive Urdu letters: ٹ, ڈ, ڑ, ں, ہ, ے
    const urduExclusiveRegex = /[ٹڈڑںہے]/;
    const hasUrduLetters = urduExclusiveRegex.test(text);

    // 2. Check for exclusive Persian letters: گ, چ, پ, ژ
    const persianExclusiveRegex = /[گچپژ]/;
    const hasPersianLetters = persianExclusiveRegex.test(text);

    // 3. Score against stopwords
    const arStopScore = this.scoreStopwords(tokens, LanguageDetectorService.STOPWORDS.ar);
    const faStopScore = this.scoreStopwords(tokens, LanguageDetectorService.STOPWORDS.fa);
    const urStopScore = this.scoreStopwords(tokens, LanguageDetectorService.STOPWORDS.ur);

    if (hasUrduLetters || urStopScore > Math.max(arStopScore, faStopScore) * 1.5) {
      const confidence = Math.min(0.98, 0.6 + urStopScore * 0.4 + (hasUrduLetters ? 0.3 : 0));
      return {
        language: 'الأردية',
        languageCode: 'ur',
        confidence,
        isReliable: confidence >= LanguageDetectorService.RELIABILITY_THRESHOLD,
      };
    }

    if (hasPersianLetters || faStopScore > Math.max(arStopScore, urStopScore) * 1.5) {
      const confidence = Math.min(0.98, 0.6 + faStopScore * 0.4 + (hasPersianLetters ? 0.3 : 0));
      return {
        language: 'الفارسية',
        languageCode: 'fa',
        confidence,
        isReliable: confidence >= LanguageDetectorService.RELIABILITY_THRESHOLD,
      };
    }

    // Standard Arabic is the default for pure Arabic script when no Urdu/Persian signals exist
    const hasArabicStopwords = arStopScore > 0;
    const confidence = hasArabicStopwords
      ? Math.min(0.99, 0.7 + arStopScore * 0.3)
      : tokens.length >= 3
      ? 0.75
      : 0.6;

    return {
      language: 'العربية',
      languageCode: 'ar',
      confidence,
      isReliable: confidence >= LanguageDetectorService.RELIABILITY_THRESHOLD,
    };
  }

  /**
   * Disambiguates between English, French, German, Spanish, Turkish, and Italian in Latin texts.
   */
  private disambiguateLatinScript(text: string, tokens: string[]): { language?: string; languageCode?: string; confidence: number; isReliable: boolean } {
    // Distinctive letter checks
    const hasTurkishLetters = /[çğıöşüİ]/.test(text);
    const hasGermanLetters = /[äöüß]/.test(text);
    const hasFrenchAccents = /[éèêàçùœâîôëï]/.test(text);
    const hasSpanishMarks = /[ñáéíóú¿¡]/.test(text);

    // Stopword scores
    const scores: Record<string, number> = {
      en: this.scoreStopwords(tokens, LanguageDetectorService.STOPWORDS.en),
      fr: this.scoreStopwords(tokens, LanguageDetectorService.STOPWORDS.fr) + (hasFrenchAccents ? 0.15 : 0),
      de: this.scoreStopwords(tokens, LanguageDetectorService.STOPWORDS.de) + (hasGermanLetters ? 0.2 : 0),
      es: this.scoreStopwords(tokens, LanguageDetectorService.STOPWORDS.es) + (hasSpanishMarks ? 0.2 : 0),
      tr: this.scoreStopwords(tokens, LanguageDetectorService.STOPWORDS.tr) + (hasTurkishLetters ? 0.25 : 0),
      it: this.scoreStopwords(tokens, LanguageDetectorService.STOPWORDS.it),
    };

    // Sort candidate scores descending
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const [topLang, topScore] = sorted[0];
    const secondScore = sorted[1] ? sorted[1][1] : 0;

    // Check if the best match is confident
    const margin = topScore - secondScore;
    const minScoreRequired = 0.08;

    if (topScore >= minScoreRequired && (margin >= 0.03 || topScore >= 0.25)) {
      const canonical = LanguageDetectorService.ISO_CODE_MAP[topLang];
      const confidence = Math.min(0.98, 0.65 + topScore * 0.4);
      return {
        language: canonical?.name,
        languageCode: topLang,
        confidence,
        isReliable: confidence >= LanguageDetectorService.RELIABILITY_THRESHOLD,
      };
    }

    // If text is predominantly English words with general vocabulary
    if (scores.en > 0) {
      return {
        language: 'English',
        languageCode: 'en',
        confidence: 0.7,
        isReliable: true,
      };
    }

    // If ambiguous Latin without recognizable stopwords
    return {
      confidence: 0.4,
      isReliable: false,
    };
  }

  /**
   * Calculates normalized stopword density in tokens.
   */
  private scoreStopwords(tokens: string[], stopwords: string[]): number {
    if (tokens.length === 0 || !stopwords) return 0;
    const stopSet = new Set(stopwords);
    let matchCount = 0;

    for (const t of tokens) {
      if (stopSet.has(t)) {
        matchCount++;
      }
    }

    return matchCount / tokens.length;
  }

  private isPlaceholder(val: string): boolean {
    const t = val.trim().toLowerCase();
    return (
      t === 'untitled' ||
      t === 'new author' ||
      t === 'unknown author' ||
      t === 'مؤلف جديد' ||
      t === 'مؤلف مجهول' ||
      t === 'بدون عنوان'
    );
  }
}

export const languageDetectorService = LanguageDetectorService.getInstance();
