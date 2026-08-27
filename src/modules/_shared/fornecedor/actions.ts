"use server";

import { logErroServidor } from "@/lib/erros";
import { createClient } from "@/lib/supabase/server";

type CriarResultado = { id: string } | { erro: string };

/** Fornecedor encontrado pelo nome, `null` se não existe, "erro" se a consulta falhou. */
type Achado = { id: string; ativo: boolean } | null | "erro";

/**
 * Procura um fornecedor por igualdade de nome numa coluna só. Devolve "erro" em
 * vez de `null` quando a consulta falha: tratar falha como "não existe" faria a
 * ação criar um fornecedor duplicado justamente quando o banco está com problema.
 */
async function acharPorNome(
  supabase: Awaited<ReturnType<typeof createClient>>,
  coluna: "razao_social" | "nome_fantasia",
  padrao: string,
): Promise<Achado> {
  const { data, error } = await supabase
    .from("fornecedores")
    .select("id, ativo")
    .ilike(coluna, padrao)
    .limit(1);

  if (error) {
    logErroServidor(`fornecedor.criarRapido.busca.${coluna}`, error);
    return "erro";
  }
  const linha = data?.[0];
  return linha ? { id: linha.id, ativo: linha.ativo } : null;
}

/**
 * Cria um fornecedor na hora, com o nome digitado no seletor do lançamento.
 *
 * Existe pelo mesmo motivo de `criarClienteRapido`: quem está lançando uma
 * despesa de um fornecedor que ainda não está cadastrado não deveria ter de
 * abandonar o formulário, ir a Cadastros e voltar. O cadastro nasce mínimo
 * (razão social e ativo) e se completa depois em Cadastros > Fornecedores —
 * CNPJ, endereço e contato não são obrigatórios para o lançamento existir.
 *
 * A permissão é a do CADASTRO, não a do Financeiro, e quem recusa é o banco: a
 * policy `fornecedores_insert` exige `cadastros.fornecedores / criar`. Quem não
 * tem continua escolhendo da lista, só não cria — e a mensagem do Postgres sobe
 * direto para o toast em vez de virar um erro genérico.
 */
export async function criarFornecedorRapido(
  nome: string,
): Promise<CriarResultado> {
  const limpo = (nome ?? "").trim();
  if (limpo.length < 2) return { erro: "Informe um nome válido" };
  if (limpo.length > 255) return { erro: "Use no máximo 255 caracteres" };

  const supabase = await createClient();

  /**
   * Não duplica: nome igual devolve o fornecedor que já existe.
   *
   * O nome vai ESCAPADO no ilike. `_` e `%` são curingas, e "Posto 100% Diesel"
   * casaria com qualquer coisa e devolveria o fornecedor errado — que num
   * lançamento significa atribuir a despesa a quem não vendeu nada.
   *
   * São duas consultas, e não um `.or(...)`, porque a lista do `or` do PostgREST
   * é separada por vírgula: um fornecedor chamado "Colorado, Ltda" quebraria o
   * filtro. Olha também o nome fantasia, porque é por ele que o seletor exibe
   * quem tem os dois (`nome_fantasia ?? razao_social`).
   *
   * A busca inclui INATIVO de propósito. Fornecedor inativo com o mesmo nome não
   * é caso de criar outro (viraria cadastro duplicado, e a base já tem 939) nem
   * de devolver o id (ele não aparece no seletor, que só lista ativo, e a tela
   * mostraria o UUID): é caso de mandar reativar.
   */
  const padrao = limpo.replace(/[\\%_]/g, (caractere) => `\\${caractere}`);
  const achado = await acharPorNome(supabase, "razao_social", padrao);
  const existente =
    achado ?? (await acharPorNome(supabase, "nome_fantasia", padrao));

  if (existente === "erro") {
    return { erro: "Não foi possível conferir se o fornecedor já existe" };
  }
  if (existente) {
    if (!existente.ativo) {
      return {
        erro: `"${limpo}" já existe como fornecedor inativo. Reative em Cadastros > Fornecedores.`,
      };
    }
    return { id: existente.id };
  }

  const { data, error } = await supabase
    .from("fornecedores")
    .insert({ razao_social: limpo, tipo: "pj", ativo: true })
    .select("id")
    .single();

  if (error || !data) {
    logErroServidor("fornecedor.criarRapido", error);
    return { erro: error?.message || "Não foi possível criar o fornecedor" };
  }

  return { id: data.id };
}
