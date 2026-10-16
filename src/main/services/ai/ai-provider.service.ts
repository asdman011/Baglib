/**
 * Baglib — Unified BYOK (Bring Your Own Key / Local LLM) Provider Service (KEY-143)
 *
 * Supports OpenAI-compatible, Google Gemini, Anthropic Claude, and local Ollama
 * endpoints with timeouts, health checks, and error diagnostics.
 */

import type { AISettings, AIProviderId } from '../../../shared/types/ai';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionRequest {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
}

export interface HealthCheckResult {
  success: boolean;
  message?: string;
  modelsFound?: string[];
}

export class AIProviderService {
  private static instance: AIProviderService | null = null;

  public static getInstance(): AIProviderService {
    if (!AIProviderService.instance) {
      AIProviderService.instance = new AIProviderService();
    }
    return AIProviderService.instance;
  }

  /**
   * Health-check connectivity to the configured AI provider.
   */
  public async healthCheck(settings: AISettings): Promise<HealthCheckResult> {
    const provider = settings.provider || 'ollama';

    try {
      switch (provider) {
        case 'ollama':
          return await this.healthCheckOllama(settings);
        case 'gemini':
          return await this.healthCheckGemini(settings);
        case 'claude':
          return await this.healthCheckClaude(settings);
        case 'openai':
        case 'custom':
        default:
          return await this.healthCheckOpenAI(settings);
      }
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Connection failed or timed out',
      };
    }
  }

  /**
   * Dispatches a chat completion prompt to the configured provider.
   */
  public async generateChatCompletion(
    request: ChatCompletionRequest,
    settings: AISettings
  ): Promise<string> {
    const provider = settings.provider || 'ollama';

    switch (provider) {
      case 'ollama':
        return await this.callOllama(request, settings);
      case 'gemini':
        return await this.callGemini(request, settings);
      case 'claude':
        return await this.callClaude(request, settings);
      case 'openai':
      case 'custom':
      default:
        return await this.callOpenAI(request, settings);
    }
  }

  // ==========================================
  // Ollama (Local LLM)
  // ==========================================

  private async healthCheckOllama(settings: AISettings): Promise<HealthCheckResult> {
    const endpoint = (settings.ollamaEndpoint || 'http://127.0.0.1:11434').replace(/\/+$/, '');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    try {
      const res = await fetch(`${endpoint}/api/tags`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timeout);

      if (!res.ok) {
        return {
          success: false,
          message: `Ollama responded with HTTP ${res.status}: ${res.statusText}`,
        };
      }

      const data = await res.json() as { models?: Array<{ name: string }> };
      const modelNames = data.models?.map((m) => m.name) || [];
      const targetModel = settings.ollamaModel || 'llama3.2';

      const found = modelNames.some((name) =>
        name.toLowerCase().includes(targetModel.toLowerCase())
      );

      return {
        success: true,
        message: found
          ? `Connected to Ollama. Model "${targetModel}" is ready.`
          : `Connected to Ollama (${modelNames.length} models installed), but "${targetModel}" was not found. Please run "ollama pull ${targetModel}".`,
        modelsFound: modelNames,
      };
    } catch (err: any) {
      clearTimeout(timeout);
      return {
        success: false,
        message: `Could not reach Ollama at ${endpoint}. Make sure the Ollama server is running. (${err.message})`,
      };
    }
  }

  private async callOllama(
    request: ChatCompletionRequest,
    settings: AISettings
  ): Promise<string> {
    const endpoint = (settings.ollamaEndpoint || 'http://127.0.0.1:11434').replace(/\/+$/, '');
    const model = settings.ollamaModel || 'llama3.2';
    const temp = request.temperature ?? settings.temperature ?? 0.7;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000); // 90s for local generation

    try {
      const res = await fetch(`${endpoint}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: request.systemPrompt },
            { role: 'user', content: request.userPrompt },
          ],
          stream: false,
          options: {
            temperature: temp,
          },
        }),
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Ollama error (${res.status}): ${text || res.statusText}`);
      }

      const data = await res.json() as { message?: { content?: string } };
      return data.message?.content || '';
    } catch (err: any) {
      clearTimeout(timeout);
      throw new Error(`Ollama request failed: ${err.message}`);
    }
  }

  // ==========================================
  // OpenAI / Compatible / Custom
  // ==========================================

  private async healthCheckOpenAI(settings: AISettings): Promise<HealthCheckResult> {
    const baseUrl = (settings.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
    const apiKey = settings.apiKey || '';

    if (!apiKey && !settings.baseUrl) {
      return {
        success: false,
        message: 'API Key is missing for OpenAI-compatible provider.',
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch(`${baseUrl}/models`, {
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
      });
      clearTimeout(timeout);

      if (!res.ok) {
        return {
          success: false,
          message: `Endpoint returned HTTP ${res.status}: ${res.statusText}`,
        };
      }

      return {
        success: true,
        message: 'Successfully connected to OpenAI-compatible API endpoint.',
      };
    } catch (err: any) {
      clearTimeout(timeout);
      return {
        success: false,
        message: `Failed to connect to ${baseUrl}: ${err.message}`,
      };
    }
  }

  private async callOpenAI(
    request: ChatCompletionRequest,
    settings: AISettings
  ): Promise<string> {
    const baseUrl = (settings.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
    const apiKey = settings.apiKey || '';
    const model = settings.model || 'gpt-4o-mini';
    const temp = request.temperature ?? settings.temperature ?? 0.7;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: request.systemPrompt },
            { role: 'user', content: request.userPrompt },
          ],
          temperature: temp,
        }),
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`OpenAI API error (${res.status}): ${text || res.statusText}`);
      }

      const data = await res.json() as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return data.choices?.[0]?.message?.content || '';
    } catch (err: any) {
      clearTimeout(timeout);
      throw new Error(`OpenAI request failed: ${err.message}`);
    }
  }

  // ==========================================
  // Google Gemini
  // ==========================================

  private async healthCheckGemini(settings: AISettings): Promise<HealthCheckResult> {
    const apiKey = settings.geminiApiKey || settings.apiKey || '';
    if (!apiKey) {
      return {
        success: false,
        message: 'Google Gemini API key is missing.',
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
        {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        }
      );
      clearTimeout(timeout);

      if (!res.ok) {
        return {
          success: false,
          message: `Gemini API returned HTTP ${res.status}: ${res.statusText}`,
        };
      }

      return {
        success: true,
        message: 'Successfully authenticated with Google Gemini API.',
      };
    } catch (err: any) {
      clearTimeout(timeout);
      return {
        success: false,
        message: `Gemini connection failed: ${err.message}`,
      };
    }
  }

  private async callGemini(
    request: ChatCompletionRequest,
    settings: AISettings
  ): Promise<string> {
    const apiKey = settings.geminiApiKey || settings.apiKey || '';
    const model = settings.geminiModel || 'gemini-1.5-flash';
    const temp = request.temperature ?? settings.temperature ?? 0.7;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: request.systemPrompt }],
            },
            contents: [
              {
                role: 'user',
                parts: [{ text: request.userPrompt }],
              },
            ],
            generationConfig: {
              temperature: temp,
            },
          }),
        }
      );
      clearTimeout(timeout);

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Gemini API error (${res.status}): ${text || res.statusText}`);
      }

      const data = await res.json() as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
      };

      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch (err: any) {
      clearTimeout(timeout);
      throw new Error(`Gemini request failed: ${err.message}`);
    }
  }

  // ==========================================
  // Anthropic Claude
  // ==========================================

  private async healthCheckClaude(settings: AISettings): Promise<HealthCheckResult> {
    const apiKey = settings.claudeApiKey || settings.apiKey || '';
    if (!apiKey) {
      return {
        success: false,
        message: 'Anthropic Claude API key is missing.',
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      // Light healthcheck ping
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: settings.claudeModel || 'claude-3-5-sonnet-20241022',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      });
      clearTimeout(timeout);

      if (!res.ok && res.status !== 400) {
        return {
          success: false,
          message: `Anthropic API returned HTTP ${res.status}: ${res.statusText}`,
        };
      }

      return {
        success: true,
        message: 'Successfully authenticated with Anthropic Claude API.',
      };
    } catch (err: any) {
      clearTimeout(timeout);
      return {
        success: false,
        message: `Claude connection failed: ${err.message}`,
      };
    }
  }

  private async callClaude(
    request: ChatCompletionRequest,
    settings: AISettings
  ): Promise<string> {
    const apiKey = settings.claudeApiKey || settings.apiKey || '';
    const model = settings.claudeModel || 'claude-3-5-sonnet-20241022';
    const temp = request.temperature ?? settings.temperature ?? 0.7;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          system: request.systemPrompt,
          messages: [{ role: 'user', content: request.userPrompt }],
          temperature: temp,
        }),
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Claude API error (${res.status}): ${text || res.statusText}`);
      }

      const data = await res.json() as {
        content?: Array<{ type: string; text?: string }>;
      };

      return data.content?.[0]?.text || '';
    } catch (err: any) {
      clearTimeout(timeout);
      throw new Error(`Claude request failed: ${err.message}`);
    }
  }
}
