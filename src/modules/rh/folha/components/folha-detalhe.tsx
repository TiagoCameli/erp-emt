"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  FileText,
  Pencil,
  RefreshCw,
} from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import {
  ApprovalBar,
  CelulaVazia,
  ConfirmDialog,
  KPICard,
  MoneyText,
  StatusBadge,
  Trilha,
  type EventoTrilha,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import {
  formatarBRL,
  formatarDataHora,
  formatarQuantidade,
} from "@/lib/formatadores";
import {
  ROTULO_VINCULO,
  type Vinculo,
} from "@/modules/cadastros/colaboradores/schemas";
import { STATUS_FOLHA } from "@/modules/rh/_shared/formato";
import {
  aprovarFolha,
  desaprovarFolha,
  enviarFolhaParaAprovacao,
  rejeitarFolha,
} from "@/modules/rh/folha/actions";
import {
  retidoSemGrupoDeRecolhimento,
  type LancamentosDaFolhaAgrupados,
} from "@/modules/rh/folha/calculo";
import type {
  CustoCentroCusto,
  FolhaDetalhe,
  FolhaItem,
  ResumoEncargo,
  ResumoProvisao,
} from "@/modules/rh/folha/queries";
import { podeTransicionar } from "@/modules/rh/folha/transicoes";
import { BotaoPlanilha } from "./botao-planilha";
import { EditarItemFolhaDrawer } from "./editar-item-folha-drawer";
import { GerarFolhaFormDrawer } from "./gerar-folha-form-drawer";
import { HoleriteDialog } from "./holerite-dialog";
import { LancamentosGerados } from "./lancamentos-gerados";

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

/** Competência (yyyy-MM-01) como MM/AAAA. */
function formatarCompetencia(competencia: string): string {
  const [ano, mes] = competencia.split("-");
  return `${mes}/${ano}`;
}

/** Rótulo do centro de custo (código - nome) ou fallback. */
function rotuloCentroCusto(grupo: CustoCentroCusto): string {
  if (!grupo.centroCustoNome) return "Sem centro de custo";
  return grupo.centroCustoCodigo
    ? `${grupo.centroCustoCodigo} - ${grupo.centroCustoNome}`
    : grupo.centroCustoNome;
}

export interface FolhaDetalheViewProps {
  folha: FolhaDetalhe;
  custosPorCentro: CustoCentroCusto[];
  resumoEncargos: ResumoEncargo[];
  resumoProvisoes: ResumoProvisao[];
  /** Lançamentos gerados pela aprovação, já separados em salários/guias (Task 7). */
  lancamentos: LancamentosDaFolhaAgrupados;
  /** % do FGTS (parâmetros da folha) para o informativo do holerite. */
  fgtsPercentual: number;
  /**
   * Grupos de recolhimento dos retidos (`folha_parametros`). `null` quando a
   * linha de parâmetros nem existe. Só para o aviso de retido que não vira
   * conta a pagar: nada aqui muda valor nenhum.
   */
  gruposRetido: {
    grupoRecolhimentoInss: string | null;
    grupoRecolhimentoIrrf: string | null;
  } | null;
  trilha: EventoTrilha[];
  podeCriar: boolean;
  podeEditar: boolean;
  podeAprovar: boolean;
  podeDesaprovar: boolean;
  /** Permissão de ver lançamento (financeiro.lancamentos:ver), pro link da seção de lançamentos. */
  podeVerLancamento: boolean;
}

/**
 * Detalhe da folha gerencial: cabeçalho com competência e status; KPIs de
 * bruto, encargos, custo total (custo da empresa) e líquido (o que o
 * colaborador recebe); barra de ações conforme o estado; a tabela de itens por
 * colaborador; e o custo alocado por centro de custo. Os valores são fechados
 * pelas funções do banco; aqui só se exibe. Regerar abre o drawer no rascunho.
 */
export function FolhaDetalheView({
  folha,
  custosPorCentro,
  resumoEncargos,
  resumoProvisoes,
  lancamentos,
  fgtsPercentual,
  gruposRetido,
  trilha,
  podeCriar,
  podeEditar,
  podeAprovar,
  podeDesaprovar,
  podeVerLancamento,
}: FolhaDetalheViewProps) {
  const router = useRouter();
  const info = STATUS_FOLHA[folha.status];

  const rascunho = folha.status === "rascunho";
  // Enviar só existe de rascunho pra pendente_aprovacao: podeTransicionar é a
  // mesma fonte que o trigger do banco espelha, então a UI habilita exatamente
  // o que o UPDATE direto vai aceitar.
  const podeEnviar = podeTransicionar(folha.status, "pendente_aprovacao");
  // ApprovalBar cobre aprovar/rejeitar (a partir de pendente_aprovacao) e
  // desaprovar (a partir de aprovado) — os dois únicos status com alguma
  // transição de saída que não seja "enviar".
  const mostrarApprovalBar =
    podeTransicionar(folha.status, "aprovado") ||
    podeTransicionar(folha.status, "rascunho");
  // Sem faixas de INSS/IRRF cadastradas, todos os itens saem com desconto 0 e
  // o líquido vira igual ao bruto; avisamos para não passar a impressão errada.
  const semDescontosLegais =
    folha.itens.length > 0 &&
    folha.itens.every((item) => item.inss === 0 && item.irrf === 0);
  // Retido que não vai virar conta a pagar por falta de grupo de recolhimento.
  // Avisa e não bloqueia: config vazia é deploy seguro, e a folha pode servir só
  // como custo gerencial por um tempo. Mostrado já no rascunho, para o aviso
  // chegar ANTES de alguém aprovar. É a segunda causa de resíduo da identidade
  // de conferência (a lista tem duas; ver obj_description da fn_aprovar_folha).
  const retidoSemGrupo = retidoSemGrupoDeRecolhimento(folha, gruposRetido);
  const impostosSemGrupo = [
    retidoSemGrupo.inss > 0 ? "INSS" : null,
    retidoSemGrupo.irrf > 0 ? "IRRF" : null,
  ].filter((nome): nome is string => nome !== null);
  // Total da seção "Provisões por tipo": soma sobre `resumoProvisoes`, a
  // mesma fonte das linhas da tabela, para a linha de total sempre bater com
  // as duas colunas ao lado (ver comentário na própria linha, mais abaixo).
  const totalProvisoes = resumoProvisoes.reduce(
    (soma, provisao) => ({
      principal: soma.principal + provisao.principal,
      encargos: soma.encargos + provisao.encargos,
      total: soma.total + provisao.total,
    }),
    { principal: 0, encargos: 0, total: 0 },
  );

  // Alterar valor de linha só em rascunho: aprovado editado é folha que fecha
  // diferente do lançamento que já saiu no Financeiro. Mesma trava está na
  // fn_editar_item_folha, e as duas concordam de propósito.
  const podeEditarLinha = podeEditar && rascunho;
  // Quantas pessoas têm desconto de salário neste mês. O KPI diz isso em vez de
  // um percentual único, porque o desconto é por pessoa: "7,5% aplicado" seria
  // falso para as outras 57 linhas.
  const itensComDesconto = folha.itens.filter(
    (item) => item.descontos > 0,
  ).length;
  const detalheDescontos =
    itensComDesconto === 0
      ? "Ninguém com desconto neste mês"
      : `${itensComDesconto} ${
          itensComDesconto === 1 ? "pessoa" : "pessoas"
        } com desconto no salário`;

  const [dialogEnviar, setDialogEnviar] = React.useState(false);
  const [drawerRegerar, setDrawerRegerar] = React.useState(false);
  const [holeriteItem, setHoleriteItem] = React.useState<FolhaItem | null>(
    null,
  );
  const [itemEmEdicao, setItemEmEdicao] = React.useState<FolhaItem | null>(
    null,
  );

  async function aoEnviarParaAprovacao() {
    const resultado = await enviarFolhaParaAprovacao(folha.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Folha enviada para aprovação");
    router.refresh();
  }

  async function aoAprovar() {
    const resultado = await aprovarFolha(folha.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Folha aprovada. Lançamentos gerados no Financeiro");
    router.refresh();
  }

  async function aoRejeitar(motivo: string) {
    const resultado = await rejeitarFolha(folha.id, motivo);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Folha rejeitada e devolvida para rascunho");
    router.refresh();
  }

  async function aoDesaprovar(motivo: string) {
    const resultado = await desaprovarFolha(folha.id, motivo);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Aprovação desfeita. Lançamentos apagados");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Voltar para a lista"
            onClick={() => router.push("/rh/folha")}
          >
            <ArrowLeft />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-titulo font-semibold tabular-nums">
                {formatarCompetencia(folha.competencia)}
              </h1>
              <StatusBadge status={info.badge} rotulo={info.rotulo} />
            </div>
            <p className="text-detalhe text-muted-foreground">
              Folha gerencial · {folha.itens.length}{" "}
              {folha.itens.length === 1 ? "colaborador" : "colaboradores"}
              {folha.status === "aprovado" && folha.aprovadoEm
                ? ` · aprovada em ${formatarDataHora(folha.aprovadoEm)}${
                    folha.aprovadoPorNome ? ` por ${folha.aprovadoPorNome}` : ""
                  }`
                : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {podeCriar && rascunho ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDrawerRegerar(true)}
            >
              <RefreshCw />
              Regerar
            </Button>
          ) : null}
          {podeEditar && podeEnviar && folha.itens.length > 0 ? (
            <Button
              type="button"
              size="sm"
              onClick={() => setDialogEnviar(true)}
            >
              Enviar para aprovação
            </Button>
          ) : null}
          <BotaoPlanilha folhaId={folha.id} />
        </div>
      </div>

      {mostrarApprovalBar ? (
        <ApprovalBar
          status={folha.status}
          rotulo={info.rotulo}
          podeAprovar={podeAprovar}
          podeDesaprovar={podeDesaprovar}
          onAprovar={aoAprovar}
          onRejeitar={aoRejeitar}
          onDesaprovar={aoDesaprovar}
        />
      ) : null}

      {semDescontosLegais ? (
        <div className="rounded-md border border-status-pendente/30 bg-status-pendente/5 px-4 py-3">
          <p className="text-detalhe text-foreground">
            Sem descontos legais aplicados (INSS e IRRF zerados). Cadastre as
            faixas vigentes em Parâmetros da Folha para a folha calcular os
            descontos.
          </p>
        </div>
      ) : null}

      {impostosSemGrupo.length > 0 ? (
        <div className="rounded-md border border-status-pendente/30 bg-status-pendente/5 px-4 py-3">
          <p className="text-detalhe text-foreground">
            {impostosSemGrupo.join(" e ")} retido dos colaboradores, somando{" "}
            <MoneyText valor={retidoSemGrupo.total} />, não vira conta a pagar:{" "}
            {impostosSemGrupo.length > 1
              ? "os grupos de recolhimento estão"
              : "o grupo de recolhimento está"}{" "}
            sem configuração. O desconto continua no holerite e no líquido, mas
            a guia que a empresa recolhe não aparece no Financeiro. Configure em
            RH &gt; Parâmetros da Folha (/rh/parametros-folha)
            {folha.status === "aprovado"
              ? " e depois desaprove e reaprove esta folha, para a aprovação gerar a guia."
              : " antes de aprovar."}
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KPICard
          titulo="Bruto"
          valor={<MoneyText valor={folha.valorBruto} />}
          detalhe={
            folha.valorGratificacoes > 0
              ? `Salário base + extras + gratificação (${formatarBRL(folha.valorGratificacoes)})`
              : "Salário base + extras + gratificação"
          }
        />
        <KPICard
          titulo="Descontos"
          valor={<MoneyText valor={folha.valorDescontos} />}
          detalhe={detalheDescontos}
        />
        <KPICard
          titulo="Custo total"
          valor={<MoneyText valor={folha.custoTotal} />}
          detalhe="Custo da empresa (bruto + provisão)"
        />
        <KPICard
          titulo="Líquido"
          valor={<MoneyText valor={folha.valorLiquido} />}
          detalhe={
            semDescontosLegais
              ? "A receber (bruto − descontos − adiantamentos)"
              : "A receber (bruto − INSS − IRRF − descontos − adiantamentos)"
          }
        />
      </div>

      {folha.motivoRejeicao && rascunho ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3">
          <p className="text-legenda font-medium text-destructive">
            Motivo do registro
          </p>
          <p className="text-detalhe text-foreground">{folha.motivoRejeicao}</p>
        </div>
      ) : null}

      <Secao titulo="Itens por colaborador">
        {folha.itens.length === 0 ? (
          <p className="text-detalhe text-muted-foreground">
            Nenhum colaborador nesta folha. Entram os colaboradores ativos de
            vínculo CLT, terceiro e diarista: CLT e terceiro pelo salário do
            cadastro, diarista pela soma das diárias em aberto do mês. Confira o
            cadastro e regere a folha.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-detalhe">
              <thead>
                {/* Centralizado é o padrão de tabela do app (ver DataTable); só
                    dinheiro, quantidade, total, percentual e horas vão à
                    direita. */}
                <tr className="border-b border-border text-legenda text-muted-foreground">
                  <th className="px-3 py-2 text-center font-medium">
                    Colaborador
                  </th>
                  <th className="px-3 py-2 text-center font-medium">Vínculo</th>
                  <th className="px-3 py-2 text-center font-medium">Função</th>
                  <th className="px-3 py-2 text-center font-medium">
                    Centro de custo
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Salário base
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Gratificação
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Horas normais
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Horas extras
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Valor extras
                  </th>
                  <th className="px-3 py-2 text-right font-medium">Desconto</th>
                  <th className="px-3 py-2 text-right font-medium">Provisão</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Adiantamentos
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Custo total
                  </th>
                  <th className="px-3 py-2 text-right font-medium">Líquido</th>
                  <th className="px-3 py-2 text-right font-medium">
                    <span className="sr-only">Ações da linha</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {folha.itens.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-3 py-2 text-center font-medium">
                      {item.colaboradorNome}
                      {/* Selo de linha editada à mão: sem ele, um salário
                          ajustado e um salário vindo do cadastro ficam
                          indistinguíveis, e o Regerar trata os dois de formas
                          diferentes (preserva um, recalcula o outro). */}
                      {item.editadoManualmente ? (
                        <span
                          className="ml-1.5 align-middle text-legenda font-normal text-status-pendente"
                          title="Valores desta linha foram alterados à mão. Regerar a folha preserva o que foi digitado."
                        >
                          editado
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-center text-muted-foreground">
                      {ROTULO_VINCULO[item.colaboradorVinculo as Vinculo] ??
                        item.colaboradorVinculo}
                    </td>
                    <td className="px-3 py-2 text-center text-muted-foreground">
                      {item.colaboradorFuncao ?? <CelulaVazia />}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {item.centroCustoNome ? (
                        <span>
                          {item.centroCustoCodigo ? (
                            <span className="codigo-doc text-muted-foreground">
                              {item.centroCustoCodigo}{" "}
                            </span>
                          ) : null}
                          {item.centroCustoNome}
                        </span>
                      ) : (
                        <CelulaVazia />
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <MoneyText valor={item.salarioBase} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      {item.gratificacao > 0 ? (
                        <MoneyText valor={item.gratificacao} />
                      ) : (
                        <span className="text-muted-foreground">
                          <MoneyText valor={0} />
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatarQuantidade(item.horasNormais)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatarQuantidade(item.horasExtras)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <MoneyText valor={item.valorExtras} />
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {/* O percentual vai embaixo do valor: é ele que explica
                          POR QUE saíram R$ 121,58 do salário desta pessoa e
                          nada do salário da linha de cima. Sem desconto, um
                          R$ 0,00 apagado — dizer "0%" para 57 linhas que não
                          têm desconto só polui a tabela. */}
                      {item.descontoPercentual !== null ? (
                        <div className="flex flex-col items-end">
                          <MoneyText valor={item.descontos} />
                          <span className="text-legenda">
                            {formatarQuantidade(item.descontoPercentual)}% desta
                            pessoa
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">
                          <MoneyText valor={0} />
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {item.provisoesDetalhe.length > 0 ? (
                        <details className="group">
                          <summary className="flex cursor-pointer list-none items-center justify-end gap-1 select-none [&::-webkit-details-marker]:hidden">
                            <MoneyText valor={item.provisoes} />
                            <ChevronDown className="size-3.5 shrink-0 transition-transform group-open:rotate-180" />
                          </summary>
                          <ul className="mt-1.5 space-y-1 border-t border-border pt-1.5 text-left text-legenda">
                            {item.provisoesDetalhe.map((provisao) => (
                              <li
                                key={provisao.nome}
                                className="flex flex-col gap-0.5"
                              >
                                <span className="font-medium text-foreground">
                                  {provisao.nome}
                                </span>
                                <span className="flex items-center justify-between gap-3">
                                  <span>Principal</span>
                                  <MoneyText valor={provisao.valorPrincipal} />
                                </span>
                                <span className="flex items-center justify-between gap-3">
                                  <span>Encargos</span>
                                  <MoneyText valor={provisao.valorEncargos} />
                                </span>
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : (
                        <MoneyText valor={item.provisoes} />
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      <MoneyText valor={item.adiantamentos} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <MoneyText
                        valor={item.custoTotal}
                        className="font-medium"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <MoneyText
                        valor={item.valorLiquido}
                        className="font-medium"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {podeEditarLinha ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setItemEmEdicao(item)}
                          >
                            <Pencil />
                            Valores
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setHoleriteItem(item)}
                        >
                          <FileText />
                          Holerite
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>

      <Secao titulo="Custo por centro de custo">
        {custosPorCentro.length === 0 ? (
          <p className="text-detalhe text-muted-foreground">
            Sem custo alocado ainda.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-detalhe">
              <thead>
                <tr className="border-b border-border text-legenda text-muted-foreground">
                  <th className="px-3 py-2 text-center font-medium">
                    Centro de custo
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Custo total
                  </th>
                </tr>
              </thead>
              <tbody>
                {custosPorCentro.map((grupo) => (
                  <tr
                    key={grupo.centroCustoId ?? "__sem_centro__"}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-3 py-2 text-center">
                      {rotuloCentroCusto(grupo)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <MoneyText valor={grupo.custoTotal} />
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-border">
                  <td className="px-3 py-2 text-center font-semibold">Total</td>
                  <td className="px-3 py-2 text-right">
                    <MoneyText
                      valor={folha.custoTotal}
                      className="font-semibold"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Secao>

      {resumoEncargos.length > 0 ? (
        <Secao titulo="Encargos por tipo">
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-detalhe">
              <thead>
                <tr className="border-b border-border text-legenda text-muted-foreground">
                  <th className="px-3 py-2 text-center font-medium">Encargo</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {resumoEncargos.map((encargo) => (
                  <tr
                    key={encargo.nome}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-3 py-2 text-center">{encargo.nome}</td>
                    <td className="px-3 py-2 text-right">
                      <MoneyText valor={encargo.total} />
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-border">
                  <td className="px-3 py-2 text-center font-semibold">Total</td>
                  <td className="px-3 py-2 text-right">
                    <MoneyText
                      valor={folha.valorEncargos}
                      className="font-semibold"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Secao>
      ) : null}

      {resumoProvisoes.length > 0 ? (
        <Secao titulo="Provisões por tipo">
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-detalhe">
              <thead>
                <tr className="border-b border-border text-legenda text-muted-foreground">
                  <th className="px-3 py-2 text-center font-medium">
                    Provisão
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Principal
                  </th>
                  <th className="px-3 py-2 text-right font-medium">Encargos</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {resumoProvisoes.map((provisao) => (
                  <tr
                    key={provisao.nome}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-3 py-2 text-center">{provisao.nome}</td>
                    <td className="px-3 py-2 text-right">
                      <MoneyText valor={provisao.principal} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <MoneyText valor={provisao.encargos} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <MoneyText
                        valor={provisao.total}
                        className="font-medium"
                      />
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-border">
                  <td className="px-3 py-2 text-center font-semibold">Total</td>
                  {/* Fonte única: soma sobre `resumoProvisoes`, a mesma lista
                      que preenche as linhas acima — as 3 células desta linha
                      sempre somam entre si. `folha.valorProvisoes` (o banco) é
                      a fonte do KPI de custo total, onde uma eventual
                      divergência entre item e consolidado aparece. */}
                  <td className="px-3 py-2 text-right">
                    <MoneyText
                      valor={totalProvisoes.principal}
                      className="font-semibold"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <MoneyText
                      valor={totalProvisoes.encargos}
                      className="font-semibold"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <MoneyText
                      valor={totalProvisoes.total}
                      className="font-semibold"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Secao>
      ) : null}

      <Secao titulo="Lançamentos gerados">
        <LancamentosGerados
          status={folha.status}
          agrupado={lancamentos}
          podeVerLancamento={podeVerLancamento}
        />
      </Secao>

      <Secao titulo="Trilha">
        <Trilha eventos={trilha} />
      </Secao>

      {podeCriar && rascunho ? (
        <GerarFolhaFormDrawer
          aberto={drawerRegerar}
          onAbertoChange={setDrawerRegerar}
          competenciaInicial={folha.competencia.slice(0, 7)}
          onGerada={() => router.refresh()}
        />
      ) : null}

      {podeEditarLinha ? (
        <EditarItemFolhaDrawer
          aberto={itemEmEdicao !== null}
          onAbertoChange={(aberto) => {
            if (!aberto) setItemEmEdicao(null);
          }}
          item={itemEmEdicao}
          folhaId={folha.id}
          onSalvo={() => router.refresh()}
        />
      ) : null}

      {podeEditar && podeEnviar && folha.itens.length > 0 ? (
        <ConfirmDialog
          aberto={dialogEnviar}
          onAbertoChange={setDialogEnviar}
          titulo="Enviar para aprovação"
          descricao="A folha vai para o Admin aprovar. Enquanto estiver pendente, ela não pode ser regerada."
          textoConfirmar="Enviar para aprovação"
          onConfirmar={aoEnviarParaAprovacao}
        />
      ) : null}

      <HoleriteDialog
        item={holeriteItem}
        competencia={folha.competencia}
        fgtsPercentual={fgtsPercentual}
        aberto={holeriteItem !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setHoleriteItem(null);
        }}
      />
    </div>
  );
}
