"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ClientesFormDrawer } from "./clientes-form-drawer";

/** Botão "Novo cliente" do cabeçalho, com o drawer de criação acoplado. */
export function ClientesNovoBotao() {
  const [aberto, setAberto] = React.useState(false);

  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Novo cliente
      </Button>
      <ClientesFormDrawer
        aberto={aberto}
        onAbertoChange={setAberto}
        cliente={null}
      />
    </>
  );
}
