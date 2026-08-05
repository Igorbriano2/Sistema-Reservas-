import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../config/env.js";
import * as schema from "./schema/index.js";

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : false,
});

export const db = drizzle(pool, { schema });

export type Database = typeof db;

// Aceita tanto o client top-level (db) quanto um tx dentro de db.transaction(async (tx) => ...),
// para que funcoes de lib/ possam ser chamadas em ambos os contextos.
export type Queryable = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];
