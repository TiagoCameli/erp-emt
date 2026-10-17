"use client";

import * as React from "react";

import { ConfirmDialog } from "@/components/canonicos";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ROTULO_ESTADO,
  type EquipamentoMapa,
  type EstadoMaquina,
} from "@/modules/mapa/tipos";

/**
 * Mudança de estado pelo clique na ficha. Cada estado pede o que precisa: quebrado na obra e
 * quebrado esperando conserto querem a descrição do defeito; conserto quer a previsão (a máquina
 * fica onde está: só a transferência a leva para outro lugar); fora de funcionamento quer o
 * motivo. Operando e parado
 * só pedem o motivo, sem obrigar. Em frete e em deslocamento não se marcam: vêm do Frete
 * (carretas EMT).
 * Montado pelo pai só enquanto há pedido, por isso nasce limpo.
 */

export interface PedidoEstado {
  equipamento: EquipamentoMapa;
  estado: EstadoMaquina;
}

export interface ConfirmacaoEstado {
  motivo: string;
  descricao: string;
  previsao: string;
}

const DESCRICAO: Record<EstadoMaquina, string> = {
  operando: "A máquina volta a contar como operando a partir de agora.",
  parado:
    "Parada na posição atual. Parado por muitos dias vira alerta. Carreta que chegou do frete fica no destino, sem voltar para a pedreira.",
  quebrado_obra:
    "Quebrada na frente, aguardando a manutenção. Descreva o defeito para a OS.",
  esperando_conserto:
    "Quebrada e parada, esperando a vez na oficina ou a peça. Fica onde está no mapa. Descreva o defeito.",
  conserto:
    "Fica onde está no mapa. Para levar a máquina a outro lugar, use a transferência.",
  fora_funcionamento:
    "Parada de vez, sem previsão de voltar a trabalhar. Fica no lugar onde está.",
};

export function DialogoEstado({
  pedido,
  onCancelar,
  onConfirmar,
}: {
  pedido: PedidoEstado;
  onCancelar: () => void;
  onConfirmar: (dados: ConfirmacaoEstado) => Promise<boolean>;
}) {
  const [descricao, setDescricao] = React.useState("");
  const [previsao, setPrevisao] = React.useState("");
  const id = React.useId();

  const { equipamento, estado } = pedido;
  const exigeMotivo =
    estado === "quebrado_obra" ||
    estado === "esperando_conserto" ||
    estado === "conserto" ||
    estado === "fora_funcionamento";

  return (
    <ConfirmDialog
      aberto
      onAbertoChange={(aberto) => {
        if (!aberto) onCancelar();
      }}
      titulo={`${equipamento.codigo}: ${ROTULO_ESTADO[estado].toLowerCase()}`}
      descricao={DESCRICAO[estado]}
      textoConfirmar={`Marcar como ${ROTULO_ESTADO[estado].toLowerCase()}`}
      exigeMotivo={exigeMotivo}
      minMotivo={3}
      conteudo={
        estado === "quebrado_obra" || estado === "esperando_conserto" ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-defeito`}>Defeito</Label>
            <Textarea
              id={`${id}-defeito`}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="O que quebrou, o que a máquina precisa"
            />
          </div>
        ) : estado === "conserto" ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-previsao`}>Previsão de volta</Label>
            <Input
              id={`${id}-previsao`}
              type="date"
              value={previsao}
              onChange={(e) => setPrevisao(e.target.value)}
              className="max-w-[12rem]"
            />
          </div>
        ) : undefined
      }
      onConfirmar={(motivo) =>
        onConfirmar({
          motivo: (motivo ?? "").trim(),
          descricao: descricao.trim(),
          previsao,
        })
      }
    />
  );
}
