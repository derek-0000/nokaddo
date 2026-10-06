# Domain Language

This document defines the domain language used when discussing and extending the
application. It is intentionally separate from the current implementation
layout. Existing names may remain temporarily while they are evaluated in a
separate refactoring effort.

## Modules

### Workspace Authorization

**Domain definition:** Establishes and maintains the app's permission to act on
behalf of a user within a Workspace.

**Encompasses:** OAuth, authorization tokens, session state, reauthorization,
disconnecting, and the identity of the authorized Workspace and user.

### Deck Configuration

**Domain definition:** Turns a selected Source dataset into a persisted Deck by
defining its card fields, faces, and category behavior.

**Encompasses:** Source dataset discovery and selection, schema and preview
loading, the Dataset Connection workflow, App Dataset records, field bindings,
single or grouped configuration, and persistence of Deck configurations.

### Study

**Domain definition:** Interprets a Deck configuration against its Source
dataset and provides the experience of reviewing Cards and viewing progress.

**Encompasses:** Cards, runtime Categories, review state, study statistics,
progress, and study screens.

### Workspace Registry

**Domain definition:** Maintains the durable association between an authorized
Workspace and its App Dataset identifier.

**Encompasses:** Server-side Cloudflare KV storage, Workspace-scoped App Dataset
lookup, authenticated registry writes and reads, and persistence recovery.

### Notion Integration

**Domain definition:** Contains the provider-specific knowledge required to
communicate with Notion and translate Notion data for the application.

**Encompasses:** Notion SDK and API access, provider response shapes,
pagination, property and schema translation, provider validation, provider
error handling, and the Notion-specific OAuth mechanics used by Workspace
Authorization.

### Application Shell

**Domain definition:** Assembles and runs the application without owning the
behavior of a business domain.

**Encompasses:** Startup, routing, route guards and loaders, server and browser
entry points, application-wide providers, navigation composition, and App
Home.

### UI System

**Domain definition:** Provides reusable visual primitives and presentation
conventions for the application.

**Encompasses:** Shared controls, dialogs, drawers, cards, popovers, avatars,
layout primitives, styling conventions, themes, and accessibility conventions.

### Shared Foundation

**Domain definition:** Provides small, domain-neutral policies and utilities
used by multiple modules.

**Encompasses:** Application error handling, public-error normalization,
server configuration, generic utilities, browser helpers, and other shared
contracts that do not belong to a specific domain.

### Test Support

**Domain definition:** Provides non-runtime infrastructure used to verify the
application modules.

**Encompasses:** Fixtures, test setup, test harnesses, boundary doubles, and
shared test utilities.

## Core vocabulary

- **Workspace** — the connected Notion workspace.
- **App Dataset** — an app-owned Notion data source that acts as a
  workspace-scoped configuration registry. Its records represent Deck
  configurations and point to Source datasets.
- **Source dataset** — the external Notion data source containing
  learning-material rows.
- **Deck** — a Nokaddo configuration that turns one Source dataset into a study
  experience.
- **Deck configuration** — the persisted definition of how a Deck interprets a
  Source dataset.
- **Card** — one Source-dataset row interpreted through a Deck's field
  bindings.
- **Category** — a subdivision of a Deck derived from a grouping field.
- **Study** — the experience of reviewing a Deck and viewing progress.
- **Dataset Connection** — the workflow that creates a Deck configuration from
  a Source dataset; it is not a separate module or durable entity.

## Naming rules

- Use the canonical terms above across variables, types, files, functions,
  routes, tests, query keys, and documentation.
- Use `Notion` for provider-boundary identifiers, not for normalized domain
  identifiers. For example, use `NotionClient` at the integration boundary and
  `SourceDataset` in application code.
- Name identifiers explicitly: `workspaceId`, `sourceDatasetId`,
  `appDatasetId`, `deckId`, `cardId`, and `categoryKey`.
- Use precise function names with a domain noun and an action, such as
  `listAvailableSourceDatasets`, `createDeckConfiguration`, and
  `loadStudyCards`.
- Name files with the domain or provider term followed by their responsibility,
  such as `workspace-session.ts`, `deck-configuration-validator.ts`,
  `study-statistics.ts`, and `notion-client.ts`.
- Use canonical domain nouns in variables, types, state, actions, constants,
  query names, cache keys, fixtures, and test descriptions.
- Keep external Notion API and App Dataset field names unchanged at the
  boundary; translate them into canonical application names internally.
- Use singular names for individual values and plural names for collections:
  `deck`/`decks`, `card`/`cards`, and `category`/`categories`.
- Use `connection` for the Dataset Connection workflow or a specific
  relationship, not as a generic name for authorization state or draft
  configuration.
