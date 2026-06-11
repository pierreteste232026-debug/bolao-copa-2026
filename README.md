# Bolão Copa 2026

Aplicação para bolão da Copa do Mundo 2026 com cadastro, login, palpites por rodada, classificação dos grupos e ranking de placares exatos.

Para publicar grátis no Netlify usando Turso, siga o guia:

[DEPLOY_NETLIFY_TURSO.md](DEPLOY_NETLIFY_TURSO.md)

## Regra de Pontuação

Cada placar exato vale 1 ponto. Não existe pontuação por acertar apenas vencedor, empate ou saldo.

## Rodar Localmente

No PowerShell:

```powershell
.\start.ps1
```

O site abre em `http://localhost:2026` por padrão. Se a porta estiver ocupada, o servidor tenta a próxima.

## Banco Local

No modo local, o SQLite é criado automaticamente em:

```text
database/bolao-copa-2026.sqlite
```

No Netlify, o banco usado é o Turso, configurado pelas variáveis:

```text
TURSO_DATABASE_URL
TURSO_AUTH_TOKEN
```

## Organizador

A área do organizador não aparece para os participantes. Para abrir localmente:

```text
http://localhost:2026/#organizador
```

No site publicado:

```text
https://seu-site.netlify.app/#organizador
```

Digite a chave para liberar a edição manual de resultados e o botão de sincronização.

Chave padrão:

```text
copa2026-admin
```

Troque essa chave no Netlify configurando a variável `ADMIN_KEY`.

## Verificação de Placares

Localmente, o servidor consulta a ESPN automaticamente a cada 10 minutos enquanto estiver rodando.

No Netlify, a sincronização acontece quando alguém abre o site ou quando o organizador clica em `Sincronizar ESPN agora`.

## Fontes da Seed

- Agenda: https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260719&limit=200
- Grupos: https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings?season=2026
