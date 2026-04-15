require("./env");

const { PrismaClient } = require("@prisma/client");

/**
 * Primary datasource: `DATABASE_URL` only (see prisma/schema.prisma).
 * No fallback URLs; env.js fails fast if DATABASE_URL is unset.
 */
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

module.exports = prisma;
