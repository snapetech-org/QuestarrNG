import type { RequestHandler, Response } from "express";
import { apiErrorCodeForStatus } from "../shared/api-error-codes.js";

/** Adds an additive, stable code while retaining the legacy English `error` detail. */
export const attachApiErrorCode: RequestHandler = (req, res, next) => {
  const originalJson = res.json.bind(res) as (body?: unknown) => Response;
  res.json = ((body?: unknown) => {
    if (
      (req.path === "/api" || req.path.startsWith("/api/")) &&
      res.statusCode >= 400 &&
      body !== null &&
      typeof body === "object" &&
      !Array.isArray(body)
    ) {
      const response = body as Record<string, unknown>;
      if ("error" in response || "message" in response) {
        return originalJson({
          ...response,
          errorCode: response.errorCode ?? apiErrorCodeForStatus(res.statusCode),
        });
      }
    }
    return originalJson(body);
  }) as typeof res.json;
  next();
};
