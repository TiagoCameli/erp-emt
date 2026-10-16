"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { type LocalFormOpcao } from "@/modules/estoque/calculo";
import type { InsumoOpcao } from "@/modules/manutencao/almoxarifado/queries";
import { TransferenciaFormDrawer } from "./transferencia-form-drawer";

export interface TransferenciasAcoesCabecalhoProps {
  podeCriar: boolean;
  locais: (LocalFormOpcao & { ativo: boolean })[];
  materiais: InsumoOpcao[];
  /** Pares local × insumo com saldo (o mapa não atravessa a fronteira do servidor). */
  saldos: { chave: string; saldo: number }[];
}

/** Botão "Registrar transferência" do cabeçalho. */
export function TransferenciasAcoesCabecalho({ podeCriar, locais, materiais, saldos }: TransferenciasAcoesCabecalhoProps) {
  const [aberto, setAberto] = React.useState(false);
  const mapa = React.useMemo(() => new Map(saldos.map((s) => [s.chave, s.saldo])), [saldos]);
  if (!podeCriar) return null;
  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Registrar transferência
      </Button>
      <TransferenciaFormDrawer
        aberto={aberto}
        onAbertoChange={setAberto}
        transferencia={null}
        locais={locais}
        materiais={materiais}
        saldos={mapa}
      />
    </>
  );
}
