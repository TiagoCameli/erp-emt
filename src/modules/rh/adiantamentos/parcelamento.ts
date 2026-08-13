/** Teto de parcelas, validado nas três camadas. Arbitrário, contra digitação absurda. */
export const MAX_PARCELAS = 60;

/**
 * Divide um total em N parcelas iguais de 2 casas, com a sobra de centavos na
 * primeira. A soma das parcelas é sempre exatamente o total: a conta é feita em
 * centavos inteiros justamente para não acumular erro de ponto flutuante.
 *
 * O servidor recalcula esta divisão na hora de gravar. A prévia na tela é
 * informativa e nunca é fonte de verdade.
 */
export function dividirEmParcelas(total: number, quantidade: number): number[] {
  const totalCentavos = Math.round(total * 100);
  const base = Math.floor(totalCentavos / quantidade);
  const sobra = totalCentavos - base * quantidade;

  return Array.from(
    { length: quantidade },
    (_, indice) => (base + (indice === 0 ? sobra : 0)) / 100,
  );
}

/** Quantidade de parcelas cabe no total sem gerar parcela de zero centavo. */
export function quantidadeCabeNoTotal(
  total: number,
  quantidade: number,
): boolean {
  return quantidade >= 1 && quantidade <= Math.round(total * 100);
}

/** Uma parcela da prévia: competência (yyyy-MM) e o valor dela. */
export interface ParcelaPrevia {
  competencia: string;
  valor: number;
}

/**
 * Prévia informativa do plano de parcelas: mesma divisão de
 * `dividirEmParcelas`, uma parcela por mês consecutivo a partir da
 * competência informada (yyyy-MM). Entrada inválida (total <= 0 ou quantidade
 * não inteira/menor que 1) devolve lista vazia, para a tela não quebrar
 * enquanto o usuário ainda está digitando.
 *
 * O servidor RECALCULA esta divisão na hora de gravar, com a mesma função e
 * os mesmos centavos. Esta prévia é só informativa; nunca é fonte de verdade.
 * Meses em UTC de propósito, mesmo padrão de `vencimentoFolha` em
 * `rh/folha/vencimento.ts`: competência é data civil (yyyy-MM), sem hora, e
 * fuso não entra na conta.
 */
export function montarPrevia(
  total: number,
  quantidade: number,
  competenciaInicial: string,
): ParcelaPrevia[] {
  if (!Number.isFinite(total) || total <= 0) return [];
  if (!Number.isInteger(quantidade) || quantidade < 1) return [];

  const [ano, mes] = competenciaInicial.split("-").map(Number);
  if (!Number.isFinite(ano) || !Number.isFinite(mes)) return [];

  return dividirEmParcelas(total, quantidade).map((valor, indice) => {
    const data = new Date(Date.UTC(ano, mes - 1 + indice, 1));
    const competencia = `${data.getUTCFullYear()}-${String(
      data.getUTCMonth() + 1,
    ).padStart(2, "0")}`;
    return { competencia, valor };
  });
}

/** Uma parcela mínima para agregar plano e saldo (o que `listarAdiantamentos` lê da tabela). */
export interface ParcelaAgregavel {
  valorPrevisto: number;
  valorDescontado: number;
  /** Folha que descontou (fechou) a parcela, ou null se ainda está aberta. */
  folhaId: string | null;
}

/** Resumo agregado do plano de parcelas de um adiantamento. */
export interface ResumoAdiantamento {
  /** Quantidade de linhas do plano hoje (cresce com sobra; não é a escolha original do usuário). */
  parcelasTotal: number;
  /** Quantas já foram processadas por uma folha (`folhaId` preenchido), descontando ou não (ver o comentário abaixo). */
  parcelasDescontadas: number;
  /** valor concedido - soma(valor_descontado). NUNCA soma(valor_previsto) de todas: uma parcela descontada pela metade mantém o previsto cheio, e essa soma superconta. */
  saldo: number;
  /** soma(valor_descontado) + soma(valor_previsto das parcelas ABERTAS). Em todo estado estável, é igual ao valor concedido (é a invariante do plano, documentada no `comment on function` da `fn_gerar_folha`). */
  totalPlano: number;
}

/**
 * Agrega o plano de parcelas de UM adiantamento a partir das linhas já lidas
 * (mesma consulta que trouxe o adiantamento, via embed): função pura, sem
 * Supabase, para a listagem não precisar de uma leitura por conta a somar.
 *
 * A invariante correta (e a errada está espalhada em specs anteriores): o
 * saldo é `valor concedido - soma(valor_descontado)`, nunca
 * `soma(valor_previsto)` de todas as parcelas — uma parcela descontada pela
 * metade mantém o `valor_previsto` cheio (o resto vira uma parcela nova em
 * outra competência), então somar todos os previstos SUPERCONTA a dívida.
 *
 * `parcelasDescontadas` conta `folhaId !== null` (processada por uma folha),
 * não `valorDescontado > 0`: uma parcela pode ser processada e descontar
 * zero (quando não coube nem centavo naquele mês), e ela É diferente de uma
 * parcela ainda aberta. Quem precisa distinguir os dois estados na tela usa
 * `folhaId` e `valorDescontado` de cada parcela, não só esta contagem.
 *
 * Cálculo em centavos inteiros (mesmo motivo de `dividirEmParcelas`): evita
 * erro de ponto flutuante ao somar até 60 parcelas.
 */
export function resumirParcelas(
  valorConcedido: number,
  parcelas: ParcelaAgregavel[],
): ResumoAdiantamento {
  const centavos = (valor: number) => Math.round(valor * 100);

  let descontadoCent = 0;
  let previstoAbertoCent = 0;
  let parcelasDescontadas = 0;

  for (const parcela of parcelas) {
    descontadoCent += centavos(parcela.valorDescontado);
    if (parcela.folhaId !== null) {
      parcelasDescontadas += 1;
    } else {
      previstoAbertoCent += centavos(parcela.valorPrevisto);
    }
  }

  return {
    parcelasTotal: parcelas.length,
    parcelasDescontadas,
    saldo: (centavos(valorConcedido) - descontadoCent) / 100,
    totalPlano: (descontadoCent + previstoAbertoCent) / 100,
  };
}
