import { useEffect, useMemo, useState } from "react";

// Fetch JSON from the API and turn unsuccessful responses into user-displayable errors.
const requestJson = async (url, options) => {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "The request could not be completed.");
  }
  return data;
};

const emptyNutrition = { calories: 0, protein: 0, carbs: 0, fat: 0 };

// Keep nutrition values readable while removing unnecessary trailing zeroes.
const formatAmount = (value) => Number(value || 0).toFixed(2).replace(/\.00$/, "");

// Display the same four nutrition totals for food items and meals.
function NutritionSummary({ nutrition }) {
  return (
    <dl className="nutrition-summary">
      <div><dt>Calories</dt><dd>{formatAmount(nutrition.calories)} kcal</dd></div>
      <div><dt>Protein</dt><dd>{formatAmount(nutrition.protein)} g</dd></div>
      <div><dt>Carbs</dt><dd>{formatAmount(nutrition.carbs)} g</dd></div>
      <div><dt>Fat</dt><dd>{formatAmount(nutrition.fat)} g</dd></div>
    </dl>
  );
}

// Owns the demo page's fetched data, current meal selection, and save status.
function App() {
  const [foodItems, setFoodItems] = useState([]);
  const [selectedQuantities, setSelectedQuantities] = useState({});
  const [createdMeals, setCreatedMeals] = useState([]);
  const [mealName, setMealName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Load the available foods and saved meals together when the page first opens.
  useEffect(() => {
    const loadPageData = async () => {
      try {
        // Fetch both lists concurrently so the page can render once both are ready.
        const [foods, meals] = await Promise.all([
          requestJson("/api/food-items"),
          requestJson("/api/meals")
        ]);
        setFoodItems(foods);
        setCreatedMeals(meals);
      } catch (requestError) {
        setError(requestError.message || "Unable to load food and meal data.");
      } finally {
        setIsLoading(false);
      }
    };

    loadPageData();
  }, []);

  // Resolve selected IDs to full food records for the current-meal display.
  const selectedFoodItems = useMemo(() => foodItems
    .filter((foodItem) => selectedQuantities[foodItem.food_item_id])
    .map((foodItem) => ({
      ...foodItem,
      quantity: selectedQuantities[foodItem.food_item_id]
    })), [foodItems, selectedQuantities]);

  // Derive totals from the selected records so they stay in sync as quantities change.
  const currentNutrition = useMemo(() => selectedFoodItems.reduce((totals, foodItem) => {
    totals.calories += Number(foodItem.calories || 0) * foodItem.quantity;
    totals.protein += Number(foodItem.protein_g || 0) * foodItem.quantity;
    totals.carbs += Number(foodItem.carbs_g || 0) * foodItem.quantity;
    totals.fat += Number(foodItem.fat_g || 0) * foodItem.quantity;
    return totals;
  }, { ...emptyNutrition }), [selectedFoodItems]);

  // Adjust one food's quantity, removing it from the selection when it reaches zero.
  const changeQuantity = (foodItemId, amount) => {
    setSelectedQuantities((current) => {
      const quantity = (current[foodItemId] || 0) + amount;
      if (quantity <= 0) {
        const next = { ...current };
        delete next[foodItemId];
        return next;
      }
      return { ...current, [foodItemId]: quantity };
    });
    setNotice("");
    setError("");
  };

  // Save the selected IDs, quantities, and optional name; the server recalculates totals.
  const createMeal = async () => {
    if (selectedFoodItems.length === 0 || isSaving) return;

    setIsSaving(true);
    setError("");
    setNotice("");
    try {
      await requestJson("/api/meals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mealName,
          foodItems: selectedFoodItems.map(({ food_item_id, quantity }) => ({
            food_item_id,
            quantity
          }))
        })
      });
      // Start a fresh meal and reload the server-ordered saved-meal list.
      setSelectedQuantities({});
      setMealName("");
      setNotice("Meal created.");

      try {
        setCreatedMeals(await requestJson("/api/meals"));
      } catch {
        setNotice("Meal created, but the created-meals list could not be refreshed.");
      }
    } catch (requestError) {
      setError(requestError.message || "Unable to create the meal.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="demo-page">
      <header className="page-header">
        <h1>MealUCraft</h1>
      </header>

      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {notice && <p className="notice notice-success" role="status">{notice}</p>}
      {isLoading ? (
        <p className="loading-message" role="status">Loading food and meal data…</p>
      ) : (
        <div className="demo-layout">
          <section className="panel food-panel" aria-labelledby="food-heading">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Available now</p>
                <h2 id="food-heading">Food items</h2>
              </div>
              <span className="item-count">{foodItems.length} items</span>
            </div>
            {foodItems.length === 0 ? (
              <p className="empty-message">No food items are available yet.</p>
            ) : (
              <div className="food-list">
                {foodItems.map((foodItem) => (
                  <article className="food-card" key={foodItem.food_item_id}>
                    <div className="food-card-heading">
                      <div>
                        <h3>{foodItem.name}</h3>
                        <p className="serving-size">Serving: {foodItem.serving_size || "Not specified"}</p>
                      </div>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => changeQuantity(foodItem.food_item_id, 1)}
                      >
                        Add to meal
                      </button>
                    </div>
                    <NutritionSummary nutrition={{
                      calories: foodItem.calories,
                      protein: foodItem.protein_g,
                      carbs: foodItem.carbs_g,
                      fat: foodItem.fat_g
                    }} />
                    <div className="food-details">
                      <p><strong>Allergens:</strong> {foodItem.allergen_info || "None listed"}</p>
                      <p><strong>Dietary tags:</strong> {foodItem.dietary_tags || "None listed"}</p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <div className="right-column">
            <section className="panel current-meal-panel" aria-labelledby="current-meal-heading">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Your selection</p>
                  <h2 id="current-meal-heading">Current meal</h2>
                </div>
                <span className="item-count">
                  {selectedFoodItems.reduce((count, item) => count + item.quantity, 0)} items
                </span>
              </div>

              <div className="meal-name-field">
                <label htmlFor="meal-name">Meal name (optional)</label>
                <input
                  id="meal-name"
                  type="text"
                  maxLength={150}
                  value={mealName}
                  placeholder="Leave blank to use the default name"
                  onChange={(event) => setMealName(event.target.value)}
                />
              </div>

              {selectedFoodItems.length === 0 ? (
                <p className="empty-message">Add a food item to start your meal.</p>
              ) : (
                <ul className="selected-list">
                  {selectedFoodItems.map((foodItem) => (
                    <li key={foodItem.food_item_id}>
                      <div>
                        <strong>{foodItem.name}</strong>
                        <span className="selected-calories">{formatAmount(foodItem.calories)} kcal each</span>
                      </div>
                      <div className="quantity-control" aria-label={`${foodItem.name} quantity`}>
                        <button
                          type="button"
                          aria-label={`Remove one ${foodItem.name}`}
                          onClick={() => changeQuantity(foodItem.food_item_id, -1)}
                        >−</button>
                        <span>{foodItem.quantity}</span>
                        <button
                          type="button"
                          aria-label={`Add one ${foodItem.name}`}
                          onClick={() => changeQuantity(foodItem.food_item_id, 1)}
                        >+</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="current-totals">
                <h3>Combined nutrition</h3>
                <NutritionSummary nutrition={currentNutrition} />
              </div>
              <button
                className="button button-primary create-button"
                type="button"
                disabled={selectedFoodItems.length === 0 || isSaving}
                onClick={createMeal}
              >
                {isSaving ? "Creating meal…" : "Create meal"}
              </button>
            </section>

            <section className="panel created-meals-panel" aria-labelledby="created-meals-heading">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Saved for the demo user</p>
                  <h2 id="created-meals-heading">Created meals</h2>
                </div>
                <span className="item-count">{createdMeals.length} meals</span>
              </div>
              {createdMeals.length === 0 ? (
                <p className="empty-message">Your created meals will appear here.</p>
              ) : (
                <div className="created-meal-list">
                  {createdMeals.map((meal) => (
                    <article className="created-meal" key={meal.meal_id}>
                      <h3>{meal.meal_name}</h3>
                      <p className="meal-food-names">
                        {meal.food_items?.length
                          ? meal.food_items.map((item) => `${item.name}${item.quantity > 1 ? ` × ${item.quantity}` : ""}`).join(", ")
                          : "No food items"}
                      </p>
                      <NutritionSummary nutrition={{
                        calories: meal.total_calories,
                        protein: meal.total_protein,
                        carbs: meal.total_carbs,
                        fat: meal.total_fat
                      }} />
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
