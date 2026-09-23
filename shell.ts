import { lstat, realpath } from "node:fs/promises"
import { dirname, isAbsolute, resolve, sep } from "node:path"

export type Screening = "read" | "tmp" | "review"

const readCommands = new Set(["pwd", "ls", "cat", "head", "tail", "rg", "grep", "stat", "wc", "which", "whoami", "id", "uname", "df", "du", "ps", "git"])
const readGit = new Set(["status", "diff", "log", "show", "rev-parse", "ls-files"])
const forbiddenOption = /(?:^|\s)--(?:output|pre|post|exec|execdir|delete|in-place|replace|write|update|create|remove|exclude-from|config|pager|ext-diff|textconv)(?:[=\s]|$)|(?:^|\s)-[a-zA-Z]*[ioD](?:\s|$)/
const syntax = /[;&|`$<>\\\n\r\0]/

function words(command: string): string[] | undefined {
  // Restrict automatic permission to literal arguments. Quotes and expansion
  // require a real shell parser, so they remain subject to approval.
  if (/["'\[\]{}()*?~]/.test(command)) return
  return command.trim().split(/\s+/).filter(Boolean)
}

async function insideTmp(path: string, mayBeSymlink = false): Promise<boolean> {
  if (!isAbsolute(path) || !path.startsWith(`/tmp${sep}`) || path === "/tmp") return false
  let parent = dirname(path)
  for (;;) {
    try {
      const actualParent = await realpath(parent)
      if (actualParent !== "/tmp" && !actualParent.startsWith(`/tmp${sep}`)) return false
      break
    } catch {
      const next = dirname(parent)
      if (next === parent) return false
      parent = next
    }
  }
  try {
    const info = await lstat(path)
    if (info.isSymbolicLink()) return mayBeSymlink
    if (info.nlink > 1 && !mayBeSymlink) return false
    const actual = await realpath(path)
    return actual.startsWith(`/tmp${sep}`)
  } catch { return true }
}

export async function screen(command: string, allowTmpWrites: boolean): Promise<Screening> {
  if (!command || command.length > 16384 || syntax.test(command)) return "review"
  const argv = words(command)
  if (!argv?.length) return "review"
  const [verb, ...args] = argv

  // A small exception for literal local paths. No recursive deletion, options,
  // shell expansion, redirection, or service operation is covered by it.
  if (allowTmpWrites && ["mkdir", "touch", "rm"].includes(verb) && args.length === 1 && !args[0].startsWith("-")) {
    if (await insideTmp(resolve(args[0]), verb === "rm")) return "tmp"
  }

  if (!readCommands.has(verb) || forbiddenOption.test(command)) return "review"
  if (verb === "git" && (!readGit.has(args[0]) || args.some((arg) => arg === "-c" || arg.startsWith("--config")))) return "review"
  // A name such as /tmp/run is data only for the listed reader commands.
  return "read"
}
