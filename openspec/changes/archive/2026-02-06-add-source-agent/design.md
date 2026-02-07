## Context

Dispatch currently has two ways to add sources:
1. **RSS**: User provides a feed URL, system parses it directly
2. **Web (Agentic)**: User provides a URL, system runs skill-generator agent to create extraction rules

Both use a simple form dialog (`AddSourceDialog.tsx`) that blocks while processing. The existing skill-generator agent (`skill-generator.ts`) already demonstrates agentic tool use with Vercel AI SDK.

The system uses model routing with task types including "skill" for agent-based tasks. This will be reused for the chatbot agent.

## Goals / Non-Goals

**Goals:**
- Create a reusable chat UI framework that can host different agent types
- Build an "add-source" agent that intelligently guides users through source onboarding
- Detect and evaluate RSS feeds automatically before falling back to skill generation
- Provide a foundation for future agents (article reading assistant, etc.)
- Stream agent responses for responsive UX

**Non-Goals:**
- Multi-turn memory/history persistence (conversations are ephemeral per session)
- Voice or multi-modal input
- Agent-to-agent communication
- Custom training or fine-tuning

## Decisions

### 1. Chat UI Architecture: Streaming with Vercel AI SDK

**Decision**: Use Vercel AI SDK's `useChat` hook with custom message rendering.

**Rationale**:
- Already using Vercel AI SDK for `generateText` in skill-generator
- `useChat` provides streaming, message state, and abort handling out of the box
- Consistent with existing tech stack

**Alternatives considered**:
- Custom WebSocket implementation: More control but significant boilerplate
- Polling-based: Simpler but poor UX for long-running agent tasks

### 2. Agent Definition Pattern: Tool-based with System Prompt

**Decision**: Define agents as a combination of:
- System prompt (personality, capabilities, constraints)
- Tool set (available actions)
- Initial user message template

```typescript
interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  tools: Record<string, ToolDefinition>;
  initialMessage?: string;  // Optional greeting
}
```

**Rationale**:
- Mirrors existing skill-generator pattern
- Tools are already typed with Zod schemas via Vercel AI SDK
- Easy to add new agents by defining new configurations

### 3. Add-Source Agent Flow

**Decision**: Multi-step flow with decision points:

```
1. Agent greets, asks for URL
2. User provides URL
3. Agent fetches and analyzes:
   a. Check for RSS feed (common paths + link tags)
   b. Fetch robots.txt
   c. If RSS found, fetch and evaluate feed quality
4. Decision point:
   - RSS with full content → offer to add as RSS source
   - RSS with summaries only → ask user: RSS or agentic extraction?
   - No RSS → proceed to skill generation
5. If skill generation needed:
   - Pass robots.txt to skill-generator
   - Stream progress to user
6. Confirm source added, end conversation
```

**Rationale**:
- Gives users control over RSS vs. agentic choice
- Respects robots.txt for crawling guidance
- Leverages existing skill-generator for complex extraction

### 4. Backend Architecture: Dedicated Chat Route

**Decision**: New tRPC route `agents.chat` that handles streaming via SSE.

```typescript
// packages/server/src/routes/agents.ts
agentsRouter = t.router({
  chat: t.procedure
    .input(z.object({
      agentId: z.string(),
      messages: z.array(messageSchema),
    }))
    .mutation(async ({ input, ctx }) => {
      // Returns streaming response via Vercel AI SDK
    }),
});
```

**Rationale**:
- Separates chat concerns from existing routes
- tRPC mutations can return streaming responses
- Keeps agent logic server-side where tools execute

**Alternatives considered**:
- WebSocket: Overkill for request-response pattern
- Separate HTTP endpoint: Loses tRPC type safety

### 5. UI Entry Point: Replace AddSourceDialog

**Decision**: Replace `AddSourceDialog` with a chat-based `AddSourceChat` component that opens in a larger dialog.

**Rationale**:
- Conversational interface is more guided than forms
- Same trigger point (+ Add button) for discoverability
- Larger dialog accommodates chat history

### 6. Agent Tools for Add-Source

**Decision**: Create these tools for the add-source agent:

| Tool | Description |
|------|-------------|
| `check_rss` | Fetch URL, detect RSS feeds, return feed info |
| `evaluate_feed` | Parse RSS feed, check if articles have full content |
| `fetch_robots` | Fetch and parse robots.txt |
| `add_rss_source` | Add source with RSS strategy |
| `generate_skill` | Invoke skill-generator with optional robots.txt context |

**Rationale**:
- Atomic tools let the agent reason and make decisions
- Reuses existing scraper and skill-generator logic
- Robots.txt passed to skill-generator as context

### 7. Skill-Generator Enhancement

**Decision**: Extend `generateSkill` to accept optional robots.txt content:

```typescript
async function generateSkill(
  sourceId: number,
  homepageUrl: string,
  sourceName: string,
  options?: {
    robotsTxt?: string;
    configOverride?: ModelsConfig;
  }
): Promise<SkillGenerationResult>
```

The robots.txt is included in the agent's system prompt for crawling guidance.

**Rationale**:
- Minimal API change
- Agent can use robots.txt to avoid forbidden paths
- Non-breaking for existing callers

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| **Agent may hallucinate or make wrong decisions** | Tools are atomic and validated; agent can only perform defined actions |
| **Long response times for skill generation** | Streaming shows progress; existing skill-generator already handles this |
| **RSS detection may miss feeds** | Check common paths (`/feed`, `/rss`, `/atom.xml`) plus HTML `<link>` tags |
| **Chat UI adds complexity** | Reusable framework means cost is paid once for multiple agents |
| **Breaking change to AddSourceDialog** | Keep form as fallback option via settings toggle (optional) |

## Open Questions

1. **Should chat history persist across sessions?** Current design: No, ephemeral. Revisit if users want to resume.
2. **Maximum agent turns before forcing completion?** Suggest 20 turns to prevent runaway conversations.
3. **Should the agent have access to existing sources?** Could help avoid duplicates, but increases scope.
