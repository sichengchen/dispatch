## Why

Users want to receive daily digests and breaking news alerts directly in their preferred instant messaging services (like Telegram) without needing to open the Dispatch app. This enables passive consumption of curated news and ensures high-priority stories are delivered immediately.

## What Changes

- Add a new notification service that sends formatted digests to configured IM channels
- Support Telegram as the primary IM platform (with architecture allowing future expansion)
- Integrate with the existing scheduler to automatically send digests after generation
- Add breaking news alerts that instantly notify users when high-grade articles are processed
- Extend settings schema to configure IM service credentials and notification preferences
- Add UI settings page for managing notification channels and thresholds

## Capabilities

### New Capabilities
- `im-notifications`: Handles sending formatted messages to instant messaging services. Covers Telegram bot integration, message formatting (converting digest JSON to readable messages), breaking news detection based on grade thresholds, and delivery status tracking.

### Modified Capabilities
(none - this is a new feature that hooks into existing systems without changing their requirements)

## Impact

**Code**:
- New service: `packages/server/src/services/notifications.ts`
- Settings schema: Add `notifications` config section to `settings.ts`
- Scheduler: Hook into digest generation and article processing pipeline
- Desktop UI: New settings tab for notification configuration

**Dependencies**:
- Telegram Bot API client (e.g., `node-telegram-bot-api` or `telegraf`)
- Consider `grammy` as a modern, TypeScript-first alternative

**APIs**:
- New tRPC routes for notification settings management
- Test notification endpoint for verifying configuration

**Systems**:
- Requires users to create a Telegram bot via @BotFather
- Users must initiate conversation with bot to receive messages
