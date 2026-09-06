import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const repositoryRoot = new URL("../", import.meta.url);
const cleanEnv = {
  ...process.env,
  DOTENV_CONFIG_PATH: "/dev/null",
  NEXT_PUBLIC_SUPABASE_URL: "",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
  SUPABASE_SECRET_KEY: "",
};

function runScript(name: string, args: string[] = [], env: Partial<NodeJS.ProcessEnv> = {}) {
  return execFileAsync("npm", ["run", name, "--", ...args], {
    cwd: repositoryRoot,
    env: { ...cleanEnv, ...env },
    timeout: 20_000,
  });
}

async function serve(handler: (request: IncomingMessage, response: ServerResponse) => void) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    url: `http://127.0.0.1:${address.port}`,
    async close() {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

test("release probes fail when required configuration is absent", async () => {
  for (const [name, args] of [
    ["parity:municipalities", []],
    ["parity:exclusions", []],
    ["read:app-v2-sanity", []],
    ["read:shelter-detail", ["test-registration"]],
  ] as const) {
    await assert.rejects(runScript(name, [...args]), (error: unknown) => {
      const failure = error as { code: number; stderr: string };
      assert.equal(failure.code, 1, name);
      assert.match(failure.stderr, /Missing.*(?:environment|Supabase)/i, name);
      assert.doesNotMatch(failure.stderr, /ERR_MODULE_NOT_FOUND|Client Component/, name);
      return true;
    });
  }
});

test("municipality parity performs both reads with only the canonical publishable key", async () => {
  const requests: Array<{ path: string; key: string | undefined }> = [];
  const server = await serve((request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    requests.push({ path, key: request.headers.apikey as string | undefined });
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(path.endsWith("/kommunekoder")
      ? [{ kode: "0101", slug: "kobenhavn", navn: "København" }]
      : [{ id: "test-municipality", code: "0101", slug: "kobenhavn", name: "København" }]));
  });
  try {
    const { stdout } = await runScript("parity:municipalities", [], {
      NEXT_PUBLIC_SUPABASE_URL: server.url,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
      SUPABASE_SECRET_KEY: "test-server-key",
    });
    assert.match(stdout, /result: ok/);
    assert.equal(requests.length, 2);
    assert.deepEqual(requests.find(({ path }) => path.endsWith("/kommunekoder")), {
      path: "/rest/v1/kommunekoder", key: "test-publishable-key",
    });
    assert.deepEqual(requests.find(({ path }) => path.endsWith("/municipalities")), {
      path: "/rest/v1/municipalities", key: "test-server-key",
    });
  } finally {
    await server.close();
  }
});

test("nearby probe sends coordinates in POST JSON and propagates API failures", async () => {
  const requests: Array<{ method: string | undefined; url: string | undefined; body: string }> = [];
  let status = 200;
  const server = await serve((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      requests.push({ method: request.method, url: request.url, body });
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify(status === 200
        ? { results: [], meta: { contract: "app_v2_nearby_grouped_v1" } }
        : { error: { code: "unavailable" } }));
    });
  });
  try {
    const { stdout } = await runScript("read:app-v2-nearby-api", ["--base-url", server.url]);
    assert.match(stdout, /status: 200/);
    assert.doesNotMatch(stdout, /\?lat=|55\.6761|12\.5683/);
    assert.equal(requests[0]?.method, "POST");
    assert.equal(requests[0]?.url, "/api/app-v2/nearby/grouped");
    assert.deepEqual(JSON.parse(requests[0]!.body), {
      lat: 55.6761, lng: 12.5683, radius: 50_000, limit: 10, candidateLimit: 500,
    });
    status = 503;
    await assert.rejects(runScript("read:app-v2-nearby-api", ["--base-url", server.url]),
      (error: unknown) => (error as { code: number }).code === 1);
  } finally {
    await server.close();
  }
});
