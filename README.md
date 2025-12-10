# CW Reviewer

A web application for analyzing engineer time entries, productivity, and performance from ConnectWise Manage.

## Features

- Dashboard for viewing engineer time entries and projects
- AI-powered summaries and analysis
- CW Wrapped (annual summary similar to Spotify Wrapped)
- Trends analysis and engineer comparison (coming soon)
- MSP standards reviews (coming soon)

## Tech Stack

- React + TypeScript + Vite
- Tailwind CSS
- Zustand (state management)
- Prisma + PostgreSQL (Neon)
- Stack Auth
- ConnectWise Manage API (read-only)
- OpenAI GPT API
- Vercel (deployment)

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables (see `.env.example`)

3. Set up the database:
```bash
npm run db:generate
npm run db:push
```

4. Run the development server:
```bash
npm run dev
```

## Environment Variables

See `.env.example` for required environment variables.

