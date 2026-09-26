"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { semDerrubarSucesso } from "@/components/canonicos/acao-sem-silencio";
import { Button } from "@/components/ui/button";
import { ContratoFormDrawer } from "@/modules/medicao/contratos/components/contrato-form-drawer";

/** "Cadastrar contrato" do cabeçalho da lista. Só aparece para quem pode criar. */
export function NovoContratoBotao() {
  const router = useRouter();
  const [aberto, setAberto] = React.useState(false);
  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Cadastrar contrato
      </Button>
      <ContratoFormDrawer
        aberto={aberto}
        onAbertoChange={setAberto}
        onSalvo={() => semDerrubarSucesso("medicao.contratos.criar", () => router.refresh())}
      />
    </>
  );
}
