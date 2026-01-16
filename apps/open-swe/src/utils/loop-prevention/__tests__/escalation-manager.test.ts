/**
 * Tests for escalation-manager module
 */

import { jest } from "@jest/globals";

import {
  shouldEscalate,
  createEscalationRequest,
  generateIssueSummary,
  getFallbackStrategy,
  formatGitHubEscalation,
  createEscalationTracker,
  updateEscalationStatus,
  isEscalationResolved,
  hasEscalationTimedOut,
  getEscalationRemainingTime,
} from "../escalation-manager.js";
import {
  DEFAULT_LOOP_PREVENTION_CONFIG,
  DEFAULT_LOOP_DETECTION_STATE,
} from "@openswe/shared/open-swe/loop-prevention/types";
import { DegradationLevel } from "../types.js";
import type {
  LoopDetectionState,
  LoopPreventionConfig,
} from "@openswe/shared/open-swe/loop-prevention/types";
import type { EscalationContext } from "../escalation-manager.js";

// Mock uuid
jest.mock("uuid", () => ({
  v4: () => "test-uuid",
}));

describe("EscalationManager", () => {
  describe("shouldEscalate", () => {
    it("should not escalate when auto-escalation is disabled", () => {
      const state = { ...DEFAULT_LOOP_DETECTION_STATE };
      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        autoEscalationEnabled: false,
      };

      const result = shouldEscalate(state, DegradationLevel.HALTED, config);

      expect(result.shouldEscalate).toBe(false);
      expect(result.reason).toContain("disabled");
    });

    it("should escalate at HALTED degradation level", () => {
      const state = { ...DEFAULT_LOOP_DETECTION_STATE };
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const result = shouldEscalate(state, DegradationLevel.HALTED, config);

      expect(result.shouldEscalate).toBe(true);
      expect(result.priority).toBe("critical");
      expect(result.triggers.some((t) => t.type === "degradation_level")).toBe(
        true,
      );
    });

    it("should escalate when stuck for too long", () => {
      const now = Date.now();
      const state: LoopDetectionState = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        executionHistory: [
          {
            id: "1",
            timestamp: now - 2000000, // 33 minutes ago
            toolName: "shell",
            toolArgs: { command: "ls" },
            argsHash: "hash",
            result: "success" as const,
            durationMs: 100,
          },
          {
            id: "2",
            timestamp: now - 1900000, // 31 minutes ago
            toolName: "shell",
            toolArgs: { command: "pwd" },
            argsHash: "hash2",
            result: "error" as const,
            durationMs: 100,
          },
        ],
      };
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const result = shouldEscalate(state, DegradationLevel.NORMAL, config);

      expect(result.shouldEscalate).toBe(true);
      expect(result.priority).toBe("critical");
      expect(result.triggers.some((t) => t.type === "time_stuck")).toBe(true);
    });

    it("should escalate with many consecutive errors", () => {
      const state = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        consecutiveErrorCount: 15,
      };
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const result = shouldEscalate(state, DegradationLevel.NORMAL, config);

      expect(result.shouldEscalate).toBe(true);
      expect(result.priority).toBe("critical");
      expect(result.triggers.some((t) => t.type === "error_pattern")).toBe(
        true,
      );
    });

    it("should escalate when loop is detected many times", () => {
      const state = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        similarActionCount: 15,
      };
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const result = shouldEscalate(state, DegradationLevel.NORMAL, config);

      expect(result.shouldEscalate).toBe(true);
      expect(result.priority).toBe("critical");
      expect(result.triggers.some((t) => t.type === "loop_detected")).toBe(
        true,
      );
    });

    it("should escalate with multiple medium triggers", () => {
      const state = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        consecutiveErrorCount: 8, // medium
        similarActionCount: 8, // medium
      };
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const result = shouldEscalate(state, DegradationLevel.NORMAL, config);

      expect(result.shouldEscalate).toBe(true);
      expect(result.priority).toBe("medium");
      expect(result.triggers.length).toBeGreaterThanOrEqual(2);
    });

    it("should not escalate with single low trigger", () => {
      const state = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        consecutiveErrorCount: 5, // low
      };
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const result = shouldEscalate(state, DegradationLevel.NORMAL, config);

      expect(result.shouldEscalate).toBe(false);
      expect(result.priority).toBe("low");
    });
  });

  describe("createEscalationRequest", () => {
    it("should create a complete request", () => {
      const state = { ...DEFAULT_LOOP_DETECTION_STATE };
      const context: EscalationContext = {
        taskDescription: "Fix bug",
        currentStep: "Running tests",
        attemptedActions: ["shell", "read_file"],
        errorMessages: ["Test failed"],
        filesModified: ["src/app.ts"],
        timeElapsedMs: 10000,
      };

      const request = createEscalationRequest(state, context, "high");

      expect(request.id).toEqual(expect.any(String));
      expect(request.priority).toBe("high");
      expect(request.context).toEqual(context);
      expect(request.summary.title).toBeDefined();
      expect(request.suggestedActions.length).toBeGreaterThan(0);
      expect(request.timestamp).toBeLessThanOrEqual(Date.now());
      expect(request.expiresAt).toBeGreaterThan(request.timestamp);
    });
  });

  describe("generateIssueSummary", () => {
    it("should generate summary for halted agent", () => {
      const state = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        degradationLevel: 4 as any,
      };
      const summary = generateIssueSummary(state, [], []);

      expect(summary.title).toContain("Halted");
      expect(summary.description).toContain("Halted");
    });

    it("should generate summary for error cycle", () => {
      const state = { ...DEFAULT_LOOP_DETECTION_STATE };
      const patterns = [
        {
          type: "error_cycle" as const,
          toolNames: ["shell"],
          occurrences: 5,
          confidence: 0.9,
          firstDetected: Date.now(),
          description: "Error cycle detected",
        },
      ];
      const summary = generateIssueSummary(state, patterns, ["Error 1"]);

      expect(summary.title).toContain("Repeated Errors");
      expect(
        summary.possibleCauses.some((c) => c.includes("fundamental issue")),
      ).toBe(true);
    });

    it("should analyze possible causes from error messages", () => {
      const state = { ...DEFAULT_LOOP_DETECTION_STATE };
      const summary = generateIssueSummary(
        state,
        [],
        ["Permission denied", "File not found"],
      );

      expect(summary.possibleCauses.some((c) => c.includes("Permission"))).toBe(
        true,
      );
      expect(summary.possibleCauses.some((c) => c.includes("missing"))).toBe(
        true,
      );
    });
  });

  describe("getFallbackStrategy", () => {
    it("should return wait strategy for critical priority", () => {
      const strategy = getFallbackStrategy("critical", "task");
      expect(strategy.action).toBe("wait");
      expect(strategy.allowedOperations).toHaveLength(0);
    });

    it("should return safe_mode strategy for high priority", () => {
      const strategy = getFallbackStrategy("high", "task");
      expect(strategy.action).toBe("safe_mode");
      expect(strategy.allowedOperations).toContain("read_file");
      expect(strategy.allowedOperations).not.toContain("write_file");
    });

    it("should return partial_complete strategy for medium priority", () => {
      const strategy = getFallbackStrategy("medium", "task");
      expect(strategy.action).toBe("partial_complete");
      expect(strategy.allowedOperations).toContain("update_plan");
      expect(strategy.allowedOperations).not.toContain("write_file");
    });

    it("should return partial_complete strategy for low priority", () => {
      const strategy = getFallbackStrategy("low", "task");
      expect(strategy.action).toBe("partial_complete");
      expect(strategy.allowedOperations).toContain("write_file");
    });
  });

  describe("formatGitHubEscalation", () => {
    it("should format request as markdown", () => {
      const request = createEscalationRequest(
        { ...DEFAULT_LOOP_DETECTION_STATE },
        {
          taskDescription: "Fix bug",
          currentStep: "Running tests",
          attemptedActions: ["shell"],
          errorMessages: ["Error"],
          filesModified: ["file.ts"],
          timeElapsedMs: 1000,
        },
        "high",
      );

      const markdown = formatGitHubEscalation(request);

      expect(markdown).toContain("## ⚠️");
      expect(markdown).toContain("**Priority:** HIGH");
      expect(markdown).toContain("### Description");
      expect(markdown).toContain("### Current Task");
      expect(markdown).toContain("### How to Respond");
    });
  });

  describe("createEscalationTracker", () => {
    it("should create tracker with pending status", () => {
      const request = createEscalationRequest(
        { ...DEFAULT_LOOP_DETECTION_STATE },
        {
          taskDescription: "Fix bug",
          currentStep: "Running tests",
          attemptedActions: [],
          errorMessages: [],
          filesModified: [],
          timeElapsedMs: 0,
        },
        "medium",
      );

      const tracker = createEscalationTracker(request);

      expect(tracker.request).toBe(request);
      expect(tracker.status).toBe("pending");
      expect(tracker.createdAt).toBeLessThanOrEqual(Date.now());
    });
  });

  describe("updateEscalationStatus", () => {
    it("should update status and set timestamps", () => {
      const request = createEscalationRequest(
        { ...DEFAULT_LOOP_DETECTION_STATE },
        {
          taskDescription: "Fix bug",
          currentStep: "Running tests",
          attemptedActions: [],
          errorMessages: [],
          filesModified: [],
          timeElapsedMs: 0,
        },
        "medium",
      );
      const tracker = createEscalationTracker(request);

      const acknowledged = updateEscalationStatus(tracker, "acknowledged");
      expect(acknowledged.status).toBe("acknowledged");
      expect(acknowledged.acknowledgedAt).toBeDefined();

      const resolved = updateEscalationStatus(acknowledged, "resolved");
      expect(resolved.status).toBe("resolved");
      expect(resolved.resolvedAt).toBeDefined();
    });
  });

  describe("isEscalationResolved", () => {
    const request = createEscalationRequest(
      { ...DEFAULT_LOOP_DETECTION_STATE },
      {
        taskDescription: "Fix bug",
        currentStep: "Running tests",
        attemptedActions: [],
        errorMessages: [],
        filesModified: [],
        timeElapsedMs: 0,
      },
      "medium",
    );

    it("should return resolved for resolved status", () => {
      const tracker = createEscalationTracker(request);
      const updated = updateEscalationStatus(tracker, "resolved");
      const result = isEscalationResolved(updated);
      expect(result.resolved).toBe(true);
      expect(result.action).toBe("continue");
    });

    it("should return abort for expired status", () => {
      const tracker = createEscalationTracker(request);
      const updated = updateEscalationStatus(tracker, "expired");
      const result = isEscalationResolved(updated);
      expect(result.resolved).toBe(false);
      expect(result.action).toBe("abort");
    });

    it("should parse human response 'continue'", () => {
      const tracker = createEscalationTracker(request);
      const result = isEscalationResolved(tracker, "continue");
      expect(result.resolved).toBe(true);
      expect(result.action).toBe("continue");
    });

    it("should parse human response 'retry'", () => {
      const tracker = createEscalationTracker(request);
      const result = isEscalationResolved(tracker, "retry");
      expect(result.resolved).toBe(true);
      expect(result.action).toBe("retry");
    });

    it("should parse human response 'abort'", () => {
      const tracker = createEscalationTracker(request);
      const result = isEscalationResolved(tracker, "abort");
      expect(result.resolved).toBe(true);
      expect(result.action).toBe("abort");
    });

    it("should parse human response 'modify: instructions'", () => {
      const tracker = createEscalationTracker(request);
      const result = isEscalationResolved(tracker, "modify: do something else");
      expect(result.resolved).toBe(true);
      expect(result.action).toBe("modify_approach");
      expect(result.instructions).toBe("do something else");
    });
  });

  describe("hasEscalationTimedOut", () => {
    it("should return true if timeout passed", () => {
      const request = createEscalationRequest(
        { ...DEFAULT_LOOP_DETECTION_STATE },
        {
          taskDescription: "Fix bug",
          currentStep: "Running tests",
          attemptedActions: [],
          errorMessages: [],
          filesModified: [],
          timeElapsedMs: 0,
        },
        "medium",
      );
      const tracker = createEscalationTracker(request, 100);

      // Manually set createdAt to the past
      tracker.createdAt = Date.now() - 200;

      expect(hasEscalationTimedOut(tracker)).toBe(true);
    });
  });

  describe("getEscalationRemainingTime", () => {
    it("should return remaining time", () => {
      const request = createEscalationRequest(
        { ...DEFAULT_LOOP_DETECTION_STATE },
        {
          taskDescription: "Fix bug",
          currentStep: "Running tests",
          attemptedActions: [],
          errorMessages: [],
          filesModified: [],
          timeElapsedMs: 0,
        },
        "medium",
      );
      const tracker = createEscalationTracker(request, 10000);

      const remaining = getEscalationRemainingTime(tracker);
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(10000);
    });
  });
});
