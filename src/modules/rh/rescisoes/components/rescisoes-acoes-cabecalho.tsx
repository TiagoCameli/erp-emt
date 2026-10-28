"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ColaboradorParaRescisao } from "@/modules/rh/rescisoes/queries";
import { GerarRescisaoDrawer } from "./gerar-rescisao-drawer";

export interface RescisoesAcoesCabecalhoProps {
  colaboradores: ColaboradorParaRescisao[];
}

/**
 * Botão "Gerar rescisão" + drawer, para a ação primária do PageHeader. O botão
 * do estado vazio da tabela só aparece com a lista vazia; este fica sempre.
 */
export function RescisoesAcoesCabecalho({
  colaboradores,
}: RescisoesAcoesCabecalhoProps) {
  const router = useRouter();
  const [aberto, setAberto] = React.useState(false);

  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Gerar rescisão
      </Button>
      <GerarRescisaoDrawer
        aberto={aberto}
        onAbertoChange={setAberto}
        colaboradores={colaboradores}
        onGerada={(id) => router.push(`/rh/rescisoes/${id}`)}
      />
    </>
  );
}
