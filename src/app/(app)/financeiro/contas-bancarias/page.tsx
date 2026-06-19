import { notFound } from "next/navigation";

import { KPICard, MoneyText, PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { ContasAcoesCabecalho } from "@/modules/financeiro/contas-bancarias/components/contas-acoes-cabecalho";
import { ContasTabela } from "@/modules/financeiro/contas-bancarias/components/contas-tabela";
import { listarContas } from "@/modules/financeiro/contas-bancarias/queries";

export default async function PaginaContasBancarias() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "financeiro.contas-bancarias", "ver")) {
    notFound();
  }

  const contas = await listarContas();

  const podeCriar = temPermissao(usuario, "financeiro.contas-bancarias", "criar");
  const podeEditar = temPermissao(
    usuario,
    "financeiro.contas-bancarias",
    "editar",
  );

  // Total em contas: soma do saldo atual de todas as contas, em centavos para
  // não acumular erro de ponto flutuante. Inclui ativas e inativas, porque o
  // dinheiro parado numa conta desativada continua existindo.
  const totalCentavos = contas.reduce(
    (soma, conta) => soma + Math.round(conta.saldoAtual * 100),
    0,
  );
  const totalEmContas = totalCentavos / 100;

  return (
    <>
      <PageHeader
        titulo="Contas bancárias"
        descricao="Contas e caixas da empresa, com o saldo atualizado pelas parcelas pagas"
        acoes={<ContasAcoesCabecalho podeCriar={podeCriar} />}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KPICard
          titulo="Total em contas"
          valor={<MoneyText valor={totalEmContas} />}
          detalhe={`${contas.length} ${contas.length === 1 ? "conta" : "contas"} cadastradas`}
        />
      </div>

      <ContasTabela contas={contas} podeEditar={podeEditar} />
    </>
  );
}
