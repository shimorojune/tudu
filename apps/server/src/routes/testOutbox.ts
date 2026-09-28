import { Hono } from "hono";
import { clearMemoryOutbox, readMemoryOutbox } from "../email/index.js";

export function createTestOutboxRoute() {
  const app = new Hono();

  app.get("/__test/outbox", (c) => {
    const to = c.req.query("to") ?? undefined;
    return c.json({ messages: readMemoryOutbox(to) });
  });

  app.delete("/__test/outbox", (c) => {
    clearMemoryOutbox();
    return c.body(null, 204);
  });

  return app;
}

export function assertSafeTestRoutes(): void {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.E2E_TEST_ROUTES === "1"
  ) {
    throw new Error("Refusing to boot with E2E_TEST_ROUTES in production");
  }
}
