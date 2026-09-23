import { Plugin } from "@opencode/plugin"
import { classify, type Classification } from "./jev.ts"
import { screen, type Screening } from "./shell.ts"

type Effect = "allow" | "ask" | "deny"
type Decision = { effect: Effect; message: string }

export interface Settings {
  allowTmpWrites: boolean
  timeoutMs: number
  readOnlyThreshold: number
}

export function parseSettings(options: Record<string, unknown>): Settings {
  const allowed = new Set(["allowTmpWrites", "timeoutMs", "readOnlyThreshold"])
  for (const key of Object.keys(options)) if (!allowed.has(key)) throw new Error(`security-guard: opção desconhecida: ${key}`)
  const allowTmpWrites = options.allowTmpWrites ?? true
  const timeoutMs = options.timeoutMs ?? 5000
  const readOnlyThreshold = options.readOnlyThreshold ?? 0.9
  if (typeof allowTmpWrites !== "boolean") throw new Error("security-guard: allowTmpWrites deve ser boolean")
  if (typeof timeoutMs !== "number" || !Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000) throw new Error("security-guard: timeoutMs inválido")
  if (typeof readOnlyThreshold !== "number" || !Number.isFinite(readOnlyThreshold) || readOnlyThreshold < 0.5 || readOnlyThreshold > 1) throw new Error("security-guard: readOnlyThreshold inválido")
  return { allowTmpWrites, timeoutMs, readOnlyThreshold }
}

export async function decide(command: string | undefined, original: Effect, settings: Settings, getKey: () => Promise<string | undefined>, transport: typeof fetch = fetch): Promise<Decision> {
  if (original === "deny") return { effect: "deny", message: "Bloqueio configurado no OpenCode." }
  if (!command) return { effect: "ask", message: "Comando completo indisponível; revisão necessária." }
  const screened: Screening = await screen(command, settings.allowTmpWrites)
  if (screened === "tmp") return { effect: "allow", message: "Alteração local permitida em /tmp." }
  if (screened !== "read") return { effect: "ask", message: "Possível alteração de estado; aprovação necessária." }
  const result: Classification = await classify(command, getKey, settings.timeoutMs, transport)
  if (result.kind === "read" && result.confidence >= settings.readOnlyThreshold) {
    return { effect: "allow", message: "Comando de leitura confirmado pelo Jev." }
  }
  return { effect: "ask", message: "Leitura não confirmada pelo Jev; aprovação necessária." }
}

export default Plugin.define({
  id: "security-guard",
  async setup(ctx) {
    const settings = parseSettings(ctx.options)
    const pending = new Map<string, string>()
    const key = (session: string, id: string) => JSON.stringify([session, id])

    await ctx.tool.hook("execute.before", (event) => {
      if (event.tool !== "shell") return
      const input = event.input as { command?: unknown } | null
      if (typeof input?.command === "string" && input.command.length <= 16384) {
        pending.set(key(event.sessionID, event.id), input.command)
        if (pending.size > 128) pending.delete(pending.keys().next().value!)
      }
    })

    await ctx.permission.hook("evaluate", async (event) => {
      if (event.action !== "shell") return
      const command = event.source?.type === "tool" ? pending.get(key(event.sessionID, event.source.id)) : undefined
      const decision = await decide(command, event.effect, settings, async () => {
        const connection = await ctx.integration.connection.active("openrouter")
        if (connection) {
          const credential = await ctx.integration.connection.resolve(connection)
          if (credential?.type === "key") return credential.key
          if (credential?.type === "oauth") return credential.access
        }
        return process.env.OPENROUTER_API_KEY
      })
      event.effect = decision.effect
      event.message = decision.message
    })

    await ctx.tool.hook("execute.after", (event) => {
      if (event.tool === "shell") pending.delete(key(event.sessionID, event.id))
    })

    return () => pending.clear()
  },
})
