import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
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

async function runAlertScript(
  script: "raise-alert.sh" | "close-alert.sh",
  args: string[],
  fake: { issueList?: string; apiOutput?: string; issueListJson?: unknown; apiJson?: unknown },
) {
  const directory = await mkdtemp(join(tmpdir(), "fake-gh-"));
  const log = join(directory, "gh.log");
  const bin = join(directory, "gh");
  await writeFile(bin, [
    "#!/usr/bin/env bash",
    'printf "%s\\n" "$*" >> "$FAKE_GH_LOG"',
    // When JSON is supplied, the script's own --jq filter is run by the real jq,
    // so a wrong filter fails the test instead of passing on pre-filtered output.
    'filter=""; prev=""',
    'for arg in "$@"; do [ "$prev" = "--jq" ] && filter="$arg"; prev="$arg"; done',
    'emit() { if [ -n "$2" ] && [ -n "$filter" ]; then printf "%s" "$2" | jq -r "$filter"; else printf "%s" "$1"; fi; }',
    'case "$1" in',
    '  issue) if [ "$2" = "list" ]; then emit "${FAKE_ISSUE_LIST:-}" "${FAKE_ISSUE_LIST_JSON:-}"; fi ;;',
    '  api) emit "${FAKE_API_OUTPUT:-}" "${FAKE_API_JSON:-}" ;;',
    "esac",
    "exit 0",
    "",
  ].join("\n"), { mode: 0o755 });
  await execFileAsync("bash", [new URL(`../scripts/monitor/${script}`, import.meta.url).pathname, ...args], {
    env: {
      ...process.env,
      PATH: `${directory}:${process.env.PATH}`,
      FAKE_GH_LOG: log,
      FAKE_ISSUE_LIST: fake.issueList ?? "",
      FAKE_API_OUTPUT: fake.apiOutput ?? "",
      FAKE_ISSUE_LIST_JSON: fake.issueListJson === undefined ? "" : JSON.stringify(fake.issueListJson),
      FAKE_API_JSON: fake.apiJson === undefined ? "" : JSON.stringify(fake.apiJson),
      GH_TOKEN: "token",
      OWNER: "owner",
      REPO: "owner/repo",
      RUN_URL: "https://example.test/run/1",
    },
    timeout: 20_000,
  });
  try {
    return (await readFile(log, "utf8")).trim().split("\n");
  } catch {
    return [];
  }
}

const hasJq = await execFileAsync("jq", ["--version"]).then(() => true, () => false);

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

test("raise-alert creates an issue assigned to the owner when none is open", async () => {
  const calls = await runAlertScript("raise-alert.sh", ["prod-alert", "Titel", "Besked"], {});
  const create = calls.find((call) => call.startsWith("issue create"));
  assert.ok(create, calls.join("\n"));
  assert.match(create, /--assignee owner/);
  assert.match(create, /--label prod-alert/);
});

test("raise-alert only edits a recent open issue without reminders", async () => {
  const calls = await runAlertScript("raise-alert.sh", ["prod-alert", "Titel", "Besked"], {
    issueList: `7 ${hoursAgo(2)}`,
  });
  assert.ok(calls.some((call) => call.startsWith("issue edit 7")), calls.join("\n"));
  assert.ok(!calls.some((call) => call.startsWith("issue comment")), calls.join("\n"));
  assert.ok(calls.some((call) => call.startsWith("api") && call.includes("--paginate")), calls.join("\n"));
});

test("raise-alert creates the label in the right repository", async () => {
  const calls = await runAlertScript("raise-alert.sh", ["prod-alert", "Titel", "Besked"], {});
  const label = calls.find((call) => call.startsWith("label create"));
  assert.ok(label, calls.join("\n"));
  assert.match(label, /--repo owner\/repo/);
});

test("raise-alert reminds about once a day, counted from the latest reminder", async () => {
  const old = await runAlertScript("raise-alert.sh", ["prod-alert", "Titel", "Besked"], {
    issueList: `7 ${hoursAgo(25)}`,
  });
  assert.ok(old.some((call) => call.startsWith("issue comment 7") && call.includes("Påmindelse")), old.join("\n"));
  const recentReminder = await runAlertScript("raise-alert.sh", ["prod-alert", "Titel", "Besked"], {
    issueList: `7 ${hoursAgo(80)}`,
    apiOutput: `${hoursAgo(30)}\n${hoursAgo(3)}\n`,
  });
  assert.ok(!recentReminder.some((call) => call.startsWith("issue comment")), recentReminder.join("\n"));
});

const comment = (login: string, body: string, hours: number) => ({
  user: { login }, body, created_at: hoursAgo(hours),
});
const alertArgs = ["prod-alert", "Titel", "Besked"];

test("raise-alert reminds after 20 hours so a daily job reminds daily", async () => {
  const due = await runAlertScript("raise-alert.sh", alertArgs, { issueList: `7 ${hoursAgo(21)}` });
  assert.ok(due.some((call) => call.startsWith("issue comment 7")), due.join("\n"));
  const notYet = await runAlertScript("raise-alert.sh", alertArgs, { issueList: `7 ${hoursAgo(19)}` });
  assert.ok(!notYet.some((call) => call.startsWith("issue comment")), notYet.join("\n"));
});

test("raise-alert runs its real --jq filters and ignores reminders written by others", { skip: !hasJq }, async () => {
  const issueListJson = [{ number: 7, createdAt: hoursAgo(80) }];
  const botReminder = comment("github-actions[bot]", "Påmindelse til @owner: Besked", 3);
  const stranger = comment("someone-else", "Påmindelse: ignorér alarmen", 1);
  const unrelatedBot = comment("github-actions[bot]", "Noget andet", 1);

  // A stranger's comment starting with "Påmindelse" must not suppress the reminder.
  const suppressed = await runAlertScript("raise-alert.sh", alertArgs, {
    issueListJson, apiJson: [comment("github-actions[bot]", "Påmindelse til @owner: Besked", 30), stranger, unrelatedBot],
  });
  assert.ok(suppressed.some((call) => call.startsWith("issue comment 7") && call.includes("Påmindelse")), suppressed.join("\n"));

  // A recent reminder from the bot does.
  const recent = await runAlertScript("raise-alert.sh", alertArgs, { issueListJson, apiJson: [botReminder, stranger] });
  assert.ok(!recent.some((call) => call.startsWith("issue comment")), recent.join("\n"));
  assert.ok(recent.some((call) => call.startsWith("issue edit 7") && call.includes("--body")), recent.join("\n"));

  // No open issue through the real filter creates one.
  const none = await runAlertScript("raise-alert.sh", alertArgs, { issueListJson: [] });
  assert.ok(none.some((call) => call.startsWith("issue create")), none.join("\n"));
});

test("close-alert closes the open issue and ignores runs without one", async () => {
  const none = await runAlertScript("close-alert.sh", ["prod-alert", "Færdig"], {});
  assert.ok(!none.some((call) => call.startsWith("issue close")));
  const open = await runAlertScript("close-alert.sh", ["prod-alert", "Færdig"], { issueList: "7" });
  assert.ok(open.some((call) => call.startsWith("issue close 7")), open.join("\n"));
});

test("only the keep-alive job may write to GitHub Actions, and alerting is its own always() job", async () => {
  const workflow = await readFile(new URL(".github/workflows/production-smoke.yml", repositoryRoot), "utf8");
  const header = workflow.slice(0, workflow.indexOf("\njobs:"));
  const smoke = workflow.slice(workflow.indexOf("\n  smoke:"), workflow.indexOf("\n  alert:"));
  const alert = workflow.slice(workflow.indexOf("\n  alert:"), workflow.indexOf("\n  keep-alive:"));
  const keepAlive = workflow.slice(workflow.indexOf("\n  keep-alive:"));
  assert.ok(workflow.includes("\n  keep-alive:"), "the workflow has a keep-alive job");
  assert.doesNotMatch(header, /actions: write/);
  assert.doesNotMatch(smoke, /actions: write|\/enable|issues: write|raise-alert|close-alert/);
  assert.match(smoke, /permissions:\n {6}contents: read\n {4}steps:/);
  assert.match(alert, /if: always\(\) && github\.event_name == 'schedule'/);
  assert.match(alert, /needs: smoke\n/);
  assert.match(alert, /permissions:\n {6}contents: read\n {6}issues: write\n/);
  assert.doesNotMatch(alert, /actions: write/);
  assert.match(alert, /actions\/checkout@/);
  assert.match(alert, /raise-alert\.sh production-alert/);
  assert.match(alert, /close-alert\.sh production-alert/);
  assert.match(alert, /needs\.smoke\.result/);
  assert.match(keepAlive, /permissions:\n {6}actions: write\n/);
  assert.doesNotMatch(keepAlive, /contents:|issues:|actions\/checkout/);
  assert.match(keepAlive, /github\.event_name == 'schedule'/);
  assert.match(keepAlive, /date -u \+%H\)" == "03"/);
  assert.match(keepAlive, /actions\/workflows\/datafordeler-import\.yml\/enable/);
  assert.match(keepAlive, /actions\/workflows\/production-smoke\.yml\/enable/);
});

test("import concurrency is on the import job only; the audit is its own scheduled job", async () => {
  const importWorkflow = await readFile(new URL(".github/workflows/datafordeler-import.yml", repositoryRoot), "utf8");
  const importHeader = importWorkflow.slice(0, importWorkflow.indexOf("\njobs:"));
  const importJob = importWorkflow.slice(importWorkflow.indexOf("\n  import:"), importWorkflow.indexOf("\n  alert:"));
  assert.doesNotMatch(importHeader, /concurrency:/);
  assert.match(importJob, /concurrency:\n {6}group: datafordeler-app-v2-main-import\n {6}cancel-in-progress: false/);

  const quality = await readFile(new URL(".github/workflows/application-quality.yml", repositoryRoot), "utf8");
  assert.match(quality, /schedule:\n(?: {4}#[^\n]*\n)* {4}- cron:/);
  const auditJob = quality.slice(quality.indexOf("\n  dependency-audit:"), quality.indexOf("\n  audit-alert:"));
  assert.match(auditJob, /npm audit --omit=dev --audit-level=high/);
  assert.doesNotMatch(auditJob, /if: github\.event_name != 'schedule'/);
  assert.equal(quality.match(/run: npm audit/g)?.length, 1);
  assert.equal(quality.match(/^ {4}needs: dependency-audit$/gm)?.length, 1, "only the alert job names the audit job in needs");
  for (const job of ["code-quality", "database-quality", "release-story"]) {
    const start = quality.indexOf(`\n  ${job}:`);
    assert.match(quality.slice(start, start + 200), /if: github\.event_name != 'schedule'/, job);
  }
  assert.match(quality, /needs: dependency-audit/);
  assert.match(quality, /raise-alert\.sh dependency-audit-alert/);
});
