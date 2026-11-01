# Plano de configuração Vercel Services

**Objetivo:** publicar a plataforma atual como múltiplos serviços no mesmo domínio, preservando o contrato do APK e da API Node. A divisão foi confirmada pelo usuário, com envio autorizado à `main`; a publicação Vercel será feita por ele.

**Arquitetura aprovada:** `app` na raiz reúne o painel Pro e suas funções Node; `patient-app` compila o cliente web separadamente e ocupa `/app/`. Ambos são públicos pelas rotas correspondentes. Não existem chamadas entre funções de serviços diferentes: os clientes estáticos usam a API pública na mesma origem. Não declarar bindings que não seriam consumidos. `backend/` (FastAPI) e `frontend/` são arquitetura futura, sem o contrato do app atual, e não participam desta publicação.

**Alternativas consideradas:** quatro serviços autodetectados conectariam o app ao backend incompatível; separar uma API Node adicional exigiria reorganizar o runtime que já pertence ao app sem uma necessidade funcional atual. A proposta preserva a API testada e dá um build independente ao paciente.

- [x] Ler os contratos atuais e as regras oficiais de Services, roteamento e bindings.
- [x] Reproduzir em testes a falta de `services` e a dependência do build Pro nos arquivos do paciente.
- [x] Mover opções de build/runtime para `services.app`; manter somente rotas públicas e ambiente no topo.
- [x] Separar o build Pro e criar o build web do paciente com arquivos sob `/app/`, preservando o build relativo do APK.
- [x] Verificar esquema, builds, tipos, testes de persistência e `vercel dev -L` em porta/estado isolados.
- [x] Atualizar o guia e apresentar o JSON completo, nomes, exposição pública e ausência de bindings para confirmação.
- [x] Receber a confirmação dos dois serviços e a autorização para registrar e enviar à `main` do GitHub. A publicação Vercel continua com o usuário.
