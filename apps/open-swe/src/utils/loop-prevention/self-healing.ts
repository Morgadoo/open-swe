/**
 * Self-Healing Module for Loop Prevention
 *
 * Implements automatic recovery strategies for common error patterns.
 * Provides health monitoring, recovery attempt tracking, and preventive actions.
 */

import {
  type LoopDetectionState,
  type LoopPreventionConfig,
} from "@openswe/shared/open-swe/loop-prevention/types";

/**
 * Pattern matching type for error detection.
 */
export interface ErrorPattern {
  /** Type of pattern matching to use */
  type: "exact" | "contains" | "regex";
  /** Value to match against */
  value: string;
  /** Optional error type to match */
  errorType?: string;
  /** Optional tool name to match */
  toolName?: string;
}

/**
 * Action to take for recovery.
 */
export type RecoveryAction =
  | { type: "retry"; delayMs: number }
  | { type: "retry_with_modification"; modifications: Record<string, unknown> }
  | { type: "skip"; reason: string }
  | {
      type: "alternative_tool";
      toolName: string;
      argsMapping: Record<string, string>;
    }
  | { type: "clear_state"; fields: string[] }
  | { type: "reset_context"; preserveFields: string[] };

/**
 * A recovery strategy for handling specific error patterns.
 */
export interface RecoveryStrategy {
  /** Unique identifier for this strategy */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of what this strategy does */
  description: string;
  /** Error patterns this strategy handles */
  errorPatterns: ErrorPattern[];
  /** Priority (higher = tried first) */
  priority: number;
  /** Maximum number of recovery attempts */
  maxAttempts: number;
  /** Cooldown between attempts (ms) */
  cooldownMs: number;
  /** Action to take for recovery */
  action: RecoveryAction;
}

/**
 * Context information about an error.
 */
export interface ErrorContext {
  /** Error message */
  message: string;
  /** Error type/category */
  type?: string;
  /** Tool that caused the error */
  toolName?: string;
  /** Arguments passed to the tool */
  toolArgs?: Record<string, unknown>;
  /** Stack trace if available */
  stackTrace?: string;
  /** Timestamp when the error occurred */
  timestamp: number;
}

/**
 * Result of a recovery attempt.
 */
export interface RecoveryResult {
  /** Whether recovery was successful */
  success: boolean;
  /** ID of the strategy that was used */
  strategyUsed: string | null;
  /** Action that was applied */
  action: RecoveryAction | null;
  /** Human-readable message about the result */
  message: string;
  /** Whether the operation should be retried */
  shouldRetry: boolean;
  /** Delay before retry (if applicable) */
  retryDelayMs?: number;
}

/**
 * Metrics tracking agent health over time.
 */
export interface HealthMetrics {
  /** Total number of actions executed */
  totalActions: number;
  /** Number of successful actions */
  successfulActions: number;
  /** Number of failed actions */
  failedActions: number;
  /** Average duration of actions (ms) */
  averageDurationMs: number;
  /** Success rate over recent window */
  recentSuccessRate: number;
  /** Recent error messages */
  recentErrors: string[];
  /** Timestamp of last successful action */
  lastSuccessTimestamp: number;
  /** Timestamp of last error */
  lastErrorTimestamp: number;
  /** Number of recovery attempts made */
  recoveryAttempts: number;
  /** Number of successful recoveries */
  successfulRecoveries: number;
}

/**
 * An issue affecting agent health.
 */
export interface HealthIssue {
  /** Type of issue */
  type:
    | "high_error_rate"
    | "slow_performance"
    | "repeated_failures"
    | "recovery_exhausted";
  /** Severity of the issue */
  severity: "low" | "medium" | "high" | "critical";
  /** Description of the issue */
  description: string;
  /** Timestamp when the issue was first detected */
  since: number;
}

/**
 * Overall health status of the agent.
 */
export interface HealthStatus {
  /** Current health status */
  status: "healthy" | "degraded" | "unhealthy" | "critical";
  /** Health score (0-100) */
  score: number;
  /** Current health metrics */
  metrics: HealthMetrics;
  /** Active health issues */
  issues: HealthIssue[];
  /** Recommendations for improvement */
  recommendations: string[];
}

/**
 * Preventive action to take based on health status.
 */
export interface PreventiveAction {
  /** Type of preventive action */
  type: "slow_down" | "reduce_complexity" | "request_review" | "checkpoint";
  /** Reason for the action */
  reason: string;
  /** Additional parameters for the action */
  parameters?: Record<string, unknown>;
}

/**
 * Tracks recovery attempts for a specific error pattern.
 */
interface RecoveryAttemptTracker {
  strategyId: string;
  attempts: number;
  lastAttemptTimestamp: number;
  successCount: number;
  failureCount: number;
}

/**
 * Registry of recovery strategies.
 */
const strategyRegistry: Map<string, RecoveryStrategy> = new Map();

/**
 * Tracks recovery attempts per error pattern.
 */
const recoveryAttempts: Map<string, RecoveryAttemptTracker> = new Map();

/**
 * Registers a recovery strategy for an error pattern.
 *
 * @param strategy - The recovery strategy to register
 */
export function registerRecoveryStrategy(strategy: RecoveryStrategy): void {
  strategyRegistry.set(strategy.id, strategy);
}

/**
 * Unregisters a recovery strategy.
 *
 * @param strategyId - ID of the strategy to unregister
 * @returns True if the strategy was found and removed
 */
export function unregisterRecoveryStrategy(strategyId: string): boolean {
  return strategyRegistry.delete(strategyId);
}

/**
 * Gets all registered recovery strategies.
 *
 * @returns Array of all registered strategies
 */
export function getAllRecoveryStrategies(): RecoveryStrategy[] {
  return Array.from(strategyRegistry.values());
}

/**
 * Clears all registered recovery strategies.
 */
export function clearRecoveryStrategies(): void {
  strategyRegistry.clear();
  recoveryAttempts.clear();
}

/**
 * Checks if an error pattern matches an error context.
 */
function matchesPattern(pattern: ErrorPattern, error: ErrorContext): boolean {
  if (pattern.errorType && error.type !== pattern.errorType) {
    return false;
  }

  if (pattern.toolName && error.toolName !== pattern.toolName) {
    return false;
  }

  const message = error.message.toLowerCase();
  const patternValue = pattern.value.toLowerCase();

  switch (pattern.type) {
    case "exact":
      return message === patternValue;
    case "contains":
      return message.includes(patternValue);
    case "regex":
      try {
        const regex = new RegExp(pattern.value, "i");
        return regex.test(error.message);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

/**
 * Gets applicable recovery strategies for an error.
 *
 * @param error - The error context to find strategies for
 * @returns Array of applicable strategies, sorted by priority
 */
export function getRecoveryStrategies(error: ErrorContext): RecoveryStrategy[] {
  const applicable: RecoveryStrategy[] = [];

  for (const strategy of strategyRegistry.values()) {
    const matches = strategy.errorPatterns.some((pattern) =>
      matchesPattern(pattern, error),
    );
    if (matches) {
      applicable.push(strategy);
    }
  }

  return applicable.sort((a, b) => b.priority - a.priority);
}

/**
 * Generates a key for tracking recovery attempts.
 */
function getAttemptKey(error: ErrorContext, strategyId: string): string {
  const errorKey = `${error.toolName || "unknown"}_${error.type || "error"}`;
  return `${errorKey}_${strategyId}`;
}

/**
 * Gets the recovery attempt tracker for an error/strategy combination.
 */
function getAttemptTracker(
  error: ErrorContext,
  strategyId: string,
): RecoveryAttemptTracker {
  const key = getAttemptKey(error, strategyId);
  let tracker = recoveryAttempts.get(key);

  if (!tracker) {
    tracker = {
      strategyId,
      attempts: 0,
      lastAttemptTimestamp: 0,
      successCount: 0,
      failureCount: 0,
    };
    recoveryAttempts.set(key, tracker);
  }

  return tracker;
}

/**
 * Checks if an error is recoverable.
 *
 * @param error - The error context to check
 * @param attemptCount - Number of recovery attempts already made
 * @returns True if the error can be recovered from
 */
export function isRecoverable(
  error: ErrorContext,
  attemptCount: number,
): boolean {
  const strategies = getRecoveryStrategies(error);

  if (strategies.length === 0) {
    return false;
  }

  for (const strategy of strategies) {
    const tracker = getAttemptTracker(error, strategy.id);

    if (tracker.attempts < strategy.maxAttempts) {
      const timeSinceLastAttempt = Date.now() - tracker.lastAttemptTimestamp;
      if (
        tracker.lastAttemptTimestamp === 0 ||
        timeSinceLastAttempt >= strategy.cooldownMs
      ) {
        return true;
      }
    }
  }

  return attemptCount < 3;
}

/**
 * Attempts automatic recovery for an error.
 *
 * @param error - The error context to recover from
 * @param _state - Current loop detection state
 * @param _config - Loop prevention configuration
 * @returns Result of the recovery attempt
 */
export function attemptRecovery(
  error: ErrorContext,
  _state: LoopDetectionState,
  _config: LoopPreventionConfig,
): RecoveryResult {
  const strategies = getRecoveryStrategies(error);

  if (strategies.length === 0) {
    return {
      success: false,
      strategyUsed: null,
      action: null,
      message: "No recovery strategies available for this error",
      shouldRetry: false,
    };
  }

  for (const strategy of strategies) {
    const tracker = getAttemptTracker(error, strategy.id);

    if (tracker.attempts >= strategy.maxAttempts) {
      continue;
    }

    const timeSinceLastAttempt = Date.now() - tracker.lastAttemptTimestamp;
    if (
      tracker.lastAttemptTimestamp > 0 &&
      timeSinceLastAttempt < strategy.cooldownMs
    ) {
      continue;
    }

    tracker.attempts++;
    tracker.lastAttemptTimestamp = Date.now();

    const result = applyRecoveryAction(strategy, error);

    if (result.success) {
      tracker.successCount++;
    } else {
      tracker.failureCount++;
    }

    return result;
  }

  return {
    success: false,
    strategyUsed: null,
    action: null,
    message: "All recovery strategies exhausted or on cooldown",
    shouldRetry: false,
  };
}

/**
 * Applies a recovery action and returns the result.
 */
function applyRecoveryAction(
  strategy: RecoveryStrategy,
  _error: ErrorContext,
): RecoveryResult {
  const action = strategy.action;

  switch (action.type) {
    case "retry":
      return {
        success: true,
        strategyUsed: strategy.id,
        action,
        message: `Retrying after ${action.delayMs}ms delay`,
        shouldRetry: true,
        retryDelayMs: action.delayMs,
      };

    case "retry_with_modification":
      return {
        success: true,
        strategyUsed: strategy.id,
        action,
        message: `Retrying with modifications: ${JSON.stringify(action.modifications)}`,
        shouldRetry: true,
        retryDelayMs: 0,
      };

    case "skip":
      return {
        success: true,
        strategyUsed: strategy.id,
        action,
        message: `Skipping operation: ${action.reason}`,
        shouldRetry: false,
      };

    case "alternative_tool":
      return {
        success: true,
        strategyUsed: strategy.id,
        action,
        message: `Using alternative tool: ${action.toolName}`,
        shouldRetry: true,
        retryDelayMs: 0,
      };

    case "clear_state":
      return {
        success: true,
        strategyUsed: strategy.id,
        action,
        message: `Clearing state fields: ${action.fields.join(", ")}`,
        shouldRetry: true,
        retryDelayMs: 0,
      };

    case "reset_context":
      return {
        success: true,
        strategyUsed: strategy.id,
        action,
        message: `Resetting context, preserving: ${action.preserveFields.join(", ")}`,
        shouldRetry: true,
        retryDelayMs: 0,
      };

    default:
      return {
        success: false,
        strategyUsed: strategy.id,
        action: null,
        message: "Unknown recovery action type",
        shouldRetry: false,
      };
  }
}

/**
 * Creates initial health metrics.
 *
 * @returns Fresh health metrics object
 */
export function createInitialHealthMetrics(): HealthMetrics {
  return {
    totalActions: 0,
    successfulActions: 0,
    failedActions: 0,
    averageDurationMs: 0,
    recentSuccessRate: 1.0,
    recentErrors: [],
    lastSuccessTimestamp: 0,
    lastErrorTimestamp: 0,
    recoveryAttempts: 0,
    successfulRecoveries: 0,
  };
}

/**
 * Updates health metrics after an action.
 *
 * @param metrics - Current health metrics
 * @param result - Result of the action ('success' or 'error')
 * @param durationMs - Duration of the action in milliseconds
 * @returns Updated health metrics
 */
export function updateHealthMetrics(
  metrics: HealthMetrics,
  result: "success" | "error",
  durationMs: number,
): HealthMetrics {
  const updated = { ...metrics };

  updated.totalActions++;

  if (result === "success") {
    updated.successfulActions++;
    updated.lastSuccessTimestamp = Date.now();
  } else {
    updated.failedActions++;
    updated.lastErrorTimestamp = Date.now();
  }

  const totalDuration = metrics.averageDurationMs * (metrics.totalActions - 1);
  updated.averageDurationMs =
    (totalDuration + durationMs) / updated.totalActions;

  const recentWindow = 10;
  const recentTotal = Math.min(updated.totalActions, recentWindow);
  const recentSuccesses = Math.min(updated.successfulActions, recentTotal);
  updated.recentSuccessRate =
    recentTotal > 0 ? recentSuccesses / recentTotal : 1.0;

  return updated;
}

/**
 * Adds an error to the health metrics.
 *
 * @param metrics - Current health metrics
 * @param errorMessage - Error message to add
 * @returns Updated health metrics
 */
export function addErrorToMetrics(
  metrics: HealthMetrics,
  errorMessage: string,
): HealthMetrics {
  const updated = { ...metrics };
  const maxRecentErrors = 10;

  updated.recentErrors = [...metrics.recentErrors, errorMessage].slice(
    -maxRecentErrors,
  );

  return updated;
}

/**
 * Records a recovery attempt in the metrics.
 *
 * @param metrics - Current health metrics
 * @param successful - Whether the recovery was successful
 * @returns Updated health metrics
 */
export function recordRecoveryAttempt(
  metrics: HealthMetrics,
  successful: boolean,
): HealthMetrics {
  const updated = { ...metrics };

  updated.recoveryAttempts++;
  if (successful) {
    updated.successfulRecoveries++;
  }

  return updated;
}

/**
 * Calculates the health score based on metrics.
 */
function calculateHealthScore(metrics: HealthMetrics): number {
  if (metrics.totalActions === 0) {
    return 100;
  }

  let score = 100;

  const successRate =
    metrics.totalActions > 0
      ? metrics.successfulActions / metrics.totalActions
      : 1;
  score -= (1 - successRate) * 40;

  score -= (1 - metrics.recentSuccessRate) * 30;

  const timeSinceSuccess = Date.now() - metrics.lastSuccessTimestamp;
  if (metrics.lastSuccessTimestamp > 0 && timeSinceSuccess > 300000) {
    score -= Math.min((timeSinceSuccess - 300000) / 60000, 20);
  }

  if (metrics.recoveryAttempts > 0) {
    const recoveryRate =
      metrics.successfulRecoveries / metrics.recoveryAttempts;
    score -= (1 - recoveryRate) * 10;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Determines the health status from a score.
 */
function scoreToStatus(
  score: number,
): "healthy" | "degraded" | "unhealthy" | "critical" {
  if (score >= 80) return "healthy";
  if (score >= 60) return "degraded";
  if (score >= 40) return "unhealthy";
  return "critical";
}

/**
 * Detects health issues from metrics.
 */
function detectHealthIssues(metrics: HealthMetrics): HealthIssue[] {
  const issues: HealthIssue[] = [];
  const now = Date.now();

  if (metrics.recentSuccessRate < 0.5) {
    const severity =
      metrics.recentSuccessRate < 0.2
        ? "critical"
        : metrics.recentSuccessRate < 0.3
          ? "high"
          : "medium";
    issues.push({
      type: "high_error_rate",
      severity,
      description: `Recent success rate is ${Math.round(metrics.recentSuccessRate * 100)}%`,
      since: metrics.lastErrorTimestamp || now,
    });
  }

  if (metrics.averageDurationMs > 10000) {
    const severity =
      metrics.averageDurationMs > 30000
        ? "high"
        : metrics.averageDurationMs > 20000
          ? "medium"
          : "low";
    issues.push({
      type: "slow_performance",
      severity,
      description: `Average action duration is ${Math.round(metrics.averageDurationMs / 1000)}s`,
      since: now,
    });
  }

  const uniqueErrors = new Set(metrics.recentErrors);
  if (
    uniqueErrors.size < metrics.recentErrors.length / 2 &&
    metrics.recentErrors.length >= 4
  ) {
    issues.push({
      type: "repeated_failures",
      severity: "high",
      description: "Same errors are occurring repeatedly",
      since: metrics.lastErrorTimestamp || now,
    });
  }

  if (
    metrics.recoveryAttempts > 5 &&
    metrics.successfulRecoveries / metrics.recoveryAttempts < 0.3
  ) {
    issues.push({
      type: "recovery_exhausted",
      severity: "critical",
      description: "Recovery attempts are mostly failing",
      since: now,
    });
  }

  return issues;
}

/**
 * Generates recommendations based on health issues.
 */
function generateRecommendations(issues: HealthIssue[]): string[] {
  const recommendations: string[] = [];

  for (const issue of issues) {
    switch (issue.type) {
      case "high_error_rate":
        recommendations.push("Review recent errors for common patterns");
        recommendations.push("Consider simplifying the current approach");
        break;
      case "slow_performance":
        recommendations.push("Check for network or resource bottlenecks");
        recommendations.push("Consider breaking operations into smaller steps");
        break;
      case "repeated_failures":
        recommendations.push("Investigate the root cause of repeated errors");
        recommendations.push("Try an alternative approach");
        break;
      case "recovery_exhausted":
        recommendations.push("Request human assistance");
        recommendations.push("Consider aborting the current task");
        break;
    }
  }

  return [...new Set(recommendations)];
}

/**
 * Gets the current health status of the agent.
 *
 * @param state - Current loop detection state
 * @param _config - Loop prevention configuration
 * @returns Current health status
 */
export function getHealthStatus(
  state: LoopDetectionState,
  _config: LoopPreventionConfig,
): HealthStatus {
  const metrics = buildMetricsFromState(state);
  const score = calculateHealthScore(metrics);
  const status = scoreToStatus(score);
  const issues = detectHealthIssues(metrics);
  const recommendations = generateRecommendations(issues);

  return {
    status,
    score,
    metrics,
    issues,
    recommendations,
  };
}

/**
 * Builds health metrics from loop detection state.
 */
function buildMetricsFromState(state: LoopDetectionState): HealthMetrics {
  const history = state.executionHistory;
  const metrics = createInitialHealthMetrics();

  if (history.length === 0) {
    return metrics;
  }

  metrics.totalActions = history.length;
  metrics.successfulActions = history.filter(
    (e) => e.result === "success",
  ).length;
  metrics.failedActions = history.filter((e) => e.result === "error").length;

  const totalDuration = history.reduce((sum, e) => sum + e.durationMs, 0);
  metrics.averageDurationMs = totalDuration / history.length;

  const recentWindow = Math.min(10, history.length);
  const recentHistory = history.slice(-recentWindow);
  const recentSuccesses = recentHistory.filter(
    (e) => e.result === "success",
  ).length;
  metrics.recentSuccessRate = recentSuccesses / recentWindow;

  const errorEntries = history.filter((e) => e.result === "error").slice(-10);
  metrics.recentErrors = errorEntries.map(
    (e) => e.errorMessage || "Unknown error",
  );

  const lastSuccess = history.filter((e) => e.result === "success").pop();
  if (lastSuccess) {
    metrics.lastSuccessTimestamp = lastSuccess.timestamp;
  }

  const lastError = history.filter((e) => e.result === "error").pop();
  if (lastError) {
    metrics.lastErrorTimestamp = lastError.timestamp;
  }

  return metrics;
}

/**
 * Determines if preventive action is needed based on health status.
 *
 * @param health - Current health status
 * @returns Preventive action to take, or null if none needed
 */
export function needsPreventiveAction(
  health: HealthStatus,
): PreventiveAction | null {
  if (health.status === "healthy") {
    return null;
  }

  if (health.status === "critical") {
    return {
      type: "request_review",
      reason: "Agent health is critical, human review recommended",
      parameters: {
        issues: health.issues.map((i) => i.description),
      },
    };
  }

  const hasRecoveryExhausted = health.issues.some(
    (i) => i.type === "recovery_exhausted",
  );
  if (hasRecoveryExhausted) {
    return {
      type: "checkpoint",
      reason: "Recovery attempts exhausted, creating checkpoint",
      parameters: {
        saveState: true,
      },
    };
  }

  const hasHighErrorRate = health.issues.some(
    (i) => i.type === "high_error_rate" && i.severity !== "low",
  );
  if (hasHighErrorRate) {
    return {
      type: "slow_down",
      reason: "High error rate detected, slowing down operations",
      parameters: {
        delayMs: 2000,
      },
    };
  }

  const hasSlowPerformance = health.issues.some(
    (i) => i.type === "slow_performance",
  );
  if (hasSlowPerformance) {
    return {
      type: "reduce_complexity",
      reason: "Slow performance detected, reducing operation complexity",
      parameters: {
        simplifyOperations: true,
      },
    };
  }

  if (health.status === "unhealthy") {
    return {
      type: "slow_down",
      reason: "Agent health is degraded, adding delays between operations",
      parameters: {
        delayMs: 1000,
      },
    };
  }

  return null;
}

/**
 * Resets recovery attempt tracking for a specific strategy.
 *
 * @param strategyId - ID of the strategy to reset
 */
export function resetRecoveryAttempts(strategyId: string): void {
  for (const [key, tracker] of recoveryAttempts.entries()) {
    if (tracker.strategyId === strategyId) {
      recoveryAttempts.delete(key);
    }
  }
}

/**
 * Resets all recovery attempt tracking.
 */
export function resetAllRecoveryAttempts(): void {
  recoveryAttempts.clear();
}

/**
 * Gets statistics about recovery attempts.
 *
 * @returns Object with recovery statistics
 */
export function getRecoveryStatistics(): {
  totalAttempts: number;
  successfulAttempts: number;
  failedAttempts: number;
  successRate: number;
  strategiesUsed: string[];
} {
  let totalAttempts = 0;
  let successfulAttempts = 0;
  let failedAttempts = 0;
  const strategiesUsed = new Set<string>();

  for (const tracker of recoveryAttempts.values()) {
    totalAttempts += tracker.attempts;
    successfulAttempts += tracker.successCount;
    failedAttempts += tracker.failureCount;
    strategiesUsed.add(tracker.strategyId);
  }

  return {
    totalAttempts,
    successfulAttempts,
    failedAttempts,
    successRate: totalAttempts > 0 ? successfulAttempts / totalAttempts : 0,
    strategiesUsed: Array.from(strategiesUsed),
  };
}

/**
 * Built-in recovery strategy: File Not Found
 * Handles errors when a file cannot be found.
 */
export const FILE_NOT_FOUND_STRATEGY: RecoveryStrategy = {
  id: "file_not_found",
  name: "File Not Found Recovery",
  description: "Handles file not found errors by suggesting search or skip",
  errorPatterns: [
    { type: "contains", value: "file not found" },
    { type: "contains", value: "no such file" },
    { type: "contains", value: "does not exist" },
    { type: "contains", value: "enoent" },
    { type: "regex", value: "cannot (find|locate|open) file" },
  ],
  priority: 80,
  maxAttempts: 2,
  cooldownMs: 5000,
  action: {
    type: "alternative_tool",
    toolName: "search",
    argsMapping: { query: "filename" },
  },
};

/**
 * Built-in recovery strategy: Permission Denied
 * Handles permission-related errors.
 */
export const PERMISSION_DENIED_STRATEGY: RecoveryStrategy = {
  id: "permission_denied",
  name: "Permission Denied Recovery",
  description: "Handles permission errors by suggesting alternative approaches",
  errorPatterns: [
    { type: "contains", value: "permission denied" },
    { type: "contains", value: "access denied" },
    { type: "contains", value: "eacces" },
    { type: "contains", value: "eperm" },
    { type: "contains", value: "not permitted" },
  ],
  priority: 70,
  maxAttempts: 1,
  cooldownMs: 10000,
  action: {
    type: "skip",
    reason: "Permission denied - operation requires elevated privileges",
  },
};

/**
 * Built-in recovery strategy: Timeout
 * Handles timeout errors with retry and backoff.
 */
export const TIMEOUT_STRATEGY: RecoveryStrategy = {
  id: "timeout",
  name: "Timeout Recovery",
  description: "Handles timeout errors with retry and exponential backoff",
  errorPatterns: [
    { type: "contains", value: "timeout" },
    { type: "contains", value: "timed out" },
    { type: "contains", value: "etimedout" },
    { type: "contains", value: "deadline exceeded" },
  ],
  priority: 90,
  maxAttempts: 3,
  cooldownMs: 5000,
  action: {
    type: "retry",
    delayMs: 5000,
  },
};

/**
 * Built-in recovery strategy: Syntax Error
 * Handles syntax errors by clearing state and retrying.
 */
export const SYNTAX_ERROR_STRATEGY: RecoveryStrategy = {
  id: "syntax_error",
  name: "Syntax Error Recovery",
  description: "Handles syntax errors by clearing cached state and retrying",
  errorPatterns: [
    { type: "contains", value: "syntax error" },
    { type: "contains", value: "parse error" },
    { type: "contains", value: "unexpected token" },
    { type: "contains", value: "invalid syntax" },
  ],
  priority: 75,
  maxAttempts: 2,
  cooldownMs: 3000,
  action: {
    type: "clear_state",
    fields: ["cachedContent", "parsedData"],
  },
};

/**
 * Built-in recovery strategy: Rate Limit
 * Handles rate limiting with exponential backoff.
 */
export const RATE_LIMIT_STRATEGY: RecoveryStrategy = {
  id: "rate_limit",
  name: "Rate Limit Recovery",
  description: "Handles rate limiting with exponential backoff",
  errorPatterns: [
    { type: "contains", value: "rate limit" },
    { type: "contains", value: "too many requests" },
    { type: "contains", value: "429" },
    { type: "contains", value: "throttled" },
  ],
  priority: 95,
  maxAttempts: 5,
  cooldownMs: 30000,
  action: {
    type: "retry",
    delayMs: 30000,
  },
};

/**
 * Built-in recovery strategy: Connection Error
 * Handles connection errors with retry and backoff.
 */
export const CONNECTION_ERROR_STRATEGY: RecoveryStrategy = {
  id: "connection_error",
  name: "Connection Error Recovery",
  description: "Handles connection errors with exponential backoff",
  errorPatterns: [
    { type: "contains", value: "connection refused" },
    { type: "contains", value: "connection reset" },
    { type: "contains", value: "econnrefused" },
    { type: "contains", value: "econnreset" },
    { type: "contains", value: "network error" },
    { type: "contains", value: "socket hang up" },
  ],
  priority: 85,
  maxAttempts: 3,
  cooldownMs: 10000,
  action: {
    type: "retry",
    delayMs: 10000,
  },
};

/**
 * Registers all built-in recovery strategies.
 */
export function registerBuiltInStrategies(): void {
  registerRecoveryStrategy(FILE_NOT_FOUND_STRATEGY);
  registerRecoveryStrategy(PERMISSION_DENIED_STRATEGY);
  registerRecoveryStrategy(TIMEOUT_STRATEGY);
  registerRecoveryStrategy(SYNTAX_ERROR_STRATEGY);
  registerRecoveryStrategy(RATE_LIMIT_STRATEGY);
  registerRecoveryStrategy(CONNECTION_ERROR_STRATEGY);
}
