CREATE TABLE IF NOT EXISTS public.users (
	user_id SERIAL PRIMARY KEY,
	first_name VARCHAR(100) NOT NULL,
	last_name VARCHAR(100) NOT NULL,
	email VARCHAR(255) NOT NULL UNIQUE,
	role VARCHAR(50) NOT NULL DEFAULT 'student',
	created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.dining_halls (
	dining_hall_id SERIAL PRIMARY KEY,
	name VARCHAR(150) NOT NULL,
	location VARCHAR(255),
	latitude DECIMAL(9,6),
	longitude DECIMAL(9,6),
	opening_hours VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS public.food_items (
	food_item_id SERIAL PRIMARY KEY,
	name VARCHAR(150) NOT NULL,
	serving_size VARCHAR(100),
	calories INT,
	protein_g DECIMAL(6,2),
	carbs_g DECIMAL(6,2),
	fat_g DECIMAL(6,2),
	allergen_info TEXT,
	dietary_tags TEXT
);

CREATE TABLE IF NOT EXISTS public.meals (
	meal_id SERIAL PRIMARY KEY,
	user_id INT NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
	meal_name VARCHAR(150) NOT NULL,
	total_calories INT,
	total_protein DECIMAL(6,2),
	total_carbs DECIMAL(6,2),
	total_fat DECIMAL(6,2),
	created_at TIMESTAMP NOT NULL DEFAULT NOW(),
	logged_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.meal_items (
	meal_item_id SERIAL PRIMARY KEY,
	meal_id INT NOT NULL REFERENCES public.meals(meal_id) ON DELETE CASCADE,
	food_item_id INT NOT NULL REFERENCES public.food_items(food_item_id) ON DELETE RESTRICT,
	quantity INT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.user_preferences (
	preference_id SERIAL PRIMARY KEY,
	user_id INT NOT NULL UNIQUE REFERENCES public.users(user_id) ON DELETE CASCADE,
	dietary_restrictions TEXT,
	allergies TEXT,
	calorie_goal INT,
	protein_goal INT,
	favorite_dining_hall_id INT REFERENCES public.dining_halls(dining_hall_id)
);

CREATE TABLE IF NOT EXISTS public.menu_availability (
	availability_id SERIAL PRIMARY KEY,
	dining_hall_id INT NOT NULL REFERENCES public.dining_halls(dining_hall_id) ON DELETE CASCADE,
	food_item_id INT NOT NULL REFERENCES public.food_items(food_item_id) ON DELETE CASCADE,
	available_date DATE NOT NULL,
	meal_period VARCHAR(50) NOT NULL,
	is_available BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO public.users (first_name, last_name, email, role, created_at)
VALUES
	('admin', 'admin', 'admin@mail.com', 'admin', NOW()),
	('user', 'user', 'user@email.com', 'user', NOW())
ON CONFLICT (email) DO NOTHING;

INSERT INTO public.dining_halls (name, location, latitude, longitude, opening_hours)
SELECT seed.name, seed.location, seed.latitude, seed.longitude, seed.opening_hours
FROM (VALUES
	('DH1', 'Main Campus', 39.129900::DECIMAL(9,6), -84.514400::DECIMAL(9,6), '7:00 AM - 8:00 PM'),
	('DH2', 'North Campus', 39.136100::DECIMAL(9,6), -84.517100::DECIMAL(9,6), '7:30 AM - 9:00 PM')
) AS seed(name, location, latitude, longitude, opening_hours)
WHERE NOT EXISTS (
	SELECT 1 FROM public.dining_halls existing WHERE existing.name = seed.name
);

INSERT INTO public.food_items (name, serving_size, calories, protein_g, carbs_g, fat_g, allergen_info, dietary_tags)
SELECT seed.name, seed.serving_size, seed.calories, seed.protein_g, seed.carbs_g, seed.fat_g, seed.allergen_info, seed.dietary_tags
FROM (VALUES
	('pizza', '2 slices', 320, 14.0::DECIMAL(6,2), 34.0::DECIMAL(6,2), 12.0::DECIMAL(6,2), 'Gluten, dairy', 'vegetarian'),
	('burger', '1 sandwich', 420, 25.0::DECIMAL(6,2), 30.0::DECIMAL(6,2), 18.0::DECIMAL(6,2), 'Gluten, dairy', 'high-protein'),
	('taco', '2 tacos', 360, 18.0::DECIMAL(6,2), 26.0::DECIMAL(6,2), 15.0::DECIMAL(6,2), 'Gluten', 'spicy')
) AS seed(name, serving_size, calories, protein_g, carbs_g, fat_g, allergen_info, dietary_tags)
WHERE NOT EXISTS (
	SELECT 1 FROM public.food_items existing WHERE existing.name = seed.name
);

INSERT INTO public.meals (user_id, meal_name, total_calories, total_protein, total_carbs, total_fat, created_at, logged_at)
SELECT user_row.user_id, 'Burger and Taco Meal', 780, 43.00, 56.00, 33.00, NOW(), NOW()
FROM public.users AS user_row
WHERE user_row.email = 'user@email.com'
	AND NOT EXISTS (
		SELECT 1
		FROM public.meals existing
		WHERE existing.user_id = user_row.user_id
			AND existing.meal_name = 'Burger and Taco Meal'
	);

INSERT INTO public.meal_items (meal_id, food_item_id, quantity)
SELECT meal.meal_id, food_item.food_item_id, 1
FROM public.meals AS meal
JOIN public.users AS user_row ON user_row.user_id = meal.user_id
JOIN public.food_items AS food_item ON food_item.name IN ('burger', 'taco')
WHERE user_row.email = 'user@email.com'
	AND meal.meal_name = 'Burger and Taco Meal'
	AND NOT EXISTS (
		SELECT 1
		FROM public.meal_items existing
		WHERE existing.meal_id = meal.meal_id
			AND existing.food_item_id = food_item.food_item_id
	);

INSERT INTO public.menu_availability (dining_hall_id, food_item_id, available_date, meal_period, is_available)
SELECT dining_hall.dining_hall_id, food_item.food_item_id, CURRENT_DATE, seed.meal_period, TRUE
FROM (VALUES
	('DH1', 'pizza', 'lunch'),
	('DH1', 'burger', 'dinner'),
	('DH2', 'taco', 'lunch'),
	('DH2', 'burger', 'dinner')
) AS seed(dining_hall_name, food_item_name, meal_period)
JOIN public.dining_halls dining_hall ON dining_hall.name = seed.dining_hall_name
JOIN public.food_items food_item ON food_item.name = seed.food_item_name
WHERE NOT EXISTS (
	SELECT 1
	FROM public.menu_availability existing
	WHERE existing.dining_hall_id = dining_hall.dining_hall_id
	  AND existing.food_item_id = food_item.food_item_id
	  AND existing.meal_period = seed.meal_period
);
