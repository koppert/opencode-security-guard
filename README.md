# Security Guard para OpenCode V2

Este plugin revisa permissões de **comandos shell**. Comandos simples de consulta
recebem `allow` quando o Jev confirma com probabilidade de pelo menos 0,98 que
não alteram estado. Comandos que podem escrever arquivos, executar programas
indiretos ou mudar processos e serviços recebem `ask`, inclusive quando alguma
regra anterior os marcaria como `allow`. Um `deny` configurado continua valendo.

Por padrão, `mkdir`, `touch` e `rm` com um único caminho literal dentro de `/tmp`
são liberados. A verificação rejeita symlinks que apontam para fora de `/tmp`.
Comandos compostos, opções e remoção recursiva continuam sujeitos a aprovação.
Defina `allowTmpWrites: false` para desligar essa exceção.

## Instalação

Requer OpenCode V2 com `@opencode/plugin` 2.0.14. Instale dependências nesta pasta
com `npm install` e referencie a pasta uma vez no `opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "/caminho/absoluto/security-guard",
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

O plugin usa a conexão OpenRouter ativa do OpenCode ou `OPENROUTER_API_KEY`.
Envia o texto do comando ao endpoint Jev (`typesafe/jev-1.13`). Sem credencial,
em falha de rede, ou se o comando não puder ser verificado, pede aprovação.
Os comandos não são armazenados pelo plugin. O classificador só recebe formas
simples de comandos de consulta, nunca comandos arbitrários ou compostos.

O plugin não altera permissões de ferramentas de edição, MCP ou outras ações.
Os caminhos em `/tmp` são uma exceção para os três comandos descritos, não uma
permissão geral de escrita. Shell e plugins têm a autoridade do processo OpenCode;
teste a política no ambiente onde será usada. A pasta `security-guard-old` foi
preservada como referência.

Para verificar: `npm test` e `npm run typecheck`.
