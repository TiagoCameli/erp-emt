"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Lock, Pencil } from "lucide-react";

import {
  MoneyText,
  StatusBadge,
  Trilha,
  type EventoTrilha,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { formatarBRL, formatarData } from "@/lib/formatadores";
import {
  ROTULO_TIPO_LANCAMENTO,
  STATUS_LANCAMENTO,
  STATUS_PARCELA,
} from "@/modules/financeiro/_shared/formato";
import { LancamentoFormDrawer } from "./lancamento-form-drawer";
import type {
  CategoriaOpcao,
  CentroCustoOpcao,
  FornecedorOpcao,
  LancamentoDetalhe,
} from "@/modules/financeiro/lancamentos/queries";

/** Card de seção do detalhe (mesmo tratamento visual do detalhe da OC). */
function Secao({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-border bg-surface p-4">
      <h2 className="mb-3 text-secao font-semibold">{titulo}</h2>
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

export interface LancamentoDetalheViewProps {
  lancamento: LancamentoDetalhe;
  trilha: EventoTrilha[];
  categorias: CategoriaOpcao[];
  fornecedores: FornecedorOpcao[];
  centrosCusto: CentroCustoOpcao[];
  podeEditar: boolean;
}

/**
 * Detalhe do lançamento: cabeçalho, dados, parcelas com status, rateio por
 * centro de custo e trilha. A edição é bloqueada para lançamentos de origem
 * diferente de 'manual' (ex: vindos de uma OC) ou com alguma parcela paga.
 */
export function LancamentoDetalheView({
  lancamento,
  trilha,
  categorias,
  fornecedores,
  centrosCusto,
  podeEditar,
}: LancamentoDetalheViewProps) {
  const router = useRouter();
  const [drawerAberto, setDrawerAberto] = React.useState(false);

  const ehManual = lancamento.origem === "manual";
  const temParcelaPaga = lancamento.parcelas.some(
    (parcela) => parcela.status === "pago",
  );
  const editavel = podeEditar && ehManual && !temParcelaPaga;
  const infoStatus = STATUS_LANCAMENTO[lancamento.status];

  const motivoBloqueio = !ehManual
    ? `Lançamento de origem ${lancamento.origem}. Edite na origem.`
    : temParcelaPaga
      ? "Tem parcela paga. Não dá para editar."
      : null;

  const somaRateios = lancamento.rateios.reduce(
    (total, rateio) => total + rateio.valor,
    0,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Voltar para a lista"
            onClick={() => router.push("/financeiro/lancamentos")}
          >
            <ArrowLeft />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-titulo font-semibold">
                <span className="codigo-doc">
                  {lancamento.numero ?? "Sem número"}
                </span>
              </h1>
              <StatusBadge
                status={infoStatus.badge}
                rotulo={infoStatus.rotulo}
              />
              <StatusBadge
                status={
                  lancamento.tipo === "a_receber"
                    ? "aprovado"
                    : "pendente_aprovacao"
                }
                rotulo={ROTULO_TIPO_LANCAMENTO[lancamento.tipo]}
              />
            </div>
            <p className="text-detalhe text-muted-foreground">
              {lancamento.descricao}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {editavel ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDrawerAberto(true)}
            >
              <Pencil />
              Editar
            </Button>
          ) : podeEditar && motivoBloqueio ? (
            <span className="flex items-center gap-1.5 text-legenda text-muted-foreground">
              <Lock className="size-3.5" aria-hidden="true" />
              {motivoBloqueio}
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Secao titulo="Dados do lançamento">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Dado rotulo="Tipo">
                {ROTULO_TIPO_LANCAMENTO[lancamento.tipo]}
              </Dado>
              <Dado rotulo="Fornecedor">{lancamento.fornecedorNome ?? "-"}</Dado>
              <Dado rotulo="Categoria">{lancamento.categoriaNome ?? "-"}</Dado>
              <Dado rotulo="Competência">
                {lancamento.competencia
                  ? formatarData(lancamento.competencia)
                  : "-"}
              </Dado>
              <Dado rotulo="Emissão">
                {formatarData(lancamento.dataEmissao)}
              </Dado>
              <Dado rotulo="Vencimento">
                {lancamento.dataVencimento
                  ? formatarData(lancamento.dataVencimento)
                  : "-"}
              </Dado>
              <Dado rotulo="Valor">
                <MoneyText valor={lancamento.valor} className="font-semibold" />
              </Dado>
            </div>
          </Secao>

          <Secao titulo="Parcelas">
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-detalhe">
                <thead>
                  <tr className="border-b border-border text-legenda text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">#</th>
                    <th className="px-3 py-2 text-left font-medium">
                      Vencimento
                    </th>
                    <th className="px-3 py-2 text-left font-medium">Conta</th>
                    <th className="px-3 py-2 text-left font-medium">Pagamento</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-right font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {lancamento.parcelas.map((parcela) => {
                    const infoParcela = STATUS_PARCELA[parcela.status];
                    return (
                      <tr
                        key={parcela.id}
                        className="border-b border-border last:border-0"
                      >
                        <td className="px-3 py-2 tabular-nums">
                          {parcela.numeroParcela}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {parcela.dataVencimento
                            ? formatarData(parcela.dataVencimento)
                            : "-"}
                        </td>
                        <td className="px-3 py-2">
                          {parcela.contaBancariaNome ?? "-"}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {parcela.dataPagamento
                            ? formatarData(parcela.dataPagamento)
                            : "-"}
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge
                            status={infoParcela.badge}
                            rotulo={infoParcela.rotulo}
                          />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatarBRL(parcela.valor)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="font-semibold">
                    <td className="px-3 py-2" colSpan={5}>
                      Total
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatarBRL(lancamento.valor)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Secao>

          <Secao titulo="Rateio por centro de custo">
            {lancamento.rateios.length > 0 ? (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-detalhe">
                  <thead>
                    <tr className="border-b border-border text-legenda text-muted-foreground">
                      <th className="px-3 py-2 text-left font-medium">
                        Centro de custo
                      </th>
                      <th className="px-3 py-2 text-right font-medium">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lancamento.rateios.map((rateio) => (
                      <tr
                        key={rateio.id}
                        className="border-b border-border last:border-0"
                      >
                        <td className="px-3 py-2">
                          {rateio.centroCustoCodigo ? (
                            <span className="codigo-doc mr-1.5">
                              {rateio.centroCustoCodigo}
                            </span>
                          ) : null}
                          {rateio.centroCustoNome}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatarBRL(rateio.valor)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold">
                      <td className="px-3 py-2">Total do rateio</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatarBRL(somaRateios)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <p className="text-detalhe text-muted-foreground">
                Sem rateio. O custo não foi distribuído por centro de custo.
              </p>
            )}
          </Secao>
        </div>

        <div className="lg:col-span-1">
          <Secao titulo="Trilha">
            <Trilha eventos={trilha} />
          </Secao>
        </div>
      </div>

      {editavel ? (
        <LancamentoFormDrawer
          aberto={drawerAberto}
          onAbertoChange={(aberto) => {
            setDrawerAberto(aberto);
            if (!aberto) router.refresh();
          }}
          lancamento={lancamento}
          categorias={categorias}
          fornecedores={fornecedores}
          centrosCusto={centrosCusto}
        />
      ) : null}
    </div>
  );
}
