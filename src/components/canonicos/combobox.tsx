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

/**
 * Largura que a linha gasta fora do texto do rótulo, em px.
 *
 * Conferido no painel aberto do filtro de centros: `px-2` da linha (16) +
 * `gap-2` até o ícone (8) + o ícone `size-4` (16) + `px-1` da área rolável (8)
 * + as duas bordas do popover (2) = 50, e num painel de 208px sobravam
 * exatamente 158px de rótulo. Os outros 16 são folga para a barra de rolagem:
 * no macOS ela é sobreposta e mede 0, mas em Windows ocupa espaço e sem a folga
 * o rótulo mais longo voltaria a cortar por alguns pixels só lá.
 */
const LARGURA_FORA_DO_ROTULO = 66;

/**
 * Teto do painel, em px (48rem).
 *
 * O painel não tem por que seguir a largura do gatilho. Em filtro o gatilho é
 * um trilho de 13rem (`TRILHO_FILTRO`), medida da BARRA e não do conteúdo — ela
 * existe para as linhas de filtro caírem no prumo, e era ela que cortava 15 das
 * 20 linhas visíveis do filtro de centros de custo.
 *
 * O teto sai da medição, não de gosto: o rótulo mais longo daquela lista é
 * "Manutenção/Documentação de Equipamentos › Carga Semi-Reboque SR/GUERRA BASC
 * B2T093 - 03" (87 caracteres), que mede 682px em Inter 14px e pede 748px de
 * painel. 768 cobre ele e ainda sobra.
 *
 * E o teto precisa existir porque a lista mais longa do app não é essa: insumo
 * tem 3.389 opções com cauda de 254 caracteres (o nome SINAPI inteiro), que
 * pediria quase 2.000px e viraria uma faixa atravessando a tela. Lá o rótulo
 * continua cortando, só que depois de 48rem em vez de 13.
 */
const LARGURA_MAX_PAINEL = 768;

const CLASSE_LINHA =
  "flex cursor-pointer items-center gap-2 overflow-hidden rounded-sm px-2 text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground data-[destacado=true]:bg-accent data-[destacado=true]:text-accent-foreground aria-disabled:pointer-events-none aria-disabled:opacity-50";

export interface ComboboxOpcao {
  valor: string;
  rotulo: string;
}

/** O que aparece no lugar de um id que não tem nome nenhum para mostrar. */
export const ROTULO_VALOR_ORFAO = "Registro não encontrado";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Rótulo de um valor que não está em `opcoes` e nem veio com nome.
 *
 * Valor de texto (filtro que veio da URL, texto livre antigo) aparece como é: ali
 * o próprio valor é legível e informa. UUID, não — id de chave estrangeira na
 * tela é ruído que parece defeito, e foi exatamente o que apareceu na ordem de
 * compra quando a condição de pagamento dela foi inativada. Nesse caso o
 * componente diz que não achou, em vez de despejar o id.
 */
export function rotuloOrfao(valor: string): string {
  return UUID.test(valor) ? ROTULO_VALOR_ORFAO : valor;
}

/**
 * Régua de texto, criada uma vez e reaproveitada. Canvas mede SEM tocar no DOM
 * — nada de reflow — então medir os 3.389 rótulos de insumo custa poucos
 * milissegundos, e só na abertura do painel.
 *
 * `undefined` = ainda não tentou; `null` = ambiente sem canvas (o jsdom dos
 * testes), e aí o painel volta a valer a largura do gatilho, como antes.
 */
let regua: CanvasRenderingContext2D | null | undefined;

function obterRegua(): CanvasRenderingContext2D | null {
  if (regua === undefined) {
    try {
      regua = document.createElement("canvas").getContext("2d");
    } catch {
      regua = null;
    }
  }
  return regua;
}

/**
 * Largura de painel que faz o rótulo mais longo caber inteiro, já limitada pelo
 * teto. Volta null quando não dá para medir; quem chama trata como "sem
 * opinião" e deixa o CSS decidir.
 *
 * A fonte sai do próprio gatilho, que é `text-sm` como a linha da lista e herda
 * a mesma família. O peso vai fixo em 500 porque a linha SELECIONADA é
 * `font-medium`: é ela a mais larga, e medir com o peso normal deixaria
 * justamente o rótulo escolhido cortando.
 */
function medirLarguraDoPainel(
  opcoes: ComboboxOpcao[],
  gatilho: HTMLElement | null,
): number | null {
  const ctx = obterRegua();
  if (!ctx || !gatilho || opcoes.length === 0) return null;
  const estilo = window.getComputedStyle(gatilho);
  if (!estilo.fontSize) return null;
  ctx.font = `500 ${estilo.fontSize} ${estilo.fontFamily}`;
  let maiorRotulo = 0;
  for (const opcao of opcoes) {
    const largura = ctx.measureText(opcao.rotulo).width;
    if (largura > maiorRotulo) maiorRotulo = largura;
  }
  return Math.min(
    Math.ceil(maiorRotulo) + LARGURA_FORA_DO_ROTULO,
    LARGURA_MAX_PAINEL,
  );
}

export interface ComboboxProps {
  /**
   * Valor atual (o `valor` da opção selecionada). "" quando nada selecionado.
   *
   * No modo múltiplo (ver `valores`) este campo é ignorado; passe "".
   */
  valor: string;
  onValorChange: (valor: string) => void;
  /**
   * Liga o modo MÚLTIPLO: a lista marca com caixinha, escolher não fecha o
   * painel e o gatilho passa a contar quantos estão marcados.
   *
   * Opcional de propósito. Sem estas duas props o componente se comporta
   * exatamente como sempre se comportou (é usado em 45 arquivos), e o caminho de
   * valor único nem passa pelo código novo.
   */
  valores?: string[];
  onValoresChange?: (valores: string[]) => void;
  opcoes: ComboboxOpcao[];
  /**
   * Nome do valor atual, para quando ele NÃO está em `opcoes` — cadastro que foi
   * inativado depois de usado, ou que o usuário não tem permissão de listar.
   *
   * Quem chama normalmente tem esse nome à mão (o próprio documento já traz o
   * fornecedor, o centro de custo, o insumo resolvidos). Sem ele, o componente
   * não tem como adivinhar e mostra `ROTULO_VALOR_ORFAO` em vez do id cru.
   */
  rotuloDoValor?: string;
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
  valores,
  onValoresChange,
  opcoes,
  rotuloDoValor,
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

  /** Modo múltiplo é ligado por passar as duas props do plural. */
  const multi = valores !== undefined && onValoresChange !== undefined;
  const selecionados = React.useMemo(
    () => new Set(multi ? valores : []),
    [multi, valores],
  );

  // opcoes + criadas locais + garante o(s) valor(es) atual(is) na lista, para
  // seleção que veio de link ou de cadastro fora da lista não sumir da tela.
  const todasOpcoes = React.useMemo(() => {
    const base = [...opcoes];
    for (const criada of criadas) {
      if (!base.some((o) => o.valor === criada.valor)) base.push(criada);
    }
    if (multi) {
      const faltando = [...selecionados].filter(
        (escolhido) => !base.some((o) => o.valor === escolhido),
      );
      return faltando.length > 0
        ? [...faltando.map((v) => ({ valor: v, rotulo: rotuloOrfao(v) })), ...base]
        : base;
    }
    if (valor && !base.some((o) => o.valor === valor)) {
      return [{ valor, rotulo: rotuloDoValor?.trim() || rotuloOrfao(valor) }, ...base];
    }
    return base;
  }, [valor, rotuloDoValor, opcoes, criadas, multi, selecionados]);

  /**
   * Texto do gatilho. No múltiplo, um escolhido mostra o nome (é o caso comum e
   * o nome informa mais que "1 selecionado"); daí para cima mostra a contagem,
   * porque três nomes longos não cabem no botão.
   */
  const rotuloSelecionado = React.useMemo(() => {
    if (!multi) return todasOpcoes.find((o) => o.valor === valor)?.rotulo ?? "";
    if (selecionados.size === 0) return "";
    if (selecionados.size === 1) {
      const unico = [...selecionados][0];
      return todasOpcoes.find((o) => o.valor === unico)?.rotulo ?? rotuloOrfao(unico);
    }
    return `${selecionados.size} selecionados`;
  }, [multi, todasOpcoes, valor, selecionados]);

  /**
   * Largura que o painel precisa para mostrar o rótulo inteiro, medida na
   * ABERTURA (ver o `onOpenChange` lá embaixo). Combobox fechado não paga a
   * conta, e são 45 arquivos usando este componente.
   *
   * `null` = não deu para medir; aí o painel fica com a largura do gatilho,
   * como sempre foi.
   */
  const [larguraPainel, setLarguraPainel] = React.useState<number | null>(null);

  const selecionar = React.useCallback(
    (novoValor: string) => {
      onValorChange(novoValor);
      setAberto(false);
    },
    [onValorChange],
  );

  /**
   * Marca ou desmarca no modo múltiplo, SEM fechar o painel: marcar cinco
   * fornecedores não pode custar cinco aberturas. Valor vazio limpa tudo, que é
   * o que a ação "Limpar seleção" do rodapé faz.
   */
  const alternar = React.useCallback(
    (alvo: string) => {
      if (!onValoresChange) return;
      if (alvo === "") {
        onValoresChange([]);
        return;
      }
      const atuais = valores ?? [];
      onValoresChange(
        atuais.includes(alvo)
          ? atuais.filter((item) => item !== alvo)
          : [...atuais, alvo],
      );
    },
    [onValoresChange, valores],
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
          // A largura é medida AQUI, junto com o container, e não durante a
          // renderização: ler ref enquanto renderiza é proibido (o compilador
          // do React reclama, com razão). Medindo no evento, o valor já está no
          // estado quando o painel monta — ele nunca chega a pintar estreito
          // para depois esticar.
          //
          // O gatilho é a fonte da fonte, e é o `<button>` de dentro do âncora
          // que interessa: é ele que carrega o `text-sm`. O âncora é um
          // `display: contents` e devolveria o tamanho de fonte do pai.
          setLarguraPainel(
            medirLarguraDoPainel(
              todasOpcoes,
              anchorRef.current?.querySelector("button") ?? null,
            ),
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
            // O botão continua sendo a largura que o host mandou (em filtro, um
            // trilho), então rótulo longo segue cortando AQUI de propósito. O
            // `title` é a saída para ler o escolhido por inteiro sem abrir a
            // lista. Não mexe no nome acessível: o botão já tem texto e
            // `aria-label`, que ganham do `title`.
            title={rotuloSelecionado || undefined}
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
        // A classe é o piso de sempre, e continua valendo sozinha quando não dá
        // para medir (jsdom). Quando dá, o `style` abaixo manda nela.
        className="w-(--radix-popover-trigger-width) min-w-[12rem] p-0"
        align="start"
        style={
          larguraPainel
            ? {
                // `max` com a largura do gatilho: o painel CRESCE para o rótulo
                // caber, mas nunca fica mais estreito que o botão que o abriu.
                // `min` com o espaço que sobra até a borda da janela: perto dela
                // o painel encolhe em vez de sair da tela — mesma ideia do teto
                // de altura logo abaixo, na área rolável.
                width: `max(var(--radix-popover-trigger-width), min(${larguraPainel}px, var(--radix-popover-content-available-width, ${larguraPainel}px)))`,
              }
            : undefined
        }
      >
        {/* O painel monta a cada abertura (o Radix desmonta o conteúdo ao
            fechar), então busca e destaque nascem limpos sem efeito de reset. */}
        <PainelOpcoes
          todasOpcoes={todasOpcoes}
          valor={valor}
          multi={multi}
          selecionados={selecionados}
          buscaPlaceholder={buscaPlaceholder}
          vazioTexto={vazioTexto}
          // No múltiplo a limpeza sempre faz sentido quando há algo marcado, sem
          // depender do `limpavel` (que existe para campo opcional de formulário).
          limpavel={multi ? selecionados.size > 0 : limpavel}
          podeCriarOpcao={Boolean(onCriar)}
          criando={criando}
          onSelecionar={multi ? alternar : selecionar}
          onCriar={criar}
        />
      </PopoverContent>
    </Popover>
  );
}

interface PainelOpcoesProps {
  todasOpcoes: ComboboxOpcao[];
  valor: string;
  multi: boolean;
  selecionados: ReadonlySet<string>;
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
  multi,
  selecionados,
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

  /**
   * Quem já estava marcado QUANDO O PAINEL ABRIU, congelado.
   *
   * É o que permite mostrar os escolhidos no topo sem a lista se reorganizar
   * embaixo do cursor a cada clique. Reordenar ao vivo seria o pior dos mundos
   * aqui: é exatamente o defeito que a virtualização deste componente foi feita
   * para evitar (a linha troca entre apertar e soltar o mouse, e o clique cai no
   * vizinho). O painel remonta a cada abertura, então na próxima vez a ordem já
   * reflete a escolha nova.
   */
  const marcadosAoAbrir = React.useRef(selecionados);

  const opcoesOrdenadas = React.useMemo(() => {
    if (!multi || marcadosAoAbrir.current.size === 0) return todasOpcoes;
    const escolhidas: ComboboxOpcao[] = [];
    const resto: ComboboxOpcao[] = [];
    for (const opcao of todasOpcoes) {
      (marcadosAoAbrir.current.has(opcao.valor) ? escolhidas : resto).push(opcao);
    }
    return [...escolhidas, ...resto];
  }, [multi, todasOpcoes]);

  const opcoesFiltradas = React.useMemo(
    () =>
      termo
        ? opcoesOrdenadas.filter((o) => o.rotulo.toLowerCase().includes(termo))
        : opcoesOrdenadas,
    [opcoesOrdenadas, termo],
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
    if (limpavel && (multi || valor)) lista.push({ tipo: "limpar" });
    return lista;
  }, [podeCriar, buscaLimpa, limpavel, valor, multi]);

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
    // No múltiplo os marcados já estão no topo, então não há para onde rolar.
    if (multi || !valor) return;
    const indice = opcoesFiltradas.findIndex((o) => o.valor === valor);
    if (indice > 0) {
      setIndiceDestacado(indice);
      virtualizador.scrollToIndex(indice, { align: "center" });
    }
  }, [valor, multi, opcoesFiltradas, virtualizador]);

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
                const selecionada = multi
                  ? selecionados.has(opcao.valor)
                  : opcao.valor === valor;
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
                    {multi ? (
                      // Caixinha de verdade: no múltiplo o usuário precisa ver o
                      // que NÃO está marcado, e um check invisível não comunica
                      // que a linha é marcável.
                      <span
                        aria-hidden
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
                          selecionada
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-input",
                        )}
                      >
                        {selecionada ? <Check className="size-3" /> : null}
                      </span>
                    ) : (
                      <Check
                        className={cn(
                          "size-4 shrink-0",
                          selecionada ? "opacity-100" : "opacity-0",
                        )}
                      />
                    )}
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
                  <span className="truncate">
                    {multi ? "Limpar seleção (todos)" : "Limpar seleção"}
                  </span>
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
