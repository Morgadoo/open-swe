/**
 * Tests for task-decomposition module
 */

import {
  analyzeTaskComplexity,
  shouldDecomposeTask,
  decomposeTask,
  generateDecompositionPrompt,
  parseDecompositionResponse,
  validateDecomposition,
  trackSubtaskProgress,
  mergeSubtaskResults,
  identifyDependencies,
  getReadySubtasks,
  isDecompositionComplete,
} from "../task-decomposition.js";
import type { TaskDescription } from "../task-decomposition.js";

describe("TaskDecomposition", () => {
  const simpleTask: TaskDescription = {
    id: "task-1",
    title: "Fix typo",
    description: "Fix a typo in README.md",
  };

  const complexTask: TaskDescription = {
    id: "task-2",
    title: "Refactor auth",
    description:
      "Refactor the entire authentication system to use OAuth2 and migrate the database schema. This involves multiple files and security considerations.",
    constraints: ["Must be backward compatible", "No downtime"],
  };

  describe("analyzeTaskComplexity", () => {
    it("should return low complexity for simple tasks", () => {
      const analysis = analyzeTaskComplexity(simpleTask);
      expect(analysis.level).toBe("trivial");
      expect(analysis.score).toBeLessThan(30);
    });

    it("should return moderate complexity for complex tasks", () => {
      const analysis = analyzeTaskComplexity(complexTask);
      // The task description scores as "moderate" (41-60) based on:
      // - keyword_complexity: ~60 (refactor, authentication, database, schema)
      // - file_scope: ~15 (1 file estimated)
      // - operation_complexity: ~50 (modify operation)
      // - ambiguity: ~20 (reasonably clear)
      // - constraints: ~30 (2 constraints)
      // - specification_completeness: ~30 (missing expected output/context)
      // Weighted average: ~45, which maps to "moderate"
      expect(analysis.level).toBe("moderate");
      expect(analysis.score).toBeGreaterThan(40);
    });

    it("should identify complexity factors", () => {
      const analysis = analyzeTaskComplexity(complexTask);
      expect(
        analysis.factors.some((f) => f.name === "keyword_complexity"),
      ).toBe(true);
      expect(
        analysis.factors.some((f) => f.name === "operation_complexity"),
      ).toBe(true);
    });
  });

  describe("shouldDecomposeTask", () => {
    it("should return false for simple tasks", () => {
      const analysis = analyzeTaskComplexity(simpleTask);
      expect(shouldDecomposeTask(analysis)).toBe(false);
    });

    it("should return false for moderate complexity tasks", () => {
      const analysis = analyzeTaskComplexity(complexTask);
      // shouldDecomposeTask returns true only when:
      // - score > maxComplexityScore (60) OR
      // - level is "complex" or "very_complex" OR
      // - estimatedSteps > 5 OR
      // - riskLevel is "high"
      // The complexTask scores as "moderate" (~45), so it doesn't meet these criteria
      expect(shouldDecomposeTask(analysis)).toBe(false);
    });
  });

  describe("decomposeTask", () => {
    it("should create subtasks for a task", () => {
      const analysis = analyzeTaskComplexity(complexTask);
      const decomposition = decomposeTask(complexTask, analysis);

      expect(decomposition.subtasks.length).toBeGreaterThan(1);
      expect(decomposition.subtasks[0].parentId).toBe(complexTask.id);
      expect(decomposition.dependencies.nodes).toHaveLength(
        decomposition.subtasks.length,
      );
    });
  });

  describe("generateDecompositionPrompt", () => {
    it("should include task details in prompt", () => {
      const prompt = generateDecompositionPrompt(complexTask, {
        availableTools: ["read", "write"],
      });
      expect(prompt).toContain(complexTask.title);
      expect(prompt).toContain("OAuth2");
      expect(prompt).toContain("read, write");
    });
  });

  describe("parseDecompositionResponse", () => {
    it("should parse JSON from LLM response", () => {
      const response =
        "```json\n" +
        JSON.stringify({
          subtasks: [
            { title: "Step 1", description: "Do 1", estimatedMinutes: 10 },
            {
              title: "Step 2",
              description: "Do 2",
              dependencies: ["0"],
              estimatedMinutes: 20,
            },
          ],
        }) +
        "\n```";

      const subtasks = parseDecompositionResponse(response, complexTask);

      expect(subtasks).toHaveLength(2);
      expect(subtasks[0].title).toBe("Step 1");
      expect(subtasks[1].dependencies).toHaveLength(1);
    });
  });

  describe("validateDecomposition", () => {
    it("should return valid for correct decomposition", () => {
      const analysis = analyzeTaskComplexity(complexTask);
      const decomposition = decomposeTask(complexTask, analysis);
      const result = validateDecomposition(decomposition, complexTask);

      expect(result.valid).toBe(true);
    });

    it("should detect cycles in dependencies", () => {
      const analysis = analyzeTaskComplexity(complexTask);
      const decomposition = decomposeTask(complexTask, analysis);

      // Create a cycle
      const s1 = decomposition.subtasks[0];
      const s2 = decomposition.subtasks[1];
      s1.dependencies = [s2.id];
      s2.dependencies = [s1.id];
      decomposition.dependencies.hasCycles = true;

      const result = validateDecomposition(decomposition, complexTask);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("cycles"))).toBe(true);
    });
  });

  describe("trackSubtaskProgress", () => {
    it("should calculate completion percentage", () => {
      const analysis = analyzeTaskComplexity(complexTask);
      const decomposition = decomposeTask(complexTask, analysis);
      const s1 = decomposition.subtasks[0];

      const report = trackSubtaskProgress(decomposition, [s1.id]);

      expect(report.completedSubtasks).toBe(1);
      expect(report.percentComplete).toBeGreaterThan(0);
    });
  });

  describe("mergeSubtaskResults", () => {
    it("should combine outputs and errors", () => {
      const results = [
        { subtaskId: "1", success: true, output: "Out 1", durationMs: 100 },
        { subtaskId: "2", success: false, error: "Err 2", durationMs: 200 },
      ];

      const merged = mergeSubtaskResults(results);

      expect(merged.success).toBe(false);
      expect(merged.outputs).toContain("Out 1");
      expect(merged.errors[0]).toContain("Err 2");
      expect(merged.totalDurationMs).toBe(300);
    });
  });

  describe("identifyDependencies", () => {
    it("should build dependency graph", () => {
      const subtasks = [
        { id: "1", title: "T1", dependencies: [], order: 1 } as any,
        { id: "2", title: "T2", dependencies: ["1"], order: 2 } as any,
      ];

      const graph = identifyDependencies(subtasks);

      expect(graph.nodes).toEqual(["1", "2"]);
      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0].from).toBe("1");
      expect(graph.edges[0].to).toBe("2");
    });
  });

  describe("getReadySubtasks", () => {
    it("should return subtasks with met dependencies", () => {
      const analysis = analyzeTaskComplexity(complexTask);
      const decomposition = decomposeTask(complexTask, analysis);

      // Initially, only the first subtask (or those with no deps) should be ready
      const ready = getReadySubtasks(decomposition);
      expect(ready.length).toBeGreaterThan(0);
      expect(ready.every((s) => s.dependencies.length === 0)).toBe(true);
    });
  });

  describe("isDecompositionComplete", () => {
    it("should return true when all subtasks are completed", () => {
      const analysis = analyzeTaskComplexity(complexTask);
      const decomposition = decomposeTask(complexTask, analysis);

      const completedDecomp = {
        ...decomposition,
        subtasks: decomposition.subtasks.map((s) => ({
          ...s,
          status: "completed" as const,
        })),
      };

      expect(isDecompositionComplete(completedDecomp)).toBe(true);
    });
  });
});
