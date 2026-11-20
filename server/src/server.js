import "dotenv/config";
import cors from "cors";
import express from "express";
import { pool, testDatabaseConnection } from "./db.js";
import { initializeDatabase } from "./initializeDatabase.js";

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

/** Execute a query and send its rows, converting database errors to an HTTP response. */
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

/** Return a positive integer ID, or null when the supplied value is invalid. */
const parsePositiveId = (value) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

/** Validate a YYYY-MM-DD date, including impossible calendar dates. */
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

/** Returns meals newest-first, including their food names alphabetized within each meal. */
app.get("/api/meals", (_request, response) => {
  return respondWithRows(response, `
    SELECT meal.*,
      COALESCE((
        SELECT json_agg(json_build_object(
          'food_item_id', food_item.food_item_id,
          'name', food_item.name,
          'quantity', meal_item.quantity
        ) ORDER BY LOWER(food_item.name), food_item.name, food_item.food_item_id)
        FROM public.meal_items AS meal_item
        JOIN public.food_items AS food_item
          ON food_item.food_item_id = meal_item.food_item_id
        WHERE meal_item.meal_id = meal.meal_id
      ), '[]'::json) AS food_items
    FROM public.meals AS meal
    ORDER BY meal.created_at DESC, meal.meal_id DESC
  `);
});

/** Creates a meal for the demo user, deriving its nutrition from the selected database foods. */
app.post("/api/meals", async (request, response) => {
  const demoUserId = 2;
  const { foodItems, mealName: requestedMealName } = request.body ?? {};

  // Trim the optional name; an empty value will use the generated meal ID as its default.
  if (requestedMealName !== undefined && typeof requestedMealName !== "string") {
    return response.status(400).json({ message: "mealName must be a string." });
  }
  const trimmedMealName = requestedMealName?.trim() ?? "";
  if (trimmedMealName.length > 150) {
    return response.status(400).json({ message: "mealName must be 150 characters or fewer." });
  }

  if (!Array.isArray(foodItems) || foodItems.length === 0) {
    return response.status(400).json({ message: "foodItems must contain at least one food item." });
  }

  // Combine repeated food IDs so each food is stored once with its total quantity.
  const quantitiesByFoodId = new Map();
  for (const item of foodItems) {
    const foodItemId = parsePositiveId(item?.food_item_id);
    const quantity = item?.quantity;
    if (foodItemId === null || !Number.isSafeInteger(quantity) || quantity <= 0) {
      return response.status(400).json({ message: "Each food item must have a valid food_item_id and positive integer quantity." });
    }
    quantitiesByFoodId.set(foodItemId, (quantitiesByFoodId.get(foodItemId) ?? 0) + quantity);
  }

  const foodItemIds = [...quantitiesByFoodId.keys()];
  let client;

  try {
    // Keep the meal row and all item rows atomic: either every insert succeeds or none do.
    client = await pool.connect();
    await client.query("BEGIN");

    const userResult = await client.query(
      "SELECT user_id FROM public.users WHERE user_id = $1",
      [demoUserId]
    );
    if (userResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return response.status(400).json({ message: "Demo user with id 2 does not exist." });
    }

    // Load nutrition from the database instead of trusting values submitted by the browser.
    const foodResult = await client.query(
      "SELECT food_item_id, calories, protein_g, carbs_g, fat_g FROM public.food_items WHERE food_item_id = ANY($1::int[])",
      [foodItemIds]
    );
    if (foodResult.rowCount !== foodItemIds.length) {
      await client.query("ROLLBACK");
      return response.status(400).json({ message: "One or more food items do not exist." });
    }

    const totals = foodResult.rows.reduce((sum, foodItem) => {
      const quantity = quantitiesByFoodId.get(foodItem.food_item_id);
      sum.calories += Number(foodItem.calories ?? 0) * quantity;
      sum.protein += Number(foodItem.protein_g ?? 0) * quantity;
      sum.carbs += Number(foodItem.carbs_g ?? 0) * quantity;
      sum.fat += Number(foodItem.fat_g ?? 0) * quantity;
      return sum;
    }, { calories: 0, protein: 0, carbs: 0, fat: 0 });

    // Insert first to obtain the generated ID, then apply either the custom or default name.
    const mealResult = await client.query(`
      INSERT INTO public.meals (
        user_id, meal_name, total_calories, total_protein, total_carbs, total_fat
      )
      VALUES ($1, 'Meal', $2, $3, $4, $5)
      RETURNING meal_id
    `, [
      demoUserId,
      totals.calories,
      totals.protein.toFixed(2),
      totals.carbs.toFixed(2),
      totals.fat.toFixed(2)
    ]);
    const mealId = mealResult.rows[0].meal_id;
    const mealName = trimmedMealName || `Meal ${mealId}`;

    await client.query(
      "UPDATE public.meals SET meal_name = $1 WHERE meal_id = $2",
      [mealName, mealId]
    );

    // Save each selected food and quantity before committing the completed meal.
    for (const [foodItemId, quantity] of quantitiesByFoodId) {
      await client.query(
        "INSERT INTO public.meal_items (meal_id, food_item_id, quantity) VALUES ($1, $2, $3)",
        [mealId, foodItemId, quantity]
      );
    }

    await client.query("COMMIT");
    return response.status(201).json({
      meal_id: mealId,
      meal_name: mealName,
      user_id: demoUserId,
      total_calories: totals.calories,
      total_protein: Number(totals.protein.toFixed(2)),
      total_carbs: Number(totals.carbs.toFixed(2)),
      total_fat: Number(totals.fat.toFixed(2)),
      food_items: foodResult.rows.map((foodItem) => ({
        food_item_id: foodItem.food_item_id,
        quantity: quantitiesByFoodId.get(foodItem.food_item_id)
      }))
    });
  } catch (error) {
    if (client) {
      // Undo any partial writes if validation or a database operation fails mid-transaction.
      await client.query("ROLLBACK").catch(() => {});
    }
    console.error("Meal creation failed:", error);
    return response.status(500).json({ message: "Meal creation failed." });
  } finally {
    client?.release();
  }
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
