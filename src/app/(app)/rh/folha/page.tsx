import { notFound } from "next/navigation";

import {
  GradeKpis,
  KPICard,
  MoneyText,
  PageHeader,
} from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { formatarCompetencia } from "@/modules/rh/_shared/formato";
import { FolhaAcoesCabecalho } from "@/modules/rh/folha/components/folha-acoes-cabecalho";
import { FolhasTabela } from "@/modules/rh/folha/components/folhas-tabela";
import { listarFolhas } from "@/modules/rh/folha/queries";

export default async function PaginaFolha() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "rh.folha", "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, "rh.folha", "criar");

  const folhas = await listarFolhas();

  // A lista vem ordenada por competência decrescente, então a primeira é a mais
  // recente. O ano do acumulado sai dela, e não do relógio: o servidor roda em
  // UTC e a virada do ano mudaria o cartão antes da hora em Rio Branco.
  const ultima = folhas[0];
  const ano = ultima ? ultima.competencia.slice(0, 4) : "";
  const custoAno = folhas
    .filter((folha) => folha.competencia.startsWith(ano))
    .reduce((soma, folha) => soma + folha.custoTotal, 0);
  const emRascunho = folhas.filter(
    (folha) => folha.status === "rascunho",
  ).length;

  return (
    <>
      <PageHeader
        modulo="RH"
        titulo="Folha gerencial"
        descricao="Folha mensal de gestão: consolida ponto, adiantamentos e encargos por colaborador, com custo alocado por centro de custo. Não é a folha oficial."
        acoes={podeCriar ? <FolhaAcoesCabecalho /> : undefined}
      />
      {/* Sem folha gerada não há número para mostrar: o estado vazio da tabela
          já explica o que fazer, e cartão zerado só ocupa espaço. */}
      {ultima ? (
        <GradeKpis className="mb-4">
          <KPICard
            titulo="Custo da última folha"
            valor={<MoneyText valor={ultima.custoTotal} />}
            detalhe={`Competência ${formatarCompetencia(ultima.competencia)} · ${ultima.totalItens} ${ultima.totalItens === 1 ? "colaborador" : "colaboradores"}`}
            href={`/rh/folha/${ultima.id}`}
          />
          <KPICard
            titulo={`Custo acumulado em ${ano}`}
            valor={<MoneyText valor={custoAno} />}
            detalhe="Soma do custo total das folhas do ano"
          />
          <KPICard
            titulo="Folhas em rascunho"
            valor={emRascunho}
            detalhe="Ainda podem ser regeradas ou enviadas para aprovação"
          />
        </GradeKpis>
      ) : null}

      <FolhasTabela folhas={folhas} podeCriar={podeCriar} />
    </>
  );
}
