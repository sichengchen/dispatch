## Context

Dispatch currently generates daily digests and processes articles with grades, but users must actively open the app to consume this content. Many users prefer passive consumption via instant messaging platforms they already monitor throughout the day.

The existing architecture includes:
- `scheduler.ts` that runs periodic scraping and digest generation jobs
- `digest.ts` service that creates structured daily summaries
- `llm.ts` that grades articles (0-100 scale)
- Settings system via `dispatch.settings.json`
- tRPC-based API for client-server communication

## Goals / Non-Goals

**Goals:**
- Enable automatic delivery of daily digests to Telegram channels
- Send breaking news alerts when high-grade articles are detected
- Provide user-friendly configuration UI for setting up notification channels
- Design extensible notification service that can support additional IM platforms later
- Track delivery status and handle common failure scenarios gracefully

**Non-Goals:**
- Supporting multiple IM platforms in initial implementation (focus on Telegram only)
- Rich media attachments or interactive buttons (text-only messages for v1)
- Per-article notification customization (digest-level and breaking news only)
- Read receipts or bidirectional communication with the bot

## Decisions

### 1. Telegram Bot Library: Grammy

**Decision**: Use `grammy` as the Telegram Bot API client.

**Rationale**:
- TypeScript-first design with excellent type safety
- Modern async/await patterns, no callback hell
- Active maintenance and good documentation
- Smaller footprint than `telegraf`, more ergonomic than `node-telegram-bot-api`

**Alternatives considered**:
- `node-telegram-bot-api`: Mature but callback-based, weaker TypeScript support
- `telegraf`: Feature-rich but heavier, designed for complex bots with middleware chains (overkill for one-way notifications)

### 2. Message Formatting Strategy

**Decision**: Convert digest JSON structure to formatted Markdown messages using a template-based approach.

**Format**:
```
📰 *Your Daily Dispatch - [Date]*

🔥 *Top Stories*
• [Grade] **Headline** - Brief summary
  🔗 [Read more](url)

📊 *By Category*
[Category Name]
• Article 1
• Article 2
```

**Rationale**:
- Telegram supports Markdown for basic formatting (bold, italic, links)
- Template approach makes format tweaks easy without logic changes
- Emojis improve visual scanning on mobile
- Grade display helps users prioritize reading

**Alternatives considered**:
- Plain text: Too monotonous, hard to scan
- HTML: Telegram's HTML support is quirky, Markdown is simpler

### 3. Breaking News Detection

**Decision**: Trigger breaking news alerts when articles meet: `grade >= threshold` AND `processedAt within last 30 minutes`.

**Rationale**:
- Grade threshold (default: 85) filters for high-quality content
- Time window prevents alert spam from batch processing old articles
- Separate from digest delivery to provide immediate value
- Configurable threshold allows users to tune sensitivity

**Alternatives considered**:
- Alert on every high-grade article: Could spam users during batch scrapes
- Manual user tagging: Adds complexity, users may not curate consistently

### 4. Scheduler Integration

**Decision**: Add notification hooks to existing scheduler jobs rather than creating separate cron jobs.

**Hook points**:
- After `generateDigest()` completes → send digest notification
- After each article's LLM processing → check breaking news threshold

**Rationale**:
- Minimal scheduler changes, preserves existing job logic
- Notifications become a "side effect" of existing workflows
- No risk of race conditions between separate jobs
- Easy to disable notifications without affecting core functionality

**Alternatives considered**:
- Separate notification scheduler: Duplicate timing logic, potential skew between digest generation and sending
- Queue-based system: Overkill for current scale, adds complexity

### 5. Settings Schema Structure

**Decision**: Add top-level `notifications` object to settings schema with nested provider configs.

**Structure**:
```typescript
notifications: {
  enabled: boolean;
  providers: {
    telegram: {
      botToken: string;
      chatId: string;
      sendDigests: boolean;
      sendBreakingNews: boolean;
      breakingNewsThreshold: number; // 0-100
    }
  }
}
```

**Rationale**:
- Clear namespace separation from other settings
- Provider-specific configs allow easy expansion (e.g., add Discord later)
- Per-feature toggles (digests vs breaking news) give users fine-grained control
- Falls back gracefully if `notifications` key missing

**Alternatives considered**:
- Flat structure with `telegramBotToken`, etc.: Doesn't scale to multiple providers
- Database storage: Settings file approach is consistent with existing patterns

### 6. Error Handling Strategy

**Decision**: Log failures and continue rather than blocking main workflows.

**Approach**:
- Wrap all notification calls in try-catch blocks
- Log errors with context (chat ID, message type, error details)
- Don't retry automatically (avoid API rate limits and duplicate sends)
- Expose delivery status in settings UI ("Last digest sent: 2 hours ago ✓" or "Failed to send ✗")

**Rationale**:
- Notification failures shouldn't break core functionality (digest generation, article processing)
- Users can self-diagnose via status indicators
- Manual "test notification" button provides troubleshooting path
- Telegram API is generally reliable, retries add complexity for rare failures

**Alternatives considered**:
- Retry queue with exponential backoff: Over-engineered for current scale
- Block scheduler on failure: Unacceptable UX, one service failure affects everything

## Risks / Trade-offs

**[Risk]** Telegram API rate limits during bulk article processing
→ **Mitigation**: Only send breaking news alerts for articles processed within last 30 minutes. Batch old articles won't trigger alerts.

**[Risk]** Users forget to initiate chat with bot, receive no messages, think feature is broken
→ **Mitigation**: Settings UI shows clear setup instructions: "1. Create bot via @BotFather, 2. Start conversation, 3. Add credentials here." Test notification endpoint confirms connectivity.

**[Risk]** Message size limits (Telegram: 4096 chars) if digest is huge
→ **Mitigation**: Truncate digest to top N articles (e.g., 15) when formatting. Full digest still available in app.

**[Risk]** Sensitive credentials (bot token) stored in plain text settings file
→ **Mitigation**: Accept for v1 (consistent with existing API key storage). Document that settings file should be `.gitignore`d. Consider credential encryption in future if users request.

**[Trade-off]** Telegram-only support limits initial audience
→ **Accepted**: Telegram is popular among tech/news enthusiasts. Architecture designed for easy provider addition. Can expand based on user demand.

**[Trade-off]** No read tracking or engagement metrics
→ **Accepted**: Dispatch is focused on curation, not analytics. Users who want metrics can check Telegram's bot analytics separately.

## Migration Plan

**Deployment**:
1. Install `grammy` dependency: `pnpm add grammy --filter @dispatch/server`
2. Deploy server code with new notification service (feature disabled by default)
3. Settings migration: Existing `dispatch.settings.json` files auto-upgrade with empty `notifications` object on next load
4. Update desktop app with new settings UI
5. Documentation: Add setup guide to README

**Rollback strategy**:
- Notifications are opt-in; disabling requires setting `notifications.enabled: false`
- If critical issues arise, remove notification hooks from scheduler
- No database schema changes, so rollback is code-only

**Testing before rollout**:
- Unit tests for message formatting logic
- Integration test with mock Telegram API client
- Manual test with real Telegram bot in dev environment
- Verify graceful degradation when credentials missing/invalid

## Open Questions

None - design is ready for implementation.
