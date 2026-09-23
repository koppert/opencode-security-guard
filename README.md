# Security Guard for OpenCode V2

This plugin reviews permissions for **shell commands**. Simple query commands
receive `allow` when Jev confirms with at least 0.98 probability that they do not
change state. Commands that may write files, execute programs indirectly, or
change processes and services receive `ask`, even when an earlier rule would have
marked them as `allow`. A configured `deny` still applies.

By default, `mkdir`, `touch`, and `rm` with a single literal path inside `/tmp`
are allowed. The check rejects symlinks that point outside `/tmp`. Compound
commands, options, and recursive deletion still require approval. Set
`allowTmpWrites: false` to disable this exception.

## Installation

Requires OpenCode V2 with `@opencode/plugin` 2.0.14 or later. For local use,
install dependencies in this folder with `npm install` and reference the folder;
for npm use, reference the `opencode-security-guard` package. Local example:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "/absolute/path/security-guard",
      "options": {
        "allowTmpWrites": true,
        "timeoutMs": 5000,
        "readOnlyThreshold": 0.98
      }
    }
  ],
  "permissions": [
    { "action": "shell", "resource": "*", "effect": "ask" }
  ]
}
```

For npm, replace `"package"` with the package name:

```jsonc
{
  "plugins": [
    {
      "package": "opencode-security-guard",
      "options": { "readOnlyThreshold": 0.98 }
    }
  ]
}
```

The plugin uses OpenCode's active OpenRouter connection or `OPENROUTER_API_KEY`.
It sends the command text to the Jev endpoint (`typesafe/jev-1.13`). Without a
credential, on a network failure, or if the command cannot be verified, it asks
for approval. The plugin does not store commands. The classifier only receives
simple query command forms, never arbitrary or compound commands.

The plugin does not change permissions for edit tools, MCP, or other actions.
The `/tmp` paths are an exception for the three commands described above, not a
general write permission. Shell and plugins have the authority of the OpenCode
process; test the policy in the environment where it will be used.

To verify: `npm test` and `npm run typecheck`.
