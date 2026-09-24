"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { semDerrubarSucesso } from "@/components/canonicos/acao-sem-silencio";
import { Button } from "@/components/ui/button";
import { AjusteFormDrawer, type OpcaoSimples } from "@/modules/frete/ajustes/components/ajuste-form-drawer";

export interface NovoAjusteBotaoProps {
  transportadoras: OpcaoSimples[];
  obras: OpcaoSimples[];
  transportadoraFixa?: { id: string; nome: string };
}

/** "Novo ajuste" do cabeçalho (lista de ajustes e extrato da transportadora). */
export function NovoAjusteBotao({ transportadoras, obras, transportadoraFixa }: NovoAjusteBotaoProps) {
  const router = useRouter();
  const [aberto, setAberto] = React.useState(false);
  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Novo ajuste
      </Button>
      <AjusteFormDrawer
        aberto={aberto}
        onAbertoChange={setAberto}
        transportadoras={transportadoras}
        obras={obras}
        transportadoraFixa={transportadoraFixa}
        onSalvo={() => semDerrubarSucesso("frete.ajustes.criar", () => router.refresh())}
      />
    </>
  );
}
