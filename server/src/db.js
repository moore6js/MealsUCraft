import pg from "pg";

const { Pool } = pg;

export const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || "mealsUCraft",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "Pa$$w0rd"
};

const pool = new Pool(dbConfig);

export const testDatabaseConnection = async () => {
  return pool.query("SELECT NOW() AS now");
};

export { pool };
export default pool;
