## ADDED Requirements

### Requirement: Dual-pane sources layout
The Sources page SHALL display a two-column layout with the source list in a fixed-width left column and an articles panel in a flex-grow right column.

#### Scenario: Page renders with both panes
- **WHEN** the user navigates to the Sources tab
- **THEN** the page displays the source list on the left and the articles panel on the right, side by side

#### Scenario: Source list retains existing functionality
- **WHEN** the dual-pane layout is rendered
- **THEN** the source list SHALL retain all existing capabilities: health indicators, bulk selection, per-source actions (refresh, retry, regenerate skill, delete), and the Add Source button

### Requirement: Article count per source
The source list SHALL display an article count for each source, provided by a server-side count subquery on the `sources.list` endpoint.

#### Scenario: Article count displayed in source list
- **WHEN** the source list loads
- **THEN** each source entry displays its total article count

#### Scenario: Article count updates after refresh
- **WHEN** a source is refreshed and new articles are fetched
- **THEN** the article count for that source updates to reflect the new total

### Requirement: Source articles panel displays articles for selected source
The articles panel SHALL display a list of articles belonging to the currently selected source, fetched via the `articles.list` endpoint with the `sourceId` parameter.

#### Scenario: Articles shown for selected source
- **WHEN** the user clicks a source in the source list
- **THEN** the articles panel displays articles for that source, sorted by publish date (newest first)

#### Scenario: Switching sources updates articles
- **WHEN** the user clicks a different source
- **THEN** the articles panel updates to show articles for the newly selected source

#### Scenario: Article items display summary information
- **WHEN** articles are listed in the panel
- **THEN** each article item displays its title, publication date, grade badge (color-coded), tags, and summary text

### Requirement: Empty state when no source selected
The articles panel SHALL display a prompt to select a source when no source is currently selected.

#### Scenario: No source selected on page load
- **WHEN** the user navigates to the Sources tab and no source is selected
- **THEN** the articles panel displays a message prompting the user to select a source

### Requirement: Empty state when source has no articles
The articles panel SHALL display an appropriate message when the selected source has no articles.

#### Scenario: Source with zero articles
- **WHEN** the user selects a source that has no articles
- **THEN** the articles panel displays a message indicating there are no articles for this source

### Requirement: Navigate to article viewer from source articles
The user SHALL be able to click an article in the source articles panel to open the full article viewer, with back-navigation returning to the Sources page.

#### Scenario: Open article from sources
- **WHEN** the user clicks an article in the source articles panel
- **THEN** the app navigates to the article viewer displaying that article

#### Scenario: Back navigation returns to sources
- **WHEN** the user clicks "Back" in the article viewer after opening an article from sources
- **THEN** the app returns to the Sources page with the previously selected source still selected

### Requirement: Delete single article
The system SHALL provide an `articles.delete` mutation that removes a single article by ID, and the articles panel SHALL expose this action via a per-article dropdown menu.

#### Scenario: Delete article via dropdown
- **WHEN** the user selects "Delete" from an article's action dropdown
- **THEN** a confirmation dialog appears asking the user to confirm deletion

#### Scenario: Confirm single article deletion
- **WHEN** the user confirms the delete action
- **THEN** the article is removed from the database and the articles list refreshes

#### Scenario: Cancel single article deletion
- **WHEN** the user cancels the delete confirmation dialog
- **THEN** the article is not deleted and the dialog closes

### Requirement: Bulk delete articles
The system SHALL provide an `articles.deleteMany` mutation, and the articles panel SHALL support selecting multiple articles and deleting them in bulk.

#### Scenario: Select multiple articles for deletion
- **WHEN** the user checks multiple article checkboxes and clicks the bulk delete action
- **THEN** a confirmation dialog appears showing the count of articles to be deleted

#### Scenario: Confirm bulk deletion
- **WHEN** the user confirms the bulk delete action
- **THEN** all selected articles are removed from the database, the selection is cleared, and the articles list refreshes

### Requirement: Reprocess single article
The articles panel SHALL expose a "Reprocess" action in the per-article dropdown menu, calling the existing `articles.reprocess` mutation.

#### Scenario: Reprocess article via dropdown
- **WHEN** the user selects "Reprocess" from an article's action dropdown
- **THEN** the article is sent through the LLM pipeline for re-summarization, re-classification, and re-grading

#### Scenario: Reprocess feedback
- **WHEN** an article reprocess completes
- **THEN** a toast notification confirms success and the article's data refreshes in the list

### Requirement: Bulk reprocess articles
The system SHALL provide an `articles.reprocessMany` mutation, and the articles panel SHALL support selecting multiple articles and reprocessing them in bulk.

#### Scenario: Bulk reprocess with confirmation
- **WHEN** the user checks multiple article checkboxes and clicks the bulk reprocess action
- **THEN** a confirmation dialog appears showing the count of articles and a warning about API usage

#### Scenario: Confirm bulk reprocess
- **WHEN** the user confirms the bulk reprocess action
- **THEN** each selected article is reprocessed sequentially through the LLM pipeline, the selection is cleared, and the articles list refreshes

### Requirement: Bulk selection controls
The articles panel SHALL provide checkbox-based selection for articles with select-all and clear-selection controls, following the same pattern as the source list's bulk selection.

#### Scenario: Select individual article
- **WHEN** the user checks an article's checkbox
- **THEN** that article is added to the selection and the bulk action bar appears

#### Scenario: Select all articles
- **WHEN** the user checks the "Select all" checkbox
- **THEN** all currently displayed articles are selected

#### Scenario: Clear selection
- **WHEN** the user clicks the clear selection button in the bulk action bar
- **THEN** all articles are deselected and the bulk action bar hides

#### Scenario: Selection count displayed
- **WHEN** one or more articles are selected
- **THEN** the bulk action bar displays the count of selected articles
