/**
 * Baglib — Dedicated & LLM-Powered Translation Service (KEY-143)
 *
 * Supports DeepL, Google Translate, Yandex, and scholarly LLM fallback translation.
 */

import type { AISettings, TranslationResult, TranslationProviderId } from '../../../shared/types/ai';
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
   * Translates text using the configured provider, falling back to LLM if needed.
   */
  public async translate(
    options: TranslateOptions,
    settings: AISettings
  ): Promise<TranslationResult> {
    const text = options.text?.trim();
    if (!text) {
      return {
        translatedText: '',
        targetLang: options.targetLang || settings.targetLanguage || 'ar',
        providerUsed: 'none',
      };
    }

    const targetLang = options.targetLang || settings.targetLanguage || 'ar';
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
    } catch (err: any) {
      console.warn(`[baglib:translation] Provider ${provider} failed (${err.message}), falling back to LLM.`);
      return await this.translateWithLLM(text, targetLang, options.bookTitle, settings);
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
      throw new Error('DeepL API Key is missing');
    }

    // Free endpoints end with :fx
    const isFree = key.endsWith(':fx');
    const endpoint = isFree
      ? 'https://api-free.deepl.com/v2/translate'
      : 'https://api.deepl.com/v2/translate';

    const normalizedTarget = targetLang.toUpperCase() === 'EN' ? 'EN-US' : targetLang.toUpperCase();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${key}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        text: [text],
        target_lang: normalizedTarget,
      }),
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`DeepL HTTP ${res.status}: ${errText || res.statusText}`);
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
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(
        `https://translation.googleapis.com/language/translate/v2?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            q: text,
            target: targetLang,
            format: 'text',
          }),
        }
      );
      clearTimeout(timeout);

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

    // Public web client fallback
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(
      targetLang
    )}&dt=t&q=${encodeURIComponent(text)}`;

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`Google Translate fallback failed with status ${res.status}`);
    }

    const data = await res.json() as any[];
    // data[0] is array of [translatedChunk, originalChunk, ...]
    const chunks = data?.[0] || [];
    const translatedText = chunks.map((c: any) => c[0] || '').join('');
    const detectedLang = data?.[2] || undefined;

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
      throw new Error('Yandex API Key is missing');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch('https://translate.api.cloud.yandex.net/translate/v2/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Api-Key ${key}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        targetLanguageCode: targetLang,
        texts: [text],
      }),
    });
    clearTimeout(timeout);

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
