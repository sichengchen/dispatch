## 1. Backend Tool Implementation

- [x] 1.1 Create `present_choices` tool schema with question, options, and optional context parameters
- [x] 1.2 Implement tool execute function that returns formatted instructions for the agent
- [x] 1.3 Add validation for options count (2-4 items required)
- [x] 1.4 Export tool from a new `choice-tools.ts` file

## 2. Agent Integration

- [x] 2.1 Add `present_choices` tool to add-source agent toolset
- [x] 2.2 Update add-source agent system prompt to use the tool for decision points
- [ ] 2.3 Test agent uses tool correctly when asking about RSS vs agentic extraction

## 3. Frontend Choice Rendering

- [x] 3.1 Create `ChoicePrompt` component that renders question text and option buttons
- [x] 3.2 Add custom code block renderer in `ChatMessage` to detect `choices` language tag
- [x] 3.3 Parse JSON from choices blocks and render `ChoicePrompt` component
- [x] 3.4 Handle malformed JSON gracefully (fallback to raw code display)

## 4. Selection Handling

- [x] 4.1 Pass `onSend` callback to `ChoicePrompt` component
- [x] 4.2 Implement button click handler that calls `onSend(option.value)`
- [x] 4.3 Track selection state to disable buttons after user clicks
- [x] 4.4 Detect outdated choices (user message exists after choices) and disable them

## 5. Styling and Accessibility

- [x] 5.1 Style choice buttons with consistent UI (use existing button variants)
- [x] 5.2 Add visual highlight for selected option
- [x] 5.3 Ensure keyboard navigation works (Tab between options, Enter/Space to select)
- [x] 5.4 Add appropriate ARIA attributes for screen readers

## 6. Testing

- [x] 6.1 Add unit test for `present_choices` tool schema validation
- [x] 6.2 Add unit test for choice rendering with valid/invalid JSON
- [x] 6.3 Test selection handling and disabled states
- [ ] 6.4 Manual E2E test: add source flow with choice prompts
