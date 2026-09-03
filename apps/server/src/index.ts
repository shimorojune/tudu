import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { Hono } from "hono";
import { DEFAULT_SERVER_PORT, type HealthResponse } from "@tudu/shared";

const app = new Hono();

const DEV_ORIGINS = ["http://localhost:1420", "http://localhost:5173"];

app.use(
  "*",
  cors({
    origin: DEV_ORIGINS,
  }),
);

app.get("/health", (c) => {
  const response: HealthResponse = { status: "ok", version: "0.1.0" };
  return c.json(response);
});

const port = Number(process.env.PORT) || DEFAULT_SERVER_PORT;

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`Server listening on http://localhost:${info.port}`);
  },
);
