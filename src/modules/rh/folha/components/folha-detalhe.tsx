"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Lock, RotateCcw, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import {
  ConfirmDialog,
  KPICard,
  MoneyText,
  StatusBadge,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { formatarData, formatarQuantidade } from "@/lib/formatadores";
import { STATUS_FOLHA } from "@/modules/rh/_shared/formato";
import { fecharFolha, reabrirFolha } from "@/modules/rh/folha/actions";
import type {
  CustoCentroCusto,
  FolhaDetalhe,
} from "@/modules/rh/folha/queries";
import { BotaoPlanilha } from "./botao-planilha";
import { GerarFolhaFormDrawer } from "./gerar-folha-form-drawer";

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
  podeCriar: boolean;
  podeEditar: boolean;
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
  podeCriar,
  podeEditar,
}: FolhaDetalheViewProps) {
  const router = useRouter();
  const info = STATUS_FOLHA[folha.status];

  const rascunho = folha.status === "rascunho";
  const fechada = folha.status === "fechada";

  const [dialogFechar, setDialogFechar] = React.useState(false);
  const [drawerRegerar, setDrawerRegerar] = React.useState(false);

  async function aoFechar() {
    const resultado = await fecharFolha(folha.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Folha fechada");
    router.refresh();
  }

  async function aoReabrir() {
    const resultado = await reabrirFolha(folha.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Folha reaberta");
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
              {folha.dataFechamento
                ? ` · fechada em ${formatarData(folha.dataFechamento)}`
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
          {podeEditar && rascunho ? (
            <Button
              type="button"
              size="sm"
              onClick={() => setDialogFechar(true)}
            >
              <Lock />
              Fechar
            </Button>
          ) : null}
          {podeEditar && fechada ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={aoReabrir}
            >
              <RotateCcw />
              Reabrir
            </Button>
          ) : null}
          <BotaoPlanilha folhaId={folha.id} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KPICard
          titulo="Bruto"
          valor={<MoneyText valor={folha.valorBruto} />}
          detalhe="Salário base + extras"
        />
        <KPICard
          titulo="Encargos"
          valor={<MoneyText valor={folha.valorEncargos} />}
          detalhe={`${formatarQuantidade(folha.encargosPercentual)}% aplicado`}
        />
        <KPICard
          titulo="Custo total"
          valor={<MoneyText valor={folha.custoTotal} />}
          detalhe="Custo da empresa (bruto + encargos)"
        />
        <KPICard
          titulo="Líquido"
          valor={<MoneyText valor={folha.valorLiquido} />}
          detalhe="A receber (bruto − adiantamentos)"
        />
      </div>

      <Secao titulo="Itens por colaborador">
        {folha.itens.length === 0 ? (
          <p className="text-detalhe text-muted-foreground">
            Nenhum colaborador nesta folha. Verifique os colaboradores CLT
            ativos e regere a folha.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-detalhe">
              <thead>
                <tr className="border-b border-border text-legenda text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">
                    Colaborador
                  </th>
                  <th className="px-3 py-2 text-left font-medium">Função</th>
                  <th className="px-3 py-2 text-left font-medium">
                    Centro de custo
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Salário base
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
                  <th className="px-3 py-2 text-right font-medium">Encargos</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Adiantamentos
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Custo total
                  </th>
                  <th className="px-3 py-2 text-right font-medium">Líquido</th>
                </tr>
              </thead>
              <tbody>
                {folha.itens.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-3 py-2 font-medium">
                      {item.colaboradorNome}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {item.colaboradorFuncao ?? "-"}
                    </td>
                    <td className="px-3 py-2">
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
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <MoneyText valor={item.salarioBase} />
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
                      <MoneyText valor={item.encargos} />
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
                  <th className="px-3 py-2 text-left font-medium">
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
                    <td className="px-3 py-2">{rotuloCentroCusto(grupo)}</td>
                    <td className="px-3 py-2 text-right">
                      <MoneyText valor={grupo.custoTotal} />
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-border">
                  <td className="px-3 py-2 font-semibold">Total</td>
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

      {podeCriar && rascunho ? (
        <GerarFolhaFormDrawer
          aberto={drawerRegerar}
          onAbertoChange={setDrawerRegerar}
          competenciaInicial={folha.competencia.slice(0, 7)}
          encargosInicial={String(folha.encargosPercentual).replace(".", ",")}
          onGerada={() => router.refresh()}
        />
      ) : null}

      {podeEditar && rascunho ? (
        <ConfirmDialog
          aberto={dialogFechar}
          onAbertoChange={setDialogFechar}
          titulo="Fechar folha"
          descricao="A folha fica travada para consulta e exportação. Você pode reabrir depois para regerar."
          textoConfirmar="Fechar folha"
          onConfirmar={aoFechar}
        />
      ) : null}
    </div>
  );
}
