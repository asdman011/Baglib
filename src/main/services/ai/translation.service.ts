import { assertTranslationAllowed, validateTranslationInput, translationDestination, TranslationError, translationErrorCode } from '../../../shared/translation-privacy';
/**
 * Baglib — Dedicated & LLM-Powered Translation Service (KEY-143)
 *
 * Supports DeepL, Google Translate, Yandex, and scholarly LLM fallback translation.
 */

import type { AISettings, TranslationResult } from '../../../shared/types/ai';
import { AIProviderService } from './ai-provider.service';
import { buildTranslationPrompt } from '../../../shared/utils/ai-prompts';

export interface TranslateOptions {
  text: string;
  targetLang?: string;
  sourceLang?: string;
  bookTitle?: string;
}

export class TranslationService {
  private static instance: TranslationService | null = null;

  public static getInstance(): TranslationService {
    if (!TranslationService.instance) {
      TranslationService.instance = new TranslationService();
    }
    return TranslationService.instance;
  }

  /**
   * Translates text using only the configured provider.
   */
  public async translate(
    options: TranslateOptions,
    settings: AISettings
  ): Promise<TranslationResult> {
    options = validateTranslationInput(options);
    assertTranslationAllowed(settings);
    const text = options.text.trim();

    const targetLang = options.targetLang || settings.targetLanguage || 'ar';
    validateTranslationInput({ ...options, targetLang });
    const provider = settings.translationProvider || 'llm';

    try {
      switch (provider) {
        case 'deepl':
          return await this.translateWithDeepL(text, targetLang, settings);
        case 'google':
          return await this.translateWithGoogle(text, targetLang, settings);
        case 'yandex':
          return await this.translateWithYandex(text, targetLang, settings);
        case 'llm':
        default:
          return await this.translateWithLLM(text, targetLang, options.bookTitle, settings);
      }
    } catch (err: unknown) {
      // Provider consent does not authorize sending text to a different provider on failure.
      throw new TranslationError(translationErrorCode(err));
    }
  }

  // ==========================================
  // DeepL
  // ==========================================

  private async translateWithDeepL(
    text: string,
    targetLang: string,
    settings: AISettings
  ): Promise<TranslationResult> {
    const key = settings.translationApiKey || '';
    if (!key) {
      throw new TranslationError('not-configured');
    }

    const endpoint = translationDestination(settings)!.endpoint;

    const normalizedTarget = targetLang.toUpperCase() === 'EN' ? 'EN-US' : targetLang.toUpperCase();

    const signal = AbortSignal.timeout(15000);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${key}`,
        'Content-Type': 'application/json',
      },
      signal: signal,
      redirect: 'error',
      body: JSON.stringify({
        text: [text],
        target_lang: normalizedTarget,
      }),
    });

    if (!res.ok) {
      throw new Error('HTTP ' + res.status);
    }

    const data = await res.json() as {
      translations?: Array<{ detected_source_language: string; text: string }>;
    };

    const first = data.translations?.[0];
    return {
      translatedText: first?.text || '',
      sourceLang: first?.detected_source_language?.toLowerCase(),
      targetLang,
      providerUsed: 'deepl',
    };
  }

  // ==========================================
  // Google Translate
  // ==========================================

  private async translateWithGoogle(
    text: string,
    targetLang: string,
    settings: AISettings
  ): Promise<TranslationResult> {
    const key = settings.translationApiKey || '';

    if (key) {
      // Official Google Cloud Translation API
      const signal = AbortSignal.timeout(15000);

      const res = await fetch(
        `https://translation.googleapis.com/language/translate/v2?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: signal,
      redirect: 'error',
          body: JSON.stringify({
            q: text,
            target: targetLang,
            format: 'text',
          }),
        }
      );

      if (!res.ok) {
        throw new Error(`Google Cloud Translation returned HTTP ${res.status}`);
      }

      const data = await res.json() as {
        data?: {
          translations?: Array<{ translatedText: string; detectedSourceLanguage?: string }>;
        };
      };

      const trans = data.data?.translations?.[0];
      return {
        translatedText: trans?.translatedText || '',
        sourceLang: trans?.detectedSourceLanguage,
        targetLang,
        providerUsed: 'google',
      };
    }

    if (settings.googlePublicTranslation !== true) throw new TranslationError('not-configured');
    // Explicitly selected public web client; never reached after a failed official request.
    const signal = AbortSignal.timeout(12000);

    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(
      targetLang
    )}&dt=t&q=${encodeURIComponent(text)}`;

    const res = await fetch(url, { signal: signal, redirect: 'error' });

    if (!res.ok) {
      throw new Error(`Google Translate fallback failed with status ${res.status}`);
    }

    const data = await res.json() as unknown[];
    // data[0] is array of [translatedChunk, originalChunk, ...]
    const chunks = Array.isArray(data[0]) ? data[0] as unknown[] : [];
    const translatedText = chunks.map((c: unknown) => Array.isArray(c) && typeof c[0] === 'string' ? c[0] : '').join('');
    const detectedLang = typeof data[2] === 'string' ? data[2] : undefined;

    return {
      translatedText,
      sourceLang: detectedLang,
      targetLang,
      providerUsed: 'google-public',
    };
  }

  // ==========================================
  // Yandex Translate
  // ==========================================

  private async translateWithYandex(
    text: string,
    targetLang: string,
    settings: AISettings
  ): Promise<TranslationResult> {
    const key = settings.translationApiKey || '';
    if (!key) {
      throw new TranslationError('not-configured');
    }

    const signal = AbortSignal.timeout(15000);

    const res = await fetch('https://translate.api.cloud.yandex.net/translate/v2/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Api-Key ${key}`,
      },
      signal: signal,
      redirect: 'error',
      body: JSON.stringify({
        targetLanguageCode: targetLang,
        texts: [text],
      }),
    });

    if (!res.ok) {
      throw new Error(`Yandex HTTP ${res.status}`);
    }

    const data = await res.json() as {
      translations?: Array<{ text: string; detectedLanguageCode?: string }>;
    };

    const first = data.translations?.[0];
    return {
      translatedText: first?.text || '',
      sourceLang: first?.detectedLanguageCode,
      targetLang,
      providerUsed: 'yandex',
    };
  }

  // ==========================================
  // LLM Translation Fallback
  // ==========================================

  private async translateWithLLM(
    text: string,
    targetLang: string,
    bookTitle: string | undefined,
    settings: AISettings
  ): Promise<TranslationResult> {

    const prompt = buildTranslationPrompt(text, targetLang, bookTitle);
    const aiProvider = AIProviderService.getInstance();

    const translated = await aiProvider.generateChatCompletion(
      {
        systemPrompt: 'You are an expert bilingual academic and literary translator. Output the clean translated text only.',
        userPrompt: prompt,
        temperature: 0.3,
        preventRedirect: true,
      },
      settings
    );

    return {
      translatedText: translated.trim(),
      targetLang,
      providerUsed: `llm-${settings.provider || 'ollama'}`,
    };
  }
}
