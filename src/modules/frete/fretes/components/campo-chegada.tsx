"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { semDerrubarSucesso } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Input } from "@/components/ui/input";
import { registrarChegada } from "@/modules/frete/fretes/actions";
import { diaBR } from "@/modules/frete/fretes/schemas";

export interface CampoChegadaProps {
  freteId: string;
  dataChegada: string | null;
  podeEditar: boolean;
  onSalvo?: (novaData: string | null) => void;
}

/**
 * Data de chegada editável na hora (lista, detalhe), como a origem: sem senha, só com
 * `editar`. Estado local à frente do servidor, para o campo não voltar ao valor antigo
 * enquanto a gravação vai e volta. Sem `editar`, só mostra a data ou "sem chegada".
 */
export function CampoChegada({ freteId, dataChegada, podeEditar, onSalvo }: CampoChegadaProps) {
  const router = useRouter();
  const [valor, setValor] = React.useState(dataChegada ?? "");
  const [anterior, setAnterior] = React.useState(dataChegada);
  const [salvando, setSalvando] = React.useState(false);
  if (dataChegada !== anterior) {
    setAnterior(dataChegada);
    setValor(dataChegada ?? "");
  }

  if (!podeEditar) {
    return dataChegada ? (
      <span className="tabular-nums">{diaBR(dataChegada)}</span>
    ) : (
      <span className="text-legenda text-muted-foreground italic">sem chegada</span>
    );
  }

  async function salvar(novo: string) {
    const antes = valor;
    setValor(novo);
    setSalvando(true);
    const resultado = await registrarChegada(freteId, novo === "" ? null : novo);
    setSalvando(false);
    if ("erro" in resultado) {
      setValor(antes);
      toast.error(`Falha ao salvar: ${resultado.erro}`);
      return;
    }
    toast.success("Data de chegada atualizada.");
    onSalvo?.(novo === "" ? null : novo);
    semDerrubarSucesso("frete.fretes.chegada", () => router.refresh());
  }

  return (
    <Input
      type="date"
      aria-label="Data de chegada"
      value={valor}
      disabled={salvando}
      className="h-7 w-[9.5rem] px-2 text-detalhe tabular-nums"
      onClick={(evento) => evento.stopPropagation()}
      onKeyDown={(evento) => evento.stopPropagation()}
      onChange={(evento) => {
        const novo = evento.target.value;
        if (novo === valor) return;
        // Só grava data completa, ou o campo esvaziado.
        if (novo !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(novo)) return;
        void salvar(novo);
      }}
    />
  );
}
