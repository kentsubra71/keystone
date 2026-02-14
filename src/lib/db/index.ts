import { neon, NeonQueryFunction } from "@neondatabase/serverless";
import { drizzle, NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Handle missing DATABASE_URL gracefully during build
const getDatabaseUrl = () => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // Return a placeholder for build time - actual operations will fail at runtime
    console.warn("DATABASE_URL not set - database operations will fail");
    return "postgresql://placeholder:placeholder@placeholder/placeholder";
  }
  return url;
};

const sql = neon(getDatabaseUrl());

export const db = drizzle(sql, { schema });

export type Database = typeof db;

// Helper to check if database is configured
export function isDatabaseConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}
