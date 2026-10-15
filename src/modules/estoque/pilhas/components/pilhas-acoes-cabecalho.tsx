"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PilhaFormDrawer } from "./pilha-form-drawer";

/** Botão "Nova pilha" do cabeçalho. */
export function PilhasAcoesCabecalho({ podeCriar }: { podeCriar: boolean }) {
  const [aberto, setAberto] = React.useState(false);

  if (!podeCriar) return null;

  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Nova pilha
      </Button>
      <PilhaFormDrawer aberto={aberto} onAbertoChange={setAberto} />
    </>
  );
}
