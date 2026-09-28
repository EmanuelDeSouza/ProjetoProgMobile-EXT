import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../db/schema";
import { config } from "./config";

export type Database = ReturnType<typeof createDbClient>;

export function createDbClient(databaseUrl: string = config.DATABASE_URL) {
  const client = postgres(databaseUrl, {
    max: 10,
    connect_timeout: 5,
  });

  return drizzle(client, { schema });
}

let dbInstance: Database | null = null;

export function getDb(): Database {
  if (!dbInstance) {
    dbInstance = createDbClient();
  }
  return dbInstance;
}
