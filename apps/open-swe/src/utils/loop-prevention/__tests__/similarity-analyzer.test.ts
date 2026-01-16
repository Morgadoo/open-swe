/**
 * Tests for similarity-analyzer module
 */

import {
  normalizeArgs,
  calculateArgsSimilarity,
  findSimilarEntries,
  detectOscillationPattern,
  detectGradualChangePattern,
  detectSimilarityBasedLoop,
  checkForSimilarActions,
} from "../similarity-analyzer.js";
import type { ExecutionHistoryEntry, LoopDetectionConfig } from "../types.js";

describe("SimilarityAnalyzer", () => {
  describe("normalizeArgs", () => {
    it("should normalize string values to lowercase and trim", () => {
      const args = { path: "  /path/to/file.txt  " };
      const normalized = normalizeArgs(args);
      expect(normalized.path).toBe("/path/to/file.txt");
    });

    it("should sort array values", () => {
      const args = { items: ["c", "a", "b"] };
      const normalized = normalizeArgs(args);
      expect(normalized.items).toEqual(["a", "b", "c"]);
    });

    it("should handle nested objects", () => {
      const args = { config: { nested: { value: "  TEST  " } } };
      const normalized = normalizeArgs(args) as any;
      expect(normalized.config.nested.value).toBe("test");
    });

    it("should handle null and undefined values", () => {
      const args = { a: null, b: undefined, c: "test" };
      const normalized = normalizeArgs(args);
      expect(normalized.a).toBe(null);
      expect(normalized.b).toBe(null);
      expect(normalized.c).toBe("test");
    });

    it("should sort keys alphabetically", () => {
      const args = { z: 1, a: 2, m: 3 };
      const normalized = normalizeArgs(args);
      expect(Object.keys(normalized)).toEqual(["a", "m", "z"]);
    });
  });

  describe("calculateArgsSimilarity", () => {
    it("should return 1 for identical arguments", () => {
      const args1 = { path: "/test/file.txt", line: 10 };
      const args2 = { path: "/test/file.txt", line: 10 };
      const similarity = calculateArgsSimilarity(args1, args2);
      expect(similarity).toBe(1);
    });

    it("should return 0 for completely different arguments", () => {
      const args1 = { path: "/test/file.txt" };
      const args2 = { command: "ls -la" };
      const similarity = calculateArgsSimilarity(args1, args2);
      expect(similarity).toBeLessThan(0.5);
    });

    it("should handle similar string values", () => {
      const args1 = { path: "/test/file.txt" };
      const args2 = { path: "/test/file.txt" };
      const similarity = calculateArgsSimilarity(args1, args2);
      expect(similarity).toBe(1);
    });

    it("should handle similar numeric values", () => {
      const args1 = { line: 10 };
      const args2 = { line: 10 };
      const similarity = calculateArgsSimilarity(args1, args2);
      expect(similarity).toBe(1);
    });

    it("should handle similar array values", () => {
      const args1 = { items: ["a", "b", "c"] };
      const args2 = { items: ["a", "b", "c"] };
      const similarity = calculateArgsSimilarity(args1, args2);
      expect(similarity).toBe(1);
    });

    it("should handle similar object values", () => {
      const args1 = { config: { timeout: 1000 } };
      const args2 = { config: { timeout: 1000 } };
      const similarity = calculateArgsSimilarity(args1, args2);
      expect(similarity).toBe(1);
    });

    it("should handle partial matches", () => {
      const args1 = { path: "/test/file.txt", line: 10 };
      const args2 = { path: "/test/file.txt", line: 20 };
      const similarity = calculateArgsSimilarity(args1, args2);
      expect(similarity).toBeGreaterThan(0.5);
      expect(similarity).toBeLessThan(1);
    });

    it("should handle missing keys", () => {
      const args1 = { path: "/test/file.txt" };
      const args2 = { path: "/test/file.txt", line: 10 };
      const similarity = calculateArgsSimilarity(args1, args2);
      expect(similarity).toBeGreaterThan(0.5);
      expect(similarity).toBeLessThan(1);
    });

    it("should handle path similarity", () => {
      const args1 = { path: "/test/file.txt" };
      const args2 = { path: "/test/other.txt" };
      const similarity = calculateArgsSimilarity(args1, args2);
      expect(similarity).toBeGreaterThan(0.5);
    });

    it("should handle Levenshtein similarity for strings", () => {
      const args1 = { command: "ls -la" };
      const args2 = { command: "ls -l" };
      const similarity = calculateArgsSimilarity(args1, args2);
      expect(similarity).toBeGreaterThan(0.5);
    });

    it("should handle number similarity with relative difference", () => {
      const args1 = { timeout: 1000 };
      const args2 = { timeout: 1100 };
      const similarity = calculateArgsSimilarity(args1, args2);
      expect(similarity).toBeGreaterThan(0.9);
    });

    it("should handle array similarity with Jaccard", () => {
      const args1 = { items: ["a", "b", "c"] };
      const args2 = { items: ["a", "b", "d"] };
      const similarity = calculateArgsSimilarity(args1, args2);
      expect(similarity).toBeGreaterThan(0.5);
    });

    it("should handle nested object similarity", () => {
      const args1 = { config: { timeout: 1000, retries: 3 } };
      const args2 = { config: { timeout: 1000, retries: 3 } };
      const similarity = calculateArgsSimilarity(args1, args2);
      expect(similarity).toBe(1);
    });

    it("should handle different types", () => {
      const args1 = { value: "100" };
      const args2 = { value: 100 };
      const similarity = calculateArgsSimilarity(args1, args2);
      expect(similarity).toBeGreaterThan(0.5);
    });

    it("should handle null values", () => {
      const args1 = { value: null };
      const args2 = { value: null };
      const similarity = calculateArgsSimilarity(args1, args2);
      expect(similarity).toBe(1);
    });

    it("should handle mixed types", () => {
      const args1 = { a: "test", b: 123, c: true };
      const args2 = { a: "test", b: 123, c: true };
      const similarity = calculateArgsSimilarity(args1, args2);
      expect(similarity).toBe(1);
    });

    it("should handle empty objects", () => {
      const args1 = {};
      const args2 = {};
      const similarity = calculateArgsSimilarity(args1, args2);
      expect(similarity).toBe(1);
    });

    it("should handle one empty object", () => {
      const args1 = { path: "/test/file.txt" };
      const args2 = {};
      const similarity = calculateArgsSimilarity(args1, args2);
      expect(similarity).toBeLessThan(0.5);
    });

    it("should handle high-weight fields", () => {
      const args1 = { path: "/test/file.txt", line: 10 };
      const args2 = { path: "/test/file.txt", line: 20 };
      const similarity = calculateArgsSimilarity(args1, args2);
      expect(similarity).toBeGreaterThan(0.7);
    });

    it("should handle tool-specific similarity", () => {
      const args1 = { command: "ls -la" };
      const args2 = { command: "ls -l" };
      const similarity = calculateArgsSimilarity(args1, args2, "shell");
      expect(similarity).toBeGreaterThan(0.5);
    });
  });

  describe("findSimilarEntries", () => {
    it("should find similar entries in history", () => {
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
          toolArgs: { command: "ls -l" },
          argsHash: "def456",
          result: "success",
          durationMs: 100,
        },
      ];

      const similar = findSimilarEntries(
        history,
        "shell",
        { command: "ls -la" },
        0.8,
      );
      expect(similar.length).toBeGreaterThanOrEqual(1);
      expect(similar[0].entry.id).toBe("1");
      expect(similar[0].similarity).toBe(1);
    });

    it("should return empty array when no similar entries", () => {
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

      const similar = findSimilarEntries(
        history,
        "shell",
        { command: "pwd" },
        0.8,
      );
      expect(similar).toHaveLength(0);
    });

    it("should filter by tool name", () => {
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
          toolName: "read_file",
          toolArgs: { path: "/test/file.txt" },
          argsHash: "def456",
          result: "success",
          durationMs: 100,
        },
      ];

      const similar = findSimilarEntries(
        history,
        "shell",
        { command: "ls -la" },
        0.8,
      );
      expect(similar).toHaveLength(1);
      expect(similar[0].entry.toolName).toBe("shell");
    });

    it("should respect similarity threshold", () => {
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
          durationMs: 100,
        },
      ];

      const similar = findSimilarEntries(
        history,
        "shell",
        { command: "ls -la" },
        0.9,
      );
      expect(similar).toHaveLength(1);
    });

    it("should sort by similarity descending", () => {
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
          toolArgs: { command: "ls -l" },
          argsHash: "def456",
          result: "success",
          durationMs: 100,
        },
      ];

      const similar = findSimilarEntries(
        history,
        "shell",
        { command: "ls -la" },
        0.5,
      );
      expect(similar).toHaveLength(2);
      expect(similar[0].similarity).toBeGreaterThanOrEqual(
        similar[1].similarity,
      );
    });

    it("should handle empty history", () => {
      const similar = findSimilarEntries(
        [],
        "shell",
        { command: "ls -la" },
        0.8,
      );
      expect(similar).toHaveLength(0);
    });
  });

  describe("detectOscillationPattern", () => {
    it("should detect 2-tool oscillation", () => {
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

      const pattern = detectOscillationPattern(history);
      expect(pattern).not.toBeNull();
      expect(pattern!.detected).toBe(true);
      expect(pattern!.tools).toEqual(["A", "B"]);
      expect(pattern!.cycleLength).toBe(2);
      expect(pattern!.occurrences).toBe(2);
    });

    it("should detect 3-tool oscillation", () => {
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

      const pattern = detectOscillationPattern(history);
      expect(pattern).not.toBeNull();
      expect(pattern!.detected).toBe(true);
      expect(pattern!.tools).toEqual(["A", "B", "C"]);
      expect(pattern!.cycleLength).toBe(3);
      expect(pattern!.occurrences).toBe(2);
    });

    it("should not detect oscillation when pattern doesn't repeat", () => {
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

      const pattern = detectOscillationPattern(history);
      expect(pattern).toBeNull();
    });

    it("should not detect oscillation with insufficient history", () => {
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
      ];

      const pattern = detectOscillationPattern(history);
      expect(pattern).toBeNull();
    });

    it("should handle empty history", () => {
      const pattern = detectOscillationPattern([]);
      expect(pattern).toBeNull();
    });

    it("should respect window size", () => {
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
        {
          id: "5",
          timestamp: Date.now(),
          toolName: "A",
          toolArgs: {},
          argsHash: "5",
          result: "success",
          durationMs: 100,
        },
        {
          id: "6",
          timestamp: Date.now(),
          toolName: "B",
          toolArgs: {},
          argsHash: "6",
          result: "success",
          durationMs: 100,
        },
      ];

      const pattern = detectOscillationPattern(history, 4);
      expect(pattern).not.toBeNull();
      expect(pattern!.detected).toBe(true);
    });
  });

  describe("detectGradualChangePattern", () => {
    it("should detect incrementing numbers", () => {
      const history: ExecutionHistoryEntry[] = [
        {
          id: "1",
          timestamp: Date.now(),
          toolName: "shell",
          toolArgs: { timeout: 1000 },
          argsHash: "1",
          result: "success",
          durationMs: 100,
        },
        {
          id: "2",
          timestamp: Date.now(),
          toolName: "shell",
          toolArgs: { timeout: 2000 },
          argsHash: "2",
          result: "success",
          durationMs: 100,
        },
        {
          id: "3",
          timestamp: Date.now(),
          toolName: "shell",
          toolArgs: { timeout: 3000 },
          argsHash: "3",
          result: "success",
          durationMs: 100,
        },
      ];

      const pattern = detectGradualChangePattern(history, "shell");
      expect(pattern).not.toBeNull();
      expect(pattern!.detected).toBe(true);
      expect(pattern!.changingField).toBe("timeout");
      expect(pattern!.changeType).toBe("increment");
      expect(pattern!.occurrences).toBe(3);
    });

    it("should detect appending strings", () => {
      const history: ExecutionHistoryEntry[] = [
        {
          id: "1",
          timestamp: Date.now(),
          toolName: "shell",
          toolArgs: { command: "ls" },
          argsHash: "1",
          result: "success",
          durationMs: 100,
        },
        {
          id: "2",
          timestamp: Date.now(),
          toolName: "shell",
          toolArgs: { command: "ls -l" },
          argsHash: "2",
          result: "success",
          durationMs: 100,
        },
        {
          id: "3",
          timestamp: Date.now(),
          toolName: "shell",
          toolArgs: { command: "ls -la" },
          argsHash: "3",
          result: "success",
          durationMs: 100,
        },
      ];

      const pattern = detectGradualChangePattern(history, "shell");
      expect(pattern).not.toBeNull();
      expect(pattern!.detected).toBe(true);
      expect(pattern!.changingField).toBe("command");
      expect(pattern!.changeType).toBe("append");
      expect(pattern!.occurrences).toBe(3);
    });

    it("should detect modifying strings", () => {
      const history: ExecutionHistoryEntry[] = [
        {
          id: "1",
          timestamp: Date.now(),
          toolName: "shell",
          toolArgs: { command: "test1" },
          argsHash: "1",
          result: "success",
          durationMs: 100,
        },
        {
          id: "2",
          timestamp: Date.now(),
          toolName: "shell",
          toolArgs: { command: "test2" },
          argsHash: "2",
          result: "success",
          durationMs: 100,
        },
        {
          id: "3",
          timestamp: Date.now(),
          toolName: "shell",
          toolArgs: { command: "test3" },
          argsHash: "3",
          result: "success",
          durationMs: 100,
        },
      ];

      const pattern = detectGradualChangePattern(history, "shell");
      expect(pattern).not.toBeNull();
      expect(pattern!.detected).toBe(true);
      expect(pattern!.changingField).toBe("command");
      expect(pattern!.changeType).toBe("modify");
      expect(pattern!.occurrences).toBe(3);
    });

    it("should not detect when insufficient history", () => {
      const history: ExecutionHistoryEntry[] = [
        {
          id: "1",
          timestamp: Date.now(),
          toolName: "shell",
          toolArgs: { timeout: 1000 },
          argsHash: "1",
          result: "success",
          durationMs: 100,
        },
        {
          id: "2",
          timestamp: Date.now(),
          toolName: "shell",
          toolArgs: { timeout: 2000 },
          argsHash: "2",
          result: "success",
          durationMs: 100,
        },
      ];

      const pattern = detectGradualChangePattern(history, "shell");
      expect(pattern).toBeNull();
    });

    it("should not detect when no gradual change", () => {
      const history: ExecutionHistoryEntry[] = [
        {
          id: "1",
          timestamp: Date.now(),
          toolName: "shell",
          toolArgs: { timeout: 1000 },
          argsHash: "1",
          result: "success",
          durationMs: 100,
        },
        {
          id: "2",
          timestamp: Date.now(),
          toolName: "shell",
          toolArgs: { timeout: 1000 },
          argsHash: "2",
          result: "success",
          durationMs: 100,
        },
        {
          id: "3",
          timestamp: Date.now(),
          toolName: "shell",
          toolArgs: { timeout: 1000 },
          argsHash: "3",
          result: "success",
          durationMs: 100,
        },
      ];

      const pattern = detectGradualChangePattern(history, "shell");
      expect(pattern).toBeNull();
    });

    it("should handle empty history", () => {
      const pattern = detectGradualChangePattern([], "shell");
      expect(pattern).toBeNull();
    });

    it("should filter by tool name", () => {
      const history: ExecutionHistoryEntry[] = [
        {
          id: "1",
          timestamp: Date.now(),
          toolName: "shell",
          toolArgs: { timeout: 1000 },
          argsHash: "1",
          result: "success",
          durationMs: 100,
        },
        {
          id: "2",
          timestamp: Date.now(),
          toolName: "shell",
          toolArgs: { timeout: 2000 },
          argsHash: "2",
          result: "success",
          durationMs: 100,
        },
        {
          id: "3",
          timestamp: Date.now(),
          toolName: "shell",
          toolArgs: { timeout: 3000 },
          argsHash: "3",
          result: "success",
          durationMs: 100,
        },
        {
          id: "4",
          timestamp: Date.now(),
          toolName: "read_file",
          toolArgs: { timeout: 4000 },
          argsHash: "4",
          result: "success",
          durationMs: 100,
        },
      ];

      const pattern = detectGradualChangePattern(history, "shell");
      expect(pattern).not.toBeNull();
      expect(pattern!.detected).toBe(true);
      expect(pattern!.occurrences).toBe(3);
    });
  });

  describe("detectSimilarityBasedLoop", () => {
    it("should detect loop based on similar entries", () => {
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
          toolArgs: { command: "ls -l" },
          argsHash: "def456",
          result: "success",
          durationMs: 100,
        },
      ];

      const config: LoopDetectionConfig = {
        maxIdenticalCalls: 3,
        maxSimilarCalls: 2,
        timeWindowMs: 60000,
        similarityThreshold: 0.8,
        maxConsecutiveErrors: 3,
      };

      const result = detectSimilarityBasedLoop(
        history,
        "shell",
        { command: "ls -la" },
        config,
      );
      expect(result.loopDetected).toBe(true);
      expect(result.similarityScore).toBeGreaterThan(0.8);
      expect(result.similarEntries.length).toBeGreaterThanOrEqual(1);
    });

    it("should detect oscillation pattern", () => {
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

      const config: LoopDetectionConfig = {
        maxIdenticalCalls: 3,
        maxSimilarCalls: 5,
        timeWindowMs: 60000,
        similarityThreshold: 0.8,
        maxConsecutiveErrors: 3,
      };

      const result = detectSimilarityBasedLoop(history, "A", {}, config);
      expect(result.loopDetected).toBe(true);
      expect(result.patterns.oscillation).toBeDefined();
      expect(result.patterns.oscillation!.detected).toBe(true);
    });

    it("should detect gradual change pattern", () => {
      const history: ExecutionHistoryEntry[] = [
        {
          id: "1",
          timestamp: Date.now(),
          toolName: "shell",
          toolArgs: { timeout: 1000 },
          argsHash: "1",
          result: "success",
          durationMs: 100,
        },
        {
          id: "2",
          timestamp: Date.now(),
          toolName: "shell",
          toolArgs: { timeout: 2000 },
          argsHash: "2",
          result: "success",
          durationMs: 100,
        },
        {
          id: "3",
          timestamp: Date.now(),
          toolName: "shell",
          toolArgs: { timeout: 3000 },
          argsHash: "3",
          result: "success",
          durationMs: 100,
        },
        {
          id: "4",
          timestamp: Date.now(),
          toolName: "shell",
          toolArgs: { timeout: 4000 },
          argsHash: "4",
          result: "success",
          durationMs: 100,
        },
        {
          id: "5",
          timestamp: Date.now(),
          toolName: "shell",
          toolArgs: { timeout: 5000 },
          argsHash: "5",
          result: "success",
          durationMs: 100,
        },
      ];

      const config: LoopDetectionConfig = {
        maxIdenticalCalls: 3,
        maxSimilarCalls: 5,
        timeWindowMs: 60000,
        similarityThreshold: 0.8,
        maxConsecutiveErrors: 3,
      };

      const result = detectSimilarityBasedLoop(
        history,
        "shell",
        { timeout: 6000 },
        config,
      );
      expect(result.loopDetected).toBe(true);
      expect(result.patterns.gradualChange).toBeDefined();
      expect(result.patterns.gradualChange!.detected).toBe(true);
    });

    it("should not detect loop when no patterns found", () => {
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

      const config: LoopDetectionConfig = {
        maxIdenticalCalls: 3,
        maxSimilarCalls: 5,
        timeWindowMs: 60000,
        similarityThreshold: 0.8,
        maxConsecutiveErrors: 3,
      };

      const result = detectSimilarityBasedLoop(
        history,
        "shell",
        { command: "pwd" },
        config,
      );
      expect(result.loopDetected).toBe(false);
      expect(result.recommendation).toBe("continue");
    });

    it("should handle empty history", () => {
      const config: LoopDetectionConfig = {
        maxIdenticalCalls: 3,
        maxSimilarCalls: 5,
        timeWindowMs: 60000,
        similarityThreshold: 0.8,
        maxConsecutiveErrors: 3,
      };

      const result = detectSimilarityBasedLoop(
        [],
        "shell",
        { command: "ls -la" },
        config,
      );
      expect(result.loopDetected).toBe(false);
      expect(result.recommendation).toBe("continue");
    });

    it("should generate recommendations based on patterns", () => {
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

      const config: LoopDetectionConfig = {
        maxIdenticalCalls: 3,
        maxSimilarCalls: 5,
        timeWindowMs: 60000,
        similarityThreshold: 0.8,
        maxConsecutiveErrors: 3,
      };

      const result = detectSimilarityBasedLoop(history, "A", {}, config);
      expect(result.loopDetected).toBe(true);
      expect(result.recommendation).toMatch(/warn|investigate/);
    });
  });

  describe("checkForSimilarActions", () => {
    it("should return hasSimilarActions true when threshold met", () => {
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
          toolArgs: { command: "ls -l" },
          argsHash: "def456",
          result: "success",
          durationMs: 100,
        },
      ];

      const result = checkForSimilarActions(
        "shell",
        { command: "ls -la" },
        history,
        { similarityThreshold: 0.8, lookbackWindow: 10, matchThreshold: 2 },
      );
      expect(result.hasSimilarActions).toBe(true);
      expect(result.similarCount).toBeGreaterThanOrEqual(1);
      expect(result.highestSimilarity).toBe(1);
    });

    it("should return hasSimilarActions false when below threshold", () => {
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

      const result = checkForSimilarActions(
        "shell",
        { command: "pwd" },
        history,
        { similarityThreshold: 0.8, lookbackWindow: 10, matchThreshold: 2 },
      );
      expect(result.hasSimilarActions).toBe(false);
      expect(result.similarCount).toBe(0);
    });

    it("should respect lookback window", () => {
      const history: ExecutionHistoryEntry[] = [
        {
          id: "1",
          timestamp: Date.now() - 100000,
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

      const result = checkForSimilarActions(
        "shell",
        { command: "ls -la" },
        history,
        { similarityThreshold: 0.8, lookbackWindow: 5, matchThreshold: 2 },
      );
      expect(result.hasSimilarActions).toBe(true);
      expect(result.similarCount).toBeGreaterThanOrEqual(1);
    });

    it("should handle empty history", () => {
      const result = checkForSimilarActions(
        "shell",
        { command: "ls -la" },
        [],
        { similarityThreshold: 0.8, lookbackWindow: 10, matchThreshold: 2 },
      );
      expect(result.hasSimilarActions).toBe(false);
      expect(result.similarCount).toBe(0);
      expect(result.highestSimilarity).toBe(0);
    });

    it("should return top 5 similar entries", () => {
      const history: ExecutionHistoryEntry[] = [
        {
          id: "1",
          timestamp: Date.now(),
          toolName: "shell",
          toolArgs: { command: "ls -la" },
          argsHash: "1",
          result: "success",
          durationMs: 100,
        },
        {
          id: "2",
          timestamp: Date.now(),
          toolName: "shell",
          toolArgs: { command: "ls -l" },
          argsHash: "2",
          result: "success",
          durationMs: 100,
        },
        {
          id: "3",
          timestamp: Date.now(),
          toolName: "shell",
          toolArgs: { command: "ls -la" },
          argsHash: "3",
          result: "success",
          durationMs: 100,
        },
        {
          id: "4",
          timestamp: Date.now(),
          toolName: "shell",
          toolArgs: { command: "ls -l" },
          argsHash: "4",
          result: "success",
          durationMs: 100,
        },
        {
          id: "5",
          timestamp: Date.now(),
          toolName: "shell",
          toolArgs: { command: "ls -la" },
          argsHash: "5",
          result: "success",
          durationMs: 100,
        },
        {
          id: "6",
          timestamp: Date.now(),
          toolName: "shell",
          toolArgs: { command: "ls -l" },
          argsHash: "6",
          result: "success",
          durationMs: 100,
        },
      ];

      const result = checkForSimilarActions(
        "shell",
        { command: "ls -la" },
        history,
        { similarityThreshold: 0.8, lookbackWindow: 10, matchThreshold: 2 },
      );
      expect(result.similarEntries).toHaveLength(5);
    });
  });
});
