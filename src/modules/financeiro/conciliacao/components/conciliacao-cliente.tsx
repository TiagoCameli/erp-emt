"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import {
  ArrowLeftRight,
  CheckCheck,
  FilePlus2,
  Link2,
  LoaderCircle,
  Pencil,
  Trash2,
  Upload,
  Wand2,
  X,
} from "lucide-react";

import {
  BarraSelecao,
  CelulaVazia,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroSelect,
  GradeKpis,
  KPICard,
  MoneyText,
  StatusBadge,
  type FiltroConfiguravel,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { formatarBRL, formatarData, formatarMesAno } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import { usePaginacaoCliente } from "@/modules/_shared/filtros-cliente";
import {
  casarAutomatico,
  desconciliar,
  excluirLancamentoDaConciliacao,
} from "@/modules/financeiro/conciliacao/actions";
import {
  casarAutomaticamente,
  palavrasEmComum,
  pareceAplicacaoAutomatica,
  sugerirParaMovimento,
  type Sugestao,
} from "@/modules/financeiro/conciliacao/casamento";
import {
  candidatosDoPainel,
  montarVisoes,
  movimentosLivres,
  somar,
  type CandidatoDoPainel,
  type ItemForaDoBanco,
  type PainelConciliacao,
  type ParcelaLivre,
  type TransacaoPainel,
} from "@/modules/financeiro/conciliacao/painel";
import type { ContaBancariaOpcao } from "@/modules/financeiro/conciliacao/queries";
import { CasarDialog } from "./casar-dialog";
import { ImportarOfxDialog } from "./importar-ofx-dialog";
import { LancarDrawer, type OpcoesLancamento } from "./lancar-drawer";
import { TransferirDialog } from "./transferir-dialog";
import { TrocarContaDialog } from "./trocar-conta-dialog";
import { ValorMovimento } from "./valor-movimento";

export type VisaoConciliacao = "faltam" | "fora" | "casados";

export interface PermissoesConciliacao {
  importar: boolean;
  conciliar: boolean;
  lancar: boolean;
  transferir: boolean;
  excluir: boolean;
}

export interface ConciliacaoClienteProps {
  conta: ContaBancariaOpcao;
  /** Contas que têm extrato, para trocar de conta sem voltar. */
  contasConciliaveis: ContaBancariaOpcao[];
  /** Todas as contas ativas (troca de conta, transferência, importação). */
  contas: ContaBancariaOpcao[];
  mes: string;
  meses: string[];
  periodo: { inicio: string; fim: string };
  painel: PainelConciliacao;
  visao: VisaoConciliacao;
  opcoes: OpcoesLancamento;
  permissoes: PermissoesConciliacao;
}

function hrefDe(contaId: string, mes: string, visao: VisaoConciliacao): string {
  const params = new URLSearchParams({ conta: contaId, mes, ver: visao });
  return `?${params.toString()}`;
}

function quantos(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

/** Texto curto do que está no app para um movimento casado. */
function vinculoDe(transacao: TransacaoPainel): string {
  if (transacao.parcela) {
    const p = transacao.parcela;
    return [p.lancamentoNumero, p.nome, p.descricao].filter(Boolean).join(" · ");
  }
  if (transacao.transferencia) {
    const t = transacao.transferencia;
    return `${t.numero ? `${t.numero} · ` : ""}${t.origemNome ?? "-"} para ${t.destinoNome ?? "-"}`;
  }
  return "-";
}

/**
 * Conciliação de UMA conta num mês. Três visões, escolhidas pelos cartões do
 * topo:
 *
 * - **Faltam no app**: está no extrato e não no app. Casa com o que já existe
 *   (inclusive pago em outra conta ou ainda em aberto), lança já pago com
 *   centro de custo e mês de referência, ou lança como transferência.
 * - **No app, fora do banco**: pago nesta conta no mês e o extrato não mostra.
 *   Muda para a conta certa ou exclui.
 * - **Casados**: o que já bateu. O automático fica marcado, e o que casou sem
 *   o nome confirmar aparece como "Confira".
 *
 * A conciliação do mês está fechada quando as duas primeiras visões zeram.
 */
export function ConciliacaoCliente({
  conta,
  contasConciliaveis,
  contas,
  mes,
  meses,
  periodo,
  painel,
  visao,
  opcoes,
  permissoes,
}: ConciliacaoClienteProps) {
  const router = useRouter();
  const visoes = React.useMemo(() => montarVisoes(painel, periodo), [painel, periodo]);
  const candidatos = React.useMemo(() => candidatosDoPainel(painel), [painel]);
  const paresAutomaticos = React.useMemo(
    () => casarAutomaticamente(movimentosLivres(painel), candidatos),
    [painel, candidatos],
  );

  const [importarAberto, setImportarAberto] = React.useState(false);
  const [casando, setCasando] = React.useState(false);
  const [casarAlvoId, setCasarAlvoId] = React.useState<string | null>(null);
  const [lancarIds, setLancarIds] = React.useState<string[] | null>(null);
  const [transferirIds, setTransferirIds] = React.useState<string[] | null>(null);
  const [trocarConta, setTrocarConta] = React.useState<ParcelaLivre | null>(null);
  const [excluirAlvo, setExcluirAlvo] = React.useState<ParcelaLivre | null>(null);
  const [desfazerAlvo, setDesfazerAlvo] = React.useState<TransacaoPainel | null>(null);

  const porId = React.useMemo(
    () => new Map(painel.transacoes.map((t) => [t.id, t])),
    [painel.transacoes],
  );
  const casarAlvo = casarAlvoId ? (porId.get(casarAlvoId) ?? null) : null;
  const transacoesDe = (ids: string[] | null) =>
    (ids ?? []).map((id) => porId.get(id)).filter((t): t is TransacaoPainel => !!t);

  const somaFaltam = somar(visoes.faltamNoApp.map((t) => t.valor));
  const somaFora = somar(visoes.foraDoBanco.map((i) => i.valor));
  const total = painel.transacoes.length;
  const fechado = visoes.faltamNoApp.length === 0 && visoes.foraDoBanco.length === 0;

  function trocarConta_(contaId: string) {
    router.push(`?${new URLSearchParams({ conta: contaId }).toString()}`);
  }
  function trocarMes(novo: string) {
    router.push(hrefDe(conta.id, novo, visao));
  }

  async function rodarAutomatico() {
    setCasando(true);
    const resposta = await casarAutomatico(conta.id, mes);
    setCasando(false);
    if ("erro" in resposta) {
      toast.error(resposta.erro);
      return;
    }
    toast.success(
      `${quantos(resposta.feitos, "movimento casado", "movimentos casados")}` +
        (resposta.falhas.length > 0 ? `, ${resposta.falhas.length} não casaram` : ""),
    );
    router.refresh();
  }

  async function confirmarDesfazer() {
    if (!desfazerAlvo) return;
    const resposta = await desconciliar(desfazerAlvo.id);
    if ("erro" in resposta) {
      toast.error(resposta.erro);
      return false;
    }
    toast.success("Casamento desfeito: o movimento voltou para Faltam no app");
    setDesfazerAlvo(null);
    router.refresh();
  }

  async function confirmarExcluir(motivo?: string) {
    if (!excluirAlvo) return;
    const resposta = await excluirLancamentoDaConciliacao(excluirAlvo.id, motivo ?? "");
    if ("erro" in resposta) {
      toast.error(resposta.erro);
      return false;
    }
    toast.success("Lançamento excluído");
    setExcluirAlvo(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <FiltroSelect
          valor={conta.id}
          onValorChange={(valor) => valor && trocarConta_(valor)}
          opcoes={contasConciliaveis.map((c) => ({ valor: c.id, rotulo: c.nome }))}
          placeholder="Conta"
          className="max-w-72"
        />
        <FiltroSelect
          valor={mes}
          onValorChange={(valor) => valor && trocarMes(valor)}
          opcoes={meses.map((m) => ({ valor: m, rotulo: formatarMesAno(`${m}-01`) }))}
          placeholder="Mês"
          className="max-w-48"
        />
        <div className="ml-auto flex flex-wrap gap-2">
          {permissoes.conciliar && paresAutomaticos.length > 0 ? (
            <Button type="button" size="sm" onClick={() => void rodarAutomatico()} disabled={casando}>
              {casando ? <LoaderCircle className="animate-spin" /> : <Wand2 />}
              Casar automaticamente ({paresAutomaticos.length})
            </Button>
          ) : null}
          {permissoes.importar ? (
            <Button type="button" size="sm" variant="outline" onClick={() => setImportarAberto(true)}>
              <Upload />
              Importar OFX
            </Button>
          ) : null}
        </div>
      </div>

      <GradeKpis>
        <KPICard
          titulo="Faltam no app"
          valor={visoes.faltamNoApp.length}
          detalhe={
            visoes.faltamNoApp.length > 0 ? (
              <>
                Saldo <MoneyText valor={somaFaltam} /> no extrato
              </>
            ) : (
              "Todo o extrato está no app"
            )
          }
          href={hrefDe(conta.id, mes, "faltam")}
          className={cn(visao === "faltam" && "border-foreground")}
        />
        <KPICard
          titulo="No app, fora do banco"
          valor={visoes.foraDoBanco.length}
          detalhe={
            visoes.foraDoBanco.length > 0 ? (
              <>
                Saldo <MoneyText valor={somaFora} /> lançado no app
              </>
            ) : (
              "Nada sobrando no app"
            )
          }
          href={hrefDe(conta.id, mes, "fora")}
          className={cn(visao === "fora" && "border-foreground")}
        />
        <KPICard
          titulo="Casados"
          valor={`${visoes.casados.length} de ${total}`}
          detalhe={
            fechado && total > 0
              ? "Mês conciliado"
              : total > 0
                ? `${Math.round((visoes.casados.length / total) * 100)}% do extrato`
                : undefined
          }
          href={hrefDe(conta.id, mes, "casados")}
          className={cn(visao === "casados" && "border-foreground")}
        />
      </GradeKpis>

      {visao === "faltam" ? (
        <TabelaFaltam
          transacoes={visoes.faltamNoApp}
          candidatos={candidatos}
          permissoes={permissoes}
          onCasar={setCasarAlvoId}
          onLancar={setLancarIds}
          onTransferir={setTransferirIds}
        />
      ) : visao === "fora" ? (
        <TabelaForaDoBanco
          itens={visoes.foraDoBanco}
          permissoes={permissoes}
          onTrocarConta={setTrocarConta}
          onExcluir={setExcluirAlvo}
        />
      ) : (
        <TabelaCasados
          transacoes={visoes.casados}
          permissoes={permissoes}
          onDesfazer={setDesfazerAlvo}
        />
      )}

      <ImportarOfxDialog
        key={importarAberto ? "import-aberto" : "import-fechado"}
        aberto={importarAberto}
        onAbertoChange={setImportarAberto}
        contas={contas}
        contaInicialId={conta.id}
      />

      <CasarDialog
        key={`casar-${casarAlvoId ?? ""}`}
        aberto={casarAlvo !== null}
        onAbertoChange={(aberto) => !aberto && setCasarAlvoId(null)}
        transacao={casarAlvo}
        candidatos={candidatos}
      />

      <LancarDrawer
        key={`lancar-${(lancarIds ?? []).join(",")}`}
        aberto={lancarIds !== null}
        onAbertoChange={(aberto) => !aberto && setLancarIds(null)}
        transacoes={transacoesDe(lancarIds)}
        opcoes={opcoes}
      />

      <TransferirDialog
        key={`transferir-${(transferirIds ?? []).join(",")}`}
        aberto={transferirIds !== null}
        onAbertoChange={(aberto) => !aberto && setTransferirIds(null)}
        transacoes={transacoesDe(transferirIds)}
        conta={conta}
        contas={contas}
        centros={opcoes.centros}
      />

      <TrocarContaDialog
        key={`trocar-${trocarConta?.id ?? ""}`}
        aberto={trocarConta !== null}
        onAbertoChange={(aberto) => !aberto && setTrocarConta(null)}
        parcela={trocarConta}
        contaAtualId={conta.id}
        contas={contas}
      />

      <ConfirmDialog
        aberto={excluirAlvo !== null}
        onAbertoChange={(aberto) => !aberto && setExcluirAlvo(null)}
        titulo="Excluir lançamento"
        descricao={
          excluirAlvo
            ? `${[excluirAlvo.lancamentoNumero, excluirAlvo.nome].filter(Boolean).join(" · ")}, ${formatarBRL(excluirAlvo.valorLiquido)}. O pagamento não saiu do banco e o lançamento sai do app. Fica uma cópia no arquivo morto.`
            : ""
        }
        textoConfirmar="Excluir lançamento"
        variante="destrutivo"
        exigeMotivo
        minMotivo={3}
        onConfirmar={confirmarExcluir}
      />

      <ConfirmDialog
        aberto={desfazerAlvo !== null}
        onAbertoChange={(aberto) => !aberto && setDesfazerAlvo(null)}
        titulo="Desfazer casamento"
        descricao="O movimento volta para Faltam no app e o lançamento fica livre para casar com outro. O que o casamento mudou na parcela (conta, baixa, ajuste) continua como está."
        textoConfirmar="Desfazer"
        variante="destrutivo"
        onConfirmar={confirmarDesfazer}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Faltam no app
// ---------------------------------------------------------------------------

function resumoSugestao(sugestao: Sugestao | undefined): string | null {
  if (!sugestao) return null;
  const c = sugestao.candidato;
  const quem =
    c.nomes.find((n): n is string => !!n) ?? (c.especie === "transferencia" ? "Transferência" : "");
  const grupo =
    c.grupo === "aberta"
      ? "Em aberto"
      : c.grupo === "paga_outra_conta"
        ? "Paga em outra conta"
        : c.grupo === "transferencia"
          ? "Transferência"
          : "Paga nesta conta";
  const diferenca =
    sugestao.diferenca !== 0 ? `, difere ${formatarBRL(Math.abs(sugestao.diferenca))}` : "";
  return `${grupo}: ${quem}${diferenca}`;
}

function TabelaFaltam({
  transacoes,
  candidatos,
  permissoes,
  onCasar,
  onLancar,
  onTransferir,
}: {
  transacoes: TransacaoPainel[];
  candidatos: CandidatoDoPainel[];
  permissoes: PermissoesConciliacao;
  onCasar: (id: string) => void;
  onLancar: (ids: string[]) => void;
  onTransferir: (ids: string[]) => void;
}) {
  const [busca, setBusca] = React.useState("");
  const [tipo, setTipo] = React.useState("");
  const [selecionados, setSelecionados] = React.useState<string[]>([]);
  const { paginacao, setPaginacao, zerarPagina } = usePaginacaoCliente();

  const sugestoes = React.useMemo(() => {
    const mapa = new Map<string, Sugestao<CandidatoDoPainel> | undefined>();
    for (const t of transacoes) {
      mapa.set(
        t.id,
        sugerirParaMovimento(
          { id: t.id, dataMovimento: t.dataMovimento, valor: t.valor, memo: t.memo },
          candidatos,
        )[0],
      );
    }
    return mapa;
  }, [transacoes, candidatos]);

  const dados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return transacoes.filter((t) => {
      if (tipo && t.tipo !== tipo) return false;
      if (termo && !`${t.memo ?? ""} ${formatarBRL(Math.abs(t.valor))}`.toLowerCase().includes(termo)) {
        return false;
      }
      return true;
    });
  }, [transacoes, busca, tipo]);

  const validos = selecionados.filter((id) => transacoes.some((t) => t.id === id));
  const marcadas = transacoes.filter((t) => validos.includes(t.id));
  const sentidos = new Set(marcadas.map((t) => t.tipo));
  const misturado = sentidos.size > 1;

  const colunas = React.useMemo<ColumnDef<TransacaoPainel, unknown>[]>(
    () => [
      {
        accessorKey: "dataMovimento",
        header: "Data",
        size: 110,
        cell: ({ row }) => <span className="tabular-nums">{formatarData(row.original.dataMovimento)}</span>,
      },
      {
        accessorKey: "memo",
        header: "Histórico do banco",
        size: 380,
        meta: { celular: "titulo" },
        cell: ({ row }) => row.original.memo ?? <CelulaVazia />,
      },
      {
        accessorKey: "valor",
        header: "Valor",
        size: 140,
        meta: { alinharDireita: true, celular: "valor" },
        cell: ({ row }) => <ValorMovimento valor={row.original.valor} />,
      },
      {
        id: "sugestao",
        header: "O app tem",
        size: 300,
        cell: ({ row }) => {
          if (pareceAplicacaoAutomatica(row.original.memo)) {
            return <span className="text-muted-foreground">Aplicação automática: lance como transferência</span>;
          }
          const texto = resumoSugestao(sugestoes.get(row.original.id));
          return texto ? (
            <span className="text-status-pendente" title={texto}>
              {texto}
            </span>
          ) : (
            <span className="text-muted-foreground">Nada parecido: lançar</span>
          );
        },
      },
      {
        id: "acoes",
        header: "",
        size: 290,
        meta: { alinharDireita: true, fixa: true, rotulo: "Ações" },
        cell: ({ row }) => {
          const t = row.original;
          const aplicacao = pareceAplicacaoAutomatica(t.memo);
          return (
            <div className="flex justify-end gap-1">
              {permissoes.conciliar ? (
                <Button type="button" size="sm" variant="outline" onClick={() => onCasar(t.id)}>
                  <Link2 />
                  Casar
                </Button>
              ) : null}
              {permissoes.conciliar && permissoes.lancar && !aplicacao ? (
                <Button type="button" size="sm" variant="outline" onClick={() => onLancar([t.id])}>
                  <FilePlus2 />
                  Lançar
                </Button>
              ) : null}
              {permissoes.conciliar && permissoes.transferir ? (
                <Button
                  type="button"
                  size="sm"
                  variant={aplicacao ? "outline" : "ghost"}
                  onClick={() => onTransferir([t.id])}
                  aria-label="Lançar como transferência"
                  title="Lançar como transferência"
                >
                  <ArrowLeftRight />
                  {aplicacao ? "Transferência" : null}
                </Button>
              ) : null}
            </div>
          );
        },
      },
    ],
    [sugestoes, permissoes, onCasar, onLancar, onTransferir],
  );

  const filtros: FiltroConfiguravel[] = [
    {
      id: "busca",
      rotulo: "Busca",
      fixo: true,
      temValor: busca !== "",
      onLimpar: () => setBusca(""),
      elemento: (
        <FiltroBusca
          valor={busca}
          onValorChange={(v) => {
            setBusca(v);
            zerarPagina();
          }}
          placeholder="Buscar no histórico ou valor"
        />
      ),
    },
    {
      id: "tipo",
      rotulo: "Entrada ou saída",
      temValor: tipo !== "",
      onLimpar: () => setTipo(""),
      elemento: (
        <FiltroSelect
          valor={tipo}
          onValorChange={(v) => {
            setTipo(v);
            zerarPagina();
          }}
          opcoes={[
            { valor: "debito", rotulo: "Saídas" },
            { valor: "credito", rotulo: "Entradas" },
          ]}
          placeholder="Entrada ou saída"
          todosRotulo="Entradas e saídas"
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      {validos.length > 0 ? (
        <BarraSelecao
          quantidade={validos.length}
          onLimpar={() => setSelecionados([])}
          resumo={
            misturado
              ? "Marque só entradas ou só saídas para lançar juntas"
              : `Total ${formatarBRL(Math.abs(somar(marcadas.map((t) => t.valor))))}`
          }
        >
          {permissoes.lancar ? (
            <Button type="button" size="sm" disabled={misturado} onClick={() => onLancar(validos)}>
              <FilePlus2 />
              Lançar {validos.length}
            </Button>
          ) : null}
          {permissoes.transferir ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={misturado}
              onClick={() => onTransferir(validos)}
            >
              <ArrowLeftRight />
              Transferência
            </Button>
          ) : null}
        </BarraSelecao>
      ) : null}
      <DataTable
        idTabela="financeiro.conciliacao.faltam"
        columns={colunas}
        data={dados}
        filtros={filtros}
        pageIndex={paginacao.pageIndex}
        pageSize={paginacao.pageSize}
        onPaginationChange={setPaginacao}
        selecao={
          permissoes.conciliar && (permissoes.lancar || permissoes.transferir)
            ? {
                idDaLinha: (t: TransacaoPainel) => t.id,
                selecionados: validos,
                onSelecionadosChange: setSelecionados,
              }
            : undefined
        }
        emptyState={
          <EmptyState
            icone={CheckCheck}
            titulo={transacoes.length === 0 ? "Todo o extrato está no app" : "Nenhum movimento com esses filtros"}
            descricao={
              transacoes.length === 0
                ? "Cada movimento do banco neste mês já casou com um lançamento ou transferência."
                : "Ajuste ou limpe os filtros."
            }
            className="border-none bg-transparent"
          />
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// No app, fora do banco
// ---------------------------------------------------------------------------

const ROTULO_ORIGEM: Record<string, string> = {
  manual: "Manual",
  oc: "Ordem de compra",
  diaria: "Diária",
  folha: "Folha",
  folha_guia: "Guia da folha",
  adiantamento: "Adiantamento",
  rescisao: "Rescisão",
  decimo_terceiro: "13º",
  ferias: "Férias",
  decimo_terceiro_guia: "Guia do 13º",
  ferias_guia: "Guia de férias",
  aplicacao: "Aplicação",
};

function TabelaForaDoBanco({
  itens,
  permissoes,
  onTrocarConta,
  onExcluir,
}: {
  itens: ItemForaDoBanco[];
  permissoes: PermissoesConciliacao;
  onTrocarConta: (parcela: ParcelaLivre) => void;
  onExcluir: (parcela: ParcelaLivre) => void;
}) {
  const { paginacao, setPaginacao } = usePaginacaoCliente();

  const colunas = React.useMemo<ColumnDef<ItemForaDoBanco, unknown>[]>(
    () => [
      {
        accessorKey: "data",
        header: "Pago em",
        size: 110,
        cell: ({ row }) => <span className="tabular-nums">{formatarData(row.original.data)}</span>,
      },
      {
        id: "documento",
        header: "No app",
        size: 360,
        meta: { celular: "titulo" },
        cell: ({ row }) => {
          const item = row.original;
          if (item.especie === "transferencia") {
            const t = item.transferencia;
            return `${t.numero ? `${t.numero} · ` : ""}${t.origemNome ?? "-"} para ${t.destinoNome ?? "-"}`;
          }
          const p = item.parcela;
          return [p.lancamentoNumero, p.nome, p.descricao].filter(Boolean).join(" · ");
        },
      },
      {
        id: "origem",
        header: "Origem",
        size: 140,
        cell: ({ row }) =>
          row.original.especie === "transferencia"
            ? "Transferência"
            : (ROTULO_ORIGEM[row.original.parcela.origem] ?? row.original.parcela.origem),
      },
      {
        accessorKey: "valor",
        header: "Valor",
        size: 140,
        meta: { alinharDireita: true, celular: "valor" },
        cell: ({ row }) => <ValorMovimento valor={row.original.valor} />,
      },
      {
        id: "acoes",
        header: "",
        size: 250,
        meta: { alinharDireita: true, fixa: true, rotulo: "Ações" },
        cell: ({ row }) => {
          const item = row.original;
          if (item.especie === "transferencia") {
            return (
              <Button asChild type="button" size="sm" variant="ghost">
                <Link href="/financeiro/transferencias">Abrir transferências</Link>
              </Button>
            );
          }
          if (!permissoes.conciliar) return null;
          const manual = item.parcela.origem === "manual";
          return (
            <div className="flex justify-end gap-1">
              <Button type="button" size="sm" variant="outline" onClick={() => onTrocarConta(item.parcela)}>
                <Pencil />
                Mudar conta
              </Button>
              {permissoes.excluir && manual ? (
                <Button type="button" size="sm" variant="ghost" onClick={() => onExcluir(item.parcela)}>
                  <Trash2 />
                  Excluir
                </Button>
              ) : !manual ? (
                <span className="self-center text-legenda text-muted-foreground">Exclui na origem</span>
              ) : null}
            </div>
          );
        },
      },
    ],
    [permissoes, onTrocarConta, onExcluir],
  );

  return (
    <DataTable
      idTabela="financeiro.conciliacao.fora-do-banco"
      columns={colunas}
      data={itens}
      pageIndex={paginacao.pageIndex}
      pageSize={paginacao.pageSize}
      onPaginationChange={setPaginacao}
      emptyState={
        <EmptyState
          icone={CheckCheck}
          titulo="Nada sobrando no app"
          descricao="Todo pagamento desta conta no mês aparece no extrato."
          className="border-none bg-transparent"
        />
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Casados
// ---------------------------------------------------------------------------

function precisaConferir(t: TransacaoPainel): boolean {
  if (!t.automatica || !t.parcela) return false;
  return palavrasEmComum(t.memo, [t.parcela.nome, t.parcela.descricao]) === 0;
}

function TabelaCasados({
  transacoes,
  permissoes,
  onDesfazer,
}: {
  transacoes: TransacaoPainel[];
  permissoes: PermissoesConciliacao;
  onDesfazer: (t: TransacaoPainel) => void;
}) {
  const [busca, setBusca] = React.useState("");
  const [situacao, setSituacao] = React.useState("");
  const { paginacao, setPaginacao, zerarPagina } = usePaginacaoCliente();

  const dados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return transacoes.filter((t) => {
      if (situacao === "confira" && !precisaConferir(t)) return false;
      if (situacao === "automatico" && !t.automatica) return false;
      if (situacao === "manual" && t.automatica) return false;
      if (termo && !`${t.memo ?? ""} ${vinculoDe(t)}`.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [transacoes, busca, situacao]);

  const colunas = React.useMemo<ColumnDef<TransacaoPainel, unknown>[]>(
    () => [
      {
        accessorKey: "dataMovimento",
        header: "Data",
        size: 110,
        cell: ({ row }) => <span className="tabular-nums">{formatarData(row.original.dataMovimento)}</span>,
      },
      {
        accessorKey: "memo",
        header: "Histórico do banco",
        size: 320,
        meta: { celular: "titulo" },
        cell: ({ row }) => row.original.memo ?? <CelulaVazia />,
      },
      {
        accessorKey: "valor",
        header: "Valor",
        size: 140,
        meta: { alinharDireita: true, celular: "valor" },
        cell: ({ row }) => <ValorMovimento valor={row.original.valor} />,
      },
      {
        id: "vinculo",
        header: "No app",
        size: 320,
        cell: ({ row }) => vinculoDe(row.original),
      },
      {
        id: "como",
        header: "Como",
        size: 130,
        meta: { naoTruncar: true },
        cell: ({ row }) =>
          precisaConferir(row.original) ? (
            <StatusBadge status="pendente_aprovacao" rotulo="Confira" />
          ) : row.original.automatica ? (
            <StatusBadge status="aprovado" rotulo="Automático" />
          ) : (
            <StatusBadge status="executado" rotulo="Manual" />
          ),
      },
      {
        id: "acoes",
        header: "",
        size: 130,
        meta: { alinharDireita: true, fixa: true, rotulo: "Ações" },
        cell: ({ row }) =>
          permissoes.conciliar ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => onDesfazer(row.original)}>
              <X />
              Desfazer
            </Button>
          ) : null,
      },
    ],
    [permissoes, onDesfazer],
  );

  const qtdConferir = transacoes.filter(precisaConferir).length;

  const filtros: FiltroConfiguravel[] = [
    {
      id: "busca",
      rotulo: "Busca",
      fixo: true,
      temValor: busca !== "",
      onLimpar: () => setBusca(""),
      elemento: (
        <FiltroBusca
          valor={busca}
          onValorChange={(v) => {
            setBusca(v);
            zerarPagina();
          }}
          placeholder="Buscar no histórico ou no lançamento"
        />
      ),
    },
    {
      id: "como",
      rotulo: "Como casou",
      fixo: true,
      temValor: situacao !== "",
      onLimpar: () => setSituacao(""),
      elemento: (
        <FiltroSelect
          valor={situacao}
          onValorChange={(v) => {
            setSituacao(v);
            zerarPagina();
          }}
          opcoes={[
            { valor: "confira", rotulo: `Para conferir (${qtdConferir})` },
            { valor: "automatico", rotulo: "Automático" },
            { valor: "manual", rotulo: "Manual" },
          ]}
          placeholder="Como casou"
          todosRotulo="Todos"
        />
      ),
    },
  ];

  return (
    <DataTable
      idTabela="financeiro.conciliacao.casados"
      columns={colunas}
      data={dados}
      filtros={filtros}
      pageIndex={paginacao.pageIndex}
      pageSize={paginacao.pageSize}
      onPaginationChange={setPaginacao}
      emptyState={
        <EmptyState
          icone={Link2}
          titulo={transacoes.length === 0 ? "Nada casado ainda" : "Nenhum casamento com esses filtros"}
          descricao={
            transacoes.length === 0
              ? "Use Casar automaticamente, ou case cada movimento em Faltam no app."
              : "Ajuste ou limpe os filtros."
          }
          className="border-none bg-transparent"
        />
      }
    />
  );
}
