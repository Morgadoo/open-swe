/**
 * OpenAI-Compatible Provider Types
 *
 * Supports any OpenAI-compatible API endpoint including:
 * - OpenRouter
 * - LM Studio
 * - Ollama
 * - LocalAI
 * - Text Generation WebUI
 * - vLLM
 * - and others
 */

/**
 * Configuration for an OpenAI-compatible endpoint
 */
export interface OpenAICompatibleConfig {
  /**
   * Base URL for the API endpoint
   * @example "http://127.0.0.1:8317/v1"
   * @example "https://openrouter.ai/api/v1"
   */
  baseUrl: string;

  /**
   * API key for authentication (optional for local endpoints)
   */
  apiKey?: string;

  /**
   * Organization ID for providers that support it
   */
  organizationId?: string;

  /**
   * Additional headers to include in requests
   * @example { "HTTP-Referer": "https://myapp.com", "X-Title": "My App" }
   */
  customHeaders?: Record<string, string>;

  /**
   * Request timeout in milliseconds
   * @default 30000
   */
  timeout?: number;

  /**
   * Maximum number of retry attempts
   * @default 3
   */
  maxRetries?: number;

  /**
   * Default model to use when none is specified
   */
  defaultModel?: string;

  /**
   * Whether this provider is enabled
   * @default false
   */
  enabled: boolean;
}

/**
 * Default configuration values
 */
export const DEFAULT_OPENAI_COMPATIBLE_CONFIG: OpenAICompatibleConfig = {
  baseUrl: "http://127.0.0.1:8317/v1",
  timeout: 30000,
  maxRetries: 3,
  enabled: false,
};

/**
 * Model information from the /models endpoint
 */
export interface DiscoveredModel {
  /**
   * Model identifier used in API requests
   */
  id: string;

  /**
   * Human-readable display name
   */
  label: string;

  /**
   * Context window size in tokens (if available)
   */
  contextLength?: number;

  /**
   * Model capabilities
   */
  capabilities: ModelCapability[];

  /**
   * Who owns/provides this model
   */
  ownedBy?: string;

  /**
   * Unix timestamp when model was created
   */
  created?: number;
}

/**
 * Known model capabilities
 */
export type ModelCapability =
  | "chat"
  | "completion"
  | "embeddings"
  | "vision"
  | "function_calling"
  | "streaming";

/**
 * Response from the /models endpoint (OpenAI format)
 */
export interface ModelsListResponse {
  object: "list";
  data: ModelObject[];
}

/**
 * Individual model object from the API
 */
export interface ModelObject {
  id: string;
  object: "model";
  created?: number;
  owned_by?: string;
  // Extended fields (may vary by provider)
  context_length?: number;
  max_context_length?: number;
  context_window?: number;
  pricing?: {
    prompt?: string | number;
    completion?: string | number;
  };
  capabilities?: Partial<Record<ModelCapability, boolean>>;
  // Some providers include permission info
  permission?: unknown[];
  root?: string;
  parent?: string;
}

/**
 * Result of a connection test
 */
export interface ConnectionTestResult {
  success: boolean;
  latencyMs?: number;
  modelCount?: number;
  error?: string;
  errorCode?: string;
}

/**
 * Result of model discovery
 */
export interface ModelDiscoveryResult {
  success: boolean;
  models: DiscoveredModel[];
  error?: string;
}

/**
 * HTTP error codes we handle specially
 */
export enum OpenAICompatibleErrorCode {
  BAD_REQUEST = "BAD_REQUEST",
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  NOT_FOUND = "NOT_FOUND",
  RATE_LIMITED = "RATE_LIMITED",
  SERVER_ERROR = "SERVER_ERROR",
  TIMEOUT = "TIMEOUT",
  NETWORK_ERROR = "NETWORK_ERROR",
  INVALID_RESPONSE = "INVALID_RESPONSE",
}

/**
 * Convert HTTP status to error code
 */
export function httpStatusToErrorCode(
  status: number,
): OpenAICompatibleErrorCode {
  if (status === 400) return OpenAICompatibleErrorCode.BAD_REQUEST;
  if (status === 401) return OpenAICompatibleErrorCode.UNAUTHORIZED;
  if (status === 403) return OpenAICompatibleErrorCode.FORBIDDEN;
  if (status === 404) return OpenAICompatibleErrorCode.NOT_FOUND;
  if (status === 429) return OpenAICompatibleErrorCode.RATE_LIMITED;
  if (status >= 500) return OpenAICompatibleErrorCode.SERVER_ERROR;
  return OpenAICompatibleErrorCode.SERVER_ERROR;
}

/**
 * User-friendly error messages
 */
export const ERROR_MESSAGES: Record<OpenAICompatibleErrorCode, string> = {
  [OpenAICompatibleErrorCode.BAD_REQUEST]: "Invalid request format",
  [OpenAICompatibleErrorCode.UNAUTHORIZED]: "API key required or invalid",
  [OpenAICompatibleErrorCode.FORBIDDEN]: "Access denied to this resource",
  [OpenAICompatibleErrorCode.NOT_FOUND]: "Endpoint or model not found",
  [OpenAICompatibleErrorCode.RATE_LIMITED]:
    "Rate limited - please wait and retry",
  [OpenAICompatibleErrorCode.SERVER_ERROR]:
    "Server error - please try again later",
  [OpenAICompatibleErrorCode.TIMEOUT]: "Request timed out",
  [OpenAICompatibleErrorCode.NETWORK_ERROR]:
    "Network error - check connection and URL",
  [OpenAICompatibleErrorCode.INVALID_RESPONSE]: "Invalid response from server",
};

/**
 * Result of URL validation
 */
export interface UrlValidationResult {
  valid: boolean;
  error?: string;
  warning?: string;
}

/**
 * Validate a base URL
 */
export function validateBaseUrl(url: string): UrlValidationResult {
  try {
    const parsed = new URL(url);

    // Must be http or https
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { valid: false, error: "URL must use http or https protocol" };
    }

    // Check if URL is local
    const isLocal =
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname.startsWith("192.168.") ||
      parsed.hostname.startsWith("10.") ||
      parsed.hostname === "host.docker.internal";

    // Warn about HTTP for non-local URLs (but still allow)
    if (parsed.protocol === "http:" && !isLocal) {
      return {
        valid: true,
        warning:
          "Using HTTP for non-local endpoints may expose your API key. Consider using HTTPS.",
      };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }
}

/**
 * Derive a display label from a model ID
 */
export function modelIdToLabel(id: string): string {
  // Common transformations
  return id
    .replace(/-/g, " ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/(\d+)b/gi, "$1B") // Format parameter counts
    .trim();
}
