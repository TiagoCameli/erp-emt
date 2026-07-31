"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type Cell,
  type ColumnDef,
  type ColumnOrderState,
  type ColumnSizingState,
  type Header,
  type OnChangeFn,
  type PaginationState,
  type RowData,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  EllipsisVertical,
  FileSpreadsheet,
  Rows3,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/canonicos/combobox";
import { MenuColunas, type ColunaAlternavel } from "@/components/canonicos/menu-colunas";
import { MenuFiltros } from "@/components/canonicos/menu-filtros";
import {
  buscarPreferenciaTabela,
  limparPreferenciaTabela,
  salvarPreferenciaTabela,
} from "@/modules/_shared/preferencias-tabela/actions";
import {
  ALTURA_LINHA_MAXIMA,
  ALTURA_LINHA_MINIMA,
  escreverPreferenciasTabela,
  LARGURA_MAXIMA,
  LARGURA_MINIMA,
  lerPreferenciasTabela,
  ordemEfetiva,
  VERSAO_PREFERENCIAS,
} from "@/components/canonicos/preferencias-tabela";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { MoneyText } from "./money-text";

declare module "@tanstack/react-table" {
  // Os parâmetros precisam espelhar a declaração original do TanStack.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Alinha cabeçalho e células da coluna à direita (colunas numéricas). */
    alinharDireita?: boolean;
    /** Rótulo curto no menu "Colunas". Sem ele, usa o header quando é texto. */
    rotulo?: string;
    /** Coluna que o usuário não pode esconder (chave do registro, ações). */
    fixa?: boolean;
    /** Nasce escondida: o usuário liga no menu "Colunas" se quiser. */
    ocultaPorPadrao?: boolean;
    /** Some abaixo deste breakpoint, para não estourar scroll horizontal. */
    esconderAte?: Breakpoint;
    /** Desliga o truncamento (célula com badge, botão, conteúdo montado). */
    naoTruncar?: boolean;
  }
}

const TAMANHOS_PAGINA = [10, 25, 50, 100] as const;
const TAMANHO_PADRAO = 25;
const MAX_LINHAS_SKELETON = 10;
const ID_COLUNA_ACOES = "__acoes__";
const ALTURA_MAXIMA_PADRAO = "calc(100vh - 20rem)";

/**
 * Espera antes de gravar a preferência. Arrastar borda de coluna ou de linha
 * muda o valor a cada pixel: sem isso seria uma chamada de servidor por
 * movimento do mouse.
 */
const ESPERA_GRAVACAO_MS = 400;

/**
 * Altura natural da linha hoje, em px: o `h-9` do modo automático. NÃO é preset
 * do menu (ver ALTURAS_PRESET); serve de altura de partida do arraste quando não
 * há como medir a linha na tela.
 */
const ALTURA_LINHA_PADRAO = 36;

/**
 * Alturas de linha do menu. "Automática" (null) é o padrão e a única que deixa a
 * linha crescer: as outras valem para TODAS as linhas e clipam o que não couber,
 * que é o ponto de igualar a altura.
 *
 * Cada degrau tem que ser PERCEPTÍVEL ao lado do anterior, senão a pessoa clica
 * em três opções, vê a mesma tabela e conclui que a feature está quebrada. Foi
 * por isso que o preset "Padrão" (36) saiu e não volta: com o mínimo em 34 (a
 * altura do botão de ação da linha, ver ALTURA_LINHA_MINIMA) ele ficava a 2px da
 * Compacta, e numa linha de texto simples rendia exatamente o mesmo que a
 * Automática. Eram três opções desenhando a mesma tabela.
 *
 * O que separa Compacta de Automática não é o pixel, é o clamp: em Lançamentos e
 * em Ordens a célula "Descrição e categoria" tem duas linhas, então a automática
 * rende ~52px e a compacta rende 34px. Compacta é "cabe mais linha na tela".
 */
const ALTURAS_PRESET: { rotulo: string; altura: number | null }[] = [
  { rotulo: "Automática", altura: null },
  // "Compacta" é o mínimo permitido, e o mínimo é a altura do botão de ação da
  // linha (ver ALTURA_LINHA_MINIMA): abaixo disso o `⋮` sai decepado.
  { rotulo: "Compacta", altura: ALTURA_LINHA_MINIMA },
  // 48 e 64: degraus de 14px e 16px, que o olho vê de um para o outro, e ainda
  // longe do máximo de 160 (que já é lista de cards, não tabela).
  { rotulo: "Confortável", altura: 48 },
  { rotulo: "Ampla", altura: 64 },
];

/** Valor do radio no menu de altura: número em px ou "auto". */
function valorAltura(altura: number | null): string {
  return altura === null ? "auto" : String(altura);
}

/** Presa a altura nos limites, como as larguras são presas na leitura. */
function limitarAltura(altura: number): number {
  return Math.min(
    ALTURA_LINHA_MAXIMA,
    Math.max(ALTURA_LINHA_MINIMA, Math.round(altura)),
  );
}

/**
 * A parte do estado que É a preferência do usuário. Fica fora do componente
 * porque instâncias que dividem o mesmo `idTabela` têm que dividir isto ao vivo
 * (ver ESTADOS_TABELA). Paginação, ordenação e arraste continuam por instância.
 */
interface EstadoTabela {
  visibilidade: VisibilityState;
  ordem: ColumnOrderState;
  larguras: ColumnSizingState;
  filtros: Record<string, boolean>;
  /**
   * `null` = automática: h-9 como altura mínima e a linha cresce com o conteúdo.
   * É obrigatório ser o padrão porque há coluna que renderiza duas linhas
   * (descrição + categoria) e altura fixa esconderia a segunda.
   */
  alturaLinha: number | null;
}

/** Tudo que as instâncias de um mesmo `idTabela` compartilham. */
interface EntradaTabela {
  estado: EstadoTabela;
  /** Re-render de cada instância viva (useSyncExternalStore). */
  ouvintes: Set<() => void>;
  /** Instâncias montadas. Ao chegar a zero a entrada é descartada. */
  montadas: number;
  /** Leitura do banco: uma por tabela, não uma por instância. */
  leitura: Promise<string | null> | null;
  hidratada: boolean;
  /** Último JSON a gravar. Só o estado final interessa. */
  pendente: string | null;
  temporizador: ReturnType<typeof setTimeout> | null;
  /**
   * Fila das chamadas de servidor, para save e delete não correrem soltos.
   * `null` = nada no ar, e a próxima chamada sai na hora (ver enfileirar).
   */
  fila: Promise<void> | null;
}

/**
 * Estado de preferência por tabela, compartilhado por todas as instâncias.
 *
 * Existe porque tela pode repartir a MESMA tabela em vários pedaços: a de
 * categorias monta uma DataTable por grupo de insumo, todas com
 * `idTabela="cadastros.categorias"`, de propósito. Com o estado dentro do
 * componente, cada pedaço tinha o seu: ajustar a altura no grupo "Material" não
 * mexia nos outros três (e a promessa é "ajusto um, TODAS as linhas ficam
 * iguais"), e a interação seguinte de um pedaço irmão gravava o estado DELE na
 * mesma chave do banco, apagando em silêncio o ajuste que a pessoa acabou de
 * fazer. Valia para largura, ordem e visibilidade também; a altura só deixou
 * óbvio.
 *
 * Tabela de instância única (as outras ~40 do app) cai no mesmo caminho com um
 * ouvinte só, e a entrada morre quando ela desmonta: comportamento igual ao de
 * antes, estado limpo a cada montagem.
 */
const ESTADOS_TABELA = new Map<string, EntradaTabela>();

function obterEntrada(chave: string, inicial: EstadoTabela): EntradaTabela {
  const existente = ESTADOS_TABELA.get(chave);
  if (existente) return existente;
  const nova: EntradaTabela = {
    estado: inicial,
    ouvintes: new Set(),
    montadas: 0,
    leitura: null,
    hidratada: false,
    pendente: null,
    temporizador: null,
    fila: null,
  };
  ESTADOS_TABELA.set(chave, nova);
  return nova;
}

/** Troca o estado compartilhado e re-renderiza todas as instâncias da tabela. */
function definirEstado(entrada: EntradaTabela, parcial: Partial<EstadoTabela>) {
  entrada.estado = { ...entrada.estado, ...parcial };
  for (const ouvinte of entrada.ouvintes) ouvinte();
}

/**
 * Enfileira uma chamada de servidor atrás da anterior. É o que garante ORDEM
 * entre o save do debounce e o delete do "Restaurar padrão": se o clique cai
 * poucos ms depois do flush ter partido, sem fila o delete pode chegar antes do
 * save e a preferência que a pessoa apagou volta viva no próximo carregamento.
 *
 * CONTRATO de quem entra na fila: a promessa da tarefa só pode resolver DEPOIS
 * de o servidor ter gravado. É disso, e só disso, que a ordem depende: o delete
 * espera o save ter TERMINADO, não ter partido. Se algum dia
 * `salvarPreferenciaTabela` virar fire-and-forget (devolver antes de gravar), a
 * garantia cai em silêncio e o teste continua VERDE, porque no teste é o mock que
 * decide quando resolve. O teste guarda a fila; este comentário guarda o
 * contrato.
 */
function enfileirar(entrada: EntradaTabela, tarefa: () => Promise<void>) {
  const anterior = entrada.fila;
  // Fila vazia dispara AGORA, nem um microtask de espera: em `pagehide` cada
  // volta do event loop é uma chance de a aba morrer antes da chamada sair.
  //
  // O try/catch é a rede para throw SÍNCRONO: Server Action devolve promessa, mas
  // se um dia a tarefa estourar na cara (mock, wrapper, erro de digitação), o
  // `.catch` abaixo receberia undefined e viraria TypeError. Aqui esse caminho é
  // justo o do `pagehide`, com a aba morrendo, onde ninguém vê o erro.
  let emVoo: Promise<void>;
  if (anterior === null) {
    try {
      emVoo = Promise.resolve(tarefa());
    } catch {
      // Nem saiu do chão: a fila segue como se a tarefa tivesse terminado.
      emVoo = Promise.resolve();
    }
  } else {
    emVoo = anterior.then(tarefa, tarefa);
  }
  // Falha de gravação não pode travar a fila nem virar unhandled rejection: a
  // preferência é conforto, e a Server Action já loga o erro no servidor.
  const encerrada: Promise<void> = emVoo
    .catch(() => undefined)
    .then(() => {
      // Só a última da fila libera, senão a próxima acha a fila vazia e atropela
      // uma tarefa que ainda está no ar.
      if (entrada.fila === encerrada) entrada.fila = null;
    });
  entrada.fila = encerrada;
}

function descartarPendente(entrada: EntradaTabela) {
  if (entrada.temporizador !== null) {
    clearTimeout(entrada.temporizador);
    entrada.temporizador = null;
  }
  entrada.pendente = null;
}

/** Manda agora o que estava esperando o debounce. Nada pendente, nada a fazer. */
function enviarPendente(entrada: EntradaTabela, idTabela: string | undefined) {
  const json = entrada.pendente;
  descartarPendente(entrada);
  if (json === null || idTabela === undefined) return;
  enfileirar(entrada, () => salvarPreferenciaTabela(idTabela, json));
}

/**
 * Zera o estado compartilhado de todas as tabelas. Existe para o teste: sem isto
 * um caso herdaria a altura do caso anterior e o fantasma custa uma tarde. Em
 * produção a entrada já morre sozinha quando a última instância desmonta.
 */
export function limparEstadosTabelaParaTeste() {
  for (const entrada of ESTADOS_TABELA.values()) descartarPendente(entrada);
  ESTADOS_TABELA.clear();
}

/** Breakpoints em que uma coluna secundária pode sumir. */
type Breakpoint = "sm" | "md" | "lg" | "xl";

/** Classes de breakpoint. Strings completas, senão o Tailwind não gera. */
const CLASSES_ESCONDER: Record<Breakpoint, string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
};

export interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  /** Total de registros no servidor. Junto com onPaginationChange ativa o modo server-side. */
  total?: number;
  /** Página atual (base 0). Obrigatório no modo server-side. */
  pageIndex?: number;
  /** Tamanho da página. Padrão 25. */
  pageSize?: number;
  /** Recebe a nova paginação. Junto com total ativa o modo server-side. */
  onPaginationChange?: (paginacao: PaginationState) => void;
  /** Ordenação controlada (use junto com onSortingChange). */
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  /** Id da coluna usada na busca local (apenas modo client-side). */
  searchKey?: string;
  searchPlaceholder?: string;
  onRowClick?: (registro: TData) => void;
  /** Conteúdo exibido quando não há registros. */
  emptyState?: React.ReactNode;
  isLoading?: boolean;
  /** Quando presente, exibe o botão "Exportar Excel" acima da tabela. */
  exportar?: () => void;
  /**
   * Liga a personalização da tabela pelo usuário (menu "Colunas", arrastar a
   * borda do cabeçalho para redimensionar, arrastar o cabeçalho para reordenar)
   * e a memória disso no navegador. O id identifica a tabela na memória:
   * use o recurso da tela, ex. "compras.ordens". Sem ele a tabela se comporta
   * como sempre — é o que mantém as outras listagens do app intactas.
   */
  idTabela?: string;
  /**
   * Não é mais necessário: a preferência é gravada em `auth.uid()` pelo banco, e
   * a RLS já garante que ninguém lê nem escreve a do outro. Mantido só para as
   * telas que ainda passam, e ignorado.
   *
   * @deprecated
   */
  idUsuario?: string;
  /** Cabeçalho fixo ao rolar. A tabela ganha rolagem própria (ver alturaMaxima). */
  cabecalhoFixo?: boolean;
  /** Altura máxima da área de rolagem quando cabecalhoFixo. Padrão: sobra da viewport. */
  alturaMaxima?: string;
  /** Filtros e busca da listagem, na mesma barra dos botões da tabela. */
  toolbar?: React.ReactNode;
  /**
   * Ações secundárias da linha, num menu "..." na última coluna. Devolva
   * DropdownMenuItem (de @/components/ui/dropdown-menu). Clique no menu não
   * dispara o onRowClick.
   */
  acoesLinha?: (registro: TData) => React.ReactNode;
  /**
   * Filtros da listagem que o usuário pode mostrar ou esconder, com a escolha
   * guardada junto das colunas. Passe por aqui em vez de `toolbar` para o filtro
   * entrar no menu "Filtros".
   */
  filtros?: FiltroConfiguravel[];
}

/** Um filtro que o usuário pode ligar ou desligar no menu "Filtros". */
export interface FiltroConfiguravel {
  /** Identificador estável, usado na preferência salva (ex. "status"). */
  id: string;
  /** Nome no menu. */
  rotulo: string;
  elemento: React.ReactNode;
  /** Filtro que não pode ser escondido (ex. a busca principal da tela). */
  fixo?: boolean;
  /**
   * Nasce escondido: o usuário liga no menu "Filtros" se quiser. É o padrão de
   * todo filtro secundário, porque doze filtros abertos de uma vez é uma parede,
   * não uma ferramenta. Ignorado quando `fixo`.
   */
  ocultoPorPadrao?: boolean;
  /** Tem valor escolhido agora? Usado para limpar ao esconder. */
  temValor?: boolean;
  /** Chamado quando o filtro é escondido com valor, para não filtrar às cegas. */
  onLimpar?: () => void;
}

function IconeOrdenacao({ direcao }: { direcao: false | "asc" | "desc" }) {
  if (direcao === "asc") return <ArrowUp className="size-3.5 shrink-0" />;
  if (direcao === "desc") return <ArrowDown className="size-3.5 shrink-0" />;
  return <ArrowUpDown className="size-3.5 shrink-0 opacity-40" />;
}

/**
 * Menu "Altura": escolhe a altura de todas as linhas por preset. Existe além do
 * arraste porque arrastar não funciona no teclado, e porque é a saída de quem
 * clipou o conteúdo e quer a altura automática de volta.
 */
function MenuAltura({
  altura,
  onEscolher,
}: {
  altura: number | null;
  onEscolher: (altura: number | null) => void;
}) {
  const ehPreset = ALTURAS_PRESET.some((preset) => preset.altura === altura);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Rows3 />
          Altura
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-legenda text-muted-foreground">
          Altura das linhas
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={valorAltura(altura)}
          onValueChange={(valor) =>
            onEscolher(valor === "auto" ? null : Number(valor))
          }
        >
          {ALTURAS_PRESET.map((preset) => (
            <DropdownMenuRadioItem
              key={valorAltura(preset.altura)}
              value={valorAltura(preset.altura)}
              className="text-detalhe"
            >
              {preset.rotulo}
              {preset.altura !== null ? (
                <span className="ml-auto text-legenda text-muted-foreground tabular-nums">
                  {preset.altura} px
                </span>
              ) : null}
            </DropdownMenuRadioItem>
          ))}
          {/* Altura que veio do arraste: entra no menu para a pessoa ver onde
              está, e some quando ela escolhe um preset. */}
          {!ehPreset && altura !== null ? (
            <DropdownMenuRadioItem
              value={valorAltura(altura)}
              className="text-detalhe"
            >
              Personalizada
              <span className="ml-auto text-legenda text-muted-foreground tabular-nums">
                {altura} px
              </span>
            </DropdownMenuRadioItem>
          ) : null}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Rótulo da coluna no menu "Colunas": meta.rotulo, senão o header textual. */
function rotuloColuna(
  id: string,
  header: unknown,
  meta: { rotulo?: string } | undefined,
): string {
  if (meta?.rotulo) return meta.rotulo;
  if (typeof header === "string") return header;
  return id;
}

/** Texto do title (tooltip nativo) quando o conteúdo da célula é texto puro. */
function tituloDaCelula<TData>(celula: Cell<TData, unknown>): string | undefined {
  if (celula.column.columnDef.meta?.naoTruncar === true) return undefined;
  const valor = celula.getValue();
  if (typeof valor === "string" && valor.trim() !== "") return valor;
  if (typeof valor === "number") return String(valor);
  return undefined;
}

/**
 * Tabela canônica do ERP: densa, com ordenação, busca local opcional,
 * paginação client-side ou server-side, export Excel opcional e, quando a tela
 * passa `idTabela`, personalização pelo usuário (colunas, largura, ordem)
 * lembrada no navegador. Nenhuma listagem do app monta tabela fora daqui.
 */
export function DataTable<TData>({
  columns,
  data,
  total,
  pageIndex,
  pageSize,
  onPaginationChange,
  sorting,
  onSortingChange,
  searchKey,
  searchPlaceholder,
  onRowClick,
  emptyState,
  isLoading = false,
  exportar,
  idTabela,
  cabecalhoFixo = false,
  alturaMaxima,
  toolbar,
  acoesLinha,
  filtros,
}: DataTableProps<TData>) {
  const modoServidor = total !== undefined && onPaginationChange !== undefined;
  const personalizavel = idTabela !== undefined;

  const colunasComAcoes = React.useMemo<ColumnDef<TData, unknown>[]>(() => {
    if (!acoesLinha) return columns;
    return [
      ...columns,
      {
        id: ID_COLUNA_ACOES,
        header: () => <span className="sr-only">Ações</span>,
        size: 52,
        minSize: 52,
        maxSize: 52,
        enableSorting: false,
        enableResizing: false,
        meta: { fixa: true, naoTruncar: true, alinharDireita: true },
        cell: ({ row }) => (
          <div
            className="flex justify-end"
            onClick={(evento) => evento.stopPropagation()}
            onKeyDown={(evento) => evento.stopPropagation()}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Ações"
                >
                  <EllipsisVertical />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {acoesLinha(row.original)}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ];
  }, [columns, acoesLinha]);

  const idsColunas = React.useMemo(
    () =>
      colunasComAcoes.map((coluna, indice) => {
        const comAccessor = coluna as { accessorKey?: string; id?: string };
        return comAccessor.id ?? comAccessor.accessorKey ?? String(indice);
      }),
    [colunasComAcoes],
  );

  const visibilidadePadrao = React.useMemo<VisibilityState>(() => {
    const padrao: VisibilityState = {};
    colunasComAcoes.forEach((coluna, indice) => {
      if (coluna.meta?.ocultaPorPadrao === true) {
        padrao[idsColunas[indice]] = false;
      }
    });
    return padrao;
  }, [colunasComAcoes, idsColunas]);

  const [paginacaoInterna, setPaginacaoInterna] = React.useState<PaginationState>({
    pageIndex: pageIndex ?? 0,
    pageSize: pageSize ?? TAMANHO_PADRAO,
  });
  const [ordenacaoInterna, setOrdenacaoInterna] = React.useState<SortingState>(
    sorting ?? []
  );
  // Chave do estado de preferência. Com `idTabela`, TODAS as instâncias da mesma
  // tabela caem na mesma entrada e mudam juntas (é o conserto da tela repartida
  // em grupos, ver ESTADOS_TABELA). Sem `idTabela`, cada instância fica sozinha
  // na sua chave e a tabela se comporta exatamente como antes.
  const chaveLocal = React.useId();
  const chaveEstado = idTabela ?? chaveLocal;

  /**
   * Snapshot padrão desta instância: o que a tabela mostra enquanto a entrada
   * compartilhada não existe, e a semente dela quando nascer.
   *
   * Em `useState` e não em `useMemo` de propósito, por dois motivos que andam
   * juntos. Primeiro, `useSyncExternalStore` exige que o snapshot tenha
   * identidade ESTÁVEL: objeto novo a cada render faz o React acusar
   * "getSnapshot should be cached" e re-renderizar em loop. Segundo, isto entra
   * nas dependências de `assinarEstado`, e um `useMemo` sobre
   * `visibilidadePadrao` (que descende de `acoesLinha`, arrow inline no JSX de
   * várias telas) ganha identidade nova a cada render do PAI: o React
   * desinscrevia e reinscrevia o ouvinte de graça. O padrão da tela não muda em
   * runtime, então congelar na montagem é correto.
   */
  const [estadoInicial] = React.useState<EstadoTabela>(() => ({
    visibilidade: visibilidadePadrao,
    ordem: [],
    larguras: {},
    filtros: {},
    alturaLinha: null,
  }));

  const assinarEstado = React.useCallback(
    (aoMudar: () => void) => {
      // A entrada nasce AQUI, dentro de um efeito, e não no getSnapshot: o React
      // pode jogar um render no lixo, e mutar mapa de módulo em tempo de render é
      // exatamente o que morde num projeto com React Compiler.
      const entrada = obterEntrada(chaveEstado, estadoInicial);
      entrada.ouvintes.add(aoMudar);
      return () => {
        entrada.ouvintes.delete(aoMudar);
      };
    },
    [chaveEstado, estadoInicial],
  );

  const {
    visibilidade,
    ordem: ordemColunas,
    larguras,
    filtros: filtrosVisiveis,
    alturaLinha,
  } = React.useSyncExternalStore(
    assinarEstado,
    // Só leitura, nunca criação: chave que ainda não existe cai no snapshot
    // padrão (estável), e quem cria a entrada é a assinatura ou a primeira
    // mudança de preferência.
    () => ESTADOS_TABELA.get(chaveEstado)?.estado ?? estadoInicial,
    () => estadoInicial,
  );

  /** Muda a preferência compartilhada. Devolve a entrada, para quem vai gravar. */
  const mudarEstado = React.useCallback(
    (parcial: Partial<EstadoTabela>) => {
      const entrada = obterEntrada(chaveEstado, estadoInicial);
      definirEstado(entrada, parcial);
      return entrada;
    },
    [chaveEstado, estadoInicial],
  );

  const idsFiltros = React.useMemo(
    () => (filtros ?? []).map((filtro) => filtro.id),
    [filtros],
  );

  // Padrão da tela: só os filtros marcados `ocultoPorPadrao` nascem escondidos.
  // `filtrosVisiveis` guarda apenas o que o usuário mudou, então restaurar o
  // padrão é esvaziar o mapa, sem precisar reescrever a escolha da tela.
  const filtrosOcultosPadrao = React.useMemo<Record<string, boolean>>(() => {
    const padrao: Record<string, boolean> = {};
    for (const filtro of filtros ?? []) {
      if (filtro.ocultoPorPadrao === true && filtro.fixo !== true) {
        padrao[filtro.id] = false;
      }
    }
    return padrao;
  }, [filtros]);

  const [arrastando, setArrastando] = React.useState<string | null>(null);
  /** Arraste de altura em andamento: qual linha, de onde partiu e de qual altura. */
  const [arrasteAltura, setArrasteAltura] = React.useState<{
    idLinha: string;
    clienteY: number;
    alturaBase: number;
  } | null>(null);

  function filtroVisivel(id: string): boolean {
    // Filtro preenchido aparece sempre, mesmo se o padrão da tela ou a escolha
    // do usuário o esconderia. É o caso do link compartilhado com filtro na
    // URL: sem isso a tabela mostraria uma lista filtrada e ninguém veria por
    // quê. Esconder na mão limpa o valor (ver alternarFiltro), então o filtro
    // volta a obedecer o padrão no clique seguinte.
    const filtro = (filtros ?? []).find((f) => f.id === id);
    if (filtro?.temValor === true) return true;
    return filtrosVisiveis[id] ?? filtrosOcultosPadrao[id] ?? true;
  }


  // Hidrata a personalização depois da montagem. Vem do BANCO, por usuário, para
  // seguir a pessoa em qualquer máquina (o localStorage morria ao trocar de
  // navegador, e máquina compartilhada de escritório é comum na EMT).
  React.useEffect(() => {
    if (!idTabela || !personalizavel) return;
    const entrada = obterEntrada(chaveEstado, estadoInicial);
    let ativo = true;
    // Uma leitura por tabela, não uma por instância: a tela de categorias tem
    // quatro DataTables no mesmo `idTabela` e fazia quatro buscas iguais. A
    // promessa é compartilhada e só a primeira resposta hidrata; instância que
    // monta depois já nasce lendo o estado vivo.
    entrada.leitura ??= buscarPreferenciaTabela(idTabela);
    void entrada.leitura.then((bruto) => {
      if (!ativo || entrada.hidratada) return;
      entrada.hidratada = true;
      const salvo = lerPreferenciasTabela(bruto, idsColunas, idsFiltros);
      if (!salvo) return;
      definirEstado(entrada, {
        visibilidade: { ...visibilidadePadrao, ...salvo.visiveis },
        ordem: salvo.ordem.length > 0 ? ordemEfetiva(salvo.ordem, idsColunas) : [],
        larguras: salvo.larguras,
        filtros: salvo.filtros,
        alturaLinha: salvo.alturaLinha,
      });
    });
    return () => {
      ativo = false;
    };
    // idsColunas/idsFiltros/visibilidadePadrao são estáveis por tela; lê uma vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveEstado, idTabela, personalizavel]);

  const foraDoPadrao =
    Object.keys(larguras).length > 0 ||
    ordemColunas.length > 0 ||
    alturaLinha !== null ||
    idsColunas.some(
      (id) =>
        (visibilidade[id] ?? true) !== (visibilidadePadrao[id] ?? true),
    );

  /**
   * Agenda a gravação do estado que está na entrada. O pendente e o temporizador
   * vivem na entrada COMPARTILHADA: N instâncias mudando junto viram uma
   * gravação, não N iguais.
   */
  const agendarGravacao = React.useCallback(
    (entrada: EntradaTabela) => {
      if (!idTabela || !personalizavel) return;
      // Só o último estado interessa: quem arrasta gera dezenas de mudanças e o
      // banco só precisa saber onde a mão parou.
      entrada.pendente = escreverPreferenciasTabela({
        versao: VERSAO_PREFERENCIAS,
        visiveis: entrada.estado.visibilidade as Record<string, boolean>,
        ordem: entrada.estado.ordem,
        larguras: entrada.estado.larguras,
        filtros: entrada.estado.filtros,
        alturaLinha: entrada.estado.alturaLinha,
      });
      if (entrada.temporizador !== null) clearTimeout(entrada.temporizador);
      entrada.temporizador = setTimeout(
        () => enviarPendente(entrada, idTabela),
        ESPERA_GRAVACAO_MS,
      );
    },
    [idTabela, personalizavel],
  );

  /** Muda a preferência e agenda a gravação: é sempre esse par. */
  const aplicarPreferencia = React.useCallback(
    (parcial: Partial<EstadoTabela>) => {
      agendarGravacao(mudarEstado(parcial));
    },
    [agendarGravacao, mudarEstado],
  );

  // Conta as instâncias montadas. A ÚLTIMA a sair grava o que estava esperando o
  // debounce (sair da tela não pode perder o último ajuste) e descarta a entrada,
  // para a tela remontada nascer do banco e não do estado da visita anterior.
  React.useEffect(() => {
    const entrada = obterEntrada(chaveEstado, estadoInicial);
    entrada.montadas += 1;
    return () => {
      entrada.montadas -= 1;
      if (entrada.montadas > 0) return;
      enviarPendente(entrada, idTabela);
      ESTADOS_TABELA.delete(chaveEstado);
    };
    // `estadoInicial` é congelado na montagem (ver a declaração dele), então
    // entra na lista sem risco de zerar a contagem a cada render do pai.
  }, [chaveEstado, estadoInicial, idTabela]);

  // Fechar a aba e recarregar NÃO rodam cleanup de efeito, e é justo aí que se
  // perde o ajuste preso no debounce. `pagehide` e `visibilitychange` são o par
  // que funciona no Safari do iPhone, onde `beforeunload` não é confiável.
  React.useEffect(() => {
    if (!idTabela || !personalizavel) return;
    function gravarAgora() {
      const entrada = ESTADOS_TABELA.get(chaveEstado);
      // Nada pendente é o caso normal, e enviarPendente não faz nada: com N
      // instâncias na tela, a primeira a rodar limpa o pendente e as outras
      // passam batido, então continua sendo uma gravação só.
      if (entrada) enviarPendente(entrada, idTabela);
    }
    function aoEsconder() {
      if (document.visibilityState === "hidden") gravarAgora();
    }
    window.addEventListener("pagehide", gravarAgora);
    document.addEventListener("visibilitychange", aoEsconder);
    return () => {
      window.removeEventListener("pagehide", gravarAgora);
      document.removeEventListener("visibilitychange", aoEsconder);
    };
  }, [chaveEstado, idTabela, personalizavel]);

  const paginacao: PaginationState = onPaginationChange
    ? { pageIndex: pageIndex ?? 0, pageSize: pageSize ?? TAMANHO_PADRAO }
    : paginacaoInterna;
  const ordenacao: SortingState = onSortingChange ? (sorting ?? []) : ordenacaoInterna;

  const aoMudarPaginacao: OnChangeFn<PaginationState> = (atualizador) => {
    const nova =
      typeof atualizador === "function" ? atualizador(paginacao) : atualizador;
    if (onPaginationChange) onPaginationChange(nova);
    else setPaginacaoInterna(nova);
  };

  const aoMudarOrdenacao: OnChangeFn<SortingState> = (atualizador) => {
    const nova =
      typeof atualizador === "function" ? atualizador(ordenacao) : atualizador;
    if (onSortingChange) onSortingChange(nova);
    else setOrdenacaoInterna(nova);
  };

  const aoMudarVisibilidade: OnChangeFn<VisibilityState> = (atualizador) => {
    const nova =
      typeof atualizador === "function" ? atualizador(visibilidade) : atualizador;
    aplicarPreferencia({ visibilidade: nova });
  };

  const aoMudarLarguras: OnChangeFn<ColumnSizingState> = (atualizador) => {
    const nova =
      typeof atualizador === "function" ? atualizador(larguras) : atualizador;
    aplicarPreferencia({ larguras: nova });
  };

  /** Aplica a altura em TODAS as linhas. `null` volta para a automática. */
  const aplicarAltura = React.useCallback(
    (proxima: number | null) => {
      aplicarPreferencia({
        alturaLinha: proxima === null ? null : limitarAltura(proxima),
      });
    },
    [aplicarPreferencia],
  );

  function restaurarPadrao() {
    const entrada = mudarEstado({
      visibilidade: visibilidadePadrao,
      ordem: [],
      larguras: {},
      filtros: {},
      alturaLinha: null,
    });
    // Uma gravação em espera aqui ressuscitaria o que a pessoa acabou de limpar.
    descartarPendente(entrada);
    // O delete entra na fila ATRÁS do save que talvez já tenha partido (o flush
    // do debounce pode ter saído poucos ms antes do clique). Sem a fila as duas
    // chamadas correm sem ordem, o delete pode chegar primeiro e a preferência
    // volta viva no próximo carregamento.
    if (idTabela && personalizavel) {
      enfileirar(entrada, () => limparPreferenciaTabela(idTabela));
    }
  }

  /**
   * Liga ou desliga um filtro. Desligar filtro com valor LIMPA o valor: filtro
   * ativo e invisível é a pior combinação possível, porque a tabela mostra uma
   * lista filtrada e ninguém vê por quê.
   */
  function alternarFiltro(id: string) {
    const filtro = (filtros ?? []).find((f) => f.id === id);
    if (!filtro || filtro.fixo) return;

    const visivelAgora = filtroVisivel(id);
    const proximos = { ...filtrosVisiveis, [id]: !visivelAgora };
    if (visivelAgora && filtro.temValor) filtro.onLimpar?.();
    aplicarPreferencia({ filtros: proximos });
  }

  function reordenar(idOrigem: string, idDestino: string) {
    if (idOrigem === idDestino) return;
    const atual = ordemColunas.length > 0 ? ordemColunas : idsColunas;
    const proxima = atual.filter((id) => id !== idOrigem);
    const posicao = proxima.indexOf(idDestino);
    proxima.splice(posicao < 0 ? proxima.length : posicao, 0, idOrigem);
    aplicarPreferencia({ ordem: proxima });
  }

  /**
   * Começa o arraste da borda de baixo de uma linha. A altura de partida é a
   * altura que a linha tem AGORA na tela (medida), então arrastar a partir da
   * automática continua de onde o olho está.
   */
  function iniciarArrasteAltura(
    evento: React.MouseEvent<HTMLElement>,
    idLinha: string,
  ) {
    evento.preventDefault();
    evento.stopPropagation();
    const linha = evento.currentTarget.closest("tr");
    const medida = linha?.getBoundingClientRect().height ?? ALTURA_LINHA_PADRAO;
    setArrasteAltura({
      idLinha,
      clienteY: evento.clientY,
      alturaBase: limitarAltura(alturaLinha ?? medida),
    });
  }

  // O mouse sai da linha no meio do arraste, então quem escuta é a janela. O
  // arraste em si não muda de identidade a cada pixel (o que muda é a altura),
  // então os ouvintes são registrados uma vez por gesto.
  React.useEffect(() => {
    if (arrasteAltura === null) return;
    const { clienteY, alturaBase } = arrasteAltura;

    function mover(evento: MouseEvent) {
      aplicarAltura(alturaBase + (evento.clientY - clienteY));
    }
    function soltar() {
      setArrasteAltura(null);
    }

    window.addEventListener("mousemove", mover);
    window.addEventListener("mouseup", soltar);
    return () => {
      window.removeEventListener("mousemove", mover);
      window.removeEventListener("mouseup", soltar);
    };
  }, [arrasteAltura, aplicarAltura]);

  const table = useReactTable({
    data,
    columns: colunasComAcoes,
    state: {
      pagination: paginacao,
      sorting: ordenacao,
      ...(personalizavel
        ? {
            columnVisibility: visibilidade,
            columnOrder: ordemColunas.length > 0 ? ordemColunas : undefined,
            columnSizing: larguras,
          }
        : {}),
    },
    onPaginationChange: aoMudarPaginacao,
    onSortingChange: aoMudarOrdenacao,
    getCoreRowModel: getCoreRowModel(),
    enableSorting: !modoServidor || onSortingChange !== undefined,
    ...(personalizavel
      ? {
          onColumnVisibilityChange: aoMudarVisibilidade,
          onColumnSizingChange: aoMudarLarguras,
          enableColumnResizing: true,
          columnResizeMode: "onChange" as const,
          defaultColumn: { minSize: LARGURA_MINIMA, maxSize: LARGURA_MAXIMA },
        }
      : { enableColumnResizing: false }),
    ...(modoServidor
      ? {
          manualPagination: true,
          manualSorting: true,
          manualFiltering: true,
          pageCount: Math.max(1, Math.ceil((total ?? 0) / paginacao.pageSize)),
        }
      : {
          getPaginationRowModel: getPaginationRowModel(),
          getSortedRowModel: getSortedRowModel(),
          getFilteredRowModel: getFilteredRowModel(),
        }),
  });

  const colunaBusca =
    !modoServidor && searchKey ? table.getColumn(searchKey) : undefined;

  const totalRegistros = modoServidor
    ? (total ?? 0)
    : table.getFilteredRowModel().rows.length;
  const { pageIndex: indicePagina, pageSize: tamanhoPagina } =
    table.getState().pagination;
  const de = totalRegistros === 0 ? 0 : indicePagina * tamanhoPagina + 1;
  const ate = Math.min((indicePagina + 1) * tamanhoPagina, totalRegistros);

  const linhas = table.getRowModel().rows;
  const colunasVisiveis = table.getVisibleLeafColumns();
  const qtdSkeleton = Math.min(tamanhoPagina, MAX_LINHAS_SKELETON);

  const colunasDoMenu: ColunaAlternavel[] = table
    .getAllLeafColumns()
    .filter((coluna) => coluna.columnDef.meta?.fixa !== true)
    .map((coluna) => ({
      id: coluna.id,
      rotulo: rotuloColuna(
        coluna.id,
        coluna.columnDef.header,
        coluna.columnDef.meta,
      ),
      visivel: coluna.getIsVisible(),
      onAlternar: (visivel) => coluna.toggleVisibility(visivel),
    }));

  const temBarra =
    colunaBusca !== undefined ||
    exportar !== undefined ||
    toolbar !== undefined ||
    personalizavel;

  function classesResponsivas<T>(
    header: Header<T, unknown> | Cell<T, unknown>,
  ): string | undefined {
    const esconderAte = header.column.columnDef.meta?.esconderAte;
    return esconderAte ? CLASSES_ESCONDER[esconderAte] : undefined;
  }

  const estiloLinha =
    alturaLinha === null ? undefined : { height: `${alturaLinha}px` };

  /** Altura mostrada no arraste: a nova, ou a medida antes do primeiro movimento. */
  const alturaEmArraste = alturaLinha ?? arrasteAltura?.alturaBase ?? null;

  /**
   * Alça de altura: faixa fina na borda de baixo da linha, com cursor
   * `row-resize`, que aparece no hover. Arrastar qualquer linha muda a altura de
   * todas. Fica dentro da primeira célula porque `<tr>` só aceita célula como
   * filho, e é posicionada pela `tr` (que é `relative`). Não é foco de teclado de
   * propósito: quem não usa mouse ajusta pelo menu "Altura", que faz o mesmo.
   */
  function alcaAltura(idLinha: string) {
    const arrastandoEsta = arrasteAltura?.idLinha === idLinha;
    return (
      <>
        <span
          aria-hidden="true"
          title="Arraste para mudar a altura de todas as linhas"
          onMouseDown={(evento) => iniciarArrasteAltura(evento, idLinha)}
          // Mousedown e mouseup na alça viram clique na linha, e clique na linha
          // abre o registro: soltar o arraste não pode navegar.
          onClick={(evento) => evento.stopPropagation()}
          className={cn(
            // A área de pegar (8px, montada na borda: -bottom-1 h-2) é o dobro da
            // faixa que se vê. Com 4px só dentro da linha, mirar na borda pegava o
            // texto da célula e virava seleção de texto em vez de arraste: testado
            // no navegador, errar por 1px é o caso comum, não o raro. A parte
            // visível continua fina por dentro do gradiente.
            "absolute -bottom-1 left-0 z-10 h-2 w-full cursor-row-resize select-none",
            "bg-linear-to-b from-transparent from-25% via-faixa/40 via-50% to-transparent to-75%",
            "opacity-0 group-hover/linha:opacity-100",
            arrastandoEsta && "via-faixa opacity-100",
          )}
        />
        {arrastandoEsta && alturaEmArraste !== null ? (
          <span className="pointer-events-none absolute right-2 bottom-1 z-20 rounded bg-foreground px-1.5 py-0.5 text-legenda font-medium text-background tabular-nums">
            {alturaEmArraste} px
          </span>
        ) : null}
      </>
    );
  }

  const cabecalho = (
    <TableHeader>
      {table.getHeaderGroups().map((grupo) => (
        <TableRow key={grupo.id} className="hover:bg-transparent">
          {grupo.headers.map((header) => {
            const alinharDireita =
              header.column.columnDef.meta?.alinharDireita === true;
            const podeReordenar =
              personalizavel && header.column.columnDef.meta?.fixa !== true;
            return (
              <TableHead
                key={header.id}
                style={personalizavel ? { width: header.getSize() } : undefined}
                draggable={podeReordenar}
                onDragStart={
                  podeReordenar
                    ? () => setArrastando(header.column.id)
                    : undefined
                }
                onDragEnd={podeReordenar ? () => setArrastando(null) : undefined}
                onDragOver={
                  podeReordenar
                    ? (evento) => {
                        if (arrastando) evento.preventDefault();
                      }
                    : undefined
                }
                onDrop={
                  podeReordenar
                    ? () => {
                        if (arrastando) reordenar(arrastando, header.column.id);
                        setArrastando(null);
                      }
                    : undefined
                }
                className={cn(
                  // Centralizado é o padrão da tabela. O `text-center` também
                  // vence o `text-left` fixo do TableHead do shadcn porque o `cn`
                  // é tailwind-merge (conflito resolve pelo último).
                  "h-9 px-3 text-center text-detalhe font-medium text-muted-foreground",
                  alinharDireita && "text-right",
                  personalizavel && "relative",
                  podeReordenar && "cursor-grab active:cursor-grabbing",
                  arrastando === header.column.id && "opacity-50",
                  arrastando !== null &&
                    arrastando !== header.column.id &&
                    podeReordenar &&
                    "border-l-2 border-l-faixa",
                  cabecalhoFixo &&
                    "sticky top-0 z-10 bg-background shadow-[inset_0_-1px_0_var(--color-border)]",
                  classesResponsivas(header),
                )}
              >
                {header.isPlaceholder ? null : header.column.getCanSort() ? (
                  <button
                    type="button"
                    onClick={header.column.getToggleSortingHandler()}
                    className={cn(
                      "inline-flex max-w-full items-center gap-1 select-none hover:text-foreground",
                      alinharDireita && "flex-row-reverse"
                    )}
                  >
                    <span className="truncate">
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                    </span>
                    <IconeOrdenacao direcao={header.column.getIsSorted()} />
                  </button>
                ) : (
                  flexRender(header.column.columnDef.header, header.getContext())
                )}

                {personalizavel && header.column.getCanResize() ? (
                  <span
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Redimensionar coluna ${rotuloColuna(
                      header.column.id,
                      header.column.columnDef.header,
                      header.column.columnDef.meta,
                    )}`}
                    onMouseDown={header.getResizeHandler()}
                    onTouchStart={header.getResizeHandler()}
                    onClick={(evento) => evento.stopPropagation()}
                    className={cn(
                      "absolute top-0 right-0 h-full w-1.5 cursor-col-resize touch-none select-none",
                      "hover:bg-faixa/60",
                      header.column.getIsResizing() && "bg-faixa"
                    )}
                  />
                ) : null}
              </TableHead>
            );
          })}
        </TableRow>
      ))}
    </TableHeader>
  );

  const corpo = (
    <TableBody>
      {isLoading ? (
        Array.from({ length: qtdSkeleton }, (_, indiceLinha) => (
          <TableRow
            key={indiceLinha}
            // A altura escolhida vale no loading também, senão o layout pula
            // quando os dados chegam.
            style={estiloLinha}
            className={cn("hover:bg-transparent", alturaLinha === null && "h-9")}
          >
            {colunasVisiveis.map((coluna) => (
              <TableCell
                key={coluna.id}
                className={cn(
                  "px-3 text-center text-detalhe",
                  alturaLinha !== null && "py-0",
                  coluna.columnDef.meta?.esconderAte
                    ? CLASSES_ESCONDER[coluna.columnDef.meta.esconderAte]
                    : undefined,
                )}
              >
                <Skeleton
                  className={cn(
                    "h-4",
                    coluna.columnDef.meta?.alinharDireita === true
                      ? "ml-auto w-16"
                      : "mx-auto w-3/4",
                  )}
                />
              </TableCell>
            ))}
          </TableRow>
        ))
      ) : linhas.length > 0 ? (
        linhas.map((linha) => (
          <TableRow
            key={linha.id}
            onClick={onRowClick ? () => onRowClick(linha.original) : undefined}
            onKeyDown={
              onRowClick
                ? (evento) => {
                    if (evento.key === "Enter" || evento.key === " ") {
                      evento.preventDefault();
                      onRowClick(linha.original);
                    }
                  }
                : undefined
            }
            tabIndex={onRowClick ? 0 : undefined}
            style={estiloLinha}
            className={cn(
              "hover:bg-muted/50",
              alturaLinha === null && "h-9",
              // A alça de altura é posicionada em relação à linha.
              personalizavel && "group/linha relative",
              onRowClick &&
                "cursor-pointer focus-visible:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
            )}
          >
            {linha.getVisibleCells().map((celula, indiceCelula) => {
              const alinharDireita =
                celula.column.columnDef.meta?.alinharDireita === true;
              const conteudo = flexRender(
                celula.column.columnDef.cell,
                celula.getContext(),
              );
              const naoTruncar =
                celula.column.columnDef.meta?.naoTruncar === true;
              return (
                <TableCell
                  key={celula.id}
                  className={cn(
                    "px-3 text-center text-detalhe",
                    alinharDireita && "text-right",
                    // Com altura fixa a célula não pode ter folga vertical:
                    // 28px de linha menos 16px de padding não caberia uma linha
                    // de texto. O `align-middle` do shadcn continua centralizando.
                    alturaLinha !== null && "py-0",
                    classesResponsivas(celula),
                  )}
                >
                  {indiceCelula === 0 && personalizavel
                    ? alcaAltura(linha.id)
                    : null}
                  {naoTruncar && alturaLinha === null ? (
                    conteudo
                  ) : (
                    <div
                      // Altura fixa na `tr` funciona como MÍNIMO, não como
                      // máximo: sem limitar a altura aqui dentro, a célula de
                      // duas linhas continuaria empurrando a linha e nada ficaria
                      // do mesmo tamanho.
                      style={
                        alturaLinha === null
                          ? undefined
                          : { maxHeight: alturaLinha }
                      }
                      className={cn(
                        !naoTruncar && "truncate",
                        alturaLinha !== null && "overflow-hidden",
                      )}
                      title={naoTruncar ? undefined : tituloDaCelula(celula)}
                    >
                      {conteudo}
                    </div>
                  )}
                </TableCell>
              );
            })}
          </TableRow>
        ))
      ) : (
        <TableRow className="hover:bg-transparent">
          <TableCell
            colSpan={colunasVisiveis.length}
            className="h-32 text-center text-detalhe text-muted-foreground"
          >
            {emptyState ?? "Nenhum registro encontrado"}
          </TableCell>
        </TableRow>
      )}
    </TableBody>
  );

  const tabela = (
    <table
      data-slot="table"
      className={cn(
        "w-full caption-bottom text-sm",
        personalizavel && "table-fixed",
      )}
    >
      {cabecalho}
      {corpo}
    </table>
  );

  return (
    <div
      className={cn(
        "flex flex-col gap-2",
        // Enquanto arrasta a altura, o cursor não muda de cara ao sair da alça e
        // o texto da tabela não é selecionado sem querer.
        arrasteAltura !== null && "cursor-row-resize select-none",
      )}
    >
      {temBarra && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            {colunaBusca ? (
              <div className="relative w-full max-w-xs">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={(colunaBusca.getFilterValue() as string | undefined) ?? ""}
                  onChange={(evento) => colunaBusca.setFilterValue(evento.target.value)}
                  placeholder={searchPlaceholder ?? "Buscar"}
                  className="h-8 pl-8 text-detalhe"
                />
              </div>
            ) : null}
            {(filtros ?? [])
              .filter((filtro) => filtroVisivel(filtro.id))
              .map((filtro) => (
                <React.Fragment key={filtro.id}>{filtro.elemento}</React.Fragment>
              ))}
            {toolbar}
          </div>
          <div className="flex items-center gap-2">
            {personalizavel && (filtros ?? []).length > 0 && (
              <MenuFiltros
                filtros={(filtros ?? []).map((filtro) => ({
                  id: filtro.id,
                  rotulo: filtro.rotulo,
                  fixo: filtro.fixo,
                  visivel: filtroVisivel(filtro.id),
                }))}
                onAlternar={alternarFiltro}
              />
            )}
            {personalizavel && (
              <MenuAltura altura={alturaLinha} onEscolher={aplicarAltura} />
            )}
            {personalizavel && (
              <MenuColunas
                colunas={colunasDoMenu}
                onRestaurarPadrao={restaurarPadrao}
                foraDoPadrao={foraDoPadrao}
              />
            )}
            {exportar && (
              <Button type="button" variant="outline" size="sm" onClick={exportar}>
                <FileSpreadsheet />
                Exportar Excel
              </Button>
            )}
          </div>
        </div>
      )}

      {cabecalhoFixo ? (
        <div
          className="overflow-auto rounded-md border border-border"
          style={{ maxHeight: alturaMaxima ?? ALTURA_MAXIMA_PADRAO }}
        >
          {tabela}
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <div data-slot="table-container" className="relative w-full overflow-x-auto">
            {tabela}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-detalhe text-muted-foreground tabular-nums">
          {de} a {ate} de {totalRegistros}
        </p>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-detalhe text-muted-foreground">
              Linhas por página
            </span>
            <Combobox
              valor={String(tamanhoPagina)}
              onValorChange={(valor) =>
                aoMudarPaginacao({ pageIndex: 0, pageSize: Number(valor) })
              }
              opcoes={TAMANHOS_PAGINA.map((tamanho) => ({
                valor: String(tamanho),
                rotulo: String(tamanho),
              }))}
              size="sm"
              className="w-[4.5rem] text-detalhe"
              ariaLabel="Linhas por página"
            />
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Página anterior"
            >
              <ChevronLeft />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Próxima página"
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Marca de célula vazia: nunca deixar buraco cru na tabela. */
export function CelulaVazia() {
  return (
    <span aria-label="não informado" className="text-muted-foreground">
      —
    </span>
  );
}

/**
 * Helper para coluna monetária: célula com MoneyText,
 * cabeçalho e células alinhados à direita.
 */
export function colunaDinheiro<TData>(
  accessorKey: string,
  header: string,
  extra?: Partial<ColumnDef<TData, unknown>>,
): ColumnDef<TData, unknown> {
  return {
    accessorKey,
    header,
    size: 140,
    cell: ({ getValue }) => {
      const valor = getValue();
      return (
        <MoneyText
          valor={
            typeof valor === "number" || typeof valor === "string" ? valor : null
          }
        />
      );
    },
    ...extra,
    meta: { alinharDireita: true, ...extra?.meta },
  };
}

/**
 * Helper para coluna de data: dd/mm/aaaa, largura fixa, tabular-nums, e
 * travessão quando não há data. Recebe o formatador para não acoplar o
 * canônico ao fuso (quem chama passa `formatarData`).
 */
export function colunaData<TData>(
  accessorKey: string,
  header: string,
  formatar: (valor: string) => string,
  extra?: Partial<ColumnDef<TData, unknown>>,
): ColumnDef<TData, unknown> {
  return {
    accessorKey,
    header,
    size: 116,
    cell: ({ getValue }) => {
      const valor = getValue();
      if (typeof valor !== "string" || valor === "") return <CelulaVazia />;
      const texto = formatar(valor);
      return texto === "" ? (
        <CelulaVazia />
      ) : (
        <span className="tabular-nums">{texto}</span>
      );
    },
    ...extra,
    meta: { naoTruncar: true, ...extra?.meta },
  };
}

/** Helper para coluna de texto: trunca com tooltip nativo e travessão no vazio. */
export function colunaTexto<TData>(
  accessorKey: string,
  header: string,
  extra?: Partial<ColumnDef<TData, unknown>>,
): ColumnDef<TData, unknown> {
  return {
    accessorKey,
    header,
    size: 180,
    cell: ({ getValue }) => {
      const valor = getValue();
      if (typeof valor !== "string" || valor.trim() === "") return <CelulaVazia />;
      return valor;
    },
    ...extra,
  };
}

/** Helper para coluna numérica inteira (contagem): direita, tabular-nums. */
export function colunaNumero<TData>(
  accessorKey: string,
  header: string,
  extra?: Partial<ColumnDef<TData, unknown>>,
): ColumnDef<TData, unknown> {
  return {
    accessorKey,
    header,
    size: 110,
    cell: ({ getValue }) => {
      const valor = getValue();
      if (typeof valor !== "number") return <CelulaVazia />;
      return <span className="tabular-nums">{valor}</span>;
    },
    ...extra,
    meta: { alinharDireita: true, naoTruncar: true, ...extra?.meta },
  };
}
