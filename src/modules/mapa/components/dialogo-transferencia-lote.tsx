"use client";

import * as React from "react";

import { Combobox, ConfirmDialog } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ROTULO_SEM_OBRA,
  descreverDestino,
  type ItemPendente,
  type LugarOpcao,
  type ObraOpcao,
} from "@/modules/mapa/components/dialogo-transferencia";
import { rotuloDoLote } from "@/modules/mapa/lote";
import {
  SEM_OBRA,
  decisaoObra,
  type DecisaoObra,
} from "@/modules/mapa/obra-destino";
import {
  ROTULO_ESTADO,
  type EquipamentoMapa,
  type EstadoMaquina,
  type PessoaMapa,
  type Posicao,
} from "@/modules/mapa/tipos";

/**
 * "Transferir" da seleção múltipla (Tiago, 17/10/2026): as máquinas e as pessoas selecionadas vão
 * juntas para o mesmo lugar (obra, local ou área do mapa), na mesma obra, com a mesma data efetiva
 * e o mesmo motivo. Cada uma cai num ponto livre em volta do lugar (`levarPara`); a obra vem do
 * lugar e pode ser trocada. Montado pelo pai só enquanto há pedido, por isso nasce limpo.
 */

export interface PessoaNoLote {
  pessoa: PessoaMapa;
  para: Posicao;
}

/** Onde cada um cai no lugar escolhido; null = lugar sem ponto no mapa. */
export interface DestinoDoLote {
  itens: ItemPendente[];
  pessoas: PessoaNoLote[];
  /** A obra do lugar (a própria obra, ou a obra do local ou da área); null = lugar sem obra. */
  obraSugerida: string | null;
}

export interface ConfirmacaoLote {
  data: string;
  motivo: string;
  /** Estado para as máquinas que caíram em ponto livre. */
  estadoLivre: EstadoMaquina;
  /** Chave do lugar escolhido ("obra:<id>", "local:<id>", "area:<id>"). */
  lugar: string;
  itens: ItemPendente[];
  pessoas: PessoaNoLote[];
  obra: DecisaoObra;
}

const ESTADOS_LIVRE: EstadoMaquina[] = ["operando", "parado"];

export function DialogoTransferenciaLote({
  equipamentos,
  pessoas,
  hoje,
  obras,
  lugares,
  levarPara,
  codigoDaMaquina,
  obraCarretasEmt = null,
  onCancelar,
  onConfirmar,
}: {
  equipamentos: EquipamentoMapa[];
  pessoas: PessoaMapa[];
  hoje: string;
  obras: ObraOpcao[];
  lugares: LugarOpcao[];
  levarPara: (chave: string) => DestinoDoLote | null;
  /** Código da máquina que a pessoa opera hoje (ela deixa de operar ao ser transferida). */
  codigoDaMaquina: (equipamentoId: string) => string | null;
  /** Obra "001 - Carretas EMT": fixa para as carretas da EMT Transportes (v1.22). */
  obraCarretasEmt?: string | null;
  onCancelar: () => void;
  onConfirmar: (dados: ConfirmacaoLote) => Promise<boolean>;
}) {
  const [data, setData] = React.useState(hoje);
  const [motivo, setMotivo] = React.useState("");
  const [estadoLivre, setEstadoLivre] =
    React.useState<EstadoMaquina>("operando");
  const [lugar, setLugar] = React.useState("");
  const soCarretas =
    obraCarretasEmt !== null &&
    pessoas.length === 0 &&
    equipamentos.length > 0 &&
    equipamentos.every((e) => e.carretaEmt);
  const [escolhaObra, setEscolhaObra] = React.useState(
    soCarretas && obraCarretasEmt ? obraCarretasEmt : "",
  );
  const idData = React.useId();
  const idMotivo = React.useId();
  const idEstado = React.useId();
  const idObra = React.useId();
  const idLugar = React.useId();

  const destino = React.useMemo(
    () => (lugar ? levarPara(lugar) : null),
    [lugar, levarPara],
  );

  /** Trocou o lugar: a obra passa a ser a do lugar (pode trocar depois). */
  function escolherLugar(chave: string) {
    setLugar(chave);
    if (soCarretas) return;
    setEscolhaObra((chave ? levarPara(chave)?.obraSugerida : null) ?? "");
  }

  const nomeObra = React.useMemo(
    () => new Map(obras.map((o) => [o.id, o.nome])),
    [obras],
  );
  const opcoesObra = React.useMemo(
    () => [
      ...obras.map((o) => ({ valor: o.id, rotulo: o.nome })),
      { valor: SEM_OBRA, rotulo: ROTULO_SEM_OBRA },
    ],
    [obras],
  );
  const opcoesLugar = React.useMemo(
    () => lugares.map((l) => ({ valor: l.chave, rotulo: l.rotulo })),
    [lugares],
  );

  const decisao = decisaoObra(escolhaObra);
  const obraEscolhida = decisao.tipo === "obra" ? decisao.obraId : null;
  const itens = destino?.itens ?? [];
  // Só quem entra no mapa agora recebe estado; quem já está mantém o seu (v1.27).
  const algumLivre = itens.some(
    (i) => i.destino.tipo === "livre" && i.equipamento.pos === null,
  );
  const alvo = rotuloDoLote(equipamentos.length, pessoas.length);

  function obraDaMaquina(e: EquipamentoMapa): string | null {
    if (e.carretaEmt && obraCarretasEmt)
      return `Obra: ${nomeObra.get(obraCarretasEmt) ?? "Carretas EMT"} (fixa: carreta da EMT Transportes)`;
    if (obraEscolhida)
      return `Obra: ${nomeObra.get(obraEscolhida) ?? "obra escolhida"}`;
    return e.obraId ? `Sem obra · deixa a obra ${e.obraNome}` : "Sem obra";
  }

  function obraDaPessoa(p: PessoaMapa): string {
    if (obraEscolhida)
      return `Obra: ${nomeObra.get(obraEscolhida) ?? "obra escolhida"}`;
    return p.obraId
      ? `Continua na obra ${nomeObra.get(p.obraId) ?? "atual"}`
      : "Sem obra";
  }

  return (
    <ConfirmDialog
      aberto
      onAbertoChange={(aberto) => {
        if (!aberto) onCancelar();
      }}
      titulo={`Transferir ${alvo}`}
      descricao="Todos vão para o mesmo lugar, com a mesma obra, data efetiva e motivo. Cada um cai num ponto livre em volta do lugar; depois dá para arrastar para o ponto exato. O estado das máquinas não muda."
      textoConfirmar="Transferir"
      conteudo={
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={idLugar}>Para onde</Label>
            <Combobox
              id={idLugar}
              valor={lugar}
              onValorChange={escolherLugar}
              opcoes={opcoesLugar}
              placeholder="Obra, local ou área"
              buscaPlaceholder="Buscar obra, local ou área"
              vazioTexto="Nada com lugar no mapa"
            />
          </div>
          {soCarretas ? null : (
            <div className="flex flex-col gap-2">
              <Label htmlFor={idObra}>Obra em que trabalham</Label>
              <Combobox
                id={idObra}
                valor={escolhaObra}
                onValorChange={setEscolhaObra}
                opcoes={opcoesObra}
                placeholder="Sem obra"
                buscaPlaceholder="Buscar obra"
                vazioTexto="Nenhuma obra encontrada"
              />
            </div>
          )}
          <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto text-detalhe">
            {equipamentos.map((e) => {
              const item = itens.find((i) => i.equipamento.id === e.id);
              const obra = obraDaMaquina(e);
              return (
                <li
                  key={e.id}
                  className="rounded-md border border-border bg-surface px-3 py-2"
                >
                  <p className="font-medium text-foreground">
                    {e.codigo}{" "}
                    <span className="font-normal text-muted-foreground">
                      {e.descricao}
                    </span>
                  </p>
                  {item ? (
                    <p className="text-muted-foreground">
                      {descreverDestino(item.destino, e.pos === null)}
                    </p>
                  ) : null}
                  {e.pos !== null ? (
                    <p className="text-muted-foreground">
                      Continua {ROTULO_ESTADO[e.estado].toLowerCase()}.
                    </p>
                  ) : null}
                  {obra ? <p className="text-foreground">{obra}</p> : null}
                </li>
              );
            })}
            {pessoas.map((p) => {
              const maquina = p.equipamentoId
                ? codigoDaMaquina(p.equipamentoId)
                : null;
              return (
                <li
                  key={p.id}
                  className="rounded-md border border-border bg-surface px-3 py-2"
                >
                  <p className="font-medium text-foreground">
                    {p.nome}{" "}
                    <span className="font-normal text-muted-foreground">
                      {p.funcao}
                    </span>
                  </p>
                  <p className="text-foreground">{obraDaPessoa(p)}</p>
                  {maquina ? (
                    <p className="text-muted-foreground">
                      Deixa de operar {maquina}.
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {algumLivre ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor={idEstado}>
                Fora de qualquer zona: qual o estado das máquinas?
              </Label>
              <Select
                value={estadoLivre}
                onValueChange={(v) => setEstadoLivre(v as EstadoMaquina)}
              >
                <SelectTrigger id={idEstado} className="w-full max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ESTADOS_LIVRE.map((e) => (
                    <SelectItem key={e} value={e}>
                      {ROTULO_ESTADO[e]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
            <div className="flex flex-col gap-2">
              <Label htmlFor={idData}>Data efetiva</Label>
              <Input
                id={idData}
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={idMotivo}>Motivo</Label>
              <Input
                id={idMotivo}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="ex.: frente de CBUQ km 701"
                maxLength={300}
              />
            </div>
          </div>
        </div>
      }
      onConfirmar={() => {
        if (!lugar) {
          toast.warning("Escolha para onde vão.");
          return false;
        }
        if (!destino) {
          toast.warning("Esse lugar ainda não tem ponto no mapa.");
          return false;
        }
        if (!data) {
          toast.warning("Informe a data efetiva.");
          return false;
        }
        return onConfirmar({
          data,
          motivo: motivo.trim(),
          estadoLivre,
          lugar,
          itens: destino.itens,
          pessoas: destino.pessoas,
          obra: decisao,
        });
      }}
    />
  );
}
