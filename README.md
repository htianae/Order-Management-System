# Order Management System

An internal order management application with an English interface, built with Vue 3, TypeScript, Express, Prisma, and PostgreSQL.

The application follows inquiries through quoting, purchasing, payment approvals, shipping, and customer payments. It includes Excel imports and exports, business reports, and an optional AI assistant.

## Features

- **Orders and inquiries:** create orders with multiple line items, record supplier quotes, track bid results, and search historical records.
- **Purchasing:** group items into purchase batches, track contracts and costs, and submit payment requests for management approval.
- **Shipping:** submit and approve shipping requests, record logistics details, and export shipping documents.
- **Customer payments:** record received amounts and outstanding balances.
- **Reports:** management dashboard, payment request summary, annual business summary, and business analysis.
- **Files:** attach supporting documents and images to orders and items.
- **Access control:** employee, manager, and administrator roles, with authenticated API access.
- **AI assistant:** uses permission-scoped tools to query business data through the backend. DashScope/Qwen is the configured provider.

The user management page is currently a placeholder. There is no public registration endpoint or bundled account seed; see [First login](#first-login).

## Technology

| Layer | Libraries |
| --- | --- |
| Frontend | Vue 3, Vite, TypeScript, Element Plus, Pinia, Vue Router, Axios, SheetJS |
| Backend | Node.js, Express, TypeScript, Prisma, Zod, ExcelJS |
| Database | PostgreSQL |
| Deployment | Nginx and PM2; example configuration is included |

## Local setup

Use Node.js 22 or later, npm, and a running PostgreSQL instance. Run the following commands from this directory.

```bash
npm ci
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env
```

Create an empty PostgreSQL database named `order_system`. Edit `backend/.env` to set `DATABASE_URL` to your database connection string and replace `JWT_SECRET` with a long random value.

Generate the database client, then initialize a **new, empty development database**:

```bash
npm run prisma:generate
npm exec --workspace backend -- prisma db push
```

The repository does not include a complete Prisma migration history. The SQL files under `backend/prisma/manual-migrations/` are targeted updates for existing installations, not a fresh-install migration sequence. Review schema changes and back up existing databases before applying updates; do not run these commands blindly against production.

Start both applications:

```bash
npm run dev
```

| Service | Address |
| --- | --- |
| Frontend | http://localhost:5173 |
| Backend | http://localhost:4000 |
| Health check | http://localhost:4000/health |

To start one application, use `npm run dev:frontend` or `npm run dev:backend`.

### First login

An account must already exist in PostgreSQL. To provision the first account in a local development database:

1. Generate a bcrypt hash of a password. This example reads it without echoing it to the terminal and prints only the hash:

   ```bash
   read -rs -p 'New account password: ' ACCOUNT_PASSWORD; echo
   printf '%s' "$ACCOUNT_PASSWORD" | node --input-type=module -e 'import bcrypt from "bcryptjs"; let password = ""; for await (const chunk of process.stdin) password += chunk; console.log(await bcrypt.hash(password, 10));'
   unset ACCOUNT_PASSWORD
   ```

   This shell example uses Bash. The hashing cost of `10` matches the example configuration.

2. Run `npm run prisma:studio` and create a `User` record with your chosen `username`, the generated `passwordHash`, `isActive: true`, and role `ADMIN` or `BOSS` (displayed as Manager). Leave generated fields at their defaults.
3. Sign in with that username and the original password. Never store the plaintext password in `passwordHash`.

There are no default credentials.

## Configuration

Frontend settings are in `frontend/.env`:

```dotenv
VITE_APP_TITLE=Order Management System
VITE_API_BASE_URL=http://localhost:4000/api
```

Backend settings are documented by [backend/.env.example](backend/.env.example). Key settings include:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Token signing secret |
| `CORS_ORIGIN` | Comma-separated allowed frontend origins |
| `HOST`, `PORT` | Backend listening address and port |
| `UPLOAD_DIR` | Upload directory, relative to the backend working directory |
| `FILE_BASE_URL` | Public base URL for uploaded files |
| `DASHSCOPE_API_KEY` | Backend-only key for the optional AI assistant |
| `AI_MODEL`, `DASHSCOPE_BASE_URL` | Model name and compatible provider endpoint |

Keep real credentials in local environment files or your deployment secret store. The example values are placeholders. Do not add API keys to frontend variables: Vite exposes those values to browsers.

### AI assistant

The chat widget sends requests to `/api/ai/chat`, using the existing login token. The assistant uses backend tools and should state when the available data is insufficient. Its default response language is English. Existing multilingual business data remains searchable.

Set `DASHSCOPE_API_KEY` in the backend environment to enable provider calls. Confirm that the configured model and endpoint are available in your provider account. Unit tests mock the provider and do not require a paid AI call.

## English localization and data compatibility

- Application labels, validation messages, generated document labels, and documentation are in English.
- Stored enum values, API field names, and database identifiers retain their original technical names.
- Existing customer names, product names, notes, and uploaded documents are business data and are not automatically translated.
- Chinese spreadsheet label aliases are retained where needed to import older files. Newly generated templates and reports use English labels.
- Monetary amounts keep their original currency, **CNY**. Changing the display language does not convert amounts or change tax rules.

## Development checks

```bash
npm run typecheck
npm test
npm run build
```

Tests cover backend business calculations, permissions, AI tools, and spreadsheet handling, plus frontend helpers. These checks do not replace a database-backed acceptance test of your deployment.

## Project structure

```text
frontend/
  src/                  Pages, components, API clients, stores, and helpers
backend/
  src/                  API routes, controllers, AI tools, and helpers
  prisma/               Database schema and targeted manual SQL updates
  templates/            Excel document templates
deploy/                 Nginx, environment examples, and deployment guide
scripts/                Local development checks
ecosystem.config.cjs    PM2 process configuration
```

## Deployment

See [deploy/README.md](deploy/README.md) for the single-server deployment guide. The Nginx example listens on HTTP; configure HTTPS before using it for real credentials and company data. Uploaded files are currently served from `/uploads` as static files; consider this access model before exposing the service publicly.

## Publishing to GitHub

Publish this directory as the repository root. Do not include the parent Chinese project, dependencies, build output, actual `.env` files, uploaded business documents, or database backups.

For a new, empty GitHub repository:

```bash
git init -b main
git add .
git diff --cached --stat
git commit -m "Add English order management system"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

Replace the example URL with your repository URL. If the remote repository already contains commits, clone it and integrate these files first instead of overwriting its history.
