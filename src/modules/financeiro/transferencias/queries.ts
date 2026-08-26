import "server-only";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import {
  movimentoPorContaEmCentavos,
  saldoAtualDaConta,
} from "@/modules/financeiro/contas-bancarias/saldo";

/** Uma transferência da listagem, com o nome das duas contas resolvido. */
export interface TransferenciaLista {
  id: string;
  numero: string;
  dataTransferencia: string;
  contaOrigemId: string;
  contaOrigemNome: string;
  contaDestinoId: string;
  contaDestinoNome: string;
  valor: number;
  tarifa: number;
  /** valor + tarifa: o que a conta de origem perdeu de fato. */
  totalSaida: number;
  descricao: string | null;
  observacoes: string | null;
  /**
   * Quando a transferência foi REGISTRADA no sistema, que não é quando ela
   * aconteceu no banco (`dataTransferencia`). Serve ao filtro "Período de
   * criação": quem lançou dez transferências hoje precisa achar as dez, e a data
   * da transferência delas pode ser de meses atrás.
   */
  criadoEm: string;
}

/** Conta bancária ativa, para os dois seletores do formulário. */
export interface ContaOpcao {
  id: string;
  nome: string;
  banco: string;
  /** Saldo atual, para o formulário mostrar de quanto a conta dispõe. */
  saldoAtual: number;
}

/**
 * NUMERIC chega do PostgREST como string em algumas rotas e como número em
 * outras. Converter aqui, num lugar só, evita `"1234.56" - 10` virar NaN na
 * tela sem nenhum erro no console.
 */
function paraReais(valor: number | string | null): number {
  if (valor === null) return 0;
  const numero = typeof valor === "string" ? Number(valor) : valor;
  return Number.isFinite(numero) ? numero : 0;
}

/**
 * Lista todas as transferências, da mais recente para a mais antiga.
 *
 * Usa `todasAsLinhas` e não uma consulta solta: o PostgREST corta em 1.000
 * linhas sem erro nenhum, e a carga histórica do Mais Controle (dez/2024 em
 * diante) passa disso. Uma listagem que some as transferências mais antigas em
 * silêncio é pior que uma que demora.
 *
 * O desempate por `id` no fim do ORDER BY não é enfeite: várias transferências
 * caem no mesmo dia, e sem desempate a paginação repete uma linha numa página e
 * perde outra na seguinte.
 */
export async function listarTransferencias(): Promise<TransferenciaLista[]> {
  const supabase = await createClient();

  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .from("transferencias_contas")
      .select(
        `id, numero, data_transferencia, valor, tarifa, descricao, observacoes,
         created_at, conta_origem_id, conta_destino_id,
         origem:contas_bancarias!transferencias_contas_conta_origem_id_fkey(nome),
         destino:contas_bancarias!transferencias_contas_conta_destino_id_fkey(nome)`,
      )
      .order("data_transferencia", { ascending: false })
      .order("id")
      .range(de, ate),
  );

  // Erro no meio da paginação devolve o que já veio: mostrar meia lista de
  // dinheiro como se fosse a lista inteira é pior que não mostrar nada.
  if (erro) {
    throw new Error("Não foi possível carregar as transferências");
  }

  return linhas.map((linha) => {
    const valor = paraReais(linha.valor);
    const tarifa = paraReais(linha.tarifa);
    return {
      id: linha.id,
      numero: linha.numero,
      dataTransferencia: linha.data_transferencia,
      contaOrigemId: linha.conta_origem_id,
      contaOrigemNome: linha.origem?.nome ?? "-",
      contaDestinoId: linha.conta_destino_id,
      contaDestinoNome: linha.destino?.nome ?? "-",
      valor,
      tarifa,
      totalSaida: valor + tarifa,
      descricao: linha.descricao,
      observacoes: linha.observacoes,
      criadoEm: linha.created_at,
    };
  });
}

/**
 * Contas ativas com o saldo atual, para os seletores de origem e destino.
 *
 * O saldo vem do mesmo caminho da aba Contas bancárias (`fn_rel_posicao_bancaria`
 * + `saldoAtualDaConta`), de propósito: se esta tela calculasse por conta
 * própria, o número ao lado do nome da conta poderia discordar do que a outra
 * tela mostra para a mesma conta no mesmo instante.
 */
export async function listarContasAtivas(): Promise<ContaOpcao[]> {
  const supabase = await createClient();

  const [contas, movimentos] = await Promise.all([
    supabase
      .from("contas_bancarias")
      .select("id, nome, banco, saldo_inicial")
      .eq("ativo", true)
      .order("nome"),
    supabase.rpc("fn_rel_posicao_bancaria"),
  ]);

  if (contas.error) {
    throw new Error("Não foi possível carregar as contas bancárias");
  }
  if (movimentos.error) {
    throw new Error("Não foi possível carregar o saldo das contas");
  }

  const movimento = movimentoPorContaEmCentavos(
    (movimentos.data ?? []).map((linha) => ({
      contaBancariaId: linha.conta_bancaria_id,
      tipo: linha.tipo,
      total: linha.total,
    })),
  );

  return (contas.data ?? []).map((conta) => ({
    id: conta.id,
    nome: conta.nome,
    banco: conta.banco,
    saldoAtual: saldoAtualDaConta(
      conta.saldo_inicial,
      movimento.get(conta.id) ?? 0,
    ),
  }));
}
