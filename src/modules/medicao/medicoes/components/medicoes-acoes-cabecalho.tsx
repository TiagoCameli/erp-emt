"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ObraOpcao } from "@/modules/medicao/_shared/queries";
import { CriarMedicaoFormDrawer } from "./criar-medicao-form-drawer";

export interface MedicoesAcoesCabecalhoProps {
  obras: ObraOpcao[];
}

/** Botão "Nova medição" + drawer. Ao criar, navega para o detalhe. */
export function MedicoesAcoesCabecalho({
  obras,
}: MedicoesAcoesCabecalhoProps) {
  const router = useRouter();
  const [aberto, setAberto] = React.useState(false);

  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Nova medição
      </Button>

      <CriarMedicaoFormDrawer
        aberto={aberto}
        onAbertoChange={setAberto}
        obras={obras}
        onCriada={(id) => router.push(`/medicao/medicoes/${id}`)}
      />
    </>
  );
}
