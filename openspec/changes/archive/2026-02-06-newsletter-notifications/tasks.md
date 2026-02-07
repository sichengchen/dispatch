## 1. Setup & Dependencies

- [x] 1.1 Install Grammy Telegram bot library: `pnpm add grammy --filter @dispatch/server`
- [x] 1.2 Add Grammy types to TypeScript config if needed
- [x] 1.3 Create `packages/server/src/services/notifications.ts` file structure

## 2. Settings Schema Extension

- [x] 2.1 Extend settings type in `packages/server/src/services/settings.ts` with notifications object structure
- [x] 2.2 Add default values for notifications config (enabled: false, empty provider configs)
- [x] 2.3 Add settings migration logic to auto-upgrade existing files with empty notifications object
- [x] 2.4 Add TypeScript types for notification settings (NotificationSettings, TelegramConfig)

## 3. Core Notification Service

- [x] 3.1 Implement `NotificationService` class in notifications.ts with Grammy bot initialization
- [x] 3.2 Add credential validation function (bot token format check)
- [x] 3.3 Implement graceful initialization that handles missing/invalid credentials
- [x] 3.4 Add internal state tracking for delivery status (last sent timestamp, last error)
- [x] 3.5 Export singleton instance pattern consistent with other services

## 4. Message Formatting Functions

- [x] 4.1 Implement `formatDigestMessage()` function with Markdown template
- [x] 4.2 Add emoji and formatting helpers for digest structure (header, top stories, categories)
- [x] 4.3 Implement `formatBreakingNewsMessage()` function for alert format
- [x] 4.4 Add Markdown character escaping utility function
- [x] 4.5 Implement digest truncation logic (limit to 4000 chars, top 15 articles)
- [ ] 4.6 Add tests for message formatting edge cases (empty digest, special chars, long content)

## 5. Notification Delivery Methods

- [x] 5.1 Implement `sendDigestNotification(digest)` method with error handling
- [x] 5.2 Implement `sendBreakingNewsAlert(article)` method with error handling
- [x] 5.3 Implement `sendTestNotification()` method for manual verification
- [x] 5.4 Add delivery status tracking (update lastDigestSent, lastError on each call)
- [x] 5.5 Wrap all Telegram API calls in try-catch blocks

## 6. Breaking News Detection Logic

- [x] 6.1 Implement `shouldSendBreakingNewsAlert(article)` function
- [x] 6.2 Add grade threshold check (grade >= settings.breakingNewsThreshold)
- [x] 6.3 Add recency check (processedAt within last 30 minutes)
- [x] 6.4 Add global and feature-specific toggle checks (notifications.enabled, sendBreakingNews)
- [ ] 6.5 Add unit tests for various threshold and time scenarios

## 7. Scheduler Integration Hooks

- [x] 7.1 Add digest notification hook in `scheduler.ts` after `generateDigest()` completes
- [x] 7.2 Add breaking news check hook in LLM pipeline after article grade is assigned
- [x] 7.3 Ensure hooks check global enabled flag before calling notification service
- [x] 7.4 Verify hooks don't block main workflows (wrap in try-catch)

## 8. Error Handling & Logging

- [x] 8.1 Add comprehensive logging for all notification attempts (info level)
- [x] 8.2 Add error logging with context (chat ID, message type, error details)
- [x] 8.3 Add warning logs for credential validation failures
- [x] 8.4 Ensure errors never propagate to block scheduler or article processing
- [x] 8.5 Add log messages for when notifications are skipped due to disabled toggles

## 9. tRPC API Routes

- [x] 9.1 Create `notifications` tRPC router in `packages/server/src/routes/`
- [x] 9.2 Add `getSettings` query to retrieve notification configuration
- [x] 9.3 Add `updateSettings` mutation to save notification credentials and preferences
- [x] 9.4 Add `testNotification` mutation to trigger manual test message
- [x] 9.5 Add `getDeliveryStatus` query to fetch last sent timestamp and errors
- [x] 9.6 Mount notifications router in main tRPC app router

## 10. Desktop UI - Settings Tab

- [x] 10.1 Create NotificationsTab component in `apps/desktop/src/components/settings/`
- [x] 10.2 Add form fields for Telegram bot token and chat ID with validation
- [x] 10.3 Add toggle switches for global enabled, sendDigests, sendBreakingNews
- [x] 10.4 Add number input for breakingNewsThreshold (0-100 range)
- [x] 10.5 Add "Send Test Notification" button with loading state
- [x] 10.6 Display delivery status indicator (last sent timestamp, success/error badge)
- [x] 10.7 Add setup instructions section with link to @BotFather
- [x] 10.8 Integrate NotificationsTab into main Settings page navigation

## 11. Desktop UI - Settings Integration

- [x] 11.1 Add tRPC hooks for notification settings queries and mutations
- [x] 11.2 Implement form state management with react-hook-form or similar
- [x] 11.3 Add success/error toast notifications for save and test actions
- [x] 11.4 Handle credential validation errors in UI (show inline error messages)
- [x] 11.5 Add loading states for async operations (save, test)

## 12. Testing - Unit Tests

- [ ] 12.1 Write tests for message formatting functions (digest, breaking news, truncation)
- [ ] 12.2 Write tests for breaking news detection logic (threshold, time window)
- [ ] 12.3 Write tests for Markdown escaping utility
- [ ] 12.4 Write tests for credential validation
- [ ] 12.5 Write tests for settings migration logic

## 13. Testing - Integration Tests

- [ ] 13.1 Create mock Telegram API client for testing
- [ ] 13.2 Write integration test for digest notification flow (end-to-end)
- [ ] 13.3 Write integration test for breaking news alert flow
- [ ] 13.4 Write test for graceful degradation with missing credentials
- [ ] 13.5 Write test for error handling when API calls fail

## 14. Manual Testing & Verification

- [ ] 14.1 Create test Telegram bot via @BotFather
- [ ] 14.2 Configure bot credentials in dev environment settings
- [ ] 14.3 Verify digest notification sends successfully after scheduled digest generation
- [ ] 14.4 Verify breaking news alert triggers for high-grade recent article
- [ ] 14.5 Verify test notification button works from settings UI
- [ ] 14.6 Verify credential validation errors display correctly
- [ ] 14.7 Test with disabled toggles (global, per-feature)
- [ ] 14.8 Test error scenarios (invalid token, wrong chat ID, no bot conversation initiated)

## 15. Documentation

- [ ] 15.1 Add Telegram notification setup section to README.md
- [ ] 15.2 Document how to create bot via @BotFather
- [ ] 15.3 Document how to find chat ID
- [ ] 15.4 Add troubleshooting guide for common issues (bot not responding, chat not found)
- [ ] 15.5 Update settings.ts JSDoc comments with notification config structure
- [ ] 15.6 Add inline code comments for breaking news detection logic
