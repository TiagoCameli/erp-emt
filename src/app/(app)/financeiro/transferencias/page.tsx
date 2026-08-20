import { notFound } from "next/navigation";

import {
  GradeKpis,
  KPICard,
  MoneyText,
  PageHeader,
} from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { TransferenciasAcoesCabecalho } from "@/modules/financeiro/transferencias/components/transferencias-acoes-cabecalho";
import { TransferenciasTabela } from "@/modules/financeiro/transferencias/components/transferencias-tabela";
import {
  listarContasAtivas,
  listarTransferencias,
} from "@/modules/financeiro/transferencias/queries";

const RECURSO = "financeiro.transferencias" as const;

/** Mês corrente em America/Rio_Branco, no formato AAAA-MM. */
function mesCorrente(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Rio_Branco",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

export default async function PaginaTransferencias() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) {
    notFound();
  }

  const [transferencias, contas] = await Promise.all([
    listarTransferencias(),
    listarContasAtivas(),
  ]);

  const mes = mesCorrente();
  const doMes = transferencias.filter((linha) =>
    linha.dataTransferencia.startsWith(mes),
  );

  // Centavos inteiros nas duas somas: o KPI e a coluna da tabela têm que
  // fechar no centavo, e reais em ponto flutuante não fecham.
  const totalDoMesCentavos = doMes.reduce(
    (soma, linha) => soma + Math.round(linha.valor * 100),
    0,
  );
  const totalGeralCentavos = transferencias.reduce(
    (soma, linha) => soma + Math.round(linha.valor * 100),
    0,
  );
  const tarifasCentavos = transferencias.reduce(
    (soma, linha) => soma + Math.round(linha.tarifa * 100),
    0,
  );

  return (
    <>
      <PageHeader
        modulo="Financeiro"
        titulo="Transferências"
        descricao="Dinheiro movido entre as contas da empresa. Muda o saldo das contas, não o resultado"
        acoes={
          <TransferenciasAcoesCabecalho
            podeCriar={temPermissao(usuario, RECURSO, "criar")}
            contas={contas}
          />
        }
      />

      <GradeKpis className="mb-4">
        <KPICard
          titulo="Transferido no mês"
          valor={<MoneyText valor={totalDoMesCentavos / 100} />}
          detalhe={`${doMes.length} ${doMes.length === 1 ? "transferência" : "transferências"} neste mês`}
        />
        <KPICard
          titulo="Total registrado"
          valor={<MoneyText valor={totalGeralCentavos / 100} />}
          detalhe={`${transferencias.length} ${transferencias.length === 1 ? "transferência" : "transferências"} no histórico`}
        />
        <KPICard
          titulo="Tarifas pagas"
          valor={<MoneyText valor={tarifasCentavos / 100} />}
          detalhe="Sai da conta de origem, fora do DRE"
        />
      </GradeKpis>

      <TransferenciasTabela
        transferencias={transferencias}
        contas={contas}
        podeEditar={temPermissao(usuario, RECURSO, "editar")}
        podeExcluir={temPermissao(usuario, RECURSO, "excluir")}
      />
    </>
  );
}
