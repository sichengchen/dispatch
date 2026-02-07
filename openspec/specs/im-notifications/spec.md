## ADDED Requirements

### Requirement: Configure Telegram notification credentials
The system SHALL allow users to configure Telegram bot credentials including bot token and chat ID through the settings interface.

#### Scenario: Save valid Telegram credentials
- **WHEN** user enters valid bot token and chat ID in settings
- **THEN** system saves credentials to `notifications.providers.telegram` in settings file

#### Scenario: Validate bot token format
- **WHEN** user enters bot token with invalid format (not matching Telegram's token pattern)
- **THEN** system displays validation error before saving

#### Scenario: Missing credentials graceful degradation
- **WHEN** notification is triggered but credentials are not configured
- **THEN** system logs warning and skips notification without throwing error

### Requirement: Send daily digest notifications
The system SHALL automatically send formatted daily digest messages to configured Telegram chat when digest generation completes.

#### Scenario: Successful digest delivery
- **WHEN** scheduler completes digest generation AND `notifications.enabled` is true AND `providers.telegram.sendDigests` is true
- **THEN** system sends formatted digest message to configured Telegram chat

#### Scenario: Digest disabled by user preference
- **WHEN** scheduler completes digest generation AND `providers.telegram.sendDigests` is false
- **THEN** system skips sending digest notification

#### Scenario: Digest notification failure does not block scheduler
- **WHEN** digest generation completes AND Telegram API call fails
- **THEN** system logs error with context and continues scheduler workflow

### Requirement: Send breaking news alerts
The system SHALL send immediate notification when an article is processed that meets grade threshold and recency criteria.

#### Scenario: Trigger breaking news alert
- **WHEN** article is processed with `grade >= breakingNewsThreshold` AND article `processedAt` is within last 30 minutes AND `providers.telegram.sendBreakingNews` is true
- **THEN** system sends formatted breaking news message to Telegram chat

#### Scenario: Skip old high-grade articles
- **WHEN** article is processed with `grade >= breakingNewsThreshold` AND article `processedAt` is older than 30 minutes
- **THEN** system does not send breaking news notification

#### Scenario: Configurable grade threshold
- **WHEN** user sets `breakingNewsThreshold` to 90 in settings
- **THEN** system only sends alerts for articles with grade >= 90

### Requirement: Format messages using Markdown templates
The system SHALL convert digest JSON and article data into formatted Markdown messages suitable for Telegram display.

#### Scenario: Digest message structure
- **WHEN** formatting a daily digest for notification
- **THEN** message includes date header, top stories section with grades and summaries, category groupings, and article links

#### Scenario: Breaking news message structure
- **WHEN** formatting a breaking news alert
- **THEN** message includes alert indicator, article grade, headline, summary, and direct link

#### Scenario: Truncate long digests
- **WHEN** formatted digest exceeds 4000 characters (near Telegram's 4096 limit)
- **THEN** system truncates to top 15 articles and adds "View full digest in app" footer

#### Scenario: Escape special Markdown characters
- **WHEN** article headline contains Markdown special characters (*, _, [, ])
- **THEN** system escapes characters to prevent formatting errors

### Requirement: Track and expose delivery status
The system SHALL record delivery outcomes and expose status information in settings UI.

#### Scenario: Record successful delivery timestamp
- **WHEN** digest notification is successfully delivered
- **THEN** system updates `lastDigestSent` timestamp in internal state

#### Scenario: Record delivery failure
- **WHEN** notification delivery fails with API error
- **THEN** system records failure timestamp and error message for display in settings

#### Scenario: Display status in UI
- **WHEN** user opens notification settings page
- **THEN** UI shows "Last digest sent: 2 hours ago ✓" or "Failed to send ✗" based on delivery status

### Requirement: Provide test notification endpoint
The system SHALL provide a manual test notification feature to verify configuration before enabling automatic notifications.

#### Scenario: Send test message
- **WHEN** user clicks "Send Test Notification" button in settings
- **THEN** system sends simple test message to configured Telegram chat

#### Scenario: Test reveals configuration error
- **WHEN** test notification fails with "chat not found" error
- **THEN** system displays error message with setup instructions (initiate chat with bot first)

#### Scenario: Test validates credentials
- **WHEN** test notification succeeds
- **THEN** system displays success confirmation and marks credentials as validated

### Requirement: Enable or disable notifications globally
The system SHALL allow users to enable or disable all notification functionality through a global toggle.

#### Scenario: Disable all notifications
- **WHEN** user sets `notifications.enabled` to false
- **THEN** system skips all notification hooks regardless of individual feature toggles

#### Scenario: Re-enable notifications
- **WHEN** user sets `notifications.enabled` to true AND Telegram credentials are configured
- **THEN** system resumes sending notifications based on feature-specific toggles

### Requirement: Handle rate limits gracefully
The system SHALL respect Telegram API rate limits and avoid spamming users during bulk operations.

#### Scenario: Breaking news time window prevents spam
- **WHEN** user runs manual scrape importing 100 old articles with high grades
- **THEN** system sends zero breaking news alerts due to 30-minute recency requirement

#### Scenario: Digest frequency respects scheduler
- **WHEN** digest generation runs once daily at scheduled time
- **THEN** notification is sent at most once per day aligned with digest schedule

### Requirement: Log notification events with context
The system SHALL log all notification attempts, successes, and failures with sufficient context for debugging.

#### Scenario: Log successful notification
- **WHEN** notification is successfully delivered
- **THEN** system logs info-level message with timestamp, message type (digest/breaking), and chat ID

#### Scenario: Log failure with API error details
- **WHEN** Telegram API returns error response
- **THEN** system logs error-level message with error code, error message, chat ID, and notification type

#### Scenario: Log credential validation failures
- **WHEN** bot token is invalid or expired
- **THEN** system logs warning-level message with credential validation failure details
