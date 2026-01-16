/**
 * Configuration Manager for Loop Prevention
 *
 * Handles threshold configuration with validation, defaults, and per-tool overrides.
 * Provides utilities for parsing, validating, and managing loop prevention configurations.
 */

import {
  type LoopPreventionConfig,
  type ToolLoopConfig,
  DEFAULT_LOOP_PREVENTION_CONFIG,
} from "@openswe/shared/open-swe/loop-prevention/types";

/**
 * Tool categories for applying category-level configuration overrides.
 */
export type ToolCategory =
  | "file_operations"
  | "shell_commands"
  | "search_tools"
  | "code_modification"
  | "communication"
  | "other";

/**
 * Effective configuration for a specific tool.
 * Combines default config with tool-specific overrides.
 */
export interface EffectiveToolConfig {
  maxIdenticalCalls: number;
  maxSimilarCalls: number;
  maxConsecutiveErrors: number;
  similarityThreshold: number;
  timeWindowMs: number;
}

/**
 * Validation error for configuration fields.
 */
export interface ConfigValidationError {
  field: string;
  message: string;
  value: unknown;
  expectedRange?: { min: number; max: number };
}

/**
 * Result of configuration validation.
 */
export interface ConfigValidationResult {
  valid: boolean;
  errors: ConfigValidationError[];
  warnings: string[];
}

/**
 * Mapping of tool names to their categories.
 */
const TOOL_CATEGORY_MAP: Record<string, ToolCategory> = {
  // File operations
  read_file: "file_operations",
  write_file: "file_operations",
  list_files: "file_operations",
  view: "file_operations",
  str_replace_editor: "file_operations",
  text_editor: "file_operations",

  // Shell commands
  shell: "shell_commands",
  execute_command: "shell_commands",
  bash: "shell_commands",

  // Search tools
  grep: "search_tools",
  search: "search_tools",
  find: "search_tools",
  search_documents_for: "search_tools",

  // Code modification
  apply_patch: "code_modification",
  edit_file: "code_modification",
  insert: "code_modification",
  replace: "code_modification",

  // Communication
  ask_followup_question: "communication",
  attempt_completion: "communication",
  request_human_help: "communication",
  update_plan: "communication",
};

/**
 * Default configurations for each tool category.
 */
const CATEGORY_DEFAULTS: Partial<Record<ToolCategory, Partial<EffectiveToolConfig>>> = {
  file_operations: {
    maxIdenticalCalls: 3,
    maxSimilarCalls: 5,
    maxConsecutiveErrors: 3,
  },
  shell_commands: {
    maxIdenticalCalls: 2,
    maxSimilarCalls: 4,
    maxConsecutiveErrors: 2,
  },
  search_tools: {
    maxIdenticalCalls: 3,
    maxSimilarCalls: 8,
    maxConsecutiveErrors: 5,
  },
  code_modification: {
    maxIdenticalCalls: 2,
    maxSimilarCalls: 4,
    maxConsecutiveErrors: 3,
  },
  communication: {
    maxIdenticalCalls: 2,
    maxSimilarCalls: 3,
    maxConsecutiveErrors: 2,
  },
};

/**
 * Configuration presets for different use cases.
 */
const CONFIG_PRESETS: Record<string, LoopPreventionConfig> = {
  strict: {
    enabled: true,
    exactMatchThreshold: 2,
    exactMatchLookbackWindow: 30,
    semanticSimilarityEnabled: true,
    semanticSimilarityThreshold: 0.75,
    semanticMatchThreshold: 3,
    patternDetectionEnabled: true,
    minPatternLength: 2,
    maxPatternLength: 4,
    patternRepetitionThreshold: 2,
    toolSpecificConfig: {},
    degradationLevels: [
      {
        level: 1,
        triggerCondition: "exactMatch >= 2",
        action: "switch-strategy",
        cooldownMs: 30000,
      },
      {
        level: 2,
        triggerCondition: "strategySwitch >= 1",
        action: "request-clarification",
        cooldownMs: 60000,
      },
      {
        level: 3,
        triggerCondition: "clarificationFailed",
        action: "escalate",
        cooldownMs: 120000,
      },
    ],
    autoEscalationEnabled: true,
    escalationCooldownMs: 120000,
  },
  balanced: {
    ...DEFAULT_LOOP_PREVENTION_CONFIG,
  },
  permissive: {
    enabled: true,
    exactMatchThreshold: 5,
    exactMatchLookbackWindow: 100,
    semanticSimilarityEnabled: true,
    semanticSimilarityThreshold: 0.95,
    semanticMatchThreshold: 8,
    patternDetectionEnabled: true,
    minPatternLength: 3,
    maxPatternLength: 6,
    patternRepetitionThreshold: 3,
    toolSpecificConfig: {},
    degradationLevels: [
      {
        level: 1,
        triggerCondition: "exactMatch >= 5",
        action: "switch-strategy",
        cooldownMs: 120000,
      },
      {
        level: 2,
        triggerCondition: "strategySwitch >= 3",
        action: "request-clarification",
        cooldownMs: 180000,
      },
      {
        level: 3,
        triggerCondition: "clarificationFailed",
        action: "escalate",
        cooldownMs: 600000,
      },
    ],
    autoEscalationEnabled: true,
    escalationCooldownMs: 600000,
  },
  development: {
    enabled: true,
    exactMatchThreshold: 10,
    exactMatchLookbackWindow: 200,
    semanticSimilarityEnabled: false,
    semanticSimilarityThreshold: 0.99,
    semanticMatchThreshold: 15,
    patternDetectionEnabled: false,
    minPatternLength: 5,
    maxPatternLength: 10,
    patternRepetitionThreshold: 5,
    toolSpecificConfig: {},
    degradationLevels: [
      {
        level: 1,
        triggerCondition: "exactMatch >= 10",
        action: "switch-strategy",
        cooldownMs: 300000,
      },
      {
        level: 2,
        triggerCondition: "strategySwitch >= 5",
        action: "request-clarification",
        cooldownMs: 600000,
      },
      {
        level: 3,
        triggerCondition: "clarificationFailed",
        action: "escalate",
        cooldownMs: 1200000,
      },
    ],
    autoEscalationEnabled: false,
    escalationCooldownMs: 1200000,
  },
};

/**
 * Validation ranges for configuration fields.
 */
const VALIDATION_RANGES: Record<string, { min: number; max: number }> = {
  exactMatchThreshold: { min: 1, max: 100 },
  exactMatchLookbackWindow: { min: 5, max: 1000 },
  semanticSimilarityThreshold: { min: 0, max: 1 },
  semanticMatchThreshold: { min: 1, max: 100 },
  minPatternLength: { min: 2, max: 20 },
  maxPatternLength: { min: 2, max: 50 },
  patternRepetitionThreshold: { min: 1, max: 20 },
  escalationCooldownMs: { min: 1000, max: 3600000 },
};

/**
 * Gets the tool category for a given tool name.
 *
 * @param toolName - The name of the tool
 * @returns The category the tool belongs to
 */
export function getToolCategory(toolName: string): ToolCategory {
  const normalizedName = toolName.toLowerCase().replace(/-/g, "_");
  return TOOL_CATEGORY_MAP[normalizedName] ?? "other";
}

/**
 * Validates a configuration and returns validation errors.
 *
 * @param config - The configuration to validate
 * @returns Validation result with errors and warnings
 */
export function validateConfig(
  config: Partial<LoopPreventionConfig>,
): ConfigValidationResult {
  const errors: ConfigValidationError[] = [];
  const warnings: string[] = [];

  for (const [field, range] of Object.entries(VALIDATION_RANGES)) {
    const value = config[field as keyof LoopPreventionConfig];
    if (value !== undefined && typeof value === "number") {
      if (value < range.min || value > range.max) {
        errors.push({
          field,
          message: `Value ${value} is outside valid range [${range.min}, ${range.max}]`,
          value,
          expectedRange: range,
        });
      }
    }
  }

  if (
    config.minPatternLength !== undefined &&
    config.maxPatternLength !== undefined
  ) {
    if (config.minPatternLength > config.maxPatternLength) {
      errors.push({
        field: "minPatternLength",
        message: "minPatternLength cannot be greater than maxPatternLength",
        value: config.minPatternLength,
      });
    }
  }

  if (config.degradationLevels !== undefined) {
    if (!Array.isArray(config.degradationLevels)) {
      errors.push({
        field: "degradationLevels",
        message: "degradationLevels must be an array",
        value: config.degradationLevels,
      });
    } else {
      for (let i = 0; i < config.degradationLevels.length; i++) {
        const level = config.degradationLevels[i];
        if (typeof level.level !== "number" || level.level < 0) {
          errors.push({
            field: `degradationLevels[${i}].level`,
            message: "Level must be a non-negative number",
            value: level.level,
          });
        }
        if (typeof level.cooldownMs !== "number" || level.cooldownMs < 0) {
          errors.push({
            field: `degradationLevels[${i}].cooldownMs`,
            message: "cooldownMs must be a non-negative number",
            value: level.cooldownMs,
          });
        }
        const validActions = [
          "switch-strategy",
          "request-clarification",
          "escalate",
          "abort",
        ];
        if (!validActions.includes(level.action)) {
          errors.push({
            field: `degradationLevels[${i}].action`,
            message: `Invalid action. Must be one of: ${validActions.join(", ")}`,
            value: level.action,
          });
        }
      }
    }
  }

  if (
    config.semanticSimilarityEnabled === true &&
    config.semanticSimilarityThreshold === undefined
  ) {
    warnings.push(
      "semanticSimilarityEnabled is true but semanticSimilarityThreshold is not set",
    );
  }

  if (
    config.patternDetectionEnabled === true &&
    (config.minPatternLength === undefined ||
      config.maxPatternLength === undefined)
  ) {
    warnings.push(
      "patternDetectionEnabled is true but pattern length bounds are not fully specified",
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Parses and validates a loop prevention configuration.
 * Returns validated config with defaults applied.
 *
 * @param input - Configuration input (JSON string, partial config, or null/undefined)
 * @returns Validated configuration with defaults applied
 */
export function parseLoopPreventionConfig(
  input: string | Partial<LoopPreventionConfig> | null | undefined,
): LoopPreventionConfig {
  if (input === null || input === undefined) {
    return { ...DEFAULT_LOOP_PREVENTION_CONFIG };
  }

  let parsedConfig: Partial<LoopPreventionConfig>;

  if (typeof input === "string") {
    try {
      parsedConfig = JSON.parse(input) as Partial<LoopPreventionConfig>;
    } catch {
      return { ...DEFAULT_LOOP_PREVENTION_CONFIG };
    }
  } else {
    parsedConfig = input;
  }

  const validation = validateConfig(parsedConfig);

  const sanitizedConfig: Partial<LoopPreventionConfig> = { ...parsedConfig };

  for (const error of validation.errors) {
    const field = error.field.split("[")[0] as keyof LoopPreventionConfig;
    if (error.expectedRange && typeof sanitizedConfig[field] === "number") {
      const value = sanitizedConfig[field] as number;
      if (value < error.expectedRange.min) {
        (sanitizedConfig as Record<string, unknown>)[field] =
          error.expectedRange.min;
      } else if (value > error.expectedRange.max) {
        (sanitizedConfig as Record<string, unknown>)[field] =
          error.expectedRange.max;
      }
    }
  }

  return mergeConfigs(DEFAULT_LOOP_PREVENTION_CONFIG, sanitizedConfig);
}

/**
 * Merges two configurations, with override taking precedence.
 *
 * @param base - Base configuration
 * @param override - Override configuration (takes precedence)
 * @returns Merged configuration
 */
export function mergeConfigs(
  base: LoopPreventionConfig,
  override: Partial<LoopPreventionConfig>,
): LoopPreventionConfig {
  const merged: LoopPreventionConfig = { ...base };

  for (const key of Object.keys(override) as (keyof LoopPreventionConfig)[]) {
    const value = override[key];
    if (value === undefined) {
      continue;
    }

    if (key === "toolSpecificConfig" && typeof value === "object") {
      merged.toolSpecificConfig = {
        ...base.toolSpecificConfig,
        ...(value as Record<string, ToolLoopConfig>),
      };
    } else if (key === "degradationLevels" && Array.isArray(value)) {
      merged.degradationLevels = [...value];
    } else {
      (merged as unknown as Record<string, unknown>)[key] = value;
    }
  }

  return merged;
}

/**
 * Gets the effective configuration for a specific tool.
 * Merges default config with category defaults and tool-specific overrides.
 *
 * @param config - The loop prevention configuration
 * @param toolName - The name of the tool
 * @returns Effective configuration for the tool
 */
export function getEffectiveToolConfig(
  config: LoopPreventionConfig,
  toolName: string,
): EffectiveToolConfig {
  const category = getToolCategory(toolName);
  const categoryDefaults = CATEGORY_DEFAULTS[category];

  const baseConfig: EffectiveToolConfig = {
    maxIdenticalCalls: config.exactMatchThreshold,
    maxSimilarCalls: config.semanticMatchThreshold,
    maxConsecutiveErrors: 3,
    similarityThreshold: config.semanticSimilarityThreshold,
    timeWindowMs: 60000,
  };

  const withCategoryDefaults: EffectiveToolConfig = {
    ...baseConfig,
    ...categoryDefaults,
  };

  const toolConfig = config.toolSpecificConfig[toolName];
  if (toolConfig) {
    return {
      maxIdenticalCalls:
        toolConfig.exactMatchThreshold ??
        withCategoryDefaults.maxIdenticalCalls,
      maxSimilarCalls:
        toolConfig.semanticMatchThreshold ??
        withCategoryDefaults.maxSimilarCalls,
      maxConsecutiveErrors:
        toolConfig.allowedConsecutiveErrors ??
        withCategoryDefaults.maxConsecutiveErrors,
      similarityThreshold: withCategoryDefaults.similarityThreshold,
      timeWindowMs: withCategoryDefaults.timeWindowMs,
    };
  }

  return withCategoryDefaults;
}

/**
 * Creates a configuration preset for different use cases.
 *
 * @param preset - The preset name
 * @returns Configuration for the specified preset
 */
export function getConfigPreset(
  preset: "strict" | "balanced" | "permissive" | "development",
): LoopPreventionConfig {
  const presetConfig = CONFIG_PRESETS[preset];
  if (!presetConfig) {
    return { ...DEFAULT_LOOP_PREVENTION_CONFIG };
  }
  return { ...presetConfig };
}

/**
 * Serializes configuration to JSON string for storage.
 *
 * @param config - The configuration to serialize
 * @returns JSON string representation of the configuration
 */
export function serializeConfig(config: LoopPreventionConfig): string {
  return JSON.stringify(config, null, 2);
}

/**
 * Creates a tool-specific configuration override.
 *
 * @param toolName - The name of the tool
 * @param overrides - The configuration overrides for the tool
 * @returns A partial LoopPreventionConfig with the tool override
 */
export function createToolOverride(
  toolName: string,
  overrides: Partial<ToolLoopConfig>,
): Partial<LoopPreventionConfig> {
  return {
    toolSpecificConfig: {
      [toolName]: overrides,
    },
  };
}

/**
 * Creates category-level configuration overrides.
 *
 * @param category - The tool category
 * @param overrides - The configuration overrides for the category
 * @returns A partial LoopPreventionConfig with overrides for all tools in the category
 */
export function createCategoryOverride(
  category: ToolCategory,
  overrides: Partial<ToolLoopConfig>,
): Partial<LoopPreventionConfig> {
  const toolsInCategory = Object.entries(TOOL_CATEGORY_MAP)
    .filter(([, cat]) => cat === category)
    .map(([tool]) => tool);

  const toolSpecificConfig: Record<string, ToolLoopConfig> = {};
  for (const tool of toolsInCategory) {
    toolSpecificConfig[tool] = overrides;
  }

  return { toolSpecificConfig };
}

/**
 * Checks if a configuration is using default values.
 *
 * @param config - The configuration to check
 * @returns True if the configuration matches defaults
 */
export function isDefaultConfig(config: LoopPreventionConfig): boolean {
  const defaultKeys = Object.keys(
    DEFAULT_LOOP_PREVENTION_CONFIG,
  ) as (keyof LoopPreventionConfig)[];

  for (const key of defaultKeys) {
    if (key === "toolSpecificConfig") {
      if (Object.keys(config.toolSpecificConfig).length > 0) {
        return false;
      }
      continue;
    }
    if (key === "degradationLevels") {
      if (
        JSON.stringify(config.degradationLevels) !==
        JSON.stringify(DEFAULT_LOOP_PREVENTION_CONFIG.degradationLevels)
      ) {
        return false;
      }
      continue;
    }
    if (config[key] !== DEFAULT_LOOP_PREVENTION_CONFIG[key]) {
      return false;
    }
  }

  return true;
}

/**
 * Gets all available tool categories.
 *
 * @returns Array of all tool categories
 */
export function getAllToolCategories(): ToolCategory[] {
  return [
    "file_operations",
    "shell_commands",
    "search_tools",
    "code_modification",
    "communication",
    "other",
  ];
}

/**
 * Gets all tools in a specific category.
 *
 * @param category - The tool category
 * @returns Array of tool names in the category
 */
export function getToolsInCategory(category: ToolCategory): string[] {
  return Object.entries(TOOL_CATEGORY_MAP)
    .filter(([, cat]) => cat === category)
    .map(([tool]) => tool);
}
