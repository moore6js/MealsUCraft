import { readFile } from "node:fs/promises";
import pg from "pg";
import { dbConfig, pool } from "./db.js";

const { Pool } = pg;

export const initializeDatabase = async () => {
  const maintenancePool = new Pool({
    ...dbConfig,
    database: "postgres"
  });

  try {
    const result = await maintenancePool.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [dbConfig.database]
    );

    if (result.rowCount === 0) {
      const databaseIdentifier = `"${dbConfig.database.replaceAll('"', '""')}"`;

      try {
        await maintenancePool.query(`CREATE DATABASE ${databaseIdentifier}`);
      } catch (error) {
        if (error.code !== "42P04") {
          throw error;
        }
      }
    }
  } finally {
    await maintenancePool.end();
  }

  const schema = await readFile(new URL("./schema.sql", import.meta.url), "utf8");
  await pool.query(schema);
};
