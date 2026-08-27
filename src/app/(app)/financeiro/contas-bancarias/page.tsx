import { notFound } from "next/navigation";

import { GradeKpis, KPICard, MoneyText, PageHeader } from "@/components/canonicos";
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

  /**
   * Total em contas: soma do saldo atual, em centavos para não acumular erro de
   * ponto flutuante. Inclui ativas e inativas, porque o dinheiro parado numa
   * conta desativada continua existindo.
   *
   * SOMA SÓ AS CONTAS CUJO SALDO O USUÁRIO PODE VER, e isso não é delicadeza de
   * UI: é o que fecha o vazamento. Somar todas e mostrar o total permitiria a
   * quem vê 4 de 5 contas subtrair as 4 e descobrir o saldo da quinta — a conta
   * escondida sairia por aritmética. O cartão diz de quantas contas ele fala,
   * senão o número parece "todo o dinheiro da empresa" quando não é.
   */
  const visiveis = contas.filter((conta) => conta.podeVerSaldo);
  const totalCentavos = visiveis.reduce(
    (soma, conta) => soma + Math.round((conta.saldoAtual ?? 0) * 100),
    0,
  );
  const totalEmContas = totalCentavos / 100;
  const todasVisiveis = visiveis.length === contas.length;

  return (
    <>
      <PageHeader
        modulo="Financeiro"
        titulo="Contas bancárias"
        descricao="Contas e caixas da empresa, com o saldo atualizado pelas parcelas pagas. Clique numa conta para ver o extrato dela."
        acoes={<ContasAcoesCabecalho podeCriar={podeCriar} />}
      />

      <GradeKpis className="mb-4">
        {visiveis.length === 0 ? (
          // Sem nenhuma conta liberada, um cartão com R$ 0,00 seria mentira:
          // pareceria empresa sem dinheiro em vez de usuário sem permissão.
          <KPICard
            titulo="Total em contas"
            valor="—"
            detalhe={`Você não tem permissão de ver o saldo das ${contas.length} contas cadastradas`}
          />
        ) : (
          <KPICard
            titulo="Total em contas"
            valor={<MoneyText valor={totalEmContas} />}
            detalhe={
              todasVisiveis
                ? `${contas.length} ${contas.length === 1 ? "conta" : "contas"} cadastradas`
                : `${visiveis.length} de ${contas.length} contas — nas outras você não vê o saldo`
            }
          />
        )}
      </GradeKpis>

      <ContasTabela contas={contas} podeEditar={podeEditar} />
    </>
  );
}
