"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DepositoFormDrawer } from "./deposito-form-drawer";

/** Botão "Novo depósito" do cabeçalho. */
export function DepositosAcoesCabecalho({ podeCriar }: { podeCriar: boolean }) {
  const [aberto, setAberto] = React.useState(false);

  if (!podeCriar) return null;

  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Novo depósito
      </Button>
      <DepositoFormDrawer aberto={aberto} onAbertoChange={setAberto} />
    </>
  );
}
