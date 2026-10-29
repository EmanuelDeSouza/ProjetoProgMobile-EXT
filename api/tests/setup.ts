// Preload dos testes (bunfig.toml): usa um banco separado (cuidalar_test) para não sujar o de
// desenvolvimento, cria se não existir e aplica as migrations. Push nunca sai de verdade em teste.
import { join } from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const base = process.env.DATABASE_URL ?? "postgres://cuidalar:cuidalar@localhost:5432/cuidalar";
const url = new URL(process.env.TEST_DATABASE_URL ?? base);
if (!process.env.TEST_DATABASE_URL) url.pathname = "/cuidalar_test";
process.env.DATABASE_URL = url.toString();
process.env.MOCK_PUSH = "true";

const nome = url.pathname.slice(1);
const admin = new URL(url);
admin.pathname = "/postgres";
const sqlAdmin = postgres(admin.toString(), { max: 1, onnotice: () => {} });
const existe = await sqlAdmin`select 1 from pg_database where datname = ${nome}`;
if (existe.length === 0) await sqlAdmin.unsafe(`create database "${nome.replace(/"/g, "")}"`);
await sqlAdmin.end();

const conn = postgres(url.toString(), { max: 1, onnotice: () => {} });
await migrate(drizzle(conn), { migrationsFolder: join(import.meta.dir, "../db/migrations") });
await conn.end();
