# What

A personal tool that helps our family to know which meal to cook and which groceries to shop.

# Key requirements

- super simple to use
- usable from smartphone

# Key actions

- manage recipies
- manage meal schedule: add/remove recipie (or just auto rotate by adding the least recently cooked meals)
- manage stock
  - compare virtual stock with what's actually there
  - set desired amount
- prepare shopping list:
  1. for a given amount of next meals, summarize ingredients, subtract stock and add to list
  2. check which items are below the desired amount
  3. allow to manually add items
- go shopping: sort shopping list by shop / catogory and tick off items (allow to buy less than the specified amount)
- finish shopping:
  1. add items from ticked-off shopping list to stock
  2. add items not on shopping list to stock
- cook meal: remove ingredients from stock and move next-meal-pointer forward (used ingreditents may deviate from recipe)

# Other

- Quantities have units (g, l, pieces, spoons, cans, bottles, …); the same item can use different units in different recipes, and some ingredients have no quantity (spices). Stock does not have units yet
- For now serving size is fixed within the recipe
- Ticking off shopping items needs to work offline
- Single user system

# Future features:

- consider perishable ingredients when managing meal schedule
