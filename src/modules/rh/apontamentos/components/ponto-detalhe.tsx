"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { CheckCircle2, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "@/components/canonicos/toast";
import { semDerrubarSucesso } from "@/components/canonicos/acao-sem-silencio";

import {
  CelulaVazia,
  ConfirmDialog,
  DataTable,
  GradeKpis,
  PageHeader,
  StatusBadge,
  type PropsItemDaGrade,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { formatarData, formatarQuantidade } from "@/lib/formatadores";
import {
  ROTULO_TIPO_APONTAMENTO,
  STATUS_PONTO,
} from "@/modules/rh/_shared/formato";
import {
  aprovarPonto,
  reabrirPonto,
  removerApontamento,
} from "@/modules/rh/apontamentos/actions";
import type {
  ColaboradorComJornada,
  PontoApontamento,
  PontoDetalhe,
} from "@/modules/rh/apontamentos/queries";
import {
  ApontamentoFormDrawer,
  type ApontamentoEdicao,
} from "./apontamento-form-drawer";

/**
 * Card de seção do detalhe (borda + superfície), com título e ação. Aceita a
 * identidade de card (`PropsItemDaGrade`) porque a tabela mora na grade
 * personalizável (tamanho, ordem, tirar da tela).
 */
function Secao({
  titulo,
  acao,
  children,
}: {
  titulo: string;
  acao?: React.ReactNode;
  children: React.ReactNode;
} & PropsItemDaGrade) {
  return (
    <section className="rounded-md border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-secao font-semibold">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

/** Linha rotulada para os dados do cabeçalho. */
function Dado({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-legenda text-muted-foreground">{rotulo}</span>
      <span className="text-detalhe">{children}</span>
    </div>
  );
}

export interface PontoDetalheViewProps {
  ponto: PontoDetalhe;
  colaboradores: ColaboradorComJornada[];
  podeEditar: boolean;
  podeAprovar: boolean;
}

/**
 * Detalhe do ponto do dia (tela de campo): cabeçalho com obra/data/status,
 * barra de ações Aprovar/Reabrir conforme status e permissão, e a tabela de
 * apontamentos com adicionar/editar/remover enquanto o ponto está aberto.
 * Pensado mobile-first: cartões de colaborador no celular, tabela no desktop.
 */
export function PontoDetalheView({
  ponto,
  colaboradores,
  podeEditar,
  podeAprovar,
}: PontoDetalheViewProps) {
  const router = useRouter();
  const info = STATUS_PONTO[ponto.status];
  const aberto = ponto.status === "aberto";

  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [emEdicao, setEmEdicao] = React.useState<ApontamentoEdicao | undefined>(
    undefined,
  );
  const [dialogAprovar, setDialogAprovar] = React.useState(false);
  const [dialogReabrir, setDialogReabrir] = React.useState(false);

  const aceitaLancamentos = podeEditar && aberto;
  const temApontamentos = ponto.apontamentos.length > 0;
  const podeAprovarAgora = podeAprovar && aberto;
  const podeReabrirAgora = podeAprovar && !aberto;

  /** Lista plana do dia: ordena por coluna. */
  const colunas = React.useMemo<ColumnDef<PontoApontamento, unknown>[]>(() => {
    const base: ColumnDef<PontoApontamento, unknown>[] = [
      {
        id: "colaborador",
        header: "Colaborador",
        accessorFn: (linha) => linha.colaboradorNome,
        size: 260,
        meta: { celular: "titulo", fixa: true },
        cell: ({ row }) => {
          const linha = row.original;
          return (
            <>
              {linha.colaboradorNome}
              {linha.colaboradorFuncao ? (
                <span className="text-muted-foreground">
                  {" "}
                  ({linha.colaboradorFuncao})
                </span>
              ) : null}
            </>
          );
        },
      },
      {
        id: "horasNormais",
        header: "Horas normais",
        accessorFn: (linha) => linha.horasNormais,
        size: 130,
        meta: { alinharDireita: true, atomico: true, celular: "destaque" },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatarQuantidade(row.original.horasNormais)}
          </span>
        ),
      },
      {
        id: "horasExtras",
        header: "Horas extras",
        accessorFn: (linha) => linha.horasExtras,
        size: 130,
        meta: { alinharDireita: true, atomico: true, celular: "destaque" },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatarQuantidade(row.original.horasExtras)}
          </span>
        ),
      },
      {
        id: "tipo",
        header: "Tipo",
        accessorFn: (linha) => ROTULO_TIPO_APONTAMENTO[linha.tipo],
        size: 130,
        meta: { naoTruncar: true },
        cell: ({ row }) => (
          <StatusBadge
            status="rascunho"
            rotulo={ROTULO_TIPO_APONTAMENTO[row.original.tipo]}
          />
        ),
      },
      {
        id: "observacao",
        header: "Observação",
        accessorFn: (linha) => linha.observacao ?? "",
        size: 240,
        cell: ({ row }) =>
          row.original.observacao ? (
            <span className="text-muted-foreground">
              {row.original.observacao}
            </span>
          ) : (
            <CelulaVazia />
          ),
      },
    ];
    if (!aceitaLancamentos) return base;
    base.push({
      id: "acoes",
      header: "",
      size: 90,
      enableSorting: false,
      meta: { alinharDireita: true, fixa: true, rotulo: "Ações", naoTruncar: true },
      cell: ({ row }) => {
        const linha = row.original;
        return (
          <div className="flex justify-end gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Editar apontamento"
              className="text-muted-foreground"
              onClick={() => abrirEdicao(linha)}
            >
              <Pencil />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Remover apontamento"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => aoRemover(linha.id)}
            >
              <Trash2 />
            </Button>
          </div>
        );
      },
    });
    return base;
    // abrirEdicao e aoRemover só leem ponto.id e os setters, estáveis.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aceitaLancamentos]);

  function abrirNovo() {
    setEmEdicao(undefined);
    setDrawerAberto(true);
  }

  function abrirEdicao(linha: PontoApontamento) {
    setEmEdicao({
      id: linha.id,
      colaboradorId: linha.colaboradorId,
      horasNormais: linha.horasNormais,
      horasExtras: linha.horasExtras,
      tipo: linha.tipo,
      observacao: linha.observacao,
    });
    setDrawerAberto(true);
  }

  async function aoAprovar() {
    const resultado = await aprovarPonto(ponto.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Ponto aprovado");
    semDerrubarSucesso("aprovacao.detalhe", () => router.refresh());
  }

  async function aoReabrir() {
    const resultado = await reabrirPonto(ponto.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Ponto reaberto");
    semDerrubarSucesso("aprovacao.detalhe", () => router.refresh());
  }

  async function aoRemover(apontamentoId: string) {
    const resultado = await removerApontamento(ponto.id, apontamentoId);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Apontamento removido");
    semDerrubarSucesso("aprovacao.detalhe", () => router.refresh());
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        className="mb-0"
        modulo="RH · Apontamentos"
        titulo={ponto.obraNome}
        descricao={
          <span className="tabular-nums">
            {formatarData(ponto.data)}
            {ponto.obraLote ? ` · Lote ${ponto.obraLote}` : ""}
          </span>
        }
        voltarPara={{
          rota: "/rh/apontamentos",
          rotulo: "Voltar para os apontamentos",
        }}
        selos={<StatusBadge status={info.badge} rotulo={info.rotulo} />}
        acoes={
          <>
          {podeAprovarAgora ? (
            <Button
              type="button"
              size="sm"
              onClick={() => setDialogAprovar(true)}
              disabled={!temApontamentos}
              title={
                temApontamentos
                  ? undefined
                  : "Adicione ao menos um colaborador para aprovar o dia."
              }
            >
              <CheckCircle2 />
              Aprovar dia
            </Button>
          ) : null}
          {podeReabrirAgora ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setDialogReabrir(true)}
            >
              <RotateCcw />
              Reabrir
            </Button>
          ) : null}
          </>
        }
      />

      {!aberto ? (
        <div className="rounded-md border border-border bg-surface px-4 py-3">
          <p className="text-detalhe text-muted-foreground">
            Dia aprovado{ponto.aprovadoEm ? ` em ${formatarData(ponto.aprovadoEm)}` : ""}. Os apontamentos estão travados. Reabra para editar.
          </p>
        </div>
      ) : null}

      <Secao titulo="Dados do dia">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Dado rotulo="Obra">{ponto.obraNome}</Dado>
          <Dado rotulo="Data">{formatarData(ponto.data)}</Dado>
          <Dado rotulo="Encarregado">
            {ponto.encarregadoNome ?? <CelulaVazia />}
          </Dado>
          <Dado rotulo="Total de horas">
            <span className="tabular-nums">
              {formatarQuantidade(
                ponto.totalHorasNormais + ponto.totalHorasExtras,
              )}{" "}
              h
            </span>
          </Dado>
        </div>
        {ponto.observacao ? (
          <div className="mt-4">
            <Dado rotulo="Observação">{ponto.observacao}</Dado>
          </div>
        ) : null}
      </Secao>

      {/* A tabela é card da grade: tamanho, ordem e tirar da tela por pessoa; com
          altura escolhida ela rola por dentro. */}
      <GradeKpis id="rh.apontamentos.detalhe.tabelas" titulo="Tabelas" vao="amplo">
        <Secao
          larguraPadrao={12}
          titulo="Apontamentos"
          acao={
            aceitaLancamentos ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={abrirNovo}
              >
                <Plus />
                Adicionar colaborador
              </Button>
            ) : null
          }
        >
          {ponto.apontamentos.length === 0 ? (
            <p className="text-detalhe text-muted-foreground">
              Nenhum colaborador apontado neste dia.
            </p>
          ) : (
            // Abaixo do md o DataTable vira um card por colaborador (tela de
            // campo): nome e função no título, o tipo embaixo, as horas e a
            // observação em seguida, e editar/remover no canto.
            <DataTable
              idTabela="rh.apontamentos.detalhe.apontamentos"
              columns={colunas}
              data={ponto.apontamentos}
              idDaLinha={(linha) => linha.id}
              semPaginacao
            />
          )}
        </Secao>
      </GradeKpis>

      {aceitaLancamentos ? (
        <ApontamentoFormDrawer
          aberto={drawerAberto}
          onAbertoChange={setDrawerAberto}
          pontoId={ponto.id}
          dataPonto={ponto.data}
          colaboradores={colaboradores}
          apontamento={emEdicao}
        />
      ) : null}

      {podeAprovarAgora ? (
        <ConfirmDialog
          aberto={dialogAprovar}
          onAbertoChange={setDialogAprovar}
          titulo="Aprovar o dia"
          descricao="Aprovar trava os apontamentos deste dia. Você ainda pode reabrir depois para corrigir."
          textoConfirmar="Aprovar dia"
          onConfirmar={aoAprovar}
        />
      ) : null}

      {podeReabrirAgora ? (
        <ConfirmDialog
          aberto={dialogReabrir}
          onAbertoChange={setDialogReabrir}
          titulo="Reabrir o dia"
          descricao="Reabrir volta o ponto para aberto e libera a edição dos apontamentos."
          textoConfirmar="Reabrir"
          onConfirmar={aoReabrir}
        />
      ) : null}
    </div>
  );
}
