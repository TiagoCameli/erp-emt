"use server";

import { logErroServidor } from "@/lib/erros";
import { createClient } from "@/lib/supabase/server";

type CriarResultado = { id: string } | { erro: string };

/** Cliente encontrado pelo nome, `null` se não existe, "erro" se a consulta falhou. */
type Achado = { id: string; ativo: boolean } | null | "erro";

/**
 * Procura um cliente por igualdade de nome numa coluna só. Devolve "erro" em vez
 * de `null` quando a consulta falha: tratar falha como "não existe" faria a ação
 * criar um cliente duplicado justamente quando o banco está com problema.
 */
async function acharPorNome(
  supabase: Awaited<ReturnType<typeof createClient>>,
  coluna: "nome" | "nome_fantasia",
  padrao: string,
): Promise<Achado> {
  const { data, error } = await supabase
    .from("clientes")
    .select("id, ativo")
    .ilike(coluna, padrao)
    .limit(1);

  if (error) {
    logErroServidor(`cliente.criarRapido.busca.${coluna}`, error);
    return "erro";
  }
  const linha = data?.[0];
  return linha ? { id: linha.id, ativo: linha.ativo } : null;
}

/**
 * Cria um cliente na hora, com o nome digitado no seletor do recebimento.
 *
 * Existe pelo mesmo motivo de `criarCondicaoPagamento`: quem está lançando um
 * recebimento de um pagador que ainda não está cadastrado não deveria ter de
 * abandonar o formulário, ir a Cadastros e voltar. O cadastro nasce mínimo (nome
 * e ativo) e se completa depois em Cadastros > Clientes.
 *
 * A permissão é a do CADASTRO, não a do Financeiro, e quem recusa é o banco: a
 * policy `clientes_insert` exige `cadastros.clientes / criar`. Quem não tem
 * continua escolhendo da lista, só não cria — e a mensagem do Postgres sobe
 * direto para o toast em vez de virar um erro genérico.
 */
export async function criarClienteRapido(
  nome: string,
): Promise<CriarResultado> {
  const limpo = (nome ?? "").trim();
  if (limpo.length < 2) return { erro: "Informe um nome válido" };
  if (limpo.length > 255) return { erro: "Use no máximo 255 caracteres" };

  const supabase = await createClient();

  /**
   * Não duplica: nome igual devolve o cliente que já existe.
   *
   * O nome vai ESCAPADO no ilike. `_` e `%` são curingas, e "Consórcio 100% Acre"
   * casaria com qualquer coisa e devolveria o cliente errado — que num recebimento
   * significa atribuir dinheiro a quem não pagou.
   *
   * São duas consultas, e não um `.or(...)`, porque a lista do `or` do PostgREST é
   * separada por vírgula: um cliente chamado "EMT, Ltda" quebraria o filtro. Olha
   * também o nome fantasia, porque é por ele que o seletor exibe quem tem os dois.
   *
   * A busca inclui INATIVO de propósito. Cliente inativo com o mesmo nome não é
   * caso de criar outro (viraria cadastro duplicado) nem de devolver o id (o banco
   * recusa recebimento de cliente inativo): é caso de mandar reativar.
   */
  const padrao = limpo.replace(/[\\%_]/g, (caractere) => `\\${caractere}`);
  const achado = await acharPorNome(supabase, "nome", padrao);
  const existente =
    achado ?? (await acharPorNome(supabase, "nome_fantasia", padrao));

  if (existente === "erro") {
    return { erro: "Não foi possível conferir se o cliente já existe" };
  }
  if (existente) {
    if (!existente.ativo) {
      return {
        erro: `"${limpo}" já existe como cliente inativo. Reative em Cadastros > Clientes.`,
      };
    }
    return { id: existente.id };
  }

  const { data, error } = await supabase
    .from("clientes")
    .insert({ nome: limpo, tipo: "pj", ativo: true })
    .select("id")
    .single();

  if (error || !data) {
    logErroServidor("cliente.criarRapido", error);
    return { erro: error?.message || "Não foi possível criar o cliente" };
  }

  return { id: data.id };
}
