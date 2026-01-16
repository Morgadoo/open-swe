/**
 * Loop Prevention Integration Module
 *
 * Provides a unified interface for using all loop prevention features in graph nodes.
 * This module combines detection, prevention, recovery, checkpoint, task decomposition,
 * and proactive prevention features into simple functions for graph node integration.
 */

import {
  type LoopDetectionState,
  type LoopPreventionConfig,
  DEFAULT_LOOP_PREVENTION_CONFIG,
  DEFAULT_LOOP_DETECTION_STATE,
} from "@openswe/shared/open-swe/loop-prevention/types";

import { createLogger, LogLevel } from "../logger.js";
import { parseLoopPreventionConfig } from "./config-manager.js";
import { detectCycle } from "./cycle-detector.js";
import {
  calculateDegradationLevel,
  getDegradationStrategy,
  isToolAllowed,
  applyDegradation,
  shouldReduceDegradation,
  getDegradationDescription,
} from "./degradation-manager.js";
import {
  shouldEscalate as shouldEscalateToHuman,
  createEscalationRequest,
  type EscalationContext,
  type EscalationRequest,
} from "./escalation-manager.js";
import {
  attemptRecovery,
  getHealthStatus,
  needsPreventiveAction,
  registerBuiltInStrategies,
  type ErrorContext,
  type RecoveryAction,
} from "./self-healing.js";
import {
  recordToolExecution,
  shouldPauseExecution,
  createInitialState,
} from "./history-tracker.js";
import {
  performPreExecutionChecks,
  learnFromAction,
  type PreExecutionContext,
  type ActionResult,
  type LearningContext,
} from "../self-correction/proactive-prevention.js";
import {
  createCheckpoint,
  restoreFromCheckpoint,
  type Checkpoint,
  type CheckpointableState,
  type CheckpointMetadata,
  type RestorationResult,
} from "../state/checkpoint-manager.js";

const logger = createLogger(LogLevel.INFO, "LoopPreventionIntegration");

// ============================================================================
// Types
// ============================================================================

/**
 * Result of pre-tool execution checks.
 */
export interface BeforeExecutionResult {
  /** Whether the tool can proceed with execution */
  canProceed: boolean;
  /** Warnings that don't block execution but should be noted */
  warnings: string[];
  /** Blockers that prevent execution */
  blockers: string[];
  /** Suggestions for improving the action */
  suggestions: string[];
  /** Modified arguments if any adjustments were made */
  modifiedArgs?: Record<string, unknown>;
  /** Delay in milliseconds to apply before execution */
  delayMs?: number;
}

/**
 * Result of a tool execution for tracking purposes.
 */
export interface ToolExecutionResult {
  /** Whether the execution succeeded */
  success: boolean;
  /** Output from the tool if successful */
  output?: string;
  /** Error message if failed */
  error?: string;
  /** Error type/category if failed */
  errorType?: string;
  /** Duration of execution in milliseconds */
  durationMs: number;
}

/**
 * Result of post-tool execution processing.
 */
export interface AfterExecutionResult {
  /** Updated state fields to merge into GraphState */
  updatedState: Partial<GraphState>;
  /** Whether a checkpoint should be created */
  shouldCheckpoint: boolean;
  /** Current health status of the agent */
  healthStatus: "healthy" | "degraded" | "unhealthy";
  /** Recommendations for next steps */
  recommendations: string[];
}

/**
 * Decision about what routing action to take.
 */
export interface RoutingDecision {
  /** Action to take */
  action: "continue" | "retry" | "degrade" | "escalate" | "halt" | "checkpoint";
  /** Reason for the decision */
  reason: string;
  /** Target node to route to if applicable */
  targetNode?: string;
  /** Delay before taking action in milliseconds */
  delayMs?: number;
  /** Additional context for the decision */
  context?: Record<string, unknown>;
}

/**
 * Result of error handling with recovery attempt.
 */
export interface ErrorHandlingResult {
  /** Whether recovery was successful */
  recovered: boolean;
  /** Recovery action that was applied */
  recoveryAction?: RecoveryAction;
  /** Whether the operation should be retried */
  shouldRetry: boolean;
  /** Delay before retry in milliseconds */
  retryDelayMs?: number;
  /** Whether escalation to human is needed */
  escalationNeeded: boolean;
  /** Updated state fields to merge */
  updatedState: Partial<GraphState>;
}

/**
 * Summary of current loop prevention status.
 */
export interface LoopPreventionStatus {
  /** Whether loop prevention is enabled */
  enabled: boolean;
  /** Current degradation level (0-4) */
  degradationLevel: number;
  /** Human-readable name of degradation level */
  degradationLevelName: string;
  /** Number of consecutive errors */
  consecutiveErrors: number;
  /** Recently detected patterns */
  recentPatterns: string[];
  /** Health score (0-100) */
  healthScore: number;
  /** Recommendations for the current state */
  recommendations: string[];
}

/**
 * Minimal GraphState interface for integration.
 * The actual GraphState may have additional fields.
 */
export interface GraphState {
  /** Loop detection state */
  loopDetectionState: LoopDetectionState;
  /** Current task description */
  currentTask?: string;
  /** Current step in the task */
  currentStep?: string;
  /** Files modified during execution */
  modifiedFiles?: string[];
  /** Custom data for extensibility */
  customData?: Record<string, unknown>;
}

/**
 * Graph configuration that may contain loop prevention settings.
 */
export interface GraphConfiguration {
  /** Loop prevention configuration (JSON string or object) */
  loopPreventionConfig?: string | Partial<LoopPreventionConfig>;
  /** Whether loop prevention is enabled */
  loopPreventionEnabled?: boolean;
  /** Preset to use (strict, balanced, permissive, development) */
  loopPreventionPreset?: string;
}

// ============================================================================
// Initialization
// ============================================================================

let initialized = false;

/**
 * Initializes the loop prevention system.
 * Should be called once at startup.
 */
function ensureInitialized(): void {
  if (!initialized) {
    registerBuiltInStrategies();
    initialized = true;
    logger.debug("Loop prevention integration initialized");
  }
}

// ============================================================================
// Core Integration Functions
// ============================================================================

/**
 * Performs pre-execution checks before a tool is executed.
 * Call this before executing any tool to detect potential issues.
 *
 * @param state - Current graph state
 * @param toolName - Name of the tool to execute
 * @param toolArgs - Arguments for the tool
 * @param config - Optional loop prevention configuration
 * @returns Result indicating whether to proceed and any warnings/blockers
 *
 * @example
 * ```typescript
 * const result = beforeToolExecution(state, 'shell', { command: 'ls -la' });
 * if (!result.canProceed) {
 *   // Handle blockers
 *   return { ...state, error: result.blockers.join(', ') };
 * }
 * ```
 */
export function beforeToolExecution(
  state: GraphState,
  toolName: string,
  toolArgs: Record<string, unknown>,
  config?: LoopPreventionConfig,
): BeforeExecutionResult {
  ensureInitialized();

  const effectiveConfig = config ?? DEFAULT_LOOP_PREVENTION_CONFIG;
  const warnings: string[] = [];
  const blockers: string[] = [];
  const suggestions: string[] = [];
  let delayMs: number | undefined;
  let modifiedArgs: Record<string, unknown> | undefined;

  // Skip checks if loop prevention is disabled
  if (!effectiveConfig.enabled) {
    return {
      canProceed: true,
      warnings: [],
      blockers: [],
      suggestions: [],
    };
  }

  const loopState = state.loopDetectionState ?? DEFAULT_LOOP_DETECTION_STATE;

  // 1. Check if tool is allowed at current degradation level
  const toolAllowed = isToolAllowed(
    toolName,
    loopState.degradationLevel,
    effectiveConfig,
  );
  if (!toolAllowed.allowed) {
    blockers.push(toolAllowed.reason);
    if (toolAllowed.alternatives) {
      suggestions.push(
        `Consider using: ${toolAllowed.alternatives.join(", ")}`,
      );
    }
  }

  // 2. Detect potential loops
  const cycleResult = detectCycle(
    toolName,
    toolArgs,
    loopState,
    effectiveConfig,
  );
  if (cycleResult.isLoop) {
    const severity =
      cycleResult.confidence >= 0.9
        ? "high"
        : cycleResult.confidence >= 0.7
          ? "medium"
          : "low";

    if (severity === "high") {
      blockers.push(
        `Loop detected (${cycleResult.loopType}): ${cycleResult.matchedEntries.length} similar actions found`,
      );
    } else {
      warnings.push(
        `Potential loop detected (${cycleResult.loopType}, confidence: ${Math.round(cycleResult.confidence * 100)}%)`,
      );
    }

    if (cycleResult.suggestedAction === "switch-strategy") {
      suggestions.push("Consider trying a different approach");
    } else if (cycleResult.suggestedAction === "clarify") {
      suggestions.push("Request clarification on the task requirements");
    }
  }

  // 3. Perform proactive prevention checks
  const preExecContext: PreExecutionContext = {
    executionHistory: loopState.executionHistory,
    currentTask: state.currentTask,
    recentErrors: loopState.executionHistory
      .filter((e) => e.result === "error")
      .slice(-5)
      .map((e) => e.errorMessage ?? "Unknown error"),
    modifiedFiles: state.modifiedFiles,
  };

  const preExecResult = performPreExecutionChecks(
    toolName,
    toolArgs,
    preExecContext,
  );

  for (const warning of preExecResult.warnings) {
    warnings.push(warning.message);
  }

  for (const blocker of preExecResult.blockers) {
    blockers.push(blocker.message);
    if (blocker.resolution) {
      suggestions.push(blocker.resolution);
    }
  }

  for (const suggestion of preExecResult.suggestions) {
    suggestions.push(suggestion.message);
    if (suggestion.modification) {
      modifiedArgs = { ...toolArgs, ...suggestion.modification };
    }
  }

  // 4. Apply degradation effects
  const degradationEffects = applyDegradation(
    loopState.degradationLevel,
    toolName,
    effectiveConfig,
  );

  if (degradationEffects.blockedReason) {
    blockers.push(degradationEffects.blockedReason);
  }

  if (degradationEffects.warningMessage) {
    warnings.push(degradationEffects.warningMessage);
  }

  if (degradationEffects.delayMs > 0) {
    delayMs = degradationEffects.delayMs;
  }

  // 5. Check if execution should pause
  const pauseRecommendation = shouldPauseExecution(loopState, effectiveConfig);
  if (pauseRecommendation.shouldPause) {
    if (pauseRecommendation.suggestedAction === "halt") {
      blockers.push(pauseRecommendation.reason);
    } else {
      warnings.push(pauseRecommendation.reason);
    }

    if (pauseRecommendation.cooldownMs) {
      delayMs = Math.max(delayMs ?? 0, pauseRecommendation.cooldownMs);
    }
  }

  const canProceed = blockers.length === 0;

  logger.debug("Pre-execution check complete", {
    toolName,
    canProceed,
    warningCount: warnings.length,
    blockerCount: blockers.length,
  });

  return {
    canProceed,
    warnings: [...new Set(warnings)],
    blockers: [...new Set(blockers)],
    suggestions: [...new Set(suggestions)],
    modifiedArgs,
    delayMs,
  };
}

/**
 * Updates state after a tool execution completes.
 * Call this after every tool execution to track history and update metrics.
 *
 * @param state - Current graph state
 * @param toolName - Name of the tool that was executed
 * @param toolArgs - Arguments that were passed to the tool
 * @param result - Result of the tool execution
 * @param config - Optional loop prevention configuration
 * @returns Updated state and recommendations
 *
 * @example
 * ```typescript
 * const result = await executeTool(toolName, toolArgs);
 * const afterResult = afterToolExecution(state, toolName, toolArgs, {
 *   success: result.success,
 *   output: result.output,
 *   durationMs: result.duration
 * });
 * return { ...state, ...afterResult.updatedState };
 * ```
 */
export function afterToolExecution(
  state: GraphState,
  toolName: string,
  toolArgs: Record<string, unknown>,
  result: ToolExecutionResult,
  config?: LoopPreventionConfig,
): AfterExecutionResult {
  ensureInitialized();

  const effectiveConfig = config ?? DEFAULT_LOOP_PREVENTION_CONFIG;
  const recommendations: string[] = [];
  let shouldCheckpoint = false;

  const loopState = state.loopDetectionState ?? DEFAULT_LOOP_DETECTION_STATE;

  // 1. Record the execution in history
  const updatedLoopState = recordToolExecution(
    loopState,
    toolName,
    toolArgs,
    result.success ? "success" : "error",
    result.durationMs,
    result.error,
    result.errorType,
    effectiveConfig,
  );

  // 2. Learn from the action (for proactive prevention)
  const learningContext: LearningContext = {
    taskDescription: state.currentTask,
    attemptNumber:
      loopState.executionHistory.filter((e) => e.toolName === toolName).length +
      1,
  };

  const actionResult: ActionResult = {
    success: result.success,
    error: result.error,
    errorType: result.errorType,
    output: result.output,
    durationMs: result.durationMs,
  };

  learnFromAction(toolName, toolArgs, actionResult, learningContext);

  // 3. Calculate new degradation level
  const degradationResult = calculateDegradationLevel(
    updatedLoopState,
    effectiveConfig,
    loopState.degradationLevel,
  );

  const newDegradationLevel = degradationResult.level as 0 | 1 | 2 | 3;
  recommendations.push(...degradationResult.suggestedActions);

  // 4. Check if degradation should be reduced (recovery)
  let finalDegradationLevel = newDegradationLevel;
  if (
    result.success &&
    shouldReduceDegradation(
      updatedLoopState,
      newDegradationLevel,
      effectiveConfig,
    )
  ) {
    finalDegradationLevel = Math.max(0, newDegradationLevel - 1) as
      | 0
      | 1
      | 2
      | 3;
    recommendations.push(
      "Degradation level reduced due to successful execution",
    );
  }

  // 5. Get health status
  const healthStatus = getHealthStatus(updatedLoopState, effectiveConfig);
  const healthStatusName: "healthy" | "degraded" | "unhealthy" =
    healthStatus.status === "critical"
      ? "unhealthy"
      : healthStatus.status === "unhealthy"
        ? "unhealthy"
        : healthStatus.status === "degraded"
          ? "degraded"
          : "healthy";

  recommendations.push(...healthStatus.recommendations);

  // 6. Check if preventive action is needed
  const preventiveAction = needsPreventiveAction(healthStatus);
  if (preventiveAction) {
    recommendations.push(preventiveAction.reason);
    if (preventiveAction.type === "checkpoint") {
      shouldCheckpoint = true;
    }
  }

  // 7. Determine if checkpoint is needed
  if (!shouldCheckpoint) {
    // Create checkpoint after successful risky operations
    if (result.success && isRiskyOperation(toolName, toolArgs)) {
      shouldCheckpoint = true;
    }
    // Create checkpoint when degradation level increases
    if (finalDegradationLevel > loopState.degradationLevel) {
      shouldCheckpoint = true;
    }
  }

  const updatedState: Partial<GraphState> = {
    loopDetectionState: {
      ...updatedLoopState,
      degradationLevel: finalDegradationLevel,
      lastStrategySwitch:
        finalDegradationLevel !== loopState.degradationLevel
          ? Date.now()
          : updatedLoopState.lastStrategySwitch,
    },
  };

  logger.debug("Post-execution processing complete", {
    toolName,
    success: result.success,
    degradationLevel: finalDegradationLevel,
    healthStatus: healthStatusName,
    shouldCheckpoint,
  });

  return {
    updatedState,
    shouldCheckpoint,
    healthStatus: healthStatusName,
    recommendations: [...new Set(recommendations)],
  };
}

/**
 * Determines the next routing action based on current state.
 * Use this for conditional routing in graph edges.
 *
 * @param state - Current graph state
 * @param config - Optional loop prevention configuration
 * @returns Decision about what action to take next
 *
 * @example
 * ```typescript
 * const decision = determineNextAction(state);
 * switch (decision.action) {
 *   case 'continue': return 'next_node';
 *   case 'escalate': return 'escalation_node';
 *   case 'halt': return END;
 * }
 * ```
 */
export function determineNextAction(
  state: GraphState,
  config?: LoopPreventionConfig,
): RoutingDecision {
  ensureInitialized();

  const effectiveConfig = config ?? DEFAULT_LOOP_PREVENTION_CONFIG;
  const loopState = state.loopDetectionState ?? DEFAULT_LOOP_DETECTION_STATE;

  // Check if loop prevention is disabled
  if (!effectiveConfig.enabled) {
    return {
      action: "continue",
      reason: "Loop prevention is disabled",
    };
  }

  // 1. Check degradation level
  if (loopState.degradationLevel >= 3) {
    return {
      action: "halt",
      reason: "Maximum degradation level reached - human intervention required",
      context: {
        degradationLevel: loopState.degradationLevel,
        consecutiveErrors: loopState.consecutiveErrorCount,
      },
    };
  }

  // 2. Check if escalation is needed
  const escalationDecision = shouldEscalateToHuman(
    loopState,
    loopState.degradationLevel,
    effectiveConfig,
  );

  if (escalationDecision.shouldEscalate) {
    return {
      action: "escalate",
      reason: escalationDecision.reason,
      context: {
        priority: escalationDecision.priority,
        triggers: escalationDecision.triggers,
      },
    };
  }

  // 3. Check health status
  const healthStatus = getHealthStatus(loopState, effectiveConfig);
  if (healthStatus.status === "critical") {
    return {
      action: "halt",
      reason: "Agent health is critical",
      context: {
        healthScore: healthStatus.score,
        issues: healthStatus.issues.map((i) => i.description),
      },
    };
  }

  // 4. Check if checkpoint is recommended
  const preventiveAction = needsPreventiveAction(healthStatus);
  if (preventiveAction?.type === "checkpoint") {
    return {
      action: "checkpoint",
      reason: preventiveAction.reason,
    };
  }

  // 5. Check if slowdown is needed
  if (preventiveAction?.type === "slow_down") {
    const delayMs =
      (preventiveAction.parameters?.delayMs as number | undefined) ?? 1000;
    return {
      action: "continue",
      reason: preventiveAction.reason,
      delayMs,
    };
  }

  // 6. Check for degradation-based routing
  if (loopState.degradationLevel >= 2) {
    return {
      action: "degrade",
      reason: getDegradationDescription(loopState.degradationLevel, loopState),
      context: {
        strategy: getDegradationStrategy(loopState.degradationLevel),
      },
    };
  }

  // 7. Default: continue normally
  return {
    action: "continue",
    reason: "No issues detected",
  };
}

/**
 * Handles an error with automatic recovery attempt.
 * Call this when a tool execution fails to attempt recovery.
 *
 * @param state - Current graph state
 * @param error - The error that occurred
 * @param toolName - Name of the tool that failed
 * @param toolArgs - Arguments that were passed to the tool
 * @param config - Optional loop prevention configuration
 * @returns Result of the recovery attempt
 *
 * @example
 * ```typescript
 * try {
 *   await executeTool(toolName, toolArgs);
 * } catch (error) {
 *   const recovery = handleErrorWithRecovery(state, error, toolName, toolArgs);
 *   if (recovery.shouldRetry) {
 *     await sleep(recovery.retryDelayMs);
 *     // Retry the operation
 *   }
 * }
 * ```
 */
export function handleErrorWithRecovery(
  state: GraphState,
  error: Error,
  toolName: string,
  toolArgs: Record<string, unknown>,
  config?: LoopPreventionConfig,
): ErrorHandlingResult {
  ensureInitialized();

  const effectiveConfig = config ?? DEFAULT_LOOP_PREVENTION_CONFIG;
  const loopState = state.loopDetectionState ?? DEFAULT_LOOP_DETECTION_STATE;

  // Create error context
  const errorContext: ErrorContext = {
    message: error.message,
    type: error.name,
    toolName,
    toolArgs,
    stackTrace: error.stack,
    timestamp: Date.now(),
  };

  // Attempt recovery
  const recoveryResult = attemptRecovery(
    errorContext,
    loopState,
    effectiveConfig,
  );

  // Check if escalation is needed
  const escalationDecision = shouldEscalateToHuman(
    loopState,
    loopState.degradationLevel,
    effectiveConfig,
  );

  // Update state based on recovery result
  const updatedLoopState: LoopDetectionState = {
    ...loopState,
    consecutiveErrorCount: loopState.consecutiveErrorCount + 1,
  };

  // Determine retry delay
  let retryDelayMs: number | undefined;
  if (recoveryResult.shouldRetry && recoveryResult.retryDelayMs) {
    retryDelayMs = recoveryResult.retryDelayMs;
  } else if (recoveryResult.shouldRetry) {
    // Default exponential backoff
    retryDelayMs = Math.min(
      1000 * Math.pow(2, loopState.consecutiveErrorCount),
      30000,
    );
  }

  logger.debug("Error handling complete", {
    toolName,
    recovered: recoveryResult.success,
    shouldRetry: recoveryResult.shouldRetry,
    escalationNeeded: escalationDecision.shouldEscalate,
  });

  return {
    recovered: recoveryResult.success,
    recoveryAction: recoveryResult.action ?? undefined,
    shouldRetry: recoveryResult.shouldRetry,
    retryDelayMs,
    escalationNeeded: escalationDecision.shouldEscalate,
    updatedState: {
      loopDetectionState: updatedLoopState,
    },
  };
}

/**
 * Creates initial loop prevention state for a new session.
 * Call this when starting a new agent session.
 *
 * @param config - Optional loop prevention configuration
 * @returns Fresh loop detection state
 *
 * @example
 * ```typescript
 * const initialState = {
 *   loopDetectionState: initializeLoopPreventionState(),
 *   // ... other state fields
 * };
 * ```
 */
export function initializeLoopPreventionState(
  _config?: LoopPreventionConfig,
): LoopDetectionState {
  ensureInitialized();

  // Config parameter reserved for future customization of initial state
  return createInitialState();
}

/**
 * Gets a summary of the current loop prevention status.
 * Useful for debugging and monitoring.
 *
 * @param state - Current graph state
 * @returns Summary of loop prevention status
 *
 * @example
 * ```typescript
 * const status = getLoopPreventionStatus(state);
 * console.log(`Health: ${status.healthScore}%, Level: ${status.degradationLevelName}`);
 * ```
 */
export function getLoopPreventionStatus(
  state: GraphState,
): LoopPreventionStatus {
  ensureInitialized();

  const loopState = state.loopDetectionState ?? DEFAULT_LOOP_DETECTION_STATE;
  const config = DEFAULT_LOOP_PREVENTION_CONFIG;

  // Get health status
  const healthStatus = getHealthStatus(loopState, config);

  // Get degradation level name
  const levelNames = ["Normal", "Warning", "Restricted", "Minimal", "Halted"];
  const degradationLevelName =
    levelNames[loopState.degradationLevel] ?? "Unknown";

  // Get recent patterns
  const recentPatterns: string[] = [];
  const recentHistory = loopState.executionHistory.slice(-20);
  const toolCounts: Record<string, number> = {};

  for (const entry of recentHistory) {
    toolCounts[entry.toolName] = (toolCounts[entry.toolName] ?? 0) + 1;
  }

  for (const [tool, count] of Object.entries(toolCounts)) {
    if (count >= 3) {
      recentPatterns.push(`${tool} called ${count} times`);
    }
  }

  return {
    enabled: config.enabled,
    degradationLevel: loopState.degradationLevel,
    degradationLevelName,
    consecutiveErrors: loopState.consecutiveErrorCount,
    recentPatterns,
    healthScore: healthStatus.score,
    recommendations: healthStatus.recommendations,
  };
}

/**
 * Parses loop prevention configuration from GraphConfiguration.
 * Handles various input formats and applies defaults.
 *
 * @param graphConfig - Graph configuration object
 * @returns Parsed and validated loop prevention configuration
 *
 * @example
 * ```typescript
 * const config = parseGraphConfig(graphConfiguration);
 * const result = beforeToolExecution(state, toolName, toolArgs, config);
 * ```
 */
export function parseGraphConfig(
  graphConfig: GraphConfiguration,
): LoopPreventionConfig {
  // Check if loop prevention is explicitly disabled
  if (graphConfig.loopPreventionEnabled === false) {
    return {
      ...DEFAULT_LOOP_PREVENTION_CONFIG,
      enabled: false,
    };
  }

  // Parse the configuration
  const parsedConfig = parseLoopPreventionConfig(
    graphConfig.loopPreventionConfig,
  );

  return parsedConfig;
}

// ============================================================================
// Checkpoint Integration
// ============================================================================

/**
 * Creates a checkpoint of the current state.
 * Use this before risky operations or at milestones.
 *
 * @param state - Current graph state
 * @param reason - Reason for creating the checkpoint
 * @param description - Human-readable description
 * @returns Created checkpoint
 *
 * @example
 * ```typescript
 * const checkpoint = createStateCheckpoint(state, 'before_risky_action', 'Before file deletion');
 * // ... perform risky operation
 * // If needed: restoreFromStateCheckpoint(checkpoint, currentState);
 * ```
 */
export function createStateCheckpoint(
  state: GraphState,
  reason: CheckpointMetadata["reason"],
  description: string,
): Checkpoint {
  const checkpointableState: CheckpointableState = {
    loopDetectionState:
      state.loopDetectionState ?? DEFAULT_LOOP_DETECTION_STATE,
    currentTask: state.currentTask,
    currentStep: state.currentStep,
    modifiedFiles: state.modifiedFiles,
    customData: state.customData,
  };

  const metadata: CheckpointMetadata = {
    reason,
    description,
    priority: reason === "milestone" ? "high" : "normal",
  };

  return createCheckpoint(checkpointableState, metadata);
}

/**
 * Restores state from a checkpoint.
 *
 * @param checkpoint - Checkpoint to restore from
 * @param currentState - Current state for comparison
 * @returns Restoration result with restored state
 *
 * @example
 * ```typescript
 * const result = restoreFromStateCheckpoint(checkpoint, currentState);
 * if (result.success && result.restoredState) {
 *   return { ...state, ...result.restoredState };
 * }
 * ```
 */
export function restoreFromStateCheckpoint(
  checkpoint: Checkpoint,
  currentState: GraphState,
): RestorationResult {
  const checkpointableState: CheckpointableState = {
    loopDetectionState:
      currentState.loopDetectionState ?? DEFAULT_LOOP_DETECTION_STATE,
    currentTask: currentState.currentTask,
    currentStep: currentState.currentStep,
    modifiedFiles: currentState.modifiedFiles,
    customData: currentState.customData,
  };

  return restoreFromCheckpoint(checkpoint, checkpointableState);
}

// ============================================================================
// Escalation Integration
// ============================================================================

/**
 * Creates an escalation request for human intervention.
 *
 * @param state - Current graph state
 * @param reason - Reason for escalation
 * @returns Escalation request to send to human
 *
 * @example
 * ```typescript
 * const decision = determineNextAction(state);
 * if (decision.action === 'escalate') {
 *   const request = createHumanEscalation(state, decision.reason);
 *   await notifyHuman(request);
 * }
 * ```
 */
export function createHumanEscalation(
  state: GraphState,
  _reason: string,
): EscalationRequest {
  const loopState = state.loopDetectionState ?? DEFAULT_LOOP_DETECTION_STATE;

  const context: EscalationContext = {
    taskDescription: state.currentTask ?? "Unknown task",
    currentStep: state.currentStep ?? "Unknown step",
    attemptedActions: loopState.executionHistory
      .slice(-10)
      .map(
        (e) => `${e.toolName}: ${JSON.stringify(e.toolArgs).slice(0, 50)}...`,
      ),
    errorMessages: loopState.executionHistory
      .filter((e) => e.result === "error")
      .slice(-5)
      .map((e) => e.errorMessage ?? "Unknown error"),
    filesModified: state.modifiedFiles ?? [],
    timeElapsedMs:
      loopState.executionHistory.length > 0
        ? Date.now() - loopState.executionHistory[0].timestamp
        : 0,
  };

  // Determine priority based on degradation level
  const priority =
    loopState.degradationLevel >= 3
      ? "critical"
      : loopState.degradationLevel >= 2
        ? "high"
        : "medium";

  return createEscalationRequest(loopState, context, priority);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Checks if an operation is considered risky.
 */
function isRiskyOperation(
  toolName: string,
  toolArgs: Record<string, unknown>,
): boolean {
  const riskyTools = ["shell", "write_file", "edit_file", "apply_patch"];

  if (!riskyTools.includes(toolName)) {
    return false;
  }

  if (toolName === "shell") {
    const command = String(toolArgs.command ?? "");
    const riskyCommands = [
      "rm",
      "mv",
      "git push",
      "git reset",
      "chmod",
      "chown",
    ];
    return riskyCommands.some((c) => command.includes(c));
  }

  return true;
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

export {
  type LoopDetectionState,
  type LoopPreventionConfig,
  type ExecutionHistoryEntry,
  DEFAULT_LOOP_PREVENTION_CONFIG,
  DEFAULT_LOOP_DETECTION_STATE,
} from "@openswe/shared/open-swe/loop-prevention/types";

export {
  type RecoveryAction,
  type HealthStatus,
  type PreventiveAction,
} from "./self-healing.js";

export {
  type EscalationRequest,
  type EscalationContext,
} from "./escalation-manager.js";

export {
  type Checkpoint,
  type CheckpointableState,
  type CheckpointMetadata,
  type RestorationResult,
} from "../state/checkpoint-manager.js";

export {
  type PreExecutionResult,
  type RiskAssessment,
} from "../self-correction/proactive-prevention.js";
