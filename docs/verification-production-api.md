# Correção do pacote da API Vercel — 31/10/2026

## Defeito observado

Em `https://oncoflow-amber.vercel.app`, o painel e `/app/` respondiam HTML 200, mas `/api/health` e `/api/index?__oncoflow_path=/api/health` respondiam `404 NOT_FOUND` da Vercel. O Pro ficava em **Loading profiles…**, pois não conseguia consultar `/api/demo/usuarios`.

O plano real do builder oficial para `services.app` continha apenas `@vercel/static-build`, com `src: package.json`. No modo Services, a propriedade `functions` não acrescenta um builder Node para um arquivo solto em `api/`. O build anterior gerava somente `dist-static`. O teste de desenvolvimento mascarava isso porque `devCommand` executava o Express local completo.

## Correção

`platform/vercel-output.mjs` gera explicitamente o Build Output API v3:

```text
.vercel/output/
  config.json                         # version: 3
  static/                             # somente o frontend Pro
  functions/api/index.func/
    index.cjs                         # API com dependências incorporadas
    .vc-config.json                   # Node 24, launcher Nodejs, duração 60s
```

Não há `node_modules` externo exigido pelo artefato. As credenciais Redis continuam lidas no runtime; nenhuma variável privada é substituída no build. O bundle fica fora da pasta pública. Os dois serviços, seus nomes e suas rotas públicas permanecem os mesmos.

A tela de acesso agora distingue carregamento de falha e oferece **Try again**. A requisição é cancelada ao desmontar ou tentar novamente. `platform/mobile-config.json` também registra somente o domínio público real para o APK quando a integração GitHub fornece status de commit, sem registros de deployment.

## Evidência

- `npm run test:vercel:artifact`: os dois casos falharam antes da correção por ausência da função e passaram depois.
- O teste copia a função para um diretório temporário, sem as dependências do repositório, e recebe JSON 503 quando Redis está ausente; não recebe o 404 da plataforma.
- Builder oficial `@vercel/static-build` 26.0.1 executado em fixture isolada: reconheceu `buildOutputVersion: 3`, incluiu estáticos e a função com metadados Node 24. A função copiada respondeu JSON 503 sem Redis.
- `npm run lint`, 13 testes serverless, 2 testes do cliente Pro e 4 testes de configuração passaram.
- Navegador com o pacote de produção local sem Redis mostrou a mensagem de indisponibilidade e o botão **Try again**. A nova tentativa terminou no estado de erro apropriado, sem carregamento infinito.

## Validação da publicação

Após a nova implantação, `/api/health` deve responder JSON. HTTP 200 com `ready: true` e `storage: "redis"` confirma a prontidão. JSON 503 significa que a função está presente, mas a persistência precisa ser configurada ou restabelecida. O 404 da Vercel indica um problema anterior à função.

O teste local executou Node 22.21.1; o artefato de produção declara Node 24. Nenhuma conta ou recurso Vercel foi criado. Os registros permanecem fictícios e a persistência hospedada requer a integração Redis do projeto. Consulte [o guia de publicação](vercel.md).
