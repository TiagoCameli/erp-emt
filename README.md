# ERP-EMT

Sistema de gestão integrada da EMT Construtora. Obras rodoviárias DNIT, BR-364, Acre.

- **Plano mestre**: [docs/PLANO-ERP-EMT.md](docs/PLANO-ERP-EMT.md)
- **Regras de engenharia**: [CLAUDE.md](CLAUDE.md)
- **Decisões estruturais**: [docs/decisoes.md](docs/decisoes.md)

## Stack

Next.js (App Router) + TypeScript strict, Supabase (Postgres 17, Auth, Storage, RLS), Tailwind v4 + shadcn/ui com design system EMT, Vercel.

## Desenvolvimento

```bash
npm install
cp .env.example .env.local   # preencher com as chaves do projeto Supabase
npm run dev
```

Verificações: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`.

Migrations versionadas em `supabase/migrations/`. Proibido alterar schema pelo dashboard.
