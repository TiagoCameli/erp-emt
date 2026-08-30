"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import {
  CelulaVazia,
  ConfirmDialog,
  PageHeader,
  StatusBadge,
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

/** Card de seção do detalhe (borda + superfície), com título e ação. */
function Secao({
  titulo,
  acao,
  children,
}: {
  titulo: string;
  acao?: React.ReactNode;
  children: React.ReactNode;
}) {
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
    router.refresh();
  }

  async function aoReabrir() {
    const resultado = await reabrirPonto(ponto.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Ponto reaberto");
    router.refresh();
  }

  async function aoRemover(apontamentoId: string) {
    const resultado = await removerApontamento(ponto.id, apontamentoId);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Apontamento removido");
    router.refresh();
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

      <Secao
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
          <>
            {/* Mobile: cartões por colaborador. */}
            <ul className="flex flex-col gap-2 sm:hidden">
              {ponto.apontamentos.map((linha) => (
                <li
                  key={linha.id}
                  className="rounded-md border border-border p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{linha.colaboradorNome}</p>
                      {linha.colaboradorFuncao ? (
                        <p className="text-legenda text-muted-foreground">
                          {linha.colaboradorFuncao}
                        </p>
                      ) : null}
                    </div>
                    <StatusBadge
                      status="rascunho"
                      rotulo={ROTULO_TIPO_APONTAMENTO[linha.tipo]}
                    />
                  </div>
                  <div className="mt-2 flex items-center gap-4 text-detalhe tabular-nums">
                    <span>
                      <span className="text-muted-foreground">Normais </span>
                      {formatarQuantidade(linha.horasNormais)} h
                    </span>
                    <span>
                      <span className="text-muted-foreground">Extras </span>
                      {formatarQuantidade(linha.horasExtras)} h
                    </span>
                  </div>
                  {linha.observacao ? (
                    <p className="mt-1 text-legenda text-muted-foreground">
                      {linha.observacao}
                    </p>
                  ) : null}
                  {aceitaLancamentos ? (
                    <div className="mt-2 flex justify-end gap-1">
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
                  ) : null}
                </li>
              ))}
            </ul>

            {/* Desktop: tabela. */}
            <div className="hidden overflow-x-auto rounded-md border border-border sm:block">
              <table className="w-full text-detalhe">
                <thead>
                  {/* Centralizado é o padrão de tabela do app (ver DataTable);
                      só dinheiro, quantidade, total, percentual e horas vão à
                      direita. */}
                  <tr className="border-b border-border text-legenda text-muted-foreground">
                    <th className="px-3 py-2 text-center font-medium">
                      Colaborador
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      Horas normais
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      Horas extras
                    </th>
                    <th className="px-3 py-2 text-center font-medium">Tipo</th>
                    {aceitaLancamentos ? (
                      <th className="px-3 py-2 text-right font-medium" />
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {ponto.apontamentos.map((linha) => (
                    <tr
                      key={linha.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-3 py-2 text-center">
                        {linha.colaboradorNome}
                        {linha.colaboradorFuncao ? (
                          <span className="text-muted-foreground">
                            {" "}
                            ({linha.colaboradorFuncao})
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatarQuantidade(linha.horasNormais)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatarQuantidade(linha.horasExtras)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <StatusBadge
                          status="rascunho"
                          rotulo={ROTULO_TIPO_APONTAMENTO[linha.tipo]}
                        />
                      </td>
                      {aceitaLancamentos ? (
                        <td className="px-3 py-2 text-right">
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
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Secao>

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
