## 1. Skill-Generator Enhancement

- [x] 1.1 Refactor `generateSkill` function signature to accept options object with optional `robotsTxt` and `configOverride`
- [x] 1.2 Update `discoverSkillWithAgent` system prompt to include robots.txt guidance when provided
- [x] 1.3 Update existing callers (`sources.add`, `regenerateSkill`) to use new signature
- [x] 1.4 Add tests for skill generation with and without robots.txt context

## 2. Agent Framework Backend

- [x] 2.1 Create `AgentDefinition` type in `packages/server/src/services/agents/types.ts`
- [x] 2.2 Create agent registry with `getAgent(id)` and `registerAgent()` functions
- [x] 2.3 Create `packages/server/src/routes/agents.ts` with `agents.chat` tRPC procedure
- [x] 2.4 Implement streaming response using Vercel AI SDK `streamText`
- [x] 2.5 Add agent router to main tRPC router in `packages/server/src/trpc.ts`
- [x] 2.6 Implement turn limit enforcement (max 20 turns)

## 3. Add-Source Agent Tools

- [x] 3.1 Create `check_rss` tool: fetch URL, detect RSS via link tags and common paths
- [x] 3.2 Create `evaluate_feed` tool: parse RSS feed, assess content quality (full vs summary)
- [x] 3.3 Create `fetch_robots` tool: fetch and return robots.txt content
- [x] 3.4 Create `add_rss_source` tool: create source with RSS strategy, check for duplicates
- [x] 3.5 Create `generate_skill` tool: invoke skill-generator with optional robots.txt context

## 4. Add-Source Agent Definition

- [x] 4.1 Create `add-source` agent definition with system prompt
- [x] 4.2 Configure tool set for add-source agent
- [x] 4.3 Add initial greeting message configuration
- [x] 4.4 Register add-source agent in the registry

## 5. Chat UI Framework

- [x] 5.1 Create `ChatMessage` component for rendering user/assistant messages with markdown
- [x] 5.2 Create `ChatInput` component with send button and Enter key handling
- [x] 5.3 Create `ChatDialog` component combining message list and input
- [x] 5.4 Integrate Vercel AI SDK `useChat` hook for state management
- [x] 5.5 Implement streaming response rendering with loading indicator
- [x] 5.6 Add abort handling when dialog closes during streaming

## 6. Add-Source Chat Integration

- [x] 6.1 Create `AddSourceChat` component using `ChatDialog` with add-source agent
- [x] 6.2 Update `SourcesPage` to use `AddSourceChat` instead of `AddSourceDialog`
- [x] 6.3 Style chat dialog for appropriate width and height
- [x] 6.4 Add tool execution status indicators in chat UI

## 7. Testing and Validation

- [x] 7.1 Add unit tests for RSS detection tool (link tags, common paths, edge cases)
- [x] 7.2 Add unit tests for feed quality evaluation
- [ ] 7.3 Add integration test for complete add-source agent flow (RSS path)
- [ ] 7.4 Add integration test for complete add-source agent flow (skill generation path)
- [x] 7.5 Manual testing: verify end-to-end flow with real websites
