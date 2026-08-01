import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Nomes de tamanho de fonte do design system (os `--text-*` do globals.css).
 *
 * Precisam ser declarados aqui porque o tailwind-merge não lê o tema: sem esta
 * lista ele classifica `text-detalhe` como COR, e aí `cn("text-detalhe",
 * "text-muted-foreground")` descartava o TAMANHO e deixava só a cor. O texto caía
 * no tamanho herdado, sem erro nenhum, em todo lugar do app que combina tamanho e
 * cor no mesmo `cn`: era por isso que o cabeçalho das tabelas saía em 14px ao lado
 * de células de 13px.
 *
 * Quem criar um `--text-novo` no tema precisa acrescentar o nome aqui, senão o
 * tamanho novo some do mesmo jeito silencioso.
 */
const TAMANHOS_DE_FONTE = [
  "titulo",
  "secao",
  "corpo",
  "detalhe",
  "legenda",
] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: [...TAMANHOS_DE_FONTE] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
