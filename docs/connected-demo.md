# OncoFlow conectado no computador

O projeto reúne o Pro (`/`), a prévia visual do paciente (`/app/`) e a API. O código canônico do aplicativo está em `patient-app/`; edite-o diretamente. A implantação Vercel está descrita no [guia Vercel](vercel.md).

## Preparar e iniciar

Use Node.js 24 com npm, na raiz:

```sh
npm ci
npm run build:platform
npm run start:platform
```

O build instala as dependências do app quando ausentes. Os arquivos finais ficam em `dist/`, incluindo o servidor local `server.cjs` e o aplicativo em `dist/app/`. Abra `http://localhost:3000/` para o Pro e `http://localhost:3000/app/` para a prévia do paciente. A voz com fornecedores funciona no APK Android nativo; o navegador oferece a interface e os dados conectados.

Para usar a entrada automática também no servidor local, configure `ONCOFLOW_DEMO_AUTO_CONNECT=true` antes de iniciá-lo. No PowerShell:

```powershell
$env:ONCOFLOW_DEMO_AUTO_CONNECT = 'true'
npm run start:platform
```

No Windows, `powershell -ExecutionPolicy Bypass -File .\Start-OncoFlow.ps1 -Build` prepara e inicia a plataforma no terminal atual. `-Port 3100` altera a porta. Mantenha o computador e o servidor ativos durante a demonstração.

## Android e rede privada

O fluxo principal do APK procura automaticamente a implantação Production bem-sucedida do repositório `viniciusadrian1/OncoFlow`. Para apontar excepcionalmente a um servidor privado durante desenvolvimento, use a conexão manual nas opções avançadas:

1. Conecte celular e computador à mesma rede privada.
2. No Pro, escolha o paciente e abra **Aplicativo do paciente → Gerar código de pareamento**.
3. No app, abra a conexão manual avançada. Informe o IP privado do computador e a porta, por exemplo `http://192.168.1.20:3000`, e o código temporário.
4. Para HTTP privado, marque **Rede local de demonstração (HTTP)**. `localhost` no celular aponta para o próprio aparelho.
5. Confira o nome do paciente retornado pelo servidor.

O terminal informa os endereços IPv4 privados disponíveis. Se não houver conexão, tente abrir o Pro no navegador do celular e confira a porta, o firewall da rede privada e eventual isolamento de clientes na rede Wi-Fi. O código só é usado uma vez e vence; gerar outro não reinicia o servidor.

## Trocas reais na demonstração

O paciente consulta agenda, documentos, jornada e mensagens do mesmo servidor usado pelo Pro. Relatos de sintomas geram um registro para revisão com a fala literal e a hipótese do sistema. A equipe assume, registra um desfecho e responde; a mensagem volta ao app do paciente correspondente. Repetir a mesma operação com a mesma chave não duplica o registro.

Na área **Aplicativo do paciente**, a equipe altera o compromisso real, incluindo preparo, e publica alterações da jornada e textos autorizados. Pedidos de reagendamento continuam sendo solicitações até a equipe alterar a agenda. O plano interno da equipe não é publicado automaticamente. A prioridade clínica depende de avaliação profissional; a demonstração não é um canal de emergência.

## Estado local e Docker

O iniciador usa `outputs/.oncoflow-demo/state.json`, ignorado pelo Git. Reiniciar o processo mantém o estado salvo. Um reinício explícito dos dados da demo no Pro tem a sua própria semântica e revoga sessões/pareamentos. As variáveis locais opcionais são `PORT`, `ONCOFLOW_PATIENT_WEB_DIR` e `ONCOFLOW_DEMO_STATE_PATH`.

Com Docker e Compose instalados e em execução:

```sh
docker compose --env-file platform/demo.compose.env -f compose.demo.yml up --build -d
docker compose --env-file platform/demo.compose.env -f compose.demo.yml logs -f
```

Para interromper preservando o volume:

```sh
docker compose --env-file platform/demo.compose.env -f compose.demo.yml down
```

O volume `oncoflow-demo-state` guarda `/data/state.json`. O Compose é separado da arquitetura FastAPI histórica. A configuração Compose foi validada; um build de imagem exige um Docker Engine disponível. A Vercel usa a função Node e Redis do guia próprio, sem volume local.

## Verificar e manter a fonte

```sh
npm run lint
npm run test:integration
npm run test:platform
npm run test:vercel
npm --prefix patient-app test
npm run build:platform
npm run test:platform:smoke
```

O smoke usa porta efêmera e arquivo isolado e testa entrada automática, relato idempotente, sinal no Pro, resposta da equipe e leitura pelo paciente. Os dados são fictícios e os testes não chamam fornecedores de IA.

`sync:patient` é uma ferramenta excepcional de importação com fonte explícita; não faz parte do desenvolvimento normal nem do build. Não a execute contra uma pasta irmã antiga, pois isso sobrescreveria o aplicativo canônico. O manifesto de importação gerado é ignorado; ele não é uma declaração da versão atual após edições diretas. Arquivos `.env` reais, dependências, builds, SDK local, keystores e APKs não entram na importação ou no Git. Para compilar Android, siga `patient-app/docs/android-build.md` e a documentação atual do app.
