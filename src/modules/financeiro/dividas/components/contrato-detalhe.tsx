"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Calculator, FileSpreadsheet, History, Pencil, Repeat } from "lucide-react";

import {
  CelulaVazia,
  ConfirmDialog,
  DataTable,
  GradeKpis,
  KPICard,
  MoneyText,
  PageHeader,
  SecaoDetalhe,
} from "@/components/canonicos";
import { Anexos } from "@/components/canonicos/anexos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { formatarBRL, formatarData, formatarDataHora, formatarPercentual } from "@/lib/formatadores";
import type { AnexoDoDocumento } from "@/modules/_shared/anexos/queries";
import { gerarCronograma, salvarCronogramaDoBanco } from "@/modules/financeiro/dividas/actions";
import { somarCentavos, type EtapaOpcao } from "@/modules/financeiro/dividas/calculo";
import {
  ContratoFormDrawer,
  ENTIDADE_CONTRATO,
} from "@/modules/financeiro/dividas/components/contrato-form-drawer";
import { CronogramaDrawer } from "@/modules/financeiro/dividas/components/cronograma-drawer";
import { linhaEditavel } from "@/modules/financeiro/dividas/components/cronograma-editor";
import { EventoDrawer } from "@/modules/financeiro/dividas/components/evento-drawer";
import { SeloContrato } from "@/modules/financeiro/dividas/components/selos";
import type { DetalheContrato, LancamentoLigado, LinhaCronograma } from "@/modules/financeiro/dividas/queries";
import type { ContratoRelatorio } from "@/modules/financeiro/dividas/relatorio";
import {
  ROTULO_EVENTO,
  ROTULO_INDEXADOR,
  ROTULO_SISTEMA,
  ROTULO_TIPO_CONTRATO,
  rotulo,
} from "@/modules/financeiro/dividas/schemas";

function Dado({ rotulo: titulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-legenda text-muted-foreground">{titulo}</span>
      <span className="text-detalhe">{children}</span>
    </div>
  );
}

function Lancamento({ lancamento, link }: { lancamento: LancamentoLigado | null; link: boolean }) {
  if (!lancamento) return <CelulaVazia />;
  return link ? (
    <Link
      href={`/financeiro/lancamentos/${lancamento.id}`}
      className="text-primary underline-offset-2 hover:underline"
      title={lancamento.descricao}
    >
      {lancamento.numero}
    </Link>
  ) : (
    <span title={lancamento.descricao}>{lancamento.numero}</span>
  );
}

/** A coluna da situação no lançamento: paga, a pagar, ou nada quando não é parcela. */
function Situacao({ paga }: { paga: boolean | null }) {
  if (paga === null) return <CelulaVazia />;
  return paga ? (
    <span className="text-legenda text-status-aprovado">Paga</span>
  ) : (
    <span className="text-legenda text-muted-foreground">A pagar</span>
  );
}

// Sem ordenação: o cronograma tem ordem de vencimento, e os eventos (aporte,
// amortização) ficam no lugar deles entre as parcelas.
const COLUNAS_CRONOGRAMA: ColumnDef<LinhaCronograma, unknown>[] = [
  {
    id: "numero",
    header: "Nº",
    size: 110,
    enableSorting: false,
    meta: { alinharDireita: true, rotulo: "Nº", celular: "titulo" },
    cell: ({ row }) => (
      <span className="tabular-nums text-muted-foreground">
        {row.original.numero ?? rotulo(ROTULO_EVENTO, row.original.tipo)}
      </span>
    ),
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
    id: "principal",
    header: "Principal",
    size: 140,
    enableSorting: false,
    meta: { alinharDireita: true, atomico: true, rotulo: "Principal" },
    cell: ({ row }) => <MoneyText valor={row.original.principal} />,
  },
  {
    id: "juros",
    header: "Juros",
    size: 130,
    enableSorting: false,
    meta: { alinharDireita: true, atomico: true, rotulo: "Juros" },
    cell: ({ row }) => <MoneyText valor={row.original.juros} />,
  },
  {
    id: "encargos",
    header: "Encargos",
    size: 130,
    enableSorting: false,
    meta: { alinharDireita: true, atomico: true, rotulo: "Encargos" },
    cell: ({ row }) => <MoneyText valor={row.original.encargos} />,
  },
  {
    id: "total",
    header: "Total",
    size: 140,
    enableSorting: false,
    meta: { alinharDireita: true, atomico: true, rotulo: "Total", celular: "valor" },
    cell: ({ row }) => (
      <MoneyText
        valor={somarCentavos([row.original.principal, row.original.juros, row.original.encargos])}
        className="font-medium"
      />
    ),
  },
  {
    id: "saldoApos",
    header: "Saldo depois",
    size: 150,
    enableSorting: false,
    meta: { alinharDireita: true, atomico: true, rotulo: "Saldo depois" },
    cell: ({ row }) => <MoneyText valor={row.original.saldoApos} />,
  },
];

const COLUNA_SITUACAO: ColumnDef<LinhaCronograma, unknown> = {
  id: "situacao",
  header: "Situação",
  size: 110,
  enableSorting: false,
  meta: { rotulo: "Situação", celular: "destaque" },
  cell: ({ row }) => <Situacao paga={row.original.paga} />,
};

const COLUNAS_CRONOGRAMA_COM_SITUACAO = [...COLUNAS_CRONOGRAMA, COLUNA_SITUACAO];

/** A tabela de uma versão do cronograma (a atual ou uma do histórico). */
export function TabelaCronograma({ linhas, mostrarPaga }: { linhas: LinhaCronograma[]; mostrarPaga: boolean }) {
  return (
    <DataTable
      idTabela="financeiro.dividas.contrato.cronograma"
      columns={mostrarPaga ? COLUNAS_CRONOGRAMA_COM_SITUACAO : COLUNAS_CRONOGRAMA}
      data={linhas}
      idDaLinha={(l) => l.id}
      semPaginacao
      // Evento (aporte, amortização) entre as parcelas aparece com fundo.
      classeDaLinha={(l) => (l.tipo === "parcela" ? undefined : "bg-surface")}
    />
  );
}

export interface ContratoDetalheProps {
  detalhe: DetalheContrato;
  /** A linha do relatório (saldo, juros, CET), pelo mesmo cálculo da aba Créditos. */
  resumo: ContratoRelatorio | null;
  etapas: EtapaOpcao[];
  anexos: AnexoDoDocumento[];
  podeEditar: boolean;
  podeVerLancamentos: boolean;
}

/**
 * Detalhe do contrato de dívida: dados, resumo (saldo devedor de principal,
 * juros, CET), o cronograma atual com a situação de cada parcela no
 * lançamento, o histórico (eventos e versões substituídas) e o PDF.
 *
 * Trocar o cronograma tem dois caminhos, como no banco: sem parcela paga,
 * gerar de novo ou digitar o do banco (com motivo, se já havia um); com
 * parcela paga, só por evento (amortização, quitação, renegociação).
 */
export function ContratoDetalhe({
  detalhe,
  resumo,
  etapas,
  anexos,
  podeEditar,
  podeVerLancamentos,
}: ContratoDetalheProps) {
  const router = useRouter();
  const { contrato, cronograma, historico, eventos, parcelasPagas } = detalhe;
  const [editando, setEditando] = React.useState(false);
  const [gerando, setGerando] = React.useState(false);
  const [digitando, setDigitando] = React.useState(false);
  const [evento, setEvento] = React.useState(false);

  const temCronograma = cronograma.length > 0;
  const calcula = contrato.sistema === "price" || contrato.sistema === "sac";
  const quitado = contrato.status === "quitado";
  // Com parcela paga a troca é por evento: o banco recusaria gerar ou digitar.
  const trocaLivre = parcelasPagas === 0;
  const podeTrocar = podeEditar && !quitado && trocaLivre;

  async function aoGerar(motivo?: string): Promise<boolean> {
    const r = await gerarCronograma(contrato.id, motivo);
    if ("erro" in r) {
      toast.error(r.erro);
      return false;
    }
    toast.success(`Cronograma ${rotulo(ROTULO_SISTEMA, contrato.sistema)} gerado`);
    setGerando(false);
    router.refresh();
    return true;
  }

  async function aoSalvarDoBanco(
    linhas: { vencimento: string; valores: [number, number, number] }[],
    motivo: string,
  ): Promise<boolean> {
    const r = await salvarCronogramaDoBanco(
      contrato.id,
      linhas.map((l) => ({ vencimento: l.vencimento, principal: l.valores[0], juros: l.valores[1], encargos: l.valores[2] })),
      motivo,
    );
    if ("erro" in r) {
      toast.error(r.erro);
      return false;
    }
    toast.success("Cronograma do banco salvo");
    router.refresh();
    return true;
  }

  const parcelasAtuais = cronograma.filter((l) => l.tipo === "parcela");

  return (
    <>
      <PageHeader
        modulo="Financeiro"
        titulo={`${contrato.credor} · ${contrato.numero}`}
        descricao={`${rotulo(ROTULO_TIPO_CONTRATO, contrato.tipo)} · ${contrato.centroNome ?? "sem etapa"}`}
        voltarPara={{ rota: "/financeiro/dividas", rotulo: "Voltar para Dívidas" }}
        selos={<SeloContrato status={contrato.status} />}
        acoes={
          <>
            <Button type="button" size="sm" variant="outline" onClick={() => setEditando(true)}>
              <Pencil />
              {podeEditar ? "Editar contrato" : "Ver cadastro"}
            </Button>
            {podeTrocar && calcula ? (
              <Button type="button" size="sm" variant="outline" onClick={() => setGerando(true)}>
                <Calculator />
                {temCronograma ? "Gerar de novo" : `Gerar ${rotulo(ROTULO_SISTEMA, contrato.sistema)}`}
              </Button>
            ) : null}
            {podeTrocar ? (
              <Button type="button" size="sm" variant="outline" onClick={() => setDigitando(true)}>
                <FileSpreadsheet />
                Cronograma do banco
              </Button>
            ) : null}
            {podeEditar && temCronograma && !quitado ? (
              <Button type="button" size="sm" onClick={() => setEvento(true)}>
                <Repeat />
                Registrar evento
              </Button>
            ) : null}
          </>
        }
      />

      <div className="flex flex-col gap-6">
        {resumo ? (
          <GradeKpis id="financeiro.dividas.contrato.resumo" titulo="Resumo do contrato">
            <KPICard
              titulo="Saldo devedor de principal"
              valor={<MoneyText valor={resumo.saldoDevedor} />}
              detalhe={`Liberado ${formatarBRL(resumo.valorLiberado)}`}
            />
            <KPICard titulo="Principal pago" valor={<MoneyText valor={resumo.principalPago} />} />
            <KPICard
              titulo="Juros pagos"
              valor={<MoneyText valor={resumo.jurosPagos} />}
              detalhe="Com os encargos"
            />
            <KPICard titulo="Juros a pagar" valor={<MoneyText valor={resumo.jurosAPagar} />} detalhe="Com os encargos" />
            <KPICard
              titulo="CET"
              valor={resumo.cet ? `${formatarPercentual(resumo.cet.mensal * 100, 4)} a.m.` : "-"}
              detalhe={
                resumo.cet
                  ? `${formatarPercentual(resumo.cet.anual * 100, 2)} a.a. pelo fluxo de liberação e parcelas`
                  : "Sem cronograma, sem fluxo para calcular"
              }
            />
          </GradeKpis>
        ) : null}

        <SecaoDetalhe titulo="Dados do contrato" card>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <Dado rotulo="Valor contratado">
              <MoneyText valor={contrato.valorContratado} />
            </Dado>
            <Dado rotulo="Valor liberado">
              <MoneyText valor={contrato.valorLiberado} />
            </Dado>
            <Dado rotulo="Liberação">{formatarData(contrato.dataLiberacao)}</Dado>
            <Dado rotulo="Primeiro vencimento">{formatarData(contrato.primeiroVencimento)}</Dado>
            <Dado rotulo="Taxa">{formatarPercentual(contrato.taxaAm, 4)} a.m.</Dado>
            <Dado rotulo="Indexador">{rotulo(ROTULO_INDEXADOR, contrato.indexador)}</Dado>
            <Dado rotulo="Sistema">{rotulo(ROTULO_SISTEMA, contrato.sistema)}</Dado>
            <Dado rotulo="Parcelas">
              <span className="tabular-nums">{contrato.parcelas}</span>
              {contrato.carenciaMeses > 0 ? ` (${contrato.carenciaMeses} de carência)` : ""}
            </Dado>
            <Dado rotulo="Lançamento das prestações">
              <Lancamento lancamento={contrato.lancamento} link={podeVerLancamentos} />
            </Dado>
            <Dado rotulo="Lançamento da liberação">
              <Lancamento lancamento={contrato.lancamentoLiberacao} link={podeVerLancamentos} />
            </Dado>
            <Dado rotulo="Parcelas pagas no lançamento">
              {contrato.lancamento ? <span className="tabular-nums">{parcelasPagas}</span> : <CelulaVazia />}
            </Dado>
            <Dado rotulo="Garantia">{contrato.garantia ?? <CelulaVazia />}</Dado>
          </div>
          {contrato.observacoes ? (
            <p className="mt-4 whitespace-pre-wrap text-detalhe text-muted-foreground">{contrato.observacoes}</p>
          ) : null}
        </SecaoDetalhe>

        <SecaoDetalhe titulo={temCronograma ? `Cronograma (versão ${cronograma[0].versao})` : "Cronograma"} card>
          {temCronograma ? (
            <div className="flex flex-col gap-2">
              {!trocaLivre && !quitado && podeEditar ? (
                <p className="text-legenda text-muted-foreground">
                  O contrato já tem parcela paga: o cronograma só muda por evento (amortização, quitação ou
                  renegociação).
                </p>
              ) : null}
              <TabelaCronograma linhas={cronograma} mostrarPaga={contrato.lancamento !== null} />
            </div>
          ) : (
            <p className="text-detalhe text-muted-foreground">
              Nenhum cronograma ainda.{" "}
              {podeEditar
                ? calcula
                  ? `Gere o ${rotulo(ROTULO_SISTEMA, contrato.sistema)} pelos dados do contrato ou digite o do banco.`
                  : "Digite ou cole o cronograma do banco."
                : ""}{" "}
              Sem ele, os juros deste contrato não aparecem no DRE.
            </p>
          )}
        </SecaoDetalhe>

        <SecaoDetalhe titulo="Histórico" card>
          {eventos.length === 0 ? (
            <p className="text-detalhe text-muted-foreground">Nenhum evento.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {eventos.map((e) => {
                const versao = historico.find((h) => h.versao === e.versaoAnterior);
                return (
                  <li key={e.id} className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-detalhe">
                      <span className="flex items-center gap-1 font-medium">
                        <History className="size-3.5 text-muted-foreground" aria-hidden />
                        {rotulo(ROTULO_EVENTO, e.tipo)}
                      </span>
                      <span className="tabular-nums">{formatarData(e.data)}</span>
                      {e.valor !== null ? <MoneyText valor={e.valor} /> : null}
                      <span className="text-legenda text-muted-foreground">
                        {e.versaoAnterior === null
                          ? `versão ${e.versaoNova}`
                          : `versão ${e.versaoAnterior} → ${e.versaoNova}`}{" "}
                        · {formatarDataHora(e.criadoEm)}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-legenda text-muted-foreground">{e.motivo}</p>
                    {versao ? (
                      <details className="text-legenda">
                        <summary className="cursor-pointer text-primary">
                          Ver a versão {versao.versao} (substituída)
                        </summary>
                        <div className="mt-2">
                          <TabelaCronograma linhas={versao.linhas} mostrarPaga={false} />
                        </div>
                      </details>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </SecaoDetalhe>

        <SecaoDetalhe titulo="Anexos" card>
          <Anexos
            entidade={ENTIDADE_CONTRATO}
            entidadeId={contrato.id}
            anexos={anexos}
            podeEditar={podeEditar}
            onMudou={() => router.refresh()}
            aceitar="application/pdf,image/*"
          />
        </SecaoDetalhe>
      </div>

      <ContratoFormDrawer
        aberto={editando}
        onAbertoChange={setEditando}
        contrato={contrato}
        etapas={etapas}
        podeEditar={podeEditar}
        onSalvo={() => router.refresh()}
      />

      <ConfirmDialog
        aberto={gerando}
        onAbertoChange={setGerando}
        titulo={temCronograma ? "Gerar o cronograma de novo?" : `Gerar o cronograma ${rotulo(ROTULO_SISTEMA, contrato.sistema)}?`}
        descricao={
          temCronograma
            ? "Pelos dados atuais do contrato (liberado, taxa, parcelas, carência). A versão atual fica no histórico; diga o motivo."
            : "Pelos dados do contrato: liberado, taxa, parcelas e carência. A última parcela fecha o saldo ao centavo."
        }
        textoConfirmar="Gerar cronograma"
        exigeMotivo={temCronograma}
        onConfirmar={aoGerar}
      />

      <CronogramaDrawer
        aberto={digitando}
        onAbertoChange={setDigitando}
        titulo="Cronograma do banco"
        descricao="As parcelas como estão no contrato do banco. O principal precisa fechar o valor liberado ao centavo; o saldo depois de cada parcela o ERP calcula."
        colunas={["Principal", "Juros", "Encargos"]}
        alvo={{ rotulo: "O valor liberado", valor: contrato.valorLiberado }}
        linhasIniciais={parcelasAtuais.map((l) => linhaEditavel(l.vencimento, [l.principal, l.juros, l.encargos]))}
        exigeMotivo={temCronograma}
        onSalvar={aoSalvarDoBanco}
      />

      <EventoDrawer
        aberto={evento}
        onAbertoChange={setEvento}
        contratoId={contrato.id}
        sistema={contrato.sistema}
        valorLiberado={contrato.valorLiberado}
        dataLiberacao={contrato.dataLiberacao}
        cronograma={cronograma}
      />
    </>
  );
}
