/**
 * Tests for proactive-prevention module
 */

import {
  performPreExecutionChecks,
  registerErrorPattern,
  matchErrorPatterns,
  validateToolArguments,
  checkPrerequisites,
  learnFromAction,
  assessActionRisk,
  getErrorPatterns,
  clearErrorPatterns,
} from "../proactive-prevention.js";
import type {
  PreExecutionContext,
  LearnedErrorPattern,
  ActionResult,
} from "../proactive-prevention.js";

describe("ProactivePrevention", () => {
  beforeEach(() => {
    clearErrorPatterns();
  });

  describe("performPreExecutionChecks", () => {
    it("should allow safe actions", () => {
      const context: PreExecutionContext = {
        executionHistory: [],
      };

      const result = performPreExecutionChecks(
        "read_file",
        { path: "test.ts" },
        context,
      );

      expect(result.canProceed).toBe(true);
      expect(result.blockers).toHaveLength(0);
    });

    it("should block dangerous commands", () => {
      const context: PreExecutionContext = {
        executionHistory: [],
      };

      const result = performPreExecutionChecks(
        "shell",
        { command: "rm -rf /" },
        context,
      );

      expect(result.canProceed).toBe(false);
      expect(result.blockers.some((b) => b.type === "invalid_argument")).toBe(
        true,
      );
    });

    it("should warn about high risk actions", () => {
      const context: PreExecutionContext = {
        executionHistory: [],
        modifiedFiles: Array(15).fill("file.ts"), // Many files
      };

      const result = performPreExecutionChecks(
        "shell",
        { command: "rm -rf *" },
        context,
      );

      // Risk level is "high" based on weighted scoring:
      // - destructive_potential: 80 * 0.4 = 32
      // - operation_scope: 60 * 0.3 = 18 (many files + wildcard)
      // - rollback_availability: 50 * 0.2 = 10
      // - historical_errors: 0 * 0.1 = 0
      // Total: ~60, which maps to "high" (60-79)
      expect(result.riskLevel).toBe("high");
      expect(result.warnings.some((w) => w.type === "high_risk")).toBe(true);
    });
  });

  describe("Error Pattern Learning", () => {
    it("should register and match error patterns", () => {
      const pattern: LearnedErrorPattern = {
        id: "test-pattern",
        toolName: "shell",
        argPatterns: [
          { field: "command", pattern: "contains", value: "npm install" },
        ],
        errorType: "timeout",
        errorMessage: "Operation timed out",
        frequency: 1,
        lastOccurrence: Date.now(),
        preventionStrategy: "Use a longer timeout",
        confidence: 0.9,
      };

      registerErrorPattern(pattern);
      expect(getErrorPatterns()).toContain(pattern);

      const matches = matchErrorPatterns(
        "shell",
        { command: "npm install some-pkg" },
        {},
      );
      expect(matches).toHaveLength(1);
      expect(matches[0].pattern.id).toBe("test-pattern");
    });

    it("should learn from failed actions", () => {
      const result: ActionResult = {
        success: false,
        error: "File not found",
        errorType: "file_not_found",
        durationMs: 100,
      };

      learnFromAction("read_file", { path: "missing.ts" }, result, {
        attemptNumber: 1,
      });

      const patterns = getErrorPatterns();
      expect(patterns).toHaveLength(1);
      expect(patterns[0].toolName).toBe("read_file");
      expect(patterns[0].errorType).toBe("file_not_found");
    });
  });

  describe("validateToolArguments", () => {
    it("should detect missing required arguments", () => {
      const result = validateToolArguments("read_file", {});
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === "path")).toBe(true);
    });

    it("should validate regex syntax", () => {
      const result = validateToolArguments("search_files", {
        path: ".",
        regex: "[",
      }); // Invalid regex
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === "regex")).toBe(true);
    });
  });

  describe("checkPrerequisites", () => {
    it("should detect missing file prerequisites", () => {
      const result = checkPrerequisites("read_file", { availableFiles: [] });
      expect(result.met).toBe(false);
      expect(result.missingPrerequisites[0].type).toBe("file");
    });

    it("should pass when prerequisites are met", () => {
      const result = checkPrerequisites("read_file", {
        availableFiles: ["target_file"],
      });
      expect(result.met).toBe(true);
    });
  });

  describe("assessActionRisk", () => {
    it("should return low risk for read operations", () => {
      const assessment = assessActionRisk("read_file", { path: "test.ts" }, {});
      expect(assessment.level).toBe("low");
      expect(assessment.score).toBeLessThan(30);
    });

    it("should return medium risk for destructive operations", () => {
      const assessment = assessActionRisk(
        "shell",
        { command: "rm -rf folder" },
        {},
      );
      // Risk level is "medium" based on weighted scoring:
      // - destructive_potential: 80 * 0.4 = 32 (CAUTION_COMMANDS match)
      // - operation_scope: 0 * 0.3 = 0 (no wildcard, no -r flag in scope check)
      // - rollback_availability: 50 * 0.2 = 10
      // - historical_errors: 0 * 0.1 = 0
      // Total: ~42, which maps to "medium" (30-59)
      expect(assessment.level).toBe("medium");
      expect(assessment.score).toBeGreaterThan(30);
    });
  });
});
