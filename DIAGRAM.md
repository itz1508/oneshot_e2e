# OneShot — Architecture & Workflow DAGs

This document defines the core architecture, state machines, and dependencies of OneShot as established in `ARCHITECTURE.md`.

---

## 1. The 3 Distinct Pathways from Normal Chat

OneShot is **not** an automatic conveyor belt. From Normal Chat, the user deliberately chooses between three distinct, isolated pathways:

```mermaid
flowchart TD
    NORMAL_CHAT["💬 Normal Chat (Composer)"]
    
    NORMAL_CHAT -->|"1. Ordinary Request"| MAIN_CHAT["💬 Main Chat\n• Conversational response\n• Explanations & quick answers\n• Does NOT trigger research or planning"]
    
    NORMAL_CHAT -->|"2. Choose Research"| RES_FLOW["🔍 Research Workflow\n• Scans documentation & codebase\n• Emits structured ResearchBundle\n• Stops at handoff boundary"]
    
    NORMAL_CHAT -->|"3. Choose Design_Planning"| PLAN_FLOW["🧭 Design_Planning Workflow\n• 5 formal reviews (Coverage, Deps, etc.)\n• Generates actionable implementation plan\n• Stops at human approval"]

    RES_FLOW --> READY_FOR_PLANNING["🛑 READY_FOR_PLANNING\n(Handoff Boundary · STOPS)"]
    
    READY_FOR_PLANNING -.->|"ResearchBundle can be input to"| PLAN_FLOW
    
    PLAN_FLOW --> APPROVED_PLAN["🛑 APPROVED PLAN\n(Human Gate 2 Approval · STOPS)"]
    
    APPROVED_PLAN -.->|"Consumed later by"| IMPL_RT["📦 Implementation Runtime\n(Separate runtime · Executes code & 391 tests)"]

    classDef chat fill:#0e1e38,stroke:#3b82f6,stroke-width:2px,color:#f8fafc;
    classDef res fill:#082f49,stroke:#06b6d4,stroke-width:2px,color:#f8fafc;
    classDef plan fill:#3b0764,stroke:#a855f7,stroke-width:2px,color:#f8fafc;
    classDef stop fill:#4c0519,stroke:#f43f5e,stroke-width:2px,color:#fff1f2;
    classDef exec fill:#064e3b,stroke:#10b981,stroke-width:2px,color:#f8fafc;

    class NORMAL_CHAT,MAIN_CHAT chat;
    class RES_FLOW res;
    class PLAN_FLOW plan;
    class READY_FOR_PLANNING,APPROVED_PLAN stop;
    class IMPL_RT exec;
```

---

## 2. Three Distinct Owners, Boundary Dependencies & Prerequisite Contracts

Each owner requires explicit input dependencies and stops at its boundary. The `ImplementationRuntime` is legally constructed **only** when an `ApprovedPlan` is provided:

```mermaid
flowchart TD
    %% ─────────────────────────────────────────────────────────────
    %% OWNER 1: RESEARCH
    %% ─────────────────────────────────────────────────────────────
    subgraph O1["Owner 1: Research Skill"]
        subgraph O1_DEPS["Research Input Dependencies"]
            D_PROMPT["User Intent / Prompt"]
            D_MODEL["Researcher Model Config (Flash / Pro)"]
            D_SEARCH["SearchConfig (Tavily external search / none)"]
        end
        O1_DEPS --> R_RUN["7-Phase Research Workflow\n(ACTIVE ➔ RECONCILING ➔ RESEARCHING ➔ DRAFTING\n➔ BASELINE_VALIDATING ➔ REVIEW)"]
        R_RUN --> R_BUNDLE[/"Output: ResearchBundle (audit_id)\n• Sources · Gaps · Alternatives\n• Decision owner: Design_Planning"/]
        R_BUNDLE --> R_STOP(["🛑 STOP · READY_FOR_PLANNING\n(Handoff Boundary)"])
    end

    %% ─────────────────────────────────────────────────────────────
    %% BOUNDARY 1: GATE 1
    %% ─────────────────────────────────────────────────────────────
    R_STOP --> GATE1{"🚪 Boundary 1: Human Gate 1\nHuman verifies research findings"}

    %% ─────────────────────────────────────────────────────────────
    %% OWNER 2: DESIGN_PLANNING
    %% ─────────────────────────────────────────────────────────────
    subgraph O2["Owner 2: Design_Planning Skill"]
        subgraph O2_INPUTS["PlannerInput Contract Dependencies"]
            IN_INTENT["userIntent: string"]
            IN_REPO["repositoryState: string"]
            IN_ARCH["existingArchitecture: string"]
            IN_RECEIPTS["existingPhaseReceipts & existingBaselines"]
            IN_BUNDLE["researchBundle?: ResearchBundle (from Gate 1)"]
        end
        
        O2_INPUTS --> P_AUDIT["Planner 5 Systematic Reviews:\n1. Coverage Review\n2. Dependency Review (packages, modules & tree)\n3. Structure Review\n4. Fixture Review\n5. Goal Review"]
        
        P_AUDIT --> P_PLAN[/"Output: ApprovedPlan Artifact\n• planId: string\n• steps: string[]\n• reviews: PlannerReview[]\n• auditId?: string"/]
        
        P_PLAN --> P_STOP(["🛑 STOP · PRE_BUILD_REVIEWED\n(Run Ends Without Implementation Theater)"])
    end

    GATE1 -->|"Explicit User Action\n(canInvokeDesignPlanning)"| O2_INPUTS

    %% ─────────────────────────────────────────────────────────────
    %% BOUNDARY 2: GATE 2
    %% ─────────────────────────────────────────────────────────────
    P_STOP --> GATE2{"🚪 Boundary 2: Human Gate 2\nUser inspects plan diffs & approves"}

    %% ─────────────────────────────────────────────────────────────
    %% OWNER 3: IMPLEMENTATION RUNTIME
    %% ─────────────────────────────────────────────────────────────
    subgraph O3["Owner 3: Implementation Runtime"]
        subgraph O3_DEPS["ImplementationRuntime Construction Dependencies"]
            DEP_PLAN["ApprovedPlan (strictly required)\n• Throws error if missing or without planId"]
            DEP_SANDBOX["CompositeBackend 4 Partitions:\n• /workspace/ (Physical disk durable code)\n• /scratch/ (Thread RAM) · /memories/ (Cross-thread)\n• /artifacts/ (Frozen hash packages)"]
            DEP_REASONER["Offline Python Reasoner & Subprocess IPC\n(reasoning_engine.py · SHA-256 fixture proofs)"]
            DEP_TESTS["Test Suite & Verification Matrix\n(391 Node/TS tests + manifest verification)"]
        end

        O3_DEPS --> EXEC_CHAIN["Strict 7-Phase Execution Lifecycle (One phase at a time):\nIMPLEMENTATION ➔ GAP_DISCOVERY ➔ GAP_RESOLUTION\n➔ VERIFICATION ➔ RECEIPT ➔ PROMOTION ➔ CLOSED"]
        
        EXEC_CHAIN --> EXEC_RECEIPT(["🏁 Sealed Run Receipt\n(Evidence-backed proof: Expected == Observed)"])
    end

    GATE2 -->|"User Click 'Approve Plan & Build'\n(new ImplementationRuntime(approvedPlan))"| O3_DEPS

    %% ─────────────────────────────────────────────────────────────
    %% STYLING
    %% ─────────────────────────────────────────────────────────────
    classDef o1 fill:#082f49,stroke:#06b6d4,stroke-width:1.5px,color:#f8fafc;
    classDef o2 fill:#3b0764,stroke:#a855f7,stroke-width:1.5px,color:#f8fafc;
    classDef o3 fill:#064e3b,stroke:#10b981,stroke-width:1.5px,color:#f8fafc;
    classDef gate fill:#451a03,stroke:#f59e0b,stroke-width:2px,color:#fef3c7;
    classDef stop fill:#4c0519,stroke:#f43f5e,stroke-width:2px,color:#fff1f2;
    classDef dep fill:#0f172a,stroke:#3b82f6,stroke-width:1px,color:#94a3b8;

    class O1,R_RUN o1;
    class O2,P_AUDIT o2;
    class O3,EXEC_CHAIN o3;
    class GATE1,GATE2 gate;
    class R_STOP,P_STOP stop;
    class O1_DEPS,O2_INPUTS,O3_DEPS dep;
```

---

## 3. The `[research]` Drawer Is Configuration, NOT "Start Now"

Opening the research drawer in the UI does **not** trigger a run:

```mermaid
flowchart TD
    OPEN_DRAWER["User opens [research] Drawer in UI"] --> CFG_STATE["Drawer is open for CONFIGURATION ONLY:\n• Select Research Model (Flash / Pro)\n• Toggle External Tavily Search"]
    
    CFG_STATE --> DECISION{"User submits a message in Composer:\nIs 'Use Research' enabled for THIS message?"}
    
    DECISION -->|"NO (Default)"| CHAT_RUN["Executes as Ordinary Chat Request\n(Zero research overhead)"]
    DECISION -->|"YES"| RES_RUN["Executes Research Skill\n(Stops at READY_FOR_PLANNING)"]

    classDef ui fill:#0e1e38,stroke:#3b82f6,stroke-width:1.5px,color:#f8fafc;
    classDef dec fill:#1e293b,stroke:#a855f7,stroke-width:1.5px,color:#f8fafc;
    classDef out fill:#064e3b,stroke:#10b981,stroke-width:1.5px,color:#f8fafc;

    class OPEN_DRAWER,CFG_STATE ui;
    class DECISION dec;
    class CHAT_RUN,RES_RUN out;
```

---

## 4. End-to-End Orchestration with Real-Time SSE Streams

```mermaid
flowchart TD
    subgraph UI_TIER["Frontend Tier (Next.js 16)"]
        COMP["Composer.tsx\n(Enter to send · Shift+Enter newline · 44px ➔ 160px)"]
        DRAWER["ContextReviewDrawer.tsx\n(Tasks Rail · Sandbox Partitions · Gate Controls)"]
    end

    subgraph SSE_TIER["Streaming Transport (DeepAgents SSE)"]
        POST_REQ["POST /api/agent/stream"]
        SSE_DELTAS["Live Deltas: stream.messages · stream.tool_calls\nstream.subagents · stream.values.todos"]
    end

    subgraph BACKEND_TIER["Backend Runtime & Sandbox"]
        AUTH_ROUTER{"Live Credentials?"}
        PY_SUB["Offline Python Subprocess IPC\n(reasoning_engine.py · SHA-256 fixture proof)"]
        STRANDS_AGENT["Live Model Agent\n(Gemini 3.5 Flash / OpenAI fallback)"]
        SANDBOX["CompositeBackend Sandbox\n(/workspace/ · /scratch/ · /memories/ · /artifacts/)\nvirtual_mode: ENFORCED · path_traversal: BLOCKED"]
        TESTS["Evaluation Matrix\n(391 Tests · Manifest parity)"]
        LEDGER["SessionLedger Sealed Checkpoint"]
    end

    COMP --> POST_REQ
    POST_REQ --> SSE_DELTAS
    SSE_DELTAS -.->|"Live state projections"| DRAWER

    POST_REQ --> AUTH_ROUTER
    AUTH_ROUTER -->|"No credentials"| PY_SUB
    AUTH_ROUTER -->|"Credentials present"| STRANDS_AGENT

    PY_SUB --> SANDBOX
    STRANDS_AGENT --> SANDBOX
    SANDBOX --> TESTS
    TESTS --> LEDGER

    classDef blue fill:#0e1e38,stroke:#3b82f6,stroke-width:1.5px,color:#f8fafc;
    classDef purple fill:#3b0764,stroke:#a855f7,stroke-width:1.5px,color:#f8fafc;
    classDef green fill:#064e3b,stroke:#10b981,stroke-width:1.5px,color:#f8fafc;

    class UI_TIER,COMP,DRAWER blue;
    class SSE_TIER,POST_REQ,SSE_DELTAS purple;
    class BACKEND_TIER,AUTH_ROUTER,PY_SUB,STRANDS_AGENT,SANDBOX,TESTS,LEDGER green;
```
