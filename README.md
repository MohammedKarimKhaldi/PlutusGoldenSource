# Golden Source Outreach CRM

Private small-team CRM for turning `Contacts for database.xlsx` into a cloud golden source for company outreach.

## What Is Built

- Next.js TypeScript app with an operational CRM UI.
- Supabase/Postgres schema with Auth-ready organization membership, accounting allowlists, and RLS.
- XLSX parser that preserves raw workbook rows before normalization.
- Aggressive company/person normalization with merge audit records.
- Manual outreach tracking: stages, tags, highlighted people, activities, notes, and tasks.
- Single-criterion contacts export for sectors/tags/stages/countries/email domains/enrichment/investment fields.
- Local Ollama company enrichment with reviewable company profile fields.
- Investment history tracking for companies and contacts, including past/current investor status and fully allocated capacity.
- Restricted accounting and payments tracking for retainers, commissions, expenses, ledger cash movements, voids, and audited hard deletes.
- Demo fallback so the UI runs before Supabase credentials are added.

## Local Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Without Supabase env vars, the app uses demo data shaped from the workbook findings. With Supabase configured, it reads from the database.

## Supabase Setup

1. Create a Supabase project.
2. Run the SQL files in `supabase/migrations/` in order in the Supabase SQL editor or through the Supabase CLI.
3. Copy `.env.example` to `.env.local` and fill:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_DEFAULT_ORG_ID=
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.1:8b
```

4. Create an organization and add team members:

```sql
insert into public.organizations (name)
values ('Plutus')
returning id;

insert into public.organization_members (organization_id, user_id, role)
values ('<organization-id>', '<auth-user-id>', 'owner');
```

Use the returned organization id as `NEXT_PUBLIC_DEFAULT_ORG_ID`.

Add finance users to the accounting allowlist before they can open the Accounting view:

```sql
insert into public.accounting_members (organization_id, user_id, role)
values ('<organization-id>', '<auth-user-id>', 'admin');
```

## Import The Workbook

After Supabase is configured:

```bash
npm run import:xlsx
```

The importer:

- Inserts every workbook row into `raw_import_rows`.
- Upserts normalized `companies`, `people`, `person_emails`, and `company_people`.
- Writes `merge_audit` rows for every company matching decision.
- Stores import stats on `import_batches`.

The same import flow is available through `POST /api/import` with multipart fields:

- `file`: XLSX file
- `organizationId`: Supabase organization id

## Local LLM Enrichment

Install and run Ollama locally, then make sure the model exists:

```bash
ollama serve
ollama pull llama3.1:8b
```

The enrichment UI calls `POST /api/enrichment/company`, which fetches a company website from the server and asks the local Ollama model for strict JSON. In production, enrichment is disabled unless `OLLAMA_BASE_URL` is explicitly configured on the server.

## Contacts Export

Use the Companies export bar to choose one criterion, such as `Sector/category = Biotech`, then export all matching linked contacts. The same flow is available through:

```bash
GET /api/export/contacts?criterion=sector_category&value=Biotech
```

## Tests

```bash
npm test
```

The tests verify:

- The current workbook has 18,623 import rows.
- Duplicate workbook headers are mapped intentionally.
- Company-name cleanup, email parsing, corporate-domain merge confidence, and personal-domain review behavior.
