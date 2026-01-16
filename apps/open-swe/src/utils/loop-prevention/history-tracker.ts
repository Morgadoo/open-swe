/**
 * History Tracker Module
 *
 * Provides integration utilities for tracking tool executions in the agent's
 * action execution flow. This module bridges the execution history utilities
 * with the agent's state management.
 */

import {
  ExecutionHistoryEntry,
  LoopDetectionState,
  LoopPreventionConfig,
  DEFAULT_LOOP_PREVENTION_CONFIG,
  DEFAULT_LOOP_DETECTION_STATE,
} from "./types.js";
import {
  createExecutionEntry,
  addToHistory,
  pruneHistory,
} from "./execution-history.js";
import { detectCycle } from "./cycle-detector.js";
import { createLogger, LogLevel } from "../logger.js";

const logger = createLogger(LogLevel.INFO, "HistoryTracker");

/** Maximum number of entries to keep in history */
const MAX_HISTORY_ENTRIES = 100;

/** Default time window for history in milliseconds (1 minute) */
const DEFAULT_TIME_WINDOW_MS = 60000;

/**
 * Summary of recent execution history.
 */
export interface HistorySummary {
  /** Total number of executions in the history */
  totalExecutions: number;
  /** Number of successful executions */
  successCount: number;
  /** Number of failed executions */
  errorCount: number;
  /** Number of unique tools used */
  uniqueTools: number;
  /** Time span covered by the history in milliseconds */
  timeSpanMs: number;
  /** Average execution duration in milliseconds */
  averageDurationMs: number;
  /** Name of the most recently used tool, or null if history is empty */
  mostRecentTool: string | null;
  /** Error rate as a decimal (0-1) */
  errorRate: number;
}

/**
 * Frequency information for a tool.
 */
export interface ToolFrequency {
  /** Name of the tool */
  toolName: string;
  /** Number of times the tool was called */
  count: number;
  /** Percentage of total calls (0-100) */
  percentage: number;
  /** Timestamp of the last usage */
  lastUsed: number;
}

/**
 * Recommendation for whether execution should pause.
 */
export interface PauseRecommendation {
  /** Whether the agent should pause execution */
  shouldPause: boolean;
  /** Reason for the recommendation */
  reason: string;
  /** Suggested action to take */
  suggestedAction: "continue" | "slow_down" | "request_help" | "halt";
  /** Cooldown period in milliseconds, if applicable */
  cooldownMs?: number;
}

/**
 * Legacy config adapter for time window.
 */
interface LegacyConfig {
  timeWindowMs: number;
}

/**
 * Gets the time window from config, handling both legacy and new config formats.
 */
function getTimeWindowMs(config?: LoopPreventionConfig): number {
  if (!config) {
    return DEFAULT_TIME_WINDOW_MS;
  }
  if ("timeWindowMs" in config) {
    return (config as unknown as LegacyConfig).timeWindowMs;
  }
  return DEFAULT_TIME_WINDOW_MS;
}

/**
 * Records a tool execution in the history.
 * Returns an updated loop detection state with the new entry added.
 *
 * @param state - The current loop detection state
 * @param toolName - Name of the tool that was executed
 * @param toolArgs - Arguments passed to the tool
 * @param result - Whether the execution succeeded or failed
 * @param durationMs - Duration of the execution in milliseconds
 * @param errorMessage - Error message if the execution failed
 * @param errorType - Type/category of error if the execution failed
 * @param config - Loop prevention configuration
 * @returns Updated loop detection state
 */
export function recordToolExecution(
  state: LoopDetectionState,
  toolName: string,
  toolArgs: Record<string, unknown>,
  result: "success" | "error",
  durationMs: number,
  errorMessage?: string,
  errorType?: string,
  config: LoopPreventionConfig = DEFAULT_LOOP_PREVENTION_CONFIG,
): LoopDetectionState {
  const entry = createExecutionEntry(
    toolName,
    toolArgs,
    result,
    durationMs,
    errorMessage,
    errorType,
  );

  const legacyConfig = {
    maxIdenticalCalls: config.exactMatchThreshold,
    maxSimilarCalls: config.semanticMatchThreshold,
    timeWindowMs: getTimeWindowMs(config),
    similarityThreshold: config.semanticSimilarityThreshold,
    maxConsecutiveErrors: 10,
  };

  const updatedHistory = addToHistory(
    state.executionHistory,
    entry,
    legacyConfig,
  );

  const prunedHistory =
    updatedHistory.length > MAX_HISTORY_ENTRIES
      ? updatedHistory.slice(-MAX_HISTORY_ENTRIES)
      : updatedHistory;

  let consecutiveErrorCount = state.consecutiveErrorCount;
  if (result === "error") {
    consecutiveErrorCount++;
  } else {
    consecutiveErrorCount = 0;
  }

  const toolSpecificErrorCounts = { ...state.toolSpecificErrorCounts };
  if (result === "error") {
    toolSpecificErrorCounts[toolName] =
      (toolSpecificErrorCounts[toolName] ?? 0) + 1;
  } else {
    toolSpecificErrorCounts[toolName] = 0;
  }

  let similarActionCount = state.similarActionCount;
  const recentSimilar = prunedHistory.filter(
    (e) => e.toolName === entry.toolName && e.argsHash === entry.argsHash,
  );
  if (recentSimilar.length > 1) {
    similarActionCount++;
  }

  logger.debug("Recorded tool execution", {
    toolName,
    result,
    durationMs,
    historySize: prunedHistory.length,
    consecutiveErrors: consecutiveErrorCount,
  });

  return {
    ...state,
    executionHistory: prunedHistory,
    consecutiveErrorCount,
    toolSpecificErrorCounts,
    similarActionCount,
  };
}

/**
 * Creates a wrapper function that tracks tool execution.
 * Useful for wrapping existing tool calls to automatically record their execution.
 *
 * @param toolName - Name of the tool being wrapped
 * @param executor - The actual tool execution function
 * @param getState - Function to get the current loop detection state
 * @param setState - Function to update the loop detection state
 * @param config - Loop prevention configuration
 * @returns A wrapped function that tracks execution
 */
export function createTrackedToolExecutor<T>(
  toolName: string,
  executor: (args: Record<string, unknown>) => Promise<T>,
  getState: () => LoopDetectionState,
  setState: (state: LoopDetectionState) => void,
  config: LoopPreventionConfig = DEFAULT_LOOP_PREVENTION_CONFIG,
): (args: Record<string, unknown>) => Promise<T> {
  return async (args: Record<string, unknown>): Promise<T> => {
    const startTime = Date.now();
    let result: "success" | "error" = "success";
    let errorMessage: string | undefined;
    let errorType: string | undefined;

    try {
      const executionResult = await executor(args);
      return executionResult;
    } catch (error) {
      result = "error";
      if (error instanceof Error) {
        errorMessage = error.message;
        errorType = error.name;
      } else {
        errorMessage = String(error);
        errorType = "UnknownError";
      }
      throw error;
    } finally {
      const durationMs = Date.now() - startTime;
      const currentState = getState();
      const updatedState = recordToolExecution(
        currentState,
        toolName,
        args,
        result,
        durationMs,
        errorMessage,
        errorType,
        config,
      );
      setState(updatedState);
    }
  };
}

/**
 * Gets a summary of recent execution history.
 * Provides aggregate statistics about tool executions within the configured time window.
 *
 * @param state - The current loop detection state
 * @param config - Loop prevention configuration
 * @returns Summary of the execution history
 */
export function getHistorySummary(
  state: LoopDetectionState,
  config: LoopPreventionConfig = DEFAULT_LOOP_PREVENTION_CONFIG,
): HistorySummary {
  const timeWindowMs = getTimeWindowMs(config);
  const cutoffTime = Date.now() - timeWindowMs;

  const recentHistory = state.executionHistory.filter(
    (e) => e.timestamp >= cutoffTime,
  );

  if (recentHistory.length === 0) {
    return {
      totalExecutions: 0,
      successCount: 0,
      errorCount: 0,
      uniqueTools: 0,
      timeSpanMs: 0,
      averageDurationMs: 0,
      mostRecentTool: null,
      errorRate: 0,
    };
  }

  const successCount = recentHistory.filter(
    (e) => e.result === "success",
  ).length;
  const errorCount = recentHistory.filter((e) => e.result === "error").length;
  const uniqueTools = new Set(recentHistory.map((e) => e.toolName)).size;

  const timestamps = recentHistory.map((e) => e.timestamp);
  const timeSpanMs = Math.max(...timestamps) - Math.min(...timestamps);

  const totalDuration = recentHistory.reduce((sum, e) => sum + e.durationMs, 0);
  const averageDurationMs = totalDuration / recentHistory.length;

  const sortedByTime = [...recentHistory].sort(
    (a, b) => b.timestamp - a.timestamp,
  );
  const mostRecentTool = sortedByTime[0]?.toolName ?? null;

  const errorRate =
    recentHistory.length > 0 ? errorCount / recentHistory.length : 0;

  return {
    totalExecutions: recentHistory.length,
    successCount,
    errorCount,
    uniqueTools,
    timeSpanMs,
    averageDurationMs,
    mostRecentTool,
    errorRate,
  };
}

/**
 * Gets the most frequently called tools.
 * Returns tools sorted by call frequency in descending order.
 *
 * @param history - The execution history to analyze
 * @param limit - Maximum number of tools to return (default: 10)
 * @returns Array of tool frequency information
 */
export function getMostFrequentTools(
  history: ExecutionHistoryEntry[],
  limit: number = 10,
): ToolFrequency[] {
  if (history.length === 0) {
    return [];
  }

  const toolCounts = new Map<string, { count: number; lastUsed: number }>();

  for (const entry of history) {
    const existing = toolCounts.get(entry.toolName);
    if (existing) {
      existing.count++;
      existing.lastUsed = Math.max(existing.lastUsed, entry.timestamp);
    } else {
      toolCounts.set(entry.toolName, {
        count: 1,
        lastUsed: entry.timestamp,
      });
    }
  }

  const totalCalls = history.length;
  const frequencies: ToolFrequency[] = [];

  for (const [toolName, data] of toolCounts) {
    frequencies.push({
      toolName,
      count: data.count,
      percentage: (data.count / totalCalls) * 100,
      lastUsed: data.lastUsed,
    });
  }

  frequencies.sort((a, b) => b.count - a.count);

  return frequencies.slice(0, limit);
}

/**
 * Calculates error rate per tool.
 * Returns a map of tool names to their error rates (0-1).
 *
 * @param history - The execution history to analyze
 * @returns Map of tool names to error rates
 */
export function getToolErrorRates(
  history: ExecutionHistoryEntry[],
): Record<string, number> {
  if (history.length === 0) {
    return {};
  }

  const toolStats = new Map<string, { total: number; errors: number }>();

  for (const entry of history) {
    const existing = toolStats.get(entry.toolName);
    if (existing) {
      existing.total++;
      if (entry.result === "error") {
        existing.errors++;
      }
    } else {
      toolStats.set(entry.toolName, {
        total: 1,
        errors: entry.result === "error" ? 1 : 0,
      });
    }
  }

  const errorRates: Record<string, number> = {};

  for (const [toolName, stats] of toolStats) {
    errorRates[toolName] = stats.errors / stats.total;
  }

  return errorRates;
}

/**
 * Checks if the agent should pause based on history.
 * Analyzes the execution history and current state to determine if
 * the agent should pause, slow down, or request help.
 *
 * @param state - The current loop detection state
 * @param config - Loop prevention configuration
 * @returns Recommendation for whether to pause and what action to take
 */
export function shouldPauseExecution(
  state: LoopDetectionState,
  config: LoopPreventionConfig,
): PauseRecommendation {
  if (!config.enabled) {
    return {
      shouldPause: false,
      reason: "Loop prevention is disabled",
      suggestedAction: "continue",
    };
  }

  if (state.degradationLevel >= 3) {
    return {
      shouldPause: true,
      reason: "Maximum degradation level reached",
      suggestedAction: "halt",
      cooldownMs: config.escalationCooldownMs,
    };
  }

  const maxConsecutiveErrors = Math.max(
    ...Object.values(config.toolSpecificConfig).map(
      (c) => c.allowedConsecutiveErrors ?? 10,
    ),
    10,
  );

  if (state.consecutiveErrorCount >= maxConsecutiveErrors) {
    return {
      shouldPause: true,
      reason: `${state.consecutiveErrorCount} consecutive errors detected`,
      suggestedAction: "request_help",
      cooldownMs: config.escalationCooldownMs,
    };
  }

  if (state.executionHistory.length > 0) {
    const lastEntry = state.executionHistory[state.executionHistory.length - 1];
    const cycleResult = detectCycle(
      lastEntry.toolName,
      lastEntry.toolArgs,
      state,
      config,
    );

    if (cycleResult.isLoop) {
      switch (cycleResult.suggestedAction) {
        case "escalate":
          return {
            shouldPause: true,
            reason: `Loop detected: ${cycleResult.loopType} pattern with ${cycleResult.matchedEntries.length} matches`,
            suggestedAction: "halt",
            cooldownMs: config.escalationCooldownMs,
          };
        case "clarify":
          return {
            shouldPause: true,
            reason: `Loop detected: ${cycleResult.loopType} pattern requires clarification`,
            suggestedAction: "request_help",
            cooldownMs: config.degradationLevels[1]?.cooldownMs ?? 120000,
          };
        case "switch-strategy":
          return {
            shouldPause: false,
            reason: `Loop detected: ${cycleResult.loopType} pattern, strategy switch recommended`,
            suggestedAction: "slow_down",
            cooldownMs: config.degradationLevels[0]?.cooldownMs ?? 60000,
          };
      }
    }
  }

  const summary = getHistorySummary(state, config);
  if (summary.errorRate > 0.5 && summary.totalExecutions >= 5) {
    return {
      shouldPause: false,
      reason: `High error rate detected: ${(summary.errorRate * 100).toFixed(1)}%`,
      suggestedAction: "slow_down",
    };
  }

  return {
    shouldPause: false,
    reason: "No issues detected",
    suggestedAction: "continue",
  };
}

/**
 * Prunes the execution history based on time window and max entries.
 * Useful for periodic cleanup of the history.
 *
 * @param state - The current loop detection state
 * @param config - Loop prevention configuration
 * @returns Updated loop detection state with pruned history
 */
export function pruneExecutionHistory(
  state: LoopDetectionState,
  config: LoopPreventionConfig = DEFAULT_LOOP_PREVENTION_CONFIG,
): LoopDetectionState {
  const timeWindowMs = getTimeWindowMs(config);
  const legacyConfig = {
    maxIdenticalCalls: config.exactMatchThreshold,
    maxSimilarCalls: config.semanticMatchThreshold,
    timeWindowMs,
    similarityThreshold: config.semanticSimilarityThreshold,
    maxConsecutiveErrors: 10,
  };

  let prunedHistory = pruneHistory(state.executionHistory, legacyConfig);

  if (prunedHistory.length > MAX_HISTORY_ENTRIES) {
    prunedHistory = prunedHistory.slice(-MAX_HISTORY_ENTRIES);
  }

  if (prunedHistory.length === state.executionHistory.length) {
    return state;
  }

  logger.debug("Pruned execution history", {
    before: state.executionHistory.length,
    after: prunedHistory.length,
  });

  return {
    ...state,
    executionHistory: prunedHistory,
  };
}

/**
 * Creates a fresh loop detection state.
 * Useful for initializing or resetting the state.
 *
 * @returns A new, empty loop detection state
 */
export function createInitialState(): LoopDetectionState {
  return { ...DEFAULT_LOOP_DETECTION_STATE };
}
