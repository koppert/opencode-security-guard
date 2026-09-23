import assert from "node:assert/strict"
import { test } from "node:test"
import { mkdtemp, rm, symlink } from "node:fs/promises"
import { join } from "node:path"
import type { Plugin } from "@opencode/plugin"
import guard, { decide, parseSettings } from "../index.ts"
import { classify, parseDecision } from "../jev.ts"
import { screen } from "../shell.ts"

const yes = async () => Response.json({ answers: { strictly_read_only: { type: "noul", noul: 0.995 } } })
const no = async () => Response.json({ answers: { strictly_read_only: { type: "noul", noul: 0.4 } } })
const settings = parseSettings({})

test("Jev confirms a simple read and cannot override a configured deny", async () => {
  assert.equal((await decide("pwd", "ask", settings, async () => "key", yes)).effect, "allow")
  assert.equal((await decide("pwd", "deny", settings, async () => "key", yes)).effect, "deny")
  assert.equal((await decide("pwd", "allow", settings, async () => "key", no)).effect, "ask")
})

test("uncertain, unavailable and malformed Jev results ask", async () => {
  assert.equal((await decide("ls", "allow", settings, async () => undefined, yes)).effect, "ask")
  assert.equal((await decide("ls", "allow", settings, async () => "key", async () => new Response("oops", { status: 500 }))).effect, "ask")
  for (const score of [null, "1", -1, 1.1, NaN]) {
    assert.deepEqual(parseDecision({ answers: { strictly_read_only: { type: "noul", noul: score } } }), { kind: "review" })
  }
  assert.deepEqual(await classify("pwd", async () => "key", 100, yes), { kind: "read", confidence: 0.995 })
})

test("mutations and shell indirection always ask despite favorable Jev", async () => {
  for (const command of ["systemctl restart nginx", "sudo reboot", "rm -rf /etc", "git push origin main", "git branch -D main", "date -s tomorrow", "cat a > /etc/b", "ls; rm config", "$(rm config)", "./script.sh", "npm run build", "rg --pre=sh x", "git diff --output=/etc/x", "git diff --ext-diff"]) {
    assert.equal((await decide(command, "allow", settings, async () => "key", yes)).effect, "ask", command)
  }
})

test("literal /tmp writes work, outside paths and symlink escapes ask", async (t) => {
  const directory = await mkdtemp("/tmp/security-guard-test-")
  t.after(() => rm(directory, { recursive: true, force: true }))
  assert.equal(await screen(`mkdir ${directory}/new`, true), "tmp")
  assert.equal(await screen(`touch ${directory}/new`, true), "tmp")
  assert.equal(await screen(`rm ${directory}/new`, true), "tmp")
  assert.equal(await screen(`rm ${directory}/new`, false), "review")
  assert.equal(await screen("touch /tmp/../etc/file", true), "review")
  assert.equal(await screen("rm -rf /tmp", true), "review")
  await symlink("/etc", join(directory, "escape"))
  assert.equal(await screen(`touch ${directory}/escape/passwd`, true), "review")
})

test("invalid options fail at startup", () => {
  for (const options of [{ allowTmpWrites: "yes" }, { timeoutMs: 0 }, { readOnlyThreshold: 2 }, { typo: true }]) {
    assert.throws(() => parseSettings(options))
  }
})

test("OpenCode hooks use the complete shell command and leave other actions alone", async () => {
  const hooks = new Map<string, (event: any) => Promise<void> | void>()
  const context = {
    options: {},
    tool: { hook: async (name: string, callback: (event: any) => Promise<void> | void) => { hooks.set(name, callback) } },
    permission: { hook: async (name: string, callback: (event: any) => Promise<void> | void) => { hooks.set(name, callback) } },
    integration: { connection: { active: async () => ({ id: "mock" }), resolve: async () => ({ type: "key", key: "test" }) } },
  }
  const originalFetch = globalThis.fetch
  globalThis.fetch = yes as typeof fetch
  try {
    const cleanup = await guard.setup(context as unknown as Plugin.Context)
    const before = hooks.get("execute.before")!
    const evaluate = hooks.get("evaluate")!
    await before({ tool: "shell", input: { command: "systemctl restart nginx" }, sessionID: "s", id: "c" })
    const shell = { action: "shell", resources: ["pwd"], effect: "allow", source: { type: "tool", id: "c" }, sessionID: "s", message: "" }
    await evaluate(shell)
    assert.equal(shell.effect, "ask")
    const edit = { ...shell, action: "edit", effect: "allow" }
    await evaluate(edit)
    assert.equal(edit.effect, "allow")
    if (typeof cleanup === "function") await cleanup()
  } finally { globalThis.fetch = originalFetch }
})
