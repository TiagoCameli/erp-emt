"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { dataHojeISO } from "@/lib/formatadores";
import {
  ancoraInicial,
  blocosDaJanela,
  blocosNoPeriodo,
  ehDataISO,
  GRANULARIDADES,
  granularidadeDoPeriodo,
  inicioDaJanela,
  intervaloEntre,
  janelaVizinha,
  mostraRotulo,
  ROTULO_GRANULARIDADE,
  tituloDaJanela,
  type BlocoDaRegua,
  type Granularidade,
} from "@/components/canonicos/regua-tempo-calculo";

export interface ReguaTempoProps {
  /** Ponta inicial do período, yyyy-MM-dd. Vazio = sem limite. */
  de: string;
  ate: string;
  /** Recebe as duas pontas juntas: uma navegação só, sem estado intermediário. */
  onPeriodoChange: (de: string, ate: string) => void;
  /** Nome do que está sendo datado, para os rótulos de acessibilidade. */
  rotulo: string;
  /**
   * Quais tamanhos de bloco esta régua oferece. Por padrão, os cinco.
   *
   * O filtro de MÊS DE REFERÊNCIA passa só [ano, trimestre, mes]: competência é
   * um mês por definição (a coluna guarda o dia 1), e oferecer "Dias" ali seria
   * oferecer um corte que o dado não tem.
   */
  granularidades?: readonly Granularidade[];
  /** Some com os campos de data exata. O filtro de competência não os usa. */
  semDataExata?: boolean;
}

/**
 * A régua de tempo dos filtros de período: uma faixa de blocos que se clica e se
 * arrasta para escolher um intervalo, com os campos de data exata embaixo.
 *
 * Desenho pedido pelo Tiago em 29/08/2026, a partir do slicer de linha do tempo
 * do Excel: escolher "de janeiro a agosto" é um arraste, não duas digitações de
 * dd/mm/aaaa. Os cinco tamanhos de bloco (anos, trimestres, meses, semanas,
 * dias) são escolha dele — a mesma régua responde "qual ano?" e "quais três
 * dias?" sem virar dois controles diferentes.
 *
 * Os campos de data continuam aí, embaixo, e não são decoração: a régua acerta o
 * intervalo redondo, e a data exata é o que fecha um corte que não cai em borda
 * de mês. Tirar os campos tornaria impossível filtrar "até o dia 17".
 *
 * Este componente é só a régua. Quem a põe dentro de um popover (e decide quando
 * ela aparece) é o `FiltroPeriodo` da barra de filtros.
 */
/** Um arraste: onde começou e onde o ponteiro está, como blocos (datas). */
interface Arraste {
  ancora: BlocoDaRegua;
  ponta: BlocoDaRegua;
}

/**
 * De quanto em quanto tempo a janela anda enquanto o arraste segura fora da
 * régua. Devagar o bastante para soltar no ano certo: em MESES cada passo é um
 * ano inteiro.
 */
const ROLAGEM_MS = 700;

/** "além deste ano", "além deste mês": o que a janela de cada tamanho mostra. */
const DESTA_JANELA: Record<Granularidade, string> = {
  ano: "destes doze anos",
  trimestre: "destes dois anos",
  mes: "deste ano",
  semana: "deste mês",
  dia: "deste mês",
};

export function ReguaTempo({
  de,
  ate,
  onPeriodoChange,
  rotulo,
  granularidades = GRANULARIDADES,
  semDataExata = false,
}: ReguaTempoProps) {
  const hoje = React.useMemo(() => dataHojeISO(), []);

  /**
   * A granularidade e a janela nascem do período que já está filtrado, e a
   * partir daí são do usuário: mexer na régua não pode reabrir a granularidade
   * "sugerida" a cada clique, ou escolher três dias em DIAS jogaria a régua de
   * volta para DIAS no meio do arraste seguinte.
   */
  const inicial = React.useMemo(() => {
    // A sugerida, quando esta régua a oferece; senão, meses. Sem esse ajuste, um
    // filtro de três dias abriria a régua de competência em "Dias", que ela não
    // desenha, e a régua sairia vazia.
    const sugerida = granularidadeDoPeriodo(de, ate) ?? "mes";
    if (granularidades.includes(sugerida)) return sugerida;
    return granularidades.includes("mes") ? "mes" : granularidades[0]!;
    // Só na montagem: depois disso a granularidade é do usuário.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [granularidade, setGranularidade] =
    React.useState<Granularidade>(inicial);
  const [inicioJanela, setInicioJanela] = React.useState<string>(() =>
    inicioDaJanela(ancoraInicial(de, ate, hoje), inicial),
  );

  /**
   * O arraste em curso: o bloco onde começou e o bloco onde o ponteiro está.
   * `null` quando ninguém arrasta.
   *
   * Guarda os BLOCOS (datas), e não a posição deles na régua: com índices o
   * arraste morria na borda da janela, e em MESES a janela é um ano — era
   * impossível escolher "out/2025 a mar/2026" (relatado pelo Tiago em
   * 24/09/2026). Com datas, a janela pode andar no meio do gesto (rolagem pela
   * borda, Shift+clique depois de ◀ ▶) e o intervalo continua inteiro.
   *
   * Enquanto arrasta, o intervalo vive AQUI e não sobe para o filtro. Antes cada
   * bloco que o cursor atravessava chamava `onPeriodoChange`, e cada chamada
   * troca a URL, refaz a consulta no servidor e redesenha a lista inteira: era
   * isso que fazia a tela tremer enquanto a pessoa arrastava (relatado pelo
   * Tiago em 30/08/2026, com gravação). O filtro é aplicado UMA vez, ao soltar.
   */
  const [arraste, setArraste] = React.useState<Arraste | null>(null);

  /**
   * O mesmo arraste, num ref, e é ele que manda na hora de SOLTAR.
   *
   * O `pointerup` sobe do alvo do bloco para o trilho e daí para o popover, e
   * cada um deles encerra o gesto. Com `arraste` do estado, as três chamadas do
   * mesmo evento leem o valor antigo (o setState só vale no render seguinte) e o
   * filtro era aplicado três vezes — três navegações, três consultas. O ref é
   * zerado no primeiro, então os outros dois saem na porta.
   */
  const arrasteRef = React.useRef<Arraste | null>(null);

  const trilhoRef = React.useRef<HTMLDivElement>(null);

  function definirArraste(valor: Arraste | null) {
    arrasteRef.current = valor;
    setArraste(valor);
  }

  /**
   * A janela e a granularidade de agora, num ref, para a rolagem pela borda: ela
   * roda num intervalo que nasceu num render antigo e leria valores velhos.
   */
  const janelaRef = React.useRef({ inicioJanela, granularidade });
  React.useEffect(() => {
    janelaRef.current = { inicioJanela, granularidade };
  }, [inicioJanela, granularidade]);

  /** A rolagem pela borda em curso: o timer e para que lado anda. */
  const rolagemRef = React.useRef<{
    timer: ReturnType<typeof setInterval>;
    direcao: -1 | 1;
  } | null>(null);

  function pararRolagem() {
    if (rolagemRef.current === null) return;
    clearInterval(rolagemRef.current.timer);
    rolagemRef.current = null;
  }

  // Timer órfão depois de fechar o popover continuaria mexendo em estado de
  // componente desmontado.
  React.useEffect(
    () => () => {
      if (rolagemRef.current !== null) clearInterval(rolagemRef.current.timer);
    },
    [],
  );

  /**
   * Arrastar para fora da régua, segurando, anda a janela para aquele lado e
   * leva a ponta do arraste junto. É o que o slicer do Excel faz, e é o caminho
   * do mouse e do dedo para um intervalo que atravessa o ano.
   */
  function rolarPelaBorda(direcao: -1 | 0 | 1) {
    if (direcao === 0) {
      pararRolagem();
      return;
    }
    if (rolagemRef.current?.direcao === direcao) return;
    pararRolagem();
    const timer = setInterval(() => {
      const atual = arrasteRef.current;
      if (atual === null) {
        pararRolagem();
        return;
      }
      const { inicioJanela: janela, granularidade: tamanho } =
        janelaRef.current;
      const nova = janelaVizinha(janela, tamanho, direcao);
      const blocosNovos = blocosDaJanela(nova, tamanho);
      const ponta =
        direcao === 1 ? blocosNovos[blocosNovos.length - 1] : blocosNovos[0];
      janelaRef.current = { inicioJanela: nova, granularidade: tamanho };
      setInicioJanela(nova);
      if (ponta) definirArraste({ ...atual, ponta });
    }, ROLAGEM_MS);
    rolagemRef.current = { timer, direcao };
  }

  /**
   * O ponto fixo de um Shift+clique: a seleção que já existe, como se fosse um
   * bloco só. `intervaloEntre(ancora, clicado)` então estende pelo lado certo —
   * clicar depois dela puxa o fim, clicar antes puxa o começo —, que é o que o
   * Shift faz no Excel. Sem seleção, não há o que estender.
   */
  function ancoraDaSelecao(): BlocoDaRegua | null {
    if (de === "" && ate === "") return null;
    return {
      inicio: de === "" ? ate : de,
      fim: ate === "" ? de : ate,
      rotulo: "",
      descricao: "",
    };
  }

  /** Começa o gesto num bloco; com Shift, estende a seleção que já existe. */
  function comecarArraste(bloco: BlocoDaRegua, comShift: boolean) {
    const ancora = comShift ? ancoraDaSelecao() : null;
    definirArraste({ ancora: ancora ?? bloco, ponta: bloco });
  }

  const blocos = React.useMemo(
    () => blocosDaJanela(inicioJanela, granularidade),
    [inicioJanela, granularidade],
  );

  /**
   * Quais blocos aparecem pintados: os do ARRASTE enquanto ele acontece, os do
   * filtro gravado quando não. É o que faz a faixa acompanhar o dedo em tempo
   * real sem que nada mais na tela se mexa.
   */
  const pintados = React.useMemo(() => {
    if (arraste === null) return blocosNoPeriodo(blocos, de, ate);
    const intervalo = intervaloEntre(arraste.ancora, arraste.ponta);
    return blocosNoPeriodo(blocos, intervalo.de, intervalo.ate);
  }, [blocos, de, ate, arraste]);

  /**
   * Onde a faixa começa e termina, em % do trilho.
   *
   * A faixa é UMA barra contínua por cima dos blocos, e não doze retângulos
   * pintados um a um: é o que dá o movimento do slicer do Excel, em que a barra
   * cresce e encolhe junto com o cursor em vez de piscar bloco por bloco.
   */
  const faixa = React.useMemo(() => {
    const primeiro = pintados.indexOf(true);
    if (primeiro === -1 || blocos.length === 0) return null;
    const ultimo = pintados.lastIndexOf(true);
    const largura = 100 / blocos.length;
    return {
      esquerda: primeiro * largura,
      largura: (ultimo - primeiro + 1) * largura,
    };
  }, [pintados, blocos.length]);

  function trocarGranularidade(nova: Granularidade) {
    setGranularidade(nova);
    // A janela acompanha: trocar de MESES para DIAS tem que cair no mês que a
    // pessoa está olhando, não no mês de hoje.
    setInicioJanela(inicioDaJanela(ancoraInicial(de, ate, inicioJanela), nova));
  }

  /** Aplica o intervalo do arraste e encerra. É a ÚNICA navegação do gesto. */
  function aoSoltar() {
    const atual = arrasteRef.current;
    pararRolagem();
    if (atual === null) return;
    definirArraste(null);
    const { de: novoDe, ate: novoAte } = intervaloEntre(
      atual.ancora,
      atual.ponta,
    );
    onPeriodoChange(novoDe, novoAte);
  }

  /**
   * O bloco que está debaixo do ponteiro, pela posição X no trilho.
   *
   * Vai pela posição e não pelo `pointerenter` de cada bloco porque a faixa
   * precisa acompanhar o cursor mesmo quando ele corre rápido (o `enter` de um
   * bloco pulado nunca dispara) ou quando sai da altura do trilho no meio do
   * gesto — arrastar na diagonal é o normal, não a exceção.
   */
  function blocoNoPonteiro(clientX: number): number | null {
    const trilho = trilhoRef.current;
    if (!trilho || blocos.length === 0) return null;
    const caixa = trilho.getBoundingClientRect();
    if (caixa.width === 0) return null;
    const posicao = (clientX - caixa.left) / caixa.width;
    const indice = Math.floor(posicao * blocos.length);
    return Math.min(Math.max(indice, 0), blocos.length - 1);
  }

  /** De que lado do trilho o ponteiro saiu: -1 esquerda, 1 direita, 0 dentro. */
  function ladoForaDoTrilho(clientX: number): -1 | 0 | 1 {
    const trilho = trilhoRef.current;
    if (!trilho) return 0;
    const caixa = trilho.getBoundingClientRect();
    if (caixa.width === 0) return 0;
    if (clientX < caixa.left) return -1;
    if (clientX > caixa.right) return 1;
    return 0;
  }

  const emArraste = arraste !== null;

  /**
   * A régua está mostrando os rótulos de cinco em cinco?
   *
   * Perguntado à própria regra, e não recontando os blocos: o limite mora em
   * `mostraRotulo`, e duas contas do mesmo número acabam divergindo.
   */
  const rotulosEsparsos = !mostraRotulo(1, blocos.length);

  return (
    <div
      className="flex w-full flex-col gap-3"
      // Soltar em qualquer lugar do popover APLICA, em vez de cancelar: quem
      // arrasta até a última coluna quase sempre solta um fio de pixel fora do
      // trilho, e cancelar ali desfaria o gesto inteiro sem explicação.
      onPointerUp={aoSoltar}
    >
      {/* Navegação da janela e tamanho do bloco */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Período anterior"
            onClick={() =>
              setInicioJanela(janelaVizinha(inicioJanela, granularidade, -1))
            }
          >
            <ChevronLeft />
          </Button>
          <span className="min-w-28 text-center text-detalhe font-medium tabular-nums">
            {tituloDaJanela(inicioJanela, granularidade)}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Próximo período"
            onClick={() =>
              setInicioJanela(janelaVizinha(inicioJanela, granularidade, 1))
            }
          >
            <ChevronRight />
          </Button>
        </div>

        {/* Os cinco tamanhos, sempre à vista: um seletor escondido faria a
            pessoa descobrir por acidente que a régua faz dias. */}
        <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
          {granularidades.map((opcao) => (
            <button
              key={opcao}
              type="button"
              aria-pressed={granularidade === opcao}
              onClick={() => trocarGranularidade(opcao)}
              className={cn(
                "rounded px-2 py-1 text-legenda transition-colors",
                granularidade === opcao
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {ROTULO_GRANULARIDADE[opcao]}
            </button>
          ))}
        </div>
      </div>

      {/* A régua: os nomes em cima, a barra embaixo — o mesmo arranjo do slicer
          do Excel que o Tiago mandou de referência. A barra é UMA faixa
          contínua, não doze retângulos pintados: é o que faz ela crescer junto
          com o cursor em vez de piscar bloco a bloco. */}
      <div
        className="flex touch-none flex-col gap-1 select-none"
        role="group"
        aria-label={`${rotulo}: régua de ${ROTULO_GRANULARIDADE[granularidade].toLowerCase()}`}
      >
        <div className="flex">
          {blocos.map((bloco, i) => (
            <span
              key={bloco.inicio}
              className={cn(
                "min-w-0 flex-1 text-center text-legenda tabular-nums transition-colors",
                // Rótulo esparso transborda em vez de truncar: os vizinhos estão
                // vazios, então "16" cabe inteiro no espaço deles. Truncar aqui
                // devolveria a fileira de "1.." que este trecho existe para
                // acabar.
                rotulosEsparsos
                  ? "overflow-visible whitespace-nowrap"
                  : "truncate px-0.5",
                pintados[i]
                  ? "font-medium text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {mostraRotulo(i, blocos.length) ? bloco.rotulo : ""}
            </span>
          ))}
        </div>

        <div
          ref={trilhoRef}
          className="relative h-7 overflow-hidden rounded-md bg-muted"
          onPointerDown={(evento) => {
            // Só o botão principal: o direito abre menu de contexto e deixaria
            // o arraste preso.
            if (evento.button !== 0) return;
            const indice = blocoNoPonteiro(evento.clientX);
            const bloco = indice === null ? undefined : blocos[indice];
            if (!bloco) return;
            evento.preventDefault();
            // Captura o ponteiro: o gesto continua valendo mesmo quando o cursor
            // sai do trilho, que é o que acontece em todo arraste rápido.
            evento.currentTarget.setPointerCapture(evento.pointerId);
            comecarArraste(bloco, evento.shiftKey);
          }}
          onPointerMove={(evento) => {
            const atual = arrasteRef.current;
            if (atual === null) return;
            const lado = ladoForaDoTrilho(evento.clientX);
            rolarPelaBorda(lado);
            // Fora do trilho quem move a ponta é a rolagem, não a posição.
            if (lado !== 0) return;
            const indice = blocoNoPonteiro(evento.clientX);
            const bloco = indice === null ? undefined : blocos[indice];
            if (!bloco || bloco.inicio === atual.ponta.inicio) return;
            definirArraste({ ...atual, ponta: bloco });
          }}
          onPointerUp={aoSoltar}
        >
          {faixa === null ? null : (
            <div
              className={cn(
                "absolute inset-y-0 rounded-md bg-primary",
                // Sem transição DURANTE o arraste: aí a faixa tem que estar
                // debaixo do dedo, não a caminho dele. Fora do arraste ela
                // desliza, que é o que faz um clique em "Este mês" parecer
                // movimento e não troca de imagem.
                emArraste ? "" : "transition-all duration-150 ease-out",
              )}
              style={{
                left: `${faixa.esquerda}%`,
                width: `${faixa.largura}%`,
              }}
            />
          )}

          {/* Um alvo por bloco, por cima da faixa. Existem para o teclado e para
              o leitor de tela: o arraste é do trilho, mas ninguém navega uma
              régua de doze meses arrastando com Tab. */}
          <div className="absolute inset-0 flex">
            {blocos.map((bloco, i) => (
              <button
                key={bloco.inicio}
                type="button"
                title={bloco.descricao}
                aria-label={bloco.descricao}
                aria-pressed={pintados[i] ?? false}
                onPointerDown={(evento) => {
                  if (evento.button !== 0) return;
                  evento.preventDefault();
                  comecarArraste(bloco, evento.shiftKey);
                }}
                onPointerEnter={() => {
                  const atual = arrasteRef.current;
                  if (atual === null || atual.ponta.inicio === bloco.inicio) {
                    return;
                  }
                  definirArraste({ ...atual, ponta: bloco });
                }}
                onPointerUp={aoSoltar}
                onKeyDown={(evento) => {
                  // O teclado escolhe o bloco inteiro. É `keydown` e não
                  // `click` de propósito: num clique simples de mouse o
                  // `click` dispara DEPOIS do `pointerup`, e o `pointerup` já
                  // aplicou o mesmo intervalo — seriam duas navegações e dois
                  // refetches para um clique só, exatamente o tremor que este
                  // componente foi mexido para acabar.
                  if (evento.key !== "Enter" && evento.key !== " ") return;
                  evento.preventDefault();
                  const ancora =
                    (evento.shiftKey ? ancoraDaSelecao() : null) ?? bloco;
                  const { de: novoDe, ate: novoAte } = intervaloEntre(
                    ancora,
                    bloco,
                  );
                  onPeriodoChange(novoDe, novoAte);
                }}
                className="min-w-0 flex-1 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              />
            ))}
          </div>
        </div>
      </div>

      {/* O caminho para o intervalo que atravessa a janela precisa estar
          escrito: Shift+clique não se descobre por acidente. */}
      <p className="text-legenda text-muted-foreground">
        Para ir além {DESTA_JANELA[granularidade]}, escolha o início, avance com
        ◀ ▶ e dê Shift + clique no fim — ou arraste para fora da régua.
      </p>

      {/* As datas exatas. Ficam DEPOIS da régua porque são o ajuste fino: a
          régua dá o intervalo redondo, e aqui se corta no dia. */}
      {/* Não renderizado, e não só escondido por CSS: campo com `hidden` continua
          no DOM, continua alcançável por leitor de tela e continua entrando na
          navegação por Tab em alguns navegadores. */}
      {semDataExata ? null : (
        <div className="flex items-center gap-1.5">
          <span className="text-legenda text-muted-foreground">De</span>
          <Input
            type="date"
            value={de}
            max={ate === "" ? undefined : ate}
            onChange={(evento) => onPeriodoChange(evento.target.value, ate)}
            aria-label={`${rotulo}: data inicial`}
            className="h-8 flex-1 text-detalhe tabular-nums"
          />
          <span className="text-legenda text-muted-foreground">até</span>
          <Input
            type="date"
            value={ate}
            min={de === "" ? undefined : de}
            onChange={(evento) => onPeriodoChange(de, evento.target.value)}
            aria-label={`${rotulo}: data final`}
            className="h-8 flex-1 text-detalhe tabular-nums"
          />
        </div>
      )}

      {/* Atalhos do que se pergunta toda semana. Não substituem a régua: são o
          caminho de UM clique para os cortes que já têm nome. */}
      <div className="flex flex-wrap gap-1.5">
        <Atalho
          rotulo="Este mês"
          aoEscolher={() => onPeriodoChange(...mesDe(hoje))}
        />
        <Atalho
          rotulo="Mês passado"
          aoEscolher={() => onPeriodoChange(...mesDe(mesAtras(hoje)))}
        />
        <Atalho
          rotulo="Este ano"
          aoEscolher={() =>
            onPeriodoChange(
              `${hoje.slice(0, 4)}-01-01`,
              `${hoje.slice(0, 4)}-12-31`,
            )
          }
        />
        {de === "" && ate === "" ? null : (
          <Atalho rotulo="Limpar" aoEscolher={() => onPeriodoChange("", "")} />
        )}
      </div>
    </div>
  );
}

function Atalho({
  rotulo,
  aoEscolher,
}: {
  rotulo: string;
  aoEscolher: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 text-legenda"
      onClick={aoEscolher}
    >
      {rotulo}
    </Button>
  );
}

/** O mês inteiro de uma data, como par [de, ate]. */
function mesDe(iso: string): [string, string] {
  const primeiro = `${iso.slice(0, 7)}-01`;
  const [ano, mes] = iso.split("-").map(Number) as [number, number];
  const ultimo = new Date(Date.UTC(ano, mes, 0));
  const dia = String(ultimo.getUTCDate()).padStart(2, "0");
  return [primeiro, `${iso.slice(0, 7)}-${dia}`];
}

/** Um mês para trás, sobre o dia 1: só alimenta `mesDe`. */
function mesAtras(iso: string): string {
  const [ano, mes] = iso.split("-").map(Number) as [number, number];
  const anterior = mes === 1 ? 12 : mes - 1;
  const anoAnterior = mes === 1 ? ano - 1 : ano;
  return `${String(anoAnterior).padStart(4, "0")}-${String(anterior).padStart(2, "0")}-01`;
}

/** Reexportado para quem monta a régua fora da barra saber validar a data. */
export { ehDataISO };
