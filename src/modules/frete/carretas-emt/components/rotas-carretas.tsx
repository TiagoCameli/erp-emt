"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, CheckCheck, ExternalLink, MousePointerClick, TriangleAlert } from "lucide-react";

import { ConfirmDialog, MoneyText } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatarBRL } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import { Alternador } from "@/modules/combustivel/painel/components/cartao-grafico";
import { conferirAlertasCarretas } from "@/modules/frete/carretas-emt/actions";
import { rotuloMes } from "@/modules/frete/carretas-emt/calculo";
import { linkDosFretes, type AlertaRota, type LinhaRota } from "@/modules/frete/carretas-emt/rotas";
import { ROTULO_TIPO_FRETE, type TipoFrete } from "@/modules/frete/fretes/schemas";

import type { CamadaMapa } from "./mapa-rotas-impl";

/**
 * A seção "Rotas das carretas": resumo, mapa com o cartão da rota em foco, alertas e a tabela.
 *
 * Mapa e tabela andam juntos: passar o mouse numa linha acende a rota no mapa (e o contrário), e
 * clicar filtra a aba pela rota (URL), o que faz o mapa voar até ela. O número da rota é o mesmo
 * nos dois lugares e não muda com a ordenação da tabela (é a posição pela produção).
 */

/** O Leaflet mexe em `window` no import: só no navegador, com a altura reservada. */
const MapaRotas = dynamic(() => import("./mapa-rotas-impl").then((m) => m.MapaRotas), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

const CAMADAS = [
  { id: "mapa", rotulo: "Mapa" },
  { id: "satelite", rotulo: "Satélite" },
] as const;

const TH = "px-3 py-2 font-medium";
const TD = "px-3 py-2";

const numero = (v: number | null, casas = 0) =>
  v === null ? null : v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

function Vazio({ texto = "Sem dado" }: { texto?: string }) {
  return <span className="text-muted-foreground">{texto}</span>;
}

const ehTransferencia = (r: LinhaRota) => r.tipos.length === 1 && r.tipos[0] === "transferencia";
const corDaRota = (r: LinhaRota) => (ehTransferencia(r) ? "var(--viz-custo)" : "var(--viz-producao)");

function textoTempo(rota: LinhaRota): string | null {
  if (rota.diasMedio === null) return null;
  if (rota.diasMedio < 0.5) return "No mesmo dia";
  return `${numero(rota.diasMedio, 1)} dias`;
}

function NumeroDaRota({ rota, n, grande = false }: { rota: LinhaRota; n: number; grande?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white tabular-nums",
        grande ? "size-7 text-sm" : "size-5 text-[11px]",
      )}
      style={{ background: corDaRota(rota) }}
      aria-label={`Rota ${n}`}
    >
      {n}
    </span>
  );
}

/** Viagens por mês em barrinhas, com o mês de maior volume em destaque. */
function Minigrafico({ rota, largura = 84, altura = 22 }: { rota: LinhaRota; largura?: number; altura?: number }) {
  const serie = rota.porMes;
  const maior = Math.max(...serie.map((m) => m.viagens), 1);
  if (serie.length === 0) return null;
  const passo = largura / serie.length;
  const barra = Math.max(1.5, passo - 1.5);
  const descricao = serie.map((m) => `${rotuloMes(m.mes)}: ${m.viagens}`).join(" · ");
  return (
    <svg width={largura} height={altura} role="img" aria-label={`Viagens por mês: ${descricao}`} className="shrink-0">
      <title>{descricao}</title>
      {serie.map((m, i) => {
        const h = m.viagens === 0 ? 1 : Math.max(2, (m.viagens / maior) * altura);
        return (
          <rect
            key={m.mes}
            x={i * passo}
            y={altura - h}
            width={barra}
            height={h}
            rx={1}
            fill={m.viagens === 0 ? "var(--border)" : corDaRota(rota)}
            opacity={m.viagens === maior ? 1 : 0.55}
          />
        );
      })}
    </svg>
  );
}

/** Km lançado contra o da estrada: até 5% é ruído de rota; acima disso vale olhar. */
function Desvio({ desvio }: { desvio: number | null }) {
  if (desvio === null) return null;
  const pct = desvio * 100;
  const alto = Math.abs(pct) > 5;
  return (
    <span
      className={cn(
        "rounded px-1 text-legenda tabular-nums",
        alto ? "bg-status-pendente/10 text-status-pendente" : "text-muted-foreground",
      )}
      title="Km lançado no frete comparado com o km pela estrada"
    >
      {alto ? `${pct > 0 ? "+" : ""}${numero(pct, 0)}%` : "≈ estrada"}
    </span>
  );
}

/** O cartão sobre o mapa: a rota em foco, ou o resumo quando não há foco. */
function CartaoDoMapa({ rota, n, total }: { rota: LinhaRota | null; n: number | null; total: { producao: number; viagens: number; rotas: number } }) {
  if (!rota || n === null) {
    return (
      <div className="w-64 rounded-lg border border-border bg-popover/95 p-3 text-detalhe shadow-lg backdrop-blur">
        <p className="text-legenda uppercase tracking-wide text-muted-foreground">Todas as rotas</p>
        <p className="mt-1 text-titulo font-semibold tabular-nums text-foreground">{formatarBRL(total.producao)}</p>
        <p className="text-muted-foreground">
          {numero(total.viagens)} viagens em {total.rotas} {total.rotas === 1 ? "rota" : "rotas"}
        </p>
        <p className="mt-2 flex items-center gap-1.5 text-legenda text-muted-foreground">
          <MousePointerClick className="size-3.5" aria-hidden />
          Passe o mouse numa rota para ver os números
        </p>
      </div>
    );
  }
  const tempo = textoTempo(rota);
  const linhas: [string, React.ReactNode][] = [
    ["Viagens", numero(rota.viagens)],
    ["Toneladas", numero(rota.toneladas, 1)],
    ["Por viagem", rota.producaoPorViagem === null ? "Sem dado" : formatarBRL(rota.producaoPorViagem)],
    ["Por tonelada", rota.producaoPorTonelada === null ? "Sem dado" : formatarBRL(rota.producaoPorTonelada)],
    ["Km estrada", rota.kmMapa === null ? "Sem traçado" : `${numero(rota.kmMapa)} km`],
    ["Km lançado", rota.kmMedio === null ? "Sem dado" : `${numero(rota.kmMedio)} km`],
    ["Tempo médio", tempo ?? "Sem chegada"],
    ["De estrada", rota.horasMapa === null ? "Sem dado" : `~${numero(rota.horasMapa, 1)} h`],
  ];
  return (
    <div className="w-80 rounded-lg border border-border bg-popover/95 p-3 text-detalhe shadow-lg backdrop-blur">
      <div className="flex items-start gap-2">
        <NumeroDaRota rota={rota} n={n} grande />
        <div className="min-w-0">
          <p className="font-semibold leading-tight text-foreground">
            {rota.origem.nome} → {rota.destino.nome}
          </p>
          <p className="text-legenda text-muted-foreground">{rota.tipos.map((t) => ROTULO_TIPO_FRETE[t as TipoFrete] ?? t).join(", ")}</p>
        </div>
      </div>
      <p className="mt-2 text-titulo font-semibold tabular-nums text-foreground">{formatarBRL(rota.producao)}</p>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
        {linhas.map(([rotulo, valor]) => (
          <div key={rotulo} className="min-w-0">
            <dt className="text-legenda text-muted-foreground">{rotulo}</dt>
            <dd className="truncate font-medium tabular-nums text-foreground">{valor}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-2 border-t border-border pt-2">
        <p className="mb-1 text-legenda text-muted-foreground">Viagens por mês</p>
        <Minigrafico rota={rota} largura={296} altura={34} />
      </div>
    </div>
  );
}

type Ordem = "producao" | "viagens" | "toneladas" | "porViagem" | "porTonelada" | "km" | "tempo";

const COLUNAS: { id: Ordem | null; rotulo: string; direita: boolean; dica?: string }[] = [
  { id: null, rotulo: "Rota", direita: false },
  { id: "viagens", rotulo: "Viagens por mês", direita: false, dica: "Barrinhas: viagens em cada mês do período" },
  { id: "toneladas", rotulo: "Toneladas", direita: true },
  { id: "producao", rotulo: "Produção", direita: true },
  { id: "porViagem", rotulo: "R$/viagem", direita: true },
  { id: "porTonelada", rotulo: "R$/t", direita: true },
  { id: "km", rotulo: "Km estrada / lançado", direita: true },
  { id: "tempo", rotulo: "Tempo médio", direita: true },
];

function valorDaOrdem(r: LinhaRota, ordem: Ordem): number {
  switch (ordem) {
    case "viagens":
      return r.viagens;
    case "toneladas":
      return r.toneladas;
    case "porViagem":
      return r.producaoPorViagem ?? -1;
    case "porTonelada":
      return r.producaoPorTonelada ?? -1;
    case "km":
      return r.kmMapa ?? r.kmMedio ?? -1;
    case "tempo":
      return r.diasMedio ?? -1;
    default:
      return r.producao;
  }
}

function AlertasDasRotas({
  alertas,
  numeroDaRota,
  podeConferir,
}: {
  alertas: AlertaRota[];
  numeroDaRota: (rotaChave: string) => number | null;
  podeConferir: boolean;
}) {
  const router = useRouter();
  const [conferindo, setConferindo] = React.useState<AlertaRota | null>(null);

  async function conferir() {
    if (!conferindo) return;
    const resultado = await conferirAlertasCarretas({ regra: conferindo.regra, freteIds: conferindo.freteIds, conferida: true });
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(resultado.total === 1 ? "Frete conferido: o alerta saiu" : `${resultado.total} fretes conferidos: o alerta saiu`);
    setConferindo(null);
    router.refresh();
  }

  return (
    <div className="flex items-start gap-2 rounded-md border border-status-pendente/40 bg-status-pendente/5 px-3 py-2 text-detalhe text-foreground">
      <TriangleAlert className="mt-1 size-4 shrink-0 text-status-pendente" aria-hidden />
      <ul className="min-w-0 flex-1 divide-y divide-status-pendente/20">
        {alertas.map((a) => {
          const n = numeroDaRota(a.rotaChave);
          return (
            <li key={a.chave} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="font-medium">
                  {n !== null ? `${n}. ` : ""}
                  {a.origemNome} → {a.destinoNome}:
                </span>{" "}
                {a.mensagem}
              </span>
              <span className="flex flex-wrap items-center gap-1.5">
                <Button asChild variant="outline" size="sm" className="h-7">
                  <Link href={linkDosFretes(a.freteIds)}>
                    <ExternalLink />
                    {a.freteIds.length === 1 ? "Ver o frete" : `Ver os ${a.freteIds.length} fretes`}
                  </Link>
                </Button>
                {podeConferir ? (
                  <Button type="button" variant="outline" size="sm" className="h-7" onClick={() => setConferindo(a)}>
                    <CheckCheck />
                    Marcar como conferido
                  </Button>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        aberto={conferindo !== null}
        onAbertoChange={(aberto) => (aberto ? null : setConferindo(null))}
        titulo="Marcar alerta como conferido"
        descricao={
          conferindo
            ? `${conferindo.freteIds.length === 1 ? "Este frete sai" : `Estes ${conferindo.freteIds.length} fretes saem`} do alerta de ${conferindo.origemNome} → ${conferindo.destinoNome}. Frete novo fora do padrão volta a aparecer.`
            : ""
        }
        textoConfirmar="Marcar como conferido"
        onConfirmar={conferir}
      />
    </div>
  );
}

export function RotasCarretas({
  rotas,
  alertas,
  rotaSelecionada,
  onSelecionarRota,
  podeConferir,
}: {
  rotas: LinhaRota[];
  alertas: AlertaRota[];
  /** A rota do filtro da aba ("" = todas). */
  rotaSelecionada: string;
  /** Liga ou desliga o filtro da aba pela rota (null = todas). */
  onSelecionarRota: (rota: string | null) => void;
  podeConferir: boolean;
}) {
  const [camada, setCamada] = React.useState<CamadaMapa>("mapa");
  const [destacada, setDestacada] = React.useState<string | null>(null);
  const [ordem, setOrdem] = React.useState<{ por: Ordem; desc: boolean }>({ por: "producao", desc: true });
  const selecionada = rotaSelecionada || null;
  const alternar = (chave: string | null) => onSelecionarRota(chave === null || chave === selecionada ? null : chave);

  // O número da rota é a posição pela produção (como chega), e não muda com a ordenação.
  const numeroPorChave = React.useMemo(() => new Map(rotas.map((r, i) => [r.chave, i + 1])), [rotas]);
  const numeroDaRota = React.useCallback((chave: string) => numeroPorChave.get(chave) ?? null, [numeroPorChave]);

  const ordenadas = React.useMemo(() => {
    const lista = [...rotas];
    lista.sort((a, b) => (valorDaOrdem(a, ordem.por) - valorDaOrdem(b, ordem.por)) * (ordem.desc ? -1 : 1));
    return lista;
  }, [rotas, ordem]);

  const totalProducao = rotas.reduce((s, r) => s + Math.round(r.producao * 100), 0) / 100;
  const totalViagens = rotas.reduce((s, r) => s + r.viagens, 0);
  const totalToneladas = rotas.reduce((s, r) => s + r.toneladas, 0);
  const kmRodados = rotas.reduce((s, r) => s + (r.kmMedio ?? 0) * r.viagens, 0);
  const comChegada = rotas.reduce((s, r) => s + (r.diasMedio === null ? 0 : r.viagens - r.semChegada), 0);
  const diasPonderados = rotas.reduce((s, r) => s + (r.diasMedio ?? 0) * (r.viagens - r.semChegada), 0);
  const principal = rotas[0];

  const emFoco = rotas.find((r) => r.chave === (destacada ?? selecionada)) ?? null;

  if (rotas.length === 0) {
    return <p className="py-2 text-detalhe text-muted-foreground">Nenhum frete com origem e destino no recorte escolhido.</p>;
  }

  const resumo: [string, React.ReactNode, React.ReactNode?][] = [
    ["Rotas", numero(rotas.length), `${numero(totalViagens)} viagens`],
    ["Km rodados", `${numero(kmRodados)} km`, `${numero(totalToneladas)} t transportadas`],
    [
      "Rota principal",
      principal ? `${numero((principal.producao / Math.max(totalProducao, 1)) * 100, 0)}% da produção` : "Sem dado",
      principal ? `${principal.origem.nome} → ${principal.destino.nome}` : undefined,
    ],
    ["Tempo médio", comChegada > 0 ? `${numero(diasPonderados / comChegada, 1)} dias` : "Sem chegada", "da saída à chegada, ponderado"],
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {resumo.map(([rotulo, valor, detalhe]) => (
          <div key={rotulo} className="rounded-lg border border-border bg-card px-3 py-2">
            <p className="text-legenda uppercase tracking-wide text-muted-foreground">{rotulo}</p>
            <p className="truncate font-semibold tabular-nums text-foreground">{valor}</p>
            {detalhe ? <p className="truncate text-legenda text-muted-foreground">{detalhe}</p> : null}
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3 pb-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-detalhe text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-5 rounded-full" style={{ background: "var(--viz-producao)" }} /> Material
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-5 rounded-full" style={{ background: "var(--viz-custo)" }} /> Transferência
            </span>
            <span>Linha mais grossa = mais produção · o fluxo anda no sentido da carga</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-full border-2 border-foreground" /> pedreira
              <span className="ml-1 inline-block size-2.5 rounded-full bg-foreground" /> destino
            </span>
          </div>
          <Alternador rotulo="Tipo de mapa" opcoes={CAMADAS} valor={camada} onValorChange={setCamada} />
        </div>
        {/* `isolate`: os painéis do Leaflet têm z-index 400+, e sem um contexto próprio passariam
            por cima dos menus e do cabeçalho do app. */}
        <div className="relative isolate h-[520px] px-2 pb-2">
          <MapaRotas
            rotas={rotas}
            camada={camada}
            selecionada={selecionada}
            destacada={destacada}
            onSelecionar={(chave) => alternar(chave)}
            onDestacar={setDestacada}
            numeroDaRota={numeroDaRota}
          />
          <div className="pointer-events-none absolute top-3 right-5 z-[1000] hidden md:block">
            <CartaoDoMapa
              rota={emFoco}
              n={emFoco ? numeroDaRota(emFoco.chave) : null}
              total={{ producao: totalProducao, viagens: totalViagens, rotas: rotas.length }}
            />
          </div>
          <p className="pointer-events-none absolute bottom-4 left-5 z-[1000] rounded bg-popover/90 px-2 py-0.5 text-legenda text-muted-foreground">
            Clique no mapa para dar zoom com a roda do mouse
          </p>
        </div>
      </div>

      {alertas.length > 0 ? (
        <AlertasDasRotas alertas={alertas} numeroDaRota={numeroDaRota} podeConferir={podeConferir} />
      ) : null}

      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <table className="w-full text-detalhe">
          <thead>
            <tr className="border-b border-border text-legenda text-muted-foreground">
              {COLUNAS.map((c) => {
                const ativa = c.id !== null && ordem.por === c.id;
                return (
                  <th
                    key={c.rotulo}
                    scope="col"
                    title={c.dica}
                    aria-sort={ativa ? (ordem.desc ? "descending" : "ascending") : undefined}
                    className={cn(TH, c.direita ? "text-right" : "text-left", "whitespace-nowrap")}
                  >
                    {c.id === null ? (
                      c.rotulo
                    ) : (
                      <button
                        type="button"
                        onClick={() => setOrdem((o) => ({ por: c.id as Ordem, desc: o.por === c.id ? !o.desc : true }))}
                        className={cn("inline-flex items-center gap-1 hover:text-foreground", ativa && "text-foreground")}
                      >
                        {c.rotulo}
                        {ativa ? ordem.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" /> : null}
                      </button>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((r) => {
              const n = numeroDaRota(r.chave) ?? 0;
              const parte = totalProducao > 0 ? r.producao / totalProducao : 0;
              const ativa = selecionada === r.chave;
              const acesa = destacada === r.chave;
              const tempo = textoTempo(r);
              return (
                <tr
                  key={r.chave}
                  tabIndex={0}
                  aria-selected={ativa}
                  onClick={() => alternar(r.chave)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      alternar(r.chave);
                    }
                  }}
                  onMouseEnter={() => setDestacada(r.chave)}
                  onMouseLeave={() => setDestacada(null)}
                  onFocus={() => setDestacada(r.chave)}
                  onBlur={() => setDestacada(null)}
                  title={ativa ? "Clique para ver todas as rotas" : "Clique para filtrar a aba por esta rota"}
                  className={cn(
                    "cursor-pointer border-b border-border transition-colors last:border-b-0 focus-visible:outline-none",
                    ativa ? "bg-primary/10" : acesa ? "bg-surface" : "hover:bg-surface",
                  )}
                  style={{ boxShadow: ativa || acesa ? `inset 3px 0 0 ${corDaRota(r)}` : undefined }}
                >
                  <td className={cn(TD, "min-w-64")}>
                    <div className="flex items-center gap-2">
                      <NumeroDaRota rota={r} n={n} />
                      <div className="min-w-0">
                        <p className={cn("whitespace-nowrap text-foreground", ativa ? "font-semibold" : "font-medium")}>
                          {r.origem.nome} → {r.destino.nome}
                          {r.temAlerta ? (
                            <TriangleAlert className="ml-1.5 inline size-3.5 text-status-pendente" aria-label="Rota com alerta" />
                          ) : null}
                        </p>
                        <p className="text-legenda text-muted-foreground">{r.tipos.map((t) => ROTULO_TIPO_FRETE[t as TipoFrete] ?? t).join(", ")}</p>
                      </div>
                    </div>
                  </td>
                  <td className={TD}>
                    <div className="flex items-center gap-2">
                      <Minigrafico rota={r} />
                      <span className="tabular-nums text-foreground">{numero(r.viagens)}</span>
                    </div>
                  </td>
                  <td className={cn(TD, "text-right tabular-nums")}>{numero(r.toneladas, 1)}</td>
                  <td className={cn(TD, "min-w-44 text-right")}>
                    <MoneyText valor={r.producao} />
                    <div className="mt-1 flex items-center justify-end gap-1.5">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <div className="h-full rounded-full" style={{ width: `${Math.max(2, parte * 100)}%`, background: corDaRota(r) }} />
                      </div>
                      <span className="w-10 text-legenda tabular-nums text-muted-foreground">{numero(parte * 100, 1)}%</span>
                    </div>
                  </td>
                  <td className={cn(TD, "text-right")}>{r.producaoPorViagem === null ? <Vazio /> : <MoneyText valor={r.producaoPorViagem} />}</td>
                  <td className={cn(TD, "text-right")}>{r.producaoPorTonelada === null ? <Vazio /> : <MoneyText valor={r.producaoPorTonelada} />}</td>
                  <td className={cn(TD, "text-right tabular-nums whitespace-nowrap")}>
                    <span className="inline-flex flex-col items-end gap-0.5">
                      <span>
                        {r.kmMapa === null ? <Vazio texto="Sem traçado" /> : `${numero(r.kmMapa)} km`}
                        <span className="text-muted-foreground"> / </span>
                        {r.kmMedio === null ? <Vazio /> : `${numero(r.kmMedio)} km`}
                      </span>
                      <Desvio desvio={r.desvioKm} />
                    </span>
                  </td>
                  <td className={cn(TD, "text-right whitespace-nowrap")}>
                    <span className="inline-flex flex-col items-end">
                      {tempo ? <span className="tabular-nums">{tempo}</span> : <Vazio texto="Sem chegada" />}
                      <span className="text-legenda text-muted-foreground">
                        {r.horasMapa !== null ? `~${numero(r.horasMapa, 1)} h de estrada` : ""}
                        {r.semChegada > 0 && tempo ? `${r.horasMapa !== null ? " · " : ""}${r.semChegada} sem chegada` : ""}
                      </span>
                    </span>
                  </td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-border bg-surface font-semibold">
              <td className={TD}>Total</td>
              <td className={cn(TD, "tabular-nums")}>{numero(totalViagens)} viagens</td>
              <td className={cn(TD, "text-right tabular-nums")}>{numero(totalToneladas, 1)}</td>
              <td className={cn(TD, "text-right")}>
                <MoneyText valor={totalProducao} />
              </td>
              <td className={cn(TD, "text-right")}>{totalViagens > 0 ? <MoneyText valor={totalProducao / totalViagens} /> : null}</td>
              <td className={cn(TD, "text-right")}>{totalToneladas > 0 ? <MoneyText valor={totalProducao / totalToneladas} /> : null}</td>
              <td className={cn(TD, "text-right tabular-nums")}>{`${numero(kmRodados)} km rodados`}</td>
              <td className={TD} />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-legenda text-muted-foreground">
        Clique numa coluna para ordenar; numa rota, para filtrar a aba. Tempo médio = dias entre a data de saída e a de chegada do
        frete (o frete não guarda hora). Km estrada: calculado no OpenStreetMap; km lançado: a média do que está nos fretes.
      </p>
    </div>
  );
}
