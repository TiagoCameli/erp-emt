"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Award, FileSpreadsheet, Pencil } from "lucide-react";

import { CelulaVazia, DataTable, GradeKpis, KPICard, MoneyText, PageHeader, SecaoDetalhe } from "@/components/canonicos";
import { Anexos } from "@/components/canonicos/anexos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { formatarData, formatarPercentual } from "@/lib/formatadores";
import type { AnexoDoDocumento } from "@/modules/_shared/anexos/queries";
import type { CentroCustoOpcao } from "@/modules/_shared/centro-custo/queries";
import { salvarCronogramaConsorcio } from "@/modules/financeiro/dividas/actions";
import { somarCentavos, type EtapaOpcao } from "@/modules/financeiro/dividas/calculo";
import { ContemplarDrawer } from "@/modules/financeiro/dividas/components/contemplar-drawer";
import { CotaFormDrawer, ENTIDADE_COTA } from "@/modules/financeiro/dividas/components/cota-form-drawer";
import { CronogramaDrawer } from "@/modules/financeiro/dividas/components/cronograma-drawer";
import { linhaEditavel } from "@/modules/financeiro/dividas/components/cronograma-editor";
import { SeloCota } from "@/modules/financeiro/dividas/components/selos";
import type { DetalheCota, LinhaConsorcio } from "@/modules/financeiro/dividas/queries";
import type { ConsorcioRelatorio } from "@/modules/financeiro/dividas/relatorio";

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-legenda text-muted-foreground">{rotulo}</span>
      <span className="text-detalhe">{children}</span>
    </div>
  );
}

// Sem ordenação: o cronograma é a sequência das parcelas, na ordem de vencimento.
const COLUNAS_CRONOGRAMA: ColumnDef<LinhaConsorcio, unknown>[] = [
  {
    id: "numero",
    header: "Nº",
    size: 80,
    enableSorting: false,
    meta: { alinharDireita: true, atomico: true, rotulo: "Nº", celular: "titulo" },
    cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{row.original.numero}</span>,
  },
  {
    id: "vencimento",
    header: "Vencimento",
    size: 120,
    enableSorting: false,
    meta: { atomico: true, rotulo: "Vencimento", celular: "destaque" },
    cell: ({ row }) => <span className="tabular-nums">{formatarData(row.original.vencimento)}</span>,
  },
  {
    id: "fundoComum",
    header: "Fundo comum",
    size: 140,
    enableSorting: false,
    meta: { alinharDireita: true, atomico: true, rotulo: "Fundo comum" },
    cell: ({ row }) => <MoneyText valor={row.original.fundoComum} />,
  },
  {
    id: "taxaAdm",
    header: "Taxa de adm.",
    size: 130,
    enableSorting: false,
    meta: { alinharDireita: true, atomico: true, rotulo: "Taxa de adm." },
    cell: ({ row }) => <MoneyText valor={row.original.taxaAdm} />,
  },
  {
    id: "fundoReserva",
    header: "Fundo de reserva",
    size: 140,
    enableSorting: false,
    meta: { alinharDireita: true, atomico: true, rotulo: "Fundo de reserva" },
    cell: ({ row }) => <MoneyText valor={row.original.fundoReserva} />,
  },
  {
    id: "total",
    header: "Total",
    size: 140,
    enableSorting: false,
    meta: { alinharDireita: true, atomico: true, rotulo: "Total", celular: "valor" },
    cell: ({ row }) => (
      <MoneyText
        valor={somarCentavos([row.original.fundoComum, row.original.taxaAdm, row.original.fundoReserva])}
        className="font-medium"
      />
    ),
  },
];

/** Situação no lançamento das parcelas: só existe quando a cota tem lançamento ligado. */
const COLUNA_SITUACAO: ColumnDef<LinhaConsorcio, unknown> = {
  id: "situacao",
  header: "Situação",
  size: 110,
  enableSorting: false,
  meta: { rotulo: "Situação", celular: "destaque" },
  cell: ({ row }) =>
    row.original.paga ? (
      <span className="text-legenda text-status-aprovado">Paga</span>
    ) : (
      <span className="text-legenda text-muted-foreground">A pagar</span>
    ),
};

const COLUNAS_CRONOGRAMA_COM_SITUACAO = [...COLUNAS_CRONOGRAMA, COLUNA_SITUACAO];

export interface CotaDetalheProps {
  detalhe: DetalheCota;
  resumo: ConsorcioRelatorio | null;
  centros: readonly CentroCustoOpcao[];
  centrosBem: EtapaOpcao[];
  anexos: AnexoDoDocumento[];
  podeEditar: boolean;
  podeVerLancamentos: boolean;
}

/**
 * Detalhe da cota: dados, resumo (pago e a pagar por parte, dívida depois da
 * contemplação), o cronograma (gerado pelo banco ao cadastrar, ou o da
 * administradora, digitado), a contemplação e o PDF.
 */
export function CotaDetalhe({
  detalhe,
  resumo,
  centros,
  centrosBem,
  anexos,
  podeEditar,
  podeVerLancamentos,
}: CotaDetalheProps) {
  const router = useRouter();
  const { cota, cronograma } = detalhe;
  const [editando, setEditando] = React.useState(false);
  const [digitando, setDigitando] = React.useState(false);
  const [contemplando, setContemplando] = React.useState(false);

  const ativa = cota.status === "ativa";

  async function aoSalvarCronograma(
    linhas: { vencimento: string; valores: [number, number, number] }[],
  ): Promise<boolean> {
    const r = await salvarCronogramaConsorcio(
      cota.id,
      linhas.map((l) => ({ vencimento: l.vencimento, fundoComum: l.valores[0], taxaAdm: l.valores[1], fundoReserva: l.valores[2] })),
    );
    if ("erro" in r) {
      toast.error(r.erro);
      return false;
    }
    toast.success("Cronograma da administradora salvo");
    router.refresh();
    return true;
  }

  return (
    <>
      <PageHeader
        modulo="Financeiro"
        titulo={`${cota.administradora} · grupo ${cota.grupo} · cota ${cota.cota}`}
        descricao={cota.bem}
        voltarPara={{ rota: "/financeiro/dividas?aba=consorcios", rotulo: "Voltar para Dívidas" }}
        selos={<SeloCota status={cota.status} />}
        acoes={
          <>
            <Button type="button" size="sm" variant="outline" onClick={() => setEditando(true)}>
              <Pencil />
              {podeEditar ? "Editar cota" : "Ver cadastro"}
            </Button>
            {podeEditar ? (
              <Button type="button" size="sm" variant="outline" onClick={() => setDigitando(true)}>
                <FileSpreadsheet />
                Cronograma da administradora
              </Button>
            ) : null}
            {podeEditar && ativa ? (
              <Button type="button" size="sm" onClick={() => setContemplando(true)}>
                <Award />
                Contemplar
              </Button>
            ) : null}
          </>
        }
      />

      <div className="flex flex-col gap-6">
        {resumo ? (
          <GradeKpis id="financeiro.dividas.cota.resumo" titulo="Resumo da cota">
            <KPICard
              titulo="Parcelas pagas"
              valor={`${resumo.parcelasPagas} de ${resumo.prazo}`}
              detalhe={cota.lancamento ? "Pelo lançamento das parcelas" : "Pelo vencimento: sem lançamento ligado"}
            />
            <KPICard titulo="Fundo comum pago" valor={<MoneyText valor={resumo.fundoComumPago} />} />
            <KPICard
              titulo="Taxa paga"
              valor={<MoneyText valor={resumo.taxaPaga} />}
              detalhe="Taxa de administração e fundo de reserva"
            />
            <KPICard titulo="A pagar" valor={<MoneyText valor={resumo.aPagar} />} />
            <KPICard
              titulo="Dívida"
              valor={<MoneyText valor={resumo.divida} />}
              detalhe={ativa ? "Só depois da contemplação" : "O que falta pagar da cota contemplada"}
            />
          </GradeKpis>
        ) : null}

        <SecaoDetalhe titulo="Dados da cota" card>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <Dado rotulo="Valor do crédito">
              <MoneyText valor={cota.valorCredito} />
            </Dado>
            <Dado rotulo="Prazo">
              <span className="tabular-nums">{cota.prazo}</span> meses
            </Dado>
            <Dado rotulo="Taxa de administração">{formatarPercentual(cota.taxaAdmPct, 4)}</Dado>
            <Dado rotulo="Fundo de reserva">{formatarPercentual(cota.fundoReservaPct, 4)}</Dado>
            <Dado rotulo="Primeiro vencimento">{formatarData(cota.primeiroVencimento)}</Dado>
            <Dado rotulo="Centro de custo">{cota.centroNome ?? <CelulaVazia />}</Dado>
            <Dado rotulo="Lançamento das parcelas">
              {cota.lancamento ? (
                podeVerLancamentos ? (
                  <Link
                    href={`/financeiro/lancamentos/${cota.lancamento.id}`}
                    className="text-primary underline-offset-2 hover:underline"
                    title={cota.lancamento.descricao}
                  >
                    {cota.lancamento.numero}
                  </Link>
                ) : (
                  cota.lancamento.numero
                )
              ) : (
                <CelulaVazia />
              )}
            </Dado>
          </div>
          {cota.observacoes ? (
            <p className="mt-4 whitespace-pre-wrap text-detalhe text-muted-foreground">{cota.observacoes}</p>
          ) : null}
        </SecaoDetalhe>

        {cota.contemplacaoData ? (
          <SecaoDetalhe titulo="Contemplação" card>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              <Dado rotulo="Data">{formatarData(cota.contemplacaoData)}</Dado>
              <Dado rotulo="Forma">{cota.contemplacaoForma === "lance" ? "Lance" : "Sorteio"}</Dado>
              <Dado rotulo="Valor da carta">
                {cota.valorCarta === null ? <CelulaVazia /> : <MoneyText valor={cota.valorCarta} />}
              </Dado>
              <Dado rotulo="Lance">
                {cota.valorLance === null ? <CelulaVazia /> : <MoneyText valor={cota.valorLance} />}
              </Dado>
              <Dado rotulo="Onde o bem fica">{cota.bemCentroNome ?? <CelulaVazia />}</Dado>
            </div>
          </SecaoDetalhe>
        ) : null}

        <SecaoDetalhe titulo="Cronograma" card>
          {cronograma.length === 0 ? (
            <p className="text-detalhe text-muted-foreground">Nenhuma parcela.</p>
          ) : (
            <DataTable
              idTabela="financeiro.dividas.cota.cronograma"
              columns={cota.lancamento ? COLUNAS_CRONOGRAMA_COM_SITUACAO : COLUNAS_CRONOGRAMA}
              data={cronograma}
              idDaLinha={(l) => l.id}
              semPaginacao
            />
          )}
        </SecaoDetalhe>

        <SecaoDetalhe titulo="Anexos" card>
          <Anexos
            entidade={ENTIDADE_COTA}
            entidadeId={cota.id}
            anexos={anexos}
            podeEditar={podeEditar}
            onMudou={() => router.refresh()}
            aceitar="application/pdf,image/*"
          />
        </SecaoDetalhe>
      </div>

      <CotaFormDrawer
        aberto={editando}
        onAbertoChange={setEditando}
        cota={cota}
        centros={centros}
        podeEditar={podeEditar}
        onSalvo={() => router.refresh()}
      />

      <CronogramaDrawer
        aberto={digitando}
        onAbertoChange={setDigitando}
        titulo="Cronograma da administradora"
        descricao="As parcelas como a administradora cobra (com reajuste). O fundo comum precisa somar o crédito: se a carta foi reajustada, grave o crédito novo na cota antes."
        colunas={["Fundo comum", "Taxa de adm.", "Fundo de reserva"]}
        alvo={{ rotulo: "O crédito", valor: cota.valorCredito }}
        linhasIniciais={cronograma.map((l) => linhaEditavel(l.vencimento, [l.fundoComum, l.taxaAdm, l.fundoReserva]))}
        exigeMotivo={false}
        onSalvar={aoSalvarCronograma}
      />

      <ContemplarDrawer
        aberto={contemplando}
        onAbertoChange={setContemplando}
        cotaId={cota.id}
        valorCredito={cota.valorCredito}
        centrosBem={centrosBem}
      />
    </>
  );
}
