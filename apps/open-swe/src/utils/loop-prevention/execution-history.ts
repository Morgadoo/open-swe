/**
 * Execution History Manager
 * Manages the sliding window of execution history for loop detection
 */

import { createHash } from "crypto";
import {
  ExecutionHistoryEntry,
  LoopDetectionConfig,
  DEFAULT_LOOP_DETECTION_CONFIG,
} from "./types.js";

/** Maximum history entries to keep */
const MAX_HISTORY_SIZE = 100;

/**
 * Creates a hash of tool arguments for comparison
 */
export function hashToolArgs(args: Record<string, unknown>): string {
  const normalized = JSON.stringify(args, Object.keys(args).sort());
  return createHash("sha256").update(normalized).digest("hex").substring(0, 16);
}

/**
 * Creates a new execution history entry
 */
export function createExecutionEntry(
  toolName: string,
  toolArgs: Record<string, unknown>,
  result: "success" | "error",
  durationMs: number,
  errorMessage?: string,
  errorType?: string,
): ExecutionHistoryEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    timestamp: Date.now(),
    toolName,
    toolArgs,
    argsHash: hashToolArgs(toolArgs),
    result,
    errorMessage,
    errorType,
    durationMs,
  };
}

/**
 * Adds an entry to the execution history, maintaining the sliding window
 */
export function addToHistory(
  history: ExecutionHistoryEntry[],
  entry: ExecutionHistoryEntry,
  config: LoopDetectionConfig = DEFAULT_LOOP_DETECTION_CONFIG,
): ExecutionHistoryEntry[] {
  const cutoffTime = Date.now() - config.timeWindowMs;

  // Filter out entries outside the time window and add new entry
  const filteredHistory = history.filter((e) => e.timestamp >= cutoffTime);
  filteredHistory.push(entry);

  // Ensure we don't exceed max size
  if (filteredHistory.length > MAX_HISTORY_SIZE) {
    return filteredHistory.slice(-MAX_HISTORY_SIZE);
  }

  return filteredHistory;
}

/**
 * Gets entries for a specific tool within the time window
 */
export function getToolHistory(
  history: ExecutionHistoryEntry[],
  toolName: string,
  config: LoopDetectionConfig = DEFAULT_LOOP_DETECTION_CONFIG,
): ExecutionHistoryEntry[] {
  const cutoffTime = Date.now() - config.timeWindowMs;
  return history.filter(
    (e) => e.toolName === toolName && e.timestamp >= cutoffTime,
  );
}

/**
 * Gets the count of identical calls (same tool and args hash)
 */
export function getIdenticalCallCount(
  history: ExecutionHistoryEntry[],
  toolName: string,
  argsHash: string,
  config: LoopDetectionConfig = DEFAULT_LOOP_DETECTION_CONFIG,
): number {
  const cutoffTime = Date.now() - config.timeWindowMs;
  return history.filter(
    (e) =>
      e.toolName === toolName &&
      e.argsHash === argsHash &&
      e.timestamp >= cutoffTime,
  ).length;
}

/**
 * Gets the count of consecutive errors
 */
export function getConsecutiveErrorCount(
  history: ExecutionHistoryEntry[],
): number {
  let count = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].result === "error") {
      count++;
    } else {
      break;
    }
  }
  return count;
}

/**
 * Gets error counts per tool
 */
export function getToolErrorCounts(
  history: ExecutionHistoryEntry[],
  config: LoopDetectionConfig = DEFAULT_LOOP_DETECTION_CONFIG,
): Record<string, number> {
  const cutoffTime = Date.now() - config.timeWindowMs;
  const counts: Record<string, number> = {};

  for (const entry of history) {
    if (entry.result === "error" && entry.timestamp >= cutoffTime) {
      counts[entry.toolName] = (counts[entry.toolName] || 0) + 1;
    }
  }

  return counts;
}

/**
 * Clears old entries from history based on time window
 */
export function pruneHistory(
  history: ExecutionHistoryEntry[],
  config: LoopDetectionConfig = DEFAULT_LOOP_DETECTION_CONFIG,
): ExecutionHistoryEntry[] {
  const cutoffTime = Date.now() - config.timeWindowMs;
  return history.filter((e) => e.timestamp >= cutoffTime);
}
