/**
 * Rateio da diária entre obras por percentual (17/10/2026). Puro, sem
 * 'use server': usado pelo formulário (prévia) e pelo schema do servidor.
 *
 * O banco é quem grava e divide (`fn_diaria_gravar_rateio`,
 * `fn_diaria_valor_por_centro`); aqui é a MESMA conta para a tela mostrar o
 * que vai sair: divide antes de arredondar, e o centavo que sobra vai para a
 * linha de maior percentual (empate: menor id, como o `order by` do banco).
 */

/** Percentual é taxa: até 4 casas (7/11 = 63,6364%). */
export const CASAS_PERCENTUAL = 4;
const ESCALA = 10 ** CASAS_PERCENTUAL;

export interface LinhaRateio {
  centroCustoId: string;
  percentual: number;
}

/** Percentual em unidades inteiras de 0,0001%, ou NaN se não couber em 4 casas. */
function emUnidades(percentual: number): number {
  const unidades = Math.round(percentual * ESCALA);
  return Math.abs(unidades - percentual * ESCALA) < 1e-6 ? unidades : Number.NaN;
}

/** Percentual válido: maior que zero, até 100, até 4 casas. */
export function percentualValido(percentual: number): boolean {
  return (
    Number.isFinite(percentual) &&
    percentual > 0 &&
    percentual <= 100 &&
    Number.isFinite(emUnidades(percentual))
  );
}

/** Soma dos percentuais sem erro de ponto flutuante (33,3334 + 2 × 33,3333 = 100). */
export function somaPercentual(linhas: readonly { percentual: number }[]): number {
  return linhas.reduce((s, l) => s + emUnidades(l.percentual), 0) / ESCALA;
}

/** Erro do rateio para mostrar ao usuário, ou null se está certo. */
export function erroDoRateio(linhas: readonly LinhaRateio[]): string | null {
  if (linhas.length === 0) return "Escolha a obra da diária";
  if (linhas.some((l) => !l.centroCustoId)) return "Escolha a obra de cada linha";
  if (linhas.some((l) => !percentualValido(l.percentual))) {
    return "Percentual maior que zero, até 100 e com até 4 casas";
  }
  if (new Set(linhas.map((l) => l.centroCustoId)).size !== linhas.length) {
    return "A mesma obra aparece em duas linhas";
  }
  const soma = somaPercentual(linhas);
  if (soma !== 100) {
    return `O rateio tem que somar 100% (está somando ${formatarPercentual(soma)})`;
  }
  return null;
}

/**
 * Valor em reais de cada linha, na ordem recebida. Só faz sentido com o rateio
 * válido (soma 100); com soma errada devolve as fatias sem o ajuste do centavo.
 */
export function dividirValor(
  valor: number,
  linhas: readonly LinhaRateio[],
): number[] {
  const centavos = Math.round(valor * 100);
  // Divide antes de arredondar: tudo dentro do round.
  const brutos = linhas.map((l) =>
    Math.round((centavos * emUnidades(l.percentual)) / (100 * ESCALA)),
  );
  if (linhas.length > 0 && somaPercentual(linhas) === 100) {
    let maior = 0;
    linhas.forEach((l, i) => {
      const m = linhas[maior]!;
      if (
        l.percentual > m.percentual ||
        (l.percentual === m.percentual && l.centroCustoId < m.centroCustoId)
      ) {
        maior = i;
      }
    });
    const soma = brutos.reduce((s, b) => s + b, 0);
    brutos[maior] = brutos[maior]! + (centavos - soma);
  }
  return brutos.map((b) => b / 100);
}

/** 63,6364% / 100% / 33,5%: vírgula, sem zeros à direita. */
export function formatarPercentual(percentual: number): string {
  return `${percentual.toLocaleString("pt-BR", {
    maximumFractionDigits: CASAS_PERCENTUAL,
  })}%`;
}
