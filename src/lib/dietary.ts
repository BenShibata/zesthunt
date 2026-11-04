export const DIETS = ["Vegetarian", "Vegan", "Pescatarian", "Halal", "Kosher", "Gluten-free", "Dairy-free"] as const;
export const ALLERGIES = ["Peanuts", "Tree nuts", "Shellfish", "Fish", "Eggs", "Milk", "Soy", "Wheat", "Sesame"] as const;

/*
 * How choices are worded on screen: as food, not as labels for people ("No meat or fish",
 * not "Vegetarian"). The stored values above stay the same, so saved choices and the
 * server's rules keep working.
 */
export const EATS_LABEL: Record<(typeof DIETS)[number], string> = {
  Vegetarian: "No meat or fish",
  Vegan: "Nothing from animals",
  Pescatarian: "Fish, but no meat",
  Halal: "Halal",
  Kosher: "Kosher",
  "Gluten-free": "No gluten",
  "Dairy-free": "No dairy",
};


export const eatsLabel = (v: string) => EATS_LABEL[v as (typeof DIETS)[number]] ?? v;
