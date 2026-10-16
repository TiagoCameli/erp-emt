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
 * Mudança de estado pelo clique na ficha. Cada estado pede o que precisa: quebrado na obra
 * quer a descrição do defeito; conserto quer a previsão (a máquina fica onde está: só a
 * transferência a leva para outro lugar); em rota quer o trajeto (de onde, para onde, com
 * o quê); fora de funcionamento quer o motivo. Operando e parado só pedem o motivo, sem obrigar.
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
  deslocamento: {
    origem: string;
    destino: string;
    transporte: string;
    previsao: string;
  } | null;
}

const DESCRICAO: Record<EstadoMaquina, string> = {
  operando: "A máquina volta a contar como operando a partir de agora.",
  parado: "Parada na posição atual. Parado por muitos dias vira alerta.",
  em_rota:
    "Em deslocamento (prancha própria ou de terceiro). Informe o trajeto.",
  quebrado_obra:
    "Quebrada na frente, aguardando a manutenção. Descreva o defeito para a OS.",
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
  const [origem, setOrigem] = React.useState("");
  const [destino, setDestino] = React.useState("");
  const [transporte, setTransporte] = React.useState("");
  const id = React.useId();

  const { equipamento, estado } = pedido;
  const exigeMotivo =
    estado === "quebrado_obra" ||
    estado === "conserto" ||
    estado === "em_rota" ||
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
        estado === "quebrado_obra" ? (
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
        ) : estado === "em_rota" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-origem`}>De</Label>
              <Input
                id={`${id}-origem`}
                value={origem}
                onChange={(e) => setOrigem(e.target.value)}
                maxLength={300}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-destino`}>Para</Label>
              <Input
                id={`${id}-destino`}
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
                maxLength={300}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-transporte`}>Transporte</Label>
              <Input
                id={`${id}-transporte`}
                value={transporte}
                onChange={(e) => setTransporte(e.target.value)}
                maxLength={300}
                placeholder="prancha própria, terceiro..."
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-chegada`}>Previsão de chegada</Label>
              <Input
                id={`${id}-chegada`}
                type="date"
                value={previsao}
                onChange={(e) => setPrevisao(e.target.value)}
              />
            </div>
          </div>
        ) : undefined
      }
      onConfirmar={(motivo) =>
        onConfirmar({
          motivo: (motivo ?? "").trim(),
          descricao: descricao.trim(),
          previsao,
          deslocamento:
            estado === "em_rota"
              ? {
                  origem: origem.trim(),
                  destino: destino.trim(),
                  transporte: transporte.trim(),
                  previsao,
                }
              : null,
        })
      }
    />
  );
}
