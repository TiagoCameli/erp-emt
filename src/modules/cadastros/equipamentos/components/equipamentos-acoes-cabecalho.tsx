"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ImportarCadastro } from "@/modules/cadastros/_shared/importar-cadastro";
import {
  importarEquipamentos,
  validarImport,
} from "@/modules/cadastros/equipamentos/actions";
import { EquipamentosFormDrawer } from "./equipamentos-form-drawer";

export interface EquipamentosAcoesCabecalhoProps {
  podeCriar: boolean;
}

/**
 * Ações do cabeçalho de equipamentos: importar planilha e criar um novo
 * equipamento. Só renderiza quando o usuário tem permissão de criar.
 */
export function EquipamentosAcoesCabecalho({
  podeCriar,
}: EquipamentosAcoesCabecalhoProps) {
  const [aberto, setAberto] = React.useState(false);

  if (!podeCriar) return null;

  return (
    <>
      <ImportarCadastro
        titulo="Importar equipamentos"
        modeloHref="/cadastros/equipamentos/modelo"
        validarAction={validarImport}
        importarAction={importarEquipamentos}
      />
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Novo equipamento
      </Button>

      <EquipamentosFormDrawer
        key={aberto ? "aberto" : "fechado"}
        aberto={aberto}
        onAbertoChange={setAberto}
        equipamento={null}
        documentos={[]}
        podeEditar
      />
    </>
  );
}
