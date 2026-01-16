/**
 * Tests for loop prevention integration module
 */

import {
  beforeToolExecution,
  afterToolExecution,
  determineNextAction,
  handleErrorWithRecovery,
  initializeLoopPreventionState,
  getLoopPreventionStatus,
  parseGraphConfig,
} from "../integration.js";
import { DEFAULT_LOOP_DETECTION_STATE } from "@openswe/shared/open-swe/loop-prevention/types";
import type { GraphState, GraphConfiguration } from "../integration.js";

describe("LoopPreventionIntegration", () => {
  describe("beforeToolExecution", () => {
    it("should allow execution in normal state", () => {
      const state: GraphState = {
        loopDetectionState: { ...DEFAULT_LOOP_DETECTION_STATE },
      };

      const result = beforeToolExecution(state, "read_file", {
        path: "test.ts",
      });

      expect(result.canProceed).toBe(true);
      expect(result.blockers).toHaveLength(0);
    });

    it("should block execution when tool is blocked by degradation", () => {
      const state: GraphState = {
        loopDetectionState: {
          ...DEFAULT_LOOP_DETECTION_STATE,
          degradationLevel: 3 as any, // MINIMAL level blocks shell
        },
      };

      const result = beforeToolExecution(state, "shell", { command: "ls" });

      expect(result.canProceed).toBe(false);
      expect(result.blockers.length).toBeGreaterThan(0);
    });

    it("should detect loops and block if confidence is high", () => {
      const history = [];
      for (let i = 0; i < 10; i++) {
        history.push({
          id: `${i}`,
          timestamp: Date.now(),
          toolName: "shell",
          toolArgs: { command: "ls" },
          argsHash: "hash",
          result: "success" as const,
          durationMs: 100,
        });
      }
      const state: GraphState = {
        loopDetectionState: {
          ...DEFAULT_LOOP_DETECTION_STATE,
          executionHistory: history,
        },
      };

      const result = beforeToolExecution(state, "shell", { command: "ls" });

      expect(result.canProceed).toBe(false);
      expect(result.blockers.some((b) => b.includes("Loop detected"))).toBe(
        true,
      );
    });
  });

  describe("afterToolExecution", () => {
    it("should update state and return recommendations", () => {
      const state: GraphState = {
        loopDetectionState: { ...DEFAULT_LOOP_DETECTION_STATE },
      };

      const result = afterToolExecution(
        state,
        "read_file",
        { path: "test.ts" },
        { success: true, durationMs: 100 },
      );

      expect(
        result.updatedState.loopDetectionState?.executionHistory,
      ).toHaveLength(1);
      expect(result.healthStatus).toBe("healthy");
    });

    it("should increase degradation level on repeated errors", () => {
      const state: GraphState = {
        loopDetectionState: {
          ...DEFAULT_LOOP_DETECTION_STATE,
          consecutiveErrorCount: 2,
        },
      };

      const result = afterToolExecution(
        state,
        "shell",
        { command: "ls" },
        { success: false, durationMs: 100, error: "Failed" },
      );

      expect(
        result.updatedState.loopDetectionState?.degradationLevel,
      ).toBeGreaterThan(0);
      expect(result.shouldCheckpoint).toBe(true);
    });
  });

  describe("determineNextAction", () => {
    it("should continue in normal state", () => {
      const state: GraphState = {
        loopDetectionState: { ...DEFAULT_LOOP_DETECTION_STATE },
      };

      const decision = determineNextAction(state);

      expect(decision.action).toBe("continue");
    });

    it("should escalate when triggers are met", () => {
      const state: GraphState = {
        loopDetectionState: {
          ...DEFAULT_LOOP_DETECTION_STATE,
          consecutiveErrorCount: 15,
        },
      };

      const decision = determineNextAction(state);

      expect(decision.action).toBe("escalate");
    });

    it("should halt at maximum degradation", () => {
      const state: GraphState = {
        loopDetectionState: {
          ...DEFAULT_LOOP_DETECTION_STATE,
          degradationLevel: 3 as any,
        },
      };

      const decision = determineNextAction(state);

      expect(decision.action).toBe("halt");
    });
  });

  describe("handleErrorWithRecovery", () => {
    it("should attempt recovery and update state", () => {
      const state: GraphState = {
        loopDetectionState: { ...DEFAULT_LOOP_DETECTION_STATE },
      };

      const result = handleErrorWithRecovery(
        state,
        new Error("file not found"),
        "read_file",
        { path: "missing.ts" },
      );

      expect(
        result.updatedState.loopDetectionState?.consecutiveErrorCount,
      ).toBe(1);
      // Since we didn't register strategies in this test, it might not recover
    });
  });

  describe("initializeLoopPreventionState", () => {
    it("should return initial state", () => {
      const state = initializeLoopPreventionState();
      expect(state).toEqual(DEFAULT_LOOP_DETECTION_STATE);
    });
  });

  describe("getLoopPreventionStatus", () => {
    it("should return status summary", () => {
      const state: GraphState = {
        loopDetectionState: { ...DEFAULT_LOOP_DETECTION_STATE },
      };

      const status = getLoopPreventionStatus(state);

      expect(status.enabled).toBe(true);
      expect(status.degradationLevel).toBe(0);
      expect(status.healthScore).toBe(100);
    });
  });

  describe("parseGraphConfig", () => {
    it("should parse config from graph configuration", () => {
      const graphConfig: GraphConfiguration = {
        loopPreventionConfig: {
          exactMatchThreshold: 5,
        },
      };

      const config = parseGraphConfig(graphConfig);

      expect(config.exactMatchThreshold).toBe(5);
      expect(config.enabled).toBe(true);
    });

    it("should respect loopPreventionEnabled flag", () => {
      const graphConfig: GraphConfiguration = {
        loopPreventionEnabled: false,
      };

      const config = parseGraphConfig(graphConfig);

      expect(config.enabled).toBe(false);
    });
  });
});
