# Lia: identidade e interação por voz

Pedido: aproximar logo, orbe animado e tela de voz da capa do PDF fornecido. Continuar sobre as alterações visuais existentes, sem substituí-las.

Direção: símbolo em O com fitas translúcidas ciano/turquesa; orbe orgânico de vidro com camadas internas, borda luminosa e movimento discreto. SVG nativo responsivo, sem dependência ou imagem raster. Manter Inter e azul profundo, verde-água, turquesa, gelo e branco. O orbe é o foco visual; controles e textos são calmos e claros.

Fluxo: abrir Lia em modo de voz disponível, sem ligar microfone automaticamente; começar; ouvir com volume real; parar e transcrever; revisar texto editável; enviar; receber resposta com texto e áudio; confirmar ações quando a API pedir. Acesso a digitação sempre disponível. Pedidos iniciados pela agenda abrem o chat de texto.

Captação usa análise local Web Audio. A síntese do navegador não expõe PCM: a animação de resposta acompanha início/fim e eventos de palavras, sem alegar amplitude TTS medida. Redução de movimento mantém o orbe estático com estado em texto. Cancelar, sair e desmontar liberam microfone e ignoram operações tardias. Preservar avisos de emergência, origem e status das ações.

Verificação: primeiro reproduzir ausência da nova tela; depois testar no navegador com sinal de áudio sintético e resposta de transcrição fictícia, sem envio a fornecedor. Conferir início explícito, volume, cancelamento, revisão, envio, confirmação, estados, movimento reduzido e tamanhos de celular. Lint, build e revisão do diff ao final.
