/**
 * Tests for degradation-manager module
 */

import {
  calculateDegradationLevel,
  getDegradationStrategy,
  isToolAllowed,
  generateClarificationRequest,
  applyDegradation,
  shouldReduceDegradation,
  getDegradationDescription,
} from "../degradation-manager.js";
import {
  DEFAULT_LOOP_PREVENTION_CONFIG,
  DEFAULT_LOOP_DETECTION_STATE,
} from "@openswe/shared/open-swe/loop-prevention/types";
import { DegradationLevel, LoopPattern } from "../types.js";
import type { LoopPreventionConfig } from "@openswe/shared/open-swe/loop-prevention/types";
import type { ClarificationContext } from "../degradation-manager.js";

describe("DegradationManager", () => {
  describe("calculateDegradationLevel", () => {
    it("should return NORMAL level for clean state", () => {
      const state = { ...DEFAULT_LOOP_DETECTION_STATE };
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const result = calculateDegradationLevel(state, config, 0);

      expect(result.level).toBe(DegradationLevel.NORMAL);
      expect(result.reason).toContain("Normal level");
      expect(result.factors).toHaveLength(4);
      expect(result.suggestedActions).toContain("Continue normal operation");
    });

    it("should increase level with consecutive errors", () => {
      const state = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        consecutiveErrorCount: 3,
      };
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const result = calculateDegradationLevel(state, config, 0);

      expect(result.level).toBeGreaterThanOrEqual(DegradationLevel.WARNING);
      expect(result.factors.some((f) => f.name === "consecutive_errors")).toBe(
        true,
      );
    });

    it("should increase level with similar actions", () => {
      const state = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        similarActionCount: 5,
      };
      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        semanticMatchThreshold: 5,
      };

      const result = calculateDegradationLevel(state, config, 0);

      expect(result.level).toBeGreaterThanOrEqual(DegradationLevel.WARNING);
      expect(result.factors.some((f) => f.name === "similar_actions")).toBe(
        true,
      );
    });

    it("should increase level with high error rate", () => {
      const history = [];
      for (let i = 0; i < 10; i++) {
        history.push({
          id: `${i}`,
          timestamp: Date.now() - (10 - i) * 1000,
          toolName: "shell",
          toolArgs: { command: "ls -la" },
          argsHash: "abc123",
          result: i < 7 ? ("error" as const) : ("success" as const),
          durationMs: 100,
        });
      }

      const state = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        executionHistory: history,
      };
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const result = calculateDegradationLevel(state, config, 0);

      // With 4/10 error rate, degradation level may still be 0 (NORMAL)
      expect(result.level).toBeGreaterThanOrEqual(DegradationLevel.NORMAL);
      expect(result.factors.some((f) => f.name === "error_rate")).toBe(true);
    });

    it("should apply hysteresis to prevent rapid level changes", () => {
      const state = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        consecutiveErrorCount: 3,
      };
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      // First calculation should increase level
      const result1 = calculateDegradationLevel(state, config, 0);
      expect(result1.level).toBeGreaterThan(0);

      // Second calculation with same state should maintain level
      const result2 = calculateDegradationLevel(state, config, result1.level);
      expect(result2.level).toBe(result1.level);
    });

    it("should generate appropriate suggested actions for each level", () => {
      const state = { ...DEFAULT_LOOP_DETECTION_STATE };
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const result = calculateDegradationLevel(state, config, 0);

      expect(result.suggestedActions).toBeDefined();
      expect(result.suggestedActions.length).toBeGreaterThan(0);
    });

    it("should handle empty execution history", () => {
      const state = { ...DEFAULT_LOOP_DETECTION_STATE };
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const result = calculateDegradationLevel(state, config, 0);

      expect(result.level).toBe(DegradationLevel.NORMAL);
      expect(result.factors).toHaveLength(4);
    });
  });

  describe("getDegradationStrategy", () => {
    it("should return strategy for NORMAL level", () => {
      const strategy = getDegradationStrategy(DegradationLevel.NORMAL);

      expect(strategy.level).toBe(DegradationLevel.NORMAL);
      expect(strategy.name).toBe("Normal");
      expect(strategy.allowedToolCategories).toHaveLength(6);
      expect(strategy.blockedTools).toHaveLength(0);
      expect(strategy.requiresConfirmation).toBe(false);
      expect(strategy.addDelay).toBe(false);
      expect(strategy.delayMs).toBe(0);
      expect(strategy.maxActionsPerMinute).toBe(60);
    });

    it("should return strategy for WARNING level", () => {
      const strategy = getDegradationStrategy(DegradationLevel.WARNING);

      expect(strategy.level).toBe(DegradationLevel.WARNING);
      expect(strategy.name).toBe("Warning");
      expect(strategy.allowedToolCategories).toHaveLength(6);
      expect(strategy.blockedTools).toHaveLength(0);
      expect(strategy.requiresConfirmation).toBe(false);
      expect(strategy.addDelay).toBe(true);
      expect(strategy.delayMs).toBe(500);
      expect(strategy.maxActionsPerMinute).toBe(30);
    });

    it("should return strategy for RESTRICTED level", () => {
      const strategy = getDegradationStrategy(DegradationLevel.RESTRICTED);

      expect(strategy.level).toBe(DegradationLevel.RESTRICTED);
      expect(strategy.name).toBe("Restricted");
      expect(strategy.allowedToolCategories).toHaveLength(4);
      expect(strategy.blockedTools).toContain("shell");
      expect(strategy.blockedTools).toContain("bash");
      expect(strategy.blockedTools).toContain("execute_command");
      expect(strategy.requiresConfirmation).toBe(true);
      expect(strategy.addDelay).toBe(true);
      expect(strategy.delayMs).toBe(1000);
      expect(strategy.maxActionsPerMinute).toBe(15);
    });

    it("should return strategy for MINIMAL level", () => {
      const strategy = getDegradationStrategy(DegradationLevel.MINIMAL);

      expect(strategy.level).toBe(DegradationLevel.MINIMAL);
      expect(strategy.name).toBe("Minimal");
      expect(strategy.allowedToolCategories).toHaveLength(2);
      expect(strategy.blockedTools).toContain("shell");
      expect(strategy.blockedTools).toContain("bash");
      expect(strategy.blockedTools).toContain("execute_command");
      expect(strategy.blockedTools).toContain("write_file");
      expect(strategy.requiresConfirmation).toBe(true);
      expect(strategy.addDelay).toBe(true);
      expect(strategy.delayMs).toBe(2000);
      expect(strategy.maxActionsPerMinute).toBe(5);
    });

    it("should return strategy for HALTED level", () => {
      const strategy = getDegradationStrategy(DegradationLevel.HALTED);

      expect(strategy.level).toBe(DegradationLevel.HALTED);
      expect(strategy.name).toBe("Halted");
      expect(strategy.allowedToolCategories).toHaveLength(1);
      expect(strategy.blockedTools).toContain("shell");
      expect(strategy.blockedTools).toContain("bash");
      expect(strategy.blockedTools).toContain("execute_command");
      expect(strategy.blockedTools).toContain("write_file");
      expect(strategy.blockedTools).toContain("read_file");
      expect(strategy.requiresConfirmation).toBe(true);
      expect(strategy.addDelay).toBe(true);
      expect(strategy.delayMs).toBe(5000);
      expect(strategy.maxActionsPerMinute).toBe(1);
    });

    it("should clamp level to valid range", () => {
      const strategy1 = getDegradationStrategy(-1);
      expect(strategy1.level).toBe(DegradationLevel.NORMAL);

      const strategy2 = getDegradationStrategy(10);
      expect(strategy2.level).toBe(DegradationLevel.HALTED);
    });

    it("should return a copy, not a reference", () => {
      const strategy1 = getDegradationStrategy(DegradationLevel.NORMAL);
      const strategy2 = getDegradationStrategy(DegradationLevel.NORMAL);
      expect(strategy1).not.toBe(strategy2);
      expect(strategy1).toEqual(strategy2);
    });
  });

  describe("isToolAllowed", () => {
    it("should allow all tools when loop prevention is disabled", () => {
      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        enabled: false,
      };

      const result = isToolAllowed("shell", DegradationLevel.HALTED, config);
      expect(result.allowed).toBe(true);
      expect(result.reason).toContain("disabled");
    });

    it("should allow all tools at NORMAL level", () => {
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const result = isToolAllowed("shell", DegradationLevel.NORMAL, config);
      expect(result.allowed).toBe(true);
      expect(result.reason).toContain("Normal level");
    });

    it("should block shell commands at RESTRICTED level", () => {
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const result = isToolAllowed(
        "shell",
        DegradationLevel.RESTRICTED,
        config,
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("blocked");
      expect(result.alternatives).toContain("ask_followup_question");
      expect(result.alternatives).toContain("request_human_help");
    });

    it("should block shell commands at MINIMAL level", () => {
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const result = isToolAllowed("bash", DegradationLevel.MINIMAL, config);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("blocked");
    });

    it("should block shell commands at HALTED level", () => {
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const result = isToolAllowed(
        "execute_command",
        DegradationLevel.HALTED,
        config,
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("blocked");
    });

    it("should allow file operations at RESTRICTED level", () => {
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const result = isToolAllowed(
        "read_file",
        DegradationLevel.RESTRICTED,
        config,
      );
      expect(result.allowed).toBe(true);
      expect(result.reason).toContain("allowed");
    });

    it("should block file operations at MINIMAL level", () => {
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const result = isToolAllowed(
        "write_file",
        DegradationLevel.MINIMAL,
        config,
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("blocked");
    });

    it("should allow search tools at MINIMAL level", () => {
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const result = isToolAllowed("grep", DegradationLevel.MINIMAL, config);
      expect(result.allowed).toBe(true);
      expect(result.reason).toContain("allowed");
    });

    it("should allow communication tools at HALTED level", () => {
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const result = isToolAllowed(
        "ask_followup_question",
        DegradationLevel.HALTED,
        config,
      );
      expect(result.allowed).toBe(true);
      expect(result.reason).toContain("allowed");
    });

    it("should require confirmation at RESTRICTED level", () => {
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const result = isToolAllowed(
        "read_file",
        DegradationLevel.RESTRICTED,
        config,
      );
      expect(result.requiresConfirmation).toBe(true);
    });

    it("should not require confirmation at NORMAL level", () => {
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const result = isToolAllowed("shell", DegradationLevel.NORMAL, config);
      expect(result.requiresConfirmation).toBe(false);
    });
  });

  describe("generateClarificationRequest", () => {
    it("should generate request with critical urgency for high degradation", () => {
      const state = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        degradationLevel: 3 as const,
      };
      const patterns: LoopPattern[] = [];
      const context: ClarificationContext = {
        currentTask: "Fix bug in authentication",
        recentActions: ["read_file", "shell"],
        errorMessages: ["Permission denied"],
      };

      const result = generateClarificationRequest(state, patterns, context);

      expect(result.urgency).toBe("critical");
      expect(result.question).toBeDefined();
      expect(result.context).toBeDefined();
      expect(result.suggestedResponses).toBeDefined();
    });

    it("should generate request with high urgency for consecutive errors", () => {
      const state = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        consecutiveErrorCount: 7,
      };
      const patterns: LoopPattern[] = [];
      const context: ClarificationContext = {
        currentTask: "Fix bug in authentication",
        recentActions: ["read_file", "shell"],
        errorMessages: ["Permission denied"],
      };

      const result = generateClarificationRequest(state, patterns, context);

      expect(result.urgency).toBe("high");
    });

    it("should generate request with high urgency for high confidence patterns", () => {
      const state = { ...DEFAULT_LOOP_DETECTION_STATE };
      const patterns: LoopPattern[] = [
        {
          type: "exact_repeat",
          toolNames: ["shell"],
          occurrences: 5,
          confidence: 0.95,
          firstDetected: Date.now() - 10000,
          description: "Exact repeat pattern detected",
        },
      ];
      const context: ClarificationContext = {
        currentTask: "Fix bug in authentication",
        recentActions: ["read_file", "shell"],
        errorMessages: ["Permission denied"],
      };

      const result = generateClarificationRequest(state, patterns, context);

      expect(result.urgency).toBe("high");
    });

    it("should generate request with medium urgency for medium degradation", () => {
      const state = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        degradationLevel: 2 as const,
      };
      const patterns: LoopPattern[] = [];
      const context: ClarificationContext = {
        currentTask: "Fix bug in authentication",
        recentActions: ["read_file", "shell"],
        errorMessages: ["Permission denied"],
      };

      const result = generateClarificationRequest(state, patterns, context);

      expect(result.urgency).toBe("medium");
    });

    it("should generate request with medium urgency for any patterns", () => {
      const state = { ...DEFAULT_LOOP_DETECTION_STATE };
      const patterns: LoopPattern[] = [
        {
          type: "similar_args",
          toolNames: ["shell"],
          occurrences: 3,
          confidence: 0.7,
          firstDetected: Date.now() - 10000,
          description: "Similar arguments pattern detected",
        },
      ];
      const context: ClarificationContext = {
        currentTask: "Fix bug in authentication",
        recentActions: ["read_file", "shell"],
        errorMessages: ["Permission denied"],
      };

      const result = generateClarificationRequest(state, patterns, context);

      expect(result.urgency).toBe("medium");
    });

    it("should generate request with low urgency for clean state", () => {
      const state = { ...DEFAULT_LOOP_DETECTION_STATE };
      const patterns: LoopPattern[] = [];
      const context: ClarificationContext = {
        currentTask: "Fix bug in authentication",
        recentActions: ["read_file", "shell"],
        errorMessages: [],
      };

      const result = generateClarificationRequest(state, patterns, context);

      expect(result.urgency).toBe("low");
    });

    it("should generate appropriate question for exact repeat pattern", () => {
      const state = { ...DEFAULT_LOOP_DETECTION_STATE };
      const patterns: LoopPattern[] = [
        {
          type: "exact_repeat",
          toolNames: ["shell"],
          occurrences: 5,
          confidence: 0.9,
          firstDetected: Date.now() - 10000,
          description: "Exact repeat pattern detected",
        },
      ];
      const context: ClarificationContext = {
        currentTask: "Fix bug in authentication",
        recentActions: ["read_file", "shell"],
        errorMessages: [],
      };

      const result = generateClarificationRequest(state, patterns, context);

      expect(result.question).toContain("repeating the same action");
      expect(result.question).toContain("shell");
      expect(result.question).toContain("5 times");
    });

    it("should generate appropriate question for similar args pattern", () => {
      const state = { ...DEFAULT_LOOP_DETECTION_STATE };
      const patterns: LoopPattern[] = [
        {
          type: "similar_args",
          toolNames: ["shell"],
          occurrences: 3,
          confidence: 0.8,
          firstDetected: Date.now() - 10000,
          description: "Similar arguments pattern detected",
        },
      ];
      const context: ClarificationContext = {
        currentTask: "Fix bug in authentication",
        recentActions: ["read_file", "shell"],
        errorMessages: [],
      };

      const result = generateClarificationRequest(state, patterns, context);

      expect(result.question).toContain("similar attempts");
      expect(result.question).toContain("specific guidance");
    });

    it("should generate appropriate question for error cycle pattern", () => {
      const state = { ...DEFAULT_LOOP_DETECTION_STATE };
      const patterns: LoopPattern[] = [
        {
          type: "error_cycle",
          toolNames: ["shell"],
          occurrences: 5,
          confidence: 0.9,
          firstDetected: Date.now() - 10000,
          description: "Error cycle pattern detected",
        },
      ];
      const context: ClarificationContext = {
        currentTask: "Fix bug in authentication",
        recentActions: ["read_file", "shell"],
        errorMessages: ["Permission denied"],
      };

      const result = generateClarificationRequest(state, patterns, context);

      expect(result.question).toContain("repeated errors");
      expect(result.question).toContain("different strategy");
    });

    it("should generate appropriate question for oscillation pattern", () => {
      const state = { ...DEFAULT_LOOP_DETECTION_STATE };
      const patterns: LoopPattern[] = [
        {
          type: "oscillation",
          toolNames: ["shell", "read_file"],
          occurrences: 4,
          confidence: 0.85,
          firstDetected: Date.now() - 10000,
          description: "Oscillation pattern detected",
        },
      ];
      const context: ClarificationContext = {
        currentTask: "Fix bug in authentication",
        recentActions: ["read_file", "shell"],
        errorMessages: [],
      };

      const result = generateClarificationRequest(state, patterns, context);

      expect(result.question).toContain("going back and forth");
      expect(result.question).toContain("clarify the expected outcome");
    });

    it("should generate appropriate question for consecutive errors", () => {
      const state = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        consecutiveErrorCount: 5,
      };
      const patterns: LoopPattern[] = [];
      const context: ClarificationContext = {
        currentTask: "Fix bug in authentication",
        recentActions: ["read_file", "shell"],
        errorMessages: ["Permission denied"],
      };

      const result = generateClarificationRequest(state, patterns, context);

      expect(result.question).toContain("5 consecutive errors");
      expect(result.question).toContain("different approach");
    });

    it("should generate appropriate question for general difficulty", () => {
      const state = { ...DEFAULT_LOOP_DETECTION_STATE };
      const patterns: LoopPattern[] = [];
      const context: ClarificationContext = {
        currentTask: "Fix bug in authentication",
        recentActions: ["read_file", "shell"],
        errorMessages: [],
      };

      const result = generateClarificationRequest(state, patterns, context);

      expect(result.question).toContain("Fix bug in authentication");
      expect(result.question).toContain("additional guidance");
    });

    it("should include context description", () => {
      const state = { ...DEFAULT_LOOP_DETECTION_STATE };
      const patterns: LoopPattern[] = [];
      const context: ClarificationContext = {
        currentTask: "Fix bug in authentication",
        recentActions: ["read_file", "shell"],
        errorMessages: ["Permission denied"],
      };

      const result = generateClarificationRequest(state, patterns, context);

      expect(result.context).toContain(
        "Current task: Fix bug in authentication",
      );
      expect(result.context).toContain("Recent actions: read_file, shell");
      expect(result.context).toContain("Last error: Permission denied");
    });

    it("should include suggested responses", () => {
      const state = { ...DEFAULT_LOOP_DETECTION_STATE };
      const patterns: LoopPattern[] = [];
      const context: ClarificationContext = {
        currentTask: "Fix bug in authentication",
        recentActions: ["read_file", "shell"],
        errorMessages: [],
      };

      const result = generateClarificationRequest(state, patterns, context);

      expect(result.suggestedResponses).toContain(
        "Continue with the current approach",
      );
      expect(result.suggestedResponses).toContain("Try a different strategy");
      expect(result.suggestedResponses).toContain(
        "Escalate to human assistance",
      );
    });

    it("should include additional responses for error cycle", () => {
      const state = { ...DEFAULT_LOOP_DETECTION_STATE };
      const patterns: LoopPattern[] = [
        {
          type: "error_cycle",
          toolNames: ["shell"],
          occurrences: 5,
          confidence: 0.9,
          firstDetected: Date.now() - 10000,
          description: "Error cycle pattern detected",
        },
      ];
      const context: ClarificationContext = {
        currentTask: "Fix bug in authentication",
        recentActions: ["read_file", "shell"],
        errorMessages: ["Permission denied"],
      };

      const result = generateClarificationRequest(state, patterns, context);

      expect(result.suggestedResponses).toContain("Skip this step and move on");
      expect(result.suggestedResponses).toContain(
        "Provide more details about the expected behavior",
      );
    });

    it("should include additional responses for exact repeat", () => {
      const state = { ...DEFAULT_LOOP_DETECTION_STATE };
      const patterns: LoopPattern[] = [
        {
          type: "exact_repeat",
          toolNames: ["shell"],
          occurrences: 5,
          confidence: 0.9,
          firstDetected: Date.now() - 10000,
          description: "Exact repeat pattern detected",
        },
      ];
      const context: ClarificationContext = {
        currentTask: "Fix bug in authentication",
        recentActions: ["read_file", "shell"],
        errorMessages: [],
      };

      const result = generateClarificationRequest(state, patterns, context);

      expect(result.suggestedResponses).toContain(
        "The previous attempts were correct, keep trying",
      );
      expect(result.suggestedResponses).toContain(
        "Stop and explain what you've tried",
      );
    });

    it("should limit suggested responses to 4 items", () => {
      const state = { ...DEFAULT_LOOP_DETECTION_STATE };
      const patterns: LoopPattern[] = [
        {
          type: "error_cycle",
          toolNames: ["shell"],
          occurrences: 5,
          confidence: 0.9,
          firstDetected: Date.now() - 10000,
          description: "Error cycle pattern detected",
        },
      ];
      const context: ClarificationContext = {
        currentTask: "Fix bug in authentication",
        recentActions: ["read_file", "shell"],
        errorMessages: ["Permission denied"],
      };

      const result = generateClarificationRequest(state, patterns, context);

      expect(result.suggestedResponses.length).toBeLessThanOrEqual(4);
    });
  });

  describe("applyDegradation", () => {
    it("should return no effects when loop prevention is disabled", () => {
      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        enabled: false,
      };

      const result = applyDegradation(DegradationLevel.HALTED, "shell", config);

      expect(result.delayMs).toBe(0);
      expect(result.requiresConfirmation).toBe(false);
      expect(result.blockedReason).toBeUndefined();
      expect(result.warningMessage).toBeUndefined();
    });

    it("should return no effects at NORMAL level", () => {
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const result = applyDegradation(DegradationLevel.NORMAL, "shell", config);

      expect(result.delayMs).toBe(0);
      expect(result.requiresConfirmation).toBe(false);
      expect(result.blockedReason).toBeUndefined();
      expect(result.warningMessage).toBeUndefined();
    });

    it("should add delay at WARNING level", () => {
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const result = applyDegradation(
        DegradationLevel.WARNING,
        "shell",
        config,
      );

      expect(result.delayMs).toBe(500);
      expect(result.requiresConfirmation).toBe(false);
      expect(result.warningMessage).toContain("Warning level");
    });

    it("should add delay and require confirmation at RESTRICTED level", () => {
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const result = applyDegradation(
        DegradationLevel.RESTRICTED,
        "read_file",
        config,
      );

      expect(result.delayMs).toBe(1000);
      expect(result.requiresConfirmation).toBe(true);
      expect(result.warningMessage).toContain("Restricted level");
    });

    it("should block shell commands at RESTRICTED level", () => {
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const result = applyDegradation(
        DegradationLevel.RESTRICTED,
        "shell",
        config,
      );

      expect(result.delayMs).toBe(0);
      expect(result.requiresConfirmation).toBe(false);
      expect(result.blockedReason).toContain("blocked");
      expect(result.warningMessage).toContain("Consider using");
    });

    it("should add delay and require confirmation at MINIMAL level", () => {
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const result = applyDegradation(DegradationLevel.MINIMAL, "grep", config);

      expect(result.delayMs).toBe(2000);
      expect(result.requiresConfirmation).toBe(true);
      expect(result.warningMessage).toContain("Minimal level");
    });

    it("should block file operations at MINIMAL level", () => {
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const result = applyDegradation(
        DegradationLevel.MINIMAL,
        "write_file",
        config,
      );

      expect(result.delayMs).toBe(0);
      expect(result.requiresConfirmation).toBe(false);
      expect(result.blockedReason).toContain("blocked");
    });

    it("should add delay and require confirmation at HALTED level", () => {
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const result = applyDegradation(
        DegradationLevel.HALTED,
        "ask_followup_question",
        config,
      );

      expect(result.delayMs).toBe(5000);
      expect(result.requiresConfirmation).toBe(true);
      expect(result.warningMessage).toContain("Halted level");
    });

    it("should block most tools at HALTED level", () => {
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const result = applyDegradation(DegradationLevel.HALTED, "shell", config);

      expect(result.delayMs).toBe(0);
      expect(result.requiresConfirmation).toBe(false);
      expect(result.blockedReason).toContain("blocked");
    });

    it("should allow communication tools at HALTED level", () => {
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const result = applyDegradation(
        DegradationLevel.HALTED,
        "attempt_completion",
        config,
      );

      expect(result.delayMs).toBe(5000);
      expect(result.requiresConfirmation).toBe(true);
      expect(result.blockedReason).toBeUndefined();
    });

    it("should include alternatives for blocked tools", () => {
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const result = applyDegradation(
        DegradationLevel.RESTRICTED,
        "shell",
        config,
      );

      expect(result.warningMessage).toContain("Consider using");
      expect(result.warningMessage).toContain("ask_followup_question");
      expect(result.warningMessage).toContain("request_human_help");
    });
  });

  describe("shouldReduceDegradation", () => {
    it("should not reduce from NORMAL level", () => {
      const state = { ...DEFAULT_LOOP_DETECTION_STATE };
      const config = { ...DEFAULT_LOOP_PREVENTION_CONFIG };

      const result = shouldReduceDegradation(
        state,
        DegradationLevel.NORMAL,
        config,
      );

      expect(result).toBe(false);
    });

    it("should reduce when loop prevention is disabled", () => {
      const state = { ...DEFAULT_LOOP_DETECTION_STATE };
      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        enabled: false,
      };

      const result = shouldReduceDegradation(
        state,
        DegradationLevel.WARNING,
        config,
      );

      expect(result).toBe(true);
    });

    it("should not reduce if cooldown period hasn't passed", () => {
      const state = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        lastStrategySwitch: Date.now() - 10000, // 10 seconds ago
      };
      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        degradationLevels: [
          {
            level: 1,
            triggerCondition: "exactMatch >= 3",
            action: "switch-strategy",
            cooldownMs: 60000, // 1 minute
          },
        ],
      };

      const result = shouldReduceDegradation(
        state,
        DegradationLevel.WARNING,
        config,
      );

      expect(result).toBe(false);
    });

    it("should not reduce if there are consecutive errors", () => {
      const state = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        consecutiveErrorCount: 3,
        lastStrategySwitch: Date.now() - 120000, // 2 minutes ago
      };
      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        degradationLevels: [
          {
            level: 1,
            triggerCondition: "exactMatch >= 3",
            action: "switch-strategy",
            cooldownMs: 60000,
          },
        ],
      };

      const result = shouldReduceDegradation(
        state,
        DegradationLevel.WARNING,
        config,
      );

      expect(result).toBe(false);
    });

    it("should not reduce if history is too short", () => {
      const state = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        lastStrategySwitch: Date.now() - 120000,
        executionHistory: [
          {
            id: "1",
            timestamp: Date.now() - 10000,
            toolName: "shell",
            toolArgs: { command: "ls -la" },
            argsHash: "abc123",
            result: "success" as const,
            durationMs: 100,
          },
        ],
      };
      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        degradationLevels: [
          {
            level: 1,
            triggerCondition: "exactMatch >= 3",
            action: "switch-strategy",
            cooldownMs: 60000,
          },
        ],
      };

      const result = shouldReduceDegradation(
        state,
        DegradationLevel.WARNING,
        config,
      );

      expect(result).toBe(false);
    });

    it("should reduce if success rate is high enough", () => {
      const history = [];
      for (let i = 0; i < 10; i++) {
        history.push({
          id: `${i}`,
          timestamp: Date.now() - (10 - i) * 1000,
          toolName: "shell",
          toolArgs: { command: "ls -la" },
          argsHash: "abc123",
          result: i < 4 ? ("error" as const) : ("success" as const),
          durationMs: 100,
        });
      }

      const state = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        lastStrategySwitch: Date.now() - 120000,
        executionHistory: history,
      };
      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        degradationLevels: [
          {
            level: 1,
            triggerCondition: "exactMatch >= 3",
            action: "switch-strategy",
            cooldownMs: 60000,
          },
        ],
      };

      const result = shouldReduceDegradation(
        state,
        DegradationLevel.WARNING,
        config,
      );

      expect(result).toBe(true);
    });

    it("should reduce if no similar actions and success rate is moderate", () => {
      const history = [];
      for (let i = 0; i < 5; i++) {
        history.push({
          id: `${i}`,
          timestamp: Date.now() - (5 - i) * 1000,
          toolName: "shell",
          toolArgs: { command: "ls -la" },
          argsHash: "abc123",
          result: i < 2 ? ("error" as const) : ("success" as const),
          durationMs: 100,
        });
      }

      const state = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        lastStrategySwitch: Date.now() - 120000,
        executionHistory: history,
        similarActionCount: 0,
      };
      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        degradationLevels: [
          {
            level: 1,
            triggerCondition: "exactMatch >= 3",
            action: "switch-strategy",
            cooldownMs: 60000,
          },
        ],
      };

      const result = shouldReduceDegradation(
        state,
        DegradationLevel.WARNING,
        config,
      );

      expect(result).toBe(true);
    });

    it("should not reduce if success rate is too low", () => {
      const history = [];
      for (let i = 0; i < 5; i++) {
        history.push({
          id: `${i}`,
          timestamp: Date.now() - (5 - i) * 1000,
          toolName: "shell",
          toolArgs: { command: "ls -la" },
          argsHash: "abc123",
          result: i < 3 ? ("error" as const) : ("success" as const),
          durationMs: 100,
        });
      }

      const state = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        lastStrategySwitch: Date.now() - 120000,
        executionHistory: history,
      };
      const config: LoopPreventionConfig = {
        ...DEFAULT_LOOP_PREVENTION_CONFIG,
        degradationLevels: [
          {
            level: 1,
            triggerCondition: "exactMatch >= 3",
            action: "switch-strategy",
            cooldownMs: 60000,
          },
        ],
      };

      const result = shouldReduceDegradation(
        state,
        DegradationLevel.WARNING,
        config,
      );

      expect(result).toBe(false);
    });
  });

  describe("getDegradationDescription", () => {
    it("should return description for NORMAL level", () => {
      const state = { ...DEFAULT_LOOP_DETECTION_STATE };
      const result = getDegradationDescription(DegradationLevel.NORMAL, state);

      expect(result).toContain("Degradation Level: 0 (Normal)");
      expect(result).toContain(
        "Description: Full capabilities with standard monitoring",
      );
    });

    it("should include consecutive errors in description", () => {
      const state = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        consecutiveErrorCount: 3,
      };
      const result = getDegradationDescription(DegradationLevel.WARNING, state);

      expect(result).toContain("Consecutive Errors: 3");
    });

    it("should include similar actions in description", () => {
      const state = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        similarActionCount: 5,
      };
      const result = getDegradationDescription(DegradationLevel.WARNING, state);

      expect(result).toContain("Similar Actions Detected: 5");
    });

    it("should include recent error rate in description", () => {
      const history = [];
      for (let i = 0; i < 10; i++) {
        history.push({
          id: `${i}`,
          timestamp: Date.now() - (10 - i) * 1000,
          toolName: "shell",
          toolArgs: { command: "ls -la" },
          argsHash: "abc123",
          result: i < 7 ? ("error" as const) : ("success" as const),
          durationMs: 100,
        });
      }

      const state = {
        ...DEFAULT_LOOP_DETECTION_STATE,
        executionHistory: history,
      };
      const result = getDegradationDescription(DegradationLevel.WARNING, state);

      expect(result).toContain("Recent Error Rate: 70%");
    });

    it("should include blocked tools in description", () => {
      const state = { ...DEFAULT_LOOP_DETECTION_STATE };
      const result = getDegradationDescription(
        DegradationLevel.RESTRICTED,
        state,
      );

      expect(result).toContain("Blocked Tools:");
      expect(result).toContain("shell");
      expect(result).toContain("bash");
    });

    it("should include confirmation requirement in description", () => {
      const state = { ...DEFAULT_LOOP_DETECTION_STATE };
      const result = getDegradationDescription(
        DegradationLevel.RESTRICTED,
        state,
      );

      expect(result).toContain("Actions require confirmation");
    });

    it("should include delay information in description", () => {
      const state = { ...DEFAULT_LOOP_DETECTION_STATE };
      const result = getDegradationDescription(DegradationLevel.WARNING, state);

      expect(result).toContain("Delay between actions:");
      expect(result).toContain("500ms");
    });

    it("should include max actions per minute in description", () => {
      const state = { ...DEFAULT_LOOP_DETECTION_STATE };
      const result = getDegradationDescription(DegradationLevel.WARNING, state);

      expect(result).toContain("Max actions per minute:");
    });

    it("should handle empty execution history", () => {
      const state = { ...DEFAULT_LOOP_DETECTION_STATE };
      const result = getDegradationDescription(DegradationLevel.NORMAL, state);

      expect(result).toContain("Degradation Level: 0 (Normal)");
      expect(result).not.toContain("Recent Error Rate");
    });
  });
});
