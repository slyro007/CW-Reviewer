# Environment Variables Setup

## Client-Side Variables (VITE_ prefix)

These variables are exposed to the browser and should be set in your `.env` file with the `VITE_` prefix:

```env
VITE_CW_CLIENT_ID=your_connectwise_client_id
VITE_CW_PUBLIC_KEY=your_connectwise_public_key
VITE_CW_BASE_URL=https://api-na.myconnectwise.net
VITE_CW_COMPANY_ID=your_company_id
VITE_STACK_PROJECT_ID=your_stack_project_id
VITE_STACK_PUBLISHABLE_CLIENT_KEY=your_stack_publishable_key
```

## Server-Side Variables (No prefix)

These variables are only used in API routes (serverless functions) and should NOT have the `VITE_` prefix:

```env
CW_PRIVATE_KEY=your_connectwise_private_key
OPENAI_API_KEY=your_openai_api_key
STACK_SECRET_SERVER_KEY=your_stack_secret_key
DATABASE_URL=postgresql://user:password@host:port/database?sslmode=require
```

## Vercel Deployment

When deploying to Vercel, set all environment variables in the Vercel dashboard:
1. Go to your project settings
2. Navigate to "Environment Variables"
3. Add all variables listed above

**Note**: For server-side variables, you can use the same names without the `VITE_` prefix, or keep both versions. The API routes will check for both.

## Current Values

Based on your setup:
- Client ID: `2c1f013e-0e56-4b3c-b89b-79375481f44a`
- Database: Neon PostgreSQL connection string provided

Make sure to set all other variables before running the application.

