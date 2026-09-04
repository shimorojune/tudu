import { verifyWebhook } from "@clerk/backend/webhooks";
import { softDeleteUser, upsertUser, type Db } from "@tudu/db";
import type { UserJSON } from "@clerk/backend";
import { Hono } from "hono";

function getPrimaryEmail(user: UserJSON): string {
  const primary = user.email_addresses.find(
    (address) => address.id === user.primary_email_address_id,
  );

  return (
    primary?.email_address ??
    user.email_addresses[0]?.email_address ??
    `${user.id}@users.clerk`
  );
}

export function createClerkWebhookRoute(db: Db | null) {
  const app = new Hono();

  app.post("/webhooks/clerk", async (c) => {
    if (!db) {
      return c.json({ error: "Database not configured" }, 503);
    }

    try {
      const signingSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;

      if (!signingSecret) {
        return c.json({ error: "Webhook signing secret not configured" }, 500);
      }

      const event = await verifyWebhook(c.req.raw, { signingSecret });

      switch (event.type) {
        case "user.created":
        case "user.updated": {
          const user = event.data;
          await upsertUser(db, {
            clerkUserId: user.id,
            email: getPrimaryEmail(user),
          });
          break;
        }
        case "user.deleted": {
          const deletedId = event.data.id;
          if (deletedId) {
            await softDeleteUser(db, deletedId);
          }
          break;
        }
        default:
          break;
      }

      return c.json({ received: true });
    } catch {
      return c.json({ error: "Invalid webhook signature" }, 400);
    }
  });

  return app;
}
