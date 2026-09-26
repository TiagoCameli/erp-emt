/**
 * Razão de contraste WCAG 2.x entre duas cores, em função pura.
 *
 * Existe para o teste `contraste.test.ts` travar os pares de cor do tema: texto
 * precisa de 4,5:1 e borda de campo, anel de foco e ícone precisam de 3:1. Sem
 * o teste, clarear um token "só um pouquinho" passa no olho e reprova na leitura.
 *
 * Aceita só hex `#rrggbb` (é como os tokens estão escritos no `globals.css`).
 */

export const MINIMO_TEXTO = 4.5;
export const MINIMO_NAO_TEXTO = 3;

type Rgb = [number, number, number];

function paraRgb(hex: string): Rgb {
  const limpo = hex.trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(limpo)) {
    throw new Error(`Cor fora do formato #rrggbb: ${hex}`);
  }
  return [1, 3, 5].map((i) => parseInt(limpo.slice(i, i + 2), 16)) as Rgb;
}

function paraHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
}

/** Luminância relativa (WCAG), de 0 (preto) a 1 (branco). */
export function luminancia(hex: string): number {
  const [r, g, b] = paraRgb(hex).map((canal) => {
    const c = canal / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste, de 1 (iguais) a 21 (preto no branco). A ordem não importa. */
export function razaoContraste(a: string, b: string): number {
  const [clara, escura] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (clara + 0.05) / (escura + 0.05);
}

/**
 * A cor `frente` com opacidade `alfa` pintada sobre `fundo`, já misturada.
 * É o que o Tailwind faz em `bg-status-aprovado/10`.
 */
export function misturar(frente: string, fundo: string, alfa: number): string {
  const f = paraRgb(frente);
  const b = paraRgb(fundo);
  return paraHex([0, 1, 2].map((i) => f[i] * alfa + b[i] * (1 - alfa)) as Rgb);
}
