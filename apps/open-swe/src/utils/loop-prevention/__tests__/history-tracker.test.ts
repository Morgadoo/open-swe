/**
 * Tests for history-tracker module
 */

import {
  recordToolExecution,
  shouldPauseExecution,
  createInitialState,
  getHistorySummary,
  getMostFrequentTools,
  getToolErrorRates,
  pruneExecutionHistory,
} from "../history-tracker.js";
import {
  DEFAULT_LOOP_PREVENTION_CONFIG,
  DEFAULT_LOOP_DETECTION_STATE,
} from "@openswe/shared/open-swe/loop-prevention/types";
import type {
  ExecutionHistoryEntry,
  LoopPreventionConfig,
} from "@openswe/shared/open-swe/loop-prevention/types";

describe("HistoryTracker", () => {
  describe("recordToolExecution", () => {
    it("should record successful execution", () => {
      const state = { ...DEFAULT_LOOP_DETECTION_STATE };
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const updatedState = recordToolExecution(
        state,
        "shell",
        { command: "ls -la" },
        "success",
        100,
        undefined,
        undefined,
        config,
      );

      expect(updatedState.executionHistory).toHaveLength(1);
      expect(updatedState.executionHistory[0].toolName).toBe("shell");
      expect(updatedState.executionHistory[0].result).toBe("success");
      expect(updatedState.consecutiveErrorCount).toBe(0);
    });

    it("should record error execution", () => {
      const state = { ...DEFAULT_LOOP_DETECTION_STATE };
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const updatedState = recordToolExecution(
        state,
        "shell",
        { command: "ls -la" },
        "error",
        100,
        "Command failed",
        "ExecutionError",
        config,
      );

      expect(updatedState.executionHistory).toHaveLength(1);
      expect(updatedState.executionHistory[0].result).toBe("error");
      expect(updatedState.consecutiveErrorCount).toBe(1);
      expect(updatedState.toolSpecificErrorCounts.shell).toBe(1);
    });

    it("should reset consecutive error count on success", () => {
      const state = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        consecutiveErrorCount: 3,
      };
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const updatedState = recordToolExecution(
        state,
        "shell",
        { command: "ls -la" },
        "success",
        100,
        undefined,
        undefined,
        config,
      );

      expect(updatedState.consecutiveErrorCount).toBe(0);
    });

    it("should track similar action count", () => {
      const state = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        executionHistory: [
          {
            id: "1",
            timestamp: Date.now() - 10000,
            toolName: "shell",
            toolArgs: { command: "ls -la" },
            argsHash: "1df8bccaec747dc6",
            result: "success" as const,
            durationMs: 100,
          },
        ],
      };
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const updatedState = recordToolExecution(
        state,
        "shell",
        { command: "ls -la" },
        "success",
        100,
        undefined,
        undefined,
        config,
      );

      expect(updatedState.similarActionCount).toBe(1);
    });

    it("should prune history when it exceeds max size", () => {
      const history: ExecutionHistoryEntry[] = [];
      for (let i = 0; i < 110; i++) {
        history.push({
          id: `${i}`,
          timestamp: Date.now() - (110 - i) * 1000,
          toolName: "shell",
          toolArgs: { command: `ls -la ${i}` },
          argsHash: `hash-${i}`,
          result: "success" as const,
          durationMs: 100,
        });
      }

      const state = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        executionHistory: history,
      };
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const updatedState = recordToolExecution(
        state,
        "shell",
        { command: "ls -la" },
        "success",
        100,
        undefined,
        undefined,
        config,
      );

      expect(updatedState.executionHistory.length).toBeLessThanOrEqual(100);
    });

    it("should respect time window", () => {
      const history: ExecutionHistoryEntry[] = [
        {
          id: "1",
          timestamp: Date.now() - 120000, // 2 minutes ago
          toolName: "shell",
          toolArgs: { command: "ls -la" },
          argsHash: "abc123",
          result: "success" as const,
          durationMs: 100,
        },
      ];

      const state = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        executionHistory: history,
      };
      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
      };

      const updatedState = recordToolExecution(
        state,
        "shell",
        { command: "ls -la" },
        "success",
        100,
        undefined,
        undefined,
        config,
      );

      // Old entry should be filtered out
      expect(updatedState.executionHistory).toHaveLength(1);
      expect(updatedState.executionHistory[0].timestamp).toBeGreaterThan(
        Date.now() - 60000,
      );
    });
  });

  describe("shouldPauseExecution", () => {
    it("should not pause when loop prevention is disabled", () => {
      const state = { ...DEFAULT_LOOP_DETECTION_STATE };
      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        enabled: false,
      };

      const result = shouldPauseExecution(state, config);
      expect(result.shouldPause).toBe(false);
      expect(result.suggestedAction).toBe("continue");
    });

    it("should pause when degradation level is 3 or higher", () => {
      const state = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        degradationLevel: 3 as const,
      };
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const result = shouldPauseExecution(state, config);
      expect(result.shouldPause).toBe(true);
      expect(result.suggestedAction).toBe("halt");
    });

    it("should pause when consecutive errors exceed threshold", () => {
      const state = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        consecutiveErrorCount: 15,
      };
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const result = shouldPauseExecution(state, config);
      expect(result.shouldPause).toBe(true);
      expect(result.suggestedAction).toBe("request_help");
    });

    it("should pause when loop is detected with escalate action", () => {
      // To trigger escalate action, we need matchCount >= exactMatchThreshold * 3
      // With threshold 2, we need at least 6 matches
      const state = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        executionHistory: [
          {
            id: "1",
            timestamp: Date.now() - 10000,
            toolName: "shell",
            toolArgs: { command: "ls -la" },
            argsHash: "1df8bccaec747dc6",
            result: "success" as const,
            durationMs: 100,
          },
          {
            id: "2",
            timestamp: Date.now() - 9000,
            toolName: "shell",
            toolArgs: { command: "ls -la" },
            argsHash: "1df8bccaec747dc6",
            result: "success" as const,
            durationMs: 100,
          },
          {
            id: "3",
            timestamp: Date.now() - 8000,
            toolName: "shell",
            toolArgs: { command: "ls -la" },
            argsHash: "1df8bccaec747dc6",
            result: "success" as const,
            durationMs: 100,
          },
          {
            id: "4",
            timestamp: Date.now() - 7000,
            toolName: "shell",
            toolArgs: { command: "ls -la" },
            argsHash: "1df8bccaec747dc6",
            result: "success" as const,
            durationMs: 100,
          },
          {
            id: "5",
            timestamp: Date.now() - 6000,
            toolName: "shell",
            toolArgs: { command: "ls -la" },
            argsHash: "1df8bccaec747dc6",
            result: "success" as const,
            durationMs: 100,
          },
          {
            id: "6",
            timestamp: Date.now() - 5000,
            toolName: "shell",
            toolArgs: { command: "ls -la" },
            argsHash: "1df8bccaec747dc6",
            result: "success" as const,
            durationMs: 100,
          },
        ],
      };
      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        exactMatchThreshold: 2,
      };

      const result = shouldPauseExecution(state, config);
      expect(result.shouldPause).toBe(true);
      expect(result.suggestedAction).toBe("halt");
    });

    it("should pause when loop is detected with clarify action", () => {
      // To trigger clarify action, we need matchCount >= exactMatchThreshold * 2
      // With threshold 2, we need at least 4 matches
      const state = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        executionHistory: [
          {
            id: "1",
            timestamp: Date.now() - 10000,
            toolName: "shell",
            toolArgs: { command: "ls -la" },
            argsHash: "1df8bccaec747dc6",
            result: "success" as const,
            durationMs: 100,
          },
          {
            id: "2",
            timestamp: Date.now() - 8000,
            toolName: "shell",
            toolArgs: { command: "ls -la" },
            argsHash: "1df8bccaec747dc6",
            result: "success" as const,
            durationMs: 100,
          },
          {
            id: "3",
            timestamp: Date.now() - 6000,
            toolName: "shell",
            toolArgs: { command: "ls -la" },
            argsHash: "1df8bccaec747dc6",
            result: "success" as const,
            durationMs: 100,
          },
          {
            id: "4",
            timestamp: Date.now() - 4000,
            toolName: "shell",
            toolArgs: { command: "ls -la" },
            argsHash: "1df8bccaec747dc6",
            result: "success" as const,
            durationMs: 100,
          },
        ],
      };
      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        exactMatchThreshold: 2,
      };

      const result = shouldPauseExecution(state, config);
      expect(result.shouldPause).toBe(true);
      expect(result.suggestedAction).toBe("request_help");
    });

    it("should not pause when loop is detected with switch-strategy action", () => {
      // To trigger switch-strategy action, we need matchCount >= exactMatchThreshold
      // With threshold 2, we need at least 2 matches (but less than 4 for clarify)
      const state = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        executionHistory: [
          {
            id: "1",
            timestamp: Date.now() - 10000,
            toolName: "shell",
            toolArgs: { command: "ls -la" },
            argsHash: "1df8bccaec747dc6",
            result: "success" as const,
            durationMs: 100,
          },
          {
            id: "2",
            timestamp: Date.now() - 5000,
            toolName: "shell",
            toolArgs: { command: "ls -la" },
            argsHash: "1df8bccaec747dc6",
            result: "success" as const,
            durationMs: 100,
          },
        ],
      };
      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        exactMatchThreshold: 2,
      };

      const result = shouldPauseExecution(state, config);
      expect(result.shouldPause).toBe(false);
      expect(result.suggestedAction).toBe("slow_down");
    });

    it("should detect high error rate and suggest slow_down", () => {
      // Use different tool names and args to avoid triggering loop detection
      // This test focuses on high error rate detection
      const history: ExecutionHistoryEntry[] = [];
      for (let i = 0; i < 10; i++) {
        history.push({
          id: `${i}`,
          timestamp: Date.now() - (10 - i) * 1000,
          toolName: `tool-${i}`,
          toolArgs: { arg: `value-${i}` },
          argsHash: `hash-${i}`,
          result: i < 6 ? "error" : "success",
          durationMs: 100,
        });
      }

      const state = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        executionHistory: history,
      };
      // Disable semantic similarity to focus on error rate detection
      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        semanticSimilarityEnabled: false,
        patternDetectionEnabled: false,
      };

      const result = shouldPauseExecution(state, config);
      expect(result.shouldPause).toBe(false);
      expect(result.suggestedAction).toBe("slow_down");
    });

    it("should not pause when no issues detected", () => {
      const state = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        executionHistory: [
          {
            id: "1",
            timestamp: Date.now() - 10000,
            toolName: "shell",
            toolArgs: { command: "ls -la" },
            argsHash: "1df8bccaec747dc6",
            result: "success" as const,
            durationMs: 100,
          },
        ],
      };
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const result = shouldPauseExecution(state, config);
      expect(result.shouldPause).toBe(false);
      expect(result.suggestedAction).toBe("continue");
    });
  });

  describe("createInitialState", () => {
    it("should create initial state with default values", () => {
      const state = createInitialState();

      expect(state.executionHistory).toEqual([]);
      expect(state.consecutiveErrorCount).toBe(0);
      expect(state.toolSpecificErrorCounts).toEqual({});
      expect(state.similarActionCount).toBe(0);
      expect(state.lastStrategySwitch).toBe(0);
      expect(state.degradationLevel).toBe(0);
    });
  });

  describe("getHistorySummary", () => {
    it("should return empty summary for empty history", () => {
      const state = { ...DEFAULT_LOOP_DETECTION_STATE };
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const summary = getHistorySummary(state, config);

      expect(summary.totalExecutions).toBe(0);
      expect(summary.successCount).toBe(0);
      expect(summary.errorCount).toBe(0);
      expect(summary.uniqueTools).toBe(0);
      expect(summary.timeSpanMs).toBe(0);
      expect(summary.averageDurationMs).toBe(0);
      expect(summary.mostRecentTool).toBeNull();
      expect(summary.errorRate).toBe(0);
    });

    it("should calculate summary for successful executions", () => {
      const history: ExecutionHistoryEntry[] = [
        {
          id: "1",
          timestamp: Date.now() - 10000,
          toolName: "shell",
          toolArgs: { command: "ls -la" },
          argsHash: "abc123",
          result: "success",
          durationMs: 100,
        },
        {
          id: "2",
          timestamp: Date.now() - 5000,
          toolName: "shell",
          toolArgs: { command: "pwd" },
          argsHash: "def456",
          result: "success",
          durationMs: 50,
        },
      ];

      const state = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        executionHistory: history,
      };
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const summary = getHistorySummary(state, config);

      expect(summary.totalExecutions).toBe(2);
      expect(summary.successCount).toBe(2);
      expect(summary.errorCount).toBe(0);
      expect(summary.uniqueTools).toBe(1);
      expect(summary.mostRecentTool).toBe("shell");
      expect(summary.errorRate).toBe(0);
    });

    it("should calculate summary for mixed executions", () => {
      const history: ExecutionHistoryEntry[] = [
        {
          id: "1",
          timestamp: Date.now() - 10000,
          toolName: "shell",
          toolArgs: { command: "ls -la" },
          argsHash: "abc123",
          result: "success",
          durationMs: 100,
        },
        {
          id: "2",
          timestamp: Date.now() - 5000,
          toolName: "shell",
          toolArgs: { command: "pwd" },
          argsHash: "def456",
          result: "error",
          durationMs: 50,
          errorMessage: "Command failed",
        },
      ];

      const state = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        executionHistory: history,
      };
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const summary = getHistorySummary(state, config);

      expect(summary.totalExecutions).toBe(2);
      expect(summary.successCount).toBe(1);
      expect(summary.errorCount).toBe(1);
      expect(summary.uniqueTools).toBe(1);
      expect(summary.mostRecentTool).toBe("shell");
      expect(summary.errorRate).toBe(0.5);
    });

    it("should calculate time span correctly", () => {
      const history: ExecutionHistoryEntry[] = [
        {
          id: "1",
          timestamp: Date.now() - 20000,
          toolName: "shell",
          toolArgs: { command: "ls -la" },
          argsHash: "abc123",
          result: "success",
          durationMs: 100,
        },
        {
          id: "2",
          timestamp: Date.now() - 5000,
          toolName: "shell",
          toolArgs: { command: "pwd" },
          argsHash: "def456",
          result: "success",
          durationMs: 50,
        },
      ];

      const state = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        executionHistory: history,
      };
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const summary = getHistorySummary(state, config);

      expect(summary.timeSpanMs).toBeGreaterThan(10000);
      expect(summary.timeSpanMs).toBeLessThan(20000);
    });

    it("should calculate average duration correctly", () => {
      const history: ExecutionHistoryEntry[] = [
        {
          id: "1",
          timestamp: Date.now() - 10000,
          toolName: "shell",
          toolArgs: { command: "ls -la" },
          argsHash: "abc123",
          result: "success",
          durationMs: 100,
        },
        {
          id: "2",
          timestamp: Date.now() - 5000,
          toolName: "shell",
          toolArgs: { command: "pwd" },
          argsHash: "def456",
          result: "success",
          durationMs: 200,
        },
      ];

      const state = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        executionHistory: history,
      };
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const summary = getHistorySummary(state, config);

      expect(summary.averageDurationMs).toBe(150);
    });

    it("should filter by time window", () => {
      const history: ExecutionHistoryEntry[] = [
        {
          id: "1",
          timestamp: Date.now() - 120000, // 2 minutes ago
          toolName: "shell",
          toolArgs: { command: "ls -la" },
          argsHash: "abc123",
          result: "success" as const,
          durationMs: 100,
        },
        {
          id: "2",
          timestamp: Date.now() - 30000, // 30 seconds ago
          toolName: "shell",
          toolArgs: { command: "pwd" },
          argsHash: "def456",
          result: "success" as const,
          durationMs: 50,
        },
      ];

      const state = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        executionHistory: history,
      };
      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
      };

      const summary = getHistorySummary(state, config);

      expect(summary.totalExecutions).toBe(1);
      expect(summary.successCount).toBe(1);
      expect(summary.errorCount).toBe(0);
    });
  });

  describe("getMostFrequentTools", () => {
    it("should return empty array for empty history", () => {
      const result = getMostFrequentTools([]);
      expect(result).toEqual([]);
    });

    it("should return tools sorted by frequency", () => {
      const history: ExecutionHistoryEntry[] = [
        {
          id: "1",
          timestamp: Date.now(),
          toolName: "shell",
          toolArgs: {},
          argsHash: "1",
          result: "success",
          durationMs: 100,
        },
        {
          id: "2",
          timestamp: Date.now(),
          toolName: "shell",
          toolArgs: {},
          argsHash: "2",
          result: "success",
          durationMs: 100,
        },
        {
          id: "3",
          timestamp: Date.now(),
          toolName: "shell",
          toolArgs: {},
          argsHash: "3",
          result: "success",
          durationMs: 100,
        },
        {
          id: "4",
          timestamp: Date.now(),
          toolName: "read_file",
          toolArgs: {},
          argsHash: "4",
          result: "success",
          durationMs: 100,
        },
        {
          id: "5",
          timestamp: Date.now(),
          toolName: "read_file",
          toolArgs: {},
          argsHash: "5",
          result: "success",
          durationMs: 100,
        },
        {
          id: "6",
          timestamp: Date.now(),
          toolName: "write_file",
          toolArgs: {},
          argsHash: "6",
          result: "success",
          durationMs: 100,
        },
      ];

      const result = getMostFrequentTools(history);

      expect(result).toHaveLength(3);
      expect(result[0].toolName).toBe("shell");
      expect(result[0].count).toBe(3);
      expect(result[1].toolName).toBe("read_file");
      expect(result[1].count).toBe(2);
      expect(result[2].toolName).toBe("write_file");
      expect(result[2].count).toBe(1);
    });

    it("should respect limit parameter", () => {
      const history: ExecutionHistoryEntry[] = [
        {
          id: "1",
          timestamp: Date.now(),
          toolName: "shell",
          toolArgs: {},
          argsHash: "1",
          result: "success",
          durationMs: 100,
        },
        {
          id: "2",
          timestamp: Date.now(),
          toolName: "read_file",
          toolArgs: {},
          argsHash: "2",
          result: "success",
          durationMs: 100,
        },
        {
          id: "3",
          timestamp: Date.now(),
          toolName: "write_file",
          toolArgs: {},
          argsHash: "3",
          result: "success",
          durationMs: 100,
        },
        {
          id: "4",
          timestamp: Date.now(),
          toolName: "edit_file",
          toolArgs: {},
          argsHash: "4",
          result: "success",
          durationMs: 100,
        },
        {
          id: "5",
          timestamp: Date.now(),
          toolName: "grep",
          toolArgs: {},
          argsHash: "5",
          result: "success",
          durationMs: 100,
        },
      ];

      const result = getMostFrequentTools(history, 3);

      expect(result).toHaveLength(3);
    });

    it("should calculate percentage correctly", () => {
      const history: ExecutionHistoryEntry[] = [
        {
          id: "1",
          timestamp: Date.now(),
          toolName: "shell",
          toolArgs: {},
          argsHash: "1",
          result: "success",
          durationMs: 100,
        },
        {
          id: "2",
          timestamp: Date.now(),
          toolName: "shell",
          toolArgs: {},
          argsHash: "2",
          result: "success",
          durationMs: 100,
        },
        {
          id: "3",
          timestamp: Date.now(),
          toolName: "shell",
          toolArgs: {},
          argsHash: "3",
          result: "success",
          durationMs: 100,
        },
        {
          id: "4",
          timestamp: Date.now(),
          toolName: "read_file",
          toolArgs: {},
          argsHash: "4",
          result: "success",
          durationMs: 100,
        },
      ];

      const result = getMostFrequentTools(history);

      expect(result[0].percentage).toBe(75);
      expect(result[1].percentage).toBe(25);
    });
  });

  describe("getToolErrorRates", () => {
    it("should return empty object for empty history", () => {
      const result = getToolErrorRates([]);
      expect(result).toEqual({});
    });

    it("should calculate error rates per tool", () => {
      const history: ExecutionHistoryEntry[] = [
        {
          id: "1",
          timestamp: Date.now(),
          toolName: "shell",
          toolArgs: {},
          argsHash: "1",
          result: "error",
          durationMs: 100,
        },
        {
          id: "2",
          timestamp: Date.now(),
          toolName: "shell",
          toolArgs: {},
          argsHash: "2",
          result: "error",
          durationMs: 100,
        },
        {
          id: "3",
          timestamp: Date.now(),
          toolName: "shell",
          toolArgs: {},
          argsHash: "3",
          result: "success",
          durationMs: 100,
        },
        {
          id: "4",
          timestamp: Date.now(),
          toolName: "read_file",
          toolArgs: {},
          argsHash: "4",
          result: "success",
          durationMs: 100,
        },
      ];

      const result = getToolErrorRates(history);

      expect(result.shell).toBe(2 / 3);
      expect(result.read_file).toBe(0);
    });

    it("should handle tools with only errors", () => {
      const history: ExecutionHistoryEntry[] = [
        {
          id: "1",
          timestamp: Date.now(),
          toolName: "shell",
          toolArgs: {},
          argsHash: "1",
          result: "error",
          durationMs: 100,
        },
        {
          id: "2",
          timestamp: Date.now(),
          toolName: "shell",
          toolArgs: {},
          argsHash: "2",
          result: "error",
          durationMs: 100,
        },
      ];

      const result = getToolErrorRates(history);

      expect(result.shell).toBe(1);
    });

    it("should handle tools with only successes", () => {
      const history: ExecutionHistoryEntry[] = [
        {
          id: "1",
          timestamp: Date.now(),
          toolName: "shell",
          toolArgs: {},
          argsHash: "1",
          result: "success",
          durationMs: 100,
        },
        {
          id: "2",
          timestamp: Date.now(),
          toolName: "shell",
          toolArgs: {},
          argsHash: "2",
          result: "success",
          durationMs: 100,
        },
      ];

      const result = getToolErrorRates(history);

      expect(result.shell).toBe(0);
    });
  });

  describe("pruneExecutionHistory", () => {
    it("should not modify state when history is empty", () => {
      const state = { ...DEFAULT_LOOP_DETECTION_STATE };
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const result = pruneExecutionHistory(state, config);

      expect(result.executionHistory).toEqual([]);
      expect(result).toBe(state);
    });

    it("should prune old entries based on time window", () => {
      const history: ExecutionHistoryEntry[] = [
        {
          id: "1",
          timestamp: Date.now() - 120000, // 2 minutes ago
          toolName: "shell",
          toolArgs: { command: "ls -la" },
          argsHash: "abc123",
          result: "success" as const,
          durationMs: 100,
        },
        {
          id: "2",
          timestamp: Date.now() - 30000, // 30 seconds ago
          toolName: "shell",
          toolArgs: { command: "pwd" },
          argsHash: "def456",
          result: "success" as const,
          durationMs: 50,
        },
      ];

      const state = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        executionHistory: history,
      };
      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
      };

      const result = pruneExecutionHistory(state, config);

      expect(result.executionHistory).toHaveLength(1);
      expect(result.executionHistory[0].id).toBe("2");
    });

    it("should not prune recent entries", () => {
      const history: ExecutionHistoryEntry[] = [
        {
          id: "1",
          timestamp: Date.now() - 30000,
          toolName: "shell",
          toolArgs: { command: "ls -la" },
          argsHash: "abc123",
          result: "success" as const,
          durationMs: 100,
        },
        {
          id: "2",
          timestamp: Date.now() - 10000,
          toolName: "shell",
          toolArgs: { command: "pwd" },
          argsHash: "def456",
          result: "success" as const,
          durationMs: 50,
        },
      ];

      const state = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        executionHistory: history,
      };
      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
      };

      const result = pruneExecutionHistory(state, config);

      expect(result.executionHistory).toHaveLength(2);
    });

    it("should return same state when no pruning needed", () => {
      const history: ExecutionHistoryEntry[] = [
        {
          id: "1",
          timestamp: Date.now() - 30000,
          toolName: "shell",
          toolArgs: { command: "ls -la" },
          argsHash: "abc123",
          result: "success" as const,
          durationMs: 100,
        },
      ];

      const state = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        executionHistory: history,
      };
      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
      };

      const result = pruneExecutionHistory(state, config);

      expect(result).toBe(state);
    });

    it("should prune when history exceeds max size", () => {
      const history: ExecutionHistoryEntry[] = [];
      for (let i = 0; i < 110; i++) {
        history.push({
          id: `${i}`,
          timestamp: Date.now() - (110 - i) * 1000,
          toolName: "shell",
          toolArgs: { command: "ls -la" },
          argsHash: "abc123",
          result: "success",
          durationMs: 100,
        });
      }

      const state = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        executionHistory: history,
      };
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const result = pruneExecutionHistory(state, config);

      expect(result.executionHistory.length).toBeLessThanOrEqual(100);
    });
  });
});
