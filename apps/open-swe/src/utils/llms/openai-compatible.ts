/**
 * OpenAI-Compatible API Client
 *
 * Handles model discovery, connection testing, and configuration
 * for OpenAI-compatible endpoints.
 */

import {
  OpenAICompatibleConfig,
  DEFAULT_OPENAI_COMPATIBLE_CONFIG,
  DiscoveredModel,
  ModelsListResponse,
  ModelObject,
  ConnectionTestResult,
  ModelDiscoveryResult,
  OpenAICompatibleErrorCode,
  httpStatusToErrorCode,
  ERROR_MESSAGES,
  validateBaseUrl,
  modelIdToLabel,
} from "@openswe/shared/open-swe/openai-compatible";
import { createLogger, LogLevel } from "../logger.js";

const logger = createLogger(LogLevel.INFO, "OpenAICompatibleClient");

/**
 * Cache entry for model discovery
 */
interface ModelCacheEntry {
  models: DiscoveredModel[];
  timestamp: number;
}

/**
 * Client for interacting with OpenAI-compatible API endpoints
 */
export class OpenAICompatibleClient {
  private config: OpenAICompatibleConfig;
  private readonly modelCache: Map<string, ModelCacheEntry> = new Map();
  private static readonly CACHE_TTL_MS = 60000; // 60 seconds

  constructor(config: Partial<OpenAICompatibleConfig> = {}) {
    this.config = {
      ...DEFAULT_OPENAI_COMPATIBLE_CONFIG,
      ...config,
    };
  }

  /**
   * Generate cache key from config
   */
  private getCacheKey(): string {
    return `${this.config.baseUrl}:${this.config.apiKey ?? ""}`;
  }

  /**
   * Check if cached models are still valid
   */
  private isCacheValid(entry: ModelCacheEntry): boolean {
    return Date.now() - entry.timestamp < OpenAICompatibleClient.CACHE_TTL_MS;
  }

  /**
   * Clear the model cache
   */
  clearCache(): void {
    this.modelCache.clear();
    logger.debug("Model cache cleared");
  }

  /**
   * Update the client configuration
   */
  updateConfig(config: Partial<OpenAICompatibleConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }

  /**
   * Get the current configuration
   */
  getConfig(): OpenAICompatibleConfig {
    return { ...this.config };
  }

  /**
   * Build request headers
   */
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }

    if (this.config.organizationId) {
      headers["OpenAI-Organization"] = this.config.organizationId;
    }

    if (this.config.customHeaders) {
      Object.assign(headers, this.config.customHeaders);
    }

    return headers;
  }

  /**
   * Calculate delay for exponential backoff
   */
  private getBackoffDelay(attempt: number, baseDelayMs: number = 1000): number {
    // Exponential backoff with jitter: baseDelay * 2^attempt + random jitter
    const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
    const jitter = Math.random() * 1000;
    return Math.min(exponentialDelay + jitter, 30000); // Cap at 30 seconds
  }

  /**
   * Sleep for a specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(errorCode: OpenAICompatibleErrorCode): boolean {
    return [
      OpenAICompatibleErrorCode.RATE_LIMITED,
      OpenAICompatibleErrorCode.SERVER_ERROR,
      OpenAICompatibleErrorCode.TIMEOUT,
      OpenAICompatibleErrorCode.NETWORK_ERROR,
    ].includes(errorCode);
  }

  /**
   * Make a request to the API with timeout, retry logic, and error handling
   */
  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<{ data?: T; error?: OpenAICompatibleErrorCode; status?: number }> {
    const url = `${this.config.baseUrl.replace(/\/+$/, "")}${endpoint}`;
    const timeout = this.config.timeout ?? 30000;
    const maxRetries = this.config.maxRetries ?? 3;

    let lastError: OpenAICompatibleErrorCode = OpenAICompatibleErrorCode.NETWORK_ERROR;
    let lastStatus: number | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, {
          ...options,
          headers: {
            ...this.buildHeaders(),
            ...((options.headers as Record<string, string>) || {}),
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorCode = httpStatusToErrorCode(response.status);
          lastError = errorCode;
          lastStatus = response.status;

          // Check if we should retry
          if (this.isRetryableError(errorCode) && attempt < maxRetries) {
            const delay = this.getBackoffDelay(attempt);
            logger.warn(`API request failed, retrying in ${delay}ms: ${endpoint}`, {
              status: response.status,
              errorCode,
              attempt: attempt + 1,
              maxRetries,
            });
            await this.sleep(delay);
            continue;
          }

          logger.warn(`API request failed: ${endpoint}`, {
            status: response.status,
            errorCode,
            attempts: attempt + 1,
          });
          return { error: errorCode, status: response.status };
        }

        // Parse JSON with error handling
        let data: T;
        try {
          data = (await response.json()) as T;
        } catch (parseError) {
          logger.error(`Failed to parse JSON response: ${endpoint}`, {
            error: parseError instanceof Error ? parseError.message : "Unknown parse error",
          });
          return { error: OpenAICompatibleErrorCode.INVALID_RESPONSE };
        }

        return { data };
      } catch (error) {
        clearTimeout(timeoutId);

        if (error instanceof Error) {
          if (error.name === "AbortError") {
            lastError = OpenAICompatibleErrorCode.TIMEOUT;
            if (attempt < maxRetries) {
              const delay = this.getBackoffDelay(attempt);
              logger.warn(`Request timeout, retrying in ${delay}ms: ${endpoint}`, {
                attempt: attempt + 1,
                maxRetries,
              });
              await this.sleep(delay);
              continue;
            }
            logger.warn(`Request timeout after ${attempt + 1} attempts: ${endpoint}`);
            return { error: OpenAICompatibleErrorCode.TIMEOUT };
          }

          lastError = OpenAICompatibleErrorCode.NETWORK_ERROR;
          if (attempt < maxRetries) {
            const delay = this.getBackoffDelay(attempt);
            logger.warn(`Network error, retrying in ${delay}ms: ${endpoint}`, {
              error: error.message,
              attempt: attempt + 1,
              maxRetries,
            });
            await this.sleep(delay);
            continue;
          }

          logger.error(`Network error after ${attempt + 1} attempts: ${endpoint}`, {
            error: error.message,
          });
          return { error: OpenAICompatibleErrorCode.NETWORK_ERROR };
        }

        lastError = OpenAICompatibleErrorCode.NETWORK_ERROR;
      }
    }

    return { error: lastError, status: lastStatus };
  }

  /**
   * Test the connection to the API endpoint
   */
  async testConnection(): Promise<ConnectionTestResult> {
    // Validate URL first
    const urlValidation = validateBaseUrl(this.config.baseUrl);
    if (!urlValidation.valid) {
      return {
        success: false,
        error: urlValidation.error,
        errorCode: OpenAICompatibleErrorCode.BAD_REQUEST,
      };
    }

    const startTime = Date.now();

    const result = await this.makeRequest<ModelsListResponse>("/models");

    const latencyMs = Date.now() - startTime;

    if (result.error) {
      return {
        success: false,
        latencyMs,
        error: ERROR_MESSAGES[result.error],
        errorCode: result.error,
      };
    }

    if (!result.data || !Array.isArray(result.data.data)) {
      return {
        success: false,
        latencyMs,
        error: "Invalid response format from /models endpoint",
        errorCode: OpenAICompatibleErrorCode.INVALID_RESPONSE,
      };
    }

    logger.info("Connection test successful", {
      latencyMs,
      modelCount: result.data.data.length,
    });

    return {
      success: true,
      latencyMs,
      modelCount: result.data.data.length,
    };
  }

  /**
   * Fetch and normalize available models from the API
   * @param skipCache - If true, bypasses the cache and fetches fresh data
   */
  async fetchModels(skipCache = false): Promise<ModelDiscoveryResult> {
    const cacheKey = this.getCacheKey();

    // Check cache first unless skipCache is true
    if (!skipCache) {
      const cached = this.modelCache.get(cacheKey);
      if (cached && this.isCacheValid(cached)) {
        logger.debug("Returning cached models", {
          count: cached.models.length,
          cacheAge: Date.now() - cached.timestamp,
        });
        return {
          success: true,
          models: cached.models,
        };
      }
    }

    const result = await this.makeRequest<ModelsListResponse>("/models");

    if (result.error) {
      return {
        success: false,
        models: [],
        error: ERROR_MESSAGES[result.error],
      };
    }

    if (!result.data || !Array.isArray(result.data.data)) {
      return {
        success: false,
        models: [],
        error: "Invalid response format",
      };
    }

    const models = this.normalizeModels(result.data.data);

    // Update cache
    this.modelCache.set(cacheKey, {
      models,
      timestamp: Date.now(),
    });

    logger.info("Fetched models", {
      count: models.length,
      modelIds: models.map((m) => m.id),
      cached: false,
    });

    return {
      success: true,
      models,
    };
  }

  /**
   * Normalize model objects from various providers into a consistent format
   */
  private normalizeModels(models: ModelObject[]): DiscoveredModel[] {
    return models
      .filter((model) => model.id && typeof model.id === "string")
      .map((model) => this.normalizeModel(model))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  /**
   * Normalize a single model object
   */
  private normalizeModel(model: ModelObject): DiscoveredModel {
    // Try to extract context length from various fields
    const contextLength =
      model.context_length ||
      model.max_context_length ||
      model.context_window ||
      this.inferContextLength(model.id);

    // Build capabilities list
    const capabilities = this.extractCapabilities(model);

    return {
      id: model.id,
      label: modelIdToLabel(model.id),
      contextLength,
      capabilities,
      ownedBy: model.owned_by,
      created: model.created,
    };
  }

  /**
   * Extract capabilities from model object
   */
  private extractCapabilities(
    model: ModelObject,
  ): DiscoveredModel["capabilities"] {
    const caps: DiscoveredModel["capabilities"] = [];

    // Check explicit capabilities
    if (model.capabilities) {
      if (model.capabilities.chat) caps.push("chat");
      if (model.capabilities.completion) caps.push("completion");
      if (model.capabilities.embeddings) caps.push("embeddings");
      if (model.capabilities.vision) caps.push("vision");
      if (model.capabilities.function_calling) caps.push("function_calling");
      if (model.capabilities.streaming) caps.push("streaming");
    }

    // If no explicit capabilities, infer from model name
    if (caps.length === 0) {
      const id = model.id.toLowerCase();

      // Most models support chat
      caps.push("chat");

      // Check for vision support
      if (
        id.includes("vision") ||
        id.includes("4o") ||
        id.includes("gpt-4-turbo") ||
        id.includes("claude-3")
      ) {
        caps.push("vision");
      }

      // Check for embedding models
      if (id.includes("embed") || id.includes("embedding")) {
        caps.push("embeddings");
      }

      // Most modern models support function calling
      if (
        !id.includes("embed") &&
        !id.includes("davinci") &&
        !id.includes("curie")
      ) {
        caps.push("function_calling");
      }
    }

    return caps;
  }

  /**
   * Infer context length from model name (fallback)
   */
  private inferContextLength(modelId: string): number | undefined {
    const id = modelId.toLowerCase();

    // Known context lengths for popular models
    if (id.includes("claude-3-opus")) return 200000;
    if (id.includes("claude-3-sonnet")) return 200000;
    if (id.includes("claude-3-haiku")) return 200000;
    if (id.includes("claude-2")) return 100000;
    if (id.includes("gpt-4-turbo") || id.includes("gpt-4o")) return 128000;
    if (id.includes("gpt-4-32k")) return 32768;
    if (id.includes("gpt-4")) return 8192;
    if (id.includes("gpt-3.5-turbo-16k")) return 16384;
    if (id.includes("gpt-3.5")) return 4096;
    if (id.includes("llama-2-70b")) return 4096;
    if (id.includes("llama-3")) return 8192;
    if (id.includes("mistral-7b")) return 32768;
    if (id.includes("mixtral")) return 32768;

    // Check for context length in model name (e.g., "model-32k")
    const contextRegex = /(\d+)k/;
    const match = contextRegex.exec(id);
    if (match?.[1]) {
      return Number.parseInt(match[1], 10) * 1024;
    }

    return undefined;
  }

  /**
   * Check if a specific model exists
   */
  async modelExists(modelId: string): Promise<boolean> {
    const result = await this.fetchModels();
    if (!result.success) return false;
    return result.models.some((m) => m.id === modelId);
  }
}

// Singleton instance for reuse
let clientInstance: OpenAICompatibleClient | null = null;

/**
 * Get or create the OpenAI-compatible client instance
 */
export function getOpenAICompatibleClient(
  config?: Partial<OpenAICompatibleConfig>,
): OpenAICompatibleClient {
  if (!clientInstance) {
    clientInstance = new OpenAICompatibleClient(config);
  } else if (config) {
    clientInstance.updateConfig(config);
  }
  return clientInstance;
}

/**
 * Reset the client instance (useful for testing)
 */
export function resetOpenAICompatibleClient(): void {
  clientInstance = null;
}
