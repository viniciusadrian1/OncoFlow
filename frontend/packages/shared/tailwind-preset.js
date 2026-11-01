/**
 * Tokens da marca OncoFlow (documento de conceito, seção 11), com o contraste medido (WCAG 2.2):
 * - azul-profundo #123B56: texto e fundos de destaque (11,8:1 com branco)
 * - verde-agua #167C70: botão primário com texto branco (5,1:1). Sobre gelo dá 4,49:1 → só texto grande
 * - turquesa #55B9B0: só decorativo (2,35:1 sobre branco, reprovado para texto e borda funcional)
 * - gelo #EAF3F4: fundo de seções; texto sobre ele sempre em azul-profundo (10,4:1)
 * Estados funcionais têm tokens próprios e sempre aparecem com ícone + texto.
 */
export default {
  theme: {
    extend: {
      colors: {
        marca: {
          azul: "#123B56",
          verde: "#167C70",
          turquesa: "#55B9B0",
          gelo: "#EAF3F4",
        },
        estado: {
          // Contraste medido sobre branco / sobre o próprio fundo
          atencao: "#8A4B00", // 6,8:1 / 6,3:1
          "atencao-fundo": "#FFF4E5",
          erro: "#B42318", // 6,6:1 / 6,1:1
          "erro-fundo": "#FEF3F2",
          sucesso: "#146C43", // 6,5:1 / 6,1:1
          "sucesso-fundo": "#ECFDF3",
        },
        texto: {
          DEFAULT: "#123B56",
          suave: "#475467", // 7,7:1 sobre branco, 6,8:1 sobre gelo
        },
      },
      fontFamily: {
        sans: ['"Inter Variable"', "system-ui", "sans-serif"],
      },
      fontVariantNumeric: {
        tabular: "tabular-nums",
      },
    },
  },
};
