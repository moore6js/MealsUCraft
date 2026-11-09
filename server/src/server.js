import "dotenv/config";
import cors from "cors";
import express from "express";
import { pool, testDatabaseConnection } from "./db.js";
import { initializeDatabase } from "./initializeDatabase.js";

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const respondWithRows = async (response, query, values = []) => {
  try {
    const result = await pool.query(query, values);
    response.json(result.rows);
  } catch (error) {
    console.error("Database query failed:", error);
    response.status(500).json({
      message: "Database query failed.",
      error: error.message
    });
  }
};

const parsePositiveId = (value) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

const isValidDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

/** Returns a basic server health status. */
app.get("/api/health", (_request, response) => {
  response.json({
    message: "Node server is running."
  });
});

/** Checks the PostgreSQL connection and returns the database timestamp. */
app.get("/api/health/db", async (_request, response) => {
  try {
    const result = await testDatabaseConnection();
    response.json({
      message: "Database connection successful.",
      timestamp: result.rows[0].now
    });
  } catch (error) {
    console.error("Database health check failed:", error);
    response.status(500).json({
      message: "Database connection failed.",
      error: error.message
    });
  }
});

/** Returns all users ordered by id. */
app.get("/api/users", (_request, response) => {
  return respondWithRows(response, "SELECT * FROM public.users ORDER BY user_id");
});

/** Returns all food items ordered by id. */
app.get("/api/food-items", (_request, response) => {
  return respondWithRows(response, "SELECT * FROM public.food_items ORDER BY food_item_id");
});

/** Returns all dining halls ordered by id. */
app.get("/api/dining-halls", (_request, response) => {
  return respondWithRows(response, "SELECT * FROM public.dining_halls ORDER BY dining_hall_id");
});

/** Returns all meals, most recent first. */
app.get("/api/meals", (_request, response) => {
  return respondWithRows(response, "SELECT * FROM public.meals ORDER BY created_at DESC");
});

/** Returns food items with an availability record for the specified dining hall. */
app.get("/api/dining-halls/:diningHallId/food-items", (request, response) => {
  const diningHallId = parsePositiveId(request.params.diningHallId);
  if (diningHallId === null) {
    return response.status(400).json({ message: "diningHallId must be a positive integer." });
  }

  return respondWithRows(response, `
    SELECT DISTINCT food_item.*
    FROM public.food_items AS food_item
    JOIN public.menu_availability AS availability
      ON availability.food_item_id = food_item.food_item_id
    WHERE availability.dining_hall_id = $1
    ORDER BY food_item.food_item_id
  `, [diningHallId]);
});

/**
 * Returns food items available on the requested date and optional meal period.
 * Query params: date (YYYY-MM-DD, defaults to today), meal_period (optional).
 */
app.get("/api/food-items/availability", (request, response) => {
  const { date, meal_period: mealPeriod } = request.query;
  if (date !== undefined && !isValidDate(date)) {
    return response.status(400).json({ message: "date must be a valid YYYY-MM-DD date." });
  }
  if (mealPeriod !== undefined && typeof mealPeriod !== "string") {
    return response.status(400).json({ message: "meal_period must be a string." });
  }

  return respondWithRows(response, `
    SELECT DISTINCT food_item.*
    FROM public.food_items AS food_item
    JOIN public.menu_availability AS availability
      ON availability.food_item_id = food_item.food_item_id
    WHERE availability.is_available = TRUE
      AND availability.available_date = COALESCE($1::date, CURRENT_DATE)
      AND ($2::text IS NULL OR availability.meal_period = $2)
    ORDER BY food_item.food_item_id
  `, [date ?? null, mealPeriod ?? null]);
});

/**
 * Returns available food items for a dining hall, date, and optional meal period.
 * Query params: date (YYYY-MM-DD, defaults to today), meal_period (optional).
 */
app.get("/api/dining-halls/:diningHallId/food-items/availability", (request, response) => {
  const diningHallId = parsePositiveId(request.params.diningHallId);
  const { date, meal_period: mealPeriod } = request.query;

  if (diningHallId === null) {
    return response.status(400).json({ message: "diningHallId must be a positive integer." });
  }
  if (date !== undefined && !isValidDate(date)) {
    return response.status(400).json({ message: "date must be a valid YYYY-MM-DD date." });
  }
  if (mealPeriod !== undefined && typeof mealPeriod !== "string") {
    return response.status(400).json({ message: "meal_period must be a string." });
  }

  return respondWithRows(response, `
    SELECT DISTINCT food_item.*
    FROM public.food_items AS food_item
    JOIN public.menu_availability AS availability
      ON availability.food_item_id = food_item.food_item_id
    WHERE availability.dining_hall_id = $1
      AND availability.is_available = TRUE
      AND availability.available_date = COALESCE($2::date, CURRENT_DATE)
      AND ($3::text IS NULL OR availability.meal_period = $3)
    ORDER BY food_item.food_item_id
  `, [diningHallId, date ?? null, mealPeriod ?? null]);
});

const mealItemsQuery = `
  SELECT meal_item.*, food_item.name AS food_item_name, food_item.serving_size, food_item.calories
  FROM public.meal_items AS meal_item
  JOIN public.food_items AS food_item
    ON food_item.food_item_id = meal_item.food_item_id
`;

/** Returns all meal items with their food item name, serving size, and calories. */
app.get("/api/meal-items", (_request, response) => {
  return respondWithRows(response, `${mealItemsQuery} ORDER BY meal_item.meal_item_id`);
});

/** Returns meal items with food item details for the specified meal. */
app.get("/api/meals/:mealId/items", (request, response) => {
  const mealId = parsePositiveId(request.params.mealId);
  if (mealId === null) {
    return response.status(400).json({ message: "mealId must be a positive integer." });
  }

  return respondWithRows(response, `${mealItemsQuery} WHERE meal_item.meal_id = $1 ORDER BY meal_item.meal_item_id`, [mealId]);
});

const startServer = async () => {
  await initializeDatabase();
  await testDatabaseConnection();

  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log("PostgreSQL connection successful.");
  });
};

startServer().catch(async (error) => {
  console.error("Failed to initialize PostgreSQL:", error.message);
  await pool.end();
  process.exitCode = 1;
});

export default app;
