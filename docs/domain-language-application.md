# Applying the Domain Language

This document describes how to apply the vocabulary in
[`domain-language.md`](./domain-language.md) to production code. It is an
implementation playbook, not a request to change behavior immediately.

The work should be performed incrementally. Existing names and mixed files may
remain temporarily while their ownership is evaluated. Production behavior,
external schemas, and public URLs must not change accidentally as a result of
renaming.

## Desired outcome

After the application work:

- Production identifiers use the canonical domain language.
- Each production file has one primary module owner, or is explicitly tracked
  as transitional.
- Notion-specific names remain at the Notion Integration boundary.
- External Notion fields and App Dataset property names are translated rather
  than renamed casually.
- Query keys, routes, tests, fixtures, and UI code use the same vocabulary as
  the domain document.

## Module application map

Use this map to decide which module owns a production responsibility. The
current paths are starting points for evaluation, not a final physical layout.

| Module                  | Apply the language to these production areas first                                                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace Authorization | OAuth, session, token refresh, disconnect, reauthorization, authorized Workspace/user identity, and authorization guards.                                                  |
| Deck Configuration      | Source dataset discovery, schema and preview loading, Dataset Connection, App Dataset records, field bindings, grouping configuration, and Deck configuration persistence. |
| Study                   | Card projection, Category discovery, review state, study statistics, progress, and study screens.                                                                          |
| Workspace Registry      | Workspace-scoped local storage of the App Dataset identifier.                                                                                                              |
| Notion Integration      | Notion client creation, SDK/API calls, provider response translation, provider validation, pagination, and provider errors.                                                |
| Application Shell       | Startup, routing, loaders, route guards, providers, navigation composition, and App Home composition.                                                                      |
| UI System               | Shared controls, layout primitives, themes, styling, and accessibility conventions.                                                                                        |
| Shared Foundation       | Domain-neutral errors, configuration, browser helpers, generic utilities, and shared contracts.                                                                            |

The current code contains mixed responsibilities in files such as
`auth-functions.ts`, `card-functions.ts`, and `client-server.ts`. Do not make
an arbitrary blanket rename in those files. Evaluate and split them according
to primary responsibility first.

## Recommended sequence

### 1. Freeze the vocabulary

Use `domain-language.md` as the reference before changing an identifier. If a
new concept appears, decide whether it is:

1. An existing concept that needs the canonical name.
2. A provider or persistence detail that should stay at a boundary.
3. A genuinely new domain concept that must be added to the glossary first.

Do not introduce a synonym merely because the current file or API uses one.

### 2. Inventory ownership

Create a short working inventory of production files and assign each file a
primary module. Mark mixed files as transitional. This inventory is for the
refactoring task and does not need to be part of the lightweight domain
language document.

Classify each file as one of:

- Domain behavior.
- Provider integration.
- Application shell.
- UI System.
- Shared Foundation.
- Workspace Registry.

Tests and fixtures should follow the module they verify; generic test helpers
belong to Test Support.

### 3. Establish boundary translations

Keep external names stable and translate them once at the boundary.

Examples:

```text
Notion response       -> SourceDataset
Notion data_source_id -> sourceDatasetId or appDatasetId
dataset_id            -> sourceDatasetId
group_keys            -> categoryKeys
dataGroupId           -> deckId
```

Do not change App Dataset property keys or Notion payload fields as part of a
language-only change. A schema migration is a separate decision.

### 4. Separate mixed responsibilities

Split a mixed file only when needed to establish a clear ownership boundary.
The expected direction is:

- `client-server.ts` responsibilities become a provider-only
  `notion-client.ts` plus an authorization-aware request boundary.
- `auth-functions.ts` separates Workspace Authorization from Source dataset
  discovery.
- `dataset-functions.ts` separates Source dataset operations from Deck
  configuration orchestration.
- `card-functions.ts` separates Deck configuration operations from Study
  operations.
- Broad `api.ts` query and mutation exports become domain-scoped exports as
  their consumers are migrated.

Keep the provider-first organization under `src/integrations/notion` for this
work. A future `notion/<domain>/` directory layout may be evaluated separately;
it is not required for applying the language.

### 5. Rename in dependency order

Within each module, apply changes in this order:

1. Normalized domain types and input/output contracts.
2. Module-owned production functions.
3. Query keys, queries, mutations, and route loader contracts.
4. Components, routes, and other consumers.
5. Existing tests, fixtures, mocks, and test descriptions.

Update tests by default when production names change. Create new tests only
when the change exposes behavior or a contract that is not already covered.

### 6. Audit the vocabulary

After each module, search for old terms and classify every remaining match.
Some matches are expected at external boundaries; domain matches should be
removed or explicitly documented as transitional.

Useful searches include:

```sh
rg -n "cardGroup|CardGroup|dataGroup|dataSet|nokaddoDataset|groupKeys" src test
rg -n "NotionDataset|NotionConnection|Notion.*Dataset" src test
```

Do not mechanically replace `dataset`. Determine first whether the value is a
Source dataset or the App Dataset.

## Naming application examples

These are representative target names, not a command to rename all code in a
single pass.

| Current concept/name        | Target domain name                                                         |
| --------------------------- | -------------------------------------------------------------------------- |
| `NotionDataset`             | `SourceDataset` when normalized for application use                        |
| `NotionDatasetItem`         | `SourceDatasetItem`                                                        |
| `CardGroup` / `CardGroups`  | `Deck` / `Decks`                                                           |
| `CardGroupConfig`           | `DeckConfiguration`                                                        |
| `dataSetId`                 | `sourceDatasetId` or `appDatasetId`, based on the actual object            |
| `nokaddoDatasetId`          | `appDatasetId`                                                             |
| `dataGroupId`               | `deckId`                                                                   |
| `groupKeys`                 | `categoryKeys`                                                             |
| `group` in study navigation | `category`                                                                 |
| `getAvailableDatasets`      | `listAvailableSourceDatasets`                                              |
| `getNotionDataset`          | `getSourceDataset`                                                         |
| `getCardGroups`             | `listDecks`                                                                |
| `getCardGroupConfig`        | `getDeckConfiguration`                                                     |
| `getCardGroupStudyData`     | `loadDeckStudyData`                                                        |
| `deleteCardGroup`           | `deleteDeck`                                                               |
| `client-server.ts`          | `notion-client.ts` for the provider-only portion                           |
| `notionKeys`                | Domain-scoped keys such as `sourceDatasetKeys`, `deckKeys`, or `studyKeys` |

Choose the name from the value's meaning, not from its current storage shape.
For example, an App Dataset ID is still `appDatasetId` even though its value
is a Notion data-source ID.

## Rules for routes and external names

- Use canonical route parameters such as `deckId`, `sourceDatasetId`, and
  `appDatasetId`.
- Use `category` rather than `group` in new study navigation contracts.
- Treat URL path changes such as `/groups` to `/categories` as a separate
  compatibility review.
- Keep external Notion fields and App Dataset schema keys unchanged.
- Map raw provider types to normalized application types before they cross into
  domain workflows.
- Use `Notion` in names such as `NotionClient` or `NotionOAuthError` only when
  the identifier is provider-specific.

## Verification after each migration slice

Run focused tests for the changed module and update existing assertions,
fixtures, and mocks. Before considering a batch complete, run:

```sh
pnpm test:hygiene
pnpm typecheck
pnpm lint
pnpm check
pnpm test
```

Also review the diff for accidental changes to:

- Notion API payloads.
- App Dataset property keys.
- Route paths and search parameters.
- Cache-key identity.
- Authorization and persistence behavior.

## Definition of done

A module migration is complete when its production identifiers use the
canonical vocabulary, its boundary types are clear, its existing tests and
fixtures use the same terms, and the verification commands pass. Any remaining
mixed file or provider-specific exception must have an explicit reason.

The work is not complete merely because a directory or a large set of strings
has been renamed. The domain meaning must remain correct at every boundary.
