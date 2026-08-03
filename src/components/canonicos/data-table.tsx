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
  type Column,
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
 * Passo do teclado na largura da coluna, em px, e o passo do Shift.
 *
 * 8px porque a seta tem que dar para ajuste FINO (chegar em "cabe o texto e mais
 * nada") e 48px porque atravessar 800px de largura de 8 em 8 seriam 100 toques.
 * Ambos batem com o que a mão faz no arraste: um empurrãozinho e um puxão.
 */
const PASSO_LARGURA_TECLADO = 8;
const PASSO_LARGURA_TECLADO_GRANDE = 48;

/**
 * Faixa do GANHO do arraste de largura: quantos pixels a borda da coluna anda NA
 * TELA por pixel somado na largura DECLARADA (ver iniciarArrasteLargura, que mede
 * isso a cada movimento). O gesto divide o passo do mouse pelo ganho, então a
 * faixa é o quanto a largura declarada pode acelerar (4x) ou frear (1/4) para a
 * borda acompanhar o cursor.
 *
 * Existe porque a conta é uma divisão: ganho perto de zero (dragging na borda de
 * uma coluna que quase não move a divisória) jogaria a coluna no máximo em um
 * movimento, e ganho absurdamente alto travaria a coluna. 4x é o teto porque
 * exige contêiner mais de 4 vezes maior que a soma das larguras, que é tabela de
 * três colunas mínimas numa tela larga.
 */
const GANHO_MINIMO = 0.25;
const GANHO_MAXIMO = 4;

/**
 * Perturbação da sonda que mede o ganho no mousedown, em px de largura declarada.
 *
 * 2px é grande o bastante para a medida não virar ruído de subpixel e pequeno o
 * bastante para não aparecer: a sonda escreve a largura, mede a borda e devolve a
 * largura original dentro da MESMA tarefa, e o navegador só pinta no fim dela.
 * Sem a sonda o primeiro movimento do gesto andaria com ganho 1 (sem compensar),
 * e num arraste rápido esse primeiro movimento é um pulo de 40 a 60px, ou seja um
 * atraso permanente de vários pixels entre o cursor e a borda.
 */
const SONDA_GANHO = 2;

/**
 * O arraste de largura em andamento, visto de fora do gesto. Tudo que o gesto usa
 * para trabalhar (largura ao vivo, âncora do mouse, ganho medido, as `th` da
 * coluna) fica fechado dentro dele, e daqui só sai o que o componente precisa:
 * redesenhar a guia quando ela finalmente monta e tirar os ouvintes no desmonte.
 */
interface GestoLargura {
  idColuna: string;
  /** Repõe guia e etiqueta na largura em que o gesto está agora. */
  redesenhar: () => void;
  /** Passa a contar o movimento a partir deste x (ver o segundo mousedown). */
  reancorar: (clienteX: number) => void;
  /** Fecha o gesto: grava a largura onde a mão parou e sai da tela. */
  soltar: () => void;
  /** Tira os ouvintes de janela deste gesto. */
  encerrar: () => void;
}

/**
 * Folga do "ajustar ao conteúdo": o `px-3` dos dois lados da célula (12 + 12).
 * Sem ela a coluna fica exatamente do tamanho do texto e o texto encosta na
 * divisória, o que na tela lê como conteúdo cortado.
 */
const FOLGA_CELULA = 24;

/**
 * Folga extra no cabeçalho de coluna ordenável: o ícone de ordenação (`size-3.5`
 * = 14px) mais o `gap-1` (4px) mais 2 de respiro. O ícone é irmão do texto no
 * botão, então ele não entra na medida do texto, mas ocupa lugar de verdade.
 */
const FOLGA_ICONE_ORDENACAO = 20;

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
 * Presa a largura nos limites da coluna. Respeita `minSize`/`maxSize` da coluna
 * quando a tela declarou (a coluna de ações é travada em 52), e cai nos limites
 * gerais quando não declarou. É a MESMA conta que o saneamento da preferência
 * faz na leitura, então nada que sai daqui é descartado ao voltar do banco.
 */
function limitarLargura<TData>(
  coluna: Column<TData, unknown>,
  largura: number,
): number {
  const minima = coluna.columnDef.minSize ?? LARGURA_MINIMA;
  const maxima = coluna.columnDef.maxSize ?? LARGURA_MAXIMA;
  return Math.min(maxima, Math.max(minima, Math.round(largura)));
}

/**
 * A coluna (ou a tabela) está escondida pelo CSS? Olha `display:none` no próprio
 * elemento e em cada ancestral até `limite` (exclusive; `null` vai até o topo).
 *
 * Existe porque visibilidade do TanStack e visibilidade do CSS são duas coisas
 * diferentes: coluna com `meta.esconderAte` continua "visível" para o TanStack
 * (aparece no menu, entra na preferência) e está `display:none` abaixo do
 * breakpoint. Ela mede ZERO, e medida zero viraria o mínimo (60px) gravado na
 * preferência do usuário.
 *
 * Percorre os ancestrais porque contêiner escondido esconde a célula sem que o
 * `getComputedStyle` DELA acuse nada: o `display` computado de um filho de
 * `display:none` continua sendo o dele (`table-cell`), não `none`.
 */
function ocultoPeloCss(
  elemento: HTMLElement,
  limite: HTMLElement | null,
): boolean {
  let no: HTMLElement | null = elemento;
  while (no !== null && no !== limite) {
    if (window.getComputedStyle(no).display === "none") return true;
    no = no.parentElement;
  }
  return false;
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
  /**
   * Arraste de largura em andamento, só o que a RENDERIZAÇÃO precisa saber: qual
   * coluna pintar de âmbar, o cursor da tabela e a existência da guia. O gesto em
   * si (largura ao vivo, âncora, ganho) mora em ref e não aqui, senão a tabela
   * inteira re-renderizava por pixel.
   */
  const [arrasteLargura, setArrasteLargura] = React.useState<{
    idColuna: string;
  } | null>(null);

  const refTabela = React.useRef<HTMLTableElement | null>(null);
  const refGuia = React.useRef<HTMLDivElement | null>(null);
  const refRotuloGuia = React.useRef<HTMLSpanElement | null>(null);
  /**
   * O gesto de largura vivo. Fica em ref porque quem passa a escutar a janela é o
   * PRÓPRIO mousedown (ver iniciarArrasteLargura): ref é o que já está lá na hora
   * do clique, sem esperar renderização nem efeito.
   */
  const refGesto = React.useRef<GestoLargura | null>(null);

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

  /**
   * Grava largura de coluna. Lê o mapa da entrada COMPARTILHADA (e não o
   * `larguras` desta renderização) porque quem chama vem de gesto: o valor tem
   * que se somar ao que a instância irmã acabou de mudar, não substituir.
   */
  const definirLarguras = React.useCallback(
    (novas: Record<string, number>) => {
      const entrada = obterEntrada(chaveEstado, estadoInicial);
      definirEstado(entrada, {
        larguras: { ...entrada.estado.larguras, ...novas },
      });
      agendarGravacao(entrada);
    },
    [agendarGravacao, chaveEstado, estadoInicial],
  );

  /** As células (cabeçalho e corpo) de uma coluna nesta instância da tabela. */
  function celulasDaColuna(idColuna: string): HTMLElement[] {
    const raiz = refTabela.current;
    if (raiz === null) return [];
    return Array.from(
      raiz.querySelectorAll<HTMLElement>("[data-coluna]"),
    ).filter((celula) => celula.dataset.coluna === idColuna);
  }

  /**
   * O que medir dentro de uma célula: o `[data-medir]` quando existe, senão o
   * primeiro elemento de conteúdo. As ALÇAS são puladas de propósito: elas moram
   * dentro da célula (a de largura no cabeçalho, a de altura na primeira célula da
   * linha) e seriam o "primeiro elemento" de uma célula cujo conteúdo é só texto.
   * Medir a alça daria 12px em toda coluna e o ajuste ao conteúdo viraria "encolhe
   * tudo para o mínimo".
   */
  function conteudoMedivel(celula: HTMLElement): HTMLElement | null {
    const marcado = celula.querySelector<HTMLElement>("[data-medir]");
    if (marcado !== null) return marcado;
    for (const filho of celula.children) {
      if (filho instanceof HTMLElement && filho.dataset.alca === undefined) {
        return filho;
      }
    }
    return null;
  }

  /**
   * Largura que cada coluna precisa para caber o conteúdo que está NA TELA (o
   * maior entre o cabeçalho e as células da página), presa entre o mínimo e o
   * máximo. É o duplo clique na divisória e o "Ajustar ao conteúdo" do menu.
   *
   * Medir exige soltar a largura do elemento antes: célula truncada tem retângulo
   * do tamanho da CÉLULA, então sem `max-content` a medida nunca encolheria uma
   * coluna larga demais, que é justo o caso que dói ("Descrição e categoria" com
   * 2.349 linhas). As fases são de propósito: primeiro joga fora o que o CSS
   * escondeu (só leitura), depois escreve em todos, DEPOIS lê todos, DEPOIS devolve
   * o estilo — assim o navegador faz um recálculo de layout por gesto, e não um por
   * célula.
   *
   * Coluna com `naoTruncar` (data, número, badge) não tem o `[data-medir]`; nela a
   * medida cai no primeiro elemento da célula. Isso mede certo TAMBÉM na célula
   * montada de várias linhas, e o caso que importa é a "Descrição e categoria"
   * (`CelulaDescricaoCategoria`: um `div.min-w-0` com dois `div.truncate`
   * dentro). O `max-content` do div de fora é o MAIOR max-content dos filhos, e
   * `white-space: nowrap` é herdado pelos dois, então a medida sai como a mais
   * larga das duas linhas em uma linha só — ela ENCOLHE a coluna quando o texto
   * é curto, não devolve a largura atual. O que não mede certo é descendente com
   * largura em porcentagem (`w-full` e afins), que se resolve contra o pai
   * `max-content` e trava a medida na largura de agora; nenhuma célula do app
   * está nesse caso hoje.
   */
  function medirLarguras(ids: string[]): Record<string, number> {
    const raiz = refTabela.current;
    if (raiz === null) return {};
    // Tabela inteira fora da tela: não há o que medir, e medir zero gravaria o
    // mínimo em TODAS as colunas de uma vez.
    if (ocultoPeloCss(raiz, null)) return {};

    // Fase 0, só leitura de estilo: agrupa as células por coluna e descarta a
    // coluna que o CSS escondeu (`esconderAte` abaixo do breakpoint, hoje em
    // Ordens de compra e Cotações). Coluna não renderizada mede zero e sairia com
    // 60px gravado NA PREFERÊNCIA: quem clica no ajuste com a janela estreita
    // acharia a coluna esmagada ao abrir a mesma tela num monitor grande, e a
    // única saída seria o "Restaurar padrão", que joga fora ordem e visibilidade
    // também. Coluna que não está na tela de verdade fica INTACTA: nem medida,
    // nem gravada.
    //
    // Esta leitura vem toda ANTES das escritas de estilo pelo mesmo motivo das
    // três fases seguintes: `getComputedStyle` intercalado com escrita custaria um
    // recálculo de estilo por célula.
    const porColuna = new Map<string, HTMLElement[]>();
    for (const celula of raiz.querySelectorAll<HTMLElement>("[data-coluna]")) {
      const id = celula.dataset.coluna;
      if (id === undefined || !ids.includes(id)) continue;
      const lista = porColuna.get(id);
      if (lista === undefined) porColuna.set(id, [celula]);
      else lista.push(celula);
    }
    const celulasNaTela: { id: string; celula: HTMLElement }[] = [];
    for (const [id, celulasDaColuna] of porColuna) {
      if (ocultoPeloCss(celulasDaColuna[0], raiz)) continue;
      for (const celula of celulasDaColuna) celulasNaTela.push({ id, celula });
    }

    const alvos: {
      id: string;
      no: HTMLElement;
      ehCabecalho: boolean;
      largura: string;
      espacoBranco: string;
      larguraMaxima: string;
      encolher: string;
    }[] = [];

    for (const { id, celula } of celulasNaTela) {
      const alvo = conteudoMedivel(celula);
      if (alvo === null) continue;
      alvos.push({
        id,
        no: alvo,
        ehCabecalho: celula.tagName === "TH",
        largura: alvo.style.width,
        espacoBranco: alvo.style.whiteSpace,
        larguraMaxima: alvo.style.maxWidth,
        encolher: alvo.style.flexShrink,
      });
      alvo.style.width = "max-content";
      alvo.style.whiteSpace = "nowrap";
      alvo.style.maxWidth = "none";
      // O texto do cabeçalho é item flex ao lado do ícone de ordenação, e item
      // flex ENCOLHE mesmo com `max-content`: sem travar o encolhimento, a medida
      // do cabeçalho nunca passaria da largura atual da coluna.
      alvo.style.flexShrink = "0";
    }

    const maiores = new Map<string, number>();
    for (const alvo of alvos) {
      const coluna = table.getColumn(alvo.id);
      const folgaIcone =
        alvo.ehCabecalho && coluna?.getCanSort() === true
          ? FOLGA_ICONE_ORDENACAO
          : 0;
      const medida = alvo.no.getBoundingClientRect().width + folgaIcone;
      maiores.set(alvo.id, Math.max(maiores.get(alvo.id) ?? 0, medida));
    }

    for (const alvo of alvos) {
      alvo.no.style.width = alvo.largura;
      alvo.no.style.whiteSpace = alvo.espacoBranco;
      alvo.no.style.maxWidth = alvo.larguraMaxima;
      alvo.no.style.flexShrink = alvo.encolher;
    }

    const larguras: Record<string, number> = {};
    for (const [id, medida] of maiores) {
      const coluna = table.getColumn(id);
      if (!coluna) continue;
      larguras[id] = limitarLargura(coluna, Math.ceil(medida) + FOLGA_CELULA);
    }
    return larguras;
  }

  /** Ajusta ao conteúdo as colunas pedidas. Nada medido, nada mudado. */
  function ajustarAoConteudo(ids: string[]) {
    const medidas = medirLarguras(ids);
    if (Object.keys(medidas).length > 0) definirLarguras(medidas);
  }

  /** "Ajustar ao conteúdo" do menu Colunas: todas as visíveis que dão para mexer. */
  function ajustarTodasAoConteudo() {
    ajustarAoConteudo(
      table
        .getVisibleLeafColumns()
        .filter((coluna) => coluna.getCanResize())
        .map((coluna) => coluna.id),
    );
  }

  /**
   * O gesto de largura, do mousedown ao mouseup. `clienteX` vem do mouse ou do
   * dedo.
   *
   * Os ouvintes de janela nascem AQUI, na mesma tarefa do mousedown, e não num
   * efeito que reage a estado. O mouse sai do cabeçalho no meio do arraste, então
   * quem escuta tem que ser a janela, mas registrar isso num efeito abria uma
   * janela cega entre o clique e o React rodar o efeito (que é depois da pintura):
   * movimento que caía ali era perdido, e o gesto que cabia todo ali simplesmente
   * não acontecia. Não é hipótese de teste: um arraste real disparado pela
   * automação do Chrome (eventos de entrada do sistema, os mesmos de uma pessoa)
   * não redimensionava nada. Na mão vira "às vezes o arraste não pega".
   *
   * A alça de ALTURA nunca sofreu disso mesmo escutando por efeito porque a conta
   * dela é ABSOLUTA (`alturaBase + (clientY - clienteY)`): perder os primeiros
   * movimentos não muda o resultado, basta UM movimento chegar depois. O gesto de
   * largura soma PASSOS (é o que faz o limite não acumular excedente) e desenha já
   * no clique, então movimento perdido é largura perdida.
   *
   * O outro ponto principal: o gesto NÃO passa pelo estado do React enquanto a mão
   * anda. Escreve a largura direto na `th` (com `table-fixed` é ela que manda na
   * coluna), move a linha guia e troca o texto da etiqueta de px. O estado só
   * marca QUE existe um gesto, para a guia montar e a alça acender.
   *
   * A guia e a etiqueta saem de uma MEDIDA da `th` a cada movimento (ver
   * medirNaTela), não de uma conta sobre a largura declarada: é um recálculo de
   * layout por movimento do mouse, e nenhuma renderização de célula. A mesma
   * medida serve para a borda ACOMPANHAR O CURSOR 1 para 1 (ver o ganho, em
   * desenhar e em mover), que é o que faz o gesto parecer planilha.
   *
   * Medido nesta suíte com 25 linhas e 15 colunas: com `columnResizeMode:
   * "onChange"` um arraste de 20 passos custava 7.875 renderizações de célula
   * (375 por pixel andado). Aqui custa ZERO durante o gesto e uma renderização no
   * fim, quando o valor final vira preferência.
   */
  function iniciarArrasteLargura(
    coluna: Column<TData, unknown>,
    clienteX: number,
  ) {
    const idColuna = coluna.id;
    const gestoVivo = refGesto.current;
    if (gestoVivo !== null) {
      // Chegar um mousedown com gesto de pé acontece em dois casos: tela híbrida,
      // que manda touchstart E mousedown no mesmo toque, e mouseup perdido (mão
      // solta fora da janela, sobre o devtools ou um menu nativo), que sem saída
      // deixaria a alça morta até a tela desmontar.
      //
      // Na MESMA coluna o certo é CONTINUAR o gesto, só mudando a âncora para o
      // clique de agora. Recomeçar leria a largura de partida do TanStack, que
      // ainda é a de antes do arraste (o valor só é gravado no soltar), e a coluna
      // daria um pulo para trás. Em coluna diferente, o gesto antigo é fechado (ele
      // grava a largura que está na tela, então nada se perde) e o novo começa
      // limpo, porque a largura declarada da OUTRA coluna está em dia.
      if (gestoVivo.idColuna === idColuna) {
        gestoVivo.reancorar(clienteX);
        return;
      }
      gestoVivo.soltar();
    }

    const larguraBase = Math.round(coluna.getSize());
    const minima = coluna.columnDef.minSize ?? LARGURA_MINIMA;
    const maxima = coluna.columnDef.maxSize ?? LARGURA_MAXIMA;
    const cabecalhos = celulasDaColuna(idColuna).filter(
      (celula) => celula.tagName === "TH",
    );
    const tabela = refTabela.current;
    // A `th` desta coluna nesta instância: é dela que sai toda a medida do gesto.
    const cabecalhoDaColuna: HTMLElement | null = cabecalhos[0] ?? null;
    // Onde a divisória está agora, em px a partir da borda esquerda da tabela: é
    // daqui que a linha guia sai quando NÃO dá para medir (ver medirNaTela).
    const bordaInicial =
      cabecalhoDaColuna !== null && tabela !== null
        ? cabecalhoDaColuna.getBoundingClientRect().right -
          tabela.getBoundingClientRect().left
        : 0;
    /** A largura DECLARADA que está escrita na `th` agora, e que o soltar grava. */
    let larguraAtual = larguraBase;
    /**
     * A mesma largura declarada, COM FRAÇÃO. O gesto acumula aqui e só arredonda
     * para escrever no DOM: com a escala compensada 1px de mouse pode valer 0,7px
     * de largura declarada, e arredondar a cada movimento comeria o resto de cada
     * passo, deixando a borda para trás do cursor num arraste lento.
     */
    let larguraExata = larguraBase;
    /**
     * De onde o PRÓXIMO movimento conta. Anda a cada movimento em vez de ficar
     * fixa no mousedown porque o gesto soma PASSOS: assim o que passou do limite
     * de largura não fica guardado em lugar nenhum, e inverter a mão no fim do
     * curso volta a andar na hora. Guardar o deslocamento bruto desde o clique é o
     * erro clássico aqui: a coluna fica parada no limite acumulando 300px de mouse
     * e dispara quando a mão volta.
     */
    let ancoraX = clienteX;
    /**
     * Quantos pixels a BORDA anda na tela por pixel somado na largura DECLARADA.
     * O gesto converte o passo do mouse em largura dividindo por ele, e é isso que
     * faz a borda acompanhar o dedo em tabela que escala.
     *
     * Por que não basta o fator `larguraNaTela / larguraDeclarada`: numa tabela
     * `w-full table-fixed` com a soma das declaradas MENOR que o contêiner, o
     * navegador reparte a sobra proporcionalmente, ou seja cada coluna rende
     * `declarada x contêiner / soma`. Engordar ESTA coluna aumenta a soma, então o
     * fator de todas cai no mesmo movimento, e a borda também depende das colunas à
     * ESQUERDA, que encolhem junto. O efeito líquido é a borda andar MENOS que a
     * largura declarada (medido em Cadastros > Formas de pagamento e Financeiro >
     * Contas bancárias: 100px de mouse moviam a borda 86), enquanto o fator
     * `naTela/declarada` (1,31 naquelas telas) diria para andar MENOS ainda e
     * pioraria o atraso. Por isso o ganho é MEDIDO, não deduzido: a borda medida
     * antes e depois de cada escrita entrega a conta real do navegador, sem a
     * gente depender de como ele reparte a sobra.
     *
     * 1 é o valor honesto sem medida (jsdom, tabela oculta) e é exatamente o que a
     * tabela que já rola na horizontal faz de verdade: ali declarada e tela
     * coincidem e o gesto sempre foi 1 para 1.
     */
    let ganho = 1;
    /** Último par (declarada, borda) medido: é dele que sai o ganho do próximo passo. */
    let amostra: { declarada: number; borda: number } | null = null;

    /**
     * Onde a divisória está e que largura a coluna tem AGORA NA TELA, medidos da
     * `th`, mais a linha de baixo do cabeçalho visível. `null` = não há layout
     * para ler (jsdom no teste, tabela oculta): rect zerado é "não deu para
     * medir", não coluna de 0px.
     *
     * Medir é obrigatório porque a tabela é `w-full table-fixed`: quando a soma
     * das larguras DECLARADAS é menor que o contêiner, o navegador escala todas as
     * colunas proporcionalmente para preencher, e aí somar 100px na largura
     * declarada não move a borda 100px na tela. Medido em Cadastros > Formas de
     * pagamento e Financeiro > Contas bancárias (~1.110px declarados num contêiner
     * de ~1.450px): a borda anda 85 a 96px enquanto a conta declarada andava 100, e
     * numa coluna gorda a guia descolava ~14px da divisória. Nas telas que já rolam
     * na horizontal (Lançamentos, fila de aprovação) as duas contas coincidem, e é
     * por isso que o erro passou.
     */
    function medirNaTela(): {
      borda: number;
      largura: number;
      baseDoCabecalho: number;
    } | null {
      if (cabecalhoDaColuna === null || tabela === null) return null;
      const retCabecalho = cabecalhoDaColuna.getBoundingClientRect();
      if (retCabecalho.width === 0) return null;
      const retTabela = tabela.getBoundingClientRect();
      return {
        borda: retCabecalho.right - retTabela.left,
        largura: Math.round(retCabecalho.width),
        // Com `cabecalhoFixo` a `th` é sticky, então o rect dela acompanha a
        // rolagem: a etiqueta sai daqui para ficar colada no cabeçalho que está À
        // VISTA. Antes ela morava no topo do CONTEÚDO e, com meia tela rolada,
        // ficava fora de vista em Ordens, Cotações, Aprovação de pagamentos e
        // Pagamentos diretos, justo as quatro de cabeçalho fixo.
        baseDoCabecalho: retCabecalho.bottom - retTabela.top,
      };
    }

    function desenhar(declarada: number) {
      larguraExata = declarada;
      // A `th` só recebe px inteiro: é o número que a preferência vai guardar e
      // que o TanStack devolve em `getSize()`, então a tela não pode mostrar uma
      // largura que a próxima visita não reproduz.
      const largura = Math.round(declarada);
      larguraAtual = largura;
      for (const celula of cabecalhos) {
        celula.style.width = `${largura}px`;
      }
      // Ler DEPOIS de escrever, no mesmo movimento do mouse: é UM recálculo de
      // layout por movimento, e é o preço de a guia e a etiqueta dizerem a verdade
      // do que está na tela. Continua sem re-renderizar célula nenhuma.
      const naTela = medirNaTela();
      if (naTela !== null) {
        // O ganho sai de duas medidas consecutivas da MESMA borda, uma antes e
        // outra depois desta escrita. Medir a cada movimento (em vez de fixar no
        // mousedown) é obrigatório: a escala muda conforme a soma das larguras
        // muda, e num arraste longo o ganho caminha (nas telas que escalam ele sobe
        // até 1 quando a soma alcança o contêiner e a tabela passa a rolar). Fixar
        // no clique deixaria o gesto elástico justo no fim do curso.
        if (amostra !== null) {
          const passoDeclarado = largura - amostra.declarada;
          // Passo declarado menor que 1px não mede nada (é o arredondamento do
          // DOM), e dividir por ele é justamente a divisão por zero: mantém o ganho
          // que já estava valendo.
          if (Math.abs(passoDeclarado) >= 1) {
            const medido = (naTela.borda - amostra.borda) / passoDeclarado;
            // Borda que não andou (ou andou para o lado errado) não é escala: é
            // borda presa, o caso da última coluna de uma tabela que escala, cuja
            // borda direita é a do contêiner e nenhuma largura declarada move. Ali
            // o ganho 1 é a única saída sã, senão dividir por quase zero jogava a
            // coluna no máximo num piscar. Ganho medido de verdade entra preso na
            // faixa (ver GANHO_MINIMO): fora dela o gesto ficaria elástico.
            ganho =
              Number.isFinite(medido) && medido > 0
                ? Math.min(GANHO_MAXIMO, Math.max(GANHO_MINIMO, medido))
                : 1;
          }
        }
        amostra = { declarada: largura, borda: naTela.borda };
      }
      // A guia só entra no DOM na renderização que este mousedown dispara, então
      // no clique (e num movimento que chegue antes dela) não há o que mover: quem
      // a põe no lugar assim que ela monta é o efeito que chama `redesenhar`.
      if (refGuia.current !== null) {
        refGuia.current.style.left = `${
          naTela === null ? bordaInicial + (largura - larguraBase) : naTela.borda
        }px`;
      }
      if (refRotuloGuia.current !== null) {
        // A etiqueta mostra a largura REAL na tela, que com o escalonamento do
        // `table-fixed` pode ser ~30% maior que a declarada. Quem lê "240 px"
        // precisa achar 240px de coluna, não o número que o TanStack guarda.
        refRotuloGuia.current.textContent = `${naTela?.largura ?? largura} px`;
        refRotuloGuia.current.style.top = `${(naTela?.baseDoCabecalho ?? 0) + 4}px`;
      }
    }

    /**
     * Converte o passo do mouse em largura declarada e desenha. Dividir pelo ganho
     * é o que faz a borda (e a guia, que sai dela) acompanhar o cursor 1 para 1 nas
     * duas direções, tanto na tabela que escala quanto na que já rola.
     *
     * O limite é aplicado na largura DECLARADA, que é o que LARGURA_MINIMA e
     * LARGURA_MAXIMA querem dizer. Chegando lá a borda para e o cursor segue
     * sozinho; como a âncora andou, nada do excedente fica guardado e a volta
     * começa a andar no primeiro pixel.
     */
    function mover(clienteAtual: number) {
      const passoMouse = clienteAtual - ancoraX;
      ancoraX = clienteAtual;
      if (passoMouse === 0) return;
      desenhar(
        Math.min(maxima, Math.max(minima, larguraExata + passoMouse / ganho)),
      );
    }

    function aoMoverMouse(evento: MouseEvent) {
      mover(evento.clientX);
    }
    function aoMoverDedo(evento: TouchEvent) {
      const toque = evento.touches[0];
      if (toque === undefined) return;
      // Sem isto o dedo arrasta a coluna E rola a página junto.
      if (evento.cancelable) evento.preventDefault();
      mover(toque.clientX);
    }
    function encerrar() {
      window.removeEventListener("mousemove", aoMoverMouse);
      window.removeEventListener("mouseup", soltar);
      window.removeEventListener("touchmove", aoMoverDedo);
      window.removeEventListener("touchend", soltar);
      window.removeEventListener("touchcancel", soltar);
    }
    function soltar() {
      // O gesto tira os próprios ouvintes: eles não são mais de um efeito, então
      // não existe cleanup de efeito para fazer isso no fim do arraste.
      encerrar();
      refGesto.current = null;
      // Grava a largura DECLARADA (`larguraAtual`), nunca a que a guia e a etiqueta
      // mostraram: é a declarada que o TanStack consome e devolve em
      // `column.getSize()`, e é ela que a preferência tem que reproduzir na próxima
      // visita. A largura na tela é consequência do `table-fixed` escalando as
      // colunas para preencher o contêiner (ver medirNaTela) e muda com o tamanho
      // da janela, então guardar aquele número faria a coluna crescer a cada
      // recarregamento numa tela larga.
      //
      // Uma gravação por gesto, com o valor onde a mão parou. Clique na divisória
      // sem andar não é gesto nenhum: gravar ali criaria preferência de largura do
      // nada (e acenderia o "Restaurar padrão") num clique que não mudou nada.
      if (larguraAtual !== larguraBase) {
        definirLarguras({ [idColuna]: larguraAtual });
      }
      setArrasteLargura(null);
    }

    // Escutar ANTES de qualquer outra coisa é o conserto: daqui para frente não
    // existe movimento que o gesto não veja, nem que ele dependa de renderização.
    window.addEventListener("mousemove", aoMoverMouse);
    window.addEventListener("mouseup", soltar);
    window.addEventListener("touchmove", aoMoverDedo, { passive: false });
    window.addEventListener("touchend", soltar);
    window.addEventListener("touchcancel", soltar);
    refGesto.current = {
      idColuna,
      redesenhar: () => desenhar(larguraExata),
      reancorar: (clienteAtual: number) => {
        ancoraX = clienteAtual;
      },
      soltar,
      encerrar,
    };

    // Sonda de 2px: escreve, mede a borda e volta para a largura de partida, tudo
    // na mesma tarefa, sem pintar nada. É o par de medidas que dá o ganho ANTES do
    // primeiro movimento, senão o primeiro passo (que num arraste rápido já é um
    // pulo de dezenas de pixels) andaria sem compensar e o atraso ficaria até o
    // fim do gesto. Se a largura de partida já está no teto, a sonda vai para
    // baixo: escrever acima do máximo, mesmo por um instante, é largura que a
    // coluna não pode ter.
    desenhar(
      larguraBase + SONDA_GANHO <= maxima
        ? larguraBase + SONDA_GANHO
        : larguraBase - SONDA_GANHO,
    );
    desenhar(larguraBase);

    // Só o que RENDERIZA: a guia entra na tela, a alça acende e o cursor da tabela
    // vira col-resize. O gesto já está de pé sem depender desta renderização.
    setArrasteLargura({ idColuna });
  }

  /**
   * A guia e a etiqueta só existem no DOM depois da renderização que o mousedown
   * disparou, então o desenho feito no clique não as alcança: este efeito é o que
   * as põe na borda medida assim que elas montam. É desenho, não gesto: o arraste
   * funciona igual se este efeito atrasar (ver iniciarArrasteLargura).
   */
  React.useEffect(() => {
    if (arrasteLargura === null) return;
    const gesto = refGesto.current;
    if (gesto === null) return;
    const tabela = refTabela.current;
    if (refGuia.current !== null && tabela !== null) {
      // A guia desce a tabela inteira, e a altura só existe em px: dentro de um
      // contêiner que rola, `bottom-0` mediria a janela visível, não a tabela.
      refGuia.current.style.height = `${tabela.offsetHeight}px`;
    }
    gesto.redesenhar();
  }, [arrasteLargura]);

  // Nada de ouvinte órfão: os ouvintes do gesto não são mais de um efeito, então
  // quem garante a saída deles quando a tela desmonta no meio do arraste é este
  // cleanup. Sem ele, trocar de rota com o botão do mouse apertado deixaria um
  // mousemove vivo escrevendo em `th` que não está mais na tela.
  React.useEffect(() => {
    return () => {
      refGesto.current?.encerrar();
      refGesto.current = null;
    };
  }, []);

  /**
   * Teclado na alça: seta ajusta fino, Shift+seta ajusta grosso, Home e End vão
   * para o mínimo e o máximo, Enter ajusta ao conteúdo. Sem isto largura de coluna
   * não existe para quem não usa mouse, e a definição de pronto do projeto exige
   * a tela usável sem mouse.
   */
  function aoTeclarNaAlca(
    evento: React.KeyboardEvent<HTMLElement>,
    coluna: Column<TData, unknown>,
  ) {
    if (evento.key === "Enter") {
      evento.preventDefault();
      evento.stopPropagation();
      ajustarAoConteudo([coluna.id]);
      return;
    }
    const passo = evento.shiftKey
      ? PASSO_LARGURA_TECLADO_GRANDE
      : PASSO_LARGURA_TECLADO;
    const atual = Math.round(coluna.getSize());
    let proxima: number | null = null;
    if (evento.key === "ArrowRight") proxima = atual + passo;
    else if (evento.key === "ArrowLeft") proxima = atual - passo;
    else if (evento.key === "Home") proxima = LARGURA_MINIMA;
    else if (evento.key === "End") proxima = LARGURA_MAXIMA;
    if (proxima === null) return;
    evento.preventDefault();
    // A linha da tabela também escuta tecla (Enter abre o registro): ajustar
    // largura não pode navegar para outra tela.
    evento.stopPropagation();
    const limitada = limitarLargura(coluna, proxima);
    // Seta no limite não grava de novo o mesmo valor: quem segura a tecla no fim
    // do curso mandaria uma gravação por repetição do teclado.
    if (limitada === Math.round(coluna.getSize())) return;
    definirLarguras({ [coluna.id]: limitada });
  }

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
          // Sem `columnResizeMode: "onChange"`: o arraste é nosso (ver o efeito do
          // arraste de largura) e não passa pelo estado do TanStack a cada pixel,
          // que era o que re-renderizava a tabela inteira por movimento do mouse.
          // `enableColumnResizing` fica porque é ele que responde `getCanResize()`.
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
          // Marca de alça: o "ajustar ao conteúdo" não pode medir ela achando que
          // é o conteúdo da célula (ver conteudoMedivel).
          data-alca="altura"
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
          <span
            data-alca="altura"
            className="pointer-events-none absolute right-2 bottom-1 z-20 rounded bg-foreground px-1.5 py-0.5 text-legenda font-medium text-background tabular-nums"
          >
            {alturaEmArraste} px
          </span>
        ) : null}
      </>
    );
  }

  /** Última coluna visível: a alça dela não pode transbordar para fora da tabela. */
  const idUltimaColuna =
    colunasVisiveis[colunasVisiveis.length - 1]?.id ?? undefined;

  const cabecalho = (
    <TableHeader>
      {table.getHeaderGroups().map((grupo) => (
        <TableRow key={grupo.id} className="group/cabecalho hover:bg-transparent">
          {grupo.headers.map((header, indiceHeader) => {
            const alinharDireita =
              header.column.columnDef.meta?.alinharDireita === true;
            const podeReordenar =
              personalizavel && header.column.columnDef.meta?.fixa !== true;
            return (
              <TableHead
                key={header.id}
                data-coluna={header.column.id}
                style={
                  personalizavel
                    ? {
                        width: header.getSize(),
                        // Pilha DECRESCENTE da esquerda para a direita. A alça de
                        // largura é montada sobre a divisória e transborda 6px para
                        // dentro do cabeçalho vizinho; com `cabecalhoFixo` cada
                        // `th` é sticky com z-index próprio, e sem esta pilha o
                        // vizinho (que vem depois no DOM) pintaria em cima dessa
                        // metade e ela perderia o CLIQUE, não só a cor. Fica acima
                        // de 10 para o cabeçalho fixo continuar por cima do corpo.
                        zIndex: 10 + (grupo.headers.length - indiceHeader),
                      }
                    : undefined
                }
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
                    <span data-medir className="truncate">
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
                    // Marca de alça: o "ajustar ao conteúdo" não mede a alça (ver
                    // conteudoMedivel), senão cabeçalho de texto puro mediria 12px.
                    data-alca="largura"
                    aria-label={`Largura da coluna ${rotuloColuna(
                      header.column.id,
                      header.column.columnDef.header,
                      header.column.columnDef.meta,
                    )}`}
                    // Leitor de tela anuncia a largura ao focar e a cada seta.
                    aria-valuenow={Math.round(header.getSize())}
                    aria-valuemin={header.column.columnDef.minSize ?? LARGURA_MINIMA}
                    aria-valuemax={header.column.columnDef.maxSize ?? LARGURA_MAXIMA}
                    aria-valuetext={`${Math.round(header.getSize())} pixels`}
                    // Foco de teclado é obrigatório: a alça é a única forma de
                    // mudar largura, e sem mouse ela não existia.
                    tabIndex={0}
                    title="Arraste para mudar a largura. Duplo clique ajusta ao conteúdo."
                    onMouseDown={(evento) => {
                      // preventDefault mata duas coisas: a seleção de texto do
                      // cabeçalho e o arraste NATIVO de reordenar (a `th` é
                      // `draggable`), que roubaria o gesto de redimensionar.
                      evento.preventDefault();
                      evento.stopPropagation();
                      iniciarArrasteLargura(header.column, evento.clientX);
                    }}
                    onTouchStart={(evento) => {
                      evento.stopPropagation();
                      const toque = evento.touches[0];
                      if (toque === undefined) return;
                      iniciarArrasteLargura(header.column, toque.clientX);
                    }}
                    // Cinto e suspensório do preventDefault acima: se o navegador
                    // iniciar o drag de reordenar mesmo assim, ele para aqui.
                    draggable={false}
                    onDragStart={(evento) => {
                      evento.preventDefault();
                      evento.stopPropagation();
                    }}
                    onDoubleClick={(evento) => {
                      evento.preventDefault();
                      evento.stopPropagation();
                      ajustarAoConteudo([header.column.id]);
                    }}
                    onClick={(evento) => evento.stopPropagation()}
                    onKeyDown={(evento) => aoTeclarNaAlca(evento, header.column)}
                    className={cn(
                      // 12px de área de pega (`w-3`) montada SOBRE a divisória
                      // (`-right-1.5`): 6px de cada lado, com a linha que a pessoa
                      // mira no CENTRO da área, não na borda dela. É o mesmo
                      // conserto que a alça de ALTURA levou (`-bottom-1 h-2`)
                      // depois de escapar com 4px presos dentro da linha: mirando
                      // na linha, errar por 1px é o caso comum, não o raro. O que
                      // se VÊ continua fino, pelo gradiente de 40% a 60%.
                      "absolute top-0 h-full w-3 cursor-col-resize touch-none select-none",
                      "bg-linear-to-r from-transparent from-40% via-50% to-transparent to-60%",
                      // Foco de teclado precisa de marca própria: 2px de linha
                      // âmbar num vão de 12px ninguém acha na tela.
                      "focus-visible:outline-2 focus-visible:outline-ring",
                      // Na última coluna a alça fica DENTRO: transbordar ali sobra
                      // para fora da tabela e inventa 6px de rolagem horizontal.
                      header.column.id === idUltimaColuna
                        ? "right-0"
                        : "-right-1.5",
                      arrasteLargura?.idColuna === header.column.id
                        ? "via-faixa opacity-100"
                        : cn(
                            // Passar o mouse pelo cabeçalho já mostra onde ficam as
                            // divisórias (discreto), e a que está sob o mouse ou
                            // com foco de teclado acende em âmbar.
                            "via-border opacity-0 group-hover/cabecalho:opacity-100",
                            "hover:via-faixa focus-visible:via-faixa focus-visible:opacity-100",
                          ),
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
                  // Marca a coluna na célula: é por aqui que o "ajustar ao
                  // conteúdo" acha o que medir.
                  data-coluna={celula.column.id}
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
                      // O que o "ajustar ao conteúdo" mede nesta coluna.
                      data-medir
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
      ref={refTabela}
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

  /**
   * Linha guia do arraste de largura: desce a tabela inteira mostrando onde a
   * divisória vai cair, com a largura em px na etiqueta. É o retorno que faltava
   * (antes só a tira de 6px pintava de âmbar) e o mesmo que a alça de ALTURA já
   * dava, para o app não ter dois pesos.
   *
   * `left`, `height`, o texto da etiqueta e o `top` dela são escritos pelo GESTO,
   * direto no DOM: é o que mantém o gesto sem re-renderizar a tabela. A guia sai da
   * borda MEDIDA da `th` e a etiqueta gruda no cabeçalho que está à vista (ver
   * medirNaTela). Nasce com altura 0 para não piscar no lugar errado antes do
   * primeiro desenho (o gesto começa antes de ela existir, então quem a posiciona
   * na montagem é o efeito que chama `redesenhar`). Não rouba
   * gesto de ninguém (nem da alça de altura, que fica na borda de baixo da linha)
   * porque é `pointer-events-none`.
   */
  const guiaLargura =
    arrasteLargura !== null ? (
      <div
        ref={refGuia}
        aria-hidden="true"
        // Marca para o teste achar a guia e a etiqueta: linha guia não tem papel
        // acessível nenhum (é decoração do gesto, por isso `aria-hidden`), então
        // não há role nem nome por onde pegá-la.
        data-guia="largura"
        style={{ left: 0, height: 0 }}
        className="pointer-events-none absolute top-0 z-30 w-px bg-faixa"
      >
        <span
          ref={refRotuloGuia}
          data-guia="rotulo"
          // `top-1` é só o lugar de partida: o efeito roda depois da pintura e é
          // ele que gruda a etiqueta embaixo do cabeçalho visível. Sem isto a
          // etiqueta apareceria um quadro no topo da tabela.
          className="absolute top-1 left-1 rounded bg-foreground px-1.5 py-0.5 text-legenda font-medium whitespace-nowrap text-background tabular-nums"
        />
      </div>
    ) : null;

  return (
    <div
      className={cn(
        "flex flex-col gap-2",
        // Enquanto arrasta, o cursor não muda de cara ao sair da alça e o texto da
        // tabela não é selecionado sem querer.
        arrasteAltura !== null && "cursor-row-resize select-none",
        arrasteLargura !== null && "cursor-col-resize select-none",
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
                onAjustarLarguras={ajustarTodasAoConteudo}
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
        // `relative` é o que dá à linha guia do arraste um lugar de onde sair (a
        // guia mede em px a partir da borda esquerda da tabela).
        <div
          className="relative overflow-auto rounded-md border border-border"
          style={{ maxHeight: alturaMaxima ?? ALTURA_MAXIMA_PADRAO }}
        >
          {tabela}
          {guiaLargura}
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <div data-slot="table-container" className="relative w-full overflow-x-auto">
            {tabela}
            {guiaLargura}
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
