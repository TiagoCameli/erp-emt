import "server-only";

import { createClient } from "@/lib/supabase/server";

/** Linha da listagem de cartões de crédito. */
export interface CartaoLista {
  id: string;
  nome: string;
  ultimosDigitos: string;
  bandeira: string | null;
  banco: string | null;
  diaFechamento: number | null;
  diaVencimento: number | null;
  ativo: boolean;
  /** Em quantos blocos de pagamento este cartão aparece (ordens + lançamentos). */
  usoEmDocumentos: number;
}

/** Opção de cartão para o seletor da OC e do lançamento. */
export interface CartaoOpcao {
  id: string;
  nome: string;
  ultimosDigitos: string;
}

/**
 * Cartões com a contagem de uso. O catálogo é pequeno (uma mão de cartões),
 * então lista tudo sem paginação, ativos e inativos, para desativar e reativar
 * na mesma tela — igual ao de formas de pagamento.
 */
export async function listarCartoes(): Promise<CartaoLista[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("cartoes_credito")
    .select(
      "id, nome, ultimos_digitos, bandeira, banco, dia_fechamento, dia_vencimento, ativo",
    )
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar os cartões de crédito");
  }

  const linhas = data ?? [];
  if (linhas.length === 0) return [];

  // Duas consultas de contagem em vez de um join: `oc_formas` e
  // `lancamento_formas` são tabelas diferentes e o total que interessa na tela é
  // a soma delas ("este cartão está em uso em algum documento?").
  const [ordens, lancamentos] = await Promise.all([
    supabase.from("oc_formas").select("cartao_id").not("cartao_id", "is", null),
    supabase
      .from("lancamento_formas")
      .select("cartao_id")
      .not("cartao_id", "is", null),
  ]);

  const contagem = new Map<string, number>();
  for (const linha of [...(ordens.data ?? []), ...(lancamentos.data ?? [])]) {
    if (!linha.cartao_id) continue;
    contagem.set(linha.cartao_id, (contagem.get(linha.cartao_id) ?? 0) + 1);
  }

  return linhas.map((cartao) => ({
    id: cartao.id,
    nome: cartao.nome,
    ultimosDigitos: cartao.ultimos_digitos,
    bandeira: cartao.bandeira,
    banco: cartao.banco,
    diaFechamento: cartao.dia_fechamento,
    diaVencimento: cartao.dia_vencimento,
    ativo: cartao.ativo,
    usoEmDocumentos: contagem.get(cartao.id) ?? 0,
  }));
}

/**
 * Cartões ATIVOS para o seletor da OC e do lançamento.
 *
 * Só os ativos: inativar existe para tirar da lista de escolha. O documento
 * antigo continua mostrando o cartão inativo dele, porque o nome vem resolvido
 * junto com o documento e não desta lista — mesma saída do fornecedor e da
 * condição de pagamento inativados.
 */
export async function listarCartoesAtivos(): Promise<CartaoOpcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("cartoes_credito")
    .select("id, nome, ultimos_digitos")
    .eq("ativo", true)
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar os cartões de crédito");
  }

  return (data ?? []).map((cartao) => ({
    id: cartao.id,
    nome: cartao.nome,
    ultimosDigitos: cartao.ultimos_digitos,
  }));
}
