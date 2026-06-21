"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ObraOpcao } from "@/modules/medicao/_shared/queries";
import type { PlanilhaCabecalho } from "@/modules/medicao/planilha-contratual/queries";
import { PlanilhaFormDrawer } from "./planilha-form-drawer";

export interface ItensAcoesCabecalhoProps {
  planilha: PlanilhaCabecalho;
  obras: ObraOpcao[];
  podeEditar: boolean;
}

/**
 * Ações do cabeçalho da tela de itens: voltar para a lista de planilhas e,
 * com permissão, editar o cabeçalho da planilha pelo drawer.
 */
export function ItensAcoesCabecalho({
  planilha,
  obras,
  podeEditar,
}: ItensAcoesCabecalhoProps) {
  const [aberto, setAberto] = React.useState(false);

  return (
    <>
      <Button asChild type="button" variant="outline" size="sm">
        <Link href="/medicao/planilha-contratual">
          <ArrowLeft />
          Voltar
        </Link>
      </Button>
      {podeEditar ? (
        <>
          <Button type="button" size="sm" onClick={() => setAberto(true)}>
            <Pencil />
            Editar planilha
          </Button>
          <PlanilhaFormDrawer
            aberto={aberto}
            onAbertoChange={setAberto}
            planilha={planilha}
            obras={obras}
          />
        </>
      ) : null}
    </>
  );
}
