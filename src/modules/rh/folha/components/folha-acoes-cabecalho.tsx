"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { GerarFolhaFormDrawer } from "./gerar-folha-form-drawer";

/** Botão "Gerar folha" + drawer. Ao gerar, navega para o detalhe. */
export function FolhaAcoesCabecalho() {
  const router = useRouter();
  const [aberto, setAberto] = React.useState(false);

  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Gerar folha
      </Button>

      <GerarFolhaFormDrawer
        aberto={aberto}
        onAbertoChange={setAberto}
        onGerada={(id) => router.push(`/rh/folha/${id}`)}
      />
    </>
  );
}
