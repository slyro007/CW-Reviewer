/**
 * Stack Auth Configuration
 * 
 * This file sets up Stack Auth for authentication.
 * Stack Auth will be initialized in the App component.
 */

import { StackProvider } from '@stackframe/stack'

// Stack Auth configuration will be initialized with environment variables
// VITE_STACK_PROJECT_ID
// VITE_STACK_PUBLISHABLE_CLIENT_KEY

export const stackConfig = {
  projectId: import.meta.env.VITE_STACK_PROJECT_ID,
  publishableClientKey: import.meta.env.VITE_STACK_PUBLISHABLE_CLIENT_KEY,
}

export { StackProvider }

