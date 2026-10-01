import { zValidator } from "@hono/zod-validator";
import type { Db } from "@tudu/db";
import { orgs } from "@tudu/db";
import { eq } from "drizzle-orm";
import {
  approveJoinRequest,
  clearOrgLogo,
  createOrg,
  createOrgInvite,
  declineJoinRequest,
  deleteOrg,
  getHandoverPreview,
  getOrgDetail,
  leaveOrg,
  listOrgAudit,
  listOrgInvitesAndJoinRequests,
  listOrgMembers,
  listCoworkerRoster,
  getCoworkerDay,
  listSpacesForUser,
  OrgActionError,
  regenerateJoinLink,
  removeOrgMember,
  resendOrgInvite,
  revokeOrgInvite,
  setOrgLogoKey,
  transferOwnership,
  updateMemberRole,
  updateOrg,
  setOrgKeyPrefix,
  TaskKeyError,
  liveOrgMemberUserIds,
} from "@tudu/db";
import {
  createOrgBodySchema,
  createOrgInviteBodySchema,
  deleteOrgBodySchema,
  handoverBodySchema,
  transferOwnershipBodySchema,
  updateMemberRoleBodySchema,
  updateOrgBodySchema,
  updateOrgKeyPrefixBodySchema,
  type SpaceListItem,
} from "@tudu/shared";
import { Hono } from "hono";
import { notifySync } from "../syncHub.js";
import { sendEmail } from "../email/index.js";
import { renderInviteEmail } from "../email/templates/invite.js";
import {
  buildOrgLogoKey,
  validateOrgLogo,
} from "../orgs/orgLogo.js";
import { resolveAttachmentStorage } from "../storage/resolve.js";
import type { SessionEnv } from "../session-middleware.js";
import { mapOrgError, resolveAppBaseUrl } from "./orgHelpers.js";

function sessionUser(c: { get: (key: "session") => SessionEnv["Variables"]["session"] }) {
  const session = c.get("session");
  if (!session?.user) {
    return null;
  }
  return session.user;
}

async function sendInviteEmail(
  inviterName: string | null,
  orgName: string,
  to: string,
  token: string,
  expiresAt: Date,
): Promise<boolean> {
  const inviteUrl = `${resolveAppBaseUrl()}/invite/${token}`;
  const rendered = renderInviteEmail({
    inviterName: inviterName ?? "A co-worker",
    orgName,
    inviteUrl,
    expiresOn: expiresAt.toLocaleDateString("en-US"),
  });
  const { delivered } = await sendEmail({
    to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
  return delivered;
}

export function createOrgsRoute(db: Db) {
  const app = new Hono<SessionEnv>();

  app.post("/", zValidator("json", createOrgBodySchema), async (c) => {
    const user = sessionUser(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    try {
      const body = c.req.valid("json");
      const org = await createOrg(db, user.id, body);
      const spaces: SpaceListItem[] = await listSpacesForUser(db, user.id);
      return c.json({ org: { id: org.id, slug: org.slug, name: org.name }, spaces }, 201);
    } catch (error) {
      const mapped = mapOrgError(error);
      return c.json(mapped.body, mapped.status as 422);
    }
  });

  app.get("/", async (c) => {
    const user = sessionUser(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const spaces = await listSpacesForUser(db, user.id);
    return c.json({ spaces });
  });

  app.get("/:slug", async (c) => {
    const user = sessionUser(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    try {
      const detail = await getOrgDetail(db, user.id, c.req.param("slug"));
      return c.json(detail);
    } catch (error) {
      const mapped = mapOrgError(error);
      return c.json(mapped.body, mapped.status as 404);
    }
  });

  app.patch(
    "/:slug/key-prefix",
    zValidator("json", updateOrgKeyPrefixBodySchema),
    async (c) => {
      const user = sessionUser(c);
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      try {
        const keyPrefix = await setOrgKeyPrefix(
          db,
          user.id,
          c.req.param("slug"),
          c.req.valid("json").keyPrefix,
        );
        const org = await db.query.orgs.findFirst({
          where: eq(orgs.slug, c.req.param("slug")),
        });
        if (org) {
          const members = await liveOrgMemberUserIds(db, org.id);
          notifySync(members);
        }
        return c.json({ keyPrefix });
      } catch (error) {
        if (error instanceof TaskKeyError) {
          return c.json({ error: error.message }, error.status as 409);
        }
        const mapped = mapOrgError(error);
        return c.json(mapped.body, mapped.status as 403);
      }
    },
  );

  app.patch("/:slug", zValidator("json", updateOrgBodySchema), async (c) => {
    const user = sessionUser(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    try {
      const org = await updateOrg(db, user.id, c.req.param("slug"), c.req.valid("json"));
      return c.json({
        slug: org.slug,
        name: org.name,
        color: org.color,
        allowedDomains: org.allowedDomains,
        joinLinkEnabled: org.joinLinkEnabled,
      });
    } catch (error) {
      const mapped = mapOrgError(error);
      return c.json(mapped.body, mapped.status as 403);
    }
  });

  app.get("/:slug/coworkers", async (c) => {
    const user = sessionUser(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const date =
      c.req.query("date") ??
      new Date().toISOString().slice(0, 10);
    try {
      const roster = await listCoworkerRoster(
        db,
        user.id,
        c.req.param("slug"),
        date,
      );
      return c.json(roster);
    } catch (error) {
      const mapped = mapOrgError(error);
      return c.json(mapped.body, mapped.status as 403);
    }
  });

  app.get("/:slug/coworkers/:userId/day", async (c) => {
    const user = sessionUser(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const date =
      c.req.query("date") ??
      new Date().toISOString().slice(0, 10);
    try {
      const day = await getCoworkerDay(
        db,
        user.id,
        c.req.param("slug"),
        c.req.param("userId"),
        date,
      );
      return c.json(day);
    } catch (error) {
      const mapped = mapOrgError(error);
      return c.json(mapped.body, mapped.status as 403);
    }
  });

  app.get("/:slug/members", async (c) => {
    const user = sessionUser(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    try {
      const members = await listOrgMembers(db, user.id, c.req.param("slug"));
      return c.json({ members });
    } catch (error) {
      const mapped = mapOrgError(error);
      return c.json(mapped.body, mapped.status as 404);
    }
  });

  app.patch(
    "/:slug/members/:userId",
    zValidator("json", updateMemberRoleBodySchema),
    async (c) => {
      const user = sessionUser(c);
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      try {
        await updateMemberRole(
          db,
          user.id,
          c.req.param("slug"),
          c.req.param("userId"),
          c.req.valid("json").role,
        );
        return c.body(null, 204);
      } catch (error) {
        const mapped = mapOrgError(error);
        return c.json(mapped.body, mapped.status as 409);
      }
    },
  );

  app.post(
    "/:slug/members/:userId/remove",
    zValidator("json", handoverBodySchema),
    async (c) => {
      const user = sessionUser(c);
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      try {
        const body = c.req.valid("json");
        if (!body.handoverTo) {
          throw new OrgActionError("HANDOVER_REQUIRED", "Handover required", 409);
        }
        await removeOrgMember(
          db,
          user.id,
          c.req.param("slug"),
          c.req.param("userId"),
          body.handoverTo,
        );
        return c.body(null, 204);
      } catch (error) {
        const mapped = mapOrgError(error);
        return c.json(mapped.body, mapped.status as 422);
      }
    },
  );

  app.post("/:slug/leave", zValidator("json", handoverBodySchema), async (c) => {
    const user = sessionUser(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    try {
      await leaveOrg(db, user.id, c.req.param("slug"), c.req.valid("json").handoverTo);
      return c.body(null, 204);
    } catch (error) {
      const mapped = mapOrgError(error);
      return c.json(mapped.body, mapped.status as 409);
    }
  });

  app.post(
    "/:slug/transfer",
    zValidator("json", transferOwnershipBodySchema),
    async (c) => {
      const user = sessionUser(c);
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      try {
        await transferOwnership(
          db,
          user.id,
          c.req.param("slug"),
          c.req.valid("json").toUserId,
        );
        return c.body(null, 204);
      } catch (error) {
        const mapped = mapOrgError(error);
        return c.json(mapped.body, mapped.status as 422);
      }
    },
  );

  app.delete("/:slug", zValidator("json", deleteOrgBodySchema), async (c) => {
    const user = sessionUser(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    try {
      const storage = resolveAttachmentStorage();
      const result = await deleteOrg(
        db,
        user.id,
        c.req.param("slug"),
        c.req.valid("json").confirmName,
      );
      if (result.logoKey) {
        await storage.delete(result.logoKey).catch(() => undefined);
      }
      return c.body(null, 204);
    } catch (error) {
      const mapped = mapOrgError(error);
      return c.json(mapped.body, mapped.status as 422);
    }
  });

  app.get("/:slug/audit", async (c) => {
    const user = sessionUser(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    try {
      const cursor = c.req.query("cursor");
      const page = await listOrgAudit(db, user.id, c.req.param("slug"), cursor);
      return c.json(page);
    } catch (error) {
      const mapped = mapOrgError(error);
      return c.json(mapped.body, mapped.status as 403);
    }
  });

  app.get("/:slug/handover/:userId", async (c) => {
    const user = sessionUser(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    try {
      const preview = await getHandoverPreview(
        db,
        user.id,
        c.req.param("slug"),
        c.req.param("userId"),
      );
      return c.json(preview);
    } catch (error) {
      const mapped = mapOrgError(error);
      return c.json(mapped.body, mapped.status as 404);
    }
  });

  app.post(
    "/:slug/invites",
    zValidator("json", createOrgInviteBodySchema),
    async (c) => {
      const user = sessionUser(c);
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      try {
        const body = c.req.valid("json");
        const { invite, token } = await createOrgInvite(
          db,
          user.id,
          c.req.param("slug"),
          body,
        );
        const emailDelivered = await sendInviteEmail(
          user.name,
          (await getOrgDetail(db, user.id, c.req.param("slug"))).name,
          invite.email,
          token,
          invite.expiresAt,
        );
        return c.json({ id: invite.id, emailDelivered }, 201);
      } catch (error) {
        const mapped = mapOrgError(error);
        return c.json(mapped.body, mapped.status as 409);
      }
    },
  );

  app.get("/:slug/invites", async (c) => {
    const user = sessionUser(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    try {
      const payload = await listOrgInvitesAndJoinRequests(
        db,
        user.id,
        c.req.param("slug"),
      );
      return c.json(payload);
    } catch (error) {
      const mapped = mapOrgError(error);
      return c.json(mapped.body, mapped.status as 404);
    }
  });

  app.post("/:slug/invites/:id/resend", async (c) => {
    const user = sessionUser(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    try {
      const { invite, token } = await resendOrgInvite(
        db,
        user.id,
        c.req.param("slug"),
        c.req.param("id"),
      );
      const emailDelivered = await sendInviteEmail(
        user.name,
        (await getOrgDetail(db, user.id, c.req.param("slug"))).name,
        invite.email,
        token,
        invite.expiresAt,
      );
      return c.json({ emailDelivered });
    } catch (error) {
      const mapped = mapOrgError(error);
      return c.json(mapped.body, mapped.status as 429);
    }
  });

  app.delete("/:slug/invites/:id", async (c) => {
    const user = sessionUser(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    try {
      await revokeOrgInvite(db, user.id, c.req.param("slug"), c.req.param("id"));
      return c.body(null, 204);
    } catch (error) {
      const mapped = mapOrgError(error);
      return c.json(mapped.body, mapped.status as 403);
    }
  });

  app.post("/:slug/join-link/regenerate", async (c) => {
    const user = sessionUser(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    try {
      const result = await regenerateJoinLink(db, user.id, c.req.param("slug"));
      return c.json(result);
    } catch (error) {
      const mapped = mapOrgError(error);
      return c.json(mapped.body, mapped.status as 403);
    }
  });

  app.post("/:slug/join-requests/:id/approve", async (c) => {
    const user = sessionUser(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    try {
      await approveJoinRequest(
        db,
        user.id,
        c.req.param("slug"),
        c.req.param("id"),
      );
      return c.body(null, 204);
    } catch (error) {
      const mapped = mapOrgError(error);
      return c.json(mapped.body, mapped.status as 403);
    }
  });

  app.post("/:slug/join-requests/:id/decline", async (c) => {
    const user = sessionUser(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    try {
      await declineJoinRequest(
        db,
        user.id,
        c.req.param("slug"),
        c.req.param("id"),
      );
      return c.body(null, 204);
    } catch (error) {
      const mapped = mapOrgError(error);
      return c.json(mapped.body, mapped.status as 403);
    }
  });

  app.put("/:slug/logo", async (c) => {
    const user = sessionUser(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    try {
      const bytes = Buffer.from(await c.req.arrayBuffer());
      const validated = validateOrgLogo(bytes);
      if (!validated.ok) {
        return c.json(
          { error: validated.message, code: validated.code },
          422,
        );
      }
      const detail = await getOrgDetail(db, user.id, c.req.param("slug"));
      const key = buildOrgLogoKey(detail.id, validated.ext);
      const storage = resolveAttachmentStorage();
      const orgRow = await db.query.orgs.findFirst({
        where: eq(orgs.id, detail.id),
        columns: { logoStorageKey: true },
      });
      const previous = orgRow?.logoStorageKey ?? null;
      await storage.put({ key, body: bytes, mimeType: validated.mimeType });
      if (previous) {
        await storage.delete(previous).catch(() => undefined);
      }
      await setOrgLogoKey(db, user.id, c.req.param("slug"), key, previous);
      return c.json({ ok: true });
    } catch (error) {
      const mapped = mapOrgError(error);
      return c.json(mapped.body, mapped.status as 403);
    }
  });

  app.delete("/:slug/logo", async (c) => {
    const user = sessionUser(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    try {
      const previous = await clearOrgLogo(db, user.id, c.req.param("slug"));
      if (previous) {
        const storage = resolveAttachmentStorage();
        await storage.delete(previous).catch(() => undefined);
      }
      return c.body(null, 204);
    } catch (error) {
      const mapped = mapOrgError(error);
      return c.json(mapped.body, mapped.status as 403);
    }
  });

  return app;
}
