/**
 * Loop Prevention Types
 *
 * Types and interfaces for the loop detection and prevention system.
 * These types track execution history, detect repetitive patterns,
 * and manage graceful degradation when loops are detected.
 */

/**
 * Tracks each tool execution for loop detection analysis.
 */
export interface ExecutionHistoryEntry {
  /** Unique identifier for this execution */
  id: string;
  /** Timestamp of when the action was executed */
  timestamp: number;
  /** Name of the tool that was called */
  toolName: string;
  /** Arguments passed to the tool (serialized) */
  toolArgs: Record<string, unknown>;
  /** Hash of the tool arguments for quick comparison */
  argsHash: string;
  /** Result of the tool execution (success/error) */
  result: "success" | "error";
  /** Error type/category if result is 'error' */
  errorType?: string;
  /** Error message if result is 'error' */
  errorMessage?: string;
  /** Duration of the execution in milliseconds */
  durationMs: number;
}

/**
 * Tracks loop detection metrics and state.
 */
export interface LoopDetectionState {
  executionHistory: ExecutionHistoryEntry[];
  consecutiveErrorCount: number;
  toolSpecificErrorCounts: Record<string, number>;
  similarActionCount: number;
  lastStrategySwitch: number;
  degradationLevel: 0 | 1 | 2 | 3 | 4;
}

/**
 * Result of cycle analysis.
 */
export interface CycleDetectionResult {
  isLoop: boolean;
  loopType: "exact" | "semantic" | "pattern" | null;
  confidence: number;
  suggestedAction: "continue" | "switch-strategy" | "clarify" | "escalate";
  matchedEntries: ExecutionHistoryEntry[];
}

/**
 * Tool-specific loop configuration.
 */
export interface ToolLoopConfig {
  exactMatchThreshold?: number;
  semanticMatchThreshold?: number;
  allowedConsecutiveErrors?: number;
  customDegradationStrategy?: string;
}

/**
 * Configuration for a degradation level.
 */
export interface DegradationLevelConfig {
  level: number;
  triggerCondition: string;
  action: "switch-strategy" | "request-clarification" | "escalate" | "abort";
  cooldownMs: number;
}

/**
 * Configurable thresholds for loop prevention.
 */
export interface LoopPreventionConfig {
  enabled: boolean;
  exactMatchThreshold: number;
  exactMatchLookbackWindow: number;
  semanticSimilarityEnabled: boolean;
  semanticSimilarityThreshold: number;
  semanticMatchThreshold: number;
  patternDetectionEnabled: boolean;
  minPatternLength: number;
  maxPatternLength: number;
  patternRepetitionThreshold: number;
  toolSpecificConfig: Record<string, ToolLoopConfig>;
  degradationLevels: DegradationLevelConfig[];
  autoEscalationEnabled: boolean;
  escalationCooldownMs: number;
}

/**
 * Default configuration for loop prevention.
 */
export const DEFAULT_LOOP_PREVENTION_CONFIG: LoopPreventionConfig = {
  enabled: true,
  exactMatchThreshold: 3,
  exactMatchLookbackWindow: 50,
  semanticSimilarityEnabled: true,
  semanticSimilarityThreshold: 0.85,
  semanticMatchThreshold: 5,
  patternDetectionEnabled: true,
  minPatternLength: 2,
  maxPatternLength: 5,
  patternRepetitionThreshold: 2,
  toolSpecificConfig: {},
  degradationLevels: [
    {
      level: 1,
      triggerCondition: "exactMatch >= 3",
      action: "switch-strategy",
      cooldownMs: 60000,
    },
    {
      level: 2,
      triggerCondition: "strategySwitch >= 2",
      action: "request-clarification",
      cooldownMs: 120000,
    },
    {
      level: 3,
      triggerCondition: "clarificationFailed",
      action: "escalate",
      cooldownMs: 300000,
    },
  ],
  autoEscalationEnabled: true,
  escalationCooldownMs: 300000,
};

/**
 * Default loop detection state.
 */
export const DEFAULT_LOOP_DETECTION_STATE: LoopDetectionState = {
  executionHistory: [],
  consecutiveErrorCount: 0,
  toolSpecificErrorCounts: {},
  similarActionCount: 0,
  lastStrategySwitch: 0,
  degradationLevel: 0,
};
