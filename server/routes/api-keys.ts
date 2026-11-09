import { Router, type Request, type Response } from "express";
import { param } from "express-validator";
import { z } from "zod";
import { storage } from "../storage.js";
import { generateApiKey } from "../auth.js";
import { routesLogger as logger } from "../logger.js";
import { sensitiveEndpointLimiter, validate, validateRequest } from "../middleware.js";
import { API_KEY_SCOPES } from "../../shared/schema.js";
import { serviceErrorBody, serviceMessage } from "../../shared/service-messages.js";

// Same shape as sanitizeGameId/sanitizeDownloadId in middleware.ts: api_keys.id
// is a randomUUID(), so a non-UUID path segment can never match a row and is
// rejected here instead of falling through to a storage lookup.
const sanitizeApiKeyId = [
  param("id")
    .trim()
    .matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    .withMessage("Invalid API key ID format"),
];

/**
 * Management for integration API keys.
 *
 * Mounted behind the JWT-only branch of the /api auth gate on purpose: a key
 * must never be able to mint or revoke another key, so this surface stays
 * reachable only from a logged-in browser session.
 */
export const apiKeysRouter = Router();

// Every response here varies by req.user (key list, a freshly-minted raw
// key), so none of it may be cached by a shared proxy or the browser's own
// HTTP cache.
apiKeysRouter.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

/** One key per integration is the intended usage; the cap just bounds abuse. */
const MAX_KEYS_PER_USER = 25;

const createKeySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name is too long"),
  scope: z.enum(API_KEY_SCOPES).default("integration:all"),
  expiresInDays: z.number().int().min(1).max(365).default(90),
});

apiKeysRouter.get("/", async (req: Request, res: Response) => {
  try {
    res.json(await storage.getApiKeys(req.user!.id));
  } catch (error) {
    logger.error({ error }, "Failed to list API keys");
    res.status(500).json({ error: "Failed to list API keys" });
  }
});

apiKeysRouter.post(
  "/",
  sensitiveEndpointLimiter,
  validate(createKeySchema),
  async (req: Request, res: Response) => {
    try {
      const parsed = createKeySchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: parsed.error.issues[0]?.message ?? "Invalid name", errorI18n: null });
      }

      const userId = req.user!.id;
      const { rawKey, keyHash, prefix } = generateApiKey();
      const expiresAt = new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000);

      let created;
      try {
        // Count-then-insert happens atomically inside storage.addApiKey, so two
        // concurrent requests from the same user can't both slip past the cap.
        created = await storage.addApiKey(
          {
            userId,
            name: parsed.data.name,
            keyHash,
            prefix,
            scope: parsed.data.scope,
            expiresAt,
          },
          MAX_KEYS_PER_USER
        );
      } catch (error) {
        if (error instanceof Error && error.message === "API key limit reached") {
          return res
            .status(409)
            .json(
              serviceErrorBody(
                undefined,
                serviceMessage("service.api_key_limit_reached", { count: MAX_KEYS_PER_USER })
              )
            );
        }
        throw error;
      }

      logger.info(
        { userId, apiKeyId: created.id, name: created.name },
        "Integration API key created"
      );

      // The only time the raw key is ever returned: it is not recoverable later.
      return res.status(201).json({ ...created, key: rawKey });
    } catch (error) {
      logger.error({ error }, "Failed to create API key");
      return res
        .status(500)
        .json(
          serviceErrorBody(undefined, serviceMessage("service.api_failed_to_create_api_key", {}))
        );
    }
  }
);

apiKeysRouter.delete(
  "/:id",
  sensitiveEndpointLimiter,
  sanitizeApiKeyId,
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params as { id: string };
      const userId = req.user!.id;
      const removed = await storage.removeApiKey(id, userId);
      if (!removed) {
        return res
          .status(404)
          .json(serviceErrorBody(undefined, serviceMessage("service.api_api_key_not_found", {})));
      }
      logger.info({ userId, apiKeyId: id }, "Integration API key revoked");
      return res.status(204).send();
    } catch (error) {
      logger.error({ error }, "Failed to revoke API key");
      return res
        .status(500)
        .json(
          serviceErrorBody(undefined, serviceMessage("service.api_failed_to_revoke_api_key", {}))
        );
    }
  }
);
