"use client";

import * as React from "react";
import Link from "next/link";
import { Eraser, Fuel } from "lucide-react";

import { BlocoFiltros, ConfirmDialog, EmptyState, FiltroBusca, FiltroSelect, StatusBadge } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";
import { Button } from "@/components/ui/button";
import { TituloAba } from "@/modules/combustivel/_shared/components/titulo-aba";
import { EsvaziamentoFormDrawer } from "@/modules/combustivel/esvaziamentos/components/esvaziamento-form-drawer";
import { podeEsvaziar as temCombustivelParaEsvaziar } from "@/modules/combustivel/esvaziamentos/schemas";
import { excluirTanque } from "@/modules/combustivel/tanques/actions";
import type { FornecedorOpcao, TanqueLinha } from "@/modules/combustivel/tanques/queries";
import { TanqueFormDrawer } from "./tanque-form-drawer";
import { TanqueVisual } from "./tanque-visual";
import { TanquesAcoesCabecalho } from "./tanques-acoes-cabecalho";

type FiltroStatus = "ativos" | "inativos" | "todos";

const OPCOES_STATUS = [
  { valor: "ativos", rotulo: "Ativos" },
  { valor: "inativos", rotulo: "Inativos" },
];

export interface TanquesListaProps {
  tanques: TanqueLinha[];
  fornecedores: FornecedorOpcao[];
  podeCriar?: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
  /** `combustivel.esvaziamentos`/criar: o "Esvaziar" do card (origem: TanqueList). */
  podeEsvaziar?: boolean;
}

/** Filtro em memória: o cadastro inteiro vem da página (dezenas de linhas). */
export function filtrarTanques(tanques: readonly TanqueLinha[], busca: string, status: FiltroStatus): TanqueLinha[] {
  const termo = busca.trim().toLowerCase();
  return tanques.filter((tanque) => {
    if (status === "ativos" && !tanque.ativo) return false;
    if (status === "inativos" && tanque.ativo) return false;
    if (!termo) return true;
    return (
      tanque.nome.toLowerCase().includes(termo) ||
      (tanque.apelido ?? "").toLowerCase().includes(termo) ||
      (tanque.proprietarioNome ?? "").toLowerCase().includes(termo)
    );
  });
}

const CLASSE_ACAO = "h-7 px-2 text-xs";

/**
 * A aba Tanques como a origem (TanqueList do Gestão Obras): os tanques da EMT em
 * cards com a cápsula do nível, e os de terceiro numa lista compacta embaixo, sem
 * cápsula porque não têm estoque. Clicar no card abre o detalhe com os movimentos.
 */
export function TanquesLista({
  tanques,
  fornecedores,
  podeCriar = false,
  podeEditar,
  podeExcluir,
  podeEsvaziar = false,
}: TanquesListaProps) {
  const [busca, setBusca] = useFiltroSessao("busca", "");
  const [status, setStatus] = useFiltroSessao<FiltroStatus>("status", "ativos", ["ativos", "inativos", "todos"]);
  const [editando, setEditando] = React.useState<TanqueLinha | null>(null);
  const [aberto, setAberto] = React.useState(false);
  const [esvaziando, setEsvaziando] = React.useState<TanqueLinha | null>(null);
  const [excluindo, setExcluindo] = React.useState<TanqueLinha | null>(null);

  const filtrados = React.useMemo(() => filtrarTanques(tanques, busca, status), [tanques, busca, status]);
  const proprios = filtrados.filter((t) => !t.ehExterno);
  const externos = filtrados.filter((t) => t.ehExterno);

  const esvaziaveis = React.useMemo(
    () =>
      tanques.filter(temCombustivelParaEsvaziar).map((t) => ({
        id: t.id,
        nome: t.nome,
        nivel: t.nivel,
        combustivelNome: t.combustivelNome,
      })),
    [tanques],
  );

  const podeAbrirEsvaziar = podeEditar && podeEsvaziar;

  function abrirEdicao(tanque: TanqueLinha) {
    setEditando(tanque);
    setAberto(true);
  }

  function aoMudarAberto(novoAberto: boolean) {
    setAberto(novoAberto);
    if (!novoAberto) setEditando(null);
  }

  async function aoConfirmarExclusao(motivo?: string) {
    if (!excluindo) return;
    const resultado = await excluirTanque(excluindo.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Tanque excluído");
    setExcluindo(null);
  }

  function acoesEdicao(tanque: TanqueLinha) {
    return (
      <>
        {podeEditar ? (
          <Button type="button" variant="ghost" size="sm" className={CLASSE_ACAO} onClick={() => abrirEdicao(tanque)}>
            Editar
          </Button>
        ) : null}
        {podeExcluir ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={`${CLASSE_ACAO} text-destructive hover:text-destructive`}
            onClick={() => setExcluindo(tanque)}
          >
            Excluir
          </Button>
        ) : null}
      </>
    );
  }

  return (
    <>
      <TituloAba
        titulo="Tanques de Combustível"
        contagem={filtrados.length}
        acoes={<TanquesAcoesCabecalho podeCriar={podeCriar} fornecedores={fornecedores} />}
      />

      <div className="mb-4">
        <BlocoFiltros
          campos={[
            {
              id: "busca",
              rotulo: "Busca",
              elemento: (
                <FiltroBusca valor={busca} onValorChange={setBusca} placeholder="Buscar por nome, apelido ou dono" />
              ),
            },
            {
              id: "status",
              rotulo: "Status",
              elemento: (
                <FiltroSelect
                  valor={status === "todos" ? "" : status}
                  onValorChange={(valor) => setStatus(valor === "" ? "todos" : (valor as FiltroStatus))}
                  opcoes={OPCOES_STATUS}
                  placeholder="Status"
                  todosRotulo="Todos"
                />
              ),
            },
          ]}
        />
      </div>

      {filtrados.length === 0 ? (
        <EmptyState
          icone={Fuel}
          titulo={tanques.length === 0 ? "Nenhum tanque cadastrado" : "Nenhum tanque encontrado"}
          descricao={
            tanques.length === 0
              ? "Cadastre os tanques da EMT e os de terceiro onde as carretas abastecem"
              : "Ajuste a busca ou o status"
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {proprios.length > 0 ? (
            <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {proprios.map((tanque) => {
                const esvaziavel = podeAbrirEsvaziar && temCombustivelParaEsvaziar(tanque);
                return (
                  <li
                    key={tanque.id}
                    className="relative rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-primary focus-within:border-primary"
                  >
                    {/* O card inteiro leva ao detalhe; o rodapé fica por cima do link. */}
                    <Link
                      href={`/combustivel/tanques/${tanque.id}`}
                      aria-label={`Abrir o tanque ${tanque.nome}`}
                      className="absolute inset-0 rounded-xl foco-anel-dentro"
                    />
                    <TanqueVisual
                      id={tanque.id}
                      nome={tanque.nome}
                      apelido={tanque.apelido}
                      capacidade={tanque.capacidade}
                      nivel={tanque.nivel}
                      combustivelNome={tanque.combustivelNome}
                    />
                    <div className="relative z-10 mt-3 flex items-center justify-between gap-2 border-t pt-3">
                      {tanque.ativo ? (
                        <StatusBadge status="aprovado" rotulo="Ativo" />
                      ) : (
                        <StatusBadge status="rascunho" rotulo="Inativo" />
                      )}
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        {esvaziavel ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className={`${CLASSE_ACAO} text-status-pendente hover:text-status-pendente`}
                            title="Esvaziar tanque (descarte explícito para troca de combustível)"
                            onClick={() => setEsvaziando(tanque)}
                          >
                            <Eraser />
                            Esvaziar
                          </Button>
                        ) : null}
                        {acoesEdicao(tanque)}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {externos.length > 0 ? (
            <section className="flex flex-col gap-2" aria-labelledby="tanques-externos">
              <h3
                id="tanques-externos"
                className="text-legenda font-semibold tracking-wide text-muted-foreground uppercase"
              >
                Tanques externos (terceiros, sem controle de estoque)
              </h3>
              <ul className="divide-y rounded-xl border bg-card shadow-sm">
                {externos.map((tanque) => (
                  <li
                    key={tanque.id}
                    className="relative flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                  >
                    <Link
                      href={`/combustivel/tanques/${tanque.id}`}
                      aria-label={`Abrir o tanque ${tanque.nome}`}
                      className="absolute inset-0 foco-anel-dentro"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{tanque.nome}</p>
                      <p className="truncate text-legenda text-muted-foreground">
                        {[tanque.apelido, tanque.proprietarioNome].filter(Boolean).join(" · ") || "Terceiro"}
                      </p>
                    </div>
                    <div className="relative z-10 flex shrink-0 items-center gap-1">
                      <span className="rounded bg-violet-100 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-violet-700 uppercase dark:bg-violet-500/15 dark:text-violet-300">
                        Externo
                      </span>
                      {!tanque.ativo ? <StatusBadge status="rascunho" rotulo="Inativo" /> : null}
                      {acoesEdicao(tanque)}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}

      {podeEditar ? (
        <TanqueFormDrawer
          key={editando?.id ?? "nenhum"}
          aberto={aberto}
          onAbertoChange={aoMudarAberto}
          tanque={editando}
          fornecedores={fornecedores}
        />
      ) : null}
      {podeAbrirEsvaziar ? (
        <EsvaziamentoFormDrawer
          key={esvaziando?.id ?? "nenhum"}
          aberto={esvaziando !== null}
          onAbertoChange={(novoAberto) => {
            if (!novoAberto) setEsvaziando(null);
          }}
          tanques={esvaziaveis}
          tanqueInicialId={esvaziando?.id}
        />
      ) : null}
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(novoAberto) => {
          if (!novoAberto) setExcluindo(null);
        }}
        titulo="Excluir tanque"
        descricao={
          excluindo
            ? `O tanque ${excluindo.nome} vai para a lixeira. Tanque com movimento não sai: desative no lugar.`
            : ""
        }
        textoConfirmar="Excluir tanque"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={aoConfirmarExclusao}
      />
    </>
  );
}
