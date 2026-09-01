"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { CheckCircle2, Wallet } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import {
  BarraSelecao,
  BotaoEspelho,
  CelulaDescricaoCategoria,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroMes,
  FiltroPeriodo,
  FiltroSelect,
  FiltroSelectMulti,
  FiltroValor,
  GradeKpis,
  KPICard,
  MoneyText,
  SeloObservacoes,
  StatusBadge,
  useBuscaUrl,
  useFaixaUrl,
  useFiltrosUrl,
  type FiltroConfiguravel,
  type OpcaoFiltro,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import type { AnexoDoDocumento } from "@/modules/_shared/anexos/queries";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatarBRL, formatarData } from "@/lib/formatadores";
import {
  ROTULO_BANCO,
  STATUS_PARCELA,
  STATUS_PARCELA_ABERTA,
  type BancoConta,
} from "@/modules/financeiro/_shared/formato";
import { ComposicaoDoLiquido } from "@/modules/financeiro/_shared/composicao-liquido";
import {
  escreverListaNaUrl,
  MAX_ITENS_FILTRO,
} from "@/modules/financeiro/_shared/listas-na-url";
import { programacaoVencida } from "@/modules/financeiro/_shared/janela-pagamento";
import {
  ORIGENS_LANCAMENTO,
  ROTULO_ORIGEM_LANCAMENTO,
} from "@/modules/financeiro/lancamentos/schemas";
import { subarvoreDeCentros } from "@/modules/_shared/centro-custo/selecao";
import {
  centrosEfetivos,
  etapasValidas,
  opcoesDeEtapa,
  opcoesDeRaiz,
  rotuloDasEtapas,
  separarRaizesEEtapas,
  temEtapasParaEscolher,
} from "@/modules/_shared/centro-custo/filtro";
import type {
  CategoriaOpcao,
  CentroCustoOpcao,
  FormaPagamentoOpcao,
  FornecedorOpcao,
} from "@/modules/financeiro/lancamentos/queries";
import {
  buscarParcelasPagas,
  estornarPagamento,
} from "@/modules/financeiro/pagamentos/actions";
import type {
  ContaBancariaOpcao,
  FiltrosParcelasPagas,
  ParcelaAprovada,
  ParcelaPaga,
} from "@/modules/financeiro/pagamentos/queries";
import { DetalheParcelaDrawer } from "./detalhe-parcela-drawer";
import { PagarLoteDrawer } from "./pagar-lote-drawer";
import {
  contagem,
  podePagarParcela,
  somarParaResumo,
  type ResumoPagas,
} from "@/modules/financeiro/pagamentos/resumo";

import { PagarParcelaDrawer } from "./pagar-parcela-drawer";

const TAMANHO_PAGINA = 25;

/** Largura máxima do seletor de nome comprido (fornecedor, conta bancária). */
const LARGURA_NOME = "max-w-[15rem]";

/** Valores dos filtros da aba "A pagar", como vivem na URL. */
/**
 * Origens do lançamento, reusando a lista e os rótulos de `lancamentos/schemas`.
 * Uma segunda lista aqui divergiria na primeira origem nova -- e origem nova
 * aconteceu duas vezes este mês (diária e adiantamento).
 */
const OPCOES_ORIGEM: OpcaoFiltro[] = ORIGENS_LANCAMENTO.map((valor) => ({
  valor,
  rotulo: ROTULO_ORIGEM_LANCAMENTO[valor],
}));

export interface ValoresFiltrosAPagar {
  busca: string;
  /**
   * Situações da parcela na fila: lista VAZIA é "todas as situações em aberto".
   *
   * Existe porque a fila passou a mostrar pendente e em revisão junto com
   * aprovada, e porque é ele que faz o cartão "Vence em até 7 dias" do Painel
   * cair numa lista que soma exatamente o número do cartão (só aprovadas).
   *
   * Lista, e não valor único, porque "o que já posso pagar" costuma ser mais de
   * uma situação ao mesmo tempo.
   */
  situacoes: string[];
  fornecedorIds: string[];
  contaIds: string[];
  valorDe: string;
  valorAte: string;
  vencDe: string;
  vencAte: string;
  /** Período da data programada (data autorizada do pagamento). */
  progDe: string;
  progAte: string;
  /**
   * Dimensões do LANÇAMENTO por trás da parcela. Existem porque a tela de
   * Pagamentos tinha 7 filtros contra os 16 de Lançamentos, e quem paga faz as
   * mesmas perguntas de quem lança: de que obra é, que tipo de custo é, por qual
   * forma sai.
   */
  categoriaIds: string[];
  /**
   * Centros de custo escolhidos. O filtro pega a SUBÁRVORE de cada um (obra traz
   * as etapas, manutenção traz cada equipamento) e a UNIÃO dos conjuntos: marcar
   * duas obras é "quero as duas".
   */
  centroIds: string[];
  formaIds: string[];
  /** Mês de referência no formato do campo da tela: yyyy-MM. */
  mes: string;
  origem: string;
  /** Período da data da compra (o fato, não o vencimento). */
  compraDe: string;
  compraAte: string;
}

/**
 * Valores dos filtros da aba "Pagas", como vivem na URL (prefixo h_).
 *
 * Sem `situacoes`: lá toda parcela é `pago`, e um filtro de situação com uma
 * opção só é decoração que sugere que existe outra coisa para escolher.
 */
export interface ValoresFiltrosPagas extends Omit<
  ValoresFiltrosAPagar,
  "situacoes"
> {
  pagoDe: string;
  pagoAte: string;
}

/**
 * Todos os filtros vazios, que é o estado "sem filtro nenhum".
 *
 * Exportado para os testes montarem as props sem repetir a lista de campos: a
 * cada filtro novo, três arquivos de teste quebravam por causa de um objeto
 * literal desatualizado, e o erro do `tsc` falava de propriedade faltando em vez
 * do que realmente mudou.
 */
export const FILTROS_A_PAGAR_VAZIOS: ValoresFiltrosAPagar = {
  busca: "",
  // Os três de múltipla escolha são LISTA vazia, e não string vazia: aqui "sem
  // filtro" tem que ser o mesmo valor que a tela trata como "todos".
  situacoes: [],
  fornecedorIds: [],
  contaIds: [],
  valorDe: "",
  valorAte: "",
  vencDe: "",
  vencAte: "",
  progDe: "",
  progAte: "",
  categoriaIds: [],
  centroIds: [],
  formaIds: [],
  mes: "",
  origem: "",
  compraDe: "",
  compraAte: "",
};

export const FILTROS_PAGAS_VAZIOS: ValoresFiltrosPagas = {
  ...FILTROS_A_PAGAR_VAZIOS,
  pagoDe: "",
  pagoAte: "",
};

export interface PagamentosClienteProps {
  aprovadas: ParcelaAprovada[];
  pagas: ParcelaPaga[];
  totalPagas: number;
  /**
   * Quanto SAIU DA CONTA no recorte do histórico (soma do líquido de todas as
   * linhas do filtro, não da página). É o número que o cartão "Pago no mês" do
   * Painel mostra, e é o que faz clicar no cartão cair numa tela que confirma
   * aquele valor em vez de deixar o operador somar 25 linhas de cada vez.
   */
  /**
   * O recorte somado: `valor`, os três ajustes e o líquido. O card mostra o
   * líquido; o rodapé da tabela mostra a composição inteira, e é assim que os
   * dois números da tela fecham entre si.
   */
  somaPagas: ResumoPagas;
  /** Aba que abre primeiro. O Painel manda `aba=pagas` no cartão "Pago no mês". */
  abaInicial?: "a-pagar" | "pagas";
  contas: ContaBancariaOpcao[];
  /** Fornecedores ativos, para o seletor de fornecedor das duas abas. */
  fornecedores: FornecedorOpcao[];
  /** Categorias de despesa, para o filtro de categoria das duas abas. */
  categorias: CategoriaOpcao[];
  /** Centros de custo (raízes e etapas), para o filtro de centro. */
  centrosCusto: CentroCustoOpcao[];
  formasPagamento: FormaPagamentoOpcao[];
  podePagar: boolean;
  podeEstornar: boolean;
  /**
   * Libera o "Voltar para aprovação" no detalhe de uma parcela aprovada. Vem da
   * permissão de `desaprovar` em financeiro.aprovacao-pagamentos, que é de quem
   * aprova: quem só paga não desfaz a autorização que recebeu.
   */
  podeDesaprovar?: boolean;
  /** Hoje em "YYYY-MM-DD" (America/Rio_Branco), calculado no server component. */
  hoje: string;
  /** Anexos por parcela, para o drawer de pagamento mostrar o comprovante. */
  anexosPorParcela?: Record<string, AnexoDoDocumento[]>;
  valoresAPagar: ValoresFiltrosAPagar;
  valoresPagas: ValoresFiltrosPagas;
  /**
   * Os mesmos filtros da aba "Pagas" já validados na página, para acompanhar a
   * action que busca as próximas páginas do histórico.
   */
  filtrosPagas: FiltrosParcelasPagas;
}

/**
 * Data (YYYY-MM-DD, comparável como texto) dentro do período. Ponta vazia é
 * sem limite naquele lado. Parcela sem a data fica fora de qualquer período:
 * ela não tem data para comparar, e tratá-la como "dentro" mostraria linha que
 * o filtro não pediu.
 */
function dentroDoPeriodo(
  data: string | null,
  de: string,
  ate: string,
): boolean {
  if (de === "" && ate === "") return true;
  if (!data) return false;
  if (de !== "" && data < de) return false;
  if (ate !== "" && data > ate) return false;
  return true;
}

/** Número do lançamento + parcela para exibição (ex: LAN-0001 / 2). */
function rotuloParcela(
  numero: string | null,
  numeroParcela: number,
): React.ReactNode {
  if (!numero) {
    return (
      <span className="text-muted-foreground tabular-nums">
        Parcela {numeroParcela}
      </span>
    );
  }
  return (
    <span className="tabular-nums">
      <span className="codigo-doc">{numero}</span>
      <span className="text-muted-foreground"> / {numeroParcela}</span>
    </span>
  );
}

/**
 * A coluna de centro de custo, igual nas duas abas.
 *
 * Uma definição para as duas tabelas de propósito: "a pagar" e "pagas" mostram o
 * mesmo lançamento, e duas cópias da coluna divergiriam em largura, rótulo ou
 * regra no primeiro ajuste feito de um lado só. A regra do texto mora em
 * `_shared/centro-de-custo.ts`, compartilhada também com Lançamentos e
 * Recebimentos.
 */
function colunaCentroCusto<
  T extends { centroCustoRotulo?: string | null; centroCustoNomes?: string },
>(): ColumnDef<T, unknown> {
  return {
    id: "centroCusto",
    header: "Centro de custo",
    size: 180,
    // Não ordena: o nome vem de embed de rateio e a lista é paginada no
    // servidor. A seta ordenaria só a página visível.
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
  };
}

/**
 * O que o estorno vai APAGAR desta parcela, em texto, ou null quando não há
 * nada a apagar.
 *
 * `fn_estornar_pagamento` zera os TRÊS ajustes junto com a data e a conta.
 * Enquanto o aviso citava só o desconto, estornar uma parcela paga com multa
 * apagava dinheiro que a confirmação nunca mencionou.
 */
function textoDosAjustes(parcela: ParcelaPaga): string | null {
  const itens: string[] = [];
  if (parcela.desconto > 0) {
    itens.push(`o desconto de ${formatarBRL(parcela.desconto)}`);
  }
  if (parcela.juros > 0) {
    itens.push(`os juros de ${formatarBRL(parcela.juros)}`);
  }
  if (parcela.outrasDespesas > 0) {
    itens.push(`as despesas de ${formatarBRL(parcela.outrasDespesas)}`);
  }
  if (itens.length === 0) return null;
  const lista =
    itens.length === 1
      ? itens[0]
      : `${itens.slice(0, -1).join(", ")} e ${itens.at(-1)}`;
  return `${lista} ${itens.length === 1 ? "é apagado" : "são apagados"}`;
}

/**
 * Célula do valor na tabela de pagamentos pagas: o valor da parcela e, quando
 * houve ajuste no ato do pagamento (desconto, juros e multa, outras despesas), a
 * composição do líquido logo abaixo.
 *
 * A frase inteira vive em `ComposicaoDoLiquido`, compartilhada com a linha de
 * parcela do detalhe do lançamento: as duas telas afirmam o mesmo fato sobre a
 * mesma parcela, e duas versões da frase divergiriam no primeiro ajuste novo.
 */
export function CelulaValorPaga({ parcela }: { parcela: ParcelaPaga }) {
  /*
   * Com filtro de centro ligado, a coluna mostra a FATIA daquele centro, não o
   * valor do pagamento: a "COMPRA DE 3 CARRETAS" de R$ 100.000,00 entra com um
   * terço em cada carreta, e é isso que faz o total das partes fechar com o total
   * do centro pai (escolha do Tiago em 01/09/2026, ver `recorte.ts`).
   *
   * E a composição do líquido SAI junto: desconto, juros e despesas são do
   * pagamento inteiro, então imprimi-los embaixo de uma fatia daria uma conta que
   * não fecha (fatia − desconto cheio). Quem quer a composição abre a parcela.
   */
  /*
   * `typeof === "number"` e não `!== null` de propósito: o campo AUSENTE
   * (undefined) tem que cair no caminho normal, não no da fatia. Com a checagem
   * de null, quem montasse a linha sem o campo veria "R$ 0,00" no lugar do valor
   * pago -- zero silencioso onde devia estar dinheiro. Aconteceu em 01/09/2026,
   * nas fixtures de teste, antes desta linha existir.
   */
  if (typeof parcela.valorRecorte === "number") {
    return <MoneyText valor={parcela.valorRecorte} />;
  }

  return (
    <>
      <MoneyText valor={parcela.valor} />
      <ComposicaoDoLiquido
        desconto={parcela.desconto}
        juros={parcela.juros}
        outrasDespesas={parcela.outrasDespesas}
        valorLiquido={parcela.valorLiquido}
      />
    </>
  );
}

/**
 * Situações que aparecem na fila a pagar, para o filtro.
 *
 * Sai de STATUS_PARCELA_ABERTA e não de uma lista digitada: é a mesma origem
 * que a consulta usa, então situação nova entra nas duas ao mesmo tempo. `pago`
 * e `cancelado` não estão aqui porque não são fila a pagar.
 */
const OPCOES_SITUACAO: OpcaoFiltro[] = STATUS_PARCELA_ABERTA.map((status) => ({
  valor: status,
  rotulo: STATUS_PARCELA[status].rotulo,
}));

/**
 * Tela de pagamentos: cards que resumem o que está em aberto (ou o que está
 * marcado), aba "A pagar" com as parcelas aprovadas E as que ainda aguardam
 * aprovação, e aba "Pagas" com o histórico paginado no servidor.
 */
export function PagamentosCliente({
  aprovadas,
  pagas,
  totalPagas,
  somaPagas,
  abaInicial = "a-pagar",
  contas,
  fornecedores,
  categorias,
  centrosCusto,
  formasPagamento,
  podePagar,
  podeEstornar,
  podeDesaprovar = false,
  hoje,
  anexosPorParcela = {},
  valoresAPagar,
  valoresPagas,
  filtrosPagas,
}: PagamentosClienteProps) {
  const router = useRouter();
  const { setMuitos, limparTodos } = useFiltrosUrl();
  // Faixa de valor é digitada dígito a dígito: vai pela URL com espera, senão
  // cada tecla viraria uma navegação e o campo perderia caracteres. Uma por aba,
  // porque cada aba tem as suas chaves (o histórico usa o prefixo h_).
  const faixaAPagar = useFaixaUrl("valor_de", "valor_ate");
  const faixaPagas = useFaixaUrl("h_valor_de", "h_valor_ate");

  const [parcelaAlvo, setParcelaAlvo] = React.useState<ParcelaAprovada | null>(
    null,
  );
  const [drawerAberto, setDrawerAberto] = React.useState(false);

  const [parcelaEstorno, setParcelaEstorno] =
    React.useState<ParcelaPaga | null>(null);
  const [estornoAberto, setEstornoAberto] = React.useState(false);

  // Painel de detalhe: guarda só o ID e carrega sob demanda. Guardar a linha
  // inteira daria um detalhe montado com o que a listagem por acaso trouxe, e a
  // listagem não tem rateio, anexo nem trilha.
  const [detalheId, setDetalheId] = React.useState<string | null>(null);
  const [detalheAberto, setDetalheAberto] = React.useState(false);

  // A aba é CONTROLADA porque o Painel manda em qual delas a tela abre: o
  // cartão "Pago no mês" chega com `aba=pagas`, e um Tabs não controlado
  // ignoraria isso e abriria sempre na fila a pagar.
  const [aba, setAba] = React.useState<"a-pagar" | "pagas">(abaInicial);

  /**
   * Troca de aba limpa as DUAS seleções: mesma razão de lancamentos-tabela.tsx
   * não persistir seleção entre visitas — imprimir ou pagar o que o usuário não
   * está mais vendo é o pior tipo de surpresa.
   */
  function trocarAba(nova: string) {
    setAba(nova === "pagas" ? "pagas" : "a-pagar");
    setSelecionados([]);
    setSelecionadosAPagar([]);
  }

  // Seleção da fila a pagar, e o drawer de pagamento em lote.
  const [selecionadosAPagar, setSelecionadosAPagar] = React.useState<string[]>(
    [],
  );
  const [loteAberto, setLoteAberto] = React.useState(false);

  function abrirEstorno(parcela: ParcelaPaga) {
    setParcelaEstorno(parcela);
    setEstornoAberto(true);
  }

  async function confirmarEstorno() {
    if (!parcelaEstorno) return;
    const resultado = await estornarPagamento(parcelaEstorno.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Pagamento estornado");
    router.refresh();
  }

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
   * O primeiro degrau da escada: só os centros de custo RAIZ.
   *
   * O filtro expande a SUBÁRVORE no banco, então escolher a manutenção alcança
   * as parcelas de cada equipamento e escolher a obra alcança as etapas dela --
   * sem despejar os 73 centros numa lista onde 61 são equipamentos. Quem quer o
   * equipamento sozinho usa o segundo campo, que aparece ao lado. A regra é a de
   * `_shared/centro-custo/filtro.ts`, igual em Lançamentos e nos relatórios.
   */
  const opcoesCentro = React.useMemo<OpcaoFiltro[]>(
    () => opcoesDeRaiz(centrosCusto),
    [centrosCusto],
  );

  /**
   * A escada das DUAS abas, montada uma vez.
   *
   * Cada aba tem a sua chave na URL (`centro` e `h_centro`), e as duas guardam a
   * lista EFETIVA -- a raiz, ou as etapas dela quando alguma foi escolhida. Uma
   * chave só por aba é o que mantém de pé todo link já compartilhado desta tela,
   * inclusive o do relatório que aponta direto para um equipamento.
   */
  function escadaDeCentro(chave: string, efetivos: string[]) {
    const { raizes, etapas } = separarRaizesEEtapas(centrosCusto, efetivos);
    const nomes = rotuloDasEtapas(centrosCusto, raizes);
    const gravar = (novasRaizes: string[], novasEtapas: string[]) =>
      setMuitos({
        [chave]: escreverListaNaUrl(
          centrosEfetivos(centrosCusto, novasRaizes, novasEtapas),
        ),
        pagina: "1",
      });

    return { raizes, etapas, nomes, gravar };
  }

  const escadaAPagar = escadaDeCentro("centro", valoresAPagar.centroIds);
  const escadaPagas = escadaDeCentro("h_centro", valoresPagas.centroIds);

  const opcoesForma = React.useMemo<OpcaoFiltro[]>(
    () =>
      formasPagamento.map((forma) => ({
        valor: forma.id,
        rotulo: forma.nome,
      })),
    [formasPagamento],
  );

  const opcoesConta = React.useMemo<OpcaoFiltro[]>(
    () =>
      contas.map((conta) => ({
        valor: conta.id,
        rotulo: `${conta.nome} - ${ROTULO_BANCO[conta.banco as BancoConta] ?? conta.banco}`,
      })),
    [contas],
  );

  /**
   * Seletor de valor único preso a um parâmetro da URL. Trocar o filtro zera a
   * página: filtrar e cair numa página vazia parece lista sem resultado.
   */
  function selecao(config: {
    id: string;
    chave: string;
    rotulo: string;
    valor: string;
    opcoes: OpcaoFiltro[];
    todosRotulo: string;
    largura?: string;
  }): FiltroConfiguravel {
    return {
      id: config.id,
      rotulo: config.rotulo,
      ocultoPorPadrao: true,
      temValor: config.valor !== "",
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
          className={config.largura}
        />
      ),
    };
  }

  /**
   * Seletor de MÚLTIPLA escolha preso a um parâmetro da URL. Lista vazia é
   * "todos", e some da URL em vez de virar string vazia.
   *
   * O teto de `MAX_ITENS_FILTRO` não é gosto: na aba "Pagas" a lista vira um
   * `in` que o PostgREST manda na própria URL, e lista grande vira HTTP 400 por
   * tamanho antes de chegar na RLS. O `FiltroSelectMulti` avisa ao bater no
   * teto em vez de cortar calado.
   */
  function selecaoMulti(config: {
    id: string;
    chave: string;
    rotulo: string;
    valores: string[];
    opcoes: OpcaoFiltro[];
    todosRotulo: string;
    largura?: string;
    /** `false` no segundo degrau da escada: ver o comentário onde ele é montado. */
    oculto?: boolean;
    /**
     * Escrita própria, para os dois campos da escada de centro de custo: eles
     * são filtros separados na barra e gravam na MESMA chave da URL.
     */
    onValores?: (valores: string[]) => void;
    onLimpar?: () => void;
  }): FiltroConfiguravel {
    return {
      id: config.id,
      rotulo: config.rotulo,
      ocultoPorPadrao: config.oculto ?? true,
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
          opcoes={config.opcoes}
          placeholder={config.rotulo}
          todosRotulo={config.todosRotulo}
          maximo={MAX_ITENS_FILTRO}
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
        setMuitos({
          [config.chaveDe]: null,
          [config.chaveAte]: null,
          pagina: "1",
        }),
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

  /** Mês de referência (yyyy-MM) numa chave da URL. */
  function mesReferencia(config: {
    id: string;
    chave: string;
    valor: string;
  }): FiltroConfiguravel {
    return {
      id: config.id,
      rotulo: "Mês de referência",
      ocultoPorPadrao: true,
      temValor: config.valor !== "",
      onLimpar: () => setMuitos({ [config.chave]: null, pagina: "1" }),
      elemento: (
        <FiltroMes
          valor={config.valor}
          onValorChange={(valor) =>
            setMuitos({
              [config.chave]: valor === "" ? null : valor,
              pagina: "1",
            })
          }
        />
      ),
    };
  }

  /** O maior valor à vista em cada aba, só para dar escala à barra. */
  const maiorValorAPagar = React.useMemo(
    () => aprovadas.reduce((maior, p) => Math.max(maior, p.valor), 0),
    [aprovadas],
  );
  const maiorValorPagas = React.useMemo(
    () => pagas.reduce((maior, p) => Math.max(maior, p.valor), 0),
    [pagas],
  );

  /**
   * Faixa de valor (de/até) da aba, presa às chaves de URL dela.
   *
   * `maiorValor` é a ESCALA da barra, tirada do que está à vista naquela aba.
   * Não é teto de filtro: a alça na borda direita significa "sem limite", então
   * a parcela maior que tudo o que a página mostra nunca fica escondida.
   */
  function faixaValor(
    id: string,
    controle: ReturnType<typeof useFaixaUrl>,
    maiorValor: number,
  ): FiltroConfiguravel {
    return {
      id,
      rotulo: "Faixa de valor",
      ocultoPorPadrao: true,
      temValor: controle.faixa.de !== "" || controle.faixa.ate !== "",
      onLimpar: controle.limpar,
      elemento: (
        <FiltroValor
          de={controle.faixa.de}
          ate={controle.faixa.ate}
          maiorValor={maiorValor}
          onValorChange={(de, ate) => controle.setFaixa({ de, ate })}
        />
      ),
    };
  }

  // A fila de aprovadas vem inteira do servidor (sem paginação), então os
  // filtros dela valem em memória: aqui não existe página escondida para
  // filtrar errado. O KPI continua somando a fila toda: ele é o total a pagar
  // da empresa, não o total do que está na tela.
  const { busca: buscaAprovadas, setBusca: setBuscaAprovadas } = useBuscaUrl(
    valoresAPagar.busca,
  );
  /**
   * A subárvore do centro escolhido, uma vez por render em vez de por linha.
   * `null` quando não há filtro de centro -- assim o laço nem entra no teste.
   */
  const centroDoFiltro = React.useMemo(
    () =>
      valoresAPagar.centroIds.length === 0
        ? null
        : subarvoreDeCentros(centrosCusto, valoresAPagar.centroIds),
    [centrosCusto, valoresAPagar.centroIds],
  );

  const aprovadasFiltradas = React.useMemo(() => {
    const termo = buscaAprovadas.trim().toLowerCase();
    const valorDe =
      valoresAPagar.valorDe === "" ? null : Number(valoresAPagar.valorDe);
    const valorAte =
      valoresAPagar.valorAte === "" ? null : Number(valoresAPagar.valorAte);

    /*
     * `null` quando o filtro está em branco, `Set` quando tem escolha. Duas
     * coisas de propósito: o `null` distingue "todos" de "nenhum marcado"
     * (com lista vazia, `has` recusaria tudo e a fila apareceria zerada), e o
     * `Set` faz a busca ser O(1) — com `includes`, cada uma das ~840 parcelas
     * varreria a lista inteira a cada tecla digitada na busca.
     */
    const conjunto = (itens: string[]) =>
      itens.length === 0 ? null : new Set(itens);
    const fornecedoresEscolhidos = conjunto(valoresAPagar.fornecedorIds);
    const contasEscolhidas = conjunto(valoresAPagar.contaIds);
    const situacoesEscolhidas = conjunto(valoresAPagar.situacoes);
    const categoriasEscolhidas = conjunto(valoresAPagar.categoriaIds);
    const formasEscolhidas = conjunto(valoresAPagar.formaIds);

    return aprovadas.filter((parcela) => {
      if (
        termo !== "" &&
        !`${parcela.lancamentoNumero ?? ""} ${parcela.descricao} ${parcela.fornecedorNome}`
          .toLowerCase()
          .includes(termo)
      ) {
        return false;
      }
      // Lista vazia é "todos": a checagem de conjunto só entra quando há
      // escolha, senão nenhuma parcela passaria com o filtro em branco.
      if (
        fornecedoresEscolhidos !== null &&
        !fornecedoresEscolhidos.has(parcela.fornecedorId ?? "")
      ) {
        return false;
      }
      if (
        contasEscolhidas !== null &&
        !contasEscolhidas.has(parcela.contaBancariaId ?? "")
      ) {
        return false;
      }
      if (
        situacoesEscolhidas !== null &&
        !situacoesEscolhidas.has(parcela.status ?? "aprovado")
      ) {
        return false;
      }
      if (valorDe !== null && parcela.valor < valorDe) return false;
      if (valorAte !== null && parcela.valor > valorAte) return false;
      if (
        !dentroDoPeriodo(
          parcela.dataVencimento,
          valoresAPagar.vencDe,
          valoresAPagar.vencAte,
        )
      ) {
        return false;
      }
      if (
        !dentroDoPeriodo(
          parcela.dataProgramada,
          valoresAPagar.progDe,
          valoresAPagar.progAte,
        )
      ) {
        return false;
      }
      if (
        categoriasEscolhidas !== null &&
        !categoriasEscolhidas.has(parcela.categoriaId ?? "")
      ) {
        return false;
      }
      // O centro casa pela SUBÁRVORE, e contra TODOS os centros do rateio:
      // escolher a manutenção acha a parcela pendurada num equipamento, e um
      // custo dividido entre duas obras aparece filtrando por qualquer uma.
      if (
        centroDoFiltro !== null &&
        !(parcela.centroCustoIds ?? []).some((id) => centroDoFiltro.has(id))
      ) {
        return false;
      }
      if (
        formasEscolhidas !== null &&
        !formasEscolhidas.has(parcela.formaPagamentoId ?? "")
      ) {
        return false;
      }
      // O campo da tela é yyyy-MM e a coluna é o primeiro dia do mês.
      if (
        valoresAPagar.mes !== "" &&
        (parcela.mesCompetencia ?? "").slice(0, 7) !== valoresAPagar.mes
      ) {
        return false;
      }
      if (
        valoresAPagar.origem !== "" &&
        parcela.origem !== valoresAPagar.origem
      ) {
        return false;
      }
      if (
        !dentroDoPeriodo(
          parcela.dataCompra ?? null,
          valoresAPagar.compraDe,
          valoresAPagar.compraAte,
        )
      ) {
        return false;
      }
      return true;
    });
  }, [aprovadas, buscaAprovadas, valoresAPagar, centroDoFiltro]);

  /**
   * As parcelas que os cards resumem.
   *
   * Sem seleção, o resumo é do FILTRO inteiro: cards zerados numa tela cheia de
   * linhas não dizem nada, e o número que interessa ao abrir é quanto a empresa
   * deve no recorte que está vendo. Com linhas marcadas, passa a resumir só o
   * marcado, que é o que o Tiago pediu — e é exatamente o dinheiro que o botão
   * de pagar vai mexer.
   */
  const resumidas = React.useMemo(() => {
    if (selecionadosAPagar.length === 0) return aprovadasFiltradas;
    const marcados = new Set(selecionadosAPagar);
    return aprovadasFiltradas.filter((parcela) => marcados.has(parcela.id));
  }, [aprovadasFiltradas, selecionadosAPagar]);

  const resumo = React.useMemo(
    () => somarParaResumo(resumidas, hoje),
    [resumidas, hoje],
  );

  const temSelecao = selecionadosAPagar.length > 0;

  /** As marcadas que o banco aceita pagar. As outras nem entram no lote. */
  const selecionadasPagaveis = React.useMemo(() => {
    const marcados = new Set(selecionadosAPagar);
    return aprovadasFiltradas.filter(
      (parcela) => marcados.has(parcela.id) && podePagarParcela(parcela),
    );
  }, [aprovadasFiltradas, selecionadosAPagar]);

  const filtrosAprovadas: FiltroConfiguravel[] = [
    {
      id: "busca",
      rotulo: "Busca",
      fixo: true,
      // Entra no "Limpar filtros": sem isto o botão limpa os seletores e
      // deixa o texto da busca filtrando a lista.
      temValor: buscaAprovadas !== "",
      onLimpar: () => setBuscaAprovadas(""),
      elemento: (
        <FiltroBusca
          valor={buscaAprovadas}
          onValorChange={setBuscaAprovadas}
          placeholder="Buscar por lançamento, descrição ou fornecedor"
        />
      ),
    },
    selecaoMulti({
      id: "situacao",
      chave: "situacao",
      rotulo: "Situação",
      valores: valoresAPagar.situacoes,
      opcoes: OPCOES_SITUACAO,
      todosRotulo: "Todas as situações",
    }),
    selecaoMulti({
      id: "fornecedor",
      chave: "fornecedor",
      rotulo: "Fornecedor",
      valores: valoresAPagar.fornecedorIds,
      opcoes: opcoesFornecedor,
      todosRotulo: "Todos os fornecedores",
      largura: LARGURA_NOME,
    }),
    selecaoMulti({
      id: "conta",
      chave: "conta",
      rotulo: "Conta bancária",
      valores: valoresAPagar.contaIds,
      opcoes: opcoesConta,
      todosRotulo: "Todas as contas",
      largura: LARGURA_NOME,
    }),
    faixaValor("valor", faixaAPagar, maiorValorAPagar),
    periodo({
      id: "vencimento",
      rotulo: "Período de vencimento",
      campo: "Vencimento",
      chaveDe: "venc_de",
      chaveAte: "venc_ate",
      de: valoresAPagar.vencDe,
      ate: valoresAPagar.vencAte,
    }),
    periodo({
      id: "programada",
      rotulo: "Período de autorização",
      campo: "Data autorizada",
      chaveDe: "prog_de",
      chaveAte: "prog_ate",
      de: valoresAPagar.progDe,
      ate: valoresAPagar.progAte,
    }),
    // As seis dimensões do LANÇAMENTO, iguais às de Lançamentos: quem paga faz
    // as mesmas perguntas de quem lança.
    selecaoMulti({
      id: "centro",
      chave: "centro",
      rotulo: "Centro de custo",
      valores: escadaAPagar.raizes,
      opcoes: opcoesCentro,
      todosRotulo: "Todos os centros",
      largura: LARGURA_NOME,
      // Desmarcar a raiz apaga as etapas dela na MESMA navegação.
      onValores: (ids) =>
        escadaAPagar.gravar(
          ids,
          etapasValidas(centrosCusto, ids, escadaAPagar.etapas),
        ),
      onLimpar: () => setMuitos({ centro: null, pagina: "1" }),
    }),
    // Entra VISÍVEL, e só quando a raiz escolhida tem etapa: o campo aparece por
    // causa de uma escolha que a pessoa acabou de fazer ao lado, então escondê-lo
    // atrás do menu "Filtros" seria esconder a resposta que ela provocou.
    ...(temEtapasParaEscolher(centrosCusto, escadaAPagar.raizes)
      ? [
          selecaoMulti({
            id: "etapa",
            chave: "centro",
            rotulo: escadaAPagar.nomes.rotulo,
            valores: escadaAPagar.etapas,
            opcoes: opcoesDeEtapa(centrosCusto, escadaAPagar.raizes),
            todosRotulo: escadaAPagar.nomes.todos,
            largura: LARGURA_NOME,
            oculto: false,
            onValores: (ids) => escadaAPagar.gravar(escadaAPagar.raizes, ids),
            onLimpar: () => escadaAPagar.gravar(escadaAPagar.raizes, []),
          }),
        ]
      : []),
    selecaoMulti({
      id: "categoria",
      chave: "categoria",
      rotulo: "Categoria",
      valores: valoresAPagar.categoriaIds,
      opcoes: opcoesCategoria,
      todosRotulo: "Todas as categorias",
      largura: LARGURA_NOME,
    }),
    selecaoMulti({
      id: "forma",
      chave: "forma",
      rotulo: "Forma de pagamento",
      valores: valoresAPagar.formaIds,
      opcoes: opcoesForma,
      todosRotulo: "Todas as formas",
    }),
    mesReferencia({ id: "mes", chave: "mes", valor: valoresAPagar.mes }),
    selecao({
      id: "origem",
      chave: "origem",
      rotulo: "Origem",
      valor: valoresAPagar.origem,
      opcoes: OPCOES_ORIGEM,
      todosRotulo: "Todas as origens",
    }),
    periodo({
      id: "compra",
      rotulo: "Período da compra",
      campo: "Compra",
      chaveDe: "compra_de",
      chaveAte: "compra_ate",
      de: valoresAPagar.compraDe,
      ate: valoresAPagar.compraAte,
    }),
  ];

  // Aba "Pagas": paginação no servidor, então todo filtro daqui vai ao banco
  // junto com a página (ver buscarParcelasPagas). Trocar um filtro reescreve a
  // URL, o server component devolve a primeira página já filtrada e a tabela
  // volta para a página 1 (ver o ajuste de `pagasAnterior` mais abaixo).
  const { busca: buscaPagas, setBusca: setBuscaPagas } = useBuscaUrl(
    valoresPagas.busca,
    "h_busca",
  );

  const filtrosPagasBarra: FiltroConfiguravel[] = [
    {
      id: "busca",
      rotulo: "Busca",
      fixo: true,
      // Entra no "Limpar filtros": sem isto o botão limpa os seletores e
      // deixa o texto da busca filtrando a lista.
      temValor: buscaPagas !== "",
      onLimpar: () => setBuscaPagas(""),
      elemento: (
        <FiltroBusca
          valor={buscaPagas}
          onValorChange={setBuscaPagas}
          placeholder="Buscar por lançamento, descrição ou fornecedor"
        />
      ),
    },
    selecaoMulti({
      id: "fornecedor",
      chave: "h_fornecedor",
      rotulo: "Fornecedor",
      valores: valoresPagas.fornecedorIds,
      opcoes: opcoesFornecedor,
      todosRotulo: "Todos os fornecedores",
      largura: LARGURA_NOME,
    }),
    selecaoMulti({
      id: "conta",
      chave: "h_conta",
      rotulo: "Conta bancária",
      valores: valoresPagas.contaIds,
      opcoes: opcoesConta,
      todosRotulo: "Todas as contas",
      largura: LARGURA_NOME,
    }),
    faixaValor("valor", faixaPagas, maiorValorPagas),
    periodo({
      id: "vencimento",
      rotulo: "Período de vencimento",
      campo: "Vencimento",
      chaveDe: "h_venc_de",
      chaveAte: "h_venc_ate",
      de: valoresPagas.vencDe,
      ate: valoresPagas.vencAte,
    }),
    periodo({
      id: "programada",
      rotulo: "Período de autorização",
      campo: "Data autorizada",
      chaveDe: "h_prog_de",
      chaveAte: "h_prog_ate",
      de: valoresPagas.progDe,
      ate: valoresPagas.progAte,
    }),
    periodo({
      id: "pagamento",
      rotulo: "Período do pagamento",
      campo: "Pagamento",
      chaveDe: "h_pago_de",
      chaveAte: "h_pago_ate",
      de: valoresPagas.pagoDe,
      ate: valoresPagas.pagoAte,
    }),
    // As MESMAS seis da outra aba, nas chaves h_ dela. Filtros diferentes entre
    // as duas abas fariam a pessoa procurar na aba errada o filtro que usou.
    selecaoMulti({
      id: "centro",
      chave: "h_centro",
      rotulo: "Centro de custo",
      valores: escadaPagas.raizes,
      opcoes: opcoesCentro,
      todosRotulo: "Todos os centros",
      largura: LARGURA_NOME,
      onValores: (ids) =>
        escadaPagas.gravar(
          ids,
          etapasValidas(centrosCusto, ids, escadaPagas.etapas),
        ),
      onLimpar: () => setMuitos({ h_centro: null, pagina: "1" }),
    }),
    ...(temEtapasParaEscolher(centrosCusto, escadaPagas.raizes)
      ? [
          selecaoMulti({
            id: "etapa",
            chave: "h_centro",
            rotulo: escadaPagas.nomes.rotulo,
            valores: escadaPagas.etapas,
            opcoes: opcoesDeEtapa(centrosCusto, escadaPagas.raizes),
            todosRotulo: escadaPagas.nomes.todos,
            largura: LARGURA_NOME,
            oculto: false,
            onValores: (ids) => escadaPagas.gravar(escadaPagas.raizes, ids),
            onLimpar: () => escadaPagas.gravar(escadaPagas.raizes, []),
          }),
        ]
      : []),
    selecaoMulti({
      id: "categoria",
      chave: "h_categoria",
      rotulo: "Categoria",
      valores: valoresPagas.categoriaIds,
      opcoes: opcoesCategoria,
      todosRotulo: "Todas as categorias",
      largura: LARGURA_NOME,
    }),
    selecaoMulti({
      id: "forma",
      chave: "h_forma",
      rotulo: "Forma de pagamento",
      valores: valoresPagas.formaIds,
      opcoes: opcoesForma,
      todosRotulo: "Todas as formas",
    }),
    mesReferencia({ id: "mes", chave: "h_mes", valor: valoresPagas.mes }),
    selecao({
      id: "origem",
      chave: "h_origem",
      rotulo: "Origem",
      valor: valoresPagas.origem,
      opcoes: OPCOES_ORIGEM,
      todosRotulo: "Todas as origens",
    }),
    periodo({
      id: "compra",
      rotulo: "Período da compra",
      campo: "Compra",
      chaveDe: "h_compra_de",
      chaveAte: "h_compra_ate",
      de: valoresPagas.compraDe,
      ate: valoresPagas.compraAte,
    }),
  ];

  function abrirPagamento(parcela: ParcelaAprovada) {
    setParcelaAlvo(parcela);
    setDrawerAberto(true);
  }

  /** Abre o painel de detalhe de qualquer parcela, paga ou não. */
  function abrirDetalhe(id: string) {
    setDetalheId(id);
    setDetalheAberto(true);
  }

  const semConta = contas.length === 0;

  // As larguras são declaradas coluna a coluna porque o padrão de 150px em
  // todas somava mais que a área útil da tela: a tabela ganhava rolagem
  // horizontal e, com a fila vazia, o estado vazio (que ocupa a linha inteira)
  // nascia centralizado fora da tela, com o texto da regra cortado à direita.
  const colunasAprovadas = React.useMemo<ColumnDef<ParcelaAprovada, unknown>[]>(
    () => [
      {
        accessorKey: "lancamentoNumero",
        header: "Lançamento",
        size: 140,
        // `naoTruncar` porque o selo entra numa fileira flex ao lado do número:
        // o truncate de uma linha da DataTable cortaria o balão fora da tela.
        meta: { rotulo: "Lançamento", naoTruncar: true },
        cell: ({ row }) => (
          // justify-center porque flex não herda o text-center da célula.
          <div className="flex items-center justify-center gap-1.5">
            {rotuloParcela(
              row.original.lancamentoNumero,
              row.original.numeroParcela,
            )}
            {/*
              O selo é o que faz a observação existir para quem paga: ela traz
              chave PIX, CNPJ e data combinada, e ninguém abre o drawer de
              cinquenta linhas para descobrir se tem recado.
            */}
            <SeloObservacoes observacoes={row.original.observacoes} />
          </div>
        ),
      },
      {
        accessorKey: "descricao",
        header: "Descrição e categoria",
        size: 240,
        meta: { rotulo: "Descrição e categoria", naoTruncar: true },
        cell: ({ row }) => (
          <CelulaDescricaoCategoria
            descricao={row.original.descricao}
            categoriaNome={row.original.categoriaNome}
          />
        ),
      },
      {
        accessorKey: "fornecedorNome",
        header: "Fornecedor",
        size: 170,
      },
      colunaCentroCusto(),
      {
        accessorKey: "dataVencimento",
        header: "Vencimento",
        size: 120,
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.dataVencimento
              ? formatarData(row.original.dataVencimento)
              : "-"}
          </span>
        ),
      },
      {
        // A data que a trava do banco usa. Sem ela na tela, quem paga clica em
        // Pagar e leva um bloqueio que não tinha como prever.
        accessorKey: "dataProgramada",
        header: "Data autorizada",
        // Cabe a data mais o badge "Vencida"/"Aguarda" na mesma linha.
        size: 180,
        meta: { naoTruncar: true },
        cell: ({ row }) => {
          const autorizada = row.original.dataProgramada;
          if (!autorizada) {
            return <span className="text-muted-foreground">-</span>;
          }
          const vencida = programacaoVencida(autorizada, hoje);
          const aindaNao = autorizada > hoje;
          return (
            <span className="inline-flex items-center gap-1.5">
              <span className="tabular-nums">{formatarData(autorizada)}</span>
              {vencida ? (
                <StatusBadge status="rejeitado" rotulo="Vencida" />
              ) : aindaNao ? (
                <StatusBadge status="pendente_aprovacao" rotulo="Aguarda" />
              ) : null}
            </span>
          );
        },
      },
      {
        accessorKey: "valor",
        header: "Valor",
        size: 130,
        meta: { alinharDireita: true },
        cell: ({ row }) => <MoneyText valor={row.original.valor} />,
      },
      {
        id: "status",
        header: "Status",
        size: 110,
        cell: ({ row }) => {
          // A fila deixou de ser só de aprovadas: o selo tem que dizer a
          // situação DA LINHA. Fixo em "Aprovado" ele afirmaria que uma parcela
          // pendente já passou pela aprovação — bem em cima do botão de pagar.
          const status = row.original.status ?? "aprovado";
          return (
            <StatusBadge
              status={STATUS_PARCELA[status].badge}
              rotulo={STATUS_PARCELA[status].rotulo}
            />
          );
        },
      },
      ...(podePagar
        ? [
            {
              id: "acoes",
              header: "",
              size: 100,
              meta: { alinharDireita: true, fixa: true, rotulo: "Ações" },
              cell: ({ row }) =>
                // Sem botão no que ainda não foi aprovado: `fn_pagar_parcela`
                // recusa, então oferecer o botão seria prometer uma ação que o
                // banco nega. A linha continua clicável para ver o detalhe.
                podePagarParcela(row.original) ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={(evento) => {
                      evento.stopPropagation();
                      abrirPagamento(row.original);
                    }}
                  >
                    Pagar
                  </Button>
                ) : null,
            } satisfies ColumnDef<ParcelaAprovada, unknown>,
          ]
        : []),
    ],
    [podePagar],
  );

  // Mesma régua de largura da aba "A pagar": a soma cabe na tela, então a
  // tabela não ganha rolagem horizontal nem empurra o estado vazio para fora.
  const colunasPagas = React.useMemo<ColumnDef<ParcelaPaga, unknown>[]>(
    () => [
      {
        accessorKey: "lancamentoNumero",
        header: "Lançamento",
        size: 120,
        cell: ({ row }) =>
          rotuloParcela(
            row.original.lancamentoNumero,
            row.original.numeroParcela,
          ),
      },
      {
        accessorKey: "descricao",
        header: "Descrição e categoria",
        size: 240,
        meta: { rotulo: "Descrição e categoria", naoTruncar: true },
        cell: ({ row }) => (
          <CelulaDescricaoCategoria
            descricao={row.original.descricao}
            categoriaNome={row.original.categoriaNome}
          />
        ),
      },
      {
        accessorKey: "fornecedorNome",
        header: "Fornecedor",
        size: 170,
      },
      colunaCentroCusto(),
      {
        accessorKey: "contaNome",
        header: "Conta",
        size: 160,
      },
      {
        accessorKey: "dataPagamento",
        header: "Pagamento",
        size: 120,
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.dataPagamento
              ? formatarData(row.original.dataPagamento)
              : "-"}
          </span>
        ),
      },
      {
        accessorKey: "valor",
        // O rótulo muda junto com o número: com filtro de centro a coluna deixa
        // de ser o valor do pagamento e passa a ser a parte dele que é daquele
        // centro. Número que muda de significado sem mudar de rótulo é
        // exatamente o defeito que esta tela acabou de ter.
        header: somaPagas.recortado ? "Valor no centro" : "Valor",
        size: 130,
        meta: {
          alinharDireita: true,
          rotulo: somaPagas.recortado ? "Valor no centro" : "Valor",
        },
        cell: ({ row }) => <CelulaValorPaga parcela={row.original} />,
      },
      ...(podeEstornar
        ? [
            {
              id: "acoes",
              header: "",
              size: 120,
              meta: { alinharDireita: true, fixa: true, rotulo: "Ações" },
              cell: ({ row }) => (
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => abrirEstorno(row.original)}
                >
                  Estornar
                </Button>
              ),
            } satisfies ColumnDef<ParcelaPaga, unknown>,
          ]
        : []),
    ],
    // `recortado` entra na lista porque o rótulo da coluna de valor depende dele:
    // sem isto o cabeçalho ficaria congelado em "Valor" depois de filtrar por
    // centro, enquanto a célula já mostraria a fatia.
    [podeEstornar, somaPagas.recortado],
  );

  /**
   * Parcelas PAGAS marcadas para imprimir o espelho. Só existe na aba "Pagas":
   * parcela não paga não é pagamento, e imprimir espelho de pagamento que não
   * aconteceu seria papel mentindo.
   *
   * NÃO usa `useFiltroSessao` (mesma escolha de `marcados` em
   * lancamentos-tabela.tsx), e some ao trocar de aba (ver `Tabs` abaixo): uma
   * seleção sobrevivendo à troca imprimiria linha que o usuário não está mais
   * vendo.
   */
  const [marcados, setSelecionados] = React.useState<string[]>([]);

  // Histórico paginado no servidor: a primeira página vem do server component,
  // as próximas são buscadas via action conforme a paginação muda.
  const [linhasPagas, setLinhasPagas] = React.useState(pagas);
  const [totalRegistros, setTotalRegistros] = React.useState(totalPagas);
  const [paginacao, setPaginacao] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: TAMANHO_PAGINA,
  });
  const [carregandoPagas, setCarregandoPagas] = React.useState(false);

  /**
   * Só vale o que está à vista NESTA página do histórico.
   *
   * `selecionados` é DERIVADO de `linhasPagas` (a página atual, que muda a
   * cada troca de página/filtro/refresh do servidor), e não o estado bruto:
   * parcela que saiu da página deixa de contar sozinha. Sem isso, marcar 3
   * parcelas e trocar de página deixaria a barra dizendo "3 selecionados" sem
   * nenhum checkbox marcado à vista — a impressão continuaria certa (o id
   * ainda existe), mas o número na tela estaria mentindo sobre o que está
   * marcado. Mesma guarda de `lancamentos-tabela.tsx`; ali o risco citado é
   * gravar em linha que sumiu da tela, aqui é só a contagem discordar do que
   * se vê.
   */
  const idsVisiveisPagas = React.useMemo(
    () => new Set(linhasPagas.map((parcela) => parcela.id)),
    [linhasPagas],
  );
  const selecionados = React.useMemo(
    () => marcados.filter((id) => idsVisiveisPagas.has(id)),
    [marcados, idsVisiveisPagas],
  );

  // Quando o server component reenvia a primeira página (após um pagamento e
  // router.refresh), volta a listar a partir dela. Ajuste de estado durante o
  // render quando a prop muda (padrão React), sem efeito nem render em cascata.
  const [pagasAnterior, setPagasAnterior] = React.useState(pagas);
  if (pagas !== pagasAnterior) {
    setPagasAnterior(pagas);
    setLinhasPagas(pagas);
    setTotalRegistros(totalPagas);
    setPaginacao((atual) => ({ ...atual, pageIndex: 0 }));
  }

  /**
   * Rodapé de totais da aba "Pagas".
   *
   * Soma o FILTRO inteiro, não a página: é o mesmo recorte do card, e é por isso
   * que o rodapé serve para conferir o card em vez de competir com ele. Somar as
   * 25 linhas à vista chamaria de "total" um pedaço -- e o rótulo diz de quantas
   * parcelas o número é, justamente para ninguém ler o total do recorte como o
   * total da página.
   *
   * A composição (desconto, juros, despesas, líquido) sai da MESMA
   * `ComposicaoDoLiquido` da célula, e só aparece quando existe ajuste no
   * recorte. Sem ajuste, `valor` e líquido são o mesmo número e repeti-lo não
   * informaria nada; com ajuste, é a linha que explica por que o total da coluna
   * e o do card diferem.
   *
   * Preso ao id da coluna (`lancamentoNumero` e `valor`) porque o usuário pode
   * esconder e reordenar coluna: com posição fixa, o total desceria embaixo da
   * coluna errada assim que alguém mexesse.
   */
  const rodapePagas = React.useMemo(
    () => ({
      lancamentoNumero: (
        <span className="text-legenda text-muted-foreground">
          {somaPagas.recortado ? "Total no centro" : "Total do filtro"} ·{" "}
          {contagem(totalPagas)}
        </span>
      ),
      valor: (
        <>
          <MoneyText valor={somaPagas.valor} />
          {/*
            Recortado, a composição não vai: desconto, juros e despesas são dos
            pagamentos inteiros, e mostrá-los embaixo da soma das fatias daria uma
            conta que não fecha. Sem recorte, é ela que explica por que o total da
            coluna e o do card diferem.
          */}
          {somaPagas.recortado ? null : (
            <ComposicaoDoLiquido
              desconto={somaPagas.desconto}
              juros={somaPagas.juros}
              outrasDespesas={somaPagas.outrasDespesas}
              valorLiquido={somaPagas.valorLiquido}
            />
          )}
        </>
      ),
    }),
    [somaPagas, totalPagas],
  );

  async function aoMudarPaginacao(nova: PaginationState) {
    setPaginacao(nova);
    setCarregandoPagas(true);
    try {
      // Os filtros vão junto: sem eles, a segunda página do histórico voltaria
      // sem filtro nenhum e a barra continuaria dizendo que está filtrando.
      const resultado = await buscarParcelasPagas(
        nova.pageIndex,
        nova.pageSize,
        filtrosPagas,
      );
      setLinhasPagas(resultado.itens);
      setTotalRegistros(resultado.total);
    } catch {
      toast.error("Não foi possível carregar o histórico de pagamentos");
    } finally {
      setCarregandoPagas(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Os cartões falam da aba que está aberta: na fila, o que há a pagar; no
          histórico, o que já saiu no recorte. Resumo de uma aba enquanto a
          outra está na tela é número que ninguém consegue conferir. */}
      {aba === "pagas" ? (
        <GradeKpis>
          <KPICard
            titulo={
              somaPagas.recortado ? "Pago neste centro" : "Pago no filtro"
            }
            valor={formatarBRL(somaPagas.valorLiquido)}
            detalhe={
              somaPagas.recortado
                ? // Com centro filtrado o número é a PARTE que é daquele centro:
                  // custo dividido entre duas obras entra pela metade em cada uma,
                  // e é isso que faz a soma das etapas fechar com a do centro pai.
                  `${contagem(totalPagas)} · a parte deste centro no que saiu da conta`
                : `${contagem(totalPagas)} · o que saiu da conta, já com desconto, juros e despesas`
            }
          />
        </GradeKpis>
      ) : (
        <GradeKpis>
          <KPICard
            titulo={temSelecao ? "Selecionado" : "Total a pagar"}
            valor={formatarBRL(resumo.total)}
            detalhe={contagem(resumo.parcelas)}
          />
          <KPICard
            titulo="Pronto para pagar"
            valor={formatarBRL(resumo.aprovado)}
            detalhe={`${contagem(resumo.aprovadas)} aprovada${resumo.aprovadas === 1 ? "" : "s"}`}
          />
          <KPICard
            titulo="Aguardando aprovação"
            valor={formatarBRL(resumo.aguardando)}
            detalhe={contagem(resumo.aguardandoParcelas)}
          />
          <KPICard
            titulo="Vencido"
            valor={formatarBRL(resumo.vencido)}
            detalhe={contagem(resumo.vencidas)}
          />
        </GradeKpis>
      )}

      {podePagar && semConta ? (
        <p className="rounded-md border border-border bg-surface px-3 py-2 text-detalhe text-muted-foreground">
          Cadastre uma conta bancária ativa antes de registrar pagamentos.
        </p>
      ) : null}

      <Tabs value={aba} onValueChange={trocarAba}>
        <TabsList>
          <TabsTrigger value="a-pagar">A pagar</TabsTrigger>
          <TabsTrigger value="pagas">Pagas</TabsTrigger>
        </TabsList>

        <TabsContent value="a-pagar">
          <div className="flex flex-col gap-2">
            <BarraSelecao
              quantidade={selecionadosAPagar.length}
              onLimpar={() => setSelecionadosAPagar([])}
            >
              {podePagar ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={selecionadasPagaveis.length === 0}
                  onClick={() => setLoteAberto(true)}
                >
                  {/* Diz quantas SERÃO pagas, não quantas estão marcadas: o
                      número menor é a única pista de que as não aprovadas
                      ficaram de fora. */}
                  {selecionadasPagaveis.length === selecionadosAPagar.length
                    ? `Pagar ${selecionadasPagaveis.length}`
                    : `Pagar ${selecionadasPagaveis.length} aprovadas`}
                </Button>
              ) : null}
              <BotaoEspelho
                rota="/espelho/pagamentos"
                ids={selecionadosAPagar}
              />
            </BarraSelecao>
            <DataTable
              onLimparFiltros={limparTodos}
              idTabela="financeiro.pagamentos.a-pagar"
              columns={colunasAprovadas}
              data={aprovadasFiltradas}
              filtros={filtrosAprovadas}
              onRowClick={(parcela) => abrirDetalhe(parcela.id)}
              selecao={{
                idDaLinha: (parcela: ParcelaAprovada) => parcela.id,
                selecionados: selecionadosAPagar,
                onSelecionadosChange: setSelecionadosAPagar,
              }}
              emptyState={
                <EmptyState
                  icone={Wallet}
                  titulo="Nenhuma parcela em aberto"
                  descricao="As parcelas a pagar aparecem aqui, aprovadas ou ainda aguardando aprovação. Só as aprovadas ganham o botão de pagar. Compra em dinheiro entra direto, sem passar pela aprovação; compra no cartão de crédito já nasce quitada e não aparece aqui."
                  className="border-none bg-transparent"
                />
              }
            />
          </div>
        </TabsContent>

        <TabsContent value="pagas">
          <div className="flex flex-col gap-2">
            <BarraSelecao
              quantidade={selecionados.length}
              onLimpar={() => setSelecionados([])}
            >
              <BotaoEspelho rota="/espelho/pagamentos" ids={selecionados} />
            </BarraSelecao>
            <DataTable
              idTabela="financeiro.pagamentos.pagas"
              columns={colunasPagas}
              data={linhasPagas}
              onRowClick={(parcela) => abrirDetalhe(parcela.id)}
              filtros={filtrosPagasBarra}
              total={totalRegistros}
              pageIndex={paginacao.pageIndex}
              pageSize={paginacao.pageSize}
              onPaginationChange={aoMudarPaginacao}
              rodape={rodapePagas}
              isLoading={carregandoPagas}
              selecao={{
                idDaLinha: (parcela: ParcelaPaga) => parcela.id,
                selecionados,
                onSelecionadosChange: setSelecionados,
              }}
              emptyState={
                <EmptyState
                  icone={CheckCircle2}
                  titulo="Nenhum pagamento registrado"
                  descricao="Os pagamentos confirmados aparecem aqui"
                  className="border-none bg-transparent"
                />
              }
            />
          </div>
        </TabsContent>
      </Tabs>

      <PagarParcelaDrawer
        aberto={drawerAberto}
        onAbertoChange={setDrawerAberto}
        parcela={parcelaAlvo}
        contas={contas}
        anexos={parcelaAlvo ? (anexosPorParcela[parcelaAlvo.id] ?? []) : []}
        podeAnexar={podePagar}
        onPago={() => router.refresh()}
      />

      <PagarLoteDrawer
        aberto={loteAberto}
        onAbertoChange={setLoteAberto}
        parcelas={selecionadasPagaveis}
        contas={contas}
        onPago={() => {
          setSelecionadosAPagar([]);
          router.refresh();
        }}
      />

      <DetalheParcelaDrawer
        aberto={detalheAberto}
        onAbertoChange={setDetalheAberto}
        parcelaId={detalheId}
        podeAnexar={podePagar}
        podePagar={podePagar}
        podeDesaprovar={podeDesaprovar}
        onPagar={(id) => {
          // Do detalhe direto para o pagamento: a parcela está na fila
          // carregada, então não há segunda ida ao servidor.
          const parcela = aprovadas.find((linha) => linha.id === id);
          if (!parcela) return;
          setDetalheAberto(false);
          abrirPagamento(parcela);
        }}
        onMudou={() => router.refresh()}
      />

      <ConfirmDialog
        aberto={estornoAberto}
        onAbertoChange={setEstornoAberto}
        titulo="Estornar este pagamento?"
        descricao={
          parcelaEstorno && textoDosAjustes(parcelaEstorno) !== null
            ? `O líquido de ${formatarBRL(parcelaEstorno.valorLiquido)} volta para o saldo da conta bancária, ${textoDosAjustes(parcelaEstorno)} e a parcela volta a valer ${formatarBRL(parcelaEstorno.valor)} em aberto.`
            : "O valor volta para o saldo da conta bancária e a parcela retorna ao estado anterior ao pagamento."
        }
        textoConfirmar="Estornar"
        variante="destrutivo"
        onConfirmar={confirmarEstorno}
      />
    </div>
  );
}
