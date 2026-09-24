"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bookmark, Plus, Trash2, X } from "lucide-react";

import { FiltroPeriodo, FiltroSelectMulti, useFiltrosUrl } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { escreverListaNaUrl } from "@/modules/financeiro/_shared/listas-na-url";
import {
  alternarValor,
  CHAVE_DA_DIMENSAO,
  mudancasParaLimpar,
  pontasDoPeriodo,
  temFiltroAtivo,
  type DimensaoFiltro,
  type FiltroGlobal,
  type OpcoesFiltroGlobal,
} from "@/modules/combustivel/_shared/filtro-global";
import { CHAVES_RECORTE } from "@/modules/combustivel/_shared/navegacao";

/**
 * A barra de filtros global do Combustível: a FilterBar + FilterChips da origem
 * (v2/filters), sobre a URL (`CHAVES_RECORTE`). Qualquer aba a usa assim:
 *
 * ```tsx
 * const filtro = filtroGlobalDaUrl(await searchParams);
 * const opcoes = await carregarOpcoesFiltroGlobal(filtro);
 * <BarraFiltrosCombustivel filtro={filtro} opcoes={opcoes} />
 * ```
 *
 * O período é o `FiltroPeriodo` canônico, o mesmo do resto do ERP: sem período é qualquer
 * data, e o X limpa de verdade. Antes era um popover próprio com presets e "Aplicar", e a
 * página reinjetava os últimos 30 dias quando a URL ficava sem `de`/`ate` — o filtro nunca
 * desligava (relatado pelo Tiago em 24/09/2026).
 *
 * `filtro` vem da página; `opcoes`, prontas. Cada
 * mudança é UMA navegação (`useFiltrosUrl().setMuitos`), e zera a `pagina` de quem lista.
 */

const GATILHO = "h-8 gap-1.5 text-detalhe font-normal";
const GATILHO_ATIVO = "border-primary bg-primary/10 font-medium text-primary hover:bg-primary/15 hover:text-primary";

export interface BarraFiltrosCombustivelProps {
  filtro: FiltroGlobal;
  opcoes: OpcoesFiltroGlobal;
  /** Listas que a aba não usa (ex.: fornecedor numa aba só de saídas). */
  ocultar?: readonly DimensaoFiltro[];
  className?: string;
}

/**
 * Escrever o recorte na URL: a barra e o clique nos gráficos (o cross-filter da origem:
 * clicar numa barra liga/desliga aquele item no filtro global).
 */
export function useRecorteCombustivel(filtro: FiltroGlobal) {
  const { setMuitos } = useFiltrosUrl();
  return React.useMemo(
    () => ({
      definirLista(dimensao: DimensaoFiltro, valores: string[]) {
        setMuitos({ [CHAVE_DA_DIMENSAO[dimensao]]: escreverListaNaUrl(valores), pagina: null });
      },
      alternar(dimensao: DimensaoFiltro, valor: string) {
        setMuitos({
          [CHAVE_DA_DIMENSAO[dimensao]]: escreverListaNaUrl(alternarValor(filtro[dimensao], valor)),
          pagina: null,
        });
      },
      /** Período escolhido; ponta vazia sai da URL (os dois vazios = qualquer data). */
      definirPeriodo(de: string, ate: string) {
        setMuitos({ de: de === "" ? null : de, ate: ate === "" ? null : ate, pagina: null });
      },
      limpar() {
        setMuitos({ ...mudancasParaLimpar(), pagina: null });
      },
    }),
    [filtro, setMuitos],
  );
}

export function BarraFiltrosCombustivel({ filtro, opcoes, ocultar = [], className }: BarraFiltrosCombustivelProps) {
  const recorte = useRecorteCombustivel(filtro);
  const proprios = filtro.modo === "proprios";
  const mostra = (dimensao: DimensaoFiltro) => !ocultar.includes(dimensao) && opcoes[dimensao].length > 0;

  const multi = (dimensao: DimensaoFiltro, rotulo: string) =>
    mostra(dimensao) ? (
      <FiltroSelectMulti
        key={dimensao}
        valores={filtro[dimensao]}
        onValoresChange={(valores) => recorte.definirLista(dimensao, valores)}
        opcoes={opcoes[dimensao]}
        todosRotulo={rotulo}
        className={cn(filtro[dimensao].length > 0 && GATILHO_ATIVO)}
      />
    ) : null;

  return (
    <div className={cn("mb-4 rounded-lg border border-border bg-card", className)}>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <FiltroPeriodo
          de={pontasDoPeriodo(filtro.periodo).de}
          ate={pontasDoPeriodo(filtro.periodo).ate}
          onPeriodoChange={(de, ate) => recorte.definirPeriodo(de, ate)}
        />
        {multi("obras", "Obra")}
        {proprios ? multi("equipamentos", "Equipamento") : null}
        {!proprios ? multi("transportadoras", "Transportadora") : null}
        {!proprios ? multi("placas", "Placa") : null}
        {multi("tanques", "Tanque")}
        {mostra("combustiveis") ? (
          <ChipsCombustivel
            valores={filtro.combustiveis}
            opcoes={opcoes.combustiveis}
            onValoresChange={(valores) => recorte.definirLista("combustiveis", valores)}
          />
        ) : null}
        {multi("fornecedores", "Fornecedor")}
        {multi("operadores", proprios ? "Operador" : "Motorista")}
        <div className="flex-1" />
        <VisoesSalvas />
      </div>
      <ChipsAtivos filtro={filtro} opcoes={opcoes} ocultar={ocultar} />
    </div>
  );
}

/**
 * O tipo de combustível como chips (a origem: "mais rápido que popover pra 4-5 itens").
 * Estado local à frente da URL, senão o segundo clique rápido apaga o primeiro (o mesmo
 * motivo do `FiltroSelectMulti`).
 */
function ChipsCombustivel({
  valores,
  opcoes,
  onValoresChange,
}: {
  valores: string[];
  opcoes: OpcoesFiltroGlobal["combustiveis"];
  onValoresChange: (valores: string[]) => void;
}) {
  const chaveDoServidor = valores.join(",");
  const [escolhidos, setEscolhidos] = React.useState(valores);
  const [chaveAnterior, setChaveAnterior] = React.useState(chaveDoServidor);
  if (chaveAnterior !== chaveDoServidor) {
    setChaveAnterior(chaveDoServidor);
    setEscolhidos(valores);
  }
  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Combustível">
      {opcoes.map((opcao) => {
        const ativo = escolhidos.includes(opcao.valor);
        return (
          <button
            key={opcao.valor}
            type="button"
            aria-pressed={ativo}
            onClick={() => {
              const novos = alternarValor(escolhidos, opcao.valor);
              setEscolhidos(novos);
              onValoresChange(novos);
            }}
            className={cn(
              "h-8 rounded-md border px-2.5 text-legenda transition-colors",
              ativo
                ? "border-primary bg-primary/10 font-medium text-primary"
                : "border-border bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            {opcao.rotulo}
          </button>
        );
      })}
    </div>
  );
}

interface Chip {
  dimensao: DimensaoFiltro;
  valor: string;
  rotulo: string;
}

const PREFIXO: Record<DimensaoFiltro, string> = {
  obras: "Obra",
  equipamentos: "Equip",
  transportadoras: "Transp",
  placas: "Placa",
  tanques: "Tanque",
  combustiveis: "Combustível",
  fornecedores: "Fornecedor",
  operadores: "Operador",
};

/** Os chips dos filtros ativos, com ✕ e "Limpar tudo" (a FilterChips da origem). */
function ChipsAtivos({
  filtro,
  opcoes,
  ocultar,
}: {
  filtro: FiltroGlobal;
  opcoes: OpcoesFiltroGlobal;
  ocultar: readonly DimensaoFiltro[];
}) {
  const recorte = useRecorteCombustivel(filtro);
  if (!temFiltroAtivo(filtro)) return null;

  const proprios = filtro.modo === "proprios";
  const vale = (dimensao: DimensaoFiltro) =>
    !ocultar.includes(dimensao) &&
    !(proprios && (dimensao === "transportadoras" || dimensao === "placas")) &&
    !(!proprios && dimensao === "equipamentos");

  // O período não vira chip: o FiltroPeriodo já mostra o resumo e tem o X dele, como em
  // toda barra do ERP. Dois lugares para limpar a mesma coisa só confundem.
  const chips: Chip[] = [];
  for (const dimensao of Object.keys(PREFIXO) as DimensaoFiltro[]) {
    if (!vale(dimensao)) continue;
    const prefixo = dimensao === "operadores" && !proprios ? "Motorista" : PREFIXO[dimensao];
    for (const valor of filtro[dimensao]) {
      const nome = opcoes[dimensao].find((o) => o.valor === valor)?.rotulo ?? valor;
      chips.push({ dimensao, valor, rotulo: `${prefixo}: ${nome}` });
    }
  }
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-3 py-2">
      {chips.map((chip) => (
        <button
          key={`${chip.dimensao}-${chip.valor}`}
          type="button"
          aria-label={`Remover ${chip.rotulo}`}
          onClick={() =>
            recorte.definirLista(
              chip.dimensao,
              filtro[chip.dimensao].filter((v) => v !== chip.valor),
            )
          }
          className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-legenda font-medium text-primary transition-colors hover:bg-primary/15"
        >
          <span className="max-w-[260px] truncate">{chip.rotulo}</span>
          <X className="size-3" strokeWidth={2.5} />
        </button>
      ))}
      <button
        type="button"
        onClick={() => recorte.limpar()}
        className="ml-1 text-legenda text-muted-foreground underline hover:text-foreground"
      >
        Limpar tudo
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Visões salvas (SavedViewsPopover da origem), no navegador de quem salvou
// ---------------------------------------------------------------------------

interface VisaoSalva {
  id: string;
  nome: string;
  /** Só as chaves do recorte (`CHAVES_RECORTE`). */
  query: string;
  criadaEm: string;
}

const CHAVE_VISOES = "erp.combustivel.visoes.v1";
const EVENTO_VISOES = "erp-combustivel-visoes";
const TETO_VISOES = 20;

function lerVisoesBruto(): string {
  try {
    return window.localStorage.getItem(CHAVE_VISOES) ?? "[]";
  } catch {
    return "[]";
  }
}

function assinarVisoes(aviso: () => void): () => void {
  window.addEventListener("storage", aviso);
  window.addEventListener(EVENTO_VISOES, aviso);
  return () => {
    window.removeEventListener("storage", aviso);
    window.removeEventListener(EVENTO_VISOES, aviso);
  };
}

function interpretarVisoes(bruto: string): VisaoSalva[] {
  try {
    const lista: unknown = JSON.parse(bruto);
    if (!Array.isArray(lista)) return [];
    return lista.filter(
      (v): v is VisaoSalva =>
        typeof v === "object" && v !== null && typeof v.id === "string" && typeof v.nome === "string" && typeof v.query === "string",
    );
  } catch {
    return [];
  }
}

function gravarVisoes(visoes: VisaoSalva[]): void {
  try {
    window.localStorage.setItem(CHAVE_VISOES, JSON.stringify(visoes));
    window.dispatchEvent(new Event(EVENTO_VISOES));
  } catch {
    // Armazenamento cheio ou bloqueado: a visão só não fica salva.
  }
}

function VisoesSalvas() {
  const router = useRouter();
  const caminho = usePathname();
  const params = useSearchParams();
  const bruto = React.useSyncExternalStore(assinarVisoes, lerVisoesBruto, () => "[]");
  const visoes = React.useMemo(() => interpretarVisoes(bruto), [bruto]);
  const [aberto, setAberto] = React.useState(false);
  const [salvando, setSalvando] = React.useState(false);
  const [nome, setNome] = React.useState("");

  function queryDoRecorte(): string {
    const recorte = new URLSearchParams();
    for (const chave of CHAVES_RECORTE) for (const valor of params.getAll(chave)) recorte.append(chave, valor);
    return recorte.toString();
  }

  function salvar() {
    const texto = nome.trim();
    if (!texto) return;
    const nova: VisaoSalva = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      nome: texto,
      query: queryDoRecorte(),
      criadaEm: new Date().toISOString(),
    };
    gravarVisoes([nova, ...visoes].slice(0, TETO_VISOES));
    setSalvando(false);
    setNome("");
  }

  function aplicar(visao: VisaoSalva) {
    // Mantém o que não é recorte (a busca da lista, por exemplo) e troca só o recorte.
    const proximo = new URLSearchParams(params.toString());
    for (const chave of CHAVES_RECORTE) proximo.delete(chave);
    proximo.delete("pagina");
    for (const [chave, valor] of new URLSearchParams(visao.query)) proximo.append(chave, valor);
    const query = proximo.toString();
    router.replace(query ? `${caminho}?${query}` : caminho, { scroll: false });
    setAberto(false);
  }

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className={cn(GATILHO, aberto && GATILHO_ATIVO)}>
          <Bookmark className="size-3.5" />
          <span className="hidden sm:inline">Visões</span>
          {visoes.length > 0 ? (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">{visoes.length}</span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-legenda uppercase tracking-wide text-muted-foreground">Visões salvas</span>
          {!salvando ? (
            <button
              type="button"
              onClick={() => setSalvando(true)}
              className="flex items-center gap-1 text-legenda font-medium text-primary hover:underline"
            >
              <Plus className="size-3" /> Salvar atual
            </button>
          ) : null}
        </div>
        {salvando ? (
          <div className="border-b border-border bg-muted/40 p-3">
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") salvar();
              }}
              placeholder="Ex.: Diesel S10 · Lote 9"
              className="h-8 text-detalhe"
              autoFocus
            />
            <div className="mt-2 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSalvando(false);
                  setNome("");
                }}
              >
                Cancelar
              </Button>
              <Button type="button" size="sm" onClick={salvar} disabled={!nome.trim()}>
                Salvar
              </Button>
            </div>
          </div>
        ) : null}
        <div className="max-h-72 overflow-y-auto py-1">
          {visoes.length === 0 && !salvando ? (
            <p className="px-4 py-8 text-center text-detalhe text-muted-foreground">
              Nenhuma visão salva ainda. Ficam salvas neste navegador.
            </p>
          ) : (
            visoes.map((visao) => (
              <div key={visao.id} className="group flex items-center gap-2 px-3 py-1.5 hover:bg-muted">
                <button
                  type="button"
                  onClick={() => aplicar(visao)}
                  className="flex flex-1 items-center gap-2 text-left text-sm"
                >
                  <Bookmark className="size-3.5 text-muted-foreground" />
                  <span className="truncate">{visao.nome}</span>
                </button>
                <button
                  type="button"
                  onClick={() => gravarVisoes(visoes.filter((v) => v.id !== visao.id))}
                  className="text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
                  aria-label={`Remover a visão ${visao.nome}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
