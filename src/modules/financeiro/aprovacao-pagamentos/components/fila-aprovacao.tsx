"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Check,
  CheckCheck,
  ExternalLink,
  Inbox,
  Paperclip,
  PenLine,
} from "lucide-react";
import { toast } from "sonner";

import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  KPICard,
  MoneyText,
  StatusBadge,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatarBRL, formatarData, formatarMesAno } from "@/lib/formatadores";
import {
  aprovarParcela,
  aprovarParcelasEmLote,
  revisarParcela,
  revisarParcelasEmLote,
} from "@/modules/financeiro/aprovacao-pagamentos/actions";
import type {
  ParcelaPendente,
  ParcelasIncompletas,
  ResumoFora,
} from "@/modules/financeiro/aprovacao-pagamentos/queries";
import { rotuloParcela } from "@/modules/financeiro/_shared/formato";
import { AprovarDialog } from "./aprovar-dialog";
import { PainelConferencia } from "./painel-conferencia";

export interface FilaAprovacaoProps {
  parcelas: ParcelaPendente[];
  /** O que está fora da fila por lançamento incompleto (estado vazio honesto). */
  incompletas: ParcelasIncompletas;
  /** Parcelas devolvidas para ajuste: saíram da fila, seguem na previsão. */
  emRevisao: ResumoFora;
  /** Aprovadas cuja data autorizada ainda não chegou. */
  aguardandoData: ResumoFora;
  /** Fora da fila só porque ninguém escolheu a conta bancária ainda. */
  aguardandoConta: ResumoFora;
  podeAprovar: boolean;
  /** Permissão de desaprovar: é ela que libera mandar para revisão. */
  podeRevisar: boolean;
  /** Libera o atalho do painel para a tela do lançamento. */
  podeEditarLancamento: boolean;
  /** Para a personalização de colunas não vazar entre pessoas no navegador. */
  idUsuario: string;
}

/** O que está sendo aprovado ou revisado: uma linha, ou a seleção inteira. */
type Alvo = { tipo: "linha"; parcela: ParcelaPendente } | { tipo: "lote" };

/**
 * Descrição do estado vazio. "Nada aqui" sozinho manda o usuário procurar um
 * botão de "enviar para aprovação" que não existe: o que segura parcela fora da
 * fila é lançamento incompleto, e é isso que a tela diz.
 */
function descricaoVazia(incompletas: ParcelasIncompletas): string {
  if (incompletas.parcelas === 0) {
    return "Parcelas de dinheiro e cartão de crédito não passam por aqui: elas vão direto para Pagamentos.";
  }
  const plural = incompletas.parcelas > 1;
  return `${incompletas.parcelas} parcela${plural ? "s" : ""} de ${formatarBRL(
    incompletas.valor,
  )} está${plural ? "o" : ""} em ${
    incompletas.lancamentos > 1
      ? `${incompletas.lancamentos} lançamentos incompletos`
      : "um lançamento incompleto"
  }: as parcelas precisam somar o valor do lançamento para entrar na fila.`;
}

/** Soma o valor das parcelas, em centavos para não arrastar erro de float. */
function somarValores(parcelas: ParcelaPendente[]): number {
  const centavos = parcelas.reduce(
    (total, parcela) => total + Math.round(parcela.valor * 100),
    0,
  );
  return centavos / 100;
}

/** Célula do centro de custo: um nome, ou "Rateado" com a composição no tooltip. */
function CelulaCentroCusto({ parcela }: { parcela: ParcelaPendente }) {
  const { rateios } = parcela;
  if (rateios.length === 0) {
    return <span className="text-muted-foreground">-</span>;
  }
  if (rateios.length === 1) return <span>{rateios[0].nome}</span>;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help underline decoration-dotted underline-offset-2">
          Rateado ({rateios.length})
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <div className="flex flex-col gap-0.5">
          {rateios.map((rateio, indice) => (
            <span key={`${rateio.nome}-${indice}`} className="tabular-nums">
              {rateio.nome}: {formatarBRL(rateio.valor)}
            </span>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Fila de aprovação de pagamentos: parcelas a pagar aguardando aval.
 *
 * Aprovar abre o modal da data: aprovar é autorizar o pagamento para um dia, e
 * sem escolha a data cai no vencimento da parcela. Revisar devolve a parcela
 * para quem lançou, com motivo obrigatório, sem cancelar nada: o lançamento
 * continua vivo e continua contando na previsão de caixa.
 *
 * Clicar na linha (fora dos botões) abre o painel de conferência somente
 * leitura, com o lançamento inteiro e navegação entre os itens da fila.
 *
 * A tabela traz mais colunas do que mostra: o padrão visível é enxuto e o
 * usuário liga o resto no menu "Colunas", com largura e ordem guardadas no
 * navegador.
 */
export function FilaAprovacao({
  parcelas,
  incompletas,
  emRevisao,
  aguardandoData,
  aguardandoConta,
  podeAprovar,
  podeRevisar,
  podeEditarLancamento,
  idUsuario,
}: FilaAprovacaoProps) {
  const router = useRouter();
  const [selecionadas, setSelecionadas] = React.useState<Set<string>>(
    new Set(),
  );
  const [alvoAprovacao, setAlvoAprovacao] = React.useState<Alvo | null>(null);
  const [alvoRevisao, setAlvoRevisao] = React.useState<Alvo | null>(null);
  const [emConferencia, setEmConferencia] =
    React.useState<ParcelaPendente | null>(null);

  const totalAprovar = React.useMemo(() => somarValores(parcelas), [parcelas]);

  const selecionadasNaFila = React.useMemo(
    () => parcelas.filter((parcela) => selecionadas.has(parcela.id)),
    [parcelas, selecionadas],
  );
  const totalSelecionado = React.useMemo(
    () => somarValores(selecionadasNaFila),
    [selecionadasNaFila],
  );

  const todasSelecionadas =
    parcelas.length > 0 && selecionadas.size === parcelas.length;
  const algumaSelecionada = selecionadas.size > 0;

  // Índice da parcela em conferência, para as setas do painel andarem na fila.
  const indiceConferencia = emConferencia
    ? parcelas.findIndex((parcela) => parcela.id === emConferencia.id)
    : -1;

  function alternarTodas() {
    setSelecionadas((atual) =>
      atual.size === parcelas.length
        ? new Set()
        : new Set(parcelas.map((parcela) => parcela.id)),
    );
  }

  function alternarUma(id: string) {
    setSelecionadas((atual) => {
      const proxima = new Set(atual);
      if (proxima.has(id)) proxima.delete(id);
      else proxima.add(id);
      return proxima;
    });
  }

  function tirarDaSelecao(id: string) {
    setSelecionadas((atual) => {
      const proxima = new Set(atual);
      proxima.delete(id);
      return proxima;
    });
  }

  async function confirmarAprovacao(dataProgramada: string | null) {
    if (!alvoAprovacao) return;

    if (alvoAprovacao.tipo === "linha") {
      const parcela = alvoAprovacao.parcela;
      const resultado = await aprovarParcela(parcela.id, dataProgramada);
      if ("erro" in resultado) {
        toast.error(resultado.erro);
        return;
      }
      toast.success("Pagamento aprovado");
      tirarDaSelecao(parcela.id);
      if (emConferencia?.id === parcela.id) setEmConferencia(null);
    } else {
      const resultado = await aprovarParcelasEmLote(
        [...selecionadas],
        dataProgramada,
      );
      if ("erro" in resultado) {
        toast.error(
          resultado.aprovadas > 0
            ? `${resultado.aprovadas} pagamento(s) aprovado(s), mas parou: ${resultado.erro}`
            : resultado.erro,
        );
        setSelecionadas(new Set());
        setAlvoAprovacao(null);
        router.refresh();
        return;
      }
      toast.success(`${resultado.aprovadas} pagamento(s) aprovado(s)`);
      setSelecionadas(new Set());
    }

    setAlvoAprovacao(null);
    router.refresh();
  }

  async function confirmarRevisao(motivo?: string) {
    if (!alvoRevisao) return;
    const texto = motivo ?? "";

    if (alvoRevisao.tipo === "linha") {
      const parcela = alvoRevisao.parcela;
      const resultado = await revisarParcela(parcela.id, texto);
      if ("erro" in resultado) {
        toast.error(resultado.erro);
        return;
      }
      toast.success("Pagamento enviado para revisão");
      tirarDaSelecao(parcela.id);
      if (emConferencia?.id === parcela.id) setEmConferencia(null);
    } else {
      const resultado = await revisarParcelasEmLote([...selecionadas], texto);
      if ("erro" in resultado) {
        toast.error(
          resultado.revisadas > 0
            ? `${resultado.revisadas} enviado(s) para revisão, mas parou: ${resultado.erro}`
            : resultado.erro,
        );
        setSelecionadas(new Set());
        setAlvoRevisao(null);
        router.refresh();
        return;
      }
      toast.success(`${resultado.revisadas} enviado(s) para revisão`);
      setSelecionadas(new Set());
    }

    setAlvoRevisao(null);
    router.refresh();
  }

  const colunas = React.useMemo<ColumnDef<ParcelaPendente, unknown>[]>(() => {
    const base: ColumnDef<ParcelaPendente, unknown>[] = [];

    if (podeAprovar || podeRevisar) {
      base.push({
        id: "selecao",
        enableSorting: false,
        size: 44,
        meta: { fixa: true, naoTruncar: true },
        header: () => (
          <Checkbox
            checked={todasSelecionadas}
            onCheckedChange={alternarTodas}
            aria-label="Selecionar todos os pagamentos"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={selecionadas.has(row.original.id)}
            onCheckedChange={() => alternarUma(row.original.id)}
            aria-label={`Selecionar ${rotuloParcela(
              row.original.lancamentoNumero,
              row.original.numeroParcela,
              row.original.totalParcelas,
            )}`}
          />
        ),
      });
    }

    base.push(
      {
        accessorKey: "lancamentoNumero",
        header: "Lançamento",
        size: 260,
        meta: { rotulo: "Lançamento", fixa: true, naoTruncar: true },
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="codigo-doc">
                {rotuloParcela(
                  row.original.lancamentoNumero,
                  row.original.numeroParcela,
                  row.original.totalParcelas,
                )}
              </span>
              {row.original.semNota ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help">
                      <StatusBadge
                        status="pendente_aprovacao"
                        rotulo="Sem nota"
                      />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    A ordem de compra de origem ainda não tem nota fiscal
                    registrada. Não impede aprovar: é aviso para a decisão ser
                    consciente.
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </div>
            <span className="text-legenda text-muted-foreground">
              {row.original.lancamentoDescricao}
            </span>
          </div>
        ),
      },
      {
        id: "origem",
        header: "Origem",
        size: 140,
        enableSorting: false,
        meta: { rotulo: "Origem", ocultaPorPadrao: true, naoTruncar: true },
        cell: ({ row }) =>
          row.original.origem === "oc" && row.original.origemId ? (
            <Link
              href={`/compras/ordens/${row.original.origemId}`}
              onClick={(evento) => evento.stopPropagation()}
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <span className="codigo-doc">
                {row.original.origemNumero ?? "OC"}
              </span>
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </Link>
          ) : (
            <span className="text-muted-foreground">Manual</span>
          ),
      },
      {
        accessorKey: "fornecedorNome",
        header: "Fornecedor",
        size: 200,
        meta: { rotulo: "Fornecedor" },
        cell: ({ row }) => (
          <span className="font-medium">{row.original.fornecedorNome}</span>
        ),
      },
      {
        accessorKey: "lancamentoDescricao",
        header: "Descrição",
        size: 240,
        meta: { rotulo: "Descrição", ocultaPorPadrao: true },
        cell: ({ row }) => <span>{row.original.lancamentoDescricao}</span>,
      },
      {
        accessorKey: "categoriaNome",
        header: "Categoria do custo",
        size: 180,
        meta: { rotulo: "Categoria do custo", ocultaPorPadrao: true },
        cell: ({ row }) => <span>{row.original.categoriaNome ?? "-"}</span>,
      },
      {
        id: "centroCusto",
        header: "Centro de custo",
        size: 180,
        enableSorting: false,
        meta: {
          rotulo: "Centro de custo",
          ocultaPorPadrao: true,
          naoTruncar: true,
        },
        cell: ({ row }) => <CelulaCentroCusto parcela={row.original} />,
      },
      {
        accessorKey: "dataCompra",
        header: "Compra / NF",
        size: 130,
        meta: { rotulo: "Data da compra / NF", ocultaPorPadrao: true },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.dataCompra
              ? formatarData(row.original.dataCompra)
              : "-"}
          </span>
        ),
      },
      {
        accessorKey: "mesCompetencia",
        header: "Mês de referência",
        size: 150,
        meta: { rotulo: "Mês de referência" },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.mesCompetencia
              ? formatarMesAno(row.original.mesCompetencia)
              : "-"}
          </span>
        ),
      },
      {
        accessorKey: "dataVencimento",
        header: "Vencimento",
        size: 130,
        meta: { rotulo: "Vencimento" },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.dataVencimento
              ? formatarData(row.original.dataVencimento)
              : "-"}
          </span>
        ),
      },
      {
        accessorKey: "dataProgramada",
        header: "Data programada",
        size: 160,
        meta: { rotulo: "Data programada", naoTruncar: true },
        cell: ({ row }) =>
          row.original.dataProgramada ? (
            <span className="tabular-nums">
              {formatarData(row.original.dataProgramada)}
            </span>
          ) : (
            <span className="text-legenda text-muted-foreground">
              na aprovação
            </span>
          ),
      },
      {
        accessorKey: "formaPagamentoNome",
        header: "Forma de pagamento",
        size: 170,
        meta: { rotulo: "Forma de pagamento", ocultaPorPadrao: true },
        cell: ({ row }) => (
          <span>{row.original.formaPagamentoNome ?? "-"}</span>
        ),
      },
      {
        accessorKey: "anexos",
        header: "Anexos",
        size: 100,
        meta: {
          rotulo: "Anexos",
          ocultaPorPadrao: true,
          alinharDireita: true,
          naoTruncar: true,
        },
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Paperclip
              className="size-3.5 text-muted-foreground"
              aria-hidden="true"
            />
            {row.original.anexos}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        size: 150,
        enableSorting: false,
        meta: { rotulo: "Status", ocultaPorPadrao: true, naoTruncar: true },
        cell: () => (
          <StatusBadge status="pendente_aprovacao" rotulo="Na fila" />
        ),
      },
      {
        accessorKey: "valor",
        header: "Valor",
        size: 140,
        meta: { rotulo: "Valor", alinharDireita: true },
        cell: ({ row }) => <MoneyText valor={row.original.valor} />,
      },
    );

    if (podeAprovar || podeRevisar) {
      base.push({
        id: "acoes",
        header: "Ações",
        enableSorting: false,
        // Aprovar + Revisar com ícone passam de 190px e o conteúdo transbordava
        // para a esquerda, cobrindo o valor. Valor escondido atrás de botão numa
        // tela de aprovação de dinheiro não serve.
        size: 240,
        meta: {
          rotulo: "Ações",
          fixa: true,
          alinharDireita: true,
          naoTruncar: true,
        },
        cell: ({ row }) => (
          <div
            className="flex items-center justify-end gap-1"
            onClick={(evento) => evento.stopPropagation()}
          >
            {podeAprovar ? (
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  setAlvoAprovacao({ tipo: "linha", parcela: row.original })
                }
              >
                <Check />
                Aprovar
              </Button>
            ) : null}
            {podeRevisar ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setAlvoRevisao({ tipo: "linha", parcela: row.original })
                }
              >
                <PenLine />
                Revisar
              </Button>
            ) : null}
          </div>
        ),
      });
    }

    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [podeAprovar, podeRevisar, selecionadas, todasSelecionadas]);

  const quantidadeRevisao =
    alvoRevisao?.tipo === "linha" ? 1 : selecionadas.size;
  const valorRevisao =
    alvoRevisao?.tipo === "linha"
      ? alvoRevisao.parcela.valor
      : totalSelecionado;

  return (
    // Um provider para a tela inteira: o Tooltip do projeto é o Radix cru, sem
    // provider embutido, e sem ancestral ele lança no cliente na hora em que a
    // primeira linha com tooltip monta ("Sem nota" ou centro de custo rateado).
    // Com a fila vazia nada disso renderiza, então a falta passa despercebida.
    <TooltipProvider>
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <KPICard
            titulo="Total a aprovar"
            valor={formatarBRL(totalAprovar)}
            detalhe={`${parcelas.length} pagamento(s) na fila`}
          />
          <KPICard
            titulo="Em revisão"
            valor={formatarBRL(emRevisao.valor)}
            detalhe={`${emRevisao.parcelas} devolvido(s) para ajuste`}
          />
          <KPICard
            titulo="Aprovado aguardando data"
            valor={formatarBRL(aguardandoData.valor)}
            detalhe={`${aguardandoData.parcelas} com data autorizada à frente`}
          />
        </div>

        {algumaSelecionada ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface px-4 py-2.5">
            <p className="text-detalhe text-foreground">
              {selecionadas.size} selecionado(s)
              <span className="text-muted-foreground">
                {" "}
                · {formatarBRL(totalSelecionado)}
              </span>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {podeRevisar ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAlvoRevisao({ tipo: "lote" })}
                >
                  <PenLine />
                  Enviar selecionados para revisão
                </Button>
              ) : null}
              {podeAprovar ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setAlvoAprovacao({ tipo: "lote" })}
                >
                  <CheckCheck />
                  Aprovar selecionados
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        <DataTable
          columns={colunas}
          data={parcelas}
          onRowClick={setEmConferencia}
          idTabela="financeiro.aprovacao-pagamentos"
          idUsuario={idUsuario}
          cabecalhoFixo
          emptyState={
            <EmptyState
              icone={Inbox}
              titulo="Nenhum pagamento aguardando aprovação"
              descricao={descricaoVazia(incompletas)}
              className="border-none bg-transparent"
            />
          }
        />

        <PainelConferencia
          parcela={emConferencia}
          onFechar={() => setEmConferencia(null)}
          posicao={
            indiceConferencia >= 0
              ? { atual: indiceConferencia + 1, total: parcelas.length }
              : null
          }
          onAnterior={
            indiceConferencia > 0
              ? () => setEmConferencia(parcelas[indiceConferencia - 1])
              : null
          }
          onProximo={
            indiceConferencia >= 0 && indiceConferencia < parcelas.length - 1
              ? () => setEmConferencia(parcelas[indiceConferencia + 1])
              : null
          }
          podeAprovar={podeAprovar}
          podeRevisar={podeRevisar}
          podeEditarLancamento={podeEditarLancamento}
          onAprovar={(parcela) => setAlvoAprovacao({ tipo: "linha", parcela })}
          onRevisar={(parcela) => setAlvoRevisao({ tipo: "linha", parcela })}
        />

        <AprovarDialog
          aberto={alvoAprovacao !== null}
          onAbertoChange={(aberto) => {
            if (!aberto) setAlvoAprovacao(null);
          }}
          quantidade={alvoAprovacao?.tipo === "linha" ? 1 : selecionadas.size}
          valorTotal={
            alvoAprovacao?.tipo === "linha"
              ? alvoAprovacao.parcela.valor
              : totalSelecionado
          }
          vencimento={
            alvoAprovacao?.tipo === "linha"
              ? alvoAprovacao.parcela.dataVencimento
              : null
          }
          onConfirmar={confirmarAprovacao}
        />

        <ConfirmDialog
          aberto={alvoRevisao !== null}
          onAbertoChange={(aberto) => {
            if (!aberto) setAlvoRevisao(null);
          }}
          titulo={
            quantidadeRevisao > 1
              ? `Enviar ${quantidadeRevisao} pagamentos para revisão`
              : "Enviar para revisão"
          }
          descricao={`${formatarBRL(valorRevisao)}${
            quantidadeRevisao > 1 ? ` em ${quantidadeRevisao} parcelas` : ""
          }. ${
            quantidadeRevisao > 1 ? "As parcelas saem" : "A parcela sai"
          } da fila e ${
            quantidadeRevisao > 1 ? "voltam" : "volta"
          } para quem lançou ajustar. Nada é cancelado: o lançamento continua valendo e continua na previsão de caixa. O motivo vale para ${
            quantidadeRevisao > 1 ? "todas" : "a parcela"
          } (ex.: valor divergente da NF, falta anexo, centro de custo errado).`}
          textoConfirmar="Enviar para revisão"
          exigeMotivo
          onConfirmar={confirmarRevisao}
        />
      </div>
    </TooltipProvider>
  );
}
