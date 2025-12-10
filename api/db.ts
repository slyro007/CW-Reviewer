/**
 * Database utility for API routes
 * Re-exports Prisma client for use in serverless functions
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export default prisma

