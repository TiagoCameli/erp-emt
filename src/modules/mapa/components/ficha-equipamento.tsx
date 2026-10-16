"use client";

import * as React from "react";
import { Crosshair, LocateFixed, RotateCcw, RotateCw, X } from "lucide-react";

import { Combobox, MoneyText } from "@/components/canonicos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatarData,
  formatarDataHora,
  formatarQuantidade,
} from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import { NumerosEquipamento } from "@/modules/mapa/components/numeros-equipamento";
import { textoDesde } from "@/modules/mapa/desde";
import { formatarKm } from "@/modules/mapa/geo";
import { CLASSES_ESTADO } from "@/modules/mapa/rotulos";
import {
  ESTADOS_MAQUINA,
  ROTULO_ESTADO,
  ROTULO_PROPRIEDADE,
  ROTULO_TIPO_ALUGUEL,
  type CarretaRetorno,
  type EquipamentoMapa,
  type EstadoMaquina,
  type FreteEmRota,
  type PermissoesMapa,
  type PessoaMapa,
  type TanqueMapa,
} from "@/modules/mapa/tipos";

/**
 * A ficha da máquina clicada: onde está, em que estado e há quanto tempo, quem opera, a locação
 * (quando alugada) e o que a Manutenção e o Combustível sabem dela. Os botões de estado abrem a
 * confirmação; o operador troca na hora (com toast).
 */

export interface FichaEquipamentoProps {
  equipamento: EquipamentoMapa;
  pessoas: PessoaMapa[];
  /** yyyy-mm-dd de Rio Branco, do servidor (conta "desde ontem"). */
  hoje: string;
  /** Frete aberto da máquina (carreta em frete): material, peso, valor e a rota. */
  frete?: FreteEmRota | null;
  /** Volta da carreta à pedreira depois da chegada do frete. */
  retorno?: CarretaRetorno | null;
  /** Pedreiras posicionadas no mapa: para onde a volta pode ir. */
  pedreiras?: { id: string; nome: string }[];
  /** Troca a pedreira da volta; null volta à última de onde a carreta saiu. */
  onEscolherPedreira?: (localidadeId: string | null) => void;
  /** Tanque que anda com a máquina (Meloza): conteúdo e nível. */
  tanque?: TanqueMapa | null;
  permissoes: PermissoesMapa;
  selecionados: number;
  salvando: boolean;
  onFechar: () => void;
  onFocar: () => void;
  onPosicionar: () => void;
  onMarcarEstado: (estado: EstadoMaquina) => void;
  onAssinalarOperador: (colaboradorId: string | null) => void;
  onEncerrarLocacao: () => void;
  /** Gira a máquina: graus a somar ao rumo atual; null volta a seguir a pista. */
  onGirar: (delta: number | null) => void;
}

function Linha({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-detalhe">
      <span className="shrink-0 text-muted-foreground">{rotulo}</span>
      <span className="text-right text-foreground">{children}</span>
    </div>
  );
}

export function FichaEquipamento({
  equipamento: e,
  pessoas,
  hoje,
  frete = null,
  retorno = null,
  pedreiras = [],
  onEscolherPedreira,
  tanque = null,
  permissoes,
  selecionados,
  salvando,
  onFechar,
  onFocar,
  onPosicionar,
  onMarcarEstado,
  onAssinalarOperador,
  onEncerrarLocacao,
  onGirar,
}: FichaEquipamentoProps) {
  const opcoesOperador = React.useMemo(
    () =>
      pessoas.map((p) => ({
        valor: p.id,
        rotulo: p.funcao ? `${p.nome} · ${p.funcao}` : p.nome,
      })),
    [pessoas],
  );
  const podeEditar = permissoes.editar;
  const desde =
    e.estado === "sem_posicao" ? null : textoDesde(e.estadoDesde, hoje);
  const podeMudarEstado =
    podeEditar && e.estado !== "fora_funcionamento" && e.pos !== null;
  const onde = [
    e.trechoNome && e.km !== null
      ? `${e.trechoNome} · km ${formatarKm(e.km)}`
      : e.trechoNome,
    e.areaNome,
    e.localidadeNome,
  ].filter(Boolean);

  return (
    <section
      className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3"
      aria-label={`Ficha de ${e.codigo}`}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-corpo font-semibold">
            <span className="font-mono">{e.codigo}</span>
            {selecionados > 1 ? (
              <span className="ml-2 text-legenda font-normal text-muted-foreground">
                +{selecionados - 1} selecionados
              </span>
            ) : null}
          </p>
          <p className="line-clamp-2 text-detalhe text-muted-foreground">
            {e.descricao}
            {e.marca || e.modelo
              ? ` · ${[e.marca, e.modelo].filter(Boolean).join(" ")}`
              : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {e.pos ? (
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

      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="secondary"
          className={cn("border-transparent", CLASSES_ESTADO[e.estado])}
        >
          {ROTULO_ESTADO[e.estado]}
        </Badge>
        {desde ? (
          <span className="text-legenda text-muted-foreground">{desde}</span>
        ) : null}
        <Badge variant="outline" className="text-legenda">
          {ROTULO_PROPRIEDADE[e.propriedade]}
        </Badge>
        {e.placa ? (
          <span className="font-mono text-legenda text-muted-foreground">
            {e.placa}
          </span>
        ) : null}
      </div>

      {e.pos === null ? (
        <div className="flex flex-col gap-2 rounded-md border border-dashed border-border bg-surface p-3 text-detalhe">
          <p className="text-muted-foreground">
            Ainda não foi posicionada no mapa.
          </p>
          {podeEditar ? (
            <Button
              type="button"
              size="sm"
              onClick={onPosicionar}
              disabled={salvando}
            >
              <Crosshair />
              Posicionar no mapa
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Linha rotulo="Obra">{e.obraNome || "–"}</Linha>
        <Linha rotulo="Onde">{onde.length ? onde.join(" · ") : "–"}</Linha>
        {e.frenteNome ? <Linha rotulo="Frente">{e.frenteNome}</Linha> : null}
        {frete ? (
          <div className="mt-1 flex flex-col gap-1 rounded-md border border-border bg-surface p-2">
            <span className="text-legenda font-medium text-muted-foreground">
              Em frete
            </span>
            <Linha rotulo="Rota">
              {frete.origem || "–"} → {frete.destino || "–"}
            </Linha>
            <Linha rotulo="Material">{frete.material || "–"}</Linha>
            <Linha rotulo="Peso">
              {frete.peso !== null
                ? `${formatarQuantidade(frete.peso)} t`
                : "–"}
            </Linha>
            {frete.valorTotal !== null ? (
              <Linha rotulo="Valor do transporte">
                <MoneyText valor={frete.valorTotal} />
                {frete.km !== null && frete.valorTkm !== null
                  ? ` (${formatarQuantidade(frete.km)} km × R$ ${formatarQuantidade(frete.valorTkm)}/t·km)`
                  : ""}
              </Linha>
            ) : null}
            {frete.valorMaterial !== null ? (
              <Linha rotulo="Valor do material">
                <MoneyText valor={frete.valorMaterial} />
              </Linha>
            ) : null}
            <Linha rotulo="Motorista">{frete.motorista || "–"}</Linha>
            <Linha rotulo="Saída">
              {frete.criadoEm ? formatarDataHora(frete.criadoEm) : "–"}
            </Linha>
            <p className="text-legenda text-muted-foreground">
              Posição estimada pelo tempo desde a saída. A chegada se lança no
              Frete.
            </p>
          </div>
        ) : null}
        {tanque ? (
          <Linha rotulo={`Tanque (${tanque.nome})`}>
            {tanque.insumo || "vazio"}
            {tanque.nivel !== null
              ? ` · ${formatarQuantidade(tanque.nivel)}${
                  tanque.capacidade
                    ? ` de ${formatarQuantidade(tanque.capacidade)}`
                    : ""
                } ${tanque.unidade || "L"}`
              : ""}
          </Linha>
        ) : null}
        {retorno && !frete ? (
          <div className="mt-1 flex flex-col gap-1 rounded-md border border-border bg-surface p-2">
            <span className="text-legenda font-medium text-muted-foreground">
              Volta para a pedreira
            </span>
            <Linha rotulo="Rota">
              {retorno.de || "–"} → {retorno.pedreira || "–"}
            </Linha>
            <Linha rotulo="Chegou ao destino">
              {retorno.chegada ? formatarData(retorno.chegada) : "–"}
            </Linha>
            {podeEditar && onEscolherPedreira ? (
              <div className="flex flex-col gap-1">
                <span className="text-legenda text-muted-foreground">
                  Indo para
                </span>
                <Combobox
                  valor={retorno.pedreiraId}
                  onValorChange={(v) =>
                    v && v !== retorno.pedreiraId && onEscolherPedreira(v)
                  }
                  opcoes={pedreiras.map((p) => ({
                    valor: p.id,
                    rotulo: p.nome,
                  }))}
                  rotuloDoValor={retorno.pedreira || undefined}
                  placeholder="Pedreira"
                  buscaPlaceholder="Pedreira"
                  size="sm"
                  disabled={salvando}
                  ariaLabel="Pedreira da volta"
                />
                {retorno.pedreiraEscolhida ? (
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    className="self-start"
                    onClick={() => onEscolherPedreira(null)}
                    disabled={salvando}
                  >
                    Voltar para a última pedreira
                  </Button>
                ) : null}
              </div>
            ) : null}
            <p className="text-legenda text-muted-foreground">
              Posição estimada pelo tempo desde a chegada lançada no Frete. Se
              ela não saiu do destino, marque como parado.
            </p>
          </div>
        ) : null}
        {e.estado === "quebrado_obra" && e.quebraDescricao ? (
          <Linha rotulo="Defeito">{e.quebraDescricao}</Linha>
        ) : null}
        {e.estado === "conserto" ? (
          <>
            <Linha rotulo="Na oficina desde">
              {e.consertoDesde ? formatarData(e.consertoDesde) : "–"}
            </Linha>
            <Linha rotulo="Previsão">
              {e.consertoPrevisao ? formatarData(e.consertoPrevisao) : "–"}
            </Linha>
            {e.consertoMotivo ? (
              <Linha rotulo="Motivo">{e.consertoMotivo}</Linha>
            ) : null}
          </>
        ) : null}
        <Linha rotulo="OS abertas">{e.osAbertas}</Linha>
        <Linha rotulo="Última medição">
          {e.ultimaMedicao !== null
            ? e.ultimaMedicao.toLocaleString("pt-BR")
            : "–"}
        </Linha>
        {e.observacao ? (
          <Linha rotulo="Observação">{e.observacao}</Linha>
        ) : null}
      </div>

      <NumerosEquipamento
        key={e.id}
        equipamentoId={e.id}
        propria={e.propriedade === "propria"}
      />

      <div className="flex flex-col gap-1.5">
        <span className="text-legenda font-medium text-muted-foreground">
          Operador
        </span>
        {podeEditar ? (
          <Combobox
            valor={e.operadorId ?? ""}
            onValorChange={(v) => onAssinalarOperador(v || null)}
            opcoes={opcoesOperador}
            rotuloDoValor={e.operadorNome || undefined}
            placeholder="Sem operador assinalado"
            buscaPlaceholder="Nome ou função"
            limpavel
            size="sm"
            disabled={salvando}
            ariaLabel="Operador"
          />
        ) : (
          <p className="text-detalhe">
            {e.operadorNome || "Sem operador assinalado"}
          </p>
        )}
      </div>

      {e.locacao ? (
        <div className="flex flex-col gap-1.5 rounded-md border border-border bg-surface p-2.5">
          <span className="text-legenda font-medium text-muted-foreground">
            Locação
          </span>
          <Linha rotulo="Locador">{e.locacao.locadorNome || "–"}</Linha>
          <Linha rotulo="Aluguel">
            {e.locacao.tipoAluguel
              ? ROTULO_TIPO_ALUGUEL[e.locacao.tipoAluguel]
              : "–"}{" "}
            · <MoneyText valor={e.locacao.valorUnitario} />
          </Linha>
          <Linha rotulo="Início">
            {e.locacao.inicio ? formatarData(e.locacao.inicio) : "–"}
          </Linha>
          {e.locacao.fimPrevisto ? (
            <Linha rotulo="Fim previsto">
              {formatarData(e.locacao.fimPrevisto)}
            </Linha>
          ) : null}
          <Linha rotulo="Custo até hoje">
            {e.locacao.custoEstimado !== null ? (
              <MoneyText valor={e.locacao.custoEstimado} />
            ) : (
              "–"
            )}
          </Linha>
          {podeEditar ? (
            <Button
              type="button"
              size="xs"
              variant="outline"
              className="mt-1 self-start"
              onClick={onEncerrarLocacao}
              disabled={salvando}
            >
              Encerrar locação
            </Button>
          ) : null}
        </div>
      ) : null}

      {podeEditar && e.pos && e.fontePosicao === "manual" ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-legenda font-medium text-muted-foreground">
            Rumo {Math.round(((e.heading % 360) + 360) % 360)}°{" "}
            {e.rumoManual === null ? "(segue a pista)" : "(escolhido)"}
          </span>
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => onGirar(-90)}
              title="Girar 90° para a esquerda"
            >
              <RotateCcw className="size-3" />
              90°
            </Button>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => onGirar(-15)}
              title="Girar 15° para a esquerda"
            >
              <RotateCcw className="size-3" />
              15°
            </Button>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => onGirar(15)}
              title="Girar 15° para a direita"
            >
              <RotateCw className="size-3" />
              15°
            </Button>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => onGirar(90)}
              title="Girar 90° para a direita"
            >
              <RotateCw className="size-3" />
              90°
            </Button>
            {e.rumoManual !== null ? (
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={() => onGirar(null)}
              >
                Seguir a pista
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {podeMudarEstado ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-legenda font-medium text-muted-foreground">
            Marcar como
          </span>
          <div className="flex flex-wrap gap-1.5">
            {ESTADOS_MAQUINA.filter((s) => s !== e.estado).map((s) => (
              <Button
                key={s}
                type="button"
                size="xs"
                variant="outline"
                onClick={() => onMarcarEstado(s)}
                disabled={salvando}
              >
                {ROTULO_ESTADO[s]}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
