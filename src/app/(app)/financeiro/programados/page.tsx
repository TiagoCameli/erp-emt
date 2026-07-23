import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { dataHojeISO } from "@/lib/formatadores";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarContasBancarias } from "@/modules/financeiro/pagamentos/queries";
import { resumoProgramados } from "@/modules/financeiro/programados/calculo";
import { ProgramadosTabela } from "@/modules/financeiro/programados/components/programados-tabela";
import { listarProgramados } from "@/modules/financeiro/programados/queries";

/**
 * Aba Programados: fila de pagamento programado (parcelas aprovadas, ainda
 * não pagas), com KPIs de atrasado/hoje/próximos 7 dias e ações de pagar e
 * programar/reprogramar a data. `podePagar` usa a permissão real do fluxo
 * de pagamento (financeiro.pagamentos:criar), reusado aqui.
 */
export default async function PaginaProgramados() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "financeiro.programados", "ver")) {
    notFound();
  }

  const podeEditar = temPermissao(usuario, "financeiro.programados", "editar");
  const podePagar = temPermissao(usuario, "financeiro.pagamentos", "criar");

  const [parcelas, contas] = await Promise.all([
    listarProgramados(),
    listarContasBancarias(),
  ]);

  const hoje = dataHojeISO();
  const resumo = resumoProgramados(parcelas, hoje);

  return (
    <>
      <PageHeader
        titulo="Programados"
        descricao="Agenda de pagamentos aprovados: acompanhe os prazos e reprograme datas"
      />
      <ProgramadosTabela
        parcelas={parcelas}
        resumo={resumo}
        hoje={hoje}
        contas={contas}
        podeEditar={podeEditar}
        podePagar={podePagar}
      />
    </>
  );
}
