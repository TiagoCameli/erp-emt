"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { semDerrubarSucesso } from "@/components/canonicos/acao-sem-silencio";
import { Button } from "@/components/ui/button";
import {
  AbastecimentoFormDrawer,
  type OpcoesAbastecimento,
} from "./abastecimento-form-drawer";

/** Botão "Lançar abastecimento" do cabeçalho, com o drawer. */
export function NovoAbastecimentoBotao({ opcoes }: { opcoes: OpcoesAbastecimento }) {
  const router = useRouter();
  const [aberto, setAberto] = React.useState(false);
  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Lançar abastecimento
      </Button>
      <AbastecimentoFormDrawer
        aberto={aberto}
        onAbertoChange={setAberto}
        abastecimento={null}
        opcoes={opcoes}
        onSalvo={() => semDerrubarSucesso("combustivel.saidas.novo", () => router.refresh())}
      />
    </>
  );
}
