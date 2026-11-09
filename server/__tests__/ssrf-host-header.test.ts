import { createServer } from "node:http";
import dns from "dns/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { safeFetch } from "../ssrf.js";

describe("safeFetch virtual-host routing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the configured hostname in the Host header while pinning the validated IP", async () => {
    vi.spyOn(dns, "lookup").mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);

    let receivedHost: string | undefined;
    const server = createServer((request, response) => {
      receivedHost = request.headers.host;
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("ok");
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      throw new Error("Test server did not bind to a TCP port");
    }

    try {
      const response = await safeFetch(
        `http://qbit.docker.lan:${address.port}/api/v2/app/version`,
        { allowPrivate: true }
      );

      expect(response.status).toBe(200);
      expect(await response.text()).toBe("ok");
      expect(receivedHost).toBe(`qbit.docker.lan:${address.port}`);
      expect(dns.lookup).toHaveBeenCalledWith("qbit.docker.lan", { all: true });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
