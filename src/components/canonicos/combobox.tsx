"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Plus, SearchIcon, X } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Altura fixa de cada linha, em px. Fixa de propósito: com medida constante o
 * virtualizador calcula janela e altura total sem medir o DOM, e a linha nunca
 * muda de tamanho embaixo do cursor. O rótulo é sempre uma linha só (truncate).
 */
const ALTURA_LINHA = 32;
/** Respiro no topo e no fim da área rolável, contabilizado no total do scroll. */
const RESPIRO_LISTA = 4;
/** Linhas desenhadas fora da janela visível, para não aparecer branco ao rolar. */
const LINHAS_EXTRAS = 10;
/** Altura máxima da área rolável, em px (o popover pode reduzir isso). */
const ALTURA_MAX_LISTA = 300;
/** Acima disso o rodapé mostra a contagem: em lista curta é ruído. */
const MINIMO_PARA_CONTAGEM = 30;

const CLASSE_LINHA =
  "flex cursor-pointer items-center gap-2 overflow-hidden rounded-sm px-2 text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground data-[destacado=true]:bg-accent data-[destacado=true]:text-accent-foreground aria-disabled:pointer-events-none aria-disabled:opacity-50";

export interface ComboboxOpcao {
  valor: string;
  rotulo: string;
}

export interface ComboboxProps {
  /** Valor atual (o `valor` da opção selecionada). "" quando nada selecionado. */
  valor: string;
  onValorChange: (valor: string) => void;
  opcoes: ComboboxOpcao[];
  /**
   * Quando presente, permite criar uma opção a partir do texto digitado que não
   * existe na lista. Retorna o `valor` criado (para selecionar) ou null se falhou.
   */
  onCriar?: (texto: string) => Promise<string | null>;
  /** Mostra "Limpar seleção" quando há valor (campos opcionais). */
  limpavel?: boolean;
  placeholder?: string;
  buscaPlaceholder?: string;
  vazioTexto?: string;
  disabled?: boolean;
  id?: string;
  size?: "sm" | "default";
  /** Classe extra no gatilho (ex: largura compacta em filtros). */
  className?: string;
  /** Rótulo acessível quando o gatilho não tem um <label> associado. */
  ariaLabel?: string;
}

/** Linhas de ação que ficam fixas no pé do painel, fora da área rolável. */
type Acao = { tipo: "criar"; texto: string } | { tipo: "limpar" };

/**
 * Combobox canônico: dropdown com busca por texto sobre opções {valor, rótulo}.
 * A lista mostra TODAS as opções, roláveis, com virtualização (só as linhas
 * visíveis existem no DOM). Filtro feito à mão para conviver com "Criar" e
 * "Limpar". O valor atual sempre aparece na lista mesmo que não esteja em
 * `opcoes` (preserva textos livres antigos e ids órfãos).
 */
export function Combobox({
  valor,
  onValorChange,
  opcoes,
  onCriar,
  limpavel = false,
  placeholder = "Selecione",
  buscaPlaceholder = "Buscar ou digitar",
  vazioTexto = "Nada encontrado",
  disabled,
  id,
  size = "default",
  className,
  ariaLabel,
}: ComboboxProps) {
  const [aberto, setAberto] = React.useState(false);
  const [criando, setCriando] = React.useState(false);
  // Ancora para descobrir, ao abrir, se estamos dentro de um dialog/drawer.
  // Nesse caso o conteúdo é portalado PARA DENTRO do dialog, senão o scroll-lock
  // do Radix Dialog (react-remove-scroll) bloqueia a rolagem da lista, que fica
  // portalada no body, fora do limite dele. Fora de dialog, `container` fica
  // null e o portal cai no body (padrão): a lista já rola normalmente ali.
  const anchorRef = React.useRef<HTMLSpanElement>(null);
  const [container, setContainer] = React.useState<HTMLElement | null>(null);
  // Opções criadas inline nesta sessão (id -> rótulo digitado), para o nome
  // aparecer na hora sem esperar o `opcoes` do servidor recarregar.
  const [criadas, setCriadas] = React.useState<ComboboxOpcao[]>([]);

  // opcoes + criadas locais + garante o valor atual na lista (fallback ao id).
  const todasOpcoes = React.useMemo(() => {
    const base = [...opcoes];
    for (const criada of criadas) {
      if (!base.some((o) => o.valor === criada.valor)) base.push(criada);
    }
    if (valor && !base.some((o) => o.valor === valor)) {
      return [{ valor, rotulo: valor }, ...base];
    }
    return base;
  }, [valor, opcoes, criadas]);

  const rotuloSelecionado =
    todasOpcoes.find((o) => o.valor === valor)?.rotulo ?? "";

  const selecionar = React.useCallback(
    (novoValor: string) => {
      onValorChange(novoValor);
      setAberto(false);
    },
    [onValorChange],
  );

  const criar = React.useCallback(
    async (rotulo: string) => {
      if (!onCriar || criando) return;
      setCriando(true);
      try {
        const criado = await onCriar(rotulo);
        if (criado) {
          setCriadas((prev) =>
            prev.some((o) => o.valor === criado)
              ? prev
              : [...prev, { valor: criado, rotulo }],
          );
          selecionar(criado);
        }
      } finally {
        setCriando(false);
      }
    },
    [onCriar, criando, selecionar],
  );

  return (
    <Popover
      open={aberto}
      onOpenChange={(estado) => {
        // Ao abrir, resolve o dialog/drawer ancestral (se houver) para portalar
        // o conteúdo dentro dele e a lista poder rolar.
        if (estado) {
          setContainer(
            anchorRef.current?.closest<HTMLElement>(
              '[role="dialog"],[role="alertdialog"]',
            ) ?? null,
          );
        }
        setAberto(estado);
      }}
    >
      <span ref={anchorRef} className="contents">
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size={size === "sm" ? "sm" : "default"}
            role="combobox"
            aria-expanded={aberto}
            aria-label={ariaLabel}
            disabled={disabled}
            id={id}
            className={cn("w-full justify-between font-normal", className)}
          >
            <span
              className={cn("truncate", !rotuloSelecionado && "text-muted-foreground")}
            >
              {rotuloSelecionado || placeholder}
            </span>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
      </span>
      <PopoverContent
        container={container}
        className="w-(--radix-popover-trigger-width) min-w-[12rem] p-0"
        align="start"
      >
        {/* O painel monta a cada abertura (o Radix desmonta o conteúdo ao
            fechar), então busca e destaque nascem limpos sem efeito de reset. */}
        <PainelOpcoes
          todasOpcoes={todasOpcoes}
          valor={valor}
          buscaPlaceholder={buscaPlaceholder}
          vazioTexto={vazioTexto}
          limpavel={limpavel}
          podeCriarOpcao={Boolean(onCriar)}
          criando={criando}
          onSelecionar={selecionar}
          onCriar={criar}
        />
      </PopoverContent>
    </Popover>
  );
}

interface PainelOpcoesProps {
  todasOpcoes: ComboboxOpcao[];
  valor: string;
  buscaPlaceholder: string;
  vazioTexto: string;
  limpavel: boolean;
  podeCriarOpcao: boolean;
  criando: boolean;
  onSelecionar: (valor: string) => void;
  onCriar: (texto: string) => Promise<void>;
}

/**
 * Corpo do dropdown: campo de busca + lista virtualizada + ações fixas no pé.
 *
 * Por que virtualizar e por que o destaque é nosso, não do cmdk:
 * 1. Cadastros grandes do ERP (3 mil insumos, 600 fornecedores) travavam a
 *    lista quando tudo ia pro DOM. Aqui só as linhas visíveis existem, e a
 *    altura total do container mantém o scroll do tamanho do conjunto inteiro.
 * 2. O bug antigo era pior que lentidão: um re-render entre apertar e soltar o
 *    mouse trocava o item embaixo do cursor e o clique selecionava o vizinho.
 *    Três garantias contra isso: (a) o destaque de mouse é CSS `hover` puro,
 *    nenhum estado muda ao mover o cursor, então não há re-render durante o
 *    clique; (b) cada linha é chaveada pelo `valor` da opção, então o React
 *    nunca reaproveita o nó DOM de uma opção para outra; (c) a seleção sai do
 *    `onClick` da própria linha, com a opção capturada no closure, nunca de um
 *    índice que pode ter mudado de posição.
 * 3. O cmdk registra os itens pelo DOM e navegaria só pela janela renderizada,
 *    então o índice destacado é estado nosso e as setas percorrem a lista toda.
 */
function PainelOpcoes({
  todasOpcoes,
  valor,
  buscaPlaceholder,
  vazioTexto,
  limpavel,
  podeCriarOpcao,
  criando,
  onSelecionar,
  onCriar,
}: PainelOpcoesProps) {
  const [busca, setBusca] = React.useState("");
  const [indiceDestacado, setIndiceDestacado] = React.useState(0);
  const areaRolagemRef = React.useRef<HTMLDivElement>(null);
  const idPainel = React.useId();

  const buscaLimpa = busca.trim();
  const termo = buscaLimpa.toLowerCase();

  const opcoesFiltradas = React.useMemo(
    () =>
      termo
        ? todasOpcoes.filter((o) => o.rotulo.toLowerCase().includes(termo))
        : todasOpcoes,
    [todasOpcoes, termo],
  );

  const existeExata = React.useMemo(
    () => todasOpcoes.some((o) => o.rotulo.toLowerCase() === termo),
    [todasOpcoes, termo],
  );
  const podeCriar = podeCriarOpcao && buscaLimpa.length > 0 && !existeExata;
  const semResultado = opcoesFiltradas.length === 0 && !podeCriar;

  const acoes = React.useMemo<Acao[]>(() => {
    const lista: Acao[] = [];
    if (podeCriar) lista.push({ tipo: "criar", texto: buscaLimpa });
    if (limpavel && valor) lista.push({ tipo: "limpar" });
    return lista;
  }, [podeCriar, buscaLimpa, limpavel, valor]);

  // Espaço de navegação: as opções primeiro, as ações depois. As ações moram
  // num rodapé fixo (sempre clicáveis, sem precisar rolar 3 mil linhas) mas
  // continuam no mesmo índice do teclado.
  const totalNavegavel = opcoesFiltradas.length + acoes.length;
  const indiceAtivo =
    totalNavegavel === 0 ? -1 : Math.min(indiceDestacado, totalNavegavel - 1);

  const virtualizador = useVirtualizer({
    count: opcoesFiltradas.length,
    getScrollElement: () => areaRolagemRef.current,
    estimateSize: () => ALTURA_LINHA,
    overscan: LINHAS_EXTRAS,
    paddingStart: RESPIRO_LISTA,
    paddingEnd: RESPIRO_LISTA,
    // Chave estável por opção: é o que impede o nó DOM de uma linha ser
    // reaproveitado para outra opção quando a janela desliza.
    getItemKey: (indice) => opcoesFiltradas[indice]?.valor ?? indice,
  });

  // Ao abrir, começa no item já selecionado: em cadastro de 3 mil linhas o
  // usuário precisa ver onde está, não o começo do alfabeto.
  const jaAlinhou = React.useRef(false);
  React.useEffect(() => {
    if (jaAlinhou.current) return;
    jaAlinhou.current = true;
    if (!valor) return;
    const indice = opcoesFiltradas.findIndex((o) => o.valor === valor);
    if (indice > 0) {
      setIndiceDestacado(indice);
      virtualizador.scrollToIndex(indice, { align: "center" });
    }
  }, [valor, opcoesFiltradas, virtualizador]);

  const moverDestaque = React.useCallback(
    (destino: number) => {
      if (totalNavegavel === 0) return;
      // Circular: da última linha volta para a primeira, como o dropdown antigo.
      const indice = ((destino % totalNavegavel) + totalNavegavel) % totalNavegavel;
      setIndiceDestacado(indice);
      if (indice < opcoesFiltradas.length) {
        virtualizador.scrollToIndex(indice, { align: "auto" });
      }
    },
    [totalNavegavel, opcoesFiltradas.length, virtualizador],
  );

  const acionar = React.useCallback(
    (indice: number) => {
      if (indice < 0) return;
      const opcao = opcoesFiltradas[indice];
      if (opcao) {
        onSelecionar(opcao.valor);
        return;
      }
      const acao = acoes[indice - opcoesFiltradas.length];
      if (!acao) return;
      if (acao.tipo === "criar") void onCriar(acao.texto);
      else onSelecionar("");
    },
    [opcoesFiltradas, acoes, onSelecionar, onCriar],
  );

  function aoTeclar(evento: React.KeyboardEvent<HTMLDivElement>) {
    switch (evento.key) {
      case "ArrowDown":
        evento.preventDefault();
        moverDestaque(indiceAtivo + 1);
        break;
      case "ArrowUp":
        evento.preventDefault();
        moverDestaque(indiceAtivo - 1);
        break;
      case "PageDown":
        evento.preventDefault();
        moverDestaque(Math.min(indiceAtivo + 10, totalNavegavel - 1));
        break;
      case "PageUp":
        evento.preventDefault();
        moverDestaque(Math.max(indiceAtivo - 10, 0));
        break;
      case "Enter":
        // preventDefault sempre: sem isso o Enter submete o formulário do drawer.
        evento.preventDefault();
        acionar(indiceAtivo);
        break;
      default:
        break;
    }
    // Escape não é tratado aqui de propósito: quem fecha é o Radix Popover.
  }

  const contagemTotal = todasOpcoes.length;
  const mostrarContagem = contagemTotal >= MINIMO_PARA_CONTAGEM;
  const textoContagem = termo
    ? `${opcoesFiltradas.length.toLocaleString("pt-BR")} de ${contagemTotal.toLocaleString("pt-BR")} opções`
    : `${contagemTotal.toLocaleString("pt-BR")} opções. Digite para filtrar.`;

  return (
    <div
      className="flex flex-col overflow-hidden rounded-md bg-popover text-popover-foreground"
      onKeyDown={aoTeclar}
    >
      <div className="flex h-9 items-center gap-2 border-b border-border px-3">
        <SearchIcon className="size-4 shrink-0 opacity-50" />
        <input
          type="text"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          aria-autocomplete="list"
          aria-controls={`${idPainel}-lista`}
          aria-activedescendant={
            indiceAtivo >= 0 ? `${idPainel}-linha-${indiceAtivo}` : undefined
          }
          placeholder={buscaPlaceholder}
          value={busca}
          onChange={(evento) => {
            setBusca(evento.target.value);
            // Texto novo, destaque volta pro primeiro resultado.
            setIndiceDestacado(0);
          }}
          className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden placeholder:text-muted-foreground"
        />
      </div>

      <div role="listbox" id={`${idPainel}-lista`} aria-label={buscaPlaceholder}>
        {semResultado ? (
          <div className="py-6 text-center text-detalhe text-muted-foreground">
            {vazioTexto}
          </div>
        ) : null}

        {opcoesFiltradas.length > 0 ? (
          <div
            ref={areaRolagemRef}
            data-testid="combobox-area-rolagem"
            className="overflow-x-hidden overflow-y-auto px-1"
            style={{
              maxHeight: `min(${ALTURA_MAX_LISTA}px, var(--radix-popover-content-available-height, ${ALTURA_MAX_LISTA}px))`,
            }}
          >
            {/* Altura do conjunto TODO: é o que dá ao scroll o tamanho real. */}
            <div
              data-testid="combobox-espacador"
              className="relative w-full"
              style={{ height: virtualizador.getTotalSize() }}
            >
              {virtualizador.getVirtualItems().map((linha) => {
                const opcao = opcoesFiltradas[linha.index];
                if (!opcao) return null;
                const selecionada = opcao.valor === valor;
                return (
                  <div
                    key={linha.key}
                    id={`${idPainel}-linha-${linha.index}`}
                    role="option"
                    aria-selected={selecionada}
                    data-destacado={linha.index === indiceAtivo}
                    className={cn(
                      CLASSE_LINHA,
                      "absolute top-0 left-0 w-full",
                      selecionada && "font-medium text-accent-foreground",
                    )}
                    style={{
                      height: linha.size,
                      transform: `translateY(${linha.start}px)`,
                    }}
                    // Mantém o foco no campo de busca: clicar numa linha não
                    // deve tirar o teclado do input nem rolar a lista.
                    onMouseDown={(evento) => evento.preventDefault()}
                    onClick={() => onSelecionar(opcao.valor)}
                  >
                    <Check
                      className={cn(
                        "size-4 shrink-0",
                        selecionada ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="truncate">{opcao.rotulo}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {acoes.length > 0 ? (
          <div className="border-t border-border p-1">
            {acoes.map((acao, posicao) => {
              const indice = opcoesFiltradas.length + posicao;
              const destacada = indice === indiceAtivo;
              if (acao.tipo === "criar") {
                return (
                  <div
                    key="acao-criar"
                    id={`${idPainel}-linha-${indice}`}
                    role="option"
                    aria-selected={false}
                    aria-disabled={criando || undefined}
                    data-destacado={destacada}
                    className={CLASSE_LINHA}
                    style={{ height: ALTURA_LINHA }}
                    onMouseDown={(evento) => evento.preventDefault()}
                    onClick={() => void onCriar(acao.texto)}
                  >
                    <Plus className="size-4 shrink-0" />
                    <span className="truncate">{`Criar "${acao.texto}"`}</span>
                  </div>
                );
              }
              return (
                <div
                  key="acao-limpar"
                  id={`${idPainel}-linha-${indice}`}
                  role="option"
                  aria-selected={false}
                  data-destacado={destacada}
                  className={CLASSE_LINHA}
                  style={{ height: ALTURA_LINHA }}
                  onMouseDown={(evento) => evento.preventDefault()}
                  onClick={() => onSelecionar("")}
                >
                  <X className="size-4 shrink-0 opacity-50" />
                  <span className="truncate">Limpar seleção</span>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      {podeCriarOpcao && buscaLimpa.length === 0 ? (
        <div className="flex items-center gap-2 border-t border-border px-3 py-2 text-legenda text-muted-foreground">
          <Plus className="size-3.5 shrink-0" />
          Digite um nome novo e toque em &quot;Criar&quot; para adicionar.
        </div>
      ) : mostrarContagem ? (
        <div className="border-t border-border px-3 py-2 text-legenda text-muted-foreground">
          {textoContagem}
        </div>
      ) : null}
    </div>
  );
}
