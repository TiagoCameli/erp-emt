"use client";

import * as React from "react";
import { Gauge, Link2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { EquipamentoOpcao } from "@/modules/manutencao/_shared/queries";
import type { PlanoLista } from "@/modules/manutencao/planos-preventivos/queries";
import { AtribuirPlanoFormDrawer } from "./atribuir-plano-form-drawer";
import { LeituraFormDrawer } from "./leitura-form-drawer";
import { PlanoFormDrawer } from "./plano-form-drawer";

export interface AcoesCabecalhoProps {
  equipamentos: EquipamentoOpcao[];
  planos: PlanoLista[];
  /** Pode criar planos (manutencao.planos-preventivos / criar). */
  podeCriar: boolean;
  /** Pode atribuir e registrar leitura (manutencao.planos-preventivos / editar). */
  podeEditar: boolean;
}

/**
 * Ações do PageHeader: "Novo plano", "Atribuir plano" e "Registrar leitura",
 * cada um abrindo seu drawer. Os botões respeitam a permissão: criar libera
 * novo plano, editar libera atribuir e registrar leitura.
 */
export function AcoesCabecalho({
  equipamentos,
  planos,
  podeCriar,
  podeEditar,
}: AcoesCabecalhoProps) {
  const [planoAberto, setPlanoAberto] = React.useState(false);
  const [atribuirAberto, setAtribuirAberto] = React.useState(false);
  const [leituraAberto, setLeituraAberto] = React.useState(false);

  return (
    <>
      {podeEditar ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setLeituraAberto(true)}
        >
          <Gauge />
          Registrar leitura
        </Button>
      ) : null}

      {podeEditar ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setAtribuirAberto(true)}
        >
          <Link2 />
          Atribuir plano
        </Button>
      ) : null}

      {podeCriar ? (
        <Button type="button" size="sm" onClick={() => setPlanoAberto(true)}>
          <Plus />
          Novo plano
        </Button>
      ) : null}

      {podeCriar ? (
        <PlanoFormDrawer
          aberto={planoAberto}
          onAbertoChange={setPlanoAberto}
          plano={null}
        />
      ) : null}

      {podeEditar ? (
        <AtribuirPlanoFormDrawer
          aberto={atribuirAberto}
          onAbertoChange={setAtribuirAberto}
          equipamentos={equipamentos}
          planos={planos}
        />
      ) : null}

      {podeEditar ? (
        <LeituraFormDrawer
          aberto={leituraAberto}
          onAbertoChange={setLeituraAberto}
          equipamentos={equipamentos}
        />
      ) : null}
    </>
  );
}
