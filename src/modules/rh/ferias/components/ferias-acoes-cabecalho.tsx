"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ColaboradorOpcao } from "@/modules/rh/_shared/queries";
import type { ColaboradorParaRecibo } from "@/modules/rh/ferias/recibo-queries";

import { FeriasFormDrawer } from "./ferias-form-drawer";
import { LancarFeriasDrawer } from "./lancar-ferias-drawer";

export interface FeriasAcoesCabecalhoProps {
  colaboradores: ColaboradorOpcao[];
  colaboradoresParaRecibo: ColaboradorParaRecibo[];
}

/**
 * As duas portas de entrada de férias, na ação do PageHeader.
 *
 * "Lançar férias" é a principal: cria o período E o recibo de uma vez, que é o
 * caminho de quem já sabe quanto a pessoa recebe. "Programar férias" só marca o
 * gozo, para quem monta o calendário antes de ter os valores; o recibo abre
 * depois, na tela do registro, digitando um valor.
 *
 * A principal fica à direita, no lugar onde a ação primária do cabeçalho
 * sempre esteve nas outras telas.
 */
export function FeriasAcoesCabecalho({
  colaboradores,
  colaboradoresParaRecibo,
}: FeriasAcoesCabecalhoProps) {
  const router = useRouter();
  const [programarAberto, setProgramarAberto] = React.useState(false);
  const [lancarAberto, setLancarAberto] = React.useState(false);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setProgramarAberto(true)}
      >
        <CalendarPlus />
        Programar férias
      </Button>
      <Button type="button" size="sm" onClick={() => setLancarAberto(true)}>
        <Plus />
        Lançar férias
      </Button>

      <FeriasFormDrawer
        aberto={programarAberto}
        onAbertoChange={setProgramarAberto}
        colaboradores={colaboradores}
      />
      <LancarFeriasDrawer
        aberto={lancarAberto}
        onAbertoChange={setLancarAberto}
        colaboradores={colaboradoresParaRecibo}
        onLancado={(id) =>
          router.push(`/rh/decimo-terceiro-e-ferias/ferias/${id}`)
        }
      />
    </>
  );
}
