"use client";

import { Crosshair, LocateFixed, LogOut, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  BlocoAlocacaoPessoa,
  type AlocarNaFicha,
} from "@/modules/mapa/components/bloco-alocacao";
import {
  CentrosPessoa,
  HistoricoLocal,
  useDiasPessoa,
} from "@/modules/mapa/components/centros-pessoa";
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
 * local põe a pessoa no ponto do local. Sem "nenhum local": tirar do local é arrastar a pessoa
 * para outro ponto.
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
 *
 * Alocação rápida (v1.30, 17/10/2026): máquina, local e centro ficam no bloco "Alocação" do
 * topo, igual ao da ficha da máquina, e gravam na hora (toast com Desfazer), sem diálogo.
 */

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
  onAlocar,
  onTrocarObra,
  onPosicionar,
  relatorioDiasHref = null,
  onTirarDoMapa,
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
  /** Máquina, local e centro: grava na hora pelo lote (v1.30), com Desfazer no toast. */
  onAlocar: AlocarNaFicha;
  onTrocarObra: (obraId: string) => void;
  onPosicionar: () => void;
  /** Relatório "Dias de pessoa por centro"; nulo sem permissão de ver os relatórios do Mapa. */
  relatorioDiasHref?: string | null;
  /** Só diarista: sai do mapa (entra de novo por "Adicionar diarista"). */
  onTirarDoMapa?: () => void;
}) {
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

      <BlocoAlocacaoPessoa
        pessoa={pessoa}
        codigoMaquina={maquina}
        maquinas={maquinas}
        localidades={localidades}
        obras={obras}
        centrosCusto={centrosCusto}
        podeEditar={podeEditar}
        salvando={salvando}
        onAlocar={onAlocar}
        onTrocarObra={onTrocarObra}
      />

      {pessoa.equipamentoId ? null : <HistoricoLocal dados={diasPessoa} />}
      <p className="text-legenda text-muted-foreground">
        Os dias trabalhados contam no centro escolhido, senão no da obra (parado
        vai para Pessoal Sem Alocação). Só no mapa: o cadastro do colaborador e
        a folha não mudam.
      </p>

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
          {onTirarDoMapa ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onTirarDoMapa}
              disabled={salvando}
            >
              <LogOut />
              Tirar do mapa
            </Button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
