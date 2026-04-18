# pokebeeClock

iPad PWA for employee clock-in/out and amendment requests. Replaces iCHEF CSV export + LINE notepad workflow.

## Features

- Employee self-service clock-in/out (tap name → enter PIN)
- Amendment submission form
- Automatic shift analysis on every punch (TypeScript port of Python analyzer)
- Admin: monthly report view, employee CRUD

## Stack

Next.js (App Router) · Vercel · Google Sheets · Tailwind v4

## Development

```sh
cd app
npm install
npm run dev
```

Requires `.env.local`:

```
GOOGLE_SA_JSON={"type":"service_account",...}
ADMIN_SECRET=...
SHEET_ID=...
```

## Docs

- `docs/plan.md` — architecture and implementation plan
- `docs/hours_analyzer_spec.md` — shift analysis rules
- `docs/plan_analyzer_port.md` — TypeScript analyzer port notes
- `CLAUDE.md` — AI coding playbook
