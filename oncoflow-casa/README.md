# OncoFlow Casa — protótipo rápido

Prova de conceito descartável, com dados fictícios, para testar a interação **botão → registro recebido → histórico → revisão**. O painel é independente: ainda não se conecta à plataforma OncoFlow e não envia mensagens a profissionais.

## Experimentar agora

No Windows, abra `iniciar.cmd`, ou execute nesta pasta:

```powershell
python server.py
```

Abra <http://localhost:8765>. Não é necessário instalar pacotes Python ou JavaScript. Python 3.10+ é suficiente. Para encerrar, use Ctrl+C na janela do servidor.

1. Aperte “Estou bem”, “Tenho desconforto” ou “Quero conversar” no aparelho desenhado.
2. Confira a confirmação no visor e a chegada do registro no painel.
3. Marque o registro como revisado. O pedido de contato deixa de ficar pendente.
4. Exporte os registros exibidos em CSV, se desejar.

Os registros ficam no SQLite local `demo.sqlite3`; o painel mostra os 200 mais recentes. O horário exibido usa America/Sao_Paulo. A data de recebimento é registrada pelo servidor em UTC, não pelo aparelho.

O simulador mantém envios pendentes no armazenamento deste navegador e tenta reenviar a cada 2,5 segundos. O servidor evita duplicatas pelo identificador do registro. A confirmação só aparece depois de resposta do receptor. Sem armazenamento disponível no navegador, mantenha a página aberta até o envio terminar.

## Passar para o aparelho físico

Você já informou possuir ESP32 clássico, protoboard e botões. Para esta primeira montagem são necessários **três botões momentâneos**, fios de ligação e cabo USB de dados/alimentação compatível. A quantidade de botões e a disponibilidade desses acessórios ainda precisam ser confirmadas. LED RGB, buzzer, display e caixa ficam para uma próxima iteração; o feedback físico desta versão aparece no Monitor Serial.

**Referência: ESP32-DevKitC V4 com ESP32 clássico. O modelo exato da sua placa não foi confirmado.** Confira os rótulos dos GPIOs e o pinout da sua placa antes da montagem; a numeração é de GPIO, não a posição física do conector. Esta pinagem não é uma instrução para ESP32-C3/S3 ou outra variante.

Com a placa desconectada da alimentação, conecte cada botão entre o GPIO indicado e GND:

| Ação | GPIO de referência | Outro contato |
|---|---|---|
| Estou bem | 25 | GND |
| Tenho desconforto | 26 | GND |
| Quero conversar | 27 | GND |

O código usa `INPUT_PULLUP`: botão aberto = HIGH, pressionado = LOW. Não conecte os botões a 5 V. Botões de quatro terminais possuem pares de terminais já unidos; use os contatos que só fecham ao pressionar, conferindo a peça antes de montar. Alimente pela USB da placa, sem outra fonte simultânea.

1. Inicie o receptor para a rede local: `python server.py --lan`.
2. Descubra o IPv4 Wi-Fi do computador com `ipconfig`. Computador e ESP32 precisam estar na mesma rede privada; o ESP32 clássico usa Wi-Fi de 2,4 GHz. Redes de convidados podem bloquear a comunicação.
3. Na Arduino IDE com o pacote de placas ESP32 da Espressif, abra `firmware/oncoflow_casa/oncoflow_casa.ino`.
4. Preencha `WIFI_SSID`, `WIFI_PASSWORD` e `SERVER_URL` com o IPv4 do computador, mantendo `/api/events`. Use o modelo correto da sua placa e a porta USB correspondente.
5. Compile e grave. Abra o Monitor Serial a 115200 baud.
6. Aperte um botão: “AGUARDANDO ENVIO” indica a fila; “RECEBIDO PELO PAINEL” indica confirmação HTTP. O painel distingue “Aparelho ESP32” de “Simulador”.

Se o Windows solicitar liberação do Python no firewall, use apenas a rede privada de demonstração. Não publique a porta na internet. O modo LAN usa HTTP sem autenticação; foi feito exclusivamente para a demonstração com dados fictícios.

O firmware tem debounce de 45 ms e fila de 16 registros em RAM, com nova tentativa a cada 2,5 segundos. Segurar um botão não gera repetições. Desligar/reiniciar a placa perde a fila ainda não enviada. O envio HTTP pode bloquear a leitura dos botões por alguns segundos se a rede falhar; esta versão não garante captura de toques durante esse intervalo. Ela não possui relógio clínico, armazenamento persistente no aparelho ou confirmação por LED/display.

## Contrato para uma futura integração

```http
POST /api/events
Content-Type: application/json
```

```json
{
  "event_id": "identificador-unico-do-toque",
  "device_id": "CASA-001",
  "value": "bem",
  "source": "esp32"
}
```

`value`: `bem`, `desconforto` ou `contato`. `source`: `simulador` ou `esp32`. Retorno 201 = criado; 200 = retransmissão já recebida; 409 = identificador reutilizado com conteúdo diferente. `GET /api/events` lista os 200 registros mais recentes. `POST /api/review` com `event_id` registra uma revisão de demonstração. Não há autenticação, associação real de paciente, consentimento ou auditoria de usuários.

Para conectar a uma OncoFlow real, implementar o adaptador no backend da plataforma, com identidade do dispositivo e vínculo autorizado do paciente. Trocar apenas a URL não constitui integração clínica concluída.

## O que este experimento valida

- Facilidade de entender e usar três botões.
- Recebimento de registros por um painel e rastreio da origem.
- Clareza da confirmação e do estado de envio pendente.

As três respostas são escolhas de demonstração, não um questionário clínico validado. “Quero conversar” não aciona atendimento. O protótipo não mede sinais vitais, não calcula risco nem define conduta. Ainda precisam ser testados com usuários a utilidade do objeto, a linguagem e a rotina de revisão pela equipe.

## Verificação e referências

Verificado nesta entrega: os três botões no navegador, revisão de registro, estado sem conexão e reenvio automático após reiniciar o receptor; persistência em SQLite, retransmissão sem duplicatas e rejeição de dados inválidos; layout em tela de 390 px. O sketch não foi compilado ou gravado: ainda precisa de compilação no ambiente Arduino e teste na placa física antes de afirmar funcionamento do circuito.

Pinagem e entradas consultadas na documentação oficial:

- [ESP32-DevKitC V4 — guia de hardware](https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32/esp32-devkitc/user_guide.html)
- [Arduino-ESP32 — GPIO e INPUT_PULLUP](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/gpio.html)
