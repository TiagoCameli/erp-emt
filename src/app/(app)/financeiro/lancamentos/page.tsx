import { Suspense } from "react";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { lerFiltrosLancamentos } from "@/modules/financeiro/lancamentos/filtros";
import { rotuloRecorte as rotuloRecorte_ } from "@/modules/financeiro/lancamentos/recorte";
import { LancamentosAcoesCabecalho } from "@/modules/financeiro/lancamentos/components/lancamentos-acoes-cabecalho";
import { LancamentosTabela } from "@/modules/financeiro/lancamentos/components/lancamentos-tabela";
import {
  ResumoLancamentosCartoes,
  SkeletonResumoLancamentos,
} from "@/modules/financeiro/lancamentos/components/resumo-lancamentos-cartoes";
import {
  listarCategorias,
  listarCentrosCusto,
  listarClientes,
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
    clientes,
    centrosCusto,
    formasPagamento,
    condicoesPagamento,
    contas,
  ] = await Promise.all([
    listarLancamentos({ ...filtros, pagina, tamanho }),
    listarCategorias(),
    listarFornecedores(),
    listarClientes(),
    listarCentrosCusto(),
    listarFormasPagamento(),
    listarCondicoesPagamento(),
    listarContasBancarias(),
  ]);

  /**
   * Rótulo da fatia recortada, para a coluna da tabela e o cartão do resumo.
   *
   * Montado aqui porque é aqui que os NOMES existem: o centro de custo já veio em
   * `centrosCusto`, e resolver isso dentro da tabela (client) exigiria uma segunda
   * leitura do banco no navegador. Precedência igual à de `escolherValorRecorte`:
   * o centro ganha do recorte de parcela.
   */
  // Com vários centros escolhidos a coluna soma o rateio de TODOS eles, então o
  // rótulo conta quantos em vez de nomear um: nomear o primeiro faria a coluna
  // parecer ser só dele, e o número embaixo é dinheiro.
  const centrosEscolhidos = filtros.centroCustoIds ?? [];
  const rotuloRecorte =
    centrosEscolhidos.length === 1
      ? `No centro ${
          centrosCusto.find((centro) => centro.id === centrosEscolhidos[0])
            ?.nome ?? "de custo"
        }`
      : centrosEscolhidos.length > 1
        ? `Nos ${centrosEscolhidos.length} centros escolhidos`
        : filtros.recorte
          ? rotuloRecorte_(filtros.recorte)
          : null;

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
            clientes={clientes}
            contas={contas}
            centrosCusto={centrosCusto}
            formasPagamento={formasPagamento}
            condicoesPagamento={condicoesPagamento}
          />
        }
      />
      {/*
        Os cartões somam o filtro INTEIRO, o que são milhares de linhas. Em
        Suspense para a tabela aparecer na hora e os números chegarem em seguida,
        no lugar de uma tela em branco esperando as duas coisas. A `key` refaz o
        boundary quando o filtro muda: sem ela, o React reaproveita o resultado
        antigo e os cartões ficariam mostrando o total do filtro anterior.
      */}
      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<SkeletonResumoLancamentos />}
      >
        <ResumoLancamentosCartoes
          filtros={filtros}
          rotuloRecorte={rotuloRecorte}
        />
      </Suspense>

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
        rotuloRecorte={rotuloRecorte}
      />
    </>
  );
}
