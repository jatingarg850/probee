# Working in this repository

Read `README.md` first for the architecture and how to run things. Deeper
material lives under `docs/` — `docs/setup/` to get running, `docs/operations/`
for deploying and the security audit, `docs/reference/` for background.

## Layout

- `web/` — Next.js 16 App Router frontend (Bun, TypeScript, Tailwind, Biome)
- `server/` — Python FastAPI backend: Agora tokens, agent lifecycle, Gemini
- `docs/` — everything else

## Conventions

- **Package manager is Bun.** `bun install`, `bun run dev`. Not npm.
- **Lint and format with Biome**, not ESLint/Prettier: `bun run lint:fix` in `web/`.
- **Icons come from `@/components/ui/icons`**, never from an icon package
  directly. That barrel is what keeps the icon set swappable in one file.
- **Never read a user id from the request body or query string** in an API
  route. Derive it from the bearer token via `getAuthedUserId` in
  `web/src/lib/apiAuth.ts` — see the note in that file for why.
- **User-supplied text reaching a model prompt must be fenced** with
  `_untrusted()` in `server/src/agent.py`. Job descriptions are scraped from
  third-party listings and transcripts are whatever the candidate said.
- Secrets live in `server/.env` and `web/.env`, both gitignored. Never commit
  them; `*.env.example` files document the required keys.

## Before pushing

```bash
cd web && bun run verify   # doctor + API contract checks + production build
```
