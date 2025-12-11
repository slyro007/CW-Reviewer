---
trigger: always_on
---

Project Rules & Context
Technology Stack
Frontend: React (Vite), TypeScript, Tailwind CSS, Recharts, Framer Motion, Lucide React.
State Management: Zustand (stores in src/stores/).
Backend: Vercel Serverless Functions (api/ directory).
Database: PostgreSQL (Neon/Local), Prisma ORM (prisma/schema.prisma).
Integration: ConnectWise Manage API (Read-Only).
Key Architectural Decisions
Vercel Serverless API:

Backend logic resides in api/*.ts files using @vercel/node.
These functions handle DB connections and CW API calls securely.
Frontend: src/lib/api.ts provides a typed client to call these serverless functions.
Team & Filtering Logic:

Global Team Filter: Implemented via selectedEngineerStore.ts.
Team Definitions: Hardcoded in TEAM_DEFINITIONS constant (Service Desk, Professional Services, etc.).
Behavior: Selecting a Team filters the Engineer list (null engineer = "All Team Members").
App-Wide Impact: Dashboard, Projects, Tickets, and Trends must all respect the selected Team.
Project Management:

"Ready to Close" Status: Treated as "Closed" for metrics and completion tracking.
Audit Trail: Critical for accurate "Closed By" and "Closed Date" tracking, as projects may sit in "Ready to Close" indefinitely.
Sync Strategy:

Incremental Sync: modifiedSince timestamps used to fetch only changed records.
Allowed Engineers: Strict filtering for only specific engineers (7 ids) to keep data relevant and minimize API usage.
Code Conventions
Imports: Use @/ alias for src/.
Components: Functional components with strict TypeScript interfaces.
Stores: Sliced by domain (projectsStore, ticketsStore, etc.).
Environment Variables:
Backend: CW_ prefix (e.g., CW_COMPANY_ID).
Frontend: VITE_CW_ prefix for public vars (use sparingly).
Data & API nuances
Prisma: Used for local caching of CW data to avoid API rate limits and improve speed.
ConnectWise: "Codebase" is dynamic or hardcoded to v4_6_release.
Filtering: Always filter by ALLOWED_ENGINEER_IDENTIFIERS at the API/Sync level.
