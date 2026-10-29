# NEXUS

NEXUS is a cloud-native IT operations and incident management platform. The
repository currently contains independent Next.js frontend and Express backend
applications while the project foundation is established.

## Local development

Install dependencies in each application directory before running it.

```powershell
cd backend
npm run dev
```

The API health endpoint is available at `http://localhost:5000/api/health`.

```powershell
cd frontend
npm run dev
```

The frontend development server is available at `http://localhost:3000`.

## Backend checks

```powershell
cd backend
npm run typecheck
npm test
npm run build
```

## Environment configuration

Copy `backend/.env.example` to `backend/.env` and adjust only local values.
Never commit `.env` files. Database configuration is intentionally deferred to
Phase 2.
