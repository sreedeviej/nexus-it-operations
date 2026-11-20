# NEXUS

NEXUS is a cloud-native IT operations and incident management platform built with Next.js, React, Express, TypeScript, Prisma, and PostgreSQL.

The platform provides authenticated ticket management, user accounts, and a dashboard for IT operations workflows.

## Project Structure

- `frontend/` — Next.js frontend application
- `backend/` — Express and TypeScript REST API
- `backend/prisma/` — Prisma schema and database migrations

## Prerequisites

- Node.js and npm
- PostgreSQL
- Git

## Local Development

### Backend

```powershell
cd backend
npm install
```

Configure your local environment by copying `backend/.env.example` to `backend/.env` and updating the required settings.
Set the JWT secret to a randomly generated value of at least 32 characters.

Start the backend:

```powershell
npm run dev
```

The API health endpoint is available at [http://localhost:5000/api/health](http://localhost:5000/api/health).

### Frontend

Open a separate terminal:

```powershell
cd frontend
npm install
Copy-Item .env.example .env.local
npm run dev
```

Edit `frontend/.env.local` to set `BACKEND_API_URL` and a generated
`CSRF_SECRET` value of at least 32 characters.

The frontend development server is available at [http://localhost:3000](http://localhost:3000).

The browser communicates only with the Next.js application. Next.js proxies
authentication and ticket requests to Express using a server-only API URL and
stores the backend access token in an HttpOnly session cookie. Configure these
frontend variables by name: `BACKEND_API_URL` and `CSRF_SECRET`. Configure
`JWT_ACCESS_SECRET`, `JWT_ACCESS_EXPIRES_IN`, and `DATABASE_URL` for the backend.
Use HTTPS in production; the session and CSRF cookies are marked Secure there.

## Backend Checks

Run these commands from the `backend/` directory:

```powershell
npm run typecheck
npm test
npm run build
npm run db:validate
```

Backend integration tests require a dedicated PostgreSQL database named
`nexus_test`. Copy `backend/.env.test.example` to `backend/.env.test` and
configure `TEST_DATABASE_URL`, `SHADOW_DATABASE_URL`, and a test-only
`JWT_ACCESS_SECRET` there. `SHADOW_DATABASE_URL` must target the separate,
disposable `nexus_test_shadow` database as `nexus_test_admin`; never use a
database containing application data.
Use `TEST_DATABASE_ADMIN_URL` only for read-only preflight checks of server
identity, database existence, and creation privileges; it is not used by the
integration-test runner.
The test runner loads only `.env.test`, requires the connection URL to identify
`nexus_test`, and assigns it as Prisma's `DATABASE_URL`; it never falls back to
the development `DATABASE_URL`. The runner does not create, drop, or reset
databases. Apply checked-in migrations to the test database before running
integration tests.

## Frontend Checks

Run these commands from the `frontend/` directory:

```powershell
npm run lint
npx --no-install tsc --noEmit
npm run build
npm test
```

## Environment Configuration

Copy `backend/.env.example` to `backend/.env` and configure the local database connection and required secrets. Copy `frontend/.env.example` to `frontend/.env.local` and configure its server-only settings.

Never commit `.env` files, passwords, tokens, or other credentials. The repository includes ignore rules for environment files.

## Security

- Passwords are hashed before storage.
- Authentication uses backend-issued JSON Web Tokens stored by the Next.js BFF in an HttpOnly cookie; the browser never receives the JWT in an API response.
- State-changing BFF requests require a same-origin `Origin` and a signed double-submit CSRF token.
- Ticket access is protected by authentication and authorization checks.
- Keep secrets out of source control and rotate any credentials that may have been exposed.

### Required configuration names

- Frontend: `BACKEND_API_URL`, `CSRF_SECRET`
- Backend: `JWT_ACCESS_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `DATABASE_URL`
- Deployment/runtime: `NODE_ENV`, `PORT`, `CORS_ORIGINS`
- Prisma migration development: `SHADOW_DATABASE_URL`

Set `BACKEND_API_URL` to the Express API origin only; production requires HTTPS.
Generate `CSRF_SECRET` and `JWT_ACCESS_SECRET` independently, each with at least
32 random characters. The example files intentionally leave secret values blank.

## Project Status

The backend authentication and ticket-management APIs are integrated with the
Next.js BFF and the protected dashboard. Frontend BFF tests and production
builds, along with backend static checks, pass locally. Database-backed backend
integration tests require a dedicated disposable test database and are not run
against the development database.
