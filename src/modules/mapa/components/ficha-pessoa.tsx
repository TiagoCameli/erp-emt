"use client";

import * as React from "react";
import { Crosshair, LocateFixed, X } from "lucide-react";

import { Combobox } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import {
  CentrosPessoa,
  HistoricoLocal,
  useDiasPessoa,
} from "@/modules/mapa/components/centros-pessoa";
import { lugarDaPessoa } from "@/modules/mapa/pessoas";
import type {
  CentroCustoOpcaoMapa,
  EquipamentoMapa,
  LocalidadeMapa,
  ObraMapa,
  PessoaMapa,
} from "@/modules/mapa/tipos";

/**
 * Ficha da pessoa tocada no mapa: quem é, qual máquina opera e o local onde trabalha (pedido do
 * Tiago, 16/10/2026: "assinalar pessoas a localizações onde elas estão trabalhando"). Trocar o
 * local põe a pessoa no ponto do local; quem opera uma máquina deixa de operar (o pai confirma).
 * Sem "nenhum local": tirar do local é arrastar a pessoa para outro ponto.
 *
 * Quem ainda não tem lugar no mapa não tem o que arrastar (Tiago, 16/10/2026: "não tem como
 * assinalar os colaboradores aqui, somente equipamentos"): a ficha escolhe a máquina que a pessoa
 * opera, o local, ou "Posicionar no mapa" (toque num ponto, como o das máquinas).
 *
 * Obra como local (17/10/2026, "uma obra pode ser o local de trabalho de um funcionario enquanto a
 * obra estiver ativa"): a lista traz as obras ativas antes dos locais. Obra encerrada some da lista
 * e deixa de ser o local; os dias dela vão para Pessoal Sem Alocação (fn_colab_centro_regra).
 *
 * Operador (17/10/2026, "se colaborador opera um equipamento nao tenho que escolher local de
 * trabalho para ele pois ele deve acompanhar o seu equipamento"): com máquina, a ficha não oferece
 * local; mostra que a pessoa acompanha a máquina.
 *
 * Centro de custo (17/10/2026): o da pessoa no Mapa, trocado só aqui. O do cadastro do
 * colaborador, que a folha usa, não muda.
 */

/** Valor da opção "Sem centro de custo" no Combobox (o vazio é "nada escolhido"). */
const SEM_CENTRO = "__sem_centro__";

const porNome = (a: { nome: string }, b: { nome: string }) =>
  a.nome.localeCompare(b.nome, "pt-BR");

export function FichaPessoa({
  pessoa,
  maquina,
  maquinas,
  localidades,
  obras,
  centrosCusto,
  podeEditar,
  salvando,
  posicionando,
  onFechar,
  onFocar,
  onTrocarLocal,
  onTrocarObra,
  onOperar,
  onPosicionar,
  onTrocarCentro,
  relatorioDiasHref = null,
}: {
  pessoa: PessoaMapa;
  /** Código da máquina que a pessoa opera (null = nenhuma). */
  maquina: string | null;
  /** Máquinas do mapa que a pessoa pode passar a operar. */
  maquinas: readonly EquipamentoMapa[];
  localidades: readonly LocalidadeMapa[];
  /** Obras ativas: também servem de local de trabalho. */
  obras: readonly ObraMapa[];
  /** Centros ativos para escolher (vazio para quem não edita). */
  centrosCusto: readonly CentroCustoOpcaoMapa[];
  podeEditar: boolean;
  salvando: boolean;
  /** A tela espera o toque no mapa para esta pessoa. */
  posicionando: boolean;
  onFechar: () => void;
  onFocar: () => void;
  onTrocarLocal: (localidadeId: string) => void;
  onTrocarObra: (obraId: string) => void;
  onOperar: (equipamentoId: string) => void;
  onPosicionar: () => void;
  /** null tira o centro. */
  onTrocarCentro: (centroCustoId: string | null) => void;
  /** Relatório "Dias de pessoa por centro"; nulo sem permissão de ver os relatórios do Mapa. */
  relatorioDiasHref?: string | null;
}) {
  const opcoes = React.useMemo(
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
  const opcoesMaquina = React.useMemo(
    () =>
      [...maquinas]
        .sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR"))
        .map((e) => ({
          valor: e.id,
          rotulo: [
            e.codigo,
            e.descricao,
            e.operadorNome && `com ${e.operadorNome}`,
          ]
            .filter(Boolean)
            .join(" · "),
        })),
    [maquinas],
  );
  const opcoesCentro = React.useMemo(
    () => [
      { valor: SEM_CENTRO, rotulo: "Sem centro de custo" },
      ...[...centrosCusto]
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
        .map((c) => ({ valor: c.id, rotulo: c.nome })),
    ],
    [centrosCusto],
  );
  // O centro escolhido também muda o centro do dia: entra na chave que relê os dias.
  const diasPessoa = useDiasPessoa(
    pessoa.id,
    [
      pessoa.obraId,
      pessoa.localidadeId,
      pessoa.equipamentoId,
      pessoa.centroCustoId,
    ].join("|"),
  );
  const lugar = lugarDaPessoa(pessoa, new Set(obras.map((o) => o.id)));
  const rotuloLugar = opcoes.find((o) => o.valor === lugar)?.rotulo;

  return (
    <section
      className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3 text-detalhe"
      aria-label={`Ficha de ${pessoa.nome}`}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-corpo font-semibold">{pessoa.nome}</p>
          <p className="text-muted-foreground">
            {[pessoa.funcao, pessoa.vinculo, pessoa.equipeNome]
              .filter(Boolean)
              .join(" · ") || "Sem função cadastrada"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {pessoa.pos ? (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={onFocar}
              aria-label="Centralizar no mapa"
              title="Centralizar no mapa"
            >
              <LocateFixed />
            </Button>
          ) : null}
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={onFechar}
            aria-label="Fechar ficha"
          >
            <X />
          </Button>
        </div>
      </header>

      {podeEditar ? (
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground">Opera</span>
          <Combobox
            valor={pessoa.equipamentoId ?? ""}
            onValorChange={(v) => {
              if (v && v !== pessoa.equipamentoId) onOperar(v);
            }}
            opcoes={opcoesMaquina}
            rotuloDoValor={maquina ?? undefined}
            placeholder="Nenhuma máquina"
            buscaPlaceholder="Código ou descrição"
            size="sm"
            disabled={salvando}
            ariaLabel="Máquina que opera"
          />
        </div>
      ) : (
        <div className="flex items-baseline justify-between gap-3">
          <span className="shrink-0 text-muted-foreground">Opera</span>
          <span className="text-right">
            {maquina ?? (
              <span className="text-muted-foreground">nenhuma máquina</span>
            )}
          </span>
        </div>
      )}

      {pessoa.equipamentoId ? (
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground">Local de trabalho</span>
          <p>Acompanha {maquina ?? "a máquina"}</p>
          <p className="text-legenda text-muted-foreground">
            Quem opera uma máquina trabalha onde ela estiver.
            {podeEditar
              ? " Para escolher um local, tire da máquina: arraste a pessoa ou posicione no mapa."
              : ""}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground">Local de trabalho</span>
          {podeEditar ? (
            <Combobox
              valor={lugar}
              onValorChange={(v) => {
                if (!v || v === lugar) return;
                const [tipo, id] = v.split(":");
                if (!id) return;
                if (tipo === "obra") onTrocarObra(id);
                else onTrocarLocal(id);
              }}
              opcoes={opcoes}
              rotuloDoValor={rotuloLugar}
              placeholder="Escolher o local"
              buscaPlaceholder="Nome do local"
              size="sm"
              disabled={salvando}
              ariaLabel="Local de trabalho"
            />
          ) : (
            <p>{rotuloLugar ?? "–"}</p>
          )}
          <HistoricoLocal dados={diasPessoa} />
        </div>
      )}

      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground">Centro de custo no mapa</span>
        {podeEditar ? (
          <Combobox
            valor={pessoa.centroCustoId ?? SEM_CENTRO}
            onValorChange={(v) => {
              if (!v) return;
              const novo = v === SEM_CENTRO ? null : v;
              if (novo !== pessoa.centroCustoId) onTrocarCentro(novo);
            }}
            opcoes={opcoesCentro}
            rotuloDoValor={pessoa.centroCustoNome || "Sem centro de custo"}
            placeholder="Sem centro de custo"
            buscaPlaceholder="Nome do centro"
            size="sm"
            disabled={salvando}
            ariaLabel="Centro de custo no mapa"
          />
        ) : (
          <p>{pessoa.centroCustoNome || "–"}</p>
        )}
        <p className="text-legenda text-muted-foreground">
          Os dias trabalhados contam neste centro (parado vai para Pessoal Sem
          Alocação). Só no mapa: o cadastro do colaborador e a folha não mudam.
        </p>
      </div>

      <CentrosPessoa
        colaboradorId={pessoa.id}
        podeEditar={podeEditar}
        relatorioHref={relatorioDiasHref}
        dados={diasPessoa}
      />

      {podeEditar ? (
        <>
          <Button
            type="button"
            size="sm"
            variant={posicionando ? "default" : "outline"}
            onClick={onPosicionar}
            disabled={salvando}
          >
            <Crosshair />
            {posicionando ? "Toque no mapa" : "Posicionar no mapa"}
          </Button>
          {pessoa.pos ? (
            <p className="text-legenda text-muted-foreground">
              Também dá para arrastar a pessoa até uma máquina (vira operador)
              ou até um local.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
