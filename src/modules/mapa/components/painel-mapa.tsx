"use client";

import * as React from "react";
import { ChevronRight, Crosshair, Plus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatarKm } from "@/modules/mapa/geo";
import { CLASSES_ESTADO, ORDEM_ESTADOS } from "@/modules/mapa/rotulos";
import {
  ROTULO_ESTADO,
  type EquipamentoMapa,
  type EstadoEfetivo,
  type PermissoesMapa,
  type PessoaMapa,
} from "@/modules/mapa/tipos";

/**
 * O painel ao lado do mapa: contagem por estado (chips clicáveis, que recortam a cena e as listas
 * pelo mesmo filtro da barra), a lista de quem ainda não tem posição (com "posicionar") e a lista
 * de quem está no mapa (clique centraliza e seleciona). Embaixo, as pessoas no mapa e as que ainda
 * não têm lugar (com "posicionar": toque numa máquina e ela vira operadora, ou num ponto/local). Busca e obra vivem na barra de filtros
 * canônica, em cima da tela. Em tela estreita o painel fica embaixo do mapa.
 */

export interface FiltrosMapa {
  busca: string;
  obraId: string;
  estado: EstadoEfetivo | "";
}

export const FILTROS_VAZIOS: FiltrosMapa = {
  busca: "",
  obraId: "",
  estado: "",
};

export interface PainelMapaProps {
  filtros: FiltrosMapa;
  onFiltros: (filtros: FiltrosMapa) => void;
  contagens: Record<EstadoEfetivo, number>;
  semPosicao: EquipamentoMapa[];
  noMapa: EquipamentoMapa[];
  pessoasNoMapa: PessoaMapa[];
  /** Colaboradores ativos ainda sem lugar no mapa (sem máquina, local nem ponto). */
  pessoasSemPosicao: PessoaMapa[];
  selecao: ReadonlySet<string>;
  posicionando: EquipamentoMapa | null;
  posicionandoPessoa: PessoaMapa | null;
  permissoes: PermissoesMapa;
  temCandidatosLocacao: boolean;
  onPosicionar: (equipamento: EquipamentoMapa) => void;
  onPosicionarPessoa: (pessoa: PessoaMapa) => void;
  onCancelarPosicionar: () => void;
  onEscolherEquipamento: (equipamento: EquipamentoMapa) => void;
  onEscolherPessoa: (pessoa: PessoaMapa) => void;
  onAdicionarAlugada: () => void;
  /** Quantas pessoas ainda sem máquina, local nem obra no Mapa (v1.30). */
  pessoasSemAlocacao?: number;
  /** Abre o quadro de alocação filtrado nelas. */
  onAlocarSemAlocacao?: () => void;
  temCandidatosDiarista: boolean;
  onAdicionarDiarista: () => void;
  /** Tanques, pilhas e depósitos do Estoque que ainda não têm lugar no mapa. */
  objetosSemLugar: { id: string; nome: string; tipo: string }[];
  onEscolherObjeto: (id: string) => void;
  children?: React.ReactNode;
}

function ItemEquipamento({
  e,
  ativo,
  onClick,
  acao,
}: {
  e: EquipamentoMapa;
  ativo: boolean;
  onClick: () => void;
  acao?: React.ReactNode;
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-detalhe",
        ativo ? "bg-accent text-accent-foreground" : "hover:bg-surface",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="min-w-0 flex-1 text-left foco-anel rounded-sm"
      >
        <span className="font-mono font-medium">{e.codigo || "—"}</span>
        <span className="ml-1.5 text-muted-foreground">{e.descricao}</span>
        <span className="block truncate text-legenda text-muted-foreground">
          {[
            ROTULO_ESTADO[e.estado],
            e.trechoNome && e.km !== null
              ? `km ${formatarKm(e.km)}`
              : e.areaNome || e.localidadeNome,
            e.operadorNome,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </button>
      {acao}
    </li>
  );
}

export function PainelMapa({
  filtros,
  onFiltros,
  contagens,
  semPosicao,
  noMapa,
  pessoasNoMapa,
  pessoasSemPosicao,
  selecao,
  posicionando,
  posicionandoPessoa,
  permissoes,
  temCandidatosLocacao,
  onPosicionar,
  onPosicionarPessoa,
  onCancelarPosicionar,
  onEscolherEquipamento,
  onEscolherPessoa,
  onAdicionarAlugada,
  pessoasSemAlocacao = 0,
  onAlocarSemAlocacao,
  temCandidatosDiarista,
  onAdicionarDiarista,
  objetosSemLugar,
  onEscolherObjeto,
  children,
}: PainelMapaProps) {
  const total = ORDEM_ESTADOS.reduce((s, k) => s + contagens[k], 0);
  // O quadro inteiro sem posição é longo: a lista abre a pedido, ou sozinha quando há busca.
  const [verSemPosicao, setVerSemPosicao] = React.useState(false);
  const abrirSemPosicao = verSemPosicao || filtros.busca.trim() !== "";

  return (
    <aside
      className="flex h-full min-h-0 flex-col gap-3"
      aria-label="Painel do mapa"
    >
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onFiltros({ ...filtros, estado: "" })}
          className={cn(
            "rounded-full border px-2 py-0.5 text-legenda foco-anel",
            filtros.estado === ""
              ? "border-foreground bg-foreground text-background"
              : "border-border text-muted-foreground hover:bg-surface",
          )}
        >
          Todas {total}
        </button>
        {ORDEM_ESTADOS.filter((k) => contagens[k] > 0).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() =>
              onFiltros({ ...filtros, estado: filtros.estado === k ? "" : k })
            }
            className={cn(
              "rounded-full border px-2 py-0.5 text-legenda foco-anel",
              filtros.estado === k ? "border-foreground" : "border-transparent",
              CLASSES_ESTADO[k],
            )}
            aria-pressed={filtros.estado === k}
          >
            {ROTULO_ESTADO[k]} {contagens[k]}
          </button>
        ))}
      </div>

      {posicionando || posicionandoPessoa ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-faixa bg-surface px-3 py-2 text-detalhe">
          <span>
            {posicionando ? (
              <>
                Toque no mapa onde está{" "}
                <span className="font-mono font-medium">
                  {posicionando.codigo}
                </span>
              </>
            ) : (
              <>
                Toque no mapa onde fica{" "}
                <span className="font-medium">{posicionandoPessoa?.nome}</span>{" "}
                (numa máquina, assinala como operador)
              </>
            )}
          </span>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            onClick={onCancelarPosicionar}
            aria-label="Cancelar posicionamento"
          >
            <X />
          </Button>
        </div>
      ) : null}

      {children}

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        {objetosSemLugar.length > 0 ? (
          <section>
            <h3 className="mb-1 flex items-center justify-between text-legenda font-medium text-muted-foreground">
              <span>Tanques, pilhas e depósitos sem lugar</span>
              <Badge variant="secondary" className="text-legenda">
                {objetosSemLugar.length}
              </Badge>
            </h3>
            <ul className="flex flex-col">
              {objetosSemLugar.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => onEscolherObjeto(o.id)}
                    className="flex w-full items-baseline justify-between gap-2 rounded-md px-2 py-1.5 text-left text-detalhe hover:bg-muted"
                  >
                    <span className="min-w-0 truncate text-foreground">
                      {o.nome}
                    </span>
                    <span className="shrink-0 text-legenda text-muted-foreground">
                      {o.tipo}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {semPosicao.length > 0 ? (
          <section>
            <h3 className="mb-1 flex items-center justify-between text-legenda font-medium text-muted-foreground">
              <span>Sem posição</span>
              <Badge variant="secondary" className="text-legenda">
                {semPosicao.length}
              </Badge>
            </h3>
            <ul className="flex flex-col">
              {semPosicao.map((e) => (
                <ItemEquipamento
                  key={e.id}
                  e={e}
                  ativo={selecao.has(e.id)}
                  onClick={() => onEscolherEquipamento(e)}
                  acao={
                    permissoes.editar ? (
                      <Button
                        type="button"
                        size="icon-xs"
                        variant={
                          posicionando?.id === e.id ? "default" : "outline"
                        }
                        onClick={() => onPosicionar(e)}
                        aria-label={`Posicionar ${e.codigo}`}
                        title="Posicionar no mapa"
                      >
                        <Crosshair />
                      </Button>
                    ) : undefined
                  }
                />
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <h3 className="mb-1 flex items-center justify-between text-legenda font-medium text-muted-foreground">
            <span>No mapa</span>
            <Badge variant="secondary" className="text-legenda">
              {noMapa.length}
            </Badge>
          </h3>
          {noMapa.length === 0 ? (
            <p className="px-2 py-3 text-detalhe text-muted-foreground">
              {total === 0
                ? "Nenhuma máquina no escopo do mapa."
                : "Nenhuma máquina posicionada com esse filtro."}
            </p>
          ) : (
            <ul className="flex flex-col">
              {noMapa.map((e) => (
                <ItemEquipamento
                  key={e.id}
                  e={e}
                  ativo={selecao.has(e.id)}
                  onClick={() => onEscolherEquipamento(e)}
                />
              ))}
            </ul>
          )}
        </section>

        {pessoasSemAlocacao > 0 && permissoes.editar && onAlocarSemAlocacao ? (
          <section className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-2 py-1.5">
            <span className="text-detalhe">
              <span className="font-medium">
                {pessoasSemAlocacao.toLocaleString("pt-BR")}
              </span>{" "}
              {pessoasSemAlocacao === 1
                ? "pessoa sem alocação"
                : "pessoas sem alocação"}
            </span>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={onAlocarSemAlocacao}
            >
              Alocar
            </Button>
          </section>
        ) : null}

        {pessoasNoMapa.length > 0 ? (
          <section>
            <h3 className="mb-1 flex items-center justify-between text-legenda font-medium text-muted-foreground">
              <span>Pessoas no mapa</span>
              <Badge variant="secondary" className="text-legenda">
                {pessoasNoMapa.length}
              </Badge>
            </h3>
            <ul className="flex flex-col">
              {pessoasNoMapa.map((p) => (
                <li
                  key={p.id}
                  className="rounded-md px-2 py-1 text-detalhe hover:bg-surface"
                >
                  <button
                    type="button"
                    onClick={() => onEscolherPessoa(p)}
                    className="w-full text-left foco-anel rounded-sm"
                  >
                    <span className="font-medium">{p.nome}</span>
                    <span className="ml-1.5 text-muted-foreground">
                      {[p.funcao, p.equipeNome].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {pessoasSemPosicao.length > 0 ? (
          <section>
            <h3 className="mb-1 text-legenda font-medium text-muted-foreground">
              <button
                type="button"
                onClick={() => setVerSemPosicao((v) => !v)}
                className="flex w-full items-center justify-between gap-2 rounded-sm text-left foco-anel"
                aria-expanded={abrirSemPosicao}
              >
                <span className="flex items-center gap-1">
                  <ChevronRight
                    className={cn(
                      "size-3.5 transition-transform",
                      abrirSemPosicao && "rotate-90",
                    )}
                    aria-hidden
                  />
                  Pessoas sem posição
                </span>
                <Badge variant="secondary" className="text-legenda">
                  {pessoasSemPosicao.length}
                </Badge>
              </button>
            </h3>
            {abrirSemPosicao ? (
              <ul className="flex flex-col">
                {pessoasSemPosicao.map((p) => (
                  <li
                    key={p.id}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1 text-detalhe",
                      posicionandoPessoa?.id === p.id
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-surface",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onEscolherPessoa(p)}
                      className="min-w-0 flex-1 text-left foco-anel rounded-sm"
                    >
                      <span className="font-medium">{p.nome}</span>
                      <span className="block truncate text-legenda text-muted-foreground">
                        {[p.funcao, p.equipeNome].filter(Boolean).join(" · ") ||
                          "Sem função cadastrada"}
                      </span>
                    </button>
                    {permissoes.editar ? (
                      <Button
                        type="button"
                        size="icon-xs"
                        variant={
                          posicionandoPessoa?.id === p.id
                            ? "default"
                            : "outline"
                        }
                        onClick={() => onPosicionarPessoa(p)}
                        aria-label={`Posicionar ${p.nome}`}
                        title="Posicionar no mapa"
                      >
                        <Crosshair />
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}
      </div>

      {permissoes.editar ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onAdicionarAlugada}
          className="shrink-0"
          disabled={!temCandidatosLocacao && !permissoes.criar}
        >
          <Plus />
          Adicionar máquina alugada
        </Button>
      ) : null}
      {permissoes.editar ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onAdicionarDiarista}
          className="shrink-0"
          disabled={!temCandidatosDiarista && !permissoes.cadastrarColaborador}
        >
          <Plus />
          Adicionar diarista
        </Button>
      ) : null}
    </aside>
  );
}
