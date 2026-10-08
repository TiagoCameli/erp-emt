"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import {
  ArrowLeft,
  History,
  ArrowLeftRight,
  CheckCheck,
  CreditCard,
  FilePlus2,
  Link2,
  ListPlus,
  LoaderCircle,
  Pencil,
  RotateCcw,
  Trash2,
  Undo2,
  Upload,
  Wand2,
  X,
} from "lucide-react";

import {
  BarraSelecao,
  CampoFormulario,
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
import { filtrarFacetado, selecao } from "@/modules/_shared/filtros-facetados";
import { toast } from "@/components/canonicos/toast";
import { InputMoeda } from "@/components/canonicos/input-numerico";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  formatarBRL,
  formatarData,
  formatarDataHora,
  formatarMesAno,
} from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import { usePaginacaoCliente } from "@/modules/_shared/filtros-cliente";
import {
  aplicarRegra,
  casarAutomatico,
  confirmarConferencias,
  desconciliar,
  desconciliarVarios,
  fecharMes,
  reabrirMes,
  excluirLancamentoDaConciliacao,
} from "@/modules/financeiro/conciliacao/actions";
import {
  cedenteDoHistorico,
  gruposEquivalentes,
  type GrupoEquivalente,
  pareceAplicacaoAutomatica,
  sugerirParaMovimento,
  sugestoesSeguras,
  type MovimentoCasavel,
  type Sugestao,
} from "@/modules/financeiro/conciliacao/casamento";
import {
  casarTudo,
  enviosPossiveis,
  pareceEstorno,
} from "@/modules/financeiro/conciliacao/estorno";
import {
  padraoDoHistorico,
  regraDoMovimento,
  type RegraConciliacao,
} from "@/modules/financeiro/conciliacao/regras";
import {
  candidatosDoPainel,
  montarVisoes,
  movimentosLivres,
  precisaConferir,
  somar,
  statusDoMes,
  TODOS_OS_MESES,
  type CandidatoDoPainel,
  type ItemForaDoBanco,
  type PainelConciliacao,
  type ParcelaLivre,
  type TransacaoPainel,
  vizinhosLivres,
} from "@/modules/financeiro/conciliacao/painel";
import type { ContaBancariaOpcao } from "@/modules/financeiro/conciliacao/queries";
import { CasarDialog } from "./casar-dialog";
import { DevolucaoDialog } from "./devolucao-dialog";
import { FaturaDialog } from "./fatura-dialog";
import { EstornoDialog } from "./estorno-dialog";
import { GrupoDialog } from "./grupo-dialog";
import { RegraDialog, type RegraEmEdicao } from "./regra-dialog";
import { ImportarOfxDialog } from "./importar-ofx-dialog";
import { RevisarSegurasDialog } from "./revisar-seguras-dialog";
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
  /** Mudar conta ou valor de pagamento já registrado (pagamentos/recebimentos). */
  mexerNoPago: boolean;
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
  /** Regras por histórico (Bloco H): a tela mostra qual vale para cada movimento. */
  regras: RegraConciliacao[];
  /** Cartões ativos: o débito da fatura casa com as compras de um deles. */
  cartoes: { id: string; nome: string }[];
  /** Por etapa de Investimentos, a conta corrente onde a aplicação está. */
  contaPorEtapa: Record<string, string>;
  permissoes: PermissoesConciliacao;
}

function rotuloDoMes(mes: string): string {
  return mes === TODOS_OS_MESES ? "Todos os meses" : formatarMesAno(`${mes}-01`);
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
    return [p.lancamentoNumero, p.nome, p.descricao]
      .filter(Boolean)
      .join(" · ");
  }
  if (transacao.transferencia) {
    const t = transacao.transferencia;
    return `${t.numero ? `${t.numero} · ` : ""}${t.origemNome ?? "-"} para ${t.destinoNome ?? "-"}`;
  }
  if (transacao.fatura) {
    const f = transacao.fatura;
    return `Fatura do cartão ${f.cartaoNome ?? ""} · ${f.qtdCompras} ${f.qtdCompras === 1 ? "item" : "itens"}`;
  }
  if (transacao.estorno) {
    const e = transacao.estorno;
    return `Estorno: ${formatarData(e.dataMovimento)} · ${e.memo ?? "-"}`;
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
export function ConciliacaoCliente(props: ConciliacaoClienteProps) {
  // "Todos os meses" não tem fechamento: fechar e reabrir é de um mês só. O
  // banco continua recusando ação em mês fechado, com a mensagem do mês.
  const todos = props.mes === TODOS_OS_MESES;
  const painel = todos ? { ...props.painel, fechamento: null } : props.painel;
  // Mês fechado (Bloco F): nada se casa, desfaz, lança ou exclui até reabrir.
  // O banco recusa de qualquer jeito; aqui os botões somem para não convidar.
  const fechado = painel.fechamento !== null;
  const permissoes: PermissoesConciliacao = fechado
    ? {
        importar: props.permissoes.importar,
        conciliar: false,
        lancar: false,
        transferir: false,
        mexerNoPago: false,
        excluir: false,
      }
    : props.permissoes;
  return (
    <ConciliacaoConta
      {...props}
      painel={painel}
      permissoes={permissoes}
      podeFechar={props.permissoes.conciliar && !todos}
    />
  );
}

function ConciliacaoConta({
  conta,
  contasConciliaveis,
  contas,
  mes,
  meses,
  periodo,
  painel,
  visao,
  opcoes,
  regras,
  cartoes,
  contaPorEtapa,
  permissoes,
  podeFechar,
}: ConciliacaoClienteProps & { podeFechar: boolean }) {
  const router = useRouter();
  const visoes = React.useMemo(
    () => montarVisoes(painel, periodo),
    [painel, periodo],
  );
  const candidatos = React.useMemo(() => candidatosDoPainel(painel), [painel]);
  // Livres do período e os vizinhos fora dele: o par de um estorno pode
  // estar no mês ao lado.
  const movimentosParaEstorno = React.useMemo(
    () => [...movimentosLivres(painel), ...vizinhosLivres(painel)],
    [painel],
  );
  // A regra por histórico de cada movimento sem par (Bloco H). O banco aplica
  // as automáticas antes do casamento, então elas saem da prévia do casamento.
  const regraPorMovimento = React.useMemo(() => {
    const mapa = new Map<string, RegraConciliacao>();
    for (const m of movimentosLivres(painel)) {
      const regra = regraDoMovimento(regras, { ...m, contaBancariaId: conta.id });
      if (regra) mapa.set(m.id, regra);
    }
    return mapa;
  }, [painel, regras, conta.id]);
  const automatico = React.useMemo(
    () =>
      casarTudo(
        movimentosLivres(painel).filter((m) => !regraPorMovimento.get(m.id)?.automatica),
        vizinhosLivres(painel),
        candidatos,
      ),
    [painel, candidatos, regraPorMovimento],
  );
  const qtdRegrasAutomaticas = [...regraPorMovimento.values()].filter((r) => r.automatica).length;
  const qtdAutomaticos =
    automatico.pares.length + automatico.estornos.length + qtdRegrasAutomaticas;
  // Grupos equivalentes N:N (Bloco J): sobre o que o automático e as regras
  // deixam livre. Faixa 2: um clique com revisão.
  const grupos = React.useMemo(() => {
    const usados = new Set([
      ...automatico.pares.map((p) => p.transacaoId),
      ...automatico.estornos.flatMap((e) => [e.transacaoId, e.parId]),
      ...regraPorMovimento.keys(),
    ]);
    const candUsados = new Set(automatico.pares.map((p) => `${p.especie}:${p.alvoId}`));
    return gruposEquivalentes(
      movimentosLivres(painel).filter((m) => !usados.has(m.id)),
      candidatos.filter((c) => !candUsados.has(`${c.especie}:${c.id}`)),
    );
  }, [painel, candidatos, automatico, regraPorMovimento]);
  const grupoPorMovimento = React.useMemo(() => {
    const mapa = new Map<string, GrupoEquivalente>();
    for (const g of grupos) for (const p of g.pares) mapa.set(p.transacaoId, g);
    return mapa;
  }, [grupos]);
  const candidatoPorId = React.useMemo(
    () => new Map(candidatos.map((c) => [c.id, c])),
    [candidatos],
  );
  const [gruposAbertos, setGruposAbertos] = React.useState<GrupoEquivalente[] | null>(null);
  const [chaveGrupos, setChaveGrupos] = React.useState(0);
  function abrirGrupos(lista: GrupoEquivalente[]) {
    setChaveGrupos((k) => k + 1);
    setGruposAbertos(lista);
  }

  const [regraEmEdicao, setRegraEmEdicao] = React.useState<RegraEmEdicao | null>(null);
  const [chaveRegra, setChaveRegra] = React.useState(0);

  function criarRegraDe(t: TransacaoPainel) {
    const padrao = padraoDoHistorico(t.memo);
    setChaveRegra((k) => k + 1);
    setRegraEmEdicao({
      nome: padrao.slice(0, 60),
      padrao,
      contaBancariaId: conta.id,
      sentido: t.valor >= 0 ? "credito" : "debito",
      acao: "lancar",
      automatica: false,
      ativa: true,
      historicoDeOrigem: t.memo,
    });
  }

  async function confirmar(ids: string[]) {
    const resposta = await confirmarConferencias(ids);
    if ("erro" in resposta) {
      toast.error(resposta.erro);
      return;
    }
    toast.success(
      `${quantos(resposta.confirmadas, "casamento confirmado", "casamentos confirmados")}` +
        (resposta.aprendidos > 0
          ? `, ${quantos(resposta.aprendidos, "apelido bancário aprendido", "apelidos bancários aprendidos")}`
          : ""),
    );
    router.refresh();
  }

  async function aplicarRegras(pares: { regraId: string; ids: string[] }[]) {
    let feitos = 0;
    const erros: string[] = [];
    for (const par of pares) {
      const resposta = await aplicarRegra({ regraId: par.regraId, transacaoIds: par.ids });
      if ("erro" in resposta) {
        erros.push(resposta.erro);
        continue;
      }
      feitos += resposta.feitos;
      erros.push(...resposta.falhas.map((f) => f.erro));
    }
    if (erros.length > 0) {
      toast.error(`${quantos(feitos, "aplicada", "aplicadas")}, ${erros.length} com erro: ${erros[0]}`);
    } else {
      toast.success(`${quantos(feitos, "movimento lançado", "movimentos lançados")} pela regra`);
    }
    router.refresh();
  }

  const [importarAberto, setImportarAberto] = React.useState(false);
  const [casando, setCasando] = React.useState(false);
  const [casarAlvoId, setCasarAlvoId] = React.useState<string | null>(null);
  const [estornoAlvoId, setEstornoAlvoId] = React.useState<string | null>(null);
  const [devolucaoAlvoId, setDevolucaoAlvoId] = React.useState<string | null>(null);
  const [faturaAlvoId, setFaturaAlvoId] = React.useState<string | null>(null);
  const [lancarIds, setLancarIds] = React.useState<string[] | null>(null);
  const [transferirIds, setTransferirIds] = React.useState<string[] | null>(
    null,
  );
  const [trocarConta, setTrocarConta] = React.useState<ParcelaLivre | null>(
    null,
  );
  const [excluirAlvo, setExcluirAlvo] = React.useState<ParcelaLivre | null>(
    null,
  );
  const [desfazerAlvo, setDesfazerAlvo] =
    React.useState<TransacaoPainel | null>(null);
  const [desfazerIds, setDesfazerIds] = React.useState<string[] | null>(null);
  const [fechando, setFechando] = React.useState(false);
  const [reabrirAberto, setReabrirAberto] = React.useState(false);

  const porId = React.useMemo(
    () => new Map(painel.transacoes.map((t) => [t.id, t])),
    [painel.transacoes],
  );
  const casarAlvo = casarAlvoId ? (porId.get(casarAlvoId) ?? null) : null;
  const estornoAlvo = estornoAlvoId ? (porId.get(estornoAlvoId) ?? null) : null;
  const devolucaoAlvo = devolucaoAlvoId ? (porId.get(devolucaoAlvoId) ?? null) : null;
  const faturaAlvo = faturaAlvoId ? (porId.get(faturaAlvoId) ?? null) : null;
  const transacoesDe = (ids: string[] | null) =>
    (ids ?? [])
      .map((id) => porId.get(id))
      .filter((t): t is TransacaoPainel => !!t);

  const somaFaltam = somar(visoes.faltamNoApp.map((t) => t.valor));
  const somaFora = somar(visoes.foraDoBanco.map((i) => i.valor));
  const total = painel.transacoes.length;
  const status = statusDoMes(visoes, painel.saldo);
  const saldo = painel.saldo;

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
        (resposta.regras ? `, ${quantos(resposta.regras, "lançado por regra", "lançados por regra")}` : "") +
        (resposta.falhas.length > 0
          ? `, ${resposta.falhas.length} não casaram`
          : ""),
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

  const [saldoSubconta, setSaldoSubconta] = React.useState("");
  const [pedirSubconta, setPedirSubconta] = React.useState(false);

  async function fechar(comSubconta = false) {
    // Com subconta, o fechamento pede o saldo dela no extrato de
    // investimentos do último dia do mês (Bloco K).
    if (saldo?.subconta && !comSubconta) {
      setPedirSubconta(true);
      return;
    }
    setFechando(true);
    const valorSubconta = saldoSubconta.trim()
      ? Number(saldoSubconta.replace(/\./g, "").replace(",", "."))
      : null;
    const resposta = await fecharMes(conta.id, mes, valorSubconta);
    setFechando(false);
    if ("erro" in resposta) {
      toast.error(resposta.erro);
      return;
    }
    toast.success(`${rotuloDoMes(mes)} conciliado e fechado`);
    setPedirSubconta(false);
    router.refresh();
  }

  async function confirmarReabrir(motivo?: string) {
    const resposta = await reabrirMes(conta.id, mes, motivo ?? "");
    if ("erro" in resposta) {
      toast.error(resposta.erro);
      return false;
    }
    toast.success("Mês reaberto");
    setReabrirAberto(false);
    router.refresh();
  }

  async function confirmarDesfazerVarios() {
    if (!desfazerIds) return;
    const resposta = await desconciliarVarios(desfazerIds);
    if ("erro" in resposta) {
      toast.error(resposta.erro);
      return false;
    }
    if (resposta.falhas.length > 0) {
      toast.error(
        `${resposta.feitos} desfeito(s), ${resposta.falhas.length} com erro: ${resposta.falhas[0]?.erro}`,
      );
    } else {
      toast.success(
        `${quantos(resposta.feitos, "casamento desfeito", "casamentos desfeitos")}: voltaram para Faltam no app`,
      );
    }
    setDesfazerIds(null);
    router.refresh();
  }

  async function confirmarExcluir(motivo?: string) {
    if (!excluirAlvo) return;
    const resposta = await excluirLancamentoDaConciliacao(
      excluirAlvo.id,
      motivo ?? "",
    );
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
        <Button asChild type="button" size="sm" variant="outline">
          <Link href="/financeiro/conciliacao">
            <ArrowLeft />
            Contas
          </Link>
        </Button>
        <FiltroSelect
          valor={conta.id}
          onValorChange={(valor) => valor && trocarConta_(valor)}
          opcoes={contasConciliaveis.map((c) => ({
            valor: c.id,
            rotulo: c.nome,
          }))}
          placeholder="Conta"
          className="max-w-72 max-md:max-w-full max-md:basis-full"
        />
        <FiltroSelect
          valor={mes === TODOS_OS_MESES ? "" : mes}
          onValorChange={(valor) => trocarMes(valor || TODOS_OS_MESES)}
          todosRotulo="Todos os meses"
          opcoes={meses.map((m) => ({
            valor: m,
            rotulo: formatarMesAno(`${m}-01`),
          }))}
          placeholder="Mês"
          className="max-w-48 max-md:max-w-full max-md:basis-full"
        />
        <div className="flex flex-wrap gap-2 md:ml-auto">
          {permissoes.conciliar && qtdAutomaticos > 0 ? (
            <Button
              type="button"
              size="sm"
              onClick={() => void rodarAutomatico()}
              disabled={casando}
            >
              {casando ? <LoaderCircle className="animate-spin" /> : <Wand2 />}
              Casar automaticamente ({qtdAutomaticos})
            </Button>
          ) : null}
          <Button asChild size="sm" variant="outline">
            <Link
              href={`/financeiro/conciliacao/importacoes?${new URLSearchParams({ conta: conta.id }).toString()}`}
            >
              <History />
              Importações
            </Link>
          </Button>
          {permissoes.importar ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setImportarAberto(true)}
            >
              <Upload />
              Importar OFX
            </Button>
          ) : null}
        </div>
      </div>

      {painel.fechamento ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-status-aprovado/40 bg-status-aprovado/10 px-3 py-2 text-sm">
          <span className="text-status-aprovado">
            Conciliado por {painel.fechamento.fechadoPor ?? "-"} em{" "}
            {formatarDataHora(painel.fechamento.fechadoEm)}
            {painel.fechamento.saldoBanco !== null ? (
              <>
                {" "}· saldo <MoneyText valor={painel.fechamento.saldoBanco} />
              </>
            ) : null}
          </span>
          {podeFechar ? (
            <Button type="button" size="sm" variant="outline" onClick={() => setReabrirAberto(true)}>
              Reabrir
            </Button>
          ) : null}
        </div>
      ) : status === "conciliado" && podeFechar ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm">
          <span>Tudo casado e o saldo do banco bate com o do app.</span>
          <Button type="button" size="sm" onClick={() => void fechar()} disabled={fechando}>
            {fechando ? <LoaderCircle className="animate-spin" /> : <CheckCheck />}
            Fechar mês
          </Button>
        </div>
      ) : null}

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
            status === "conciliado" ? (
              "Mês conciliado"
            ) : status === "falta_saldo" ? (
              saldo?.diferenca != null ? (
                <>
                  Falta bater o saldo (<MoneyText valor={saldo.diferenca} />)
                </>
              ) : (
                "Falta bater o saldo"
              )
            ) : status === "sem_saldo" ? (
              "Sem saldo do banco para fechar"
            ) : total > 0 ? (
              `${Math.round((visoes.casados.length / total) * 100)}% do extrato`
            ) : undefined
          }
          href={hrefDe(conta.id, mes, "casados")}
          className={cn(visao === "casados" && "border-foreground")}
        />
        <KPICard
          titulo={
            saldo ? `Saldo em ${formatarData(saldo.data).slice(0, 5)}` : "Saldo"
          }
          valor={
            !saldo ? (
              "Sem extrato no fim do mês"
            ) : !saldo.temSaldoNoArquivo ? (
              saldo.motivo === "sem_cobertura" ? "Falta extrato até a âncora" : "Sem âncora de saldo"
            ) : !saldo.podeVer ? (
              <span
                className={cn(
                  saldo.bate ? "text-status-aprovado" : "text-status-rejeitado",
                )}
              >
                {saldo.bate ? "Bate" : "Não bate"}
              </span>
            ) : (
              <span
                className={cn(
                  "tabular-nums",
                  saldo.bate ? "text-status-aprovado" : "text-status-rejeitado",
                )}
              >
                <MoneyText valor={saldo.diferenca ?? 0} />
              </span>
            )
          }
          detalhe={
            saldo?.temSaldoNoArquivo && saldo.podeVer ? (
              <>
                Banco <MoneyText valor={saldo.banco} />
                {saldo.bancoFonte === "encadeado" && saldo.bancoAncora
                  ? ` (encadeado desde ${formatarData(saldo.bancoAncora).slice(0, 5)}/${saldo.bancoAncora.slice(2, 4)})`
                  : saldo.bancoFonte === "ledgerbal"
                    ? " (saldo do OFX)"
                    : ""}{" "}
                · App <MoneyText valor={saldo.app} />
                {saldo.subconta ? (
                  <span className="block">
                    Subconta: banco{" "}
                    {saldo.subconta.temAncora ? <MoneyText valor={saldo.subconta.banco} /> : "sem saldo do extrato"} · app{" "}
                    <MoneyText valor={saldo.subconta.app} />
                  </span>
                ) : null}
                {saldo.antesDoCorte && saldo.corte ? (
                  <span className="block">
                    Antes do saldo inicial de {formatarData(saldo.corte)}: o app calcula
                    para trás, e a diferença pode vir de qualquer mês até lá
                  </span>
                ) : null}
              </>
            ) : saldo?.temSaldoNoArquivo ? (
              "Saldo: sem permissão para ver os valores"
            ) : saldo ? (
              "Cadastre o saldo do extrato em Importações > Âncoras"
            ) : (
              "Sem saldo do banco o mês não fecha sozinho"
            )
          }
        />
      </GradeKpis>

      {visao === "faltam" ? (
        <TabelaFaltam
          contaNome={conta.nome}
          transacoes={visoes.faltamNoApp}
          candidatos={candidatos}
          movimentosParaEstorno={movimentosParaEstorno}
          regraPorMovimento={regraPorMovimento}
          permissoes={permissoes}
          onCasar={setCasarAlvoId}
          onEstorno={setEstornoAlvoId}
          onDevolucao={permissoes.lancar ? setDevolucaoAlvoId : undefined}
          onFatura={cartoes.length > 0 ? setFaturaAlvoId : undefined}
          onAplicarRegras={aplicarRegras}
          grupoPorMovimento={grupoPorMovimento}
          grupos={grupos}
          onCasarGrupos={abrirGrupos}
          onCriarRegra={permissoes.lancar ? criarRegraDe : undefined}
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
          onDesfazerVarios={setDesfazerIds}
          onConfirmar={confirmar}
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

      <Dialog open={pedirSubconta} onOpenChange={(aberto) => !fechando && setPedirSubconta(aberto)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Saldo da subconta</DialogTitle>
            <DialogDescription>
              Saldo da subconta de investimentos em{" "}
              {saldo ? formatarData(saldo.data) : "-"}, do extrato de investimentos do banco.
              Se ela não teve movimento, deixe em branco.
            </DialogDescription>
          </DialogHeader>
          <CampoFormulario id="saldo-subconta" rotulo="Saldo no extrato">
            <InputMoeda
              id="saldo-subconta"
              valor={saldoSubconta}
              onValorChange={setSaldoSubconta}
              disabled={fechando}
            />
          </CampoFormulario>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPedirSubconta(false)} disabled={fechando}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void fechar(true)} disabled={fechando}>
              {fechando ? <LoaderCircle className="animate-spin" /> : <CheckCheck />}
              Fechar mês
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <GrupoDialog
        key={`grupos-${chaveGrupos}`}
        grupos={gruposAbertos}
        onFechar={() => setGruposAbertos(null)}
        transacoes={porId}
        candidatos={candidatoPorId}
      />

      <RegraDialog
        key={`regra-${chaveRegra}`}
        regra={regraEmEdicao}
        onFechar={() => setRegraEmEdicao(null)}
        opcoes={{
          contas,
          centros: opcoes.centros,
          categorias: opcoes.categorias,
          fornecedores: opcoes.fornecedores,
          contaPorEtapa,
        }}
      />

      <FaturaDialog
        key={`fatura-${faturaAlvoId ?? ""}`}
        transacao={faturaAlvo}
        onFechar={() => setFaturaAlvoId(null)}
        cartoes={cartoes}
        categorias={opcoes.categorias}
        centros={opcoes.centros}
      />

      <DevolucaoDialog
        key={`devolucao-${devolucaoAlvoId ?? ""}`}
        credito={devolucaoAlvo}
        onFechar={() => setDevolucaoAlvoId(null)}
      />

      <EstornoDialog
        key={`estorno-${estornoAlvoId ?? ""}`}
        aberto={estornoAlvo !== null}
        onAbertoChange={(aberto) => !aberto && setEstornoAlvoId(null)}
        transacao={estornoAlvo}
        movimentos={movimentosParaEstorno}
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
        contaPorEtapa={contaPorEtapa}
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
        aberto={reabrirAberto}
        onAbertoChange={setReabrirAberto}
        titulo={`Reabrir ${rotuloDoMes(mes)}`}
        descricao="O mês volta a aceitar casar, desfazer e lançar. O motivo fica registrado na auditoria."
        textoConfirmar="Reabrir mês"
        exigeMotivo
        minMotivo={3}
        onConfirmar={confirmarReabrir}
      />

      <ConfirmDialog
        aberto={desfazerIds !== null}
        onAbertoChange={(aberto) => !aberto && setDesfazerIds(null)}
        titulo={`Desfazer ${quantos(desfazerIds?.length ?? 0, "casamento", "casamentos")}`}
        descricao="Os movimentos voltam para Faltam no app e os lançamentos ficam livres para casar com outros. O que os casamentos mudaram nas parcelas (conta, baixa, ajuste) continua como está."
        textoConfirmar="Desfazer"
        variante="destrutivo"
        onConfirmar={confirmarDesfazerVarios}
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
    c.nomes.find((n): n is string => !!n) ??
    (c.especie === "transferencia" ? "Transferência" : "");
  const grupo =
    c.grupo === "aberta"
      ? "Em aberto"
      : c.grupo === "paga_outra_conta"
        ? "Paga em outra conta"
        : c.grupo === "transferencia"
          ? "Transferência"
          : "Paga nesta conta";
  const diferenca =
    sugestao.diferenca !== 0
      ? `, difere ${formatarBRL(Math.abs(sugestao.diferenca))}`
      : "";
  return `${grupo}: ${quem}${diferenca}`;
}

function TabelaFaltam({
  contaNome,
  transacoes,
  candidatos,
  movimentosParaEstorno,
  regraPorMovimento,
  permissoes,
  onCasar,
  onEstorno,
  onDevolucao,
  onFatura,
  onAplicarRegras,
  onCriarRegra,
  grupoPorMovimento,
  grupos,
  onCasarGrupos,
  onLancar,
  onTransferir,
}: {
  contaNome: string;
  transacoes: TransacaoPainel[];
  candidatos: CandidatoDoPainel[];
  movimentosParaEstorno: MovimentoCasavel[];
  regraPorMovimento: Map<string, RegraConciliacao>;
  permissoes: PermissoesConciliacao;
  onCasar: (id: string) => void;
  onEstorno: (id: string) => void;
  /** Crédito que é o fornecedor devolvendo um pagamento (Bloco L). */
  onDevolucao?: (id: string) => void;
  /** Débito que é a fatura do cartão (várias compras num movimento). */
  onFatura?: (id: string) => void;
  onAplicarRegras: (pares: { regraId: string; ids: string[] }[]) => Promise<void>;
  onCriarRegra?: (t: TransacaoPainel) => void;
  grupoPorMovimento: Map<string, GrupoEquivalente>;
  grupos: GrupoEquivalente[];
  onCasarGrupos: (grupos: GrupoEquivalente[]) => void;
  onLancar: (ids: string[]) => void;
  onTransferir: (ids: string[]) => void;
}) {
  const [busca, setBusca] = React.useState("");
  const [tipo, setTipo] = React.useState("");
  const [noApp, setNoApp] = React.useState("");
  const [selecionados, setSelecionados] = React.useState<string[]>([]);
  const [revisarAberto, setRevisarAberto] = React.useState(false);
  const { paginacao, setPaginacao, zerarPagina } = usePaginacaoCliente();

  // Faixa 2 (Bloco E): o que dá para aceitar em lote com revisão.
  const seguras = React.useMemo(
    () =>
      sugestoesSeguras(
        transacoes.map((t) => ({
          id: t.id,
          dataMovimento: t.dataMovimento,
          valor: t.valor,
          memo: t.memo,
        })),
        candidatos,
      ),
    [transacoes, candidatos],
  );
  const idsSeguros = React.useMemo(
    () => new Set(seguras.map((s) => s.movimento.id)),
    [seguras],
  );

  const sugestoes = React.useMemo(() => {
    const mapa = new Map<string, Sugestao<CandidatoDoPainel> | undefined>();
    for (const t of transacoes) {
      mapa.set(
        t.id,
        sugerirParaMovimento(
          {
            id: t.id,
            dataMovimento: t.dataMovimento,
            valor: t.valor,
            memo: t.memo,
          },
          candidatos,
        )[0],
      );
    }
    return mapa;
  }, [transacoes, candidatos]);

  // Facetado (ver `_shared/filtros-facetados`): tipo e "no app" só oferecem o
  // que existe nas transações que a busca e o outro filtro deixaram.
  //
  // "Tem no app" = existe candidato compatível (o que a coluna "O app tem"
  // mostra): resolve com Casar. "Não tem" = nada parecido no app: é Lançar,
  // ou Transferência quando é aplicação automática.
  const { linhas: dados, opcoes: opcoesFacetadas } = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return filtrarFacetado(
      transacoes,
      {
        tipo: { selecionados: selecao(tipo), chave: (t) => t.tipo },
        noApp: {
          selecionados: selecao(noApp),
          chave: (t) => (sugestoes.get(t.id) ? "tem" : "nao"),
        },
      },
      [
        (t) =>
          !termo ||
          `${t.memo ?? ""} ${formatarBRL(Math.abs(t.valor))}`
            .toLowerCase()
            .includes(termo),
      ],
    );
  }, [transacoes, busca, tipo, noApp, sugestoes]);

  const validos = selecionados.filter((id) =>
    transacoes.some((t) => t.id === id),
  );
  const marcadas = transacoes.filter((t) => validos.includes(t.id));
  const sentidos = new Set(marcadas.map((t) => t.tipo));
  const misturado = sentidos.size > 1;

  const colunas = React.useMemo<ColumnDef<TransacaoPainel, unknown>[]>(
    () => [
      {
        accessorKey: "dataMovimento",
        header: "Data",
        size: 110,
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatarData(row.original.dataMovimento)}
          </span>
        ),
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
          const grupo = grupoPorMovimento.get(row.original.id);
          if (grupo) {
            return (
              <span className="flex items-center gap-1.5 text-status-pendente">
                <StatusBadge status="pendente_aprovacao" rotulo={`Grupo de ${grupo.pares.length}`} />
                Mesmo valor e dia no app
              </span>
            );
          }
          const regra = regraPorMovimento.get(row.original.id);
          if (regra) {
            return (
              <span className="text-status-pendente" title={regra.padrao}>
                Regra: {regra.nome}
                {regra.automatica ? " (automática)" : ""}
              </span>
            );
          }
          if (pareceEstorno(row.original.memo)) {
            const envio = enviosPossiveis(row.original, movimentosParaEstorno)[0];
            return envio ? (
              <span className="text-status-pendente">
                Devolução: case com o envio de {formatarData(envio.dataMovimento)}
              </span>
            ) : (
              <span className="text-muted-foreground">
                Devolução sem envio a até 10 dias
              </span>
            );
          }
          if (pareceAplicacaoAutomatica(row.original.memo)) {
            return (
              <span className="text-muted-foreground">
                Aplicação automática: lance como transferência
              </span>
            );
          }
          const texto = resumoSugestao(sugestoes.get(row.original.id));
          return texto ? (
            <span className="text-status-pendente" title={texto}>
              {idsSeguros.has(row.original.id) ? (
                <StatusBadge status="aprovado" rotulo="Segura" className="mr-1.5" />
              ) : null}
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
          const devolucao = pareceEstorno(t.memo);
          const regra = regraPorMovimento.get(t.id);
          const grupo = grupoPorMovimento.get(t.id);
          return (
            <div className="flex flex-wrap justify-end gap-1">
              {permissoes.conciliar && grupo ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onCasarGrupos([grupo])}
                  title={`Casar o grupo de ${grupo.pares.length}`}
                >
                  <Link2 />
                  <span className="max-md:sr-only">Casar grupo</span>
                </Button>
              ) : null}
              {permissoes.conciliar && regra ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void onAplicarRegras([{ regraId: regra.id, ids: [t.id] }])}
                  title={`Aplicar a regra ${regra.nome}`}
                >
                  <Wand2 />
                  <span className="max-md:sr-only">Aplicar</span>
                </Button>
              ) : null}
              {permissoes.conciliar && devolucao ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onEstorno(t.id)}
                  title="Casar com o envio devolvido"
                >
                  <Undo2 />
                  <span className="max-md:sr-only">Estorno</span>
                </Button>
              ) : null}
              {permissoes.conciliar ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onCasar(t.id)}
                  title="Casar"
                >
                  <Link2 />
                  <span className="max-md:sr-only">Casar</span>
                </Button>
              ) : null}
              {permissoes.conciliar && permissoes.lancar && !aplicacao && !devolucao ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onLancar([t.id])}
                  title="Lançar"
                >
                  <FilePlus2 />
                  <span className="max-md:sr-only">Lançar</span>
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
                  {aplicacao ? (
                    <span className="max-md:sr-only">Transferência</span>
                  ) : null}
                </Button>
              ) : null}
              {permissoes.conciliar && onFatura && t.valor < 0 ? (
                <Button
                  type="button"
                  size="sm"
                  variant={/CART/i.test(t.memo ?? "") ? "outline" : "ghost"}
                  onClick={() => onFatura(t.id)}
                  aria-label="Fatura do cartão"
                  title="Fatura do cartão: casar com as compras do cartão"
                >
                  <CreditCard />
                  {/CART/i.test(t.memo ?? "") ? <span className="max-md:sr-only">Fatura</span> : null}
                </Button>
              ) : null}
              {permissoes.conciliar && onDevolucao && t.valor > 0 && !devolucao ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => onDevolucao(t.id)}
                  aria-label="É devolução de um pagamento"
                  title="É devolução de um pagamento (o fornecedor devolveu)"
                >
                  <RotateCcw />
                </Button>
              ) : null}
              {permissoes.conciliar && onCriarRegra && !regra ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => onCriarRegra(t)}
                  aria-label="Criar regra a partir deste"
                  title="Criar regra a partir deste histórico"
                >
                  <ListPlus />
                </Button>
              ) : null}
              {permissoes.conciliar && !devolucao ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => onEstorno(t.id)}
                  aria-label="Casar com estorno"
                  title="Casar com estorno (envio que o banco devolveu)"
                >
                  <Undo2 />
                </Button>
              ) : null}
            </div>
          );
        },
      },
    ],
    [
      sugestoes,
      idsSeguros,
      movimentosParaEstorno,
      regraPorMovimento,
      grupoPorMovimento,
      permissoes,
      onCasar,
      onEstorno,
      onDevolucao,
      onFatura,
      onAplicarRegras,
      onCriarRegra,
      onCasarGrupos,
      onLancar,
      onTransferir,
    ],
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
      id: "no-app",
      rotulo: "No app",
      fixo: true,
      temValor: noApp !== "",
      onLimpar: () => setNoApp(""),
      elemento: (
        <FiltroSelect
          valor={noApp}
          onValorChange={(v) => {
            setNoApp(v);
            zerarPagina();
          }}
          opcoes={opcoesFacetadas("noApp", [
            { valor: "tem", rotulo: "Tem no app" },
            { valor: "nao", rotulo: "Não tem no app" },
          ])}
          placeholder="No app"
          todosRotulo="Tem e não tem no app"
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
          opcoes={opcoesFacetadas("tipo", [
            { valor: "debito", rotulo: "Saídas" },
            { valor: "credito", rotulo: "Entradas" },
          ])}
          placeholder="Entrada ou saída"
          todosRotulo="Entradas e saídas"
        />
      ),
    },
  ];

  // Movimentos com regra, agrupados por regra, para o "Aplicar N regras".
  const comRegra = transacoes.filter((t) => regraPorMovimento.has(t.id));
  const porRegra = new Map<string, string[]>();
  for (const t of comRegra) {
    const id = regraPorMovimento.get(t.id)!.id;
    porRegra.set(id, [...(porRegra.get(id) ?? []), t.id]);
  }
  const [aplicando, setAplicando] = React.useState(false);

  // Grupos que aparecem nesta lista (filtros à parte, todos do período).
  const idsDaLista = new Set(transacoes.map((t) => t.id));
  const gruposDaLista = grupos.filter((g) => g.pares.some((p) => idsDaLista.has(p.transacaoId)));

  return (
    <div className="flex flex-col gap-2">
      {permissoes.conciliar && gruposDaLista.length > 0 ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm">
          <span>
            {gruposDaLista.length === 1
              ? "1 grupo de movimentos com o mesmo valor e dia que o app."
              : `${gruposDaLista.length} grupos de movimentos com o mesmo valor e dia que o app.`}
          </span>
          <Button type="button" size="sm" onClick={() => onCasarGrupos(gruposDaLista)}>
            <Link2 />
            Revisar {gruposDaLista.length} {gruposDaLista.length === 1 ? "grupo" : "grupos"}
          </Button>
        </div>
      ) : null}
      {permissoes.conciliar && comRegra.length > 0 ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm">
          <span>
            {comRegra.length === 1
              ? "1 movimento tem regra por histórico (Rende Fácil, tarifa)."
              : `${comRegra.length} movimentos têm regra por histórico (Rende Fácil, tarifa).`}
          </span>
          <Button
            type="button"
            size="sm"
            disabled={aplicando}
            onClick={async () => {
              setAplicando(true);
              await onAplicarRegras([...porRegra].map(([regraId, ids]) => ({ regraId, ids })));
              setAplicando(false);
            }}
          >
            {aplicando ? <LoaderCircle className="animate-spin" /> : <Wand2 />}
            Aplicar {comRegra.length} {comRegra.length === 1 ? "regra" : "regras"}
          </Button>
        </div>
      ) : null}
      {permissoes.conciliar && seguras.length > 0 ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm">
          <span>
            {seguras.length === 1
              ? "1 sugestão segura: valor exato, nome no extrato e nenhum outro candidato."
              : `${seguras.length} sugestões seguras: valor exato, nome no extrato e nenhum outro candidato.`}
          </span>
          <Button type="button" size="sm" onClick={() => setRevisarAberto(true)}>
            <CheckCheck />
            Revisar {seguras.length} {seguras.length === 1 ? "sugestão segura" : "sugestões seguras"}
          </Button>
        </div>
      ) : null}
      <RevisarSegurasDialog
        key={revisarAberto ? `revisar-${seguras.length}` : "revisar-fechado"}
        aberto={revisarAberto}
        onAbertoChange={setRevisarAberto}
        seguras={seguras}
        contaNome={contaNome}
      />
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
            <Button
              type="button"
              size="sm"
              disabled={misturado}
              onClick={() => onLancar(validos)}
            >
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
            titulo={
              transacoes.length === 0
                ? "Todo o extrato está no app"
                : "Nenhum movimento com esses filtros"
            }
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
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatarData(row.original.data)}
          </span>
        ),
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
          return [p.lancamentoNumero, p.nome, p.descricao]
            .filter(Boolean)
            .join(" · ");
        },
      },
      {
        id: "origem",
        header: "Origem",
        size: 140,
        cell: ({ row }) =>
          row.original.especie === "transferencia"
            ? "Transferência"
            : (ROTULO_ORIGEM[row.original.parcela.origem] ??
              row.original.parcela.origem),
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
                <Link href="/financeiro/transferencias">
                  Abrir transferências
                </Link>
              </Button>
            );
          }
          if (!permissoes.conciliar) return null;
          const manual = item.parcela.origem === "manual";
          const umaParcela = item.parcela.qtdParcelas <= 1;
          return (
            <div className="flex flex-wrap justify-end gap-1">
              {permissoes.mexerNoPago ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onTrocarConta(item.parcela)}
                  title="Mudar conta"
                >
                  <Pencil />
                  <span className="max-md:sr-only">Mudar conta</span>
                </Button>
              ) : null}
              {!umaParcela ? (
                <span className="self-center text-legenda text-muted-foreground">
                  Parcela {item.parcela.numeroParcela}/
                  {item.parcela.qtdParcelas}: corrija em Lançamentos
                </span>
              ) : permissoes.excluir && manual ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => onExcluir(item.parcela)}
                  title="Excluir"
                >
                  <Trash2 />
                  <span className="max-md:sr-only">Excluir</span>
                </Button>
              ) : !manual ? (
                <span className="self-center text-legenda text-muted-foreground">
                  Exclui na origem
                </span>
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


function TabelaCasados({
  transacoes,
  permissoes,
  onDesfazer,
  onDesfazerVarios,
  onConfirmar,
}: {
  transacoes: TransacaoPainel[];
  permissoes: PermissoesConciliacao;
  onDesfazer: (t: TransacaoPainel) => void;
  onDesfazerVarios: (ids: string[]) => void;
  /** Confirma casamentos com selo "Confira" e aprende o apelido (Bloco I). */
  onConfirmar: (ids: string[]) => Promise<void>;
}) {
  const [confirmando, setConfirmando] = React.useState(false);
  const [busca, setBusca] = React.useState("");
  const [situacao, setSituacao] = React.useState("");
  const [selecionados, setSelecionados] = React.useState<string[]>([]);
  const validos = selecionados.filter((id) =>
    transacoes.some((t) => t.id === id),
  );
  const { paginacao, setPaginacao, zerarPagina } = usePaginacaoCliente();

  // Facetado: "como casou" só oferece o que existe nas transações da busca.
  const { linhas: dados, opcoes: opcoesFacetadas } = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return filtrarFacetado(
      transacoes,
      {
        situacao: {
          selecionados: selecao(situacao),
          casa: (t, valor) =>
            valor === "confira"
              ? precisaConferir(t)
              : valor === "automatico"
                ? t.automatica
                : valor === "manual"
                  ? !t.automatica
                  : true,
        },
      },
      [
        (t) =>
          !termo ||
          `${t.memo ?? ""} ${vinculoDe(t)}`.toLowerCase().includes(termo),
      ],
    );
  }, [transacoes, busca, situacao]);

  const colunas = React.useMemo<ColumnDef<TransacaoPainel, unknown>[]>(
    () => [
      {
        accessorKey: "dataMovimento",
        header: "Data",
        size: 110,
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatarData(row.original.dataMovimento)}
          </span>
        ),
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
        cell: ({ row }) => {
          // No "Confira", o cedente que vai virar apelido ao confirmar.
          const cedente = precisaConferir(row.original)
            ? cedenteDoHistorico(row.original.memo)
            : null;
          return cedente ? (
            <span title={`Ao confirmar, ${cedente} vira apelido bancário deste favorecido`}>
              <span className="text-status-pendente">{cedente}</span>
              {" → "}
              {vinculoDe(row.original)}
            </span>
          ) : (
            vinculoDe(row.original)
          );
        },
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
        size: 230,
        meta: { alinharDireita: true, fixa: true, rotulo: "Ações" },
        cell: ({ row }) =>
          permissoes.conciliar ? (
            <div className="flex justify-end gap-1">
              {precisaConferir(row.original) ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void onConfirmar([row.original.id])}
                  title="Confirmar: está certo, e o banco passa a reconhecer este nome"
                >
                  <CheckCheck />
                  <span className="max-md:sr-only">Confirmar</span>
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onDesfazer(row.original)}
                title="Desfazer"
              >
                <X />
                <span className="max-md:sr-only">Desfazer</span>
              </Button>
            </div>
          ) : null,
      },
    ],
    [permissoes, onDesfazer, onConfirmar],
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
          opcoes={opcoesFacetadas("situacao", [
            { valor: "confira", rotulo: `Para conferir (${qtdConferir})` },
            { valor: "automatico", rotulo: "Automático" },
            { valor: "manual", rotulo: "Manual" },
          ])}
          placeholder="Como casou"
          todosRotulo="Todos"
        />
      ),
    },
  ];

  const paraConfirmar = transacoes
    .filter((t) => validos.includes(t.id) && precisaConferir(t))
    .map((t) => t.id);

  return (
    <div className="flex flex-col gap-2">
      {validos.length > 0 ? (
        <BarraSelecao
          quantidade={validos.length}
          onLimpar={() => setSelecionados([])}
          resumo={`Total ${formatarBRL(
            Math.abs(
              somar(
                transacoes
                  .filter((t) => validos.includes(t.id))
                  .map((t) => t.valor),
              ),
            ),
          )}`}
        >
          {permissoes.conciliar && paraConfirmar.length > 0 ? (
            <Button
              type="button"
              size="sm"
              disabled={confirmando}
              onClick={async () => {
                setConfirmando(true);
                await onConfirmar(paraConfirmar);
                setConfirmando(false);
                setSelecionados([]);
              }}
            >
              {confirmando ? <LoaderCircle className="animate-spin" /> : <CheckCheck />}
              Confirmar {paraConfirmar.length}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              onDesfazerVarios(validos);
              setSelecionados([]);
            }}
          >
            <X />
            Desfazer {validos.length}
          </Button>
        </BarraSelecao>
      ) : null}
      <DataTable
        idTabela="financeiro.conciliacao.casados"
        columns={colunas}
        data={dados}
        filtros={filtros}
        pageIndex={paginacao.pageIndex}
        pageSize={paginacao.pageSize}
        onPaginationChange={setPaginacao}
        selecao={
          permissoes.conciliar
            ? {
                idDaLinha: (t: TransacaoPainel) => t.id,
                selecionados: validos,
                onSelecionadosChange: setSelecionados,
              }
            : undefined
        }
        emptyState={
          <EmptyState
            icone={Link2}
            titulo={
              transacoes.length === 0
                ? "Nada casado ainda"
                : "Nenhum casamento com esses filtros"
            }
            descricao={
              transacoes.length === 0
                ? "Use Casar automaticamente, ou case cada movimento em Faltam no app."
                : "Ajuste ou limpe os filtros."
            }
            className="border-none bg-transparent"
          />
        }
      />
    </div>
  );
}
