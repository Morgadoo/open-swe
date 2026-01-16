/**
 * Tests for cycle-detector module
 */

import {
  findExactMatches,
  detectPatternCycles,
  detectCycle,
  shouldEscalate,
  getToolConfig,
  detectExactRepeatCycle,
  detectErrorCycle,
  detectCycles,
  updateLoopDetectionState,
} from "../cycle-detector.js";
import { hashToolArgs } from "../execution-history.js";
import {
  DEFAULT_LOOP_PREVENTION_CONFIG,
  DEFAULT_LOOP_DETECTION_STATE,
} from "@openswe/shared/open-swe/loop-prevention/types";
import type {
  ExecutionHistoryEntry,
  LoopDetectionState,
  LoopPreventionConfig,
} from "@openswe/shared/open-swe/loop-prevention/types";

describe("CycleDetector", () => {
  describe("findExactMatches", () => {
    it("should find exact matches in history", () => {
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
          toolArgs: { command: "ls -la" },
          argsHash: "abc123",
          result: "success",
          durationMs: 100,
        },
        {
          id: "3",
          timestamp: Date.now() - 1000,
          toolName: "shell",
          toolArgs: { command: "pwd" },
          argsHash: "def456",
          result: "success",
          durationMs: 50,
        },
      ];

      const matches = findExactMatches("shell", "abc123", history, 10);
      expect(matches).toHaveLength(2);
      expect(matches[0].toolName).toBe("shell");
      expect(matches[0].argsHash).toBe("abc123");
    });

    it("should respect lookback window", () => {
      const now = Date.now();
      const history: ExecutionHistoryEntry[] = [
        {
          id: "1",
          timestamp: now - 100000,
          toolName: "shell",
          toolArgs: { command: "ls -la" },
          argsHash: "abc123",
          result: "success" as const,
          durationMs: 100,
        },
        {
          id: "2",
          timestamp: now - 90000,
          toolName: "shell",
          toolArgs: { command: "ls -la" },
          argsHash: "abc123",
          result: "success" as const,
          durationMs: 100,
        },
        {
          id: "3",
          timestamp: now - 80000,
          toolName: "shell",
          toolArgs: { command: "ls -la" },
          argsHash: "abc123",
          result: "success" as const,
          durationMs: 100,
        },
        {
          id: "4",
          timestamp: now - 70000,
          toolName: "shell",
          toolArgs: { command: "ls -la" },
          argsHash: "abc123",
          result: "success" as const,
          durationMs: 100,
        },
        {
          id: "5",
          timestamp: now - 60000,
          toolName: "shell",
          toolArgs: { command: "ls -la" },
          argsHash: "different",
          result: "success" as const,
          durationMs: 100,
        },
        {
          id: "6",
          timestamp: now - 5000,
          toolName: "shell",
          toolArgs: { command: "ls -la" },
          argsHash: "abc123",
          result: "success" as const,
          durationMs: 100,
        },
      ];

      const matches = findExactMatches("shell", "abc123", history, 2);
      expect(matches).toHaveLength(1);
      expect(matches[0].id).toBe("6");
    });

    it("should return empty array when no matches found", () => {
      const history: ExecutionHistoryEntry[] = [
        {
          id: "1",
          timestamp: Date.now() - 1000,
          toolName: "shell",
          toolArgs: { command: "ls -la" },
          argsHash: "abc123",
          result: "success",
          durationMs: 100,
        },
      ];

      const matches = findExactMatches("shell", "different_hash", history, 10);
      expect(matches).toHaveLength(0);
    });

    it("should handle empty history", () => {
      const matches = findExactMatches("shell", "abc123", [], 10);
      expect(matches).toHaveLength(0);
    });
  });

  describe("detectPatternCycles", () => {
    it("should detect simple 2-tool cycle", () => {
      const history: ExecutionHistoryEntry[] = [
        {
          id: "1",
          timestamp: Date.now(),
          toolName: "A",
          toolArgs: {},
          argsHash: "1",
          result: "success",
          durationMs: 100,
        },
        {
          id: "2",
          timestamp: Date.now(),
          toolName: "B",
          toolArgs: {},
          argsHash: "2",
          result: "success",
          durationMs: 100,
        },
        {
          id: "3",
          timestamp: Date.now(),
          toolName: "A",
          toolArgs: {},
          argsHash: "3",
          result: "success",
          durationMs: 100,
        },
        {
          id: "4",
          timestamp: Date.now(),
          toolName: "B",
          toolArgs: {},
          argsHash: "4",
          result: "success",
          durationMs: 100,
        },
      ];

      const cycles = detectPatternCycles(history, 2, 4);
      expect(cycles).toHaveLength(1);
      expect(cycles[0].pattern).toEqual(["A", "B"]);
      expect(cycles[0].repetitions).toBe(2);
    });

    it("should detect 3-tool cycle", () => {
      const history: ExecutionHistoryEntry[] = [
        {
          id: "1",
          timestamp: Date.now(),
          toolName: "A",
          toolArgs: {},
          argsHash: "1",
          result: "success",
          durationMs: 100,
        },
        {
          id: "2",
          timestamp: Date.now(),
          toolName: "B",
          toolArgs: {},
          argsHash: "2",
          result: "success",
          durationMs: 100,
        },
        {
          id: "3",
          timestamp: Date.now(),
          toolName: "C",
          toolArgs: {},
          argsHash: "3",
          result: "success",
          durationMs: 100,
        },
        {
          id: "4",
          timestamp: Date.now(),
          toolName: "A",
          toolArgs: {},
          argsHash: "4",
          result: "success",
          durationMs: 100,
        },
        {
          id: "5",
          timestamp: Date.now(),
          toolName: "B",
          toolArgs: {},
          argsHash: "5",
          result: "success",
          durationMs: 100,
        },
        {
          id: "6",
          timestamp: Date.now(),
          toolName: "C",
          toolArgs: {},
          argsHash: "6",
          result: "success",
          durationMs: 100,
        },
      ];

      const cycles = detectPatternCycles(history, 3, 3);
      expect(cycles).toHaveLength(1);
      expect(cycles[0].pattern).toEqual(["A", "B", "C"]);
      expect(cycles[0].repetitions).toBe(2);
    });

    it("should not detect cycle when pattern doesn't repeat", () => {
      const history: ExecutionHistoryEntry[] = [
        {
          id: "1",
          timestamp: Date.now(),
          toolName: "A",
          toolArgs: {},
          argsHash: "1",
          result: "success",
          durationMs: 100,
        },
        {
          id: "2",
          timestamp: Date.now(),
          toolName: "B",
          toolArgs: {},
          argsHash: "2",
          result: "success",
          durationMs: 100,
        },
        {
          id: "3",
          timestamp: Date.now(),
          toolName: "C",
          toolArgs: {},
          argsHash: "3",
          result: "success",
          durationMs: 100,
        },
        {
          id: "4",
          timestamp: Date.now(),
          toolName: "D",
          toolArgs: {},
          argsHash: "4",
          result: "success",
          durationMs: 100,
        },
      ];

      const cycles = detectPatternCycles(history, 2, 4);
      expect(cycles).toHaveLength(0);
    });

    it("should handle empty history", () => {
      const cycles = detectPatternCycles([], 2, 4);
      expect(cycles).toHaveLength(0);
    });

    it("should respect min and max pattern length", () => {
      const history: ExecutionHistoryEntry[] = [
        {
          id: "1",
          timestamp: Date.now(),
          toolName: "A",
          toolArgs: {},
          argsHash: "1",
          result: "success",
          durationMs: 100,
        },
        {
          id: "2",
          timestamp: Date.now(),
          toolName: "B",
          toolArgs: {},
          argsHash: "2",
          result: "success",
          durationMs: 100,
        },
        {
          id: "3",
          timestamp: Date.now(),
          toolName: "A",
          toolArgs: {},
          argsHash: "3",
          result: "success",
          durationMs: 100,
        },
        {
          id: "4",
          timestamp: Date.now(),
          toolName: "B",
          toolArgs: {},
          argsHash: "4",
          result: "success",
          durationMs: 100,
        },
      ];

      const cycles = detectPatternCycles(history, 3, 4);
      expect(cycles).toHaveLength(0);
    });
  });

  describe("detectCycle", () => {
    it("should detect exact repeat cycle", () => {
      const toolArgs = { command: "ls -la" };
      const argsHash = hashToolArgs(toolArgs);
      const state: LoopDetectionState = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        executionHistory: [
          {
            id: "1",
            timestamp: Date.now() - 10000,
            toolName: "shell",
            toolArgs,
            argsHash,
            result: "success" as const,
            durationMs: 100,
          },
          {
            id: "2",
            timestamp: Date.now() - 5000,
            toolName: "shell",
            toolArgs,
            argsHash,
            result: "success" as const,
            durationMs: 100,
          },
        ],
      };

      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        exactMatchThreshold: 2,
      };

      const result = detectCycle("shell", toolArgs, state, config);
      expect(result.isLoop).toBe(true);
    });

    it("should not detect loop when below threshold", () => {
      const state: LoopDetectionState = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        executionHistory: [
          {
            id: "1",
            timestamp: Date.now() - 10000,
            toolName: "shell",
            toolArgs: { command: "ls -la" },
            argsHash: "abc123",
            result: "success",
            durationMs: 100,
          },
        ],
      };

      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        exactMatchThreshold: 2,
      };

      const result = detectCycle("shell", { command: "ls -la" }, state, config);
      expect(result.isLoop).toBe(false);
      expect(result.loopType).toBe(null);
      expect(result.suggestedAction).toBe("continue");
    });

    it("should detect semantic similarity loop", () => {
      const state: LoopDetectionState = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        executionHistory: [
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
            toolArgs: { command: "ls -la" },
            argsHash: "abc123",
            result: "success",
            durationMs: 100,
          },
        ],
      };

      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        semanticSimilarityEnabled: true,
        semanticSimilarityThreshold: 0.8,
        semanticMatchThreshold: 2,
      };

      const result = detectCycle("shell", { command: "ls -la" }, state, config);
      expect(result.isLoop).toBe(true);
      expect(result.loopType).toBe("semantic");
    });

    it("should detect pattern cycle", () => {
      const state: LoopDetectionState = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        executionHistory: [
          {
            id: "1",
            timestamp: Date.now(),
            toolName: "A",
            toolArgs: {},
            argsHash: "1",
            result: "success",
            durationMs: 100,
          },
          {
            id: "2",
            timestamp: Date.now(),
            toolName: "B",
            toolArgs: {},
            argsHash: "2",
            result: "success",
            durationMs: 100,
          },
          {
            id: "3",
            timestamp: Date.now(),
            toolName: "A",
            toolArgs: {},
            argsHash: "3",
            result: "success",
            durationMs: 100,
          },
          {
            id: "4",
            timestamp: Date.now(),
            toolName: "B",
            toolArgs: {},
            argsHash: "4",
            result: "success",
            durationMs: 100,
          },
        ],
      };

      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        patternDetectionEnabled: true,
        minPatternLength: 2,
        maxPatternLength: 4,
        patternRepetitionThreshold: 2,
      };

      const result = detectCycle("A", {}, state, config);
      expect(result.isLoop).toBe(true);
      expect(result.loopType).toBe("pattern");
    });

    it("should return no loop when all checks pass", () => {
      const state: LoopDetectionState = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        executionHistory: [
          {
            id: "1",
            timestamp: Date.now() - 10000,
            toolName: "shell",
            toolArgs: { command: "ls -la" },
            argsHash: "abc123",
            result: "success",
            durationMs: 100,
          },
        ],
      };

      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        exactMatchThreshold: 2,
        semanticSimilarityEnabled: false,
        patternDetectionEnabled: false,
      };

      const result = detectCycle("shell", { command: "pwd" }, state, config);
      expect(result.isLoop).toBe(false);
      expect(result.suggestedAction).toBe("continue");
    });
  });

  describe("shouldEscalate", () => {
    it("should escalate when degradation level is high", () => {
      const state: LoopDetectionState = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        degradationLevel: 3,
        lastStrategySwitch: Date.now() - 100000,
      };

      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        autoEscalationEnabled: true,
      };

      const result = shouldEscalate(state, config);
      expect(result).toBe(true);
    });

    it("should not escalate when auto-escalation is disabled", () => {
      const state: LoopDetectionState = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        degradationLevel: 3,
      };

      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        autoEscalationEnabled: false,
      };

      const result = shouldEscalate(state, config);
      expect(result).toBe(false);
    });

    it("should escalate when consecutive errors exceed threshold", () => {
      const state: LoopDetectionState = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        consecutiveErrorCount: 15,
        lastStrategySwitch: Date.now() - 100000,
      };

      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        autoEscalationEnabled: true,
      };

      const result = shouldEscalate(state, config);
      expect(result).toBe(true);
    });

    it("should not escalate when cooldown period is active", () => {
      const state: LoopDetectionState = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        degradationLevel: 2,
        lastStrategySwitch: Date.now() - 1000,
      };

      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        autoEscalationEnabled: true,
        escalationCooldownMs: 60000,
      };

      const result = shouldEscalate(state, config);
      expect(result).toBe(false);
    });
  });

  describe("getToolConfig", () => {
    it("should return tool-specific config when available", () => {
      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        toolSpecificConfig: {
          shell: {
            exactMatchThreshold: 1,
            semanticMatchThreshold: 2,
            allowedConsecutiveErrors: 5,
          },
        },
      };

      const toolConfig = getToolConfig("shell", config);
      expect(toolConfig.exactMatchThreshold).toBe(1);
      expect(toolConfig.semanticMatchThreshold).toBe(2);
      expect(toolConfig.allowedConsecutiveErrors).toBe(5);
    });

    it("should return default config when no tool-specific config", () => {
      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        exactMatchThreshold: 3,
        semanticMatchThreshold: 5,
      };

      const toolConfig = getToolConfig("unknown_tool", config);
      expect(toolConfig.exactMatchThreshold).toBe(3);
      expect(toolConfig.semanticMatchThreshold).toBe(5);
      expect(toolConfig.allowedConsecutiveErrors).toBe(10);
    });

    it("should merge tool-specific and default config", () => {
      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        exactMatchThreshold: 3,
        semanticMatchThreshold: 5,
        toolSpecificConfig: {
          shell: {
            exactMatchThreshold: 1,
          },
        },
      };

      const toolConfig = getToolConfig("shell", config);
      expect(toolConfig.exactMatchThreshold).toBe(1);
      expect(toolConfig.semanticMatchThreshold).toBe(5);
      expect(toolConfig.allowedConsecutiveErrors).toBe(10);
    });
  });

  describe("detectExactRepeatCycle", () => {
    it("should detect exact repeat cycle", () => {
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
          toolArgs: { command: "ls -la" },
          argsHash: "abc123",
          result: "success",
          durationMs: 100,
        },
      ];

      const config = {
        maxIdenticalCalls: 2,
        maxSimilarCalls: 5,
        timeWindowMs: 60000,
        similarityThreshold: 0.85,
        maxConsecutiveErrors: 3,
      };

      const result = detectExactRepeatCycle(history, "shell", "abc123", config);
      expect(result.detected).toBe(true);
      expect(result.type).toBe("exact_repeat");
      expect(result.count).toBe(2);
      expect(result.toolName).toBe("shell");
    });

    it("should not detect when below threshold", () => {
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
      ];

      const config = {
        maxIdenticalCalls: 2,
        maxSimilarCalls: 5,
        timeWindowMs: 60000,
        similarityThreshold: 0.85,
        maxConsecutiveErrors: 3,
      };

      const result = detectExactRepeatCycle(history, "shell", "abc123", config);
      expect(result.detected).toBe(false);
      expect(result.type).toBe("none");
      expect(result.count).toBe(1);
    });
  });

  describe("detectErrorCycle", () => {
    it("should detect consecutive error cycle", () => {
      const history: ExecutionHistoryEntry[] = [
        {
          id: "1",
          timestamp: Date.now() - 10000,
          toolName: "shell",
          toolArgs: { command: "ls -la" },
          argsHash: "abc123",
          result: "error",
          durationMs: 100,
          errorMessage: "Command failed",
        },
        {
          id: "2",
          timestamp: Date.now() - 5000,
          toolName: "shell",
          toolArgs: { command: "pwd" },
          argsHash: "def456",
          result: "error",
          durationMs: 100,
          errorMessage: "Command failed",
        },
      ];

      const toolErrorCounts = { shell: 2 };
      const config = {
        maxIdenticalCalls: 3,
        maxSimilarCalls: 5,
        timeWindowMs: 60000,
        similarityThreshold: 0.85,
        maxConsecutiveErrors: 2,
      };

      const result = detectErrorCycle(history, toolErrorCounts, config);
      expect(result.detected).toBe(true);
      expect(result.type).toBe("error_cycle");
      expect(result.count).toBe(2);
      expect(result.toolName).toBe("shell");
    });

    it("should detect tool-specific error cycle", () => {
      const history: ExecutionHistoryEntry[] = [
        {
          id: "1",
          timestamp: Date.now() - 10000,
          toolName: "shell",
          toolArgs: { command: "ls -la" },
          argsHash: "abc123",
          result: "error",
          durationMs: 100,
          errorMessage: "Command failed",
        },
        {
          id: "2",
          timestamp: Date.now() - 5000,
          toolName: "shell",
          toolArgs: { command: "pwd" },
          argsHash: "def456",
          result: "error",
          durationMs: 100,
          errorMessage: "Command failed",
        },
      ];

      const toolErrorCounts = { shell: 3 };
      const config = {
        maxIdenticalCalls: 3,
        maxSimilarCalls: 5,
        timeWindowMs: 60000,
        similarityThreshold: 0.85,
        maxConsecutiveErrors: 5,
        toolOverrides: {
          shell: {
            maxConsecutiveErrors: 2,
          },
        },
      };

      const result = detectErrorCycle(history, toolErrorCounts, config);
      expect(result.detected).toBe(true);
      expect(result.type).toBe("error_cycle");
      expect(result.count).toBe(3);
      expect(result.toolName).toBe("shell");
    });

    it("should not detect when below threshold", () => {
      const history: ExecutionHistoryEntry[] = [
        {
          id: "1",
          timestamp: Date.now() - 10000,
          toolName: "shell",
          toolArgs: { command: "ls -la" },
          argsHash: "abc123",
          result: "error",
          durationMs: 100,
          errorMessage: "Command failed",
        },
      ];

      const toolErrorCounts = { shell: 1 };
      const config = {
        maxIdenticalCalls: 3,
        maxSimilarCalls: 5,
        timeWindowMs: 60000,
        similarityThreshold: 0.85,
        maxConsecutiveErrors: 3,
      };

      const result = detectErrorCycle(history, toolErrorCounts, config);
      expect(result.detected).toBe(false);
      expect(result.type).toBe("none");
      expect(result.count).toBe(1);
    });
  });

  describe("detectCycles", () => {
    it("should detect exact repeat cycle", () => {
      const state: LoopDetectionState = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        executionHistory: [
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
            toolArgs: { command: "ls -la" },
            argsHash: "abc123",
            result: "success",
            durationMs: 100,
          },
        ],
      };

      const config = {
        maxIdenticalCalls: 2,
        maxSimilarCalls: 5,
        timeWindowMs: 60000,
        similarityThreshold: 0.85,
        maxConsecutiveErrors: 3,
      };

      const result = detectCycles(state, "shell", "abc123", config);
      expect(result.loopDetected).toBe(true);
      expect(result.patterns).toHaveLength(1);
      expect(result.patterns[0].type).toBe("exact_repeat");
      expect(result.recommendedAction).toBe("escalate");
    });

    it("should detect error cycle", () => {
      const state: LoopDetectionState = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        executionHistory: [
          {
            id: "1",
            timestamp: Date.now() - 10000,
            toolName: "shell",
            toolArgs: { command: "ls -la" },
            argsHash: "abc123",
            result: "error",
            durationMs: 100,
            errorMessage: "Command failed",
          },
          {
            id: "2",
            timestamp: Date.now() - 5000,
            toolName: "shell",
            toolArgs: { command: "pwd" },
            argsHash: "def456",
            result: "error",
            durationMs: 100,
            errorMessage: "Command failed",
          },
        ],
        toolSpecificErrorCounts: { shell: 2 },
      };

      const config = {
        maxIdenticalCalls: 3,
        maxSimilarCalls: 5,
        timeWindowMs: 60000,
        similarityThreshold: 0.85,
        maxConsecutiveErrors: 2,
      };

      const result = detectCycles(state, "shell", "abc123", config);
      expect(result.loopDetected).toBe(true);
      expect(result.patterns).toHaveLength(1);
      expect(result.patterns[0].type).toBe("error_cycle");
      expect(result.recommendedAction).toBe("escalate");
    });

    it("should not detect loop when no patterns found", () => {
      const state: LoopDetectionState = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        executionHistory: [
          {
            id: "1",
            timestamp: Date.now() - 10000,
            toolName: "shell",
            toolArgs: { command: "ls -la" },
            argsHash: "abc123",
            result: "success",
            durationMs: 100,
          },
        ],
      };

      const config = {
        maxIdenticalCalls: 2,
        maxSimilarCalls: 5,
        timeWindowMs: 60000,
        similarityThreshold: 0.85,
        maxConsecutiveErrors: 3,
      };

      const result = detectCycles(state, "shell", "def456", config);
      expect(result.loopDetected).toBe(false);
      expect(result.patterns).toHaveLength(0);
      expect(result.recommendedAction).toBe("continue");
    });

    it("should generate suggestions for detected loops", () => {
      const state: LoopDetectionState = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        executionHistory: [
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
            toolArgs: { command: "ls -la" },
            argsHash: "abc123",
            result: "success",
            durationMs: 100,
          },
        ],
      };

      const config = {
        maxIdenticalCalls: 2,
        maxSimilarCalls: 5,
        timeWindowMs: 60000,
        similarityThreshold: 0.85,
        maxConsecutiveErrors: 3,
      };

      const result = detectCycles(state, "shell", "abc123", config);
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions!.length).toBeGreaterThan(0);
    });
  });

  describe("updateLoopDetectionState", () => {
    it("should add successful execution to history", () => {
      const state: LoopDetectionState = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        executionHistory: [],
      };

      const entry: ExecutionHistoryEntry = {
        id: "1",
        timestamp: Date.now(),
        toolName: "shell",
        toolArgs: { command: "ls -la" },
        argsHash: "abc123",
        result: "success",
        durationMs: 100,
      };

      const config = {
        maxIdenticalCalls: 3,
        maxSimilarCalls: 5,
        timeWindowMs: 60000,
        similarityThreshold: 0.85,
        maxConsecutiveErrors: 3,
      };

      const updatedState = updateLoopDetectionState(state, entry, config);
      expect(updatedState.executionHistory).toHaveLength(1);
      expect(updatedState.consecutiveErrorCount).toBe(0);
      expect(updatedState.toolSpecificErrorCounts.shell).toBe(0);
    });

    it("should add error execution to history and update error counts", () => {
      const state: LoopDetectionState = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        executionHistory: [],
      };

      const entry: ExecutionHistoryEntry = {
        id: "1",
        timestamp: Date.now(),
        toolName: "shell",
        toolArgs: { command: "ls -la" },
        argsHash: "abc123",
        result: "error",
        durationMs: 100,
        errorMessage: "Command failed",
      };

      const config = {
        maxIdenticalCalls: 3,
        maxSimilarCalls: 5,
        timeWindowMs: 60000,
        similarityThreshold: 0.85,
        maxConsecutiveErrors: 3,
      };

      const updatedState = updateLoopDetectionState(state, entry, config);
      expect(updatedState.executionHistory).toHaveLength(1);
      expect(updatedState.consecutiveErrorCount).toBe(1);
      expect(updatedState.toolSpecificErrorCounts.shell).toBe(1);
    });

    it("should reset consecutive error count on success", () => {
      const state: LoopDetectionState = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        executionHistory: [],
        consecutiveErrorCount: 3,
      };

      const entry: ExecutionHistoryEntry = {
        id: "1",
        timestamp: Date.now(),
        toolName: "shell",
        toolArgs: { command: "ls -la" },
        argsHash: "abc123",
        result: "success",
        durationMs: 100,
      };

      const config = {
        maxIdenticalCalls: 3,
        maxSimilarCalls: 5,
        timeWindowMs: 60000,
        similarityThreshold: 0.85,
        maxConsecutiveErrors: 3,
      };

      const updatedState = updateLoopDetectionState(state, entry, config);
      expect(updatedState.consecutiveErrorCount).toBe(0);
    });

    it("should track similar action count", () => {
      const state: LoopDetectionState = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        executionHistory: [
          {
            id: "1",
            timestamp: Date.now() - 10000,
            toolName: "shell",
            toolArgs: { command: "ls -la" },
            argsHash: "abc123",
            result: "success",
            durationMs: 100,
          },
        ],
      };

      const entry: ExecutionHistoryEntry = {
        id: "2",
        timestamp: Date.now(),
        toolName: "shell",
        toolArgs: { command: "ls -la" },
        argsHash: "abc123",
        result: "success",
        durationMs: 100,
      };

      const config = {
        maxIdenticalCalls: 3,
        maxSimilarCalls: 5,
        timeWindowMs: 60000,
        similarityThreshold: 0.85,
        maxConsecutiveErrors: 3,
      };

      const updatedState = updateLoopDetectionState(state, entry, config);
      expect(updatedState.similarActionCount).toBe(1);
    });
  });
});
