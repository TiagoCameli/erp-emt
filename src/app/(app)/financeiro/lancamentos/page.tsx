import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { lerFiltrosLancamentos } from "@/modules/financeiro/lancamentos/filtros";
import { LancamentosAcoesCabecalho } from "@/modules/financeiro/lancamentos/components/lancamentos-acoes-cabecalho";
import { LancamentosTabela } from "@/modules/financeiro/lancamentos/components/lancamentos-tabela";
import {
  listarCategorias,
  listarCentrosCusto,
  listarCondicoesPagamento,
  listarFormasPagamento,
  listarFornecedores,
  listarLancamentos,
} from "@/modules/financeiro/lancamentos/queries";
import { listarContasBancarias } from "@/modules/financeiro/pagamentos/queries";

/**
 * A Server Action de exportar roda na função desta página, e exportar a base
 * inteira é ler milhares de linhas em páginas de mil e montar o .xlsx. Com o
 * teto padrão da Vercel (10 a 15s) isso morreria no meio, devolvendo erro de
 * timeout no lugar do arquivo. 60s é o máximo que vale em qualquer plano.
 */
export const maxDuration = 60;

export default async function PaginaLancamentos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "financeiro.lancamentos", "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, "financeiro.lancamentos", "criar");
  const podeExcluir = temPermissao(usuario, "financeiro.lancamentos", "excluir");

  // A leitura da URL mora em `filtros.ts`, e não aqui, porque a exportação para
  // Excel precisa interpretar os MESMOS parâmetros: dois lugares lendo a URL
  // divergiriam no primeiro filtro novo, e a planilha passaria a sair com um
  // conjunto diferente do que está na tela.
  const { filtros, valores, pagina, tamanho } = lerFiltrosLancamentos(
    await searchParams,
  );

  const [
    { itens, total },
    categorias,
    fornecedores,
    centrosCusto,
    formasPagamento,
    condicoesPagamento,
    contas,
  ] = await Promise.all([
    listarLancamentos({ ...filtros, pagina, tamanho }),
    listarCategorias(),
    listarFornecedores(),
    listarCentrosCusto(),
    listarFormasPagamento(),
    listarCondicoesPagamento(),
    listarContasBancarias(),
  ]);

  return (
    <>
      <PageHeader
        modulo="Financeiro"
        titulo="Lançamentos"
        descricao="Registre lançamentos a pagar e a receber, com parcelas e rateio por centro de custo"
        acoes={
          <LancamentosAcoesCabecalho
            podeCriar={podeCriar}
            categorias={categorias}
            fornecedores={fornecedores}
            centrosCusto={centrosCusto}
            formasPagamento={formasPagamento}
            condicoesPagamento={condicoesPagamento}
          />
        }
      />
      <LancamentosTabela
        podeExcluir={podeExcluir}
        lancamentos={itens}
        total={total}
        pagina={pagina}
        tamanho={tamanho}
        valores={valores}
        categorias={categorias}
        fornecedores={fornecedores}
        centrosCusto={centrosCusto}
        formasPagamento={formasPagamento}
        contas={contas}
      />
    </>
  );
}
