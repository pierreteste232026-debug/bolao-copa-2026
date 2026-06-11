# Publicar Grátis no Netlify + Turso

Este projeto agora está preparado para rodar no Netlify usando:

- Site estático em `public/`
- Netlify Functions em `netlify/functions/api.js`
- Banco Turso, que é SQLite na nuvem

Não use o `dist` antigo para Netlify. Publique o projeto pela raiz do repositório, porque o Netlify precisa instalar as dependências e empacotar as Functions.

## 1. Criar o banco no Turso

1. Crie uma conta em https://turso.tech.
2. Instale/faça login na CLI do Turso, ou use o painel web se preferir.
3. Pela CLI:

```bash
turso auth login
turso db create bolao-copa-2026
turso db show bolao-copa-2026 --url
turso db tokens create bolao-copa-2026
```

Guarde:

- `TURSO_DATABASE_URL`: URL que começa com `libsql://`
- `TURSO_AUTH_TOKEN`: token gerado pelo comando de token

## 2. Subir o projeto para o GitHub

Crie um repositório no GitHub e envie estes arquivos do projeto.

Arquivos importantes para o Netlify:

- `netlify.toml`
- `netlify/functions/api.js`
- `public/`
- `data/seed.json`
- `package.json`

## 3. Criar o site no Netlify

1. Acesse https://app.netlify.com.
2. Clique em `Add new site`.
3. Escolha `Import an existing project`.
4. Conecte o GitHub.
5. Escolha o repositório do bolão.

O Netlify deve detectar:

```text
Publish directory: public
Functions directory: netlify/functions
```

Se precisar preencher manualmente:

```text
Build command: deixe vazio
Publish directory: public
```

## 4. Configurar variáveis no Netlify

No Netlify, vá em:

```text
Site configuration > Environment variables
```

Adicione:

```text
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=...
ADMIN_KEY=sua-chave-de-organizador
AUTO_SYNC_RESULTS=true
AUTO_SYNC_MINUTES=10
```

Depois clique em `Deploy` ou `Retry deploy`.

## 5. Primeiro acesso

Abra o site publicado.

Na primeira chamada de API, o sistema cria as tabelas no Turso e importa os 104 jogos de `data/seed.json`.

Teste:

```text
https://seu-site.netlify.app/api/health
```

Deve aparecer:

```json
{"ok":true}
```

## 6. Área do organizador

A área do organizador fica escondida:

```text
https://seu-site.netlify.app/#organizador
```

Digite a chave configurada em `ADMIN_KEY`.

## Como Funciona a Sincronização ESPN

No Netlify não existe servidor ligado 24h com `setInterval`. Então a sincronização automática funciona assim:

- Quando alguém abre o site, a API verifica se já passou o intervalo configurado.
- Se passou, ela consulta a ESPN e atualiza os resultados no Turso.
- O organizador também pode forçar a sincronização pelo painel privado.

Para 8 pessoas, isso é suficiente e fica dentro do uso gratuito com bastante folga.
