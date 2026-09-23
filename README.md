# Security Guard for OpenCode V2

Security Guard reviews **shell command permissions**. It automatically allows
simple inspection commands only when they pass a local command check and Jev
returns a read-only score of at least `0.90`. Commands that do not meet both
conditions require approval (`ask`), even if an existing rule would allow them.
An explicit configured `deny` remains final.

With the default `allowTmpWrites: true`, `mkdir`, `touch`, and `rm` are also allowed
when given exactly one literal **absolute** path inside `/tmp`. This exception
does not call Jev. `touch` cannot follow a symlink outside `/tmp`; `rm` may unlink
a symlink inside `/tmp` even if its target is outside. Relative paths, compound
commands, options, and recursive deletion require approval. Set
`allowTmpWrites: false` to disable the exception.

## Platform support

This policy currently targets and has been tested only on Linux. The command
filter assumes POSIX shell commands, and the `/tmp` exception expects `/tmp` to
resolve to itself. On systems where `/tmp` resolves to another path, that
exception falls back to `ask`. Windows shell syntax and paths are not supported;
do not rely on automatic approvals there.

## Install from npm

Add this entry to `opencode.jsonc` (or `opencode.json`):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "opencode-security-guard",
      "options": { "allowTmpWrites": true }
    }
  ],
  "permissions": [
    { "action": "shell", "resource": "*", "effect": "ask" }
  ]
}
```

OpenCode installs configured npm plugins. Supply an OpenRouter credential through
an active OpenCode OpenRouter connection or the `OPENROUTER_API_KEY` environment
variable in the OpenCode process. For example, start OpenCode from a shell where
the variable is set:

```sh
export OPENROUTER_API_KEY="your-openrouter-key"
```

Without a usable credential, on an API error, or when a command cannot be
classified, the plugin requests approval. It sends eligible read-command text
to OpenRouter's Jev 1.13 Decisions API. Commands may contain sensitive arguments;
avoid sending secrets in commands you expect to classify. The plugin keeps up
to 128 pending command strings in memory for permission correlation and clears
them after tool completion, eviction, or unload. It does not persist or log them.

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `allowTmpWrites` | `true` | Allow the limited absolute-path `/tmp` operations described above. |
| `timeoutMs` | `5000` | Jev request timeout in milliseconds (`100`–`30000`). |
| `readOnlyThreshold` | `0.90` | Minimum Jev read-only score for automatic approval (`0.5`–`1`). |

For local development, run `npm install` in this repository and replace the
package name in `plugins[].package` with its absolute directory path.

The supported peer-dependency range is `@opencode/plugin >=2.0.14 <3`. The
source is typechecked against `2.0.14`, and the shell permission flow was smoke
tested in OpenCode `2.0.15` with `ollama-cloud/deepseek-v4-flash`. Other versions
need validation.
The plugin does not alter permissions for edit tools, MCP tools, or other actions.
Shell commands run with the OpenCode process's authority, and Jev's score is a
classification result rather than proof that a command has no side effects.

Run `npm test` and `npm run typecheck` to verify the source. The automated tests
use simulated OpenCode hooks; validate permission behavior in your target
OpenCode instance before relying on the plugin.
