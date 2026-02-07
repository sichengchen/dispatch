## ADDED Requirements

### Requirement: First-run detection
The app SHALL detect whether it is the first launch by checking for the absence of a settings file (or an explicit `onboardingComplete` flag in the settings). When first-run is detected, the app MUST show the onboarding flow instead of the normal home view.

#### Scenario: Fresh install shows onboarding
- **WHEN** the app launches and no settings file exists (or `onboardingComplete` is false/absent)
- **THEN** the onboarding wizard is displayed instead of the home digest

#### Scenario: Returning user skips onboarding
- **WHEN** the app launches and `onboardingComplete` is `true` in settings
- **THEN** the normal home view is displayed

### Requirement: Provider and API key setup step
The onboarding wizard SHALL include a step where the user configures at least one LLM provider with a valid API key. The step MUST allow the user to choose between Anthropic (direct) and OpenAI-compatible endpoints (with custom base URL).

#### Scenario: User adds Anthropic provider
- **WHEN** the user selects Anthropic and enters a valid API key
- **THEN** the provider is saved to settings and the wizard allows proceeding to the next step

#### Scenario: User adds OpenAI-compatible provider
- **WHEN** the user selects "OpenAI-compatible", enters a base URL and API key
- **THEN** the provider is saved to settings and the wizard allows proceeding to the next step

#### Scenario: User skips provider setup
- **WHEN** the user chooses to skip provider configuration
- **THEN** the wizard proceeds but shows a warning that LLM features will not work until a provider is configured

### Requirement: Add first source step
The onboarding wizard SHALL include a step where the user can add their first news source (RSS feed URL or web page URL). This step MUST be skippable.

#### Scenario: User adds an RSS source
- **WHEN** the user enters an RSS feed URL during onboarding
- **THEN** the source is created via the existing `sources.create` tRPC mutation and a fetch is triggered

#### Scenario: User skips adding a source
- **WHEN** the user skips the add-source step
- **THEN** the wizard proceeds to completion with no sources added

### Requirement: Onboarding completion
When the onboarding wizard finishes, the app SHALL set `onboardingComplete: true` in settings and transition to the normal home view.

#### Scenario: Wizard completion
- **WHEN** the user reaches the final step and clicks "Get Started" (or equivalent)
- **THEN** `onboardingComplete` is persisted to settings and the home digest view is shown

#### Scenario: User can re-run onboarding from settings
- **WHEN** the user clicks a "Re-run Setup" option in the settings page
- **THEN** `onboardingComplete` is set to `false` and the onboarding wizard is displayed
