import { notFound, redirect } from "next/navigation";

import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";

/**
 * A aba Aplicações nasce no banco antes da tela (PR 1 de 2). Até a tela chegar,
 * o item do menu leva ao relatório de investimentos, que é a base dela, em vez
 * de uma página em branco.
 */
export default async function PaginaAplicacoes() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "financeiro.aplicacoes", "ver")) {
    notFound();
  }
  redirect("/financeiro/relatorios?rel=investimentos");
}
