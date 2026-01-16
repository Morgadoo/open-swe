/**
 * Similarity Analyzer Module
 *
 * Provides semantic similarity analysis for detecting loop patterns
 * in agent tool execution. Includes functions for comparing tool arguments,
 * detecting oscillation patterns, and identifying gradual change patterns.
 */

import { ExecutionHistoryEntry, LoopDetectionConfig } from "./types.js";
import { createLogger, LogLevel } from "../logger.js";

const logger = createLogger(LogLevel.DEBUG, "SimilarityAnalyzer");

/**
 * Represents a similar entry found in execution history
 */
export interface SimilarEntry {
  /** The matching execution history entry */
  entry: ExecutionHistoryEntry;
  /** Similarity score between 0 and 1 */
  similarity: number;
  /** Fields that matched between the entries */
  matchedFields: string[];
}

/**
 * Represents an oscillation pattern (A → B → A → B)
 */
export interface OscillationPattern {
  /** Whether an oscillation pattern was detected */
  detected: boolean;
  /** Tools involved in the oscillation */
  tools: string[];
  /** Length of one complete cycle */
  cycleLength: number;
  /** Number of times the pattern occurred */
  occurrences: number;
  /** Confidence score between 0 and 1 */
  confidence: number;
}

/**
 * Represents a gradual change pattern in tool arguments
 */
export interface GradualChangePattern {
  /** Whether a gradual change pattern was detected */
  detected: boolean;
  /** Name of the tool exhibiting the pattern */
  toolName: string;
  /** The field that is gradually changing */
  changingField: string;
  /** Type of change detected */
  changeType: "increment" | "append" | "modify";
  /** Number of occurrences of this pattern */
  occurrences: number;
}

/**
 * Result of similarity-based loop detection
 */
export interface SimilarityLoopResult {
  /** Whether a loop was detected based on similarity analysis */
  loopDetected: boolean;
  /** Overall similarity score */
  similarityScore: number;
  /** Similar entries found in history */
  similarEntries: SimilarEntry[];
  /** Detected patterns */
  patterns: {
    oscillation?: OscillationPattern;
    gradualChange?: GradualChangePattern;
  };
  /** Recommended action based on analysis */
  recommendation: "continue" | "warn" | "investigate";
}

/**
 * Fields that should be weighted higher in similarity calculations
 */
const HIGH_WEIGHT_FIELDS = new Set([
  "path",
  "file",
  "filename",
  "filepath",
  "command",
  "cmd",
  "query",
  "url",
  "content",
]);

/**
 * Calculates Jaccard similarity between two sets of keys
 * @param set1 - First set of strings
 * @param set2 - Second set of strings
 * @returns Similarity score between 0 and 1
 */
function jaccardSimilarity(set1: Set<string>, set2: Set<string>): number {
  const intersection = new Set([...set1].filter((x) => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  return union.size === 0 ? 1 : intersection.size / union.size;
}

/**
 * Calculates Levenshtein distance between two strings
 * @param str1 - First string
 * @param str2 - Second string
 * @returns Edit distance between the strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;

  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

/**
 * Calculates normalized Levenshtein similarity between two strings
 * @param str1 - First string
 * @param str2 - Second string
 * @returns Similarity score between 0 and 1
 */
function levenshteinSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1;
  if (!str1 || !str2) return 0;

  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1;

  // For very long strings, use word-based comparison for performance
  if (str1.length > 500 || str2.length > 500) {
    const words1 = new Set(str1.toLowerCase().split(/\s+/));
    const words2 = new Set(str2.toLowerCase().split(/\s+/));
    return jaccardSimilarity(words1, words2);
  }

  const distance = levenshteinDistance(str1, str2);
  return 1 - distance / maxLen;
}

/**
 * Finds the length of the longest common substring
 * @param str1 - First string
 * @param str2 - Second string
 * @returns Length of the longest common substring
 */
function longestCommonSubstring(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  let maxLength = 0;

  const prev = new Array(n + 1).fill(0);
  const curr = new Array(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        curr[j] = prev[j - 1] + 1;
        maxLength = Math.max(maxLength, curr[j]);
      } else {
        curr[j] = 0;
      }
    }
    for (let j = 0; j <= n; j++) {
      prev[j] = curr[j];
      curr[j] = 0;
    }
  }

  return maxLength;
}

/**
 * Calculates the ratio of longest common substring to the longer string
 * @param str1 - First string
 * @param str2 - Second string
 * @returns Ratio between 0 and 1
 */
function longestCommonSubstringRatio(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 1;

  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1;

  if (str1.length <= 100 && str2.length <= 100) {
    const lcsLength = longestCommonSubstring(str1, str2);
    return lcsLength / maxLen;
  }

  const words1 = new Set(str1.split(/\s+/));
  const words2 = new Set(str2.split(/\s+/));
  return jaccardSimilarity(words1, words2);
}

/**
 * Normalizes a single value for comparison
 * @param value - Value to normalize
 * @returns Normalized string representation
 */
function normalizeValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.toLowerCase().trim();
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(normalizeValue).join(",");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Normalizes tool arguments for comparison.
 * Handles whitespace, ordering, and formatting differences.
 * @param args - Tool arguments to normalize
 * @returns Normalized arguments object
 */
export function normalizeArgs(
  args: Record<string, unknown>,
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  const sortedKeys = Object.keys(args).sort();

  for (const key of sortedKeys) {
    const value = args[key];
    const normalizedKey = key.toLowerCase().trim();

    if (value === null || value === undefined) {
      normalized[normalizedKey] = null;
    } else if (typeof value === "string") {
      // Normalize whitespace, trim, and lowercase
      normalized[normalizedKey] = value
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
    } else if (typeof value === "number") {
      normalized[normalizedKey] = value;
    } else if (Array.isArray(value)) {
      // Sort arrays for consistent comparison
      normalized[normalizedKey] = [...value].sort().map((v) => {
        if (typeof v === "object" && v !== null) {
          return normalizeArgs(v as Record<string, unknown>);
        }
        return v;
      });
    } else if (typeof value === "object") {
      normalized[normalizedKey] = normalizeArgs(
        value as Record<string, unknown>,
      );
    } else {
      normalized[normalizedKey] = value;
    }
  }

  return normalized;
}

/**
 * Extracts the basename from a file path
 * @param path - File path
 * @returns Basename of the path
 */
function getBasename(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || path;
}

/**
 * Calculates similarity between two file paths
 * @param path1 - First path
 * @param path2 - Second path
 * @returns Similarity score between 0 and 1
 */
function pathSimilarity(path1: string, path2: string): number {
  if (path1 === path2) return 1;

  const normalized1 = path1.replace(/\\/g, "/").toLowerCase();
  const normalized2 = path2.replace(/\\/g, "/").toLowerCase();

  if (normalized1 === normalized2) return 1;

  // Check if basenames match
  const basename1 = getBasename(normalized1);
  const basename2 = getBasename(normalized2);

  if (basename1 === basename2) return 0.9;

  // Calculate path component similarity
  const parts1 = normalized1.split("/").filter(Boolean);
  const parts2 = normalized2.split("/").filter(Boolean);

  // Calculate shared prefix length
  let sharedPrefix = 0;
  const minLen = Math.min(parts1.length, parts2.length);
  for (let i = 0; i < minLen; i++) {
    if (parts1[i] === parts2[i]) {
      sharedPrefix++;
    } else {
      break;
    }
  }

  // If most of the path matches (excluding basename), give higher score
  const maxLen = Math.max(parts1.length, parts2.length);
  if (maxLen > 1 && sharedPrefix >= maxLen - 1) {
    // Paths share most components, just different basename
    return 0.7 + (sharedPrefix / maxLen) * 0.2;
  }

  // Use Jaccard for general case
  const set1 = new Set(parts1);
  const set2 = new Set(parts2);
  return jaccardSimilarity(set1, set2);
}

/**
 * Calculates similarity score between two sets of tool arguments.
 * @param args1 - First set of arguments
 * @param args2 - Second set of arguments
 * @param toolName - Optional tool name for tool-specific comparison rules
 * @returns Score from 0 (completely different) to 1 (identical)
 */
export function calculateArgsSimilarity(
  args1: Record<string, unknown>,
  args2: Record<string, unknown>,
  toolName?: string,
): number {
  const normalized1 = normalizeArgs(args1);
  const normalized2 = normalizeArgs(args2);

  const keys1 = new Set(Object.keys(normalized1));
  const keys2 = new Set(Object.keys(normalized2));

  const keySimilarity = jaccardSimilarity(keys1, keys2);

  const commonKeys = [...keys1].filter((k) => keys2.has(k));
  if (commonKeys.length === 0) {
    // Both empty means they're identical
    if (keys1.size === 0 && keys2.size === 0) return 1;
    return keySimilarity * 0.3;
  }

  let totalWeight = 0;
  let weightedSimilarity = 0;

  for (const key of commonKeys) {
    const val1 = normalized1[key];
    const val2 = normalized2[key];

    // Determine weight for this field
    const weight = HIGH_WEIGHT_FIELDS.has(key) ? 2.0 : 1.0;
    totalWeight += weight;

    // Calculate value similarity based on type
    let valueSim = 0;

    if (val1 === val2) {
      valueSim = 1;
    } else if (val1 === null || val2 === null) {
      valueSim = 0;
    } else if (typeof val1 === "string" && typeof val2 === "string") {
      // Check if this is a path-like field
      if (key.includes("path") || key.includes("file") || key === "url") {
        valueSim = pathSimilarity(val1, val2);
      } else {
        // Use combination of Levenshtein and LCS for strings
        const levSim = levenshteinSimilarity(val1, val2);
        const lcsSim = longestCommonSubstringRatio(val1, val2);
        valueSim = levSim * 0.6 + lcsSim * 0.4;
      }
    } else if (typeof val1 === "number" && typeof val2 === "number") {
      // For numbers, calculate relative difference
      const maxVal = Math.max(Math.abs(val1), Math.abs(val2));
      if (maxVal === 0) {
        valueSim = 1;
      } else {
        const diff = Math.abs(val1 - val2) / maxVal;
        valueSim = Math.max(0, 1 - diff);
      }
    } else if (Array.isArray(val1) && Array.isArray(val2)) {
      // For arrays, use Jaccard similarity on elements
      const set1 = new Set(val1.map(normalizeValue));
      const set2 = new Set(val2.map(normalizeValue));
      valueSim = jaccardSimilarity(set1, set2);
    } else if (typeof val1 === "object" && typeof val2 === "object") {
      // Recursively compare objects
      valueSim = calculateArgsSimilarity(
        val1 as Record<string, unknown>,
        val2 as Record<string, unknown>,
        toolName,
      );
    } else {
      // Different types - compare string representations
      valueSim = levenshteinSimilarity(
        normalizeValue(val1),
        normalizeValue(val2),
      );
    }

    weightedSimilarity += valueSim * weight;
  }

  // Account for keys that don't match
  const unmatchedKeys1 = [...keys1].filter((k) => !keys2.has(k));
  const unmatchedKeys2 = [...keys2].filter((k) => !keys1.has(k));
  const unmatchedPenalty =
    (unmatchedKeys1.length + unmatchedKeys2.length) * 0.1;

  const valueSimilarity =
    totalWeight > 0 ? weightedSimilarity / totalWeight : 0;

  // Combine key similarity and value similarity
  const finalScore = Math.max(
    0,
    keySimilarity * 0.2 + valueSimilarity * 0.8 - unmatchedPenalty,
  );

  logger.debug("Calculated args similarity", {
    toolName,
    keySimilarity,
    valueSimilarity,
    finalScore,
  });

  return Math.min(1, Math.max(0, finalScore));
}

/**
 * Finds similar entries in execution history.
 * @param history - Execution history to search
 * @param currentTool - Current tool name
 * @param currentArgs - Current tool arguments
 * @param threshold - Similarity threshold (0-1)
 * @returns Array of similar entries with their similarity scores
 */
export function findSimilarEntries(
  history: ExecutionHistoryEntry[],
  currentTool: string,
  currentArgs: Record<string, unknown>,
  threshold: number,
): SimilarEntry[] {
  const sameToolEntries = history.filter((e) => e.toolName === currentTool);
  const similarEntries: SimilarEntry[] = [];

  for (const entry of sameToolEntries) {
    const similarity = calculateArgsSimilarity(
      currentArgs,
      entry.toolArgs,
      currentTool,
    );

    if (similarity >= threshold) {
      // Find which fields matched
      const matchedFields: string[] = [];
      const currentKeys = Object.keys(currentArgs);
      const entryKeys = Object.keys(entry.toolArgs);

      for (const key of currentKeys) {
        if (entryKeys.includes(key)) {
          const val1 = normalizeValue(currentArgs[key]);
          const val2 = normalizeValue(entry.toolArgs[key]);
          if (val1 === val2 || levenshteinSimilarity(val1, val2) > 0.8) {
            matchedFields.push(key);
          }
        }
      }

      similarEntries.push({
        entry,
        similarity,
        matchedFields,
      });
    }
  }

  logger.debug("Found similar entries", {
    toolName: currentTool,
    totalChecked: sameToolEntries.length,
    similarFound: similarEntries.length,
    threshold,
  });

  return similarEntries.sort((a, b) => b.similarity - a.similarity);
}

/**
 * Detects oscillation patterns (A → B → A → B) in execution history.
 * @param history - Execution history to analyze
 * @param windowSize - Number of recent entries to analyze (default: 20)
 * @returns Detected oscillation pattern or null
 */
export function detectOscillationPattern(
  history: ExecutionHistoryEntry[],
  windowSize: number = 20,
): OscillationPattern | null {
  if (history.length < 4) {
    return null;
  }

  const recentHistory = history.slice(-windowSize);
  const toolSequence = recentHistory.map((e) => e.toolName);

  // Check for 2-tool oscillation (A → B → A → B)
  for (let cycleLen = 2; cycleLen <= 4; cycleLen++) {
    if (toolSequence.length < cycleLen * 2) continue;

    const pattern = toolSequence.slice(-cycleLen);
    let occurrences = 0;
    let matches = true;

    // Count how many times this pattern repeats
    for (let i = toolSequence.length - cycleLen; i >= 0; i -= cycleLen) {
      const segment = toolSequence.slice(i, i + cycleLen);
      if (segment.length !== cycleLen) break;

      const segmentMatches = segment.every((t, idx) => t === pattern[idx]);
      if (segmentMatches) {
        occurrences++;
      } else {
        matches = false;
        break;
      }
    }

    if (matches && occurrences >= 2) {
      const uniqueTools = [...new Set(pattern)];
      const confidence = Math.min(1, occurrences / 4);

      logger.debug("Detected oscillation pattern", {
        tools: uniqueTools,
        cycleLength: cycleLen,
        occurrences,
        confidence,
      });

      return {
        detected: true,
        tools: uniqueTools,
        cycleLength: cycleLen,
        occurrences,
        confidence,
      };
    }
  }

  return null;
}

/**
 * Detects gradually changing argument patterns.
 * @param history - Execution history to analyze
 * @param toolName - Tool name to check for gradual changes
 * @returns Detected gradual change pattern or null
 */
export function detectGradualChangePattern(
  history: ExecutionHistoryEntry[],
  toolName: string,
): GradualChangePattern | null {
  const toolEntries = history.filter((e) => e.toolName === toolName);

  if (toolEntries.length < 3) {
    return null;
  }

  // Get the last few entries for this tool
  const recentEntries = toolEntries.slice(-10);

  // Collect all argument keys
  const allKeys = new Set<string>();
  for (const entry of recentEntries) {
    Object.keys(entry.toolArgs).forEach((k) => allKeys.add(k));
  }

  // Check each key for gradual changes
  for (const key of allKeys) {
    const values: unknown[] = [];
    for (const entry of recentEntries) {
      if (key in entry.toolArgs) {
        values.push(entry.toolArgs[key]);
      }
    }

    if (values.length < 3) continue;

    // Check for incrementing numbers
    if (values.every((v) => typeof v === "number")) {
      const numValues = values as number[];
      let isIncrementing = true;
      let isDecrementing = true;

      for (let i = 1; i < numValues.length; i++) {
        if (numValues[i] <= numValues[i - 1]) isIncrementing = false;
        if (numValues[i] >= numValues[i - 1]) isDecrementing = false;
      }

      if (isIncrementing || isDecrementing) {
        logger.debug("Detected gradual change pattern (increment)", {
          toolName,
          field: key,
          values: numValues,
        });

        return {
          detected: true,
          toolName,
          changingField: key,
          changeType: "increment",
          occurrences: values.length,
        };
      }
    }

    // Check for appending strings
    if (values.every((v) => typeof v === "string")) {
      const strValues = values as string[];
      let isAppending = true;

      for (let i = 1; i < strValues.length; i++) {
        if (!strValues[i].startsWith(strValues[i - 1])) {
          isAppending = false;
          break;
        }
      }

      if (
        isAppending &&
        strValues[strValues.length - 1].length > strValues[0].length
      ) {
        logger.debug("Detected gradual change pattern (append)", {
          toolName,
          field: key,
        });

        return {
          detected: true,
          toolName,
          changingField: key,
          changeType: "append",
          occurrences: values.length,
        };
      }

      // Check for slight modifications (high similarity but not identical)
      let isModifying = true;
      for (let i = 1; i < strValues.length; i++) {
        const sim = levenshteinSimilarity(strValues[i - 1], strValues[i]);
        if (sim < 0.7 || sim === 1) {
          isModifying = false;
          break;
        }
      }

      if (isModifying) {
        logger.debug("Detected gradual change pattern (modify)", {
          toolName,
          field: key,
        });

        return {
          detected: true,
          toolName,
          changingField: key,
          changeType: "modify",
          occurrences: values.length,
        };
      }
    }
  }

  return null;
}

/**
 * Main similarity-based loop detection function.
 * Combines multiple detection strategies to identify potential loops.
 * @param history - Execution history to analyze
 * @param currentTool - Current tool being called
 * @param currentArgs - Current tool arguments
 * @param config - Loop detection configuration
 * @returns Comprehensive similarity loop detection result
 */
export function detectSimilarityBasedLoop(
  history: ExecutionHistoryEntry[],
  currentTool: string,
  currentArgs: Record<string, unknown>,
  config: LoopDetectionConfig,
): SimilarityLoopResult {
  const result: SimilarityLoopResult = {
    loopDetected: false,
    similarityScore: 0,
    similarEntries: [],
    patterns: {},
    recommendation: "continue",
  };

  if (history.length === 0) {
    return result;
  }

  // Find similar entries
  const similarEntries = findSimilarEntries(
    history,
    currentTool,
    currentArgs,
    config.similarityThreshold,
  );

  result.similarEntries = similarEntries;
  result.similarityScore =
    similarEntries.length > 0 ? similarEntries[0].similarity : 0;

  // Detect oscillation patterns
  const oscillation = detectOscillationPattern(history);
  if (oscillation) {
    result.patterns.oscillation = oscillation;
  }

  // Detect gradual change patterns
  const gradualChange = detectGradualChangePattern(history, currentTool);
  if (gradualChange) {
    result.patterns.gradualChange = gradualChange;
  }

  // Determine if a loop is detected
  const hasTooManySimilar = similarEntries.length >= config.maxSimilarCalls;
  const hasHighSimilarity = result.similarityScore >= 0.95;
  const hasOscillation = oscillation !== null && oscillation.occurrences >= 3;
  const hasGradualChange =
    gradualChange !== null && gradualChange.occurrences >= 5;

  result.loopDetected =
    hasTooManySimilar ||
    (hasHighSimilarity && similarEntries.length >= 2) ||
    hasOscillation ||
    hasGradualChange;

  // Determine recommendation
  if (result.loopDetected) {
    if (hasOscillation && oscillation!.confidence > 0.8) {
      result.recommendation = "investigate";
    } else if (hasTooManySimilar) {
      result.recommendation = "investigate";
    } else {
      result.recommendation = "warn";
    }
  } else if (similarEntries.length >= 2 || result.similarityScore >= 0.8) {
    result.recommendation = "warn";
  }

  logger.debug("Similarity-based loop detection result", {
    loopDetected: result.loopDetected,
    similarityScore: result.similarityScore,
    similarCount: similarEntries.length,
    hasOscillation: !!oscillation,
    hasGradualChange: !!gradualChange,
    recommendation: result.recommendation,
  });

  return result;
}

/**
 * Legacy function for backward compatibility.
 * Checks if an action is semantically similar to recent actions.
 */
export interface SimilarityCheckResult {
  hasSimilarActions: boolean;
  similarCount: number;
  highestSimilarity: number;
  similarEntries: Array<{ entry: ExecutionHistoryEntry; similarity: number }>;
}

/**
 * Legacy function for backward compatibility.
 * @param toolName - Tool name to check
 * @param toolArgs - Tool arguments to check
 * @param history - Execution history
 * @param config - Configuration options
 * @returns Similarity check result
 */
export function checkForSimilarActions(
  toolName: string,
  toolArgs: Record<string, unknown>,
  history: ExecutionHistoryEntry[],
  config: {
    similarityThreshold: number;
    lookbackWindow: number;
    matchThreshold: number;
  },
): SimilarityCheckResult {
  const recentHistory = history.slice(-config.lookbackWindow);
  const similarEntries = findSimilarEntries(
    recentHistory,
    toolName,
    toolArgs,
    config.similarityThreshold,
  );

  return {
    hasSimilarActions: similarEntries.length >= config.matchThreshold,
    similarCount: similarEntries.length,
    highestSimilarity: similarEntries[0]?.similarity ?? 0,
    similarEntries: similarEntries.slice(0, 5).map((e) => ({
      entry: e.entry,
      similarity: e.similarity,
    })),
  };
}
