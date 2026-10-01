"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { ClipboardList } from "lucide-react";

import { CelulaVazia, DataTable, MoneyText, PageHeader, SecaoDetalhe, StatusBadge, Trilha } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { formatarData } from "@/lib/formatadores";
import { periodoMedicao } from "@/modules/medicao/boletim/formato";
import { SeloMedicao } from "@/modules/medicao/_shared/selo-medicao";
import { ROTULO_FASE_REVISAO, rotuloRevisao, rotuloStatusRevisao, type FaseRevisao } from "@/modules/medicao/_shared/rotulos";
import type { PassoCiclo } from "@/modules/medicao/medicoes/ciclo";
import { AcoesCiclo } from "@/modules/medicao/medicoes/components/acoes-ciclo";
import { ItensMedicao } from "@/modules/medicao/medicoes/components/itens-medicao";
import { eventoMedicaoParaTrilha } from "@/modules/medicao/medicoes/eventos";
import type { MedicaoDetalhe as MedicaoDetalheDados, RevisaoMedicao } from "@/modules/medicao/medicoes/tipos";

/** Cor do selo da revisão: aprovada verde, enviada pendente, em aberto rascunho, substituída apagada. */
const COR_REVISAO: Record<string, string> = {
  em_aberto: "rascunho",
  enviada: "pendente_aprovacao",
  aprovada: "aprovado",
  substituida: "cancelado",
};

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-legenda text-muted-foreground">{rotulo}</span>
      <span className="text-detalhe">{children}</span>
    </div>
  );
}

const rotuloFase = (fase: string) => (fase in ROTULO_FASE_REVISAO ? ROTULO_FASE_REVISAO[fase as FaseRevisao] : fase);

const colunasRevisoes: ColumnDef<RevisaoMedicao, unknown>[] = [
  {
    accessorKey: "numero",
    header: "Revisão",
    size: 100,
    meta: { fixa: true, atomico: true },
    cell: ({ row }) => <span className="font-mono">{rotuloRevisao(row.original.numero)}</span>,
  },
  {
    accessorKey: "fase",
    header: "Fase",
    size: 160,
    cell: ({ row }) => rotuloFase(row.original.fase),
  },
  {
    accessorKey: "status",
    header: "Status",
    size: 140,
    cell: ({ row }) => (
      <StatusBadge status={COR_REVISAO[row.original.status] ?? row.original.status} rotulo={rotuloStatusRevisao(row.original.status)} />
    ),
  },
  {
    accessorKey: "motivo",
    header: "Motivo",
    size: 320,
    cell: ({ row }) => row.original.motivo ?? <CelulaVazia />,
  },
  {
    accessorKey: "criadoEm",
    header: "Aberta em",
    size: 120,
    meta: { atomico: true },
    cell: ({ row }) => <span className="tabular-nums">{formatarData(row.original.criadoEm)}</span>,
  },
];

function idRevisao(r: RevisaoMedicao): string {
  return r.id;
}

export interface MedicaoDetalheProps {
  medicao: MedicaoDetalheDados;
  /** Passos do ciclo liberados (status e permissões), calculados no servidor. */
  passos: PassoCiclo[];
  /** `medicao.lancamentos/ver`, lido no servidor: sem ela o botão de lançamentos não aparece. */
  podeVerLancamentos: boolean;
  /** Botão de aprovar da Task 4; repassado para `AcoesCiclo`. */
  botaoAprovar?: React.ReactNode;
}

/**
 * Detalhe da medição (Fase 5, Task 3): cabeçalho com Nª, contrato, período, selo e os passos do
 * ciclo; resumo (versão da planilha, revisão corrente, valor); itens; revisões; e a trilha dos
 * eventos. Todo número vem do banco como texto e só é formatado (D7).
 */
export function MedicaoDetalhe({ medicao, passos, podeVerLancamentos, botaoAprovar }: MedicaoDetalheProps) {
  const periodo = periodoMedicao(medicao.periodoInicio, medicao.periodoFim);
  const corrente = medicao.revisaoCorrente;
  const trilha = React.useMemo(() => medicao.eventos.map(eventoMedicaoParaTrilha), [medicao.eventos]);

  return (
    <>
      <PageHeader
        modulo="Medição"
        titulo={`${medicao.numero}ª medição`}
        descricao={`${medicao.contratoCodigo} · ${medicao.contratoNome} · ${periodo}`}
        voltarPara={{ rota: `/medicao/medicoes?contrato=${medicao.contratoId}`, rotulo: "Voltar para a lista de medições" }}
        selos={<SeloMedicao status={medicao.status} />}
        acoes={
          <>
            {podeVerLancamentos ? (
              <Button type="button" size="sm" variant="outline" asChild>
                <Link href={`/medicao/lancamentos?contrato=${medicao.contratoId}&medicao=${medicao.numero}`}>
                  <ClipboardList />
                  Lançamentos
                </Link>
              </Button>
            ) : null}
            <AcoesCiclo
              medicaoId={medicao.id}
              numero={medicao.numero}
              passos={passos}
              revisaoNumero={corrente?.numero ?? null}
              servicos={medicao.servicos}
              botaoAprovar={botaoAprovar}
            />
          </>
        }
      />

      <div className="flex flex-col gap-6">
        <SecaoDetalhe titulo="Resumo" card>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Dado rotulo="Período">
              <span className="tabular-nums">{periodo}</span>
            </Dado>
            <Dado rotulo="Planilha">
              {medicao.versaoNumero === null ? <CelulaVazia /> : <span className="tabular-nums">{`v${medicao.versaoNumero}`}</span>}
            </Dado>
            <Dado rotulo="Revisão corrente">
              {corrente ? `${rotuloRevisao(corrente.numero)} · ${rotuloStatusRevisao(corrente.status)}` : "Nenhuma em curso"}
            </Dado>
            <Dado rotulo="Valor">
              {medicao.valor === null ? "Sem regra de arredondamento" : <MoneyText valor={medicao.valor} />}
            </Dado>
          </div>
        </SecaoDetalhe>

        <SecaoDetalhe titulo="Itens">
          <ItensMedicao itens={medicao.itens} valorTotal={medicao.valor} />
        </SecaoDetalhe>

        <SecaoDetalhe titulo="Revisões">
          <DataTable idTabela="medicao.medicoes.revisoes" columns={colunasRevisoes} data={medicao.revisoes} idDaLinha={idRevisao} />
        </SecaoDetalhe>

        <SecaoDetalhe titulo="Histórico">
          <Trilha eventos={trilha} />
        </SecaoDetalhe>
      </div>
    </>
  );
}
