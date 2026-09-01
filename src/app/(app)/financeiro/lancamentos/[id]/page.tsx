import { notFound } from "next/navigation";

import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarCartoesAtivos } from "@/modules/cadastros/cartoes/queries";
import { listarAnexosDoDocumento } from "@/modules/_shared/anexos/queries";
import {
  listarContasBancarias,
  trilhaParcelasDoLancamento,
} from "@/modules/financeiro/pagamentos/queries";
import { LancamentoDetalheView } from "@/modules/financeiro/lancamentos/components/lancamento-detalhe";
import {
  buscarLancamento,
  listarCategorias,
  listarCentrosCusto,
  listarClientes,
  listarCondicoesPagamento,
  listarFormasPagamento,
  listarFornecedores,
  trilhaLancamento,
  trilhaRateioDoLancamento,
} from "@/modules/financeiro/lancamentos/queries";

export default async function PaginaLancamentoDetalhe({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "financeiro.lancamentos", "ver")) {
    notFound();
  }

  const { id } = await params;
  const lancamento = await buscarLancamento(id);
  if (!lancamento) notFound();

  const [
    trilhaDoDocumento,
    trilhaRateio,
    trilhaParcelas,
    categorias,
    fornecedores,
    clientes,
    centrosCusto,
    formasPagamento,
    cartoes,
    condicoesPagamento,
    anexos,
    contas,
  ] = await Promise.all([
    trilhaLancamento(id),
    trilhaRateioDoLancamento(id),
    trilhaParcelasDoLancamento(id),
    listarCategorias(),
    listarFornecedores(),
    listarClientes(),
    listarCentrosCusto(),
    listarFormasPagamento(),
    listarCartoesAtivos(),
    listarCondicoesPagamento(),
    listarAnexosDoDocumento("lancamento", id),
    listarContasBancarias(),
  ]);

  // Reclassificar custo entre obras é um evento do LANÇAMENTO, não da parcela:
  // entra na trilha do documento, em ordem com as edições de cabeçalho. Uma
  // terceira caixa na lateral separaria por origem de dado o que a pessoa lê
  // como uma história só.
  const trilha = [...trilhaDoDocumento, ...trilhaRateio].sort(
    (a, b) => new Date(b.data).getTime() - new Date(a.data).getTime(),
  );

  const podeEditar = temPermissao(usuario, "financeiro.lancamentos", "editar");
  const podeExcluir = temPermissao(
    usuario,
    "financeiro.lancamentos",
    "excluir",
  );

  return (
    <LancamentoDetalheView
      lancamento={lancamento}
      trilha={trilha}
      trilhaParcelas={trilhaParcelas}
      anexos={anexos}
      categorias={categorias}
      fornecedores={fornecedores}
      clientes={clientes}
      centrosCusto={centrosCusto}
      formasPagamento={formasPagamento}
      cartoes={cartoes}
      condicoesPagamento={condicoesPagamento}
      contas={contas}
      podeEditar={podeEditar}
      podeExcluir={podeExcluir}
    />
  );
}
