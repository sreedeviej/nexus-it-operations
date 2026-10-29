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
npm run dev
```

The frontend development server is available at [http://localhost:3000](http://localhost:3000).

## Backend Checks

Run these commands from the `backend/` directory:

```powershell
npm run typecheck
npm test
npm run build
npm run db:validate
```

## Frontend Checks

Run these commands from the `frontend/` directory:

```powershell
npm run lint
npx --no-install tsc --noEmit
npm run build
```

## Environment Configuration

Copy `backend/.env.example` to `backend/.env` and configure the local database connection and required secrets.

Never commit `.env` files, passwords, tokens, or other credentials. The repository includes ignore rules for environment files.

## Security

- Passwords are hashed before storage.
- Authentication uses JSON Web Tokens.
- Ticket access is protected by authentication and authorization checks.
- Keep secrets out of source control and rotate any credentials that may have been exposed.

## Project Status

The backend authentication and ticket-management features are implemented, and the frontend production build and static checks have passed locally. Database connectivity and end-to-end integration should be verified in the target environment.
