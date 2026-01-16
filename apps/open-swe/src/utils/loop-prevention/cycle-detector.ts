import {
  ExecutionHistoryEntry,
  LoopDetectionState,
  CycleDetectionResult,
  LoopPreventionConfig,
  DegradationLevelConfig,
  ToolLoopConfig,
  DEFAULT_LOOP_PREVENTION_CONFIG,
  LoopDetectionConfig,
  BasicCycleDetectionResult,
  LoopDetectionResult,
  LoopPattern,
} from "./types.js";
import { createLogger, LogLevel } from "../logger.js";
import {
  hashToolArgs,
  addToHistory,
  getIdenticalCallCount,
  getConsecutiveErrorCount,
  getToolErrorCounts,
} from "./execution-history.js";
import { checkForSimilarActions } from "./similarity-analyzer.js";

const logger = createLogger(LogLevel.INFO, "CycleDetector");

/**
 * Finds exact matches in history (same tool + same args hash)
 */
export function findExactMatches(
  toolName: string,
  argsHash: string,
  history: ExecutionHistoryEntry[],
  lookbackWindow: number,
): ExecutionHistoryEntry[] {
  const recent = history.slice(-lookbackWindow);
  return recent.filter(
    (e) => e.toolName === toolName && e.argsHash === argsHash,
  );
}

/**
 * Detects cyclic patterns in tool execution (e.g., A→B→C→A)
 */
export function detectPatternCycles(
  history: ExecutionHistoryEntry[],
  minLength: number,
  maxLength: number,
): Array<{ pattern: string[]; repetitions: number }> {
  const detectedCycles: Array<{ pattern: string[]; repetitions: number }> = [];
  const toolSequence = history.map((e) => e.toolName);

  for (let patternLen = minLength; patternLen <= maxLength; patternLen++) {
    if (toolSequence.length < patternLen * 2) continue;

    const lastPattern = toolSequence.slice(-patternLen);
    let repetitions = 1;

    for (
      let i = toolSequence.length - patternLen * 2;
      i >= 0;
      i -= patternLen
    ) {
      const segment = toolSequence.slice(i, i + patternLen);
      if (segment.every((tool, idx) => tool === lastPattern[idx])) {
        repetitions++;
      } else {
        break;
      }
    }

    if (repetitions >= 2) {
      detectedCycles.push({ pattern: lastPattern, repetitions });
    }
  }

  return detectedCycles;
}

/**
 * Determines the suggested action based on match count and config
 */
function determineSuggestedAction(
  matchCount: number,
  config: LoopPreventionConfig,
): CycleDetectionResult["suggestedAction"] {
  for (const level of config.degradationLevels.sort(
    (a: DegradationLevelConfig, b: DegradationLevelConfig) => b.level - a.level,
  )) {
    if (level.level === 3 && matchCount >= config.exactMatchThreshold * 3) {
      return "escalate";
    }
    if (level.level === 2 && matchCount >= config.exactMatchThreshold * 2) {
      return "clarify";
    }
    if (level.level === 1 && matchCount >= config.exactMatchThreshold) {
      return "switch-strategy";
    }
  }

  return "continue";
}

/**
 * Main cycle detection function
 */
export function detectCycle(
  toolName: string,
  toolArgs: Record<string, unknown>,
  state: LoopDetectionState,
  config: LoopPreventionConfig = DEFAULT_LOOP_PREVENTION_CONFIG,
): CycleDetectionResult {
  const argsHash = hashToolArgs(toolArgs);
  const history = state.executionHistory;

  const exactMatches = findExactMatches(
    toolName,
    argsHash,
    history,
    config.exactMatchLookbackWindow,
  );

  if (exactMatches.length >= config.exactMatchThreshold) {
    logger.info("Exact match loop detected", {
      toolName,
      matchCount: exactMatches.length,
      threshold: config.exactMatchThreshold,
    });

    return {
      isLoop: true,
      loopType: "exact",
      confidence: 1.0,
      suggestedAction: determineSuggestedAction(exactMatches.length, config),
      matchedEntries: exactMatches,
    };
  }

  if (config.semanticSimilarityEnabled) {
    const similarityResult = checkForSimilarActions(
      toolName,
      toolArgs,
      history,
      {
        similarityThreshold: config.semanticSimilarityThreshold,
        lookbackWindow: config.exactMatchLookbackWindow,
        matchThreshold: config.semanticMatchThreshold,
      },
    );

    if (similarityResult.hasSimilarActions) {
      logger.info("Semantic similarity loop detected", {
        toolName,
        similarCount: similarityResult.similarCount,
        highestSimilarity: similarityResult.highestSimilarity,
      });

      return {
        isLoop: true,
        loopType: "semantic",
        confidence: similarityResult.highestSimilarity,
        suggestedAction: determineSuggestedAction(
          similarityResult.similarCount,
          config,
        ),
        matchedEntries: similarityResult.similarEntries.map((e) => e.entry),
      };
    }
  }

  if (config.patternDetectionEnabled) {
    const patternCycles = detectPatternCycles(
      history,
      config.minPatternLength,
      config.maxPatternLength,
    );

    const significantCycle = patternCycles.find(
      (c) => c.repetitions >= config.patternRepetitionThreshold,
    );

    if (significantCycle) {
      logger.info("Pattern cycle detected", {
        pattern: significantCycle.pattern,
        repetitions: significantCycle.repetitions,
      });

      const patternLength = significantCycle.pattern.length;
      const matchedEntries = history.slice(
        -patternLength * significantCycle.repetitions,
      );

      return {
        isLoop: true,
        loopType: "pattern",
        confidence: Math.min(significantCycle.repetitions / 3, 1.0),
        suggestedAction: "switch-strategy",
        matchedEntries,
      };
    }
  }

  return {
    isLoop: false,
    loopType: null,
    confidence: 0,
    suggestedAction: "continue",
    matchedEntries: [],
  };
}

/**
 * Checks if the current state warrants escalation
 */
export function shouldEscalate(
  state: LoopDetectionState,
  config: LoopPreventionConfig,
): boolean {
  if (!config.autoEscalationEnabled) return false;

  if (state.degradationLevel >= 3) return true;

  const maxConsecutiveErrors = Math.max(
    ...Object.values(config.toolSpecificConfig).map(
      (c: ToolLoopConfig) => c.allowedConsecutiveErrors ?? 10,
    ),
    10,
  );

  if (state.consecutiveErrorCount >= maxConsecutiveErrors) return true;

  const timeSinceLastSwitch = Date.now() - state.lastStrategySwitch;
  if (timeSinceLastSwitch < config.escalationCooldownMs) return false;

  return false;
}

/**
 * Gets tool-specific configuration, falling back to defaults
 */
export function getToolConfig(
  toolName: string,
  config: LoopPreventionConfig,
): Required<{
  exactMatchThreshold: number;
  semanticMatchThreshold: number;
  allowedConsecutiveErrors: number;
}> {
  const toolConfig = config.toolSpecificConfig[toolName] ?? {};

  return {
    exactMatchThreshold:
      toolConfig.exactMatchThreshold ?? config.exactMatchThreshold,
    semanticMatchThreshold:
      toolConfig.semanticMatchThreshold ?? config.semanticMatchThreshold,
    allowedConsecutiveErrors: toolConfig.allowedConsecutiveErrors ?? 10,
  };
}

/**
 * Checks for exact repeat cycles (same tool + same args).
 * Detects when the same tool is called with identical arguments multiple times
 * within the configured time window.
 *
 * @param history - The execution history to analyze
 * @param currentTool - The name of the tool being called
 * @param currentArgsHash - Hash of the current tool arguments
 * @param config - Loop detection configuration
 * @returns Detection result indicating if an exact repeat cycle was found
 */
export function detectExactRepeatCycle(
  history: ExecutionHistoryEntry[],
  currentTool: string,
  currentArgsHash: string,
  config: LoopDetectionConfig,
): BasicCycleDetectionResult {
  const identicalCount = getIdenticalCallCount(
    history,
    currentTool,
    currentArgsHash,
    config,
  );

  if (identicalCount >= config.maxIdenticalCalls) {
    logger.info("Exact repeat cycle detected", {
      toolName: currentTool,
      count: identicalCount,
      threshold: config.maxIdenticalCalls,
    });

    return {
      detected: true,
      type: "exact_repeat",
      count: identicalCount,
      threshold: config.maxIdenticalCalls,
      toolName: currentTool,
      description: `Tool "${currentTool}" called ${identicalCount} times with identical arguments (threshold: ${config.maxIdenticalCalls})`,
    };
  }

  return {
    detected: false,
    type: "none",
    count: identicalCount,
    threshold: config.maxIdenticalCalls,
    toolName: currentTool,
    description: "No exact repeat cycle detected",
  };
}

/**
 * Checks for error cycles (repeated errors from the same tool).
 * Tracks errors per tool and triggers when a tool's error count exceeds the threshold.
 *
 * @param history - The execution history to analyze
 * @param toolErrorCounts - Map of tool names to their current error counts
 * @param config - Loop detection configuration
 * @returns Detection result indicating if an error cycle was found
 */
export function detectErrorCycle(
  history: ExecutionHistoryEntry[],
  toolErrorCounts: Record<string, number>,
  config: LoopDetectionConfig,
): BasicCycleDetectionResult {
  const consecutiveErrors = getConsecutiveErrorCount(history);

  if (consecutiveErrors >= config.maxConsecutiveErrors) {
    const lastErrorEntry = history[history.length - 1];
    const toolName = lastErrorEntry?.toolName ?? "unknown";

    logger.info("Consecutive error cycle detected", {
      consecutiveErrors,
      threshold: config.maxConsecutiveErrors,
      lastTool: toolName,
    });

    return {
      detected: true,
      type: "error_cycle",
      count: consecutiveErrors,
      threshold: config.maxConsecutiveErrors,
      toolName,
      description: `${consecutiveErrors} consecutive errors detected (threshold: ${config.maxConsecutiveErrors}), last tool: "${toolName}"`,
    };
  }

  for (const [toolName, errorCount] of Object.entries(toolErrorCounts)) {
    const toolOverride = config.toolOverrides?.[toolName];
    const toolThreshold =
      toolOverride?.maxConsecutiveErrors ?? config.maxConsecutiveErrors;

    if (errorCount >= toolThreshold) {
      logger.info("Tool-specific error cycle detected", {
        toolName,
        errorCount,
        threshold: toolThreshold,
      });

      return {
        detected: true,
        type: "error_cycle",
        count: errorCount,
        threshold: toolThreshold,
        toolName,
        description: `Tool "${toolName}" has ${errorCount} errors (threshold: ${toolThreshold})`,
      };
    }
  }

  return {
    detected: false,
    type: "none",
    count: consecutiveErrors,
    threshold: config.maxConsecutiveErrors,
    description: "No error cycle detected",
  };
}

/**
 * Determines the recommended action based on detected patterns.
 */
function determineRecommendedAction(
  patterns: LoopPattern[],
): LoopDetectionResult["recommendedAction"] {
  if (patterns.length === 0) {
    return "continue";
  }

  const maxConfidence = Math.max(...patterns.map((p) => p.confidence));
  const hasErrorCycle = patterns.some((p) => p.type === "error_cycle");
  const totalOccurrences = patterns.reduce((sum, p) => sum + p.occurrences, 0);

  if (hasErrorCycle && totalOccurrences >= 5) {
    return "halt";
  }

  if (maxConfidence >= 0.9 || totalOccurrences >= 6) {
    return "escalate";
  }

  if (maxConfidence >= 0.7 || totalOccurrences >= 4) {
    return "degrade";
  }

  if (maxConfidence >= 0.5 || totalOccurrences >= 2) {
    return "warn";
  }

  return "continue";
}

/**
 * Generates suggestions based on detected patterns.
 */
function generateSuggestions(patterns: LoopPattern[]): string[] {
  const suggestions: string[] = [];

  for (const pattern of patterns) {
    switch (pattern.type) {
      case "exact_repeat":
        suggestions.push(
          `Consider using different arguments for "${pattern.toolNames.join(", ")}"`,
          "Try an alternative approach to achieve the same goal",
          "Check if the previous attempts produced any useful output",
        );
        break;
      case "error_cycle":
        suggestions.push(
          `Investigate why "${pattern.toolNames.join(", ")}" is failing repeatedly`,
          "Check for missing dependencies or incorrect configuration",
          "Consider asking for human assistance",
        );
        break;
      case "similar_args":
        suggestions.push(
          "The arguments being used are very similar to previous attempts",
          "Try a significantly different approach",
          "Review the error messages from previous attempts",
        );
        break;
      case "oscillation":
        suggestions.push(
          "The agent appears to be oscillating between states",
          "Consider breaking the task into smaller steps",
          "Request clarification on the expected outcome",
        );
        break;
    }
  }

  return [...new Set(suggestions)];
}

/**
 * Main cycle detection function that combines all checks.
 * Analyzes the current state and tool call to detect various types of loops.
 *
 * @param state - The current loop detection state
 * @param currentTool - The name of the tool being called
 * @param currentArgsHash - Hash of the current tool arguments
 * @param config - Loop detection configuration
 * @returns Comprehensive loop detection result with recommendations
 */
export function detectCycles(
  state: LoopDetectionState,
  currentTool: string,
  currentArgsHash: string,
  config: LoopDetectionConfig,
): LoopDetectionResult {
  const patterns: LoopPattern[] = [];
  const now = Date.now();

  const exactRepeatResult = detectExactRepeatCycle(
    state.executionHistory,
    currentTool,
    currentArgsHash,
    config,
  );

  if (exactRepeatResult.detected) {
    patterns.push({
      type: "exact_repeat",
      toolNames: [currentTool],
      occurrences: exactRepeatResult.count,
      confidence: 1.0,
      firstDetected: now,
      description: exactRepeatResult.description,
    });
  }

  const errorCycleResult = detectErrorCycle(
    state.executionHistory,
    state.toolSpecificErrorCounts,
    config,
  );

  if (errorCycleResult.detected) {
    patterns.push({
      type: "error_cycle",
      toolNames: errorCycleResult.toolName ? [errorCycleResult.toolName] : [],
      occurrences: errorCycleResult.count,
      confidence: Math.min(
        errorCycleResult.count / errorCycleResult.threshold,
        1.0,
      ),
      firstDetected: now,
      description: errorCycleResult.description,
    });
  }

  const loopDetected = patterns.length > 0;
  const recommendedAction = determineRecommendedAction(patterns);

  let reason = "No loops detected";
  if (loopDetected) {
    const patternDescriptions = patterns.map((p) => p.description).join("; ");
    reason = `Loop detected: ${patternDescriptions}`;
  }

  const result: LoopDetectionResult = {
    loopDetected,
    patterns,
    recommendedAction,
    reason,
  };

  if (loopDetected) {
    result.suggestions = generateSuggestions(patterns);
  }

  if (loopDetected) {
    logger.info("Cycle detection complete", {
      loopDetected,
      patternCount: patterns.length,
      recommendedAction,
    });
  }

  return result;
}

/**
 * Updates the loop detection state after an action is executed.
 * Maintains the execution history, error counts, and other tracking metrics.
 *
 * @param state - The current loop detection state
 * @param entry - The execution history entry for the completed action
 * @param config - Loop detection configuration
 * @returns Updated loop detection state
 */
export function updateLoopDetectionState(
  state: LoopDetectionState,
  entry: ExecutionHistoryEntry,
  config: LoopDetectionConfig,
): LoopDetectionState {
  const updatedHistory = addToHistory(state.executionHistory, entry, config);

  let consecutiveErrorCount = state.consecutiveErrorCount;
  if (entry.result === "error") {
    consecutiveErrorCount++;
  } else {
    consecutiveErrorCount = 0;
  }

  const toolSpecificErrorCounts = { ...state.toolSpecificErrorCounts };
  if (entry.result === "error") {
    toolSpecificErrorCounts[entry.toolName] =
      (toolSpecificErrorCounts[entry.toolName] ?? 0) + 1;
  } else {
    toolSpecificErrorCounts[entry.toolName] = 0;
  }

  const updatedErrorCounts = getToolErrorCounts(updatedHistory, config);
  for (const toolName of Object.keys(updatedErrorCounts)) {
    if (toolSpecificErrorCounts[toolName] === undefined) {
      toolSpecificErrorCounts[toolName] = updatedErrorCounts[toolName];
    }
  }

  let similarActionCount = state.similarActionCount;
  const recentSimilar = updatedHistory.filter(
    (e) => e.toolName === entry.toolName && e.argsHash === entry.argsHash,
  );
  if (recentSimilar.length > 1) {
    similarActionCount++;
  }

  return {
    ...state,
    executionHistory: updatedHistory,
    consecutiveErrorCount,
    toolSpecificErrorCounts,
    similarActionCount,
  };
}
