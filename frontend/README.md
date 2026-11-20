This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Browser E2E tests

Install the Playwright Chromium browser once with `npx playwright install chromium`, then run:

```bash
npm run e2e
```

The E2E runner reads database configuration only from `../backend/.env.test`, verifies the live connection is `nexus_test` as `nexus_test_user`, and never uses `backend/.env`. It starts the backend and frontend with isolated local settings, creates a run-specific support-role fixture, and removes only that run's user and ticket records in cleanup. It does not run migrations, resets, or seeds.

The browser journey covers registration, login, dashboard/profile and empty states, ticket creation, search/filter, a support-role status transition, logout, CSRF failures, unauthenticated API behavior, and mobile-width visibility. Production `Secure` cookie behavior remains covered by the BFF unit test; this local E2E runner uses HTTP development mode.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
