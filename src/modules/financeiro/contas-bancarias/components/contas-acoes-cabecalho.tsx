"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ContasFormDrawer } from "./contas-form-drawer";

export interface ContasAcoesCabecalhoProps {
  podeCriar: boolean;
}

/**
 * Ação do cabeçalho de contas bancárias: criar uma nova conta.
 * Só renderiza quando o usuário tem permissão de criar.
 */
export function ContasAcoesCabecalho({ podeCriar }: ContasAcoesCabecalhoProps) {
  const [aberto, setAberto] = React.useState(false);

  if (!podeCriar) return null;

  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Nova conta
      </Button>

      <ContasFormDrawer
        key={aberto ? "aberto" : "fechado"}
        aberto={aberto}
        onAbertoChange={setAberto}
        conta={null}
      />
    </>
  );
}
