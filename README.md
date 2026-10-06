# のカード

<img width="345" height="131" alt="image" src="https://github.com/user-attachments/assets/3bdcc250-d52c-4c16-9ca4-e6f6421eafca" />

Flashcards connected to your Notion Datasets.

## Session

Generate a secret with `openssl rand -base64 32` and set it in `SESSION_SECRET`.

## Notion

Create a public integration in the [Notion Developer Portal](https://www.notion.so/profile/integrations).

- Get the OAuth client ID and set it in `OAUTH_CLIENT_ID`.
- Get the OAuth client secret and set it in `OAUTH_CLIENT_SECRET`.
- Add the app root as a redirect URI in Notion and set the same value in `OAUTH_REDIRECT_URI` (e.g. `http://localhost:3002/`).
- Get the authorization URL and set it in `VITE_NOTION_AUTH_URL`.

## Cloudflare KV

- Get your account ID from the Cloudflare dashboard and set it in `CLOUDFLARE_ACCOUNT_ID`.
- Create a KV namespace, get its ID and set it in `CLOUDFLARE_KV_NAMESPACE_ID`.
- Create an API token with Workers KV read/write access and set it in `CLOUDFLARE_KV_API_TOKEN`.

## Run

```sh
pnpm install
pnpm dev
```

Run a single instance only. Notion token refreshes are locked in memory, so multiple replicas can reuse the same refresh token and force users to reauthorize. Replace the lock in `src/integrations/notion/token-refresh.ts` with a database lock or compare-and-swap before scaling.
