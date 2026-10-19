"use client";

import * as React from "react";
import { Sparkles, UserMinus } from "lucide-react";

import { Combobox } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import {
  opcoesMaquinaParaPessoa,
  opcoesOperadorParaMaquina,
  sugestaoDaMaquina,
  sugestaoDoLocal,
} from "@/modules/mapa/alocacao";
import { lugarDaPessoa } from "@/modules/mapa/pessoas";
import type { ItemAlocacao } from "@/modules/mapa/schemas";
import type {
  CentroCustoOpcaoMapa,
  EquipamentoMapa,
  LocalidadeMapa,
  ObraMapa,
  PessoaMapa,
} from "@/modules/mapa/tipos";

/**
 * Bloco "Alocação", igual nas duas fichas e no topo delas (Tiago, 17/10/2026: "alocar pessoas e
 * máquinas tem que ser rápido, prático e fluido"): quem opera o quê, onde trabalha e em que centro.
 * Grava na hora, sem diálogo; o toast traz "Desfazer". Quem decide o que gravar é a tela
 * (`onAlocar`); o bloco monta o item e, depois que gravou, oferece a sugestão de um clique.
 */

/** Valor da opção "Sem centro de custo" no Combobox (o vazio é "nada escolhido"). */
const SEM_CENTRO = "__sem_centro__";

/** Grava o item; devolve se deu certo (a sugestão só aparece depois do certo). */
export type AlocarNaFicha = (item: ItemAlocacao) => Promise<boolean>;

type Sugestao = { rotulo: string; item: ItemAlocacao };

function Campo({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-legenda font-medium text-muted-foreground">
        {rotulo}
      </span>
      {children}
    </div>
  );
}

function ChipSugestao({
  sugestao,
  disabled,
  onUsar,
}: {
  sugestao: Sugestao;
  disabled: boolean;
  onUsar: () => void;
}) {
  return (
    <Button
      type="button"
      size="xs"
      variant="outline"
      className="self-start"
      disabled={disabled}
      onClick={onUsar}
    >
      <Sparkles />
      {sugestao.rotulo}
    </Button>
  );
}

function Quadro({ children }: { children: React.ReactNode }) {
  return (
    <section
      aria-label="Alocação"
      className="flex flex-col gap-2 rounded-md border border-border bg-surface p-2.5 text-detalhe"
    >
      {children}
    </section>
  );
}

export function BlocoAlocacaoPessoa({
  pessoa,
  maquinas,
  localidades,
  obras,
  centrosCusto,
  podeEditar,
  salvando,
  onAlocar,
  onTrocarObra,
  codigoMaquina = null,
}: {
  pessoa: PessoaMapa;
  maquinas: readonly EquipamentoMapa[];
  /** Código da máquina que a pessoa opera, quando ela não está em `maquinas`. */
  codigoMaquina?: string | null;
  localidades: readonly LocalidadeMapa[];
  /** Obras ativas: também servem de local de trabalho. */
  obras: readonly ObraMapa[];
  centrosCusto: readonly CentroCustoOpcaoMapa[];
  podeEditar: boolean;
  salvando: boolean;
  onAlocar: AlocarNaFicha;
  /** Obra como local: a tela leva a pessoa ao ponto da obra (não passa pelo lote). */
  onTrocarObra: (obraId: string) => void;
}) {
  const [sugestao, setSugestao] = React.useState<Sugestao | null>(null);
  const maquina = pessoa.equipamentoId
    ? (maquinas.find((m) => m.id === pessoa.equipamentoId) ?? null)
    : null;
  const codigo = maquina?.codigo ?? codigoMaquina;
  const opcoesMaquina = React.useMemo(
    () => opcoesMaquinaParaPessoa(pessoa, maquinas),
    [pessoa, maquinas],
  );
  const porNome = (a: { nome: string }, b: { nome: string }) =>
    a.nome.localeCompare(b.nome, "pt-BR");
  const opcoesLugar = React.useMemo(
    () => [
      ...[...obras]
        .sort(porNome)
        .map((o) => ({ valor: `obra:${o.id}`, rotulo: `Obra · ${o.nome}` })),
      ...[...localidades]
        .sort(porNome)
        .map((l) => ({ valor: `local:${l.id}`, rotulo: l.nome })),
    ],
    [obras, localidades],
  );
  const opcoesCentro = React.useMemo(
    () => [
      { valor: SEM_CENTRO, rotulo: "Sem centro (segue a obra)" },
      ...[...centrosCusto]
        .sort(porNome)
        .map((c) => ({ valor: c.id, rotulo: c.nome })),
    ],
    [centrosCusto],
  );
  const lugar = lugarDaPessoa(pessoa, new Set(obras.map((o) => o.id)));
  const rotuloLugar = opcoesLugar.find((o) => o.valor === lugar)?.rotulo;

  const gravar = async (item: ItemAlocacao, depois: Sugestao | null) => {
    setSugestao(null);
    if (await onAlocar(item)) setSugestao(depois);
  };

  const operar = (equipamentoId: string) => {
    if (equipamentoId === (pessoa.equipamentoId ?? "")) return;
    if (!equipamentoId) {
      void gravar({ colaboradorId: pessoa.id, equipamentoId: null }, null);
      return;
    }
    const escolhida = maquinas.find((m) => m.id === equipamentoId);
    const proxima = escolhida ? sugestaoDaMaquina(pessoa, escolhida) : null;
    void gravar(
      { colaboradorId: pessoa.id, equipamentoId },
      proxima
        ? {
            rotulo:
              proxima.localidadeId !== undefined &&
              proxima.centroCustoId !== undefined
                ? "Usar também o local e o centro da máquina"
                : proxima.localidadeId !== undefined
                  ? "Usar também o local da máquina"
                  : "Usar também o centro da máquina",
            item: proxima,
          }
        : null,
    );
  };

  const trocarLugar = (valor: string) => {
    if (!valor || valor === lugar) return;
    const [tipo, id] = valor.split(":");
    if (!id) return;
    if (tipo === "obra") {
      setSugestao(null);
      onTrocarObra(id);
      return;
    }
    const local = localidades.find((l) => l.id === id) ?? null;
    const proxima = sugestaoDoLocal(pessoa, local);
    void gravar(
      { colaboradorId: pessoa.id, localidadeId: id },
      proxima ? { rotulo: "Centro da obra deste local", item: proxima } : null,
    );
  };

  const trocarCentro = (valor: string) => {
    if (!valor) return;
    const novo = valor === SEM_CENTRO ? null : valor;
    if (novo === pessoa.centroCustoId) return;
    void gravar({ colaboradorId: pessoa.id, centroCustoId: novo }, null);
  };

  if (!podeEditar)
    return (
      <Quadro>
        <Campo rotulo="Opera">
          <p>{pessoa.equipamentoId ? (codigo ?? "–") : "Nenhuma máquina"}</p>
        </Campo>
        <Campo rotulo="Local de trabalho">
          <p>
            {pessoa.equipamentoId
              ? `Acompanha ${codigo ?? "a máquina"}`
              : (rotuloLugar ?? "–")}
          </p>
        </Campo>
        <Campo rotulo="Centro de custo">
          <p>{pessoa.centroCustoNome || "Segue a obra"}</p>
        </Campo>
      </Quadro>
    );

  return (
    <Quadro>
      <Campo rotulo="Opera">
        <Combobox
          valor={pessoa.equipamentoId ?? ""}
          onValorChange={operar}
          opcoes={opcoesMaquina}
          rotuloDoValor={codigo ?? undefined}
          placeholder="Nenhuma máquina"
          buscaPlaceholder="Código, placa ou descrição"
          limpavel
          size="sm"
          disabled={salvando}
          ariaLabel="Máquina que opera"
        />
      </Campo>
      <Campo rotulo="Local de trabalho">
        {pessoa.equipamentoId ? (
          <>
            <p>
              Acompanha {codigo ?? "a máquina"}
              <span className="text-muted-foreground">
                {maquina?.localidadeNome ? ` · ${maquina.localidadeNome}` : ""}
                {maquina?.obraNome ? ` · ${maquina.obraNome}` : ""}
              </span>
            </p>
            <p className="text-legenda text-muted-foreground">
              Quem opera uma máquina trabalha onde ela estiver. Para escolher
              um local, tire da máquina (limpe o campo Opera).
            </p>
          </>
        ) : (
          <Combobox
            valor={lugar}
            onValorChange={trocarLugar}
            opcoes={opcoesLugar}
            rotuloDoValor={rotuloLugar}
            placeholder="Escolher o local"
            buscaPlaceholder="Nome do local ou da obra"
            size="sm"
            disabled={salvando}
            ariaLabel="Local de trabalho"
          />
        )}
      </Campo>
      <Campo rotulo="Centro de custo">
        <Combobox
          valor={pessoa.centroCustoId ?? SEM_CENTRO}
          onValorChange={trocarCentro}
          opcoes={opcoesCentro}
          rotuloDoValor={
            pessoa.centroCustoNome || "Sem centro (segue a obra)"
          }
          placeholder="Sem centro (segue a obra)"
          buscaPlaceholder="Nome do centro"
          size="sm"
          disabled={salvando}
          ariaLabel="Centro de custo no mapa"
        />
      </Campo>
      {sugestao ? (
        <ChipSugestao
          sugestao={sugestao}
          disabled={salvando}
          onUsar={() => void gravar(sugestao.item, null)}
        />
      ) : null}
    </Quadro>
  );
}

export function BlocoAlocacaoMaquina({
  maquina,
  pessoas,
  codigoDe,
  podeEditar,
  salvando,
  onAlocar,
  onTransferir,
}: {
  maquina: EquipamentoMapa;
  pessoas: readonly PessoaMapa[];
  /** Código de cada máquina do mapa (o rótulo "opera RL-003"). */
  codigoDe: ReadonlyMap<string, string>;
  podeEditar: boolean;
  salvando: boolean;
  onAlocar: AlocarNaFicha;
  /** Trocar o local da máquina é transferir: abre o diálogo (data, motivo, obra). */
  onTransferir: () => void;
}) {
  const opcoes = React.useMemo(
    () => opcoesOperadorParaMaquina(maquina, pessoas, codigoDe),
    [maquina, pessoas, codigoDe],
  );
  const onde =
    [maquina.localidadeNome, maquina.areaNome, maquina.obraNome]
      .filter(Boolean)
      .join(" · ") || "Sem local";

  const trocar = (colaboradorId: string) => {
    if (colaboradorId === (maquina.operadorId ?? "")) return;
    if (!colaboradorId) {
      if (maquina.operadorId)
        void onAlocar({
          colaboradorId: maquina.operadorId,
          equipamentoId: null,
        });
      return;
    }
    void onAlocar({ colaboradorId, equipamentoId: maquina.id });
  };

  return (
    <Quadro>
      <Campo rotulo="Operador">
        {podeEditar ? (
          <div className="flex items-center gap-1.5">
            <div className="min-w-0 flex-1">
              <Combobox
                valor={maquina.operadorId ?? ""}
                onValorChange={trocar}
                opcoes={opcoes}
                rotuloDoValor={maquina.operadorNome || undefined}
                placeholder="Sem operador"
                buscaPlaceholder="Nome ou função"
                size="sm"
                disabled={salvando}
                ariaLabel="Operador"
              />
            </div>
            {maquina.operadorId ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={salvando}
                onClick={() => trocar("")}
              >
                <UserMinus />
                Limpar operador
              </Button>
            ) : null}
          </div>
        ) : (
          <p>{maquina.operadorNome || "Sem operador"}</p>
        )}
        {maquina.operadorId ? (
          <p className="text-legenda text-muted-foreground">
            Transferir a máquina leva o operador junto.
          </p>
        ) : null}
      </Campo>
      <Campo rotulo="Local">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0">{onde}</p>
          {podeEditar && maquina.fontePosicao === "manual" ? (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={salvando}
              onClick={onTransferir}
            >
              Transferir
            </Button>
          ) : null}
        </div>
      </Campo>
      <Campo rotulo="Centro de custo">
        <p>
          {maquina.obraNome ? `Segue a obra ${maquina.obraNome}` : "Sem obra"}
          <span className="text-muted-foreground">
            {" "}
            (os dias por centro estão mais abaixo)
          </span>
        </p>
      </Campo>
    </Quadro>
  );
}
