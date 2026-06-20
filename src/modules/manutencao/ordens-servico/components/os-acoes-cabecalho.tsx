"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { EquipamentoOpcao } from "@/modules/manutencao/_shared/queries";
import { AbrirOsFormDrawer } from "./abrir-os-form-drawer";

export interface OsAcoesCabecalhoProps {
  equipamentos: EquipamentoOpcao[];
}

/** Botão "Nova OS" + drawer. Ao abrir, navega para o detalhe da OS criada. */
export function OsAcoesCabecalho({ equipamentos }: OsAcoesCabecalhoProps) {
  const router = useRouter();
  const [aberto, setAberto] = React.useState(false);

  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Nova OS
      </Button>

      <AbrirOsFormDrawer
        aberto={aberto}
        onAbertoChange={setAberto}
        equipamentos={equipamentos}
        onAberta={(id) => router.push(`/manutencao/ordens-servico/${id}`)}
      />
    </>
  );
}
