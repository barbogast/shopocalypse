import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("recipes", "routes/recipes.tsx"),
  route("recipes/new", "routes/recipes.new.tsx"),
  route("recipes/:id", "routes/recipes.$id.tsx"),
  route("stock", "routes/stock.tsx"),
  route("shopping", "routes/shopping.tsx"),
] satisfies RouteConfig;
