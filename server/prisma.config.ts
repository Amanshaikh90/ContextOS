import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Read directly from the process memory environment variables injected by Railway
    url: process.env.DATABASE_URL!,
  },
});