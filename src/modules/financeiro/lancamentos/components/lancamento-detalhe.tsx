"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import {
  CalendarClock,
  ExternalLink,
  History,
  Lock,
  Pencil,
  Split,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import { Anexos } from "@/components/canonicos/anexos";
import {
  BotaoEspelho,
  CelulaVazia,
  Combobox,
  ConfirmDialog,
  DataTable,
  EmptyState,
  MoneyText,
  PageHeader,
  StatusBadge,
  Trilha,
  type EventoTrilha,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { formatarBRL, formatarData, formatarMesAno } from "@/lib/formatadores";
import type { CartaoOpcao } from "@/modules/cadastros/cartoes/queries";
import { AlterarMesDialog } from "@/modules/_shared/alterar-mes-dialog";
import {
  definirContaLancamento,
  excluirLancamento,
  reenviarParcela,
} from "@/modules/financeiro/lancamentos/actions";
import type { ContaBancariaOpcao } from "@/modules/financeiro/pagamentos/queries";
import {
  ehParcelaAberta,
  ROTULO_TIPO_LANCAMENTO,
  STATUS_PARCELA,
} from "@/modules/financeiro/_shared/formato";
import { ComposicaoDoLiquido } from "@/modules/financeiro/_shared/composicao-liquido";
import { seloDoLancamento } from "@/modules/financeiro/_shared/selo-lancamento";
import type { AnexoDoDocumento } from "@/modules/_shared/anexos/queries";
import { CAMINHO_DO_PAGAMENTO } from "@/modules/_shared/forma-pagamento";
import { ROTULO_ORIGEM_DATA } from "@/modules/financeiro/_shared/janela-pagamento";
import { rotuloOrigemLancamento } from "@/modules/financeiro/lancamentos/schemas";
import { DefinirParcelasDialog } from "./definir-parcelas-dialog";
import { DefinirRateioDialog } from "./definir-rateio-dialog";
import { LancamentoFormDrawer } from "./lancamento-form-drawer";
import type {
  CategoriaOpcao,
  CentroCustoOpcao,
  ClienteOpcao,
  CondicaoPagamentoOpcao,
  FormaPagamentoOpcao,
  FornecedorOpcao,
  LancamentoDetalhe,
  ParcelaLancamento,
  RateioLancamento,
} from "@/modules/financeiro/lancamentos/queries";

/** Card de seção do detalhe (mesmo tratamento visual do detalhe da OC). */
function Secao({
  titulo,
  acao,
  children,
}: {
  titulo: string;
  /** Ação alinhada à direita do título (ex: definir parcelas). */
  acao?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-border bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
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
  legenda,
  acao,
}: {
  rotulo: string;
  children: React.ReactNode;
  /** Linha extra abaixo do valor, para explicar o que aquele dado provoca. */
  legenda?: string | null;
  /** Ação ao lado do valor (ex: alterar o mês de referência). */
  acao?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-legenda text-muted-foreground">{rotulo}</span>
      <span className="flex items-center gap-1.5 text-detalhe">
        {children}
        {acao}
      </span>
      {legenda ? (
        <span className="text-legenda text-muted-foreground">{legenda}</span>
      ) : null}
    </div>
  );
}

/**
 * Aviso do que está travando ou do que ainda falta neste lançamento. Existe
 * porque tela muda é a pior parte de um ERP: o usuário procura a parcela numa
 * fila onde ela nunca vai aparecer e não descobre o motivo.
 */
function Aviso({
  titulo,
  texto,
  acao,
}: {
  titulo: string;
  texto: string;
  acao?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-status-pendente/30 bg-status-pendente/5 px-3 py-3">
      <div className="flex items-start gap-2">
        <TriangleAlert
          className="mt-0.5 size-4 shrink-0 text-status-pendente"
          aria-hidden="true"
        />
        <div>
          <p className="text-detalhe font-medium">{titulo}</p>
          <p className="text-legenda text-muted-foreground">{texto}</p>
        </div>
      </div>
      {acao}
    </div>
  );
}

export interface LancamentoDetalheViewProps {
  lancamento: LancamentoDetalhe;
  trilha: EventoTrilha[];
  /** Trilha das parcelas (aprovação, revisão, reprogramação...), lida de `parcela_eventos`. */
  trilhaParcelas: EventoTrilha[];
  categorias: CategoriaOpcao[];
  /** Cartões de crédito ativos, para o pagamento no crédito. */
  cartoes: CartaoOpcao[];
  fornecedores: FornecedorOpcao[];
  /** Clientes ativos: quem paga, no formulário do a receber. */
  clientes: ClienteOpcao[];
  centrosCusto: CentroCustoOpcao[];
  formasPagamento: FormaPagamentoOpcao[];
  condicoesPagamento: CondicaoPagamentoOpcao[];
  podeEditar: boolean;
  anexos: AnexoDoDocumento[];
  podeExcluir: boolean;
  /** Contas ativas, para a escolha que libera a aprovação do pagamento. */
  contas: ContaBancariaOpcao[];
}

/**
 * Detalhe do lançamento: cabeçalho, dados, parcelas com status, rateio por
 * centro de custo e trilha. A edição é bloqueada para lançamentos de origem
 * diferente de 'manual' (ex: vindos de uma OC) ou com alguma parcela já
 * aprovada ou paga: aprovado se edita desaprovando primeiro.
 */
/** Rateio por centro: lista plana, pode ordenar. */
const COLUNAS_RATEIO: ColumnDef<RateioLancamento, unknown>[] = [
  {
    id: "centroCusto",
    accessorFn: (rateio) => rateio.centroCustoNome,
    header: "Centro de custo",
    size: 320,
    meta: { celular: "titulo" },
    cell: ({ row }) => (
      <>
        {row.original.centroCustoCodigo ? (
          <span className="codigo-doc mr-1.5">
            {row.original.centroCustoCodigo}
          </span>
        ) : null}
        {row.original.centroCustoNome}
      </>
    ),
  },
  {
    accessorKey: "valor",
    header: "Valor",
    size: 150,
    meta: { alinharDireita: true, atomico: true, celular: "valor" },
    cell: ({ row }) => <MoneyText valor={row.original.valor} />,
  },
];

/**
 * As retenções na ordem da nota fiscal, com o rótulo que o papel usa. Lista
 * própria e não `CAMPOS_RETENCAO` porque aqui as chaves são as do
 * `LancamentoDetalhe` (camelCase), e amarrar as duas faria uma renomeação de
 * campo do formulário quebrar a leitura do detalhe.
 */
const RETENCOES_DO_DETALHE = [
  { campo: "retencaoIss", rotulo: "ISS retido" },
  { campo: "retencaoPis", rotulo: "PIS retido" },
  { campo: "retencaoCofins", rotulo: "COFINS retido" },
  { campo: "retencaoCsll", rotulo: "CSLL retido" },
  { campo: "retencaoIr", rotulo: "IR retido" },
  { campo: "retencaoInss", rotulo: "INSS retido" },
  { campo: "retencaoOutras", rotulo: "Outras retenções" },
] as const satisfies readonly {
  campo: keyof LancamentoDetalhe;
  rotulo: string;
}[];

export function LancamentoDetalheView({
  lancamento,
  trilha,
  trilhaParcelas,
  categorias,
  cartoes,
  fornecedores,
  clientes,
  centrosCusto,
  formasPagamento,
  condicoesPagamento,
  podeEditar,
  anexos,
  podeExcluir,
  contas,
}: LancamentoDetalheViewProps) {
  const router = useRouter();
  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [parcelasAberto, setParcelasAberto] = React.useState(false);
  const [rateioAberto, setRateioAberto] = React.useState(false);
  const [reenviando, setReenviando] = React.useState<string | null>(null);
  const [salvandoConta, setSalvandoConta] = React.useState(false);

  // A conta é a mesma para as parcelas não pagas do lançamento, então basta ler a
  // primeira: quem muda escolhe para todas.
  const contaAtual =
    lancamento.parcelas.find((parcela) => parcela.status !== "pago")
      ?.contaBancariaId ?? "";

  async function aoDefinirConta(contaId: string) {
    setSalvandoConta(true);
    try {
      const resultado = await definirContaLancamento(lancamento.id, contaId);
      if ("erro" in resultado) {
        toast.error(resultado.erro);
        return;
      }
      toast.success("Conta bancária definida");
      router.refresh();
    } finally {
      setSalvandoConta(false);
    }
  }

  // Caminho de volta da revisão: quem corrigiu devolve a parcela para a fila.
  const aoReenviar = React.useCallback(
    async (parcelaId: string) => {
      setReenviando(parcelaId);
      try {
        const resultado = await reenviarParcela(parcelaId);
        if ("erro" in resultado) {
          toast.error(resultado.erro);
          return;
        }
        toast.success("Parcela reenviada para aprovação");
        router.refresh();
      } finally {
        setReenviando(null);
      }
    },
    [router],
  );

  // Parcelas na ordem do cronograma: a ordem é a informação, nenhuma coluna
  // ordena. Centralizado é o padrão de tabela do app; só dinheiro vai à direita.
  const colunasParcelas = React.useMemo<
    ColumnDef<ParcelaLancamento, unknown>[]
  >(
    () => [
      {
        id: "numeroParcela",
        header: "#",
        size: 60,
        enableSorting: false,
        meta: { rotulo: "Parcela", atomico: true },
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.numeroParcela}</span>
        ),
      },
      {
        id: "dataVencimento",
        header: "Vencimento",
        size: 120,
        enableSorting: false,
        meta: { atomico: true, celular: "titulo" },
        cell: ({ row }) =>
          row.original.dataVencimento ? (
            <span className="tabular-nums">
              {formatarData(row.original.dataVencimento)}
            </span>
          ) : (
            <CelulaVazia />
          ),
      },
      {
        id: "dataProgramada",
        header: "Data programada",
        size: 150,
        enableSorting: false,
        meta: { naoTruncar: true },
        cell: ({ row }) => {
          const parcela = row.original;
          return parcela.dataProgramada ? (
            <span className="flex flex-col">
              <span className="tabular-nums">
                {formatarData(parcela.dataProgramada)}
              </span>
              {parcela.dataProgramadaOrigem ? (
                <span className="text-legenda text-muted-foreground">
                  {ROTULO_ORIGEM_DATA[parcela.dataProgramadaOrigem]}
                </span>
              ) : null}
            </span>
          ) : (
            <CelulaVazia />
          );
        },
      },
      {
        id: "conta",
        header: "Conta",
        size: 200,
        enableSorting: false,
        cell: ({ row }) => row.original.contaBancariaNome ?? <CelulaVazia />,
      },
      {
        id: "dataPagamento",
        header: "Pagamento",
        size: 120,
        enableSorting: false,
        meta: { atomico: true },
        cell: ({ row }) =>
          row.original.dataPagamento ? (
            <span className="tabular-nums">
              {formatarData(row.original.dataPagamento)}
            </span>
          ) : (
            <CelulaVazia />
          ),
      },
      {
        id: "status",
        header: "Status",
        size: 140,
        enableSorting: false,
        meta: { naoTruncar: true, celular: "destaque" },
        cell: ({ row }) => {
          const infoParcela = STATUS_PARCELA[row.original.status];
          return (
            <StatusBadge
              status={infoParcela.badge}
              rotulo={infoParcela.rotulo}
            />
          );
        },
      },
      {
        id: "valor",
        header: "Valor",
        size: 170,
        enableSorting: false,
        meta: { alinharDireita: true, naoTruncar: true, celular: "valor" },
        cell: ({ row }) => {
          const parcela = row.original;
          return (
            <>
              <MoneyText valor={parcela.valor} />
              {/* Os ajustes só aparecem quando existem: linha
                  extra em toda parcela viraria ruído numa coluna
                  de dinheiro. Mostra a conta feita porque é o
                  líquido que saiu da conta bancária — e é por isso
                  que juros e despesas entram junto com o desconto:
                  enquanto só o desconto aparecia aqui, uma parcela
                  paga com multa era exibida pelo valor devido, sem
                  nenhuma pista de que saiu mais dinheiro. */}
              <ComposicaoDoLiquido
                desconto={parcela.desconto}
                juros={parcela.juros}
                outrasDespesas={parcela.outrasDespesas}
                valorLiquido={parcela.valorLiquido}
              />
            </>
          );
        },
      },
      {
        id: "acao",
        header: "",
        size: 200,
        enableSorting: false,
        meta: { rotulo: "Reenviar", alinharDireita: true, naoTruncar: true },
        cell: ({ row }) => {
          const parcela = row.original;
          return parcela.status === "em_revisao" && podeEditar ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={reenviando === parcela.id}
              onClick={() => void aoReenviar(parcela.id)}
            >
              {reenviando === parcela.id
                ? "Reenviando..."
                : "Reenviar para aprovação"}
            </Button>
          ) : null;
        },
      },
    ],
    [podeEditar, reenviando, aoReenviar],
  );
  const [confirmarExcluir, setConfirmarExcluir] = React.useState(false);
  const [dialogMes, setDialogMes] = React.useState(false);

  async function handleExcluir() {
    const resultado = await excluirLancamento(lancamento.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Lançamento excluído");
    router.push("/financeiro/lancamentos");
  }

  const ehManual = lancamento.origem === "manual";
  const temParcelaPaga = lancamento.parcelas.some(
    (parcela) => parcela.status === "pago",
  );
  const temParcelaAprovada = lancamento.parcelas.some(
    (parcela) => parcela.status === "aprovado",
  );
  // Sem parcela definida o lançamento não entra na fila de aprovação nem pode
  // ser pago: é um estado a resolver, não um detalhe.
  const semParcelas = lancamento.parcelas.length === 0;
  const temParcelaFechada = temParcelaAprovada || temParcelaPaga;
  /**
   * O diálogo de parcelas serve dois casos, e por isso não olha mais `ehManual`
   * nem `temParcelaFechada`:
   *
   * - lançamento de ORIGEM que nasceu sem parcelas (era o caso original);
   * - lançamento com parcela paga ou aprovada, em que só as EM ABERTO abrem para
   *   editar. É o que destrava um parcelamento de imposto renegociado: 3 pagas não
   *   podem mais trancar as 38 futuras.
   *
   * Quem preserva as fechadas e recalcula o total é a
   * `fn_definir_parcelas_lancamento`; as guardas de origem do RH também ficam
   * nela. Aqui é só não esconder o caminho.
   */
  const podeDefinirParcelas =
    podeEditar && (!ehManual || temParcelaFechada || semParcelas);
  // O cabeçalho (fornecedor, categoria, forma) continua trancado com parcela
  // fechada: editar por ali regrava as parcelas do zero e apagaria a aprovação.
  // Para mexer em VALOR e VENCIMENTO existe o diálogo de parcelas, que preserva as
  // fechadas. A trava final é o banco (fn_salvar_lancamento recusa).
  const editavel = podeEditar && ehManual && !temParcelaFechada;
  /**
   * Selo pela DÍVIDA, não pela etapa. O saldo sai das parcelas, que o detalhe já
   * carregou: `aberto` é tudo que não está pago nem cancelado.
   */
  const abertoDoLancamento = lancamento.parcelas
    .filter((parcela) => ehParcelaAberta(parcela.status))
    .reduce((soma, parcela) => soma + parcela.valor, 0);
  const selo = seloDoLancamento(
    lancamento.status,
    lancamento.tipo,
    abertoDoLancamento,
  );

  // Caminho do pagamento: quem decide é o tipo da forma de pagamento, e é o que
  // explica por que uma parcela nasceu aprovada, quitada, ou foi para a fila.
  const quitadoNoCartao =
    lancamento.formaPagamentoTipo === "cartao_credito" &&
    lancamento.status === "pago";
  const incompleto = lancamento.status === "previsto";
  // Dinheiro e cartão pagam antes da nota chegar. Quitado sem nota registrada é
  // documento faltando, e some no fim do mês se a tela não avisar.
  const quitadoSemNota =
    lancamento.origem === "oc" &&
    lancamento.status === "pago" &&
    !lancamento.notaRegistrada;

  // Pago vem antes de aprovado porque é o bloqueio mais duro: com parcela paga
  // não há caminho de volta pela desaprovação, e é o que o banco responde
  // primeiro. Cada texto diz o que fazer, não só o que travou.
  const motivoBloqueio = !ehManual
    ? `Lançamento de origem ${rotuloOrigemLancamento(lancamento.origem)}. Edite na origem.`
    : temParcelaPaga
      ? "Tem parcela paga: o cabeçalho não muda. Use \u201cEditar parcelas\u201d para as em aberto."
      : temParcelaAprovada
        ? "Pagamento aprovado. Desaprove o pagamento para editar o cabeçalho."
        : null;

  const somaRateios = lancamento.rateios.reduce(
    (total, rateio) => total + rateio.valor,
    0,
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        className="mb-0"
        modulo="Financeiro · Lançamentos"
        titulo={lancamento.numero ?? "Sem número"}
        tituloMono
        descricao={lancamento.descricao}
        voltarPara={{
          rota: "/financeiro/lancamentos",
          rotulo: "Voltar para os lançamentos",
        }}
        selos={
          <>
            <StatusBadge status={selo.badge} rotulo={selo.rotulo} />
            {selo.etapa ? (
              <StatusBadge status="aprovado" rotulo={selo.etapa} discreto />
            ) : null}
            {/* "Conta a pagar" e não "A pagar": 'a_pagar' também é nome de
                status, e os dois badges lado a lado se contradiziam. */}
            <StatusBadge
              status={
                lancamento.tipo === "a_receber"
                  ? "aprovado"
                  : "pendente_aprovacao"
              }
              rotulo={`Conta ${ROTULO_TIPO_LANCAMENTO[
                lancamento.tipo
              ].toLowerCase()}`}
            />
            {semParcelas ? (
              <StatusBadge status="rejeitado" rotulo="Parcelas pendentes" />
            ) : null}
            {quitadoNoCartao ? (
              <StatusBadge status="pago" rotulo="Pago no cartão" />
            ) : null}
          </>
        }
        acoes={
          <>
          <BotaoEspelho rota="/espelho/lancamentos" ids={[lancamento.id]} />
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
          {podeExcluir ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setConfirmarExcluir(true)}
            >
              <Trash2 />
              Excluir
            </Button>
          ) : null}
          </>
        }
      />

      {incompleto ? (
        <Aviso
          titulo="Lançamento incompleto"
          texto={`As parcelas precisam somar ${formatarBRL(
            lancamento.valor,
          )} para este lançamento entrar na fila de aprovação. Enquanto estiver assim, ele não é aprovado nem pago.`}
          acao={
            podeDefinirParcelas ? (
              <Button
                type="button"
                size="sm"
                onClick={() => setParcelasAberto(true)}
              >
                <CalendarClock />
                Definir parcelas
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {quitadoSemNota ? (
        <Aviso
          titulo="Nota fiscal pendente"
          texto={`Este lançamento já está quitado e a nota fiscal ${
            lancamento.origemNumero
              ? `da ${lancamento.origemNumero}`
              : "da ordem de origem"
          } ainda não foi registrada. Registre o recebimento na ordem para fechar o ciclo.`}
          acao={
            lancamento.origemId ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  router.push(`/compras/ordens/${lancamento.origemId}`)
                }
              >
                <ExternalLink />
                Abrir a ordem
              </Button>
            ) : undefined
          }
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Secao titulo="Dados do lançamento">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Dado rotulo="Tipo">
                {ROTULO_TIPO_LANCAMENTO[lancamento.tipo]}
              </Dado>
              {/* O rótulo segue quem recebe: "Fornecedor" numa compra,
                  "Colaborador" num lançamento do RH. Chamar a pessoa da folha de
                  fornecedor confundiria com o cadastro de fornecedores, que é
                  outro (só 9 dos 59 colaboradores existem nos dois). */}
              <Dado
                rotulo={
                  lancamento.colaboradorNome ? "Colaborador" : "Fornecedor"
                }
              >
                {lancamento.fornecedorNome ??
                  lancamento.colaboradorNome ?? <CelulaVazia />}
              </Dado>
              <Dado rotulo="Categoria">{lancamento.categoriaNome ?? <CelulaVazia />}</Dado>
              {/* Com mais de uma forma, o `formaPagamentoNome` do cabeçalho é
                  NULO de propósito (não existe "a forma" deste lançamento), e
                  mostrar um traço aqui esconderia justamente a informação que
                  explica por que uma parte do pagamento foi para a aprovação e a
                  outra não. Então a linha passa a listar as formas com o valor
                  de cada uma. */}
              <Dado
                rotulo={
                  lancamento.formas.length > 1
                    ? "Formas de pagamento"
                    : "Forma de pagamento"
                }
                legenda={
                  lancamento.formas.length > 1
                    ? `${lancamento.formas.length} formas neste lançamento`
                    : lancamento.formaPagamentoTipo
                      ? CAMINHO_DO_PAGAMENTO[lancamento.formaPagamentoTipo]
                      : null
                }
              >
                {lancamento.formas.length > 1 ? (
                  <div className="flex flex-col gap-0.5">
                    {lancamento.formas.map((forma) => (
                      <span key={forma.id} className="flex flex-wrap gap-x-1.5">
                        <span>{forma.formaPagamentoNome}</span>
                        {/* O cartão entra junto do nome da forma: é ele que
                            identifica a compra na fatura. */}
                        {forma.cartaoRotulo ? (
                          <span className="text-legenda text-muted-foreground">
                            {forma.cartaoRotulo}
                          </span>
                        ) : null}
                        <MoneyText valor={forma.valor} className="inline" />
                        <span className="text-legenda text-muted-foreground">
                          {CAMINHO_DO_PAGAMENTO[forma.formaPagamentoTipo]}
                        </span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="flex flex-wrap gap-x-1.5">
                    <span>
                      {lancamento.formas[0]?.formaPagamentoNome ??
                        lancamento.formaPagamentoNome ?? <CelulaVazia />}
                    </span>
                    {lancamento.formas[0]?.cartaoRotulo ? (
                      <span className="text-legenda text-muted-foreground">
                        {lancamento.formas[0].cartaoRotulo}
                      </span>
                    ) : null}
                  </span>
                )}
              </Dado>
              {/* Vale para os dois casos: no avulso a condição é a do próprio
                  lançamento, no de OC é a da ordem de origem. A legenda diz de
                  onde ela vem para ninguém procurar no lugar errado. */}
              <Dado
                rotulo="Condição de pagamento"
                legenda={
                  lancamento.condicaoPagamentoDescricao && !ehManual
                    ? "Vem da ordem de origem"
                    : null
                }
              >
                {lancamento.condicaoPagamentoDescricao ?? <CelulaVazia />}
              </Dado>
              <Dado rotulo="Data da compra">
                {formatarData(lancamento.dataCompra)}
              </Dado>
              <Dado
                rotulo="Mês de referência"
                legenda="Define em qual mês o custo entra"
                acao={
                  podeEditar ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Alterar mês de referência"
                      onClick={() => setDialogMes(true)}
                    >
                      <Pencil />
                    </Button>
                  ) : undefined
                }
              >
                {formatarMesAno(lancamento.mesCompetencia)}
              </Dado>
              <Dado rotulo="Criado em">
                {formatarData(lancamento.criadoEm)}
              </Dado>
              <Dado rotulo="Vencimento">
                {lancamento.dataVencimento ? (
                  formatarData(lancamento.dataVencimento)
                ) : (
                  <CelulaVazia />
                )}
              </Dado>
              <Dado rotulo="Número do documento">
                {lancamento.numeroDocumento ? (
                  <span className="codigo-doc">
                    {lancamento.numeroDocumento}
                  </span>
                ) : (
                  <CelulaVazia />
                )}
              </Dado>
              <Dado
                rotulo={
                  lancamento.valorBruto === null ? "Valor" : "Valor líquido"
                }
              >
                <MoneyText valor={lancamento.valor} className="font-semibold" />
              </Dado>
            </div>
          </Secao>

          {/* A retenção só aparece quando existe. Num documento sem retenção uma
              seção com sete zeros seria ruído, e é a exceção que precisa ser
              vista: o líquido da linha acima difere do faturado, e sem esta
              seção não há nada na tela explicando por quê. */}
          {lancamento.valorBruto !== null ? (
            <Secao titulo="Retenção na fonte">
              <div className="flex flex-col gap-1.5 text-detalhe">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Valor bruto</span>
                  <MoneyText valor={lancamento.valorBruto} />
                </div>
                {RETENCOES_DO_DETALHE.map(({ campo, rotulo }) => {
                  const valor = lancamento[campo];
                  if (valor === 0) return null;
                  return (
                    <div key={campo} className="flex justify-between gap-3">
                      <span className="text-muted-foreground">{rotulo}</span>
                      <span className="tabular-nums text-status-rejeitado">
                        {"\u2212 "}
                        {formatarBRL(valor)}
                      </span>
                    </div>
                  );
                })}
                <div className="flex justify-between gap-3 border-t border-border pt-1.5">
                  <span className="font-medium text-foreground">
                    Líquido recebido
                  </span>
                  <MoneyText
                    valor={lancamento.valor}
                    className="font-semibold"
                  />
                </div>
                <p className="text-legenda text-muted-foreground">
                  Retenção é imposto que o pagador recolheu, não desconto: o
                  faturado continua sendo o bruto.
                </p>
              </div>
            </Secao>
          ) : null}

          <Secao titulo="Conta bancária do pagamento">
            {/* Passo de revisão: sem conta escolhida a parcela não entra na fila
                de aprovação, e o banco recusa aprovar. Escolher aqui é o que
                libera o pagamento para ser aprovado. */}
            <div className="flex flex-col gap-2">
              <Combobox
                id="lancamento-conta"
                valor={contaAtual}
                onValorChange={(valor) => void aoDefinirConta(valor)}
                opcoes={contas.map((conta) => ({
                  valor: conta.id,
                  rotulo: conta.nome,
                }))}
                placeholder="Escolha a conta de onde o dinheiro sai"
                disabled={!podeEditar || salvandoConta}
                className="w-full max-w-md"
              />
              {contaAtual === "" ? (
                <p className="flex items-start gap-1.5 text-legenda text-status-pendente">
                  <TriangleAlert
                    aria-hidden="true"
                    className="mt-0.5 size-3.5 shrink-0"
                  />
                  Enquanto não houver conta escolhida, este pagamento não aparece
                  na fila de aprovação.
                </p>
              ) : null}
            </div>
          </Secao>

          <Secao
            titulo="Parcelas"
            acao={
              podeDefinirParcelas ? (
                <Button
                  type="button"
                  variant={semParcelas ? "default" : "outline"}
                  size="sm"
                  onClick={() => setParcelasAberto(true)}
                >
                  <CalendarClock />
                  {semParcelas ? "Definir parcelas" : "Editar parcelas"}
                </Button>
              ) : undefined
            }
          >
            {semParcelas ? (
              <p className="rounded-md border border-dashed border-border bg-surface/50 px-3 py-3 text-detalhe text-muted-foreground">
                Este lançamento não tem parcelas definidas. Enquanto estiver
                assim, ele não entra na fila de aprovação de pagamentos e não
                pode ser pago.
                {podeDefinirParcelas
                  ? " Use \u201cDefinir parcelas\u201d para resolver."
                  : ""}
              </p>
            ) : (
              <DataTable
                idTabela="financeiro.lancamentos.detalhe.parcelas"
                columns={colunasParcelas}
                data={lancamento.parcelas}
                idDaLinha={(parcela) => parcela.id}
                semPaginacao
                rodape={{
                  numeroParcela: <span className="font-semibold">Total</span>,
                  valor: (
                    <MoneyText valor={lancamento.valor} className="font-semibold" />
                  ),
                }}
              />
            )}
          </Secao>

          <Secao titulo="Anexos">
            <Anexos
              entidade="lancamento"
              entidadeId={lancamento.id}
              anexos={anexos}
              podeEditar={podeEditar}
              onMudou={() => router.refresh()}
            />
          </Secao>

          <Secao
            titulo="Rateio por centro de custo"
            acao={
              /* Só `podeEditar`, sem olhar origem nem status de parcela: a razão
                 de esta tela existir é justamente o lançamento aprovado ou pago,
                 em que o formulário está trancado. As guardas de verdade (soma,
                 competência, permissão pelo tipo) estão na
                 `fn_definir_rateio_lancamento`. */
              podeEditar ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRateioAberto(true)}
                >
                  <Split />
                  Editar rateio
                </Button>
              ) : undefined
            }
          >
            {lancamento.rateios.length > 0 ? (
              <DataTable
                idTabela="financeiro.lancamentos.detalhe.rateio"
                columns={COLUNAS_RATEIO}
                data={lancamento.rateios}
                idDaLinha={(rateio) => rateio.id}
                semPaginacao
                rodape={{
                  centroCusto: <span className="font-semibold">Total do rateio</span>,
                  valor: <MoneyText valor={somaRateios} className="font-semibold" />,
                }}
              />
            ) : (
              <p className="text-detalhe text-muted-foreground">
                Sem rateio. O custo não foi distribuído por centro de custo.
              </p>
            )}
          </Secao>

          {/* Só aparece quando existe: seção vazia em detalhe de ERP é ruído.
              whitespace-pre-line porque o texto foi escrito num textarea, e as
              quebras de linha que a pessoa deu fazem parte do recado. */}
          {lancamento.observacoes ? (
            <Secao titulo="Observações">
              <p className="whitespace-pre-line text-detalhe">
                {lancamento.observacoes}
              </p>
            </Secao>
          ) : null}
        </div>

        <div className="flex flex-col gap-4 lg:col-span-1">
          <Secao titulo="Trilha">
            <Trilha eventos={trilha} />
          </Secao>

          <Secao titulo="Trilha das parcelas">
            {trilhaParcelas.length > 0 ? (
              <Trilha eventos={trilhaParcelas} />
            ) : (
              <EmptyState
                icone={History}
                titulo="Sem movimentação nas parcelas"
                descricao="Aprovações, reprogramações e outras mudanças nas parcelas deste lançamento aparecem aqui."
              />
            )}
          </Secao>
        </div>
      </div>

      {editavel ? (
        <LancamentoFormDrawer
          anexos={anexos}
          aberto={drawerAberto}
          onAbertoChange={(aberto) => {
            setDrawerAberto(aberto);
            if (!aberto) router.refresh();
          }}
          lancamento={lancamento}
          categorias={categorias}
          cartoes={cartoes}
          formasPagamento={formasPagamento}
          condicoesPagamento={condicoesPagamento}
          fornecedores={fornecedores}
          clientes={clientes}
          contas={contas}
          centrosCusto={centrosCusto}
        />
      ) : null}

      {podeEditar ? (
        <AlterarMesDialog
          aberto={dialogMes}
          onAbertoChange={setDialogMes}
          entidade="lancamento"
          id={lancamento.id}
          mesAtual={lancamento.mesCompetencia}
          documentoEspelho={lancamento.origemNumero}
        />
      ) : null}

      {podeDefinirParcelas ? (
        <DefinirParcelasDialog
          aberto={parcelasAberto}
          onAbertoChange={(aberto) => {
            setParcelasAberto(aberto);
            if (!aberto) router.refresh();
          }}
          lancamentoId={lancamento.id}
          valor={lancamento.valor}
          origem={lancamento.origem}
          parcelasAtuais={lancamento.parcelas.map((parcela) => ({
            numeroParcela: parcela.numeroParcela,
            dataVencimento: parcela.dataVencimento,
            valor: parcela.valor,
            status: parcela.status,
          }))}
          condicaoDescricao={lancamento.condicaoPagamentoDescricao}
        />
      ) : null}

      {podeEditar ? (
        <DefinirRateioDialog
          aberto={rateioAberto}
          onAbertoChange={(aberto) => {
            setRateioAberto(aberto);
            if (!aberto) router.refresh();
          }}
          lancamentoId={lancamento.id}
          valor={lancamento.valor}
          origem={lancamento.origem}
          rateiosAtuais={lancamento.rateios.map((rateio) => ({
            centroCustoId: rateio.centroCustoId,
            valor: rateio.valor,
          }))}
          centrosCusto={centrosCusto}
        />
      ) : null}

      {podeExcluir ? (
        <ConfirmDialog
          aberto={confirmarExcluir}
          onAbertoChange={setConfirmarExcluir}
          titulo="Excluir lançamento"
          descricao="O lançamento e suas parcelas e rateios serão excluídos. Esta ação não pode ser desfeita."
          textoConfirmar="Excluir"
          variante="destrutivo"
          onConfirmar={handleExcluir}
        />
      ) : null}
    </div>
  );
}
