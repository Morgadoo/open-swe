export enum LLMTask {
  /**
   * Used for programmer tasks. This includes: writing code,
   * generating plans, taking context gathering actions, etc.
   */
  PLANNER = "planner",
  /**
   * Used for programmer tasks. This includes: writing code,
   * generating plans, taking context gathering actions, etc.
   */
  PROGRAMMER = "programmer",
  /**
   * Used for routing tasks. This includes: initial request
   * routing to different agents.
   */
  ROUTER = "router",
  /**
   * Used for reviewer tasks. This includes: reviewing code,
   * generating plans, taking context gathering actions, etc.
   */
  REVIEWER = "reviewer",
  /**
   * Used for summarizing tasks. This includes: summarizing
   * the conversation history, summarizing actions taken during
   * a task execution, etc. Should be a slightly advanced model.
   */
  SUMMARIZER = "summarizer",
}

/**
 * Default model configuration for each task (anthropic provider)
 * Used when OpenAI-compatible is NOT enabled
 */
export const TASK_TO_CONFIG_DEFAULTS_MAP = {
  [LLMTask.PLANNER]: {
    modelName: "anthropic:claude-opus-4-5",
    temperature: 0,
  },
  [LLMTask.PROGRAMMER]: {
    modelName: "anthropic:claude-opus-4-5",
    temperature: 0,
  },
  [LLMTask.REVIEWER]: {
    modelName: "anthropic:claude-opus-4-5",
    temperature: 0,
  },
  [LLMTask.ROUTER]: {
    modelName: "anthropic:claude-haiku-4-5",
    temperature: 0,
  },
  [LLMTask.SUMMARIZER]: {
    modelName: "anthropic:claude-haiku-4-5",
    temperature: 0,
  },
};

/**
 * OpenAI-compatible model configuration for each task
 * Used when OpenAI-compatible is enabled (via env var or config)
 */
export const OPENAI_COMPATIBLE_DEFAULTS_MAP = {
  [LLMTask.PLANNER]: {
    modelName: "openai-compatible:claude-sonnet-4-5-20250929",
    temperature: 0,
  },
  [LLMTask.PROGRAMMER]: {
    modelName: "openai-compatible:claude-sonnet-4-5-20250929",
    temperature: 0,
  },
  [LLMTask.REVIEWER]: {
    modelName: "openai-compatible:claude-sonnet-4-5-20250929",
    temperature: 0,
  },
  [LLMTask.ROUTER]: {
    modelName: "openai-compatible:claude-haiku-4-5-20251001",
    temperature: 0,
  },
  [LLMTask.SUMMARIZER]: {
    modelName: "openai-compatible:claude-haiku-4-5-20251001",
    temperature: 0,
  },
};

/**
 * Get task defaults based on whether OpenAI-compatible is enabled.
 *
 * @param task - The LLM task type
 * @param isOpenAICompatibleEnabled - Whether OpenAI-compatible API is enabled
 *        (via OPENAI_API_BASE env var or openaiCompatibleConfig.enabled)
 * @returns The model configuration for the task
 */
export function getTaskDefaults(
  task: LLMTask,
  isOpenAICompatibleEnabled: boolean
): { modelName: string; temperature: number } {
  if (isOpenAICompatibleEnabled) {
    return OPENAI_COMPATIBLE_DEFAULTS_MAP[task];
  }
  return TASK_TO_CONFIG_DEFAULTS_MAP[task];
}
