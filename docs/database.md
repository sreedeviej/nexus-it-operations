# Database Schema

## Phase 2 foundation

The first migration establishes identity and team ownership only. Ticket,
asset, notification, attachment, SLA, and refresh-token tables are deferred
until their respective workflows are implemented.

| Model | Purpose | Important constraints |
| --- | --- | --- |
| `User` | Future authenticated platform account | Unique email; role and active-state indexes |
| `Team` | Support or operational team | Unique name and stable unique slug |
| `TeamMembership` | User-to-team relationship | One membership per user/team pair; cascades only when its user or team is deleted |

`Role` is a PostgreSQL enum with `USER`, `SUPPORT_AGENT`, `TEAM_LEAD`, and
`ADMIN`. Application authorization will be implemented in Phase 3; the enum
is established now so persisted identities have a stable, constrained role
value from the start.

## Migration access

The NEXUS application connects as the restricted `nexus_app` role. Local
Prisma migrations use a separate, disposable `nexus_shadow` database through
`SHADOW_DATABASE_URL`; this avoids granting the application role permission to
create databases. Production migrations will use a dedicated migration
credential in a later deployment phase.
