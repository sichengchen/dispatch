## 1. Update Types and Schema

- [x] 1.1 Update `evaluateFeed` return type to include `contentFormat: "html" | "text" | "mixed"` and `truncationIndicators: string[]`
- [x] 1.2 Update `evaluateFeedSchema` to add optional `useLlm: boolean` parameter (default: true)
- [x] 1.3 Add Zod schema for LLM structured output (quality assessment response)

## 2. Implement Format Detection

- [x] 2.1 Add `detectContentFormat` helper that checks for HTML tags (`<p>`, `<div>`, `<a>`, `<br>`) in content samples
- [x] 2.2 Integrate format detection into `evaluateFeed` and include result in response

## 3. Implement LLM-Based Quality Analysis

- [x] 3.1 Add LLM client imports and model config access to `add-source-tools.ts`
- [x] 3.2 Create `analyzeContentQuality` function that sends 3 sample articles to LLM with truncation detection prompt
- [x] 3.3 Define the LLM prompt asking: is content complete? any truncation indicators? coherent ending?
- [x] 3.4 Parse LLM response using Zod schema to extract quality and truncation indicators

## 4. Update evaluateFeed Logic

- [x] 4.1 Remove character length heuristic for quality determination
- [x] 4.2 Call `analyzeContentQuality` when `useLlm: true` (default)
- [x] 4.3 Return `quality: "unknown"` when `useLlm: false`
- [x] 4.4 Include `truncationIndicators` array in response (empty if none found)

## 5. Update Agent Integration

- [x] 5.1 Update add-source agent system prompt to explain new quality signals (`contentFormat`, `truncationIndicators`)
- [x] 5.2 Update agent guidance for when to recommend agentic extraction based on truncation indicators

## 6. Testing

- [x] 6.1 Add unit test for `detectContentFormat` with HTML and plain text samples
- [x] 6.2 Add unit test for `evaluateFeed` with `useLlm: false` returning `quality: "unknown"`
- [x] 6.3 Add integration test for LLM-based quality analysis (mock LLM response)
