"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type {
  ColumnDef,
  PaginationState,
  SortingState,
} from "@tanstack/react-table";
import { Receipt, Trash2 } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import {
  BarraSelecao,
  BotaoEspelho,
  CelulaDescricaoCategoria,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroMesPeriodo,
  FiltroPeriodo,
  FiltroSelect,
  FiltroSelectMulti,
  FiltroValor,
  MoneyText,
  SeloAnexos,
  StatusBadge,
  useBuscaUrl,
  useFaixaUrl,
  useFiltrosUrl,
  type FiltroConfiguravel,
  type OpcaoFiltro,
} from "@/components/canonicos";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  centrosEfetivos,
  etapasValidas,
  opcoesDeEtapa,
  opcoesDeRaiz,
  rotuloDasEtapas,
  separarRaizesEEtapas,
  temEtapasParaEscolher,
} from "@/modules/_shared/centro-custo/filtro";
import { excluirLancamento } from "@/modules/financeiro/lancamentos/actions";
import { BotaoDuplicarLancamento } from "@/modules/financeiro/lancamentos/components/botao-duplicar-lancamento";
import { formatarData, formatarMesAno } from "@/lib/formatadores";
import {
  ROTULO_BANCO,
  ROTULO_TIPO_LANCAMENTO,
  STATUS_LANCAMENTO,
  type BancoConta,
  type StatusLancamento,
  type TipoLancamento,
} from "@/modules/financeiro/_shared/formato";
import type {
  CategoriaOpcao,
  CentroCustoOpcao,
  FormaPagamentoOpcao,
  FornecedorOpcao,
  LancamentoLista,
} from "@/modules/financeiro/lancamentos/queries";
import {
  FILTROS_ATRASO,
  FILTROS_REVISAO,
  ORIGENS_LANCAMENTO,
  ROTULO_FILTRO_ATRASO,
  ROTULO_FILTRO_REVISAO,
  ROTULO_ORIGEM_LANCAMENTO,
  rotuloOrigemLancamento,
} from "@/modules/financeiro/lancamentos/schemas";
import {
  DIRECAO_PADRAO,
  lerOrdenacao,
  ORDEM_PADRAO,
  ordenacaoParaUrl,
} from "@/modules/financeiro/lancamentos/ordenacao";
import { seloDoLancamento } from "@/modules/financeiro/_shared/selo-lancamento";
import {
  escreverListaNaUrl,
  MAX_ITENS_FILTRO,
} from "@/modules/financeiro/_shared/listas-na-url";
import {
  TIPO_PADRAO,
  type ValoresFiltrosLancamentos,
} from "@/modules/financeiro/lancamentos/filtros";
import type { ContaBancariaOpcao } from "@/modules/financeiro/pagamentos/queries";
import { LoteContaBancaria } from "@/modules/financeiro/lancamentos/components/lote-conta-bancaria";
import {
  ehElegivelParaLote,
  ROTULO_REVISAO_DA_LINHA,
} from "@/modules/financeiro/lancamentos/lote";

const OPCOES_TIPO = (
  Object.keys(ROTULO_TIPO_LANCAMENTO) as TipoLancamento[]
).map((valor) => ({ valor, rotulo: ROTULO_TIPO_LANCAMENTO[valor] }));

// Só status de lançamento. A revisão da parcela saiu daqui e virou filtro
// próprio: "Em revisão" e "Sem conta bancária" nunca foram status de
// lançamento, e no mesmo seletor obrigavam a escolher entre as duas perguntas.
const OPCOES_STATUS = (
  Object.keys(STATUS_LANCAMENTO) as StatusLancamento[]
).map((valor) => ({ valor, rotulo: STATUS_LANCAMENTO[valor].rotulo }));

const OPCOES_REVISAO: OpcaoFiltro[] = FILTROS_REVISAO.map((valor) => ({
  valor,
  rotulo: ROTULO_FILTRO_REVISAO[valor],
}));

// Atraso é pergunta das PARCELAS ("estourou o prazo?"), diferente do filtro de
// período de vencimento, que olha a data no cabeçalho do lançamento.
const OPCOES_ATRASO: OpcaoFiltro[] = FILTROS_ATRASO.map((valor) => ({
  valor,
  rotulo: ROTULO_FILTRO_ATRASO[valor],
}));

const OPCOES_ORIGEM: OpcaoFiltro[] = ORIGENS_LANCAMENTO.map((valor) => ({
  valor,
  rotulo: ROTULO_ORIGEM_LANCAMENTO[valor],
}));

/** Largura máxima do seletor de nome comprido (fornecedor, centro de custo). */
const LARGURA_NOME = "max-w-[15rem]";

/**
 * Colunas da listagem.
 *
 * É função, e não uma const de módulo, por causa da coluna do RECORTE: ela só
 * existe quando a URL recorta (o clique num relatório), e uma coluna permanente
 * mostrando o mesmo número da de Valor em quase toda navegação seria ruído que
 * rouba largura das colunas que importam.
 *
 * `rotuloRecorte` nulo = sem recorte = colunas de sempre.
 *
 * Exportada para o teste poder olhar a lista de colunas sem montar a tela
 * inteira (que precisaria de router, Server Action e preferência de tabela).
 */
export function montarColunas(
  rotuloRecorte: string | null,
): ColumnDef<LancamentoLista, unknown>[] {
  return [
  {
    accessorKey: "numero",
    header: "Número",
    cell: ({ row }) => (
      // O clipe fica aqui, e não numa coluna própria, porque esta é a coluna
      // que todo mundo enxerga: numa coluna opcional o sinal só apareceria para
      // quem já a ligou, ou seja, para quem já sabia procurar.
      <span className="inline-flex items-center gap-1.5">
        {row.original.numero ? (
          <span className="codigo-doc">{row.original.numero}</span>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
        <SeloAnexos quantidade={row.original.anexos} />
      </span>
    ),
  },
  {
    accessorKey: "numeroDocumento",
    header: "Número do documento",
    size: 190,
    meta: { rotulo: "Número do documento", ocultaPorPadrao: true },
    cell: ({ row }) =>
      row.original.numeroDocumento ? (
        <span className="codigo-doc">{row.original.numeroDocumento}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },
  {
    accessorKey: "tipo",
    header: "Tipo",
    cell: ({ row }) => (
      <StatusBadge
        status={
          row.original.tipo === "a_receber" ? "aprovado" : "pendente_aprovacao"
        }
        rotulo={ROTULO_TIPO_LANCAMENTO[row.original.tipo]}
      />
    ),
  },
  {
    // Antes da descrição de propósito: quem varre a lista lê "de quem é" junto
    // com "o que é", e o par identifica o lançamento numa linha. O filtro por
    // fornecedor já existia nesta tela; faltava a coluna, então filtrar por um
    // fornecedor não mostrava em nenhum lugar de quem era cada linha.
    accessorKey: "fornecedorNome",
    header: "Fornecedor",
    size: 200,
    // Não ordena: o nome vem de join com `fornecedores`, e esta lista ordena no
    // SERVIDOR sobre o filtro inteiro (ver ordenacao.ts). Oferecer a seta aqui
    // ordenaria só as 25 linhas da página, o que numa lista de milhares responde
    // errado com cara de certo. Melhor não ter seta do que ter seta que mente.
    enableSorting: false,
    meta: { rotulo: "Fornecedor" },
    // Uma coluna, dois cadastros: empresa vem pelo fornecedor, pessoa da folha
    // vem pelo colaborador. São mutuamente exclusivos na prática -- lançamento do
    // RH não tem fornecedor e compra não tem colaborador -- então dividir em duas
    // colunas deixaria as duas metade vazias numa lista de milhares de linhas.
    cell: ({ row }) => {
      const quemRecebe =
        row.original.fornecedorNome ?? row.original.colaboradorNome;
      return quemRecebe ? (
        <span className="font-medium">{quemRecebe}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      );
    },
  },
  {
    // Descrição e categoria numa coluna só: quem lê a lista quer as duas juntas
    // ("o que é" e "onde entra"), e sobra largura para as colunas de dinheiro.
    accessorKey: "descricao",
    header: "Descrição e categoria",
    size: 280,
    meta: { rotulo: "Descrição e categoria", naoTruncar: true },
    cell: ({ row }) => (
      <CelulaDescricaoCategoria
        descricao={row.original.descricao}
        categoriaNome={row.original.categoriaNome}
        complemento={
          row.original.origem === "manual"
            ? null
            : `(${rotuloOrigemLancamento(row.original.origem)})`
        }
      />
    ),
  },
  {
    // Depois da descrição e antes do valor: "o que é" e "onde cai" se leem
    // juntos, e o valor vem em seguida já sabendo a que obra pertence.
    accessorKey: "centroCustoRotulo",
    header: "Centro de custo",
    size: 190,
    // Não ordena: o nome vem de embed de rateio e esta lista ordena no SERVIDOR
    // sobre o filtro inteiro. A seta ordenaria só as 25 linhas da página, o que
    // numa lista de milhares responde errado com cara de certo.
    enableSorting: false,
    meta: { rotulo: "Centro de custo" },
    cell: ({ row }) =>
      row.original.centroCustoRotulo ? (
        <span title={row.original.centroCustoNomes}>
          {row.original.centroCustoRotulo}
        </span>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },
  {
    accessorKey: "valor",
    header: "Valor",
    meta: { alinharDireita: true },
    cell: ({ row }) => <MoneyText valor={row.original.valor} />,
  },
  // Logo depois de Valor de propósito: o par só se lê junto ("o documento inteiro,
  // e a parte dele que é desta fatia"). Separadas, a pessoa compara o número
  // errado.
  ...(rotuloRecorte
    ? [
        {
          id: "valorRecorte",
          header: rotuloRecorte,
          // Não ordena: o valor da fatia é somado no app a partir das parcelas
          // (ver recorte.ts), não existe como coluna para o `order` do banco.
          enableSorting: false,
          meta: { alinharDireita: true, rotulo: rotuloRecorte },
          cell: ({ row }: { row: { original: LancamentoLista } }) => (
            <MoneyText valor={row.original.valorRecorte ?? row.original.valor} />
          ),
        } satisfies ColumnDef<LancamentoLista, unknown>,
      ]
    : []),
  {
    accessorKey: "dataCompra",
    header: "Data da compra",
    cell: ({ row }) => (
      <span className="tabular-nums">
        {formatarData(row.original.dataCompra)}
      </span>
    ),
  },
  {
    accessorKey: "mesCompetencia",
    header: "Mês de referência",
    // O rótulo é mais largo que o conteúdo (mm/aaaa): na largura padrão de
    // 150px o cabeçalho saía cortado em "Mês de referê...".
    size: 176,
    cell: ({ row }) => (
      <span className="tabular-nums">
        {formatarMesAno(row.original.mesCompetencia)}
      </span>
    ),
  },
  {
    accessorKey: "dataVencimento",
    header: "Vencimento",
    cell: ({ row }) => (
      <span className="tabular-nums">
        {row.original.dataVencimento
          ? formatarData(row.original.dataVencimento)
          : "-"}
      </span>
    ),
  },
  {
    // O que o operador financeiro precisa ver para trabalhar a fila: falta conta
    // bancária neste lançamento? Sem conta ele não chega na aprovação.
    id: "revisao",
    header: "Revisão",
    enableSorting: false,
    meta: { rotulo: "Revisão", naoTruncar: true },
    cell: ({ row }) => {
      const estado = row.original.revisao;
      if (estado === "nao-se-aplica") {
        return <span className="text-muted-foreground">-</span>;
      }
      // Rótulo compartilhado com a exportação para Excel (ROTULO_REVISAO_DA_LINHA):
      // a planilha precisa dizer o mesmo que a coluna.
      return (
        <StatusBadge
          status={estado === "revisado" ? "aprovado" : "pendente_aprovacao"}
          rotulo={ROTULO_REVISAO_DA_LINHA[estado]}
        />
      );
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    // Cabe o badge mais largo desta tela ("Parcelas pendentes", ~122px com o
    // px-2 do Badge) em uma linha, mais o px-3 da célula. Com os dois badges o
    // flex-wrap manda o aviso para a linha de baixo, e o naoTruncar garante que
    // ele apareça inteiro em vez de ser cortado. Era 230 (os dois lado a lado):
    // esta é a listagem com mais coluna do app, e 70px por coluna gorda é o que
    // antecipa o scroll horizontal na tela que o financeiro usa todo dia.
    size: 160,
    meta: { naoTruncar: true },
    cell: ({ row }) => {
      // O selo fala de DÍVIDA, não da etapa: aprovado com saldo em aberto lê
      // "A pagar", com a aprovação num selo menor ao lado. A regra mora em
      // `_shared/selo-lancamento`, uma só para as cinco telas que mostram isso.
      const selo = seloDoLancamento(
        row.original.status,
        row.original.tipo,
        row.original.valorAberto,
      );
      return (
        // justify-center porque flex não herda o text-center da célula: sem
        // isso os badges encostam na esquerda e desalinham do cabeçalho.
        <div className="flex flex-wrap items-center justify-center gap-1">
          <StatusBadge status={selo.badge} rotulo={selo.rotulo} />
          {selo.etapa ? (
            <StatusBadge status="aprovado" rotulo={selo.etapa} discreto />
          ) : null}
          {/* Sem parcela definida o lançamento não entra na fila de aprovação
              nem pode ser pago: precisa aparecer já na lista. */}
          {row.original.qtdParcelas === 0 ? (
            <StatusBadge status="rejeitado" rotulo="Parcelas pendentes" />
          ) : null}
        </div>
      );
    },
  },
  ];
}

export interface LancamentosTabelaProps {
  lancamentos: LancamentoLista[];
  total: number;
  pagina: number;
  tamanho: number;
  valores: ValoresFiltrosLancamentos;
  /** Opções dos seletores, já filtradas pelos cadastros ativos. */
  categorias: CategoriaOpcao[];
  fornecedores: FornecedorOpcao[];
  centrosCusto: CentroCustoOpcao[];
  formasPagamento: FormaPagamentoOpcao[];
  contas: ContaBancariaOpcao[];
  /** Permissão de excluir: sem ela a ação não aparece na linha. */
  podeExcluir: boolean;
  /** Duplicar cria um lançamento novo: sem permissão de criar, o botão some. */
  podeCriar: boolean;
  /**
   * Rótulo da coluna do recorte, ou `null` quando a URL não recorta.
   *
   * Vem pronto da página (que conhece o nome do centro de custo e o rótulo da
   * fatia) em vez de ser montado aqui: este componente é client, e resolver o nome
   * do centro exigiria uma segunda leitura do banco no cliente.
   */
  rotuloRecorte: string | null;
}

/**
 * Listagem de lançamentos com paginação e filtros server-side, persistidos na
 * URL. Todo filtro daqui vai ao banco: com paginação no servidor, filtrar só a
 * página carregada faria a tela mentir sobre o que existe. Clicar numa linha
 * abre o detalhe.
 */
export function LancamentosTabela({
  lancamentos,
  total,
  pagina,
  tamanho,
  valores,
  categorias,
  fornecedores,
  centrosCusto,
  formasPagamento,
  contas,
  podeExcluir,
  podeCriar,
  rotuloRecorte,
}: LancamentosTabelaProps) {
  const colunas = React.useMemo(
    () => montarColunas(rotuloRecorte),
    [rotuloRecorte],
  );
  const router = useRouter();
  const { setMuitos, limparTodos } = useFiltrosUrl();
  const { busca, setBusca } = useBuscaUrl(valores.busca);
  // Faixa de valor é digitada dígito a dígito: vai pela URL com espera, senão
  // cada tecla viraria uma consulta e o campo perderia caracteres.
  const {
    faixa: faixaValor,
    setFaixa: setFaixaValor,
    limpar: limparFaixaValor,
  } = useFaixaUrl("valor_de", "valor_ate");
  const [aExcluir, setAExcluir] = React.useState<LancamentoLista | null>(null);

  /**
   * Lançamentos marcados para a ação em lote.
   *
   * Mora aqui e não no DataTable porque só a tela sabe o que é elegível e o que
   * fazer com o que está marcado. E NÃO usa `useFiltroSessao`: seleção lembrada
   * entre visitas faria o usuário aplicar lote numa lista que ele não está mais
   * olhando.
   */
  const [marcados, setSelecionados] = React.useState<string[]>([]);

  /**
   * Espelha o "salvando" que mora dentro de LoteContaBancaria, só pra
   * BarraSelecao saber quando desabilitar "Limpar seleção": limpar a seleção
   * no meio da gravação em lote deixaria o lote sem as linhas que está
   * gravando.
   */
  const [salvandoLote, setSalvandoLote] = React.useState(false);

  /**
   * Só vale o que está à vista.
   *
   * A seleção é DERIVADA da lista da página, e não zerada por efeito: id que
   * saiu da tela (troca de filtro ou de página) deixa de contar sozinho. Zerar
   * num `useEffect` fazia a mesma coisa, mas com `setState` dentro de efeito, o
   * que dispara render em cascata (e o lint do projeto barra, com razão).
   *
   * O que isto protege: marcar 3 na página 1, trocar o filtro e aplicar gravaria
   * em lançamento que o usuário não está mais olhando.
   */
  /** O maior valor à vista, para a barra da faixa de valor ter escala. */
  const maiorValorDaPagina = React.useMemo(
    () => lancamentos.reduce((maior, l) => Math.max(maior, l.valor), 0),
    [lancamentos],
  );

  const idsVisiveis = React.useMemo(
    () => new Set(lancamentos.map((lancamento) => lancamento.id)),
    [lancamentos],
  );
  const selecionados = React.useMemo(
    () => marcados.filter((id) => idsVisiveis.has(id)),
    [marcados, idsVisiveis],
  );

  const opcoesFornecedor = React.useMemo<OpcaoFiltro[]>(
    () =>
      fornecedores.map((fornecedor) => ({
        valor: fornecedor.id,
        rotulo: fornecedor.nome,
      })),
    [fornecedores],
  );

  const opcoesCategoria = React.useMemo<OpcaoFiltro[]>(
    () =>
      categorias.map((categoria) => ({
        valor: categoria.id,
        rotulo: categoria.nome,
      })),
    [categorias],
  );

  /**
   * O filtro de centro é uma ESCADA de dois campos, e os dois saem do mesmo
   * parâmetro `centro=` da URL.
   *
   * Um campo só listava 102 opções misturando as 12 raízes com os 64
   * equipamentos e os 26 empréstimos, e nada na linha dizia de que centro cada
   * um era: "Bobcat S450 - 02" aparecia entre "Banco do Brasil" e "Caixa
   * Econômica". A regra e o porquê ficam em `_shared/centro-custo/filtro.ts`.
   *
   * Continua UM parâmetro na URL (a lista efetiva, que o servidor expande em
   * subárvore) em vez do par `centro`/`etapa` dos relatórios: é o que faz o
   * drill deles, que já manda a ETAPA dentro de `centro=`, continuar abrindo
   * esta tela recortada pelo equipamento em vez de pela manutenção inteira.
   */
  const { raizes: raizesEscolhidas, etapas: etapasEscolhidas } =
    React.useMemo(
      () => separarRaizesEEtapas(centrosCusto, valores.centros),
      [centrosCusto, valores.centros],
    );

  const opcoesCentro = React.useMemo<OpcaoFiltro[]>(
    () => opcoesDeRaiz(centrosCusto),
    [centrosCusto],
  );

  const opcoesEtapa = React.useMemo<OpcaoFiltro[]>(
    () => opcoesDeEtapa(centrosCusto, raizesEscolhidas),
    [centrosCusto, raizesEscolhidas],
  );

  const nomesEtapa = rotuloDasEtapas(centrosCusto, raizesEscolhidas);

  /** Grava os dois campos no `centro=`, sempre numa navegação só. */
  const escreverCentro = React.useCallback(
    (raizes: string[], etapas: string[]) => {
      setMuitos({
        centro: escreverListaNaUrl(
          centrosEfetivos(centrosCusto, raizes, etapas),
        ),
        pagina: "1",
      });
    },
    [centrosCusto, setMuitos],
  );

  const opcoesConta = React.useMemo<OpcaoFiltro[]>(
    () =>
      contas.map((conta) => ({
        valor: conta.id,
        rotulo: `${conta.nome} - ${ROTULO_BANCO[conta.banco as BancoConta] ?? conta.banco}`,
      })),
    [contas],
  );

  const opcoesForma = React.useMemo<OpcaoFiltro[]>(
    () =>
      formasPagamento.map((forma) => ({
        valor: forma.id,
        rotulo: forma.nome,
      })),
    [formasPagamento],
  );

  // A regra de quem pode sair mora no banco (fn_excluir_lancamento): pagamento
  // aprovado ou pago não exclui, e lançamento de ordem viva sai pela ordem. Aqui
  // a mensagem do banco vai direto para o toast, para a tela não inventar regra
  // paralela que possa divergir dela.
  async function aoExcluir() {
    if (!aExcluir) return;
    const resultado = await excluirLancamento(aExcluir.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Lançamento excluído");
    setAExcluir(null);
    router.refresh();
  }

  /**
   * Ordenação em vigor, para a tabela marcar a coluna e a seta certas. Vem da URL
   * (via `valores`), não de estado local: é o servidor que ordena, então a fonte
   * da verdade tem que ser a mesma que a consulta leu.
   */
  const ordenacao: SortingState = [
    { id: valores.ordem, desc: valores.direcao === "desc" },
  ];

  /**
   * Troca a ordenação na URL. Zera a página pelo mesmo motivo dos filtros: manter
   * a página 5 depois de reordenar mostra um pedaço do meio de uma lista que a
   * pessoa nunca viu do começo.
   *
   * Clique que desliga a ordenação (o terceiro do ciclo do TanStack) volta para o
   * padrão em vez de deixar a lista sem ordem nenhuma: sem `order`, a ordem fica a
   * critério do Postgres e pode repetir linha entre páginas.
   */
  function aoMudarOrdenacao(nova: SortingState) {
    const escolha = nova[0];
    const { ordem, direcao } = escolha
      ? lerOrdenacao(escolha.id, escolha.desc ? "desc" : "asc")
      : { ordem: ORDEM_PADRAO, direcao: DIRECAO_PADRAO };
    const naUrl = ordenacaoParaUrl(ordem, direcao);
    setMuitos({
      ordem: naUrl.ordem ?? null,
      direcao: naUrl.direcao ?? null,
      pagina: "1",
    });
  }

  function aoMudarPaginacao(paginacao: PaginationState) {
    setMuitos({
      pagina: String(paginacao.pageIndex + 1),
      tamanho: String(paginacao.pageSize),
    });
  }

  /**
   * Seletor de valor único preso a um parâmetro da URL. Trocar o filtro zera a
   * página: filtrar e cair numa página vazia parece lista sem resultado.
   */
  function selecao(config: {
    chave: string;
    rotulo: string;
    valor: string;
    opcoes: OpcaoFiltro[];
    todosRotulo: string;
    /** Filtro novo nasce escondido; os que já apareciam continuam visíveis. */
    oculto?: boolean;
    largura?: string;
    /**
     * Filtro sem opção "todos". O `padrao` é o valor que a URL assume quando
     * ninguém escolheu, e é ele que decide se o filtro conta como ATIVO na
     * barra: sem isso, um filtro obrigatório apareceria eternamente como
     * "filtro aplicado" e o contador de filtros nunca voltaria ao normal.
     * Limpar devolve ao padrão, não a "todos" — que não existe mais.
     */
    obrigatorio?: boolean;
    padrao?: string;
  }): FiltroConfiguravel {
    return {
      id: config.chave,
      rotulo: config.rotulo,
      ocultoPorPadrao: config.oculto,
      temValor:
        config.padrao === undefined
          ? config.valor !== ""
          : config.valor !== config.padrao,
      onLimpar: () => setMuitos({ [config.chave]: null, pagina: "1" }),
      elemento: (
        <FiltroSelect
          valor={config.valor}
          onValorChange={(valor) =>
            setMuitos({
              [config.chave]: valor === "" ? null : valor,
              pagina: "1",
            })
          }
          opcoes={config.opcoes}
          placeholder={config.rotulo}
          todosRotulo={config.todosRotulo}
          obrigatorio={config.obrigatorio}
          className={config.largura}
        />
      ),
    };
  }

  /**
   * Seletor de MÚLTIPLA marcação preso a um parâmetro da URL, no formato de
   * lista de `listas-na-url.ts` (ids por vírgula, teto de 50).
   *
   * Existe porque o relatório de custo por centro de custo filtra vários de cada
   * dimensão, e o clique numa barra dele abre esta lista: se a barra daqui só
   * soubesse mostrar um valor, um drill de três fornecedores abriria a lista
   * filtrada pelos três com a barra dizendo "todos os fornecedores".
   */
  function selecaoMulti(config: {
    /** Id do filtro na barra, e chave da URL quando `onValores` não vem. */
    chave: string;
    rotulo: string;
    valores: string[];
    opcoes: OpcaoFiltro[];
    todosRotulo: string;
    oculto?: boolean;
    largura?: string;
    /**
     * Escrita própria, para os dois campos da escada de centro de custo: eles
     * são filtros separados na barra e gravam no MESMO parâmetro da URL, então
     * não podem cair na regra "um filtro, uma chave".
     */
    onValores?: (valores: string[]) => void;
    onLimpar?: () => void;
  }): FiltroConfiguravel {
    return {
      id: config.chave,
      rotulo: config.rotulo,
      ocultoPorPadrao: config.oculto,
      temValor: config.valores.length > 0,
      onLimpar:
        config.onLimpar ??
        (() => setMuitos({ [config.chave]: null, pagina: "1" })),
      elemento: (
        <FiltroSelectMulti
          valores={config.valores}
          onValoresChange={(valores) =>
            config.onValores
              ? config.onValores(valores)
              : setMuitos({
                  [config.chave]: escreverListaNaUrl(valores),
                  pagina: "1",
                })
          }
          maximo={MAX_ITENS_FILTRO}
          opcoes={config.opcoes}
          placeholder={config.rotulo}
          todosRotulo={config.todosRotulo}
          className={config.largura}
        />
      ),
    };
  }

  /** Período (de/até) em duas chaves da URL, gravadas numa navegação só. */
  function periodo(config: {
    id: string;
    /** Nome no menu "Filtros" (ex. "Período de vencimento"). */
    rotulo: string;
    /** Nome curto ao lado dos campos na barra (ex. "Vencimento"). */
    campo: string;
    chaveDe: string;
    chaveAte: string;
    de: string;
    ate: string;
  }): FiltroConfiguravel {
    return {
      id: config.id,
      rotulo: config.rotulo,
      ocultoPorPadrao: true,
      temValor: config.de !== "" || config.ate !== "",
      onLimpar: () =>
        setMuitos({ [config.chaveDe]: null, [config.chaveAte]: null, pagina: "1" }),
      elemento: (
        <FiltroPeriodo
          rotulo={config.campo}
          de={config.de}
          ate={config.ate}
          onPeriodoChange={(de, ate) =>
            setMuitos({
              [config.chaveDe]: de === "" ? null : de,
              [config.chaveAte]: ate === "" ? null : ate,
              pagina: "1",
            })
          }
        />
      ),
    };
  }

  // Filtros declarados na DataTable (e não numa FilterBar solta) para entrarem
  // no menu "Filtros": cada usuário escolhe quais quer ver, e a escolha fica
  // salva com as colunas dele. A barra nasce enxuta (busca, tipo, status e mês);
  // o resto está no menu, porque quinze filtros abertos ao mesmo tempo são uma
  // parede, não uma ferramenta.
  const filtros: FiltroConfiguravel[] = [
    {
      id: "busca",
      rotulo: "Busca",
      fixo: true,
      // Entra no "Limpar filtros": sem isto o botão limpa os seletores e
      // deixa o texto da busca filtrando a lista.
      temValor: busca !== "",
      onLimpar: () => setBusca(""),
      elemento: (
        <FiltroBusca
          valor={busca}
          onValorChange={setBusca}
          placeholder="Buscar por número ou descrição"
        />
      ),
    },
    // TIPO É OBRIGATÓRIO: a lista é sempre de "a pagar" ou de "a receber". Os
    // cartões do topo somam o filtro inteiro, e com os dois tipos juntos "Total
    // no filtro" somava dinheiro que entra com dinheiro que sai.
    selecao({
      chave: "tipo",
      rotulo: "Tipo",
      valor: valores.tipo,
      opcoes: OPCOES_TIPO,
      todosRotulo: "Todos os tipos",
      obrigatorio: true,
      padrao: TIPO_PADRAO,
    }),
    selecao({
      chave: "status",
      rotulo: "Status",
      valor: valores.status,
      opcoes: OPCOES_STATUS,
      todosRotulo: "Todos os status",
    }),
    {
      id: "mes",
      rotulo: "Mês de referência",
      temValor:
        valores.competenciaDe !== "" || valores.competenciaAte !== "",
      // `mes` é apagado junto: quem chegou por link antigo e limpa o filtro não
      // pode ficar com o mês preso na URL, invisível na barra.
      onLimpar: () =>
        setMuitos({ comp_de: null, comp_ate: null, mes: null, pagina: "1" }),
      elemento: (
        <FiltroMesPeriodo
          de={valores.competenciaDe}
          ate={valores.competenciaAte}
          onPeriodoChange={(novoDe, novoAte) =>
            setMuitos({
              comp_de: novoDe === "" ? null : novoDe,
              comp_ate: novoAte === "" ? null : novoAte,
              // Escrever a janela apaga o `mes` do link antigo: dois filtros
              // para a mesma pergunta na URL é o caminho para eles discordarem.
              mes: null,
              pagina: "1",
            })
          }
        />
      ),
    },
    // Sem `oculto`: filtro novo nasce VISÍVEL, inclusive para quem já tem
    // preferência de filtros salva (o `filtroVisivel` do DataTable cai em `true`
    // quando o id não está na preferência nem nos ocultos por padrão). Nasceu
    // escondido seria o mesmo problema do botão de exportar: existe e não é achado.
    selecao({
      chave: "atraso",
      rotulo: "Atraso",
      valor: valores.atraso,
      opcoes: OPCOES_ATRASO,
      todosRotulo: "Vencidos e a vencer",
    }),
    selecao({
      chave: "revisao",
      rotulo: "Revisão",
      valor: valores.revisao,
      opcoes: OPCOES_REVISAO,
      todosRotulo: "Qualquer revisão",
      oculto: true,
    }),
    selecaoMulti({
      chave: "fornecedor",
      rotulo: "Fornecedor",
      valores: valores.fornecedores,
      opcoes: opcoesFornecedor,
      todosRotulo: "Todos os fornecedores",
      oculto: true,
      largura: LARGURA_NOME,
    }),
    selecaoMulti({
      chave: "categoria",
      rotulo: "Categoria",
      valores: valores.categorias,
      opcoes: opcoesCategoria,
      todosRotulo: "Todas as categorias",
      oculto: true,
      largura: LARGURA_NOME,
    }),
    selecaoMulti({
      chave: "centro",
      rotulo: "Centro de custo",
      valores: raizesEscolhidas,
      opcoes: opcoesCentro,
      todosRotulo: "Todos os centros de custo",
      oculto: true,
      largura: LARGURA_NOME,
      // Trocar a raiz apaga as etapas órfãs na MESMA navegação: em duas, o id do
      // equipamento seguiria vivo dentro do `centro=` sem campo nenhum na tela
      // mostrando que ele está lá.
      onValores: (ids) =>
        escreverCentro(ids, etapasValidas(centrosCusto, ids, etapasEscolhidas)),
      onLimpar: () => setMuitos({ centro: null, pagina: "1" }),
    }),
    // O segundo degrau só entra na barra quando há o que escolher nele, e entra
    // VISÍVEL (sem `oculto`): ele aparece por causa de uma escolha que a pessoa
    // acabou de fazer no campo ao lado, então mandá-la ao menu "Filtros" para
    // revelar o campo que ela provocou seria esconder a própria resposta.
    ...(temEtapasParaEscolher(centrosCusto, raizesEscolhidas)
      ? [
          selecaoMulti({
            chave: "etapa",
            rotulo: nomesEtapa.rotulo,
            valores: etapasEscolhidas,
            opcoes: opcoesEtapa,
            todosRotulo: nomesEtapa.todos,
            largura: LARGURA_NOME,
            onValores: (ids) => escreverCentro(raizesEscolhidas, ids),
            onLimpar: () => escreverCentro(raizesEscolhidas, []),
          }),
        ]
      : []),
    selecao({
      chave: "conta",
      rotulo: "Conta bancária",
      valor: valores.conta,
      opcoes: opcoesConta,
      todosRotulo: "Todas as contas",
      oculto: true,
      largura: LARGURA_NOME,
    }),
    selecaoMulti({
      chave: "forma",
      rotulo: "Forma de pagamento",
      valores: valores.formas,
      opcoes: opcoesForma,
      todosRotulo: "Todas as formas",
      oculto: true,
      largura: LARGURA_NOME,
    }),
    selecao({
      chave: "origem",
      rotulo: "Origem",
      valor: valores.origem,
      opcoes: OPCOES_ORIGEM,
      todosRotulo: "Todas as origens",
      oculto: true,
    }),
    {
      id: "valor",
      rotulo: "Faixa de valor",
      ocultoPorPadrao: true,
      temValor: faixaValor.de !== "" || faixaValor.ate !== "",
      onLimpar: limparFaixaValor,
      elemento: (
        <FiltroValor
          de={faixaValor.de}
          ate={faixaValor.ate}
          // O maior valor da PÁGINA dá escala à barra. Não é teto de filtro: a
          // alça na borda direita significa "sem limite", então a compra maior
          // que tudo o que está à vista nunca fica escondida.
          maiorValor={maiorValorDaPagina}
          onValorChange={(de, ate) => setFaixaValor({ de, ate })}
        />
      ),
    },
    periodo({
      id: "vencimento",
      rotulo: "Período de vencimento",
      campo: "Vencimento",
      chaveDe: "venc_de",
      chaveAte: "venc_ate",
      de: valores.vencDe,
      ate: valores.vencAte,
    }),
    periodo({
      id: "compra",
      rotulo: "Período da compra",
      campo: "Compra",
      chaveDe: "compra_de",
      chaveAte: "compra_ate",
      de: valores.compraDe,
      ate: valores.compraAte,
    }),
    periodo({
      id: "criado",
      rotulo: "Período de criação",
      campo: "Criado em",
      chaveDe: "criado_de",
      chaveAte: "criado_ate",
      de: valores.criadoDe,
      ate: valores.criadoAte,
    }),
  ];

  const selecionadosNaPagina = lancamentos.filter((lancamento) =>
    selecionados.includes(lancamento.id),
  );
  // Só o resumo da barra usa isto agora: LoteContaBancaria não repete o valor
  // na própria frase (o resumo já mostra o total o tempo todo, inclusive no
  // instante de confirmar — repetir ali seria a mesma informação duas vezes).
  const valorSelecionado = selecionadosNaPagina.reduce(
    (soma, lancamento) => soma + lancamento.valor,
    0,
  );

  return (
    <div className="flex flex-col gap-2">
      <BarraSelecao
        quantidade={selecionados.length}
        onLimpar={() => setSelecionados([])}
        resumo={<MoneyText valor={valorSelecionado} />}
        limparDesabilitado={salvandoLote}
      >
        <BotaoEspelho rota="/espelho/lancamentos" ids={selecionados} />
        {podeCriar ? (
          <BotaoDuplicarLancamento
            selecionados={selecionados}
            onLimparSelecao={() => setSelecionados([])}
          />
        ) : null}
        <LoteContaBancaria
          selecionados={selecionados}
          jaComConta={
            selecionadosNaPagina.filter(
              (lancamento) => !ehElegivelParaLote(lancamento),
            ).length
          }
          contas={opcoesConta}
          onLimparSelecao={() => setSelecionados([])}
          onConcluido={() => router.refresh()}
          onSalvandoChange={setSalvandoLote}
        />
      </BarraSelecao>
      <DataTable
        onLimparFiltros={limparTodos}
        idTabela="financeiro.lancamentos"
        columns={colunas}
        data={lancamentos}
        filtros={filtros}
        total={total}
        pageIndex={pagina}
        pageSize={tamanho}
        onPaginationChange={aoMudarPaginacao}
        sorting={ordenacao}
        onSortingChange={aoMudarOrdenacao}
        selecao={{
          idDaLinha: (lancamento) => lancamento.id,
          selecionados,
          onSelecionadosChange: setSelecionados,
        }}
        onRowClick={(lancamento) =>
          router.push(`/financeiro/lancamentos/${lancamento.id}`)
        }
        acoesLinha={
          podeExcluir
            ? (lancamento) => (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setAExcluir(lancamento)}
                >
                  <Trash2 />
                  Excluir
                </DropdownMenuItem>
              )
            : undefined
        }
        emptyState={
          <EmptyState
            icone={Receipt}
            titulo="Nenhum lançamento"
            descricao="Crie o primeiro lançamento a pagar ou a receber para começar"
            className="border-none bg-transparent"
          />
        }
      />

      <ConfirmDialog
        aberto={aExcluir !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setAExcluir(null);
        }}
        titulo="Excluir lançamento"
        descricao={
          aExcluir
            ? `${aExcluir.numero ?? "Este lançamento"} sai do sistema. Só dá para excluir enquanto o pagamento não foi aprovado nem pago: se já foi, desaprove ou estorne antes.`
            : ""
        }
        textoConfirmar="Excluir"
        variante="destrutivo"
        onConfirmar={aoExcluir}
      />
    </div>
  );
}
