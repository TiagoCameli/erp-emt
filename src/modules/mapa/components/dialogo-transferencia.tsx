"use client";

import * as React from "react";

import { ConfirmDialog } from "@/components/canonicos";
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
  formatarKm,
  formatarMetros,
  type DestinoResolvido,
} from "@/modules/mapa/geo";
import { rotuloTipoLocalidade } from "@/modules/mapa/rotulos";
import {
  ROTULO_ESTADO,
  ROTULO_TIPO_AREA,
  type EquipamentoMapa,
  type EstadoMaquina,
  type Posicao,
} from "@/modules/mapa/tipos";

/**
 * Confirmação do arraste (ou do "posicionar"): diz onde cada máquina vai cair, segundo a mesma
 * regra do banco (área > trecho > local > livre), pede a data efetiva e o motivo, e só pergunta
 * o estado quando alguma caiu fora de qualquer zona. Confirmar grava; cancelar devolve as
 * máquinas para onde estavam. Montado pelo pai só enquanto há pedido, por isso nasce limpo.
 */

export interface ItemPendente {
  equipamento: EquipamentoMapa;
  de: Posicao | null;
  para: Posicao;
  destino: DestinoResolvido;
}

export interface Pendente {
  modo: "arraste" | "posicionar";
  principal: EquipamentoMapa;
  itens: ItemPendente[];
}

export interface ConfirmacaoTransferencia {
  data: string;
  motivo: string;
  /** Estado para os itens que caíram em ponto livre. */
  estadoLivre: EstadoMaquina;
}

const ESTADOS_LIVRE: EstadoMaquina[] = ["operando", "parado", "em_rota"];

function descreverDestino(d: DestinoResolvido): string {
  switch (d.tipo) {
    case "area":
      return `${d.area.nome} (${ROTULO_TIPO_AREA[d.area.tipo] ?? d.area.tipo}) · ${ROTULO_ESTADO[d.estado].toLowerCase()}`;
    case "trecho":
      return `${d.trecho.nome} · km ${formatarKm(d.km)} · a ${formatarMetros(d.distanciaM)} do traçado · operando`;
    case "localidade":
      return `${d.local.nome} (${rotuloTipoLocalidade(d.local.tipo).toLowerCase()}, ${formatarMetros(d.distanciaM)}) · ${ROTULO_ESTADO[d.estado].toLowerCase()}`;
    default:
      return `Fora de qualquer zona (${d.pos[1].toFixed(5)}, ${d.pos[0].toFixed(5)})`;
  }
}

export function DialogoTransferencia({
  pendente,
  hoje,
  onCancelar,
  onConfirmar,
}: {
  pendente: Pendente;
  hoje: string;
  onCancelar: () => void;
  onConfirmar: (dados: ConfirmacaoTransferencia) => Promise<boolean>;
}) {
  const [data, setData] = React.useState(hoje);
  const [motivo, setMotivo] = React.useState("");
  const [estadoLivre, setEstadoLivre] =
    React.useState<EstadoMaquina>("operando");
  const idData = React.useId();
  const idMotivo = React.useId();
  const idEstado = React.useId();

  const n = pendente.itens.length;
  const algumLivre = pendente.itens.some((i) => i.destino.tipo === "livre");
  const titulo =
    pendente.modo === "posicionar"
      ? `Posicionar ${pendente.principal.codigo}`
      : n > 1
        ? `Transferir ${n} equipamentos`
        : `Transferir ${pendente.principal.codigo}`;

  return (
    <ConfirmDialog
      aberto
      onAbertoChange={(aberto) => {
        if (!aberto) onCancelar();
      }}
      titulo={titulo}
      descricao={
        pendente.modo === "posicionar"
          ? "A máquina entra no mapa neste ponto. A alocação e a movimentação ficam registradas."
          : "A posição nova vale a partir da data efetiva e fica na trilha de movimentações."
      }
      textoConfirmar={
        pendente.modo === "posicionar" ? "Posicionar" : "Transferir"
      }
      conteudo={
        <div className="flex flex-col gap-4">
          <ul className="flex flex-col gap-2 text-detalhe">
            {pendente.itens.map((item) => (
              <li
                key={item.equipamento.id}
                className="rounded-md border border-border bg-surface px-3 py-2"
              >
                <p className="font-medium text-foreground">
                  {item.equipamento.codigo}{" "}
                  <span className="font-normal text-muted-foreground">
                    {item.equipamento.descricao}
                  </span>
                </p>
                <p className="text-muted-foreground">
                  {descreverDestino(item.destino)}
                </p>
              </li>
            ))}
          </ul>
          {algumLivre ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor={idEstado}>
                Fora de qualquer zona: qual o estado?
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
      onConfirmar={() =>
        onConfirmar({ data, motivo: motivo.trim(), estadoLivre })
      }
    />
  );
}
