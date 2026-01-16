/**
 * Loop Prevention Types
 *
 * Re-exports shared types and provides additional app-specific types
 * for the loop detection and prevention system.
 */

// Re-export all shared types from the shared package
export {
  type ExecutionHistoryEntry,
  type LoopDetectionState,
  type CycleDetectionResult,
  type ToolLoopConfig,
  type DegradationLevelConfig,
  type LoopPreventionConfig,
  DEFAULT_LOOP_PREVENTION_CONFIG,
  DEFAULT_LOOP_DETECTION_STATE,
} from "@openswe/shared/open-swe/loop-prevention/types";

/** Result of a loop detection check */
export interface LoopDetectionResult {
  /** Whether a loop was detected */
  loopDetected: boolean;
  /** Detected patterns if any */
  patterns: LoopPattern[];
  /** Recommended action */
  recommendedAction: "continue" | "warn" | "degrade" | "escalate" | "halt";
  /** Reason for the recommendation */
  reason: string;
  /** Suggested alternative approaches if loop detected */
  suggestions?: string[];
}

/** Represents a detected loop pattern */
export interface LoopPattern {
  /** Type of pattern detected */
  type: "exact_repeat" | "similar_args" | "error_cycle" | "oscillation";
  /** Tool(s) involved in the pattern */
  toolNames: string[];
  /** Number of occurrences */
  occurrences: number;
  /** Confidence score (0-1) */
  confidence: number;
  /** First detected timestamp */
  firstDetected: number;
  /** Description of the pattern */
  description: string;
}

/** Degradation levels and their meanings */
export enum DegradationLevel {
  /** Normal operation */
  NORMAL = 0,
  /** Warning state - increased monitoring */
  WARNING = 1,
  /** Restricted - some tools limited */
  RESTRICTED = 2,
  /** Minimal - only safe operations allowed */
  MINIMAL = 3,
  /** Halted - requires human intervention */
  HALTED = 4,
}

/** Configuration for loop detection thresholds (legacy compatibility) */
export interface LoopDetectionConfig {
  /** Maximum number of identical tool calls before triggering loop detection */
  maxIdenticalCalls: number;
  /** Maximum number of similar tool calls (by args hash) before triggering */
  maxSimilarCalls: number;
  /** Time window in milliseconds for counting repeated calls */
  timeWindowMs: number;
  /** Similarity threshold (0-1) for considering calls as similar */
  similarityThreshold: number;
  /** Maximum consecutive errors before escalation */
  maxConsecutiveErrors: number;
  /** Per-tool override configurations */
  toolOverrides?: Record<string, Partial<LoopDetectionConfig>>;
}

/** Default configuration values (legacy compatibility) */
export const DEFAULT_LOOP_DETECTION_CONFIG: LoopDetectionConfig = {
  maxIdenticalCalls: 3,
  maxSimilarCalls: 5,
  timeWindowMs: 60000, // 1 minute
  similarityThreshold: 0.85,
  maxConsecutiveErrors: 3,
};

/**
 * Result of basic cycle detection checks.
 * Used by the detectExactRepeatCycle and detectErrorCycle functions.
 */
export interface BasicCycleDetectionResult {
  /** Whether a cycle was detected */
  detected: boolean;
  /** Type of cycle detected */
  type: "exact_repeat" | "error_cycle" | "none";
  /** Number of occurrences that triggered detection */
  count: number;
  /** Threshold that was exceeded */
  threshold: number;
  /** Tool name involved in the cycle */
  toolName?: string;
  /** Human-readable description of the detected cycle */
  description: string;
}
