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

  /** Bloco onde o arraste começou. `null` quando ninguém está arrastando. */
  const [arrastandoDe, setArrastandoDe] = React.useState<BlocoDaRegua | null>(
    null,
  );

  const blocos = React.useMemo(
    () => blocosDaJanela(inicioJanela, granularidade),
    [inicioJanela, granularidade],
  );
  const pintados = React.useMemo(
    () => blocosNoPeriodo(blocos, de, ate),
    [blocos, de, ate],
  );

  function trocarGranularidade(nova: Granularidade) {
    setGranularidade(nova);
    // A janela acompanha: trocar de MESES para DIAS tem que cair no mês que a
    // pessoa está olhando, não no mês de hoje.
    setInicioJanela(inicioDaJanela(ancoraInicial(de, ate, inicioJanela), nova));
  }

  function aoTerminarArraste(bloco: BlocoDaRegua) {
    const inicio = arrastandoDe ?? bloco;
    const { de: novoDe, ate: novoAte } = intervaloEntre(inicio, bloco);
    onPeriodoChange(novoDe, novoAte);
    setArrastandoDe(null);
  }

  /** Enquanto arrasta, o intervalo já pintado é o do arraste, não o gravado. */
  const emArraste = arrastandoDe !== null;

  return (
    <div
      className="flex w-full flex-col gap-3"
      // Soltar o dedo fora dos blocos cancela: sem isto, um arraste que termina
      // na borda do popover deixaria o componente achando que ainda arrasta.
      onPointerUp={() => setArrastandoDe(null)}
      onPointerLeave={() => setArrastandoDe(null)}
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

      {/* A régua. `select-none` porque arrastar sobre texto seleciona texto, e
          aí o navegador mostra a barra azul de seleção por cima dos blocos. */}
      <div
        className="flex touch-none select-none items-stretch gap-px overflow-hidden rounded-md border border-border"
        role="group"
        aria-label={`${rotulo}: régua de ${ROTULO_GRANULARIDADE[granularidade].toLowerCase()}`}
      >
        {blocos.map((bloco, i) => {
          const dentro = pintados[i] ?? false;
          return (
            <button
              key={bloco.inicio}
              type="button"
              title={bloco.descricao}
              aria-label={bloco.descricao}
              aria-pressed={dentro}
              onPointerDown={(evento) => {
                // Só o botão principal: o direito abre menu de contexto e
                // deixaria o arraste preso.
                if (evento.button !== 0) return;
                evento.preventDefault();
                setArrastandoDe(bloco);
              }}
              onPointerEnter={() => {
                if (!emArraste) return;
                const { de: novoDe, ate: novoAte } = intervaloEntre(
                  arrastandoDe,
                  bloco,
                );
                onPeriodoChange(novoDe, novoAte);
              }}
              onPointerUp={() => aoTerminarArraste(bloco)}
              className={cn(
                // `px-0.5` porque a régua de DIAS tem 31 blocos: com o padding
                // de 4px de cada lado, "31" não cabia e saía como reticência.
                "min-w-0 flex-1 px-0.5 py-2 text-legenda tabular-nums transition-colors",
                dentro
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <span className="block truncate">{bloco.rotulo}</span>
            </button>
          );
        })}
      </div>

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
