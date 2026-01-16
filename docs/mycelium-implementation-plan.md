# MYCELIUM WORKFLOW Implementation Plan

## Overview

Implement the complete MYCELIUM WORKFLOW as a configurable mode in Open-SWE, enabling swarm intelligence through multi-agent coordination with 4 archetypes, multi-tier hierarchy, visual signal system, reputation engine, and 3D heatmap visualization.

**Scope**: Full implementation (all phases)
**Timeline**: 18-24 weeks
**Rollout**: Opt-in beta (traditional mode remains default)
**Key Feature**: Multi-squad parallel execution from day one

---

## Architecture Design

### Integration Approach: Hybrid Mode within Programmer Graph

```
Manager Graph (unchanged)
    ↓
Planner Graph (unchanged)
    ↓
Programmer Graph (MODIFIED)
    ↓
[NEW] Mode Selection Node
    ├─→ Traditional Mode (existing flow)
    │   └─→ generate-action → take-action → reviewer
    │
    └─→ MYCELIUM Mode (new flow)
        └─→ Mycelium Subgraph
            ├─→ initialize-mycelium
            ├─→ classify-task → decompose-objectives
            ├─→ form-squads (multiple parallel)
            ├─→ execute-squads (parallel execution)
            ├─→ emit-signals (RED/GREEN/BLUE/YELLOW)
            ├─→ aggregate-results
            ├─→ update-reputation
            ├─→ coordinate-tribes (if hierarchy enabled)
            └─→ generate-conclusion
```

**Key Decisions**:
- Mycelium is a **compiled subgraph** embedded in Programmer (not external graph)
- Reuses existing: tools, state management, sandbox, GitHub integration
- Mode toggle via `myceliumEnabled: boolean` in GraphConfiguration
- All agents share same sandbox session for coordination

---

## Implementation Phases

### Phase 1: Foundation & Configuration (Weeks 1-3)

**Goals**:
- Add Mycelium configuration to system
- Create mode selection logic
- Build configuration UI tab
- Establish core type definitions

**Deliverables**:
1. GraphConfiguration schema with Mycelium fields
2. Mode selection node in Programmer graph
3. Core Mycelium type definitions
4. Mycelium configuration tab in web UI
5. Feature flag system for gradual rollout

**Critical Files**:
- `/packages/shared/src/open-swe/types.ts` - Add config fields
- `/packages/shared/src/open-swe/mycelium/types.ts` - Core types (NEW)
- `/apps/open-swe/src/graphs/programmer/nodes/select-mode.ts` (NEW)
- `/apps/web/src/features/settings-page/mycelium-config.tsx` (NEW)
- `/apps/web/src/features/settings-page/index.tsx` - Add tab

**State Extension**:
```typescript
// Add to GraphAnnotation in types.ts
myceliumState: withLangGraph(
  z.object({
    mode: z.enum(['traditional', 'mycelium']),
    squads: z.array(z.custom<Squad>()),
    agentPool: z.array(z.custom<AgentProfile>()),
    reputationLedger: z.record(z.string(), z.number()),
    signalHistory: z.array(z.custom<Signal>()),
    hierarchyState: z.object({
      tribes: z.array(z.custom<Tribe>()),
      villages: z.array(z.custom<Village>()),
      cities: z.array(z.custom<City>()),
    }).optional(),
  }).optional(),
  {
    reducer: {
      schema: z.any(),
      fn: (state, update) => ({ ...state, ...update }),
    },
    default: () => undefined,
  }
)
```

---

### Phase 2: Agent Classification System (Weeks 4-6)

**Goals**:
- Implement 4 archetype system (Seer, Maker, Glue, Breaker)
- Build classification algorithm
- Map tools to archetypes
- Create agent spawning logic

**Deliverables**:
1. Agent archetype interfaces with capabilities
2. Classification algorithm (task → archetype mapping)
3. Tool subset definitions per archetype
4. Agent performance tracking
5. Specialization profiles

**Critical Files**:
- `/apps/open-swe/src/mycelium/agents/archetypes.ts` (NEW)
- `/apps/open-swe/src/mycelium/agents/classifier.ts` (NEW)
- `/apps/open-swe/src/mycelium/agents/tool-mapping.ts` (NEW)
- `/apps/open-swe/src/mycelium/agents/spawner.ts` (NEW)
- `/apps/open-swe/src/mycelium/agents/performance.ts` (NEW)

**Archetype Definitions**:
```typescript
// Seer tools: analyze-codebase-structure, design-architecture,
//             decompose-task, identify-dependencies, evaluate-approach
// Maker tools: read, write, edit, grep, shell, apply-patch
// Glue tools: review-code, resolve-merge-conflict, integrate-changes
// Breaker tools: run-tests, security-scan, mutation-testing, fuzz-testing
```

---

### Phase 3: Squad Formation & Multi-Tier Hierarchy (Weeks 7-10)

**Goals**:
- Implement squad formation algorithm
- Build multi-tier hierarchy (Squad/Tribe/Village/City)
- Enable parallel squad execution
- Create inter-squad communication

**Deliverables**:
1. Squad formation logic with archetype balancing
2. Holonic hierarchy structure
3. Representative council system (Tribe level)
4. Village consensus mechanism
5. City-level coordination
6. Parallel execution coordinator
7. Squad-to-squad messaging protocol

**Critical Files**:
- `/apps/open-swe/src/mycelium/squads/formation.ts` (NEW)
- `/apps/open-swe/src/mycelium/squads/coordinator.ts` (NEW)
- `/apps/open-swe/src/mycelium/squads/communication.ts` (NEW)
- `/apps/open-swe/src/mycelium/tribes/tribe.ts` (NEW)
- `/apps/open-swe/src/mycelium/tribes/sync.ts` (NEW)
- `/apps/open-swe/src/mycelium/villages/village.ts` (NEW)
- `/apps/open-swe/src/mycelium/villages/consensus.ts` (NEW)
- `/apps/open-swe/src/mycelium/cities/city.ts` (NEW)
- `/apps/open-swe/src/graphs/programmer/nodes/mycelium-execute.ts` (NEW)

**Hierarchy Configuration**:
```json
{
  "hierarchyEnabled": true,
  "squadSize": { "min": 5, "max": 8, "default": 6 },
  "tribesPerObjective": { "min": 2, "max": 10, "default": 3 },
  "squadsPerTribe": { "max": 10 },
  "parallelSquads": { "max": 5 },
  "syncFrequency": 30000  // Tribe sync every 30s
}
```

---

### Phase 4: Signal System & Communication (Weeks 11-13)

**Goals**:
- Implement all 4 signal types
- Build signal broadcasting system
- Create signal handlers per archetype
- Enable visual dashboard updates

**Deliverables**:
1. Signal type definitions (RED_PULSE, GREEN_FLOW, BLUE_WEB, YELLOW_SPARK)
2. Signal broadcaster with scope targeting
3. Signal handlers for each archetype
4. Signal propagation through hierarchy
5. Real-time signal feed for UI
6. WebSocket integration for live updates

**Critical Files**:
- `/apps/open-swe/src/mycelium/signals/signal-types.ts` (NEW)
- `/apps/open-swe/src/mycelium/signals/broadcaster.ts` (NEW)
- `/apps/open-swe/src/mycelium/signals/handlers.ts` (NEW)
- `/apps/open-swe/src/mycelium/signals/propagation.ts` (NEW)
- `/apps/web/src/features/mycelium-dashboard/signal-feed.tsx` (NEW)
- `/apps/web/src/hooks/useSignalStream.tsx` (NEW)

**Signal Definitions**:
```typescript
RED_PULSE: {
  purpose: "Critical failure/stop",
  triggers: ["build_failure", "test_failure", "security_vulnerability"],
  intensity: 0.0-1.0,
  blocking: boolean
}
GREEN_FLOW: {
  purpose: "Resources abundant/success",
  triggers: ["task_completed", "capacity_available", "optimization_found"],
  intensity: 0.0-1.0,
  availability: 0.0-1.0
}
BLUE_WEB: {
  purpose: "Connection needed",
  triggers: ["integration_help", "knowledge_request", "collaboration"],
  seeking: string,
  offering: string
}
YELLOW_SPARK: {
  purpose: "Innovation/new idea",
  triggers: ["breakthrough", "novel_pattern", "creative_solution"],
  novelty: 0.0-1.0,
  potential_impact: 0.0-1.0
}
```

---

### Phase 5: Trust Engine & Reputation (Weeks 14-16)

**Goals**:
- Build reputation scoring system
- Implement trust levels with privileges
- Create peer validation mechanism
- Add contribution evaluation

**Deliverables**:
1. Reputation ledger with transaction history
2. Contribution quality evaluation
3. Trust level progression (Untrusted → Probationary → Trusted → Elite)
4. Peer validation system
5. Reputation-based agent selection
6. Self-healing and degradation integration

**Critical Files**:
- `/apps/open-swe/src/mycelium/trust/reputation.ts` (NEW)
- `/apps/open-swe/src/mycelium/trust/evaluation.ts` (NEW)
- `/apps/open-swe/src/mycelium/trust/ledger.ts` (NEW)
- `/apps/open-swe/src/mycelium/trust/trust-levels.ts` (NEW)
- `/apps/open-swe/src/mycelium/trust/peer-validation.ts` (NEW)
- `/apps/open-swe/src/mycelium/evolution/selection.ts` (NEW)

**Trust Level Privileges**:
```typescript
UNTRUSTED: {
  max_squad_size: 2,
  requires_validation: true,
  allowed_tools: ["read", "grep"],
  autonomy_level: 0.3
}
ELITE: {
  max_squad_size: 10,
  requires_validation: false,
  allowed_tools: "ALL",
  autonomy_level: 1.0,
  can_lead_village: true,
  can_emit_global_signals: true
}
```

---

### Phase 6: 3D Visualization & Dashboard (Weeks 17-20)

**Goals**:
- Build 3D heatmap visualization
- Create monitoring dashboard
- Add real-time updates
- Implement interactive controls

**Deliverables**:
1. 3D heatmap using Three.js
2. System state visualization (heat levels by file/area)
3. Squad activity overlay
4. Signal visual effects
5. Interactive navigation (zoom to hotspots)
6. Dashboard with metrics and controls
7. Reputation leaderboard
8. Squad detail views

**Critical Files**:
- `/apps/web/src/features/mycelium-dashboard/index.tsx` (NEW)
- `/apps/web/src/features/mycelium-dashboard/heatmap-3d.tsx` (NEW)
- `/apps/web/src/features/mycelium-dashboard/squad-view.tsx` (NEW)
- `/apps/web/src/features/mycelium-dashboard/reputation-view.tsx` (NEW)
- `/apps/web/src/features/mycelium-dashboard/metrics-panel.tsx` (NEW)
- `/apps/web/src/lib/heatmap/renderer.ts` (NEW)
- `/apps/web/src/lib/heatmap/cell-generator.ts` (NEW)
- `/apps/web/package.json` - Add `three` and `@react-three/fiber`

**3D Heatmap Features**:
- Color coding: Red (hot/needs work) → Yellow → Blue (cool/done)
- Signal overlays: Pulsing red, flowing green, connecting blue, sparkling yellow
- Squad indicators: Show which squads are working on each area
- Interactive: Click to see squad details, zoom to problem areas
- Real-time: Updates every 2 seconds via WebSocket

---

### Phase 7: Task Decomposition & Objectives (Weeks 21-22)

**Goals**:
- Implement task decomposition algorithm
- Create micro-objective system
- Build objective tracking
- Add dependency management

**Deliverables**:
1. Task → micro-objectives decomposition
2. Objective dependency graph
3. Dynamic re-planning based on results
4. Objective completion tracking
5. Cross-squad objective coordination

**Critical Files**:
- `/apps/open-swe/src/mycelium/objectives/decomposition.ts` (NEW)
- `/apps/open-swe/src/mycelium/objectives/micro-objective.ts` (NEW)
- `/apps/open-swe/src/mycelium/objectives/dependencies.ts` (NEW)
- `/apps/open-swe/src/mycelium/objectives/tracker.ts` (NEW)

---

### Phase 8: Testing, Polish & Documentation (Weeks 23-24)

**Goals**:
- Comprehensive testing
- Performance optimization
- Documentation
- Beta user onboarding

**Deliverables**:
1. Unit tests for all Mycelium modules
2. Integration tests for multi-squad coordination
3. Performance benchmarks vs traditional mode
4. User documentation (setup, configuration, monitoring)
5. Developer documentation (architecture, extending Mycelium)
6. Migration guide (traditional → Mycelium)
7. Troubleshooting guide

**Testing Focus**:
- Squad formation correctness
- Parallel execution safety (no race conditions)
- Signal propagation accuracy
- Reputation calculation correctness
- 3D visualization performance
- WebSocket reliability
- Graceful degradation

---

## Complete File Structure

```
apps/open-swe/src/
├── mycelium/                           # NEW DIRECTORY
│   ├── agents/
│   │   ├── archetypes.ts              # Seer, Maker, Glue, Breaker types
│   │   ├── classifier.ts              # Task → archetype classification
│   │   ├── spawner.ts                 # Agent creation logic
│   │   ├── tool-mapping.ts            # Archetype → tool subsets
│   │   └── performance.ts             # Performance tracking
│   ├── squads/
│   │   ├── formation.ts               # Squad creation algorithm
│   │   ├── coordinator.ts             # Parallel execution manager
│   │   ├── communication.ts           # Inter-agent messaging
│   │   └── dissolution.ts             # Squad cleanup
│   ├── tribes/
│   │   ├── tribe.ts                   # Tribe structure
│   │   ├── sync.ts                    # Representative sync meetings
│   │   └── memory.ts                  # Collective tribal memory
│   ├── villages/
│   │   ├── village.ts                 # Village structure
│   │   ├── consensus.ts               # Consensus mechanism
│   │   └── knowledge-base.ts          # Village knowledge
│   ├── cities/
│   │   └── city.ts                    # City layer coordination
│   ├── core/
│   │   ├── corpus.ts                  # Central Corpus (global coordination)
│   │   ├── signal-generator.ts        # Signal emission
│   │   └── health-monitor.ts          # System health tracking
│   ├── signals/
│   │   ├── signal-types.ts            # Signal definitions
│   │   ├── broadcaster.ts             # Signal broadcasting
│   │   ├── handlers.ts                # Signal response logic
│   │   └── propagation.ts             # Hierarchy propagation
│   ├── trust/
│   │   ├── reputation.ts              # Reputation scoring
│   │   ├── evaluation.ts              # Contribution evaluation
│   │   ├── ledger.ts                  # Transaction history
│   │   ├── trust-levels.ts            # Trust level management
│   │   └── peer-validation.ts         # Peer review system
│   ├── objectives/
│   │   ├── decomposition.ts           # Task → micro-objectives
│   │   ├── micro-objective.ts         # MicroObjective type
│   │   ├── dependencies.ts            # Dependency graph
│   │   └── tracker.ts                 # Objective tracking
│   ├── evolution/
│   │   ├── competition.ts             # Solution competition
│   │   ├── selection.ts               # Natural selection
│   │   ├── cross-pollination.ts       # Idea merging
│   │   └── emergence.ts               # Emergent pattern detection
│   └── utils/
│       ├── stigmergy.ts               # Environmental coordination
│       └── metrics.ts                 # AGI emergence metrics
│
├── graphs/programmer/
│   ├── index.ts                       # MODIFY: Add mycelium subgraph
│   └── nodes/
│       ├── select-mode.ts             # NEW: Traditional vs Mycelium router
│       ├── mycelium-execute.ts        # NEW: Mycelium execution coordinator
│       └── mycelium-aggregate.ts      # NEW: Result aggregation
│
packages/shared/src/open-swe/
├── mycelium/
│   ├── types.ts                       # NEW: Core Mycelium types
│   ├── signals.ts                     # NEW: Signal type exports
│   └── constants.ts                   # NEW: Mycelium constants
├── types.ts                           # MODIFY: Add myceliumState, config
│
apps/web/src/
├── features/
│   ├── settings-page/
│   │   ├── mycelium-config.tsx        # NEW: Mycelium configuration tab
│   │   └── index.tsx                  # MODIFY: Add Mycelium tab
│   ├── mycelium-dashboard/            # NEW DIRECTORY
│   │   ├── index.tsx                  # Dashboard main page
│   │   ├── heatmap-3d.tsx            # 3D heatmap visualization
│   │   ├── squad-view.tsx            # Squad status cards
│   │   ├── reputation-view.tsx       # Reputation leaderboard
│   │   ├── signal-feed.tsx           # Live signal feed
│   │   ├── metrics-panel.tsx         # System metrics
│   │   └── controls.tsx              # Interactive controls
│   └── mycelium-monitor/             # NEW: Real-time monitoring
│       └── live-activity.tsx         # Live squad activity
├── lib/
│   └── heatmap/                      # NEW: 3D heatmap library
│       ├── renderer.ts               # Three.js renderer
│       ├── cell-generator.ts         # Heatmap cell generation
│       ├── signal-effects.ts         # Visual signal effects
│       └── camera-controller.ts      # Camera navigation
├── hooks/
│   ├── useSignalStream.tsx           # NEW: WebSocket signal stream
│   └── useMyceliumState.tsx          # NEW: Mycelium state management
└── package.json                      # MODIFY: Add three, @react-three/fiber
```

---

## Configuration Schema

Add to `/packages/shared/src/open-swe/types.ts`:

```typescript
// In GraphConfigurationMetadata
myceliumEnabled: {
  x_open_swe_ui_config: {
    type: "boolean",
    default: false,
    label: "Enable Mycelium Mode",
    description: "Enable multi-agent swarm intelligence mode. When enabled, tasks are executed by autonomous squads of specialized agents working in parallel. This is an experimental feature.",
  },
},

myceliumConfig: {
  x_open_swe_ui_config: {
    type: "json",
    default: JSON.stringify({
      // Squad Configuration
      squad: {
        minSize: 5,
        maxSize: 8,
        defaultSize: 6,
        maxParallelSquads: 5,
      },

      // Archetype Distribution
      archetypes: {
        seer: { min: 0, max: 2, preferred: 1 },
        maker: { min: 2, max: 5, preferred: 3 },
        glue: { min: 0, max: 2, preferred: 1 },
        breaker: { min: 0, max: 2, preferred: 1 },
      },

      // Hierarchy Settings
      hierarchy: {
        enabled: true,
        tribesPerObjective: 3,
        squadsPerTribe: 10,
        villagesPerCity: 10,
        syncFrequencyMs: 30000,
      },

      // Reputation System
      reputation: {
        enabled: true,
        thresholds: {
          probationary: 50,
          trusted: 70,
          elite: 90,
        },
        peerValidation: true,
        initialReputation: 50,
      },

      // Signal System
      signals: {
        enabled: true,
        types: ["RED_PULSE", "GREEN_FLOW", "BLUE_WEB", "YELLOW_SPARK"],
        globalBroadcast: false,
        intensityThreshold: 0.5,
      },

      // Execution Strategy
      execution: {
        parallelExecution: true,
        competitiveSquads: true,
        crossPollination: true,
        emergenceDetection: true,
      },

      // Visualization
      visualization: {
        heatmapEnabled: true,
        updateFrequencyMs: 2000,
        maxHistoryPoints: 1000,
      },
    }),
    label: "Mycelium Configuration",
    description: "Advanced JSON configuration for Mycelium multi-agent system. Controls squad composition, hierarchy, reputation, signals, and visualization settings.",
  },
},
```

---

## Verification & Testing

### Phase 1 Verification:
- [ ] Mycelium tab appears in settings
- [ ] Toggle enables/disables mode
- [ ] Configuration saves to Zustand store
- [ ] Mode selection node routes correctly
- [ ] Traditional mode still works when disabled

### Phase 2 Verification:
- [ ] Agent classifier assigns correct archetypes
- [ ] Tool subsets match archetype definitions
- [ ] Agent spawning creates valid profiles
- [ ] Performance tracking persists across sessions

### Phase 3 Verification:
- [ ] Squad formation balances archetypes correctly
- [ ] Multiple squads execute in parallel
- [ ] No race conditions in shared state
- [ ] Tribe sync meetings occur on schedule
- [ ] Village consensus reaches decisions
- [ ] City layer coordinates multiple villages

### Phase 4 Verification:
- [ ] All 4 signal types emit correctly
- [ ] Signals propagate through hierarchy
- [ ] Signal handlers respond appropriately
- [ ] WebSocket delivers real-time updates
- [ ] Signal feed updates in UI

### Phase 5 Verification:
- [ ] Reputation scores calculate correctly
- [ ] Trust levels progress as expected
- [ ] Peer validation works
- [ ] Reputation affects agent selection
- [ ] Elite agents have correct privileges

### Phase 6 Verification:
- [ ] 3D heatmap renders without errors
- [ ] Color coding reflects system state
- [ ] Signal overlays display correctly
- [ ] Interactive navigation works smoothly
- [ ] Dashboard updates in real-time (2s refresh)
- [ ] Squad details are accurate
- [ ] Reputation leaderboard updates

---

## Timeline & Milestones

**Month 1-2 (Weeks 1-8)**: Foundation + Agent System + Squad Formation
- Milestone: Single squad can execute simple task end-to-end
- Demo: Configuration UI + basic execution

**Month 3 (Weeks 9-12)**: Hierarchy + Signals
- Milestone: Multi-tier hierarchy functional, signals propagate
- Demo: Multiple squads coordinating via signals

**Month 4 (Weeks 13-16)**: Trust Engine + Signals Complete
- Milestone: Reputation system working, all 4 signals active
- Demo: Agent trust progression, signal-based coordination

**Month 5 (Weeks 17-20)**: 3D Visualization
- Milestone: Full 3D heatmap dashboard
- Demo: Live system monitoring with real-time updates

**Month 6 (Weeks 21-24)**: Testing + Polish + Beta Launch
- Milestone: Production-ready with comprehensive tests
- Demo: Full system showcase, invite beta users

**Success Criteria for Beta Launch**:
- All 6 phases complete and tested
- Performance: 2x faster than traditional mode
- Stability: 95%+ success rate
- Documentation: Complete user and developer guides
- 10 beta users actively testing

---

## Risk Mitigation

**Top Risks**:
1. **3D Visualization Performance**: Three.js with many cells could be slow
   - Mitigation: Implement LOD (level of detail), cull off-screen cells, optimize with instancing

2. **Parallel Execution Race Conditions**: Multiple agents modifying same files
   - Mitigation: File-level locking, conflict detection, Glue agent for resolution

3. **Token Cost Explosion**: Many parallel agents = high LLM usage
   - Mitigation: Token budgets per squad, use cheaper models for simple tasks, aggressive caching

4. **Complexity Overwhelms Users**: Too many settings, confusing UI
   - Mitigation: Sane defaults, preset configurations, progressive disclosure, tooltips

5. **Reputation Gaming**: Agents "learn" to maximize score
   - Mitigation: Peer validation, diverse evaluation criteria, random audits

**Rollback Plan**:
- Traditional mode always available (fallback)
- Kill switch: `myceliumEnabled: false` globally
- Per-user disable if issues reported
- Checkpoints allow reverting mid-task

---

## Success Definition

Mycelium mode is successful when:
1. ✅ Users can enable it via single toggle
2. ✅ Tasks complete 2x faster than traditional mode
3. ✅ 3D dashboard provides clear visibility
4. ✅ Reputation system drives better outcomes
5. ✅ 10+ beta users report positive experience
6. ✅ No critical bugs in production
7. ✅ Documentation enables self-service adoption
8. ✅ Path to AGI emergence measurable via indicators

**Long-term Vision**: Mycelium becomes the default mode, traditional mode is legacy. System demonstrates emergent intelligence, creative problem-solving, and autonomous improvement.
