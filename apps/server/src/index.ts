import { Hono } from "hono";

import { publicRoute } from "./public";
import { api } from "./v1";
import { VercelIngest } from "./vercel";

const app = new Hono();

/**
 * Vercel Integration
 */
app.post("/integration/vercel", VercelIngest);

/**
 * Public Routes
 */
app.route("/public", publicRoute);

/**
 * Ping Pong
 */
app.get("/ping", (c) => c.text("pong"));

/**
 * API Routes v1
 */
app.route("/v1", api);

if (process.env.NODE_ENV === "development") {
  app.showRoutes();
}

console.log("Starting server on port 3000");

export default app;
