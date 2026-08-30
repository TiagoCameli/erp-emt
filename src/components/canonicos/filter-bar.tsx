"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, FilterX, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/canonicos/combobox";
import { ReguaTempo } from "@/components/canonicos/regua-tempo";
import { resumoDoPeriodo } from "@/components/canonicos/regua-tempo-calculo";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { MenuFiltros } from "@/components/canonicos/menu-filtros";
import {
  limparFiltrosDaRota,
  salvarQuerySessao,
} from "@/components/canonicos/filtros-sessao";
import { toast } from "@/components/canonicos/toast";
import {
  escreverPreferenciasTabela,
  lerPreferenciasTabela,
  preferenciasVazias,
} from "@/components/canonicos/preferencias-tabela";
import {
  buscarPreferenciaTabela,
  limparPreferenciaTabela,
  salvarPreferenciaTabela,
} from "@/modules/_shared/preferencias-tabela/actions";
import { cn } from "@/lib/utils";

/** Sentinela interna do Radix Select para a opção "todos" (valor vazio é proibido). */
const VALOR_TODOS = "__todos__";

/**
 * Largura de um trilho de filtro. Todo filtro da barra ocupa um trilho ou dois,
 * nunca a largura do próprio conteúdo.
 *
 * Com `w-fit`, cada seletor nascia de um tamanho diferente ("Todos os tipos" ao
 * lado de "Todos os centros de custo") e a barra virava escada: nenhuma coluna
 * da segunda linha caía embaixo da coluna da primeira. Em trilhos, todo filtro
 * começa num múltiplo de trilho + `gap-2`, então as linhas se alinham sozinhas.
 *
 * 13rem é o que cabe o rótulo mais longo do app ("Todos os centros de custo",
 * 13px) sem cortar com reticência.
 */
export const TRILHO_FILTRO = "w-52";

/** Dois trilhos mais o `gap-2` entre eles, para o filtro largo cair no prumo. */
export const TRILHO_FILTRO_DUPLO = "w-[26.5rem]";

/**
 * Rótulo que o HOST da barra (DataTable ou BarraFiltrosConfiguravel) dá ao
 * filtro, tirado do `rotulo` que ele já exige para o menu "Filtros".
 *
 * Vem por contexto, e não por prop, porque o host recebe o filtro JÁ MONTADO
 * (`elemento: <FiltroSelect ... />`) e não tem como injetar prop em elemento
 * pronto. Assim os cinco filtros canônicos ganham rótulo em cima sem nenhuma
 * das 43 telas mudar uma linha, e elemento que não é canônico (um Switch com
 * Label próprio) simplesmente não lê o contexto e continua como estava.
 */
const ContextoRotuloFiltro = React.createContext<string | null>(null);

interface FilterBarProps {
  children: React.ReactNode;
  className?: string;
}

/** Contêiner horizontal de filtros persistentes de uma listagem. */
export function FilterBar({ children, className }: FilterBarProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 py-2", className)}>
      {children}
    </div>
  );
}

interface FiltroBuscaProps {
  valor: string;
  onValorChange: (valor: string) => void;
  placeholder?: string;
}

/**
 * Casca de um filtro na barra: rótulo em cima, controle embaixo, largura em
 * trilhos.
 *
 * O rótulo em cima resolve duas coisas de uma vez. Primeira: o seletor dizia o
 * nome da dimensão no lugar do valor ("Todos os status"), então filtro
 * PREENCHIDO passava a dizer só "A pagar", sem nenhuma pista de que aquilo era
 * status. Segunda: data, mês e faixa punham o nome numa palavra cinza SOLTA à
 * esquerda do campo, enquanto o seletor punha dentro, e a mesma barra ficava com
 * dois idiomas de rotulagem.
 *
 * Sem host que forneça rótulo (contexto vazio) a casca some e sobra só o
 * controle, que é o que o filtro não canônico continua fazendo.
 */
function CampoFiltro({
  largura,
  children,
}: {
  largura: string;
  children: React.ReactNode;
}) {
  const rotulo = React.useContext(ContextoRotuloFiltro);
  return (
    <div className={cn("flex max-w-full min-w-0 flex-col gap-1", largura)}>
      {rotulo === null ? null : (
        <span className="truncate text-legenda leading-none tracking-wide text-muted-foreground uppercase">
          {rotulo}
        </span>
      )}
      {children}
    </div>
  );
}

/**
 * Campo de busca textual da barra.
 *
 * Dois trilhos porque um só cortava o próprio placeholder: "Buscar por número ou
 * descrição" pede 14rem de texto e o campo tinha 16rem contando o ícone.
 */
export function FiltroBusca({
  valor,
  onValorChange,
  placeholder = "Buscar",
}: FiltroBuscaProps) {
  return (
    <CampoFiltro largura={TRILHO_FILTRO_DUPLO}>
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          value={valor}
          onChange={(evento) => onValorChange(evento.target.value)}
          placeholder={placeholder}
          className="h-8 pl-8 text-detalhe"
        />
      </div>
    </CampoFiltro>
  );
}

/** Um filtro pronto para a barra: o que o host precisa para montar a casca. */
export interface CampoDaBarra {
  /** Identificador estável, só para a chave da lista. */
  id: string;
  /** Vira o rótulo em cima do controle, via `ContextoRotuloFiltro`. */
  rotulo: string;
  elemento: React.ReactNode;
}

/**
 * Layout canônico da barra de filtros: os filtros em cima, em trilhos, e as
 * ações numa linha só, embaixo.
 *
 * Existe como peça única porque os dois hosts de filtro do app (o `filtros` do
 * DataTable e a BarraFiltrosConfiguravel) desenhavam a mesma barra em dois
 * lugares, e barra igual em tela diferente é metade do que "harmonizado" quer
 * dizer.
 *
 * Por que as ações saem da fileira dos filtros: elas eram irmãs dos filtros num
 * `justify-between`, então "Filtros/Altura/Colunas" grudava no fim da PRIMEIRA
 * linha e os filtros iam quebrando por baixo delas. Em tela cheia de filtro
 * (Lançamentos tem dezesseis) sobrava um buraco no fim da última linha com três
 * botões pendurados acima dele. Agora cada coisa tem lugar fixo: filtro em cima,
 * "Limpar filtros" embaixo à esquerda (é ação sobre o filtro) e os menus de
 * vista embaixo à direita, colados na tabela que eles governam.
 */
export function BlocoFiltros({
  campos,
  acoesEsquerda,
  acoesDireita,
}: {
  campos: CampoDaBarra[];
  /** Ações sobre o filtro (limpar) e da tela (importar). `undefined` = nenhuma. */
  acoesEsquerda?: React.ReactNode;
  /** Menus de vista da tabela e exportação. `undefined` = nenhuma. */
  acoesDireita?: React.ReactNode;
}) {
  const temAcoes = acoesEsquerda !== undefined || acoesDireita !== undefined;
  return (
    <div className="flex flex-col gap-2">
      {campos.length > 0 ? (
        // `items-end` para o controle de todo filtro cair na mesma linha de base
        // mesmo quando o vizinho não tem rótulo em cima (filtro não canônico, que
        // não lê o contexto).
        <div className="flex flex-wrap items-end gap-2">
          {campos.map((campo) => (
            <ContextoRotuloFiltro.Provider key={campo.id} value={campo.rotulo}>
              {campo.elemento}
            </ContextoRotuloFiltro.Provider>
          ))}
        </div>
      ) : null}
      {temAcoes ? (
        <div className="flex flex-wrap items-center gap-2">
          {acoesEsquerda}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {acoesDireita}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export interface OpcaoFiltro {
  valor: string;
  rotulo: string;
}

interface FiltroSelectProps {
  valor: string;
  onValorChange: (valor: string) => void;
  opcoes: OpcaoFiltro[];
  placeholder?: string;
  todosRotulo?: string;
  /**
   * Filtro que NÃO aceita "todos": a opção some do topo e o valor vazio deixa de
   * existir como escolha possível.
   *
   * Existe para a lista de lançamentos, onde "a pagar" e "a receber" juntos fazem
   * os cartões do topo somarem dinheiro que entra com dinheiro que sai. Quem usa
   * responde pelo padrão: com `obrigatorio`, o host tem que garantir que `valor`
   * nunca chega vazio, senão o gatilho fica sem rótulo.
   */
  obrigatorio?: boolean;
  /** Classe extra no gatilho (ex.: limitar largura em lista de nome comprido). */
  className?: string;
}

/**
 * Select compacto de filtro com opção "todos" no topo.
 * Valor vazio ("") representa "todos" — exceto com `obrigatorio`, que remove
 * essa opção e exige que o host sempre mande um valor.
 */
export function FiltroSelect({
  valor,
  onValorChange,
  opcoes,
  placeholder,
  todosRotulo = "Todos",
  obrigatorio = false,
  className,
}: FiltroSelectProps) {
  return (
    <CampoFiltro largura={TRILHO_FILTRO}>
      <Combobox
        valor={valor === "" && !obrigatorio ? VALOR_TODOS : valor}
        onValorChange={(novoValor) =>
          onValorChange(novoValor === VALOR_TODOS ? "" : novoValor)
        }
        opcoes={
          obrigatorio
            ? opcoes
            : [{ valor: VALOR_TODOS, rotulo: todosRotulo }, ...opcoes]
        }
        placeholder={placeholder ?? todosRotulo}
        size="sm"
        // `w-full`, não `w-fit`: o trilho manda na largura. Com `w-fit` o gatilho
        // media o texto da opção escolhida, então o MESMO filtro mudava de
        // tamanho ao ser preenchido e empurrava todos os filtros da linha.
        className={cn("h-8 w-full gap-1.5 text-detalhe", className)}
      />
    </CampoFiltro>
  );
}

interface FiltroSelectMultiProps {
  /** Valores escolhidos, na ordem de escolha. Vazio = todos. */
  valores: string[];
  onValoresChange: (valores: string[]) => void;
  opcoes: OpcaoFiltro[];
  placeholder?: string;
  todosRotulo?: string;
  /** Teto de itens. Marcar além dele avisa e ignora, em vez de cortar calado. */
  maximo?: number;
  /** Classe extra no gatilho (ex.: limitar largura em lista de nome comprido). */
  className?: string;
}

/**
 * Select de filtro com marcação MÚLTIPLA. Lista vazia representa "todos".
 *
 * O gatilho é o do `Combobox`: nada marcado mostra o rótulo de "todos", um
 * marcado mostra o nome dele (informa mais que "1 selecionado") e daí para cima
 * mostra a contagem, porque três nomes longos não cabem no botão.
 *
 * A ESCOLHA LOCAL À FRENTE DA URL é a parte que não pode faltar. Sem ela não dá
 * para marcar dois seguidos, e foi o defeito que o Tiago pegou no extrato:
 * gravar na URL é assíncrono (`router.replace`, ida ao servidor), então o segundo
 * clique ainda enxergava a lista ANTIGA vinda do servidor e gravava só ele,
 * apagando o primeiro. Marcar devagar funcionava; marcar rápido, não.
 *
 * O estado local responde na hora e a URL vai atrás. Quando a volta do servidor
 * chega diferente do que temos (link colado, voltar do navegador, outra aba), o
 * local se rende a ela — comparando pelo CONTEÚDO, porque o array vem novo a cada
 * render e comparar referência ressincronizaria sempre, matando o efeito.
 */
export function FiltroSelectMulti({
  valores,
  onValoresChange,
  opcoes,
  placeholder,
  todosRotulo = "Todos",
  maximo,
  className,
}: FiltroSelectMultiProps) {
  const chaveDoServidor = valores.join(",");
  const [escolhidos, setEscolhidos] = React.useState(valores);
  // Guarda o que o servidor mandou por último em ESTADO, não em ref: é o padrão
  // da doc do React para "ajustar estado quando a prop muda", e o lint do projeto
  // (com razão) barra tocar em ref durante o render. Efeito também não serve:
  // renderizaria a lista velha por um quadro.
  const [chaveAnterior, setChaveAnterior] = React.useState(chaveDoServidor);
  if (chaveAnterior !== chaveDoServidor) {
    setChaveAnterior(chaveDoServidor);
    setEscolhidos(valores);
  }

  function aoMudar(novos: string[]) {
    if (maximo !== undefined && novos.length > maximo) {
      // Avisar é melhor que ignorar o clique em silêncio: o teto é técnico (o
      // `in` do PostgREST viaja na URL), e sem aviso a pessoa marca e nada muda.
      toast.error(`Este filtro aceita no máximo ${maximo} itens por vez`);
      return;
    }
    setEscolhidos(novos);
    onValoresChange(novos);
  }

  return (
    <CampoFiltro largura={TRILHO_FILTRO}>
      <Combobox
        valor=""
        onValorChange={() => {}}
        valores={escolhidos}
        onValoresChange={aoMudar}
        opcoes={opcoes}
        placeholder={placeholder ?? todosRotulo}
        size="sm"
        // `w-full` pelo mesmo motivo do FiltroSelect: o trilho manda na largura.
        className={cn("h-8 w-full gap-1.5 text-detalhe", className)}
      />
    </CampoFiltro>
  );
}

interface FiltroPeriodoProps {
  de: string;
  ate: string;
  /** Recebe as duas pontas juntas: uma navegação só, sem página intermediária. */
  onPeriodoChange: (de: string, ate: string) => void;
  /** Nome do que está sendo datado, ex. "Emissão". */
  rotulo?: string;
}

/**
 * Filtro de período: um botão que abre a régua de tempo num popover.
 *
 * Era um par de `input type="date"` sempre à vista, ocupando dois trilhos numa
 * barra que já tem 16 filtros. O Tiago pediu a mudança em 29/08/2026, com o
 * slicer do Excel como referência e uma condição explícita: "essa barra não deve
 * ficar aparecendo o tempo todo, quando você clicar no filtro ela aparece".
 *
 * O botão mostra o RESUMO do período ("jan - ago de 2026"), que é o que a pessoa
 * precisa ler de relance para saber o que está filtrando. Duas caixas de data
 * com dd/mm/aaaa exigiam ler seis números e comparar mentalmente.
 *
 * A API não mudou (`de`, `ate`, `onPeriodoChange`): as 26 telas que usam este
 * filtro ganharam a régua sem uma linha de mudança em nenhuma delas. Foi o
 * motivo de mexer no canônico em vez de criar um filtro novo ao lado.
 */
export function FiltroPeriodo({
  de,
  ate,
  onPeriodoChange,
  rotulo = "Período",
}: FiltroPeriodoProps) {
  const [aberto, setAberto] = React.useState(false);
  const resumo = resumoDoPeriodo(de, ate);
  const temPeriodo = resumo !== "";

  return (
    <CampoFiltro largura={TRILHO_FILTRO}>
      <div className="flex items-center gap-1.5">
        <Popover open={aberto} onOpenChange={setAberto}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={rotulo}
              className={cn(
                "h-8 min-w-0 flex-1 justify-start gap-1.5 text-detalhe font-normal",
                temPeriodo ? "" : "text-muted-foreground",
              )}
            >
              <CalendarDays className="size-3.5 shrink-0 opacity-70" />
              <span className="truncate">{temPeriodo ? resumo : "Qualquer data"}</span>
            </Button>
          </PopoverTrigger>
          {/* Largura fixa e generosa: a régua de DIAS tem 31 blocos, e num
              popover que herdasse a largura do gatilho (13rem) cada dia sairia
              com 2px. Em 34rem cada bloco de dia fica com ~16px, que é o que o
              número "31" pede em 12px. */}
          <PopoverContent align="start" className="w-[34rem] max-w-[92vw] p-3">
            <ReguaTempo
              de={de}
              ate={ate}
              onPeriodoChange={onPeriodoChange}
              rotulo={rotulo}
            />
          </PopoverContent>
        </Popover>

        {/* O X divide o trilho com o botão em vez de crescer para fora dele,
            mesma razão do FiltroMes: escolher um período não pode empurrar para
            o lado todos os filtros que vêm depois na mesma linha. */}
        {temPeriodo ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Limpar ${rotulo.toLowerCase()}`}
            onClick={() => onPeriodoChange("", "")}
          >
            <X />
          </Button>
        ) : null}
      </div>
    </CampoFiltro>
  );
}

/**
 * Parâmetros da URL que NÃO são filtro, e por isso sobrevivem ao "Limpar filtros".
 *
 * `tamanho` é preferência de quantas linhas ver; `ordem` e `direcao` são
 * ordenação. Nenhum dos três muda QUAIS linhas entram na lista, e apagar eles
 * junto faria o botão desfazer escolha que a pessoa não mandou desfazer.
 *
 * `pagina` NÃO entra aqui de propósito: ela é apagada, e a leitura entende
 * ausência como primeira página.
 */
const PARAMS_QUE_NAO_SAO_FILTRO = ["tamanho", "ordem", "direcao"];

export interface OpcoesFiltrosUrl {
  /**
   * Parâmetros DESTA tela que também não são filtro, e por isso sobrevivem ao
   * "Limpar filtros". Some com a lista global acima.
   *
   * Existe para a tela cuja URL carrega NAVEGAÇÃO além de filtro: em
   * `/financeiro/relatorios` o `rel` diz qual dos nove relatórios está aberto, e
   * limpar os filtros o derrubava de volta para o Fluxo de caixa — o botão
   * desfazia uma escolha que ninguém mandou desfazer.
   *
   * Por que por chamada e não na lista global: a global vale para as 16 telas
   * com filtro na URL, então acrescentar `rel` lá reservaria o nome no app
   * inteiro para sempre. E por que não um `onLimparFiltros` próprio na tela: ele
   * teria que enumerar as chaves de filtro dela (o Custo por centro de custo tem
   * doze), e essa lista sai de sincronia no primeiro filtro que alguém
   * acrescenta — o sintoma seria o botão limpando quase tudo, que é pior que não
   * limpar. Aqui continua havendo uma implementação só, por exclusão.
   *
   * Passe um array ESTÁVEL (constante de módulo): ele entra na dependência do
   * callback pelo conteúdo, mas um literal novo a cada render é trabalho à toa.
   */
  naoSaoFiltro?: readonly string[];
}

/**
 * Lê e escreve filtros nos searchParams da URL (replace, sem scroll).
 * `set(chave, null)` ou valor vazio remove o parâmetro.
 */
export function useFiltrosUrl(opcoes?: OpcoesFiltrosUrl) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Assinatura de conteúdo da lista da tela. O array chega novo a cada render se
  // o call site usar literal, e comparar por referência refaria o callback
  // sempre; a string é comparável por valor.
  const naoSaoFiltroDaTela = (opcoes?.naoSaoFiltro ?? []).join(",");

  const get = React.useCallback(
    (chave: string): string | null => searchParams.get(chave),
    [searchParams],
  );

  /**
   * Várias chaves numa única navegação (ex: trocar filtro + zerar página).
   *
   * **Uma chamada por interação.** Duas chamadas no mesmo tick NÃO se somam: cada
   * uma monta a URL a partir do `searchParams` desta renderização, que não muda no
   * meio de um laço síncrono, então a segunda desfaz a primeira. Foi medido na
   * tela ao construir o "Limpar filtros" chamando um `onLimpar` por filtro: a
   * busca limpava e o status voltava.
   *
   * Quem precisa limpar vários filtros de uma vez passa TODAS as chaves nesta
   * chamada (é o que `onLimparFiltros` faz em cada tela). Tentativa de acumular
   * aqui dentro, com navegação adiada, deixou o clique sem efeito nenhum no
   * navegador: não vale enfeitar este funil para contornar quem chama errado.
   */
  const setMuitos = React.useCallback(
    (mudancas: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [chave, valor] of Object.entries(mudancas)) {
        if (valor === null || valor === "") {
          params.delete(chave);
        } else {
          params.set(chave, valor);
        }
      }
      const query = params.toString();
      // Funil único de toda escrita de filtro que vive na URL, então é aqui que
      // a escolha fica lembrada para a volta. Query vazia é gravada de
      // propósito: significa "eu limpei", e tem que ganhar do padrão da tela.
      salvarQuerySessao(pathname, query);
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [router, pathname, searchParams],
  );

  /**
   * Apaga TODO filtro da URL numa navegação só, para o botão "Limpar filtros".
   *
   * Apaga por exclusão em vez de listar as chaves de cada tela: são 16 telas com
   * filtro na URL e algumas têm dezesseis filtros, então uma lista por tela sairia
   * de sincronia no primeiro filtro que alguém acrescenta — e o sintoma seria o
   * botão limpando quase tudo, que é pior que não limpar.
   *
   * O que NÃO é filtro sobrevive: ordenar e escolher quantas linhas ver não é
   * filtrar, e quem limpou filtro não pediu a ordem padrão de volta. `pagina` é
   * apagada, o que a leitura entende como primeira página. A tela que carrega
   * NAVEGAÇÃO na própria URL declara as chaves dela em `naoSaoFiltro`.
   *
   * Não navega quando não há filtro nenhum: clique de graça faria a tela recarregar
   * sem motivo.
   */
  const limparTodos = React.useCallback(() => {
    const sobrevivem = new Set([
      ...PARAMS_QUE_NAO_SAO_FILTRO,
      // `"".split(",")` devolve [""], que entraria no Set como uma chave de
      // nome vazio. Sem lista da tela, não monta lista nenhuma.
      ...(naoSaoFiltroDaTela === "" ? [] : naoSaoFiltroDaTela.split(",")),
    ]);
    const params = new URLSearchParams(searchParams.toString());
    let mexeu = false;
    for (const chave of [...params.keys()]) {
      if (sobrevivem.has(chave)) continue;
      params.delete(chave);
      mexeu = true;
    }
    // A familia da URL pode nao ter nada, e a da sessao ter tudo (o extrato da
    // conta bancaria e assim: so o escopo mora na URL). Entao o `mexeu` decide
    // apenas se vale NAVEGAR -- a limpeza da sessao acontece de qualquer jeito.
    limparFiltrosDaRota(pathname);
    if (!mexeu) return;

    const query = params.toString();
    salvarQuerySessao(pathname, query);
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }, [router, pathname, searchParams, naoSaoFiltroDaTela]);

  const set = React.useCallback(
    (chave: string, valor: string | null) => {
      setMuitos({ [chave]: valor });
    },
    [setMuitos],
  );

  /**
   * Query string atual, para quem precisa mandar os filtros da tela INTEIROS ao
   * servidor (exportar para Excel: a planilha lê os mesmos filtros que a lista).
   * Sai daqui, e não de um segundo `useSearchParams`, porque este hook já é o
   * dono da URL de filtro.
   */
  const query = searchParams.toString();

  return { get, set, setMuitos, limparTodos, query };
}

/** Espera (ms) entre a digitação e a escrita da busca na URL. */
const DEBOUNCE_BUSCA_MS = 400;

/**
 * Estado local de busca textual sincronizado com a URL, com debounce, para
 * listagens com filtro server-side. Escrever a busca zera a página. Use o
 * `busca`/`setBusca` retornados direto no FiltroBusca.
 */
export function useBuscaUrl(buscaInicial: string, chave = "busca") {
  const { setMuitos } = useFiltrosUrl();
  const [busca, setBusca] = React.useState(buscaInicial);
  // Ultimo termo que ESTE hook escreveu na URL, para distinguir a volta da
  // propria escrita de uma mudanca vinda de FORA (o "Limpar filtros", um link
  // colado, o voltar do navegador). Mesma mecanica do `useFaixaUrl` abaixo.
  const escritoPorNos = React.useRef(buscaInicial.trim());

  // A URL mudou por fora: o campo tem de acompanhar. Sem isto o texto antigo
  // fica no input e, 400 ms depois, o debounce REESCREVE o termo na URL que o
  // botao acabou de limpar -- a lista volta filtrada e ninguem pediu.
  React.useEffect(() => {
    if (buscaInicial.trim() === escritoPorNos.current) return;
    escritoPorNos.current = buscaInicial.trim();
    setBusca(buscaInicial);
  }, [buscaInicial]);

  React.useEffect(() => {
    const termo = busca.trim();
    if (termo === buscaInicial.trim()) return;
    const timer = setTimeout(() => {
      escritoPorNos.current = termo;
      setMuitos({ [chave]: termo === "" ? null : termo, pagina: "1" });
    }, DEBOUNCE_BUSCA_MS);
    return () => clearTimeout(timer);
  }, [busca, buscaInicial, chave, setMuitos]);

  return { busca, setBusca };
}

/**
 * Faixa numérica (de/até) na URL com estado local e espera, para o FiltroValor
 * de listagens com filtro server-side.
 *
 * Existe como canônico porque escrever direto na URL a cada tecla quebra o
 * campo: o input é alimentado pelo valor que volta do servidor, então o usuário
 * digita "1500" e vê "1". A comparação é feita contra o TEXTO CRU da URL (e não
 * contra o número já validado pela página), senão "1000.50" viraria "1000.5",
 * os dois nunca casariam e a tela renavegaria para sempre.
 *
 * Devolve `faixa` (para o FiltroValor), `setFaixa` (no onValorChange) e
 * `limpar` (no onLimpar do filtro).
 */
export function useFaixaUrl(chaveDe: string, chaveAte: string) {
  const { get, setMuitos } = useFiltrosUrl();
  const urlDe = get(chaveDe) ?? "";
  const urlAte = get(chaveAte) ?? "";

  const [faixa, setFaixa] = React.useState({ de: urlDe, ate: urlAte });
  // Último texto que ESTE hook escreveu na URL, para distinguir a volta da
  // própria escrita de uma mudança de fora (link aberto, voltar do navegador).
  const escritoPorNos = React.useRef({ de: urlDe, ate: urlAte });

  React.useEffect(() => {
    if (
      urlDe === escritoPorNos.current.de &&
      urlAte === escritoPorNos.current.ate
    ) {
      return;
    }
    escritoPorNos.current = { de: urlDe, ate: urlAte };
    setFaixa({ de: urlDe, ate: urlAte });
  }, [urlDe, urlAte]);

  React.useEffect(() => {
    if (faixa.de === urlDe && faixa.ate === urlAte) return;
    const timer = setTimeout(() => {
      escritoPorNos.current = faixa;
      setMuitos({
        [chaveDe]: faixa.de === "" ? null : faixa.de,
        [chaveAte]: faixa.ate === "" ? null : faixa.ate,
        pagina: "1",
      });
    }, DEBOUNCE_BUSCA_MS);
    return () => clearTimeout(timer);
  }, [faixa, urlDe, urlAte, chaveDe, chaveAte, setMuitos]);

  const limpar = React.useCallback(() => {
    escritoPorNos.current = { de: "", ate: "" };
    setFaixa({ de: "", ate: "" });
    setMuitos({ [chaveDe]: null, [chaveAte]: null, pagina: "1" });
  }, [chaveDe, chaveAte, setMuitos]);

  return { faixa, setFaixa, limpar };
}

interface FiltroMesProps {
  /** Mês selecionado no formato do input (yyyy-MM). Vazio = todos. */
  valor: string;
  onValorChange: (mes: string) => void;
  rotulo?: string;
  /**
   * Desabilita o campo. Existe para a tela que tem DOIS controles de tempo (uma
   * janela e uma lista de meses): quando um manda, o outro fica visível mas
   * apagado, em vez de os dois valerem ao mesmo tempo e brigarem calados.
   */
  desabilitado?: boolean;
  /** Por que está desabilitado, no title. Some quando habilitado. */
  motivo?: string;
}

/**
 * Filtro por mês (competência). Um input type="month" só, com botão de limpar
 * quando há mês escolhido: mês vazio significa "todos os meses".
 */
export function FiltroMes({
  valor,
  onValorChange,
  rotulo = "Mês de referência",
  desabilitado,
  motivo,
}: FiltroMesProps) {
  return (
    <CampoFiltro largura={TRILHO_FILTRO}>
      <div
        className="flex items-center gap-1.5"
        title={desabilitado ? motivo : undefined}
      >
        <Input
          type="month"
          value={valor}
          onChange={(evento) => onValorChange(evento.target.value)}
          aria-label={rotulo}
          disabled={desabilitado}
          className="h-8 flex-1 text-detalhe tabular-nums"
        />
        {/* O X divide o trilho com o campo em vez de crescer para fora dele:
            antes, escolher o mês alargava o filtro em 2rem e empurrava para o
            lado todos os filtros que vinham depois na mesma linha. */}
        {valor === "" || desabilitado ? null : (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Limpar ${rotulo.toLowerCase()}`}
            onClick={() => onValorChange("")}
          >
            <X />
          </Button>
        )}
      </div>
    </CampoFiltro>
  );
}

interface FiltroValorProps {
  /** Valor mínimo em reais, como string do input. Vazio = sem limite. */
  de: string;
  ate: string;
  /** Recebe as duas pontas juntas: uma navegação só, sem página intermediária. */
  onValorChange: (de: string, ate: string) => void;
  rotulo?: string;
}

/**
 * Filtro por faixa de valor, com as duas pontas. Ponta vazia significa sem
 * limite naquele lado.
 *
 * Existe como canônico porque filtro de dinheiro aparece em quase toda listagem
 * do Financeiro e de Compras, e cada tela inventando o seu daria formatação e
 * comportamento diferentes na mesma pergunta ("quanto custou?").
 */
export function FiltroValor({
  de,
  ate,
  onValorChange,
  rotulo = "Valor",
}: FiltroValorProps) {
  return (
    <CampoFiltro largura={TRILHO_FILTRO_DUPLO}>
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={de}
          onChange={(evento) => onValorChange(evento.target.value, ate)}
          aria-label={`${rotulo}: mínimo`}
          placeholder="de"
          className="h-8 flex-1 text-detalhe tabular-nums"
        />
        <span className="text-detalhe text-muted-foreground">até</span>
        <Input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={ate}
          onChange={(evento) => onValorChange(de, evento.target.value)}
          aria-label={`${rotulo}: máximo`}
          placeholder="até"
          className="h-8 flex-1 text-detalhe tabular-nums"
        />
      </div>
    </CampoFiltro>
  );
}

/**
 * Um filtro da BarraFiltrosConfiguravel. Mesmo contrato do `filtros` do
 * DataTable (`FiltroConfiguravel`), de propósito: a tela que troca de layout não
 * reescreve a lista de filtros.
 */
export interface FiltroDaBarra {
  /** Identificador estável, usado na preferência salva (ex. "tipo"). */
  id: string;
  /** Nome no menu "Filtros". */
  rotulo: string;
  elemento: React.ReactNode;
  /** Filtro que não pode ser escondido (a busca principal da tela). */
  fixo?: boolean;
  /** Nasce escondido: o usuário liga no menu "Filtros" se quiser. */
  ocultoPorPadrao?: boolean;
  /** Tem valor escolhido agora? Usado para limpar ao esconder. */
  temValor?: boolean;
  /** Chamado quando o filtro é escondido com valor, para não filtrar às cegas. */
  onLimpar?: () => void;
}

export interface BarraFiltrosConfiguravelProps {
  /**
   * Identifica a barra na preferência do usuário. Use um id PRÓPRIO, diferente
   * do `idTabela` de qualquer DataTable da mesma tela: a preferência é um
   * registro só por chave, e compartilhar a chave apagaria as colunas salvas
   * (esta barra grava a partir de `preferenciasVazias()`, ver alternar).
   */
  idTabela: string;
  filtros: FiltroDaBarra[];
  /**
   * Limpa TODOS os filtros numa única escrita. Obrigatório quando os filtros vivem
   * na URL, pelo mesmo motivo do DataTable: um `onLimpar` por filtro faz a segunda
   * escrita desfazer a primeira (ver use-filtros-url.test.tsx).
   */
  onLimparFiltros?: () => void;
}

/**
 * Barra de filtros com menu "Filtros" para a tela que NÃO tem um DataTable onde
 * o `filtros` da tabela possa morar: a árvore de centros de custo (não é tabela)
 * e as categorias (uma tabela por grupo de insumo, então nenhuma delas é "a"
 * tabela da tela). Sem isto o filtro novo nasceria visível nessas duas, e doze
 * filtros abertos de uma vez é uma parede, não uma ferramenta.
 *
 * Mesmo contrato, mesmo menu e mesma persistência do DataTable: a escolha de
 * quem mostra e quem esconde vive no banco, por usuário, e esconder filtro
 * preenchido limpa o valor dele. Tela com um DataTable só continua passando os
 * filtros pelo `filtros` dele; esta barra é para as outras duas.
 */
export function BarraFiltrosConfiguravel({
  idTabela,
  filtros,
  onLimparFiltros,
}: BarraFiltrosConfiguravelProps) {
  const [escolha, setEscolha] = React.useState<Record<string, boolean>>({});

  const idsFiltros = React.useMemo(
    () => filtros.map((filtro) => filtro.id),
    [filtros],
  );

  /**
   * Fila das chamadas de servidor, para o save do "esconder" e o delete do
   * "voltou ao padrão" não correrem soltos. Dois cliques seguidos no menu (que
   * fica aberto de propósito) disparam os dois: sem ordem, o delete pode chegar
   * antes do save e a preferência que a pessoa acabou de desfazer volta viva no
   * próximo carregamento. É a mesma garantia que o DataTable dá com a fila dele.
   */
  const refFila = React.useRef<Promise<void> | null>(null);

  const enfileirar = React.useCallback((tarefa: () => Promise<void>) => {
    const anterior = refFila.current;
    const emVoo = anterior === null ? tarefa() : anterior.then(tarefa, tarefa);
    // Falha de gravação não pode virar unhandled rejection nem travar a fila: a
    // preferência é conforto, e a Server Action já loga o erro no servidor.
    const encerrada: Promise<void> = emVoo
      .catch(() => undefined)
      .then(() => {
        // Só a última da fila libera, senão a próxima acha a fila vazia e
        // atropela uma tarefa que ainda está no ar.
        if (refFila.current === encerrada) refFila.current = null;
      });
    refFila.current = encerrada;
  }, []);

  // Só o que está marcado nasce escondido; o resto segue visível.
  const ocultosPorPadrao = React.useMemo<Record<string, boolean>>(() => {
    const padrao: Record<string, boolean> = {};
    for (const filtro of filtros) {
      if (filtro.ocultoPorPadrao === true && filtro.fixo !== true) {
        padrao[filtro.id] = false;
      }
    }
    return padrao;
  }, [filtros]);

  // Hidrata depois da montagem. Vem do banco, por usuário, para seguir a pessoa
  // em qualquer máquina (máquina compartilhada de escritório é comum na EMT).
  React.useEffect(() => {
    let ativo = true;
    void buscarPreferenciaTabela(idTabela).then((bruto) => {
      if (!ativo) return;
      const salvo = lerPreferenciasTabela(bruto, [], idsFiltros);
      if (!salvo) return;
      setEscolha(salvo.filtros);
    });
    return () => {
      ativo = false;
    };
    // idsFiltros é estável por tela; lê uma vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idTabela]);

  function visivel(id: string): boolean {
    // Mesma regra do DataTable: filtro preenchido aparece sempre, mesmo se o
    // padrão da tela ou a escolha do usuário o esconderia (link compartilhado
    // com filtro na URL). Esconder na mão limpa o valor, então o filtro volta a
    // obedecer o padrão no clique seguinte.
    const filtro = filtros.find((f) => f.id === id);
    if (filtro?.temValor === true) return true;
    return escolha[id] ?? ocultosPorPadrao[id] ?? true;
  }

  /**
   * Liga ou desliga um filtro. Desligar filtro com valor LIMPA o valor: filtro
   * ativo e invisível é a pior combinação possível, porque a lista aparece
   * filtrada e ninguém vê por quê.
   */
  function alternar(id: string) {
    const filtro = filtros.find((f) => f.id === id);
    if (!filtro || filtro.fixo) return;

    const visivelAgora = visivel(id);
    const proximos = { ...escolha, [id]: !visivelAgora };
    setEscolha(proximos);
    if (visivelAgora && filtro.temValor) filtro.onLimpar?.();

    // Volta ao padrão da tela quando nada mais diverge: não deixa lixo salvo.
    const divergentes = Object.entries(proximos).filter(
      ([chave, valor]) => valor !== (ocultosPorPadrao[chave] ?? true),
    );
    if (divergentes.length === 0) {
      enfileirar(() => limparPreferenciaTabela(idTabela));
      return;
    }
    // Parte da preferência neutra do canônico e só troca os filtros: a barra não
    // tem coluna nem linha para guardar, e campo novo do formato (altura de
    // linha, por exemplo) entra aqui pelo padrão, sem esta tela precisar saber.
    enfileirar(() =>
      salvarPreferenciaTabela(
        idTabela,
        escreverPreferenciasTabela({
          ...preferenciasVazias(),
          filtros: proximos,
        }),
      ),
    );
  }

  const temFiltroAtivo = filtros.some((filtro) => filtro.temValor === true);

  return (
    <div className="py-2">
      <BlocoFiltros
        campos={filtros
          .filter((filtro) => visivel(filtro.id))
          .map((filtro) => ({
            id: filtro.id,
            rotulo: filtro.rotulo,
            elemento: filtro.elemento,
          }))}
        acoesEsquerda={
          /* Mesmo botão do DataTable, mesma regra: só com filtro ativo. Esta
             barra é o outro lugar do app onde filtro vive, então ele tem que
             existir aqui também, senão "todo lugar com filtro" viraria "quase
             todo". */
          temFiltroAtivo ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (onLimparFiltros) {
                  onLimparFiltros();
                  return;
                }
                for (const filtro of filtros) {
                  if (filtro.temValor === true) filtro.onLimpar?.();
                }
              }}
            >
              <FilterX />
              Limpar filtros
            </Button>
          ) : undefined
        }
        acoesDireita={
          <MenuFiltros
            filtros={filtros.map((filtro) => ({
              id: filtro.id,
              rotulo: filtro.rotulo,
              fixo: filtro.fixo,
              visivel: visivel(filtro.id),
            }))}
            onAlternar={alternar}
          />
        }
      />
    </div>
  );
}
