import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

test("exclusions parity prints counts only unless details are requested locally", async () => {
  const server = await serve((request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(
      path.endsWith("/excluded_shelters")
        ? [{
            id: "legacy-1", address: "Skjultvej 7, 9999 Hemmeligby", vejnavn: "Skjultvej", husnummer: "7",
            postnummer: "9999", bygning_id: "bygning-hemmelig", reason: null, created_at: null, created_by: null,
          }]
        : path.endsWith("/shelters")
          ? [{
              id: "shelter-1", slug: "registrering-hemmelig", name: "Skjultvej 7", address_line1: "Skjultvej 7",
              postal_code: "9999", city: "Hemmeligby", import_state: "active",
              canonical_source_name: "datafordeler", canonical_source_reference: "bygning-hemmelig",
            }]
          : [],
    ));
  });
  const env = { NEXT_PUBLIC_SUPABASE_URL: server.url, SUPABASE_SECRET_KEY: "test-server-key" };
  try {
    const { stdout } = await runScript("parity:exclusions", [], env);
    assert.match(stdout, /legacy exclusions: 1/);
    assert.match(stdout, /strong source-reference candidates: 1/);
    assert.doesNotMatch(stdout, /Skjultvej|Hemmeligby|9999|registrering-hemmelig|bygning-hemmelig/);

    const { stdout: details } = await runScript("parity:exclusions", ["--details"], env);
    assert.match(details, /registrering-hemmelig Skjultvej 7, 9999 Hemmeligby/);
  } finally {
    await server.close();
  }
});

test("municipality parity is skipped, not failed, once the legacy table is gone", async () => {
  const server = await serve((request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    response.setHeader("Content-Type", "application/json");
    if (path.endsWith("/kommunekoder")) {
      response.statusCode = 404;
      response.end(JSON.stringify({ code: "PGRST205", message: "Could not find the table 'public.kommunekoder' in the schema cache" }));
      return;
    }
    response.end(JSON.stringify([{ id: "test-municipality", code: "0101", slug: "kobenhavn", name: "København" }]));
  });
  try {
    const { stdout } = await runScript("parity:municipalities", [], {
      NEXT_PUBLIC_SUPABASE_URL: server.url,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
      SUPABASE_SECRET_KEY: "test-server-key",
    });
    assert.match(stdout, /result: skipped/);
  } finally {
    await server.close();
  }
});

test("the allowlist export writes an idempotent, quoted seed migration", async () => {
  const server = await serve((request, response) => {
    assert.equal(new URL(request.url ?? "/", "http://localhost").pathname, "/rest/v1/application_code_eligibility");
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify([
      { source_name: "datafordeler-bbr-dar", application_code: "210", label: "Erhvervs' produktion",
        is_nearby_eligible: true, rule_source: "legacy_public_anvendelseskoder", notes: null },
      { source_name: "datafordeler-bbr-dar", application_code: "910", label: "Garage",
        is_nearby_eligible: false, rule_source: "legacy_public_anvendelseskoder", notes: "n" },
    ]));
  });
  const output = join(await mkdtemp(join(tmpdir(), "eligibility-")), "seed.sql");
  try {
    const { stdout } = await runScript("export:application-codes", [output], {
      NEXT_PUBLIC_SUPABASE_URL: server.url, SUPABASE_SECRET_KEY: "test-server-key",
    });
    assert.match(stdout, /wrote 2 rows \(1 eligible\)/);
    const migration = await readFile(output, "utf8");
    assert.match(migration, /'Erhvervs'' produktion', true/);
    assert.match(migration, /'910', 'Garage', false, 'legacy_public_anvendelseskoder', 'n'\)/);
    assert.match(migration, /on conflict \(source_name, application_code\) do nothing;/);
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
