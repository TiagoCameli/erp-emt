"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ColaboradorOpcao, ObraOpcao } from "@/modules/rh/_shared/queries";
import { CriarPontoFormDrawer } from "./criar-ponto-form-drawer";

export interface AcoesCabecalhoProps {
  obras: ObraOpcao[];
  colaboradores: ColaboradorOpcao[];
}

/** Botão "Novo ponto" + drawer. Ao criar, navega para o detalhe do ponto. */
export function AcoesCabecalho({ obras, colaboradores }: AcoesCabecalhoProps) {
  const router = useRouter();
  const [aberto, setAberto] = React.useState(false);

  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Novo ponto
      </Button>

      <CriarPontoFormDrawer
        aberto={aberto}
        onAbertoChange={setAberto}
        obras={obras}
        colaboradores={colaboradores}
        onCriado={(id) => router.push(`/rh/apontamentos/${id}`)}
      />
    </>
  );
}
