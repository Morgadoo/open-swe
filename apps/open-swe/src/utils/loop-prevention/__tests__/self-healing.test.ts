/**
 * Tests for self-healing module
 */

import {
  registerRecoveryStrategy,
  unregisterRecoveryStrategy,
  getAllRecoveryStrategies,
  clearRecoveryStrategies,
  getRecoveryStrategies,
  isRecoverable,
  attemptRecovery,
  createInitialHealthMetrics,
  updateHealthMetrics,
  addErrorToMetrics,
  getHealthStatus,
  needsPreventiveAction,
  resetAllRecoveryAttempts,
  getRecoveryStatistics,
  registerBuiltInStrategies,
  FILE_NOT_FOUND_STRATEGY,
} from "../self-healing.js";
import {
  DEFAULT_LOOP_PREVENTION_CONFIG,
  DEFAULT_LOOP_DETECTION_STATE,
} from "@openswe/shared/open-swe/loop-prevention/types";
import type { RecoveryStrategy, ErrorContext } from "../self-healing.js";

describe("SelfHealing", () => {
  beforeEach(() => {
    clearRecoveryStrategies();
    resetAllRecoveryAttempts();
  });

  describe("Strategy Registration", () => {
    it("should register and unregister strategies", () => {
      const strategy: RecoveryStrategy = {
        id: "test-strategy",
        name: "Test Strategy",
        description: "Test",
        errorPatterns: [{ type: "exact", value: "error" }],
        priority: 1,
        maxAttempts: 3,
        cooldownMs: 0,
        action: { type: "retry", delayMs: 0 },
      };

      registerRecoveryStrategy(strategy);
      expect(getAllRecoveryStrategies()).toContain(strategy);

      const removed = unregisterRecoveryStrategy("test-strategy");
      expect(removed).toBe(true);
      expect(getAllRecoveryStrategies()).not.toContain(strategy);
    });

    it("should clear all strategies", () => {
      registerBuiltInStrategies();
      expect(getAllRecoveryStrategies().length).toBeGreaterThan(0);

      clearRecoveryStrategies();
      expect(getAllRecoveryStrategies()).toHaveLength(0);
    });
  });

  describe("getRecoveryStrategies", () => {
    it("should find strategies matching error message", () => {
      const strategy: RecoveryStrategy = {
        id: "test-strategy",
        name: "Test Strategy",
        description: "Test",
        errorPatterns: [{ type: "contains", value: "not found" }],
        priority: 1,
        maxAttempts: 3,
        cooldownMs: 0,
        action: { type: "retry", delayMs: 0 },
      };
      registerRecoveryStrategy(strategy);

      const error: ErrorContext = {
        message: "File not found: test.txt",
        timestamp: Date.now(),
      };

      const found = getRecoveryStrategies(error);
      expect(found).toContain(strategy);
    });

    it("should sort strategies by priority", () => {
      const low: RecoveryStrategy = {
        id: "low",
        name: "Low",
        description: "Test",
        errorPatterns: [{ type: "contains", value: "error" }],
        priority: 10,
        maxAttempts: 3,
        cooldownMs: 0,
        action: { type: "retry", delayMs: 0 },
      };
      const high: RecoveryStrategy = {
        id: "high",
        name: "High",
        description: "Test",
        errorPatterns: [{ type: "contains", value: "error" }],
        priority: 90,
        maxAttempts: 3,
        cooldownMs: 0,
        action: { type: "retry", delayMs: 0 },
      };

      registerRecoveryStrategy(low);
      registerRecoveryStrategy(high);

      const found = getRecoveryStrategies({
        message: "error",
        timestamp: Date.now(),
      });
      expect(found[0].id).toBe("high");
      expect(found[1].id).toBe("low");
    });
  });

  describe("isRecoverable", () => {
    it("should return true if matching strategy has attempts left", () => {
      registerRecoveryStrategy(FILE_NOT_FOUND_STRATEGY);
      const error: ErrorContext = {
        message: "file not found",
        timestamp: Date.now(),
      };

      expect(isRecoverable(error, 0)).toBe(true);
    });

    it("should return false if no matching strategy", () => {
      const error: ErrorContext = {
        message: "unknown error",
        timestamp: Date.now(),
      };

      expect(isRecoverable(error, 0)).toBe(false);
    });
  });

  describe("attemptRecovery", () => {
    it("should track attempts and return recovery action", () => {
      registerRecoveryStrategy(FILE_NOT_FOUND_STRATEGY);
      const error: ErrorContext = {
        message: "file not found",
        timestamp: Date.now(),
      };

      const result = attemptRecovery(
        error,
        DEFAULT_LOOP_DETECTION_STATE,
        DEFAULT_LOOP_PREVENTION_CONFIG,
      );

      expect(result.success).toBe(true);
      expect(result.strategyUsed).toBe(FILE_NOT_FOUND_STRATEGY.id);
      expect(result.action?.type).toBe("alternative_tool");

      const stats = getRecoveryStatistics();
      expect(stats.totalAttempts).toBe(1);
    });

    it("should respect max attempts", () => {
      const strategy: RecoveryStrategy = {
        id: "test",
        name: "Test",
        description: "Test",
        errorPatterns: [{ type: "contains", value: "error" }],
        priority: 1,
        maxAttempts: 1,
        cooldownMs: 0,
        action: { type: "retry", delayMs: 0 },
      };
      registerRecoveryStrategy(strategy);
      const error: ErrorContext = { message: "error", timestamp: Date.now() };

      // First attempt
      attemptRecovery(
        error,
        DEFAULT_LOOP_DETECTION_STATE,
        DEFAULT_LOOP_PREVENTION_CONFIG,
      );

      // Second attempt should fail
      const result = attemptRecovery(
        error,
        DEFAULT_LOOP_DETECTION_STATE,
        DEFAULT_LOOP_PREVENTION_CONFIG,
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain("exhausted");
    });
  });

  describe("Health Metrics", () => {
    it("should update metrics on success", () => {
      let metrics = createInitialHealthMetrics();
      metrics = updateHealthMetrics(metrics, "success", 100);

      expect(metrics.totalActions).toBe(1);
      expect(metrics.successfulActions).toBe(1);
      expect(metrics.averageDurationMs).toBe(100);
      expect(metrics.recentSuccessRate).toBe(1);
    });

    it("should update metrics on error", () => {
      let metrics = createInitialHealthMetrics();
      metrics = updateHealthMetrics(metrics, "error", 200);

      expect(metrics.totalActions).toBe(1);
      expect(metrics.failedActions).toBe(1);
      expect(metrics.recentSuccessRate).toBe(0);
    });

    it("should track recent errors", () => {
      let metrics = createInitialHealthMetrics();
      metrics = addErrorToMetrics(metrics, "Error 1");
      metrics = addErrorToMetrics(metrics, "Error 2");

      expect(metrics.recentErrors).toEqual(["Error 1", "Error 2"]);
    });
  });

  describe("getHealthStatus", () => {
    it("should return healthy for clean state", () => {
      const status = getHealthStatus(
        DEFAULT_LOOP_DETECTION_STATE,
        DEFAULT_LOOP_PREVENTION_CONFIG,
      );
      expect(status.status).toBe("healthy");
      expect(status.score).toBe(100);
    });

    it("should return unhealthy for high error rate", () => {
      const history = [];
      for (let i = 0; i < 10; i++) {
        history.push({
          id: `${i}`,
          timestamp: Date.now(),
          toolName: "shell",
          toolArgs: {},
          argsHash: "h",
          result: "error" as const,
          durationMs: 100,
          errorMessage: "Error",
        });
      }
      const state = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        executionHistory: history,
      };
      const status = getHealthStatus(state, DEFAULT_LOOP_PREVENTION_CONFIG);

      expect(status.status).toBe("critical");
      expect(status.issues.some((i) => i.type === "high_error_rate")).toBe(
        true,
      );
    });
  });

  describe("needsPreventiveAction", () => {
    it("should recommend slow_down for unhealthy status", () => {
      const metrics = createInitialHealthMetrics();
      metrics.recentSuccessRate = 0.5;
      const health = {
        status: "unhealthy" as const,
        score: 50,
        metrics,
        issues: [],
        recommendations: [],
      };

      const action = needsPreventiveAction(health);
      expect(action?.type).toBe("slow_down");
    });

    it("should recommend request_review for critical status", () => {
      const health = {
        status: "critical" as const,
        score: 20,
        metrics: createInitialHealthMetrics(),
        issues: [],
        recommendations: [],
      };

      const action = needsPreventiveAction(health);
      expect(action?.type).toBe("request_review");
    });
  });
});
