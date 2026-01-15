/**
 * Model option for the UI selector
 */
export interface ModelOption {
  label: string;
  value: string;
  provider?: string;
  contextLength?: number;
}

/**
 * Static model options for known providers
 */
export const MODEL_OPTIONS: ModelOption[] = [
  // TODO: Test these then re-enable
  // {
  //   label: "Claude Sonnet 4 (Extended Thinking)",
  //   value: "anthropic:extended-thinking:claude-sonnet-4-0",
  // },
  // {
  //   label: "Claude Opus 4 (Extended Thinking)",
  //   value: "anthropic:extended-thinking:claude-opus-4-0",
  // },
  {
    label: "Claude Sonnet 4.5",
    value: "anthropic:claude-sonnet-4-5",
  },
  {
    label: "Claude Sonnet 4",
    value: "anthropic:claude-sonnet-4-0",
  },
  {
    label: "Claude Opus 4.5",
    value: "anthropic:claude-opus-4-5",
  },
  {
    label: "Claude Opus 4.1",
    value: "anthropic:claude-opus-4-1",
  },
  {
    label: "Claude Opus 4",
    value: "anthropic:claude-opus-4-0",
  },
  {
    label: "Claude 3.7 Sonnet",
    value: "anthropic:claude-3-7-sonnet-latest",
  },
  {
    label: "Claude 3.5 Sonnet",
    value: "anthropic:claude-3-5-sonnet-latest",
  },
  {
    label: "Claude 3.5 Haiku",
    value: "anthropic:claude-3-5-haiku-latest",
  },
  {
    label: "GPT 5",
    value: "openai:gpt-5",
  },
  {
    label: "GPT 5 mini",
    value: "openai:gpt-5-mini",
  },
  {
    label: "GPT 5 nano",
    value: "openai:gpt-5-nano",
  },
  {
    label: "o4",
    value: "openai:o4",
  },
  {
    label: "o4 mini",
    value: "openai:o4-mini",
  },
  {
    label: "o3",
    value: "openai:o3",
  },
  {
    label: "o3 mini",
    value: "openai:o3-mini",
  },
  {
    label: "GPT 4o",
    value: "openai:gpt-4o",
  },
  {
    label: "GPT 4o mini",
    value: "openai:gpt-4o-mini",
  },
  {
    label: "GPT 4.1",
    value: "openai:gpt-4.1",
  },
  {
    label: "GPT 4.1 mini",
    value: "openai:gpt-4.1-mini",
  },
  {
    label: "Gemini 2.5 Pro",
    value: "google-genai:gemini-2.5-pro",
  },
  {
    label: "Gemini 2.5 Flash",
    value: "google-genai:gemini-2.5-flash",
  },
];

export const MODEL_OPTIONS_NO_THINKING = MODEL_OPTIONS.filter(
  ({ value }) =>
    !value.includes("extended-thinking") || !value.startsWith("openai:o"),
);

/**
 * Discovered model from an OpenAI-compatible endpoint
 */
export interface DiscoveredModel {
  id: string;
  label: string;
  contextLength?: number;
}

/**
 * Convert discovered models to model options for the UI
 * Models are prefixed with "openai-compatible:" provider
 */
export function discoveredModelsToOptions(
  models: DiscoveredModel[],
): ModelOption[] {
  return models.map((model) => ({
    label: `${model.label} (Custom)`,
    value: `openai-compatible:${model.id}`,
    provider: "openai-compatible",
    contextLength: model.contextLength,
  }));
}

/**
 * Merge static model options with discovered models from OpenAI-compatible endpoints
 * Discovered models are added at the beginning of the list
 */
export function mergeModelOptions(
  staticOptions: ModelOption[],
  discoveredModels: DiscoveredModel[],
): ModelOption[] {
  const discoveredOptions = discoveredModelsToOptions(discoveredModels);

  // Add a separator if there are discovered models
  if (discoveredOptions.length > 0) {
    return [
      ...discoveredOptions,
      // Visual separator could be handled in UI
      ...staticOptions,
    ];
  }

  return staticOptions;
}

/**
 * Get all model options including dynamic ones
 * @param discoveredModels - Models discovered from OpenAI-compatible endpoint
 * @param includeThinking - Whether to include thinking models
 */
export function getAllModelOptions(
  discoveredModels: DiscoveredModel[] = [],
  includeThinking = true,
): ModelOption[] {
  const baseOptions = includeThinking
    ? MODEL_OPTIONS
    : MODEL_OPTIONS_NO_THINKING;
  return mergeModelOptions(baseOptions, discoveredModels);
}

/**
 * Extract provider from a model value string
 * @example "anthropic:claude-3-5-sonnet" -> "anthropic"
 * @example "openai-compatible:gpt-4" -> "openai-compatible"
 */
export function extractProviderFromModel(modelValue: string): string {
  const parts = modelValue.split(":");
  return parts[0] || "";
}

/**
 * Extract model ID from a model value string
 * @example "anthropic:claude-3-5-sonnet" -> "claude-3-5-sonnet"
 * @example "openai-compatible:gpt-4" -> "gpt-4"
 */
export function extractModelIdFromValue(modelValue: string): string {
  const parts = modelValue.split(":");
  return parts.slice(1).join(":") || modelValue;
}
