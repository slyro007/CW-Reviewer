# CW Reviewer Setup Guide

## Prerequisites

- Node.js 18+ installed
- PostgreSQL database (Neon) connection string
- ConnectWise Manage API credentials
- OpenAI API key
- Stack Auth project credentials

## Initial Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Set Up Environment Variables**
   - Copy the environment variables from `ENV_SETUP.md`
   - Create a `.env` file in the root directory
   - Add all required variables (see `ENV_SETUP.md` for details)

3. **Set Up Database**
   ```bash
   # Generate Prisma Client
   npm run db:generate
   
   # Push schema to database (for development)
   npm run db:push
   
   # Or run migrations (for production)
   npm run db:migrate
   ```

4. **Start Development Server**
   ```bash
   npm run dev
   ```

   The app will be available at `http://localhost:3000`

## Project Structure

```
├── api/                 # Vercel serverless functions
│   ├── connectwise.ts  # ConnectWise API client
│   ├── openai.ts       # OpenAI integration
│   ├── members.ts      # Members API endpoint
│   ├── time-entries.ts # Time entries API endpoint
│   ├── tickets.ts      # Tickets API endpoint
│   ├── boards.ts       # Boards API endpoint
│   └── analyze.ts      # AI analysis endpoint
├── prisma/
│   └── schema.prisma   # Database schema
├── src/
│   ├── components/     # React components
│   ├── pages/         # Page components
│   ├── stores/         # Zustand state stores
│   ├── types/          # TypeScript types
│   └── lib/            # Utility functions
└── public/             # Static assets
```

## Features Implemented

### Foundation
- ✅ React + Vite + TypeScript setup
- ✅ Tailwind CSS configuration
- ✅ Zustand state management
- ✅ Prisma database schema
- ✅ ConnectWise API client (read-only, selective fetching)
- ✅ OpenAI integration structure
- ✅ Vercel serverless functions
- ✅ Dashboard UI with placeholders
- ✅ CW Wrapped page structure

### Future Features (Ready to Implement)
- 🔄 Trends analysis
- 🔄 Engineer comparison
- 🔄 Note quality analysis
- 🔄 MSP standards reviews
- 🔄 AI summary exports

## Next Steps

1. **Complete Stack Auth Integration**
   - Follow Stack Auth documentation to integrate login UI
   - Update `src/pages/Login.tsx` with Stack Auth components
   - Add protected routes

2. **Connect API to Frontend**
   - Update `src/pages/Dashboard.tsx` to fetch data from API
   - Add loading and error states
   - Implement data refresh

3. **Implement Data Sync**
   - Create background job to sync ConnectWise data
   - Store data in database for faster queries
   - Implement incremental updates

4. **Add Advanced Features**
   - Trends visualization with charts
   - Engineer comparison UI
   - AI analysis and reviews
   - Export functionality

## Deployment to Vercel

1. Push code to GitHub repository
2. Connect repository to Vercel
3. Set environment variables in Vercel dashboard
4. Deploy

The `vercel.json` is already configured for Vite projects.

## Troubleshooting

### API Routes Not Working
- Ensure environment variables are set in Vercel dashboard
- Check that API routes are in `/api` folder
- Verify Vercel configuration in `vercel.json`

### Database Connection Issues
- Verify `DATABASE_URL` is correct
- Check Neon database is accessible
- Ensure Prisma schema matches database

### ConnectWise API Errors
- Verify API credentials are correct
- Check API rate limits
- Ensure read-only permissions are set

