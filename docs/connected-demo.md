# OncoFlow conectado: painel, aplicativo e Android

Esta distribuição reúne o OncoFlow Pro, o aplicativo do paciente e a API de demonstração no mesmo projeto.
Usa somente pacientes fictícios. O servidor guarda a demonstração em arquivo; agenda, mensagens, jornada,
documentos, relatos e solicitações compartilham o mesmo estado.

## Preparar e iniciar no computador

Requisito: Node.js 22.12 ou superior, com npm. Na raiz deste repositório:

```sh
npm ci
npm run build:platform
npm run start:platform
```

O primeiro build instala as dependências de `patient-app` quando elas ainda não estão disponíveis. O app
é compilado a partir do código versionado nesse diretório. O resultado final contém:

- `dist/server.cjs`: servidor Express;
- `dist/index.html` e `dist/assets/`: painel Pro;
- `dist/app/`: aplicativo do paciente.

Abra o painel em [http://localhost:3000/](http://localhost:3000/) e o app web em
[http://localhost:3000/app/](http://localhost:3000/app/). O iniciador também informa endereços IPv4 da rede
privada para usar no celular. O computador precisa permanecer ligado e o servidor precisa continuar aberto
durante a demonstração.

No Windows, o mesmo fluxo pode ser iniciado na sua janela de terminal:

```powershell
powershell -ExecutionPolicy Bypass -File .\Start-OncoFlow.ps1 -Build
```

Nas próximas execuções, `Start-OncoFlow.ps1` reutiliza o build. Use `-Build` depois de alterar o código;
`-Port 3100` escolhe outra porta. O script utiliza o terminal atual e não abre outras janelas.

## Parear o Android na mesma rede

1. Conecte computador e celular à mesma rede privada. No celular, use o IP do computador informado no
   terminal, por exemplo `http://192.168.1.20:3000`. `localhost` no celular identifica o próprio aparelho.
2. No Pro, escolha um perfil fictício, selecione o paciente e abra **Aplicativo do paciente**.
3. Toque em **Gerar código de pareamento**. O código tem prazo de validade e só pode ser utilizado uma vez.
4. No aplicativo Android, toque em **Conectar ao hospital** na entrada ou em **Perfil → Conectar ao hospital**.
5. Informe o endereço do computador e o código. Para esse endereço HTTP privado, marque
   **Rede local de demonstração (HTTP)** antes de conectar.
6. Confira o nome do paciente retornado pelo servidor. A sessão fica restrita àquela pessoa fictícia.

O campo de endereço exibido no painel reflete como você abriu o Pro. Se o painel estiver em `localhost`,
substitua pelo IP da rede ao preencher o Android. O aplicativo também aceita um endereço HTTPS acessível ao
aparelho; o modo HTTP de demonstração é reservado aos endereços locais permitidos pelo app.

Se o celular não alcançar o servidor, teste primeiro o endereço do painel no navegador do celular. Confira
o IP, a porta e a conexão à mesma rede; redes de convidados podem isolar os aparelhos. Quando o Windows
solicitar acesso de rede ao Node.js, permita a rede privada usada pela demonstração.

## Ver a troca nos dois sentidos

- **Sintoma dito ou digitado à Lia (0.11):** “Estou com febre e vomitando” é enviado ao serviço antes do GPT. Um sinal afirmativo configurado gera alerta com fala literal no painel e orientação para procurar avaliação. Negação/pergunta educativa não vira sintoma. O alerta aguarda revisão profissional; o registro não confirma que alguém leu. Se a voz falhar, a escuta e o texto continuam disponíveis.
- **Contexto do câncer:** o Perfil e a Lia recebem diagnóstico, tratamento/ciclo cadastrados e orientações publicadas. Informação ausente continua ausente; o modelo não deduz conduta ou estágio.

- **App → equipe:** envie um registro de bem-estar ou pedido de contato/reagendamento. O app só confirma
  depois que o servidor aceitar. O registro aparece no paciente correspondente do Pro.
- **Equipe → app:** revise a pendência, assuma o atendimento e envie uma mensagem na Comunicação. O app
  mostra os estados e mensagens fornecidos pelo servidor.
- **Agenda:** na área **Aplicativo do paciente**, edite data, local, profissional e preparo e salve. Essa
  ação altera o compromisso compartilhado. Um pedido de reagendamento continua sendo apenas um pedido
  até a equipe alterar a agenda.
- **Jornada:** revise título, descrição e estado e publique a alteração.
- **Documentos:** escreva o texto autorizado, marque a revisão e use **Aprovar e publicar documento**.
  O plano terapêutico interno do Pro não é publicado automaticamente.

Use **Atualizar dados** para recarregar a área de edição do Pro. O app conectado atualiza os dados remotos
e mantém separadas as confirmações de envio, recebimento e conclusão. Nenhuma IA define prioridade clínica,
diagnostica ou altera tratamento. Relatos e mensagens seguem as regras de revisão do serviço fictício;
o aplicativo não é um canal de emergência.

## Persistência e reinício

O iniciador usa `outputs/.oncoflow-demo/state.json`, ignorado pelo Git. Encerrar e iniciar o processo mantém
o estado salvo. Os códigos temporários não utilizados não sobrevivem ao reinício; gere outro código quando
necessário. O comando de reiniciar dados da demonstração no Pro tem efeito explícito sobre os dados e revoga
pareamentos/sessões.

É possível configurar `PORT`, `ONCOFLOW_PATIENT_WEB_DIR` e `ONCOFLOW_DEMO_STATE_PATH` no ambiente do processo.
Os padrões são porta `3000`, `dist/app` e o arquivo de estado indicado acima. Nenhuma chave de IA é exigida
para a API de pareamento e troca de dados. Credenciais locais e arquivos de configuração privados não são
incluídos no código do aplicativo copiado para este repositório.

## Rodar a mesma plataforma em Docker

Requisito: Docker com Compose. O arquivo `compose.demo.yml` inicia somente a plataforma Node, na porta
3000, com um volume persistente para `/data/state.json`. Ele é separado do Compose da arquitetura FastAPI.

```sh
docker compose --env-file platform/demo.compose.env -f compose.demo.yml up --build -d
docker compose --env-file platform/demo.compose.env -f compose.demo.yml logs -f
```

Para interromper sem apagar o estado:

```sh
docker compose --env-file platform/demo.compose.env -f compose.demo.yml down
```

O volume `oncoflow-demo-state` mantém os dados entre recriações do contêiner. A porta do computador pode ser
alterada em `platform/demo.compose.env` por `ONCOFLOW_DEMO_PORT`. O servidor dentro do contêiner usa a porta 3000.

## Hospedagem futura

Este pacote não cria uma hospedagem pública. O Dockerfile permite preparar a mesma distribuição em um
servidor com volume persistente; um endereço público exige a configuração do provedor, domínio e HTTPS
por plataforma ou proxy reverso. No Android, o endereço HTTPS deve ser informado no pareamento.

Os perfis fictícios e o cabeçalho `x-demo-usuario` servem à demonstração. Não representam autenticação,
autorização institucional ou prontuário de produção. O conteúdo publicado permanece sujeito à aprovação
humana e os dados usados aqui permanecem fictícios.

## Atualizar o código do aplicativo e verificar

`patient-app` é a cópia de código incluída nesta distribuição. Para importá-la novamente da pasta irmã de
desenvolvimento `../oncoflow-patient`:

```sh
npm run sync:patient
npm run test:platform
npm run lint
npm run test:integration
npm run build:platform
npm --prefix patient-app test
```

O sincronizador usa uma lista explícita de arquivos e verifica os limites de origem/destino. Inclui `src`,
`shared`, testes unitários/E2E, marca/ilustrações, configurações conhecidas, scripts de preparo do VAD/build
Android, documentação selecionada e fontes nativas Java/recursos/manifests/Gradle. Registra os arquivos e
seus hashes em `patient-app/.source-manifest.json`.

Não copia `.env` reais, dependências, builds, `.gradle`, `local.properties`, credenciais, keystores, APKs,
logs ou assets Android gerados. O único arquivo de ambiente copiado é `.env.example`. O VAD local e seus
arquivos de runtime são regenerados pelo `prebuild` a partir das dependências com as respectivas licenças.
Para recompilar o APK, consulte `patient-app/docs/android-build.md` e execute o build Android na pasta
`patient-app`; ele exige JDK/SDK Android próprios da máquina.
