"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ImportarCadastro } from "@/modules/cadastros/_shared/importar-cadastro";
import {
  importarObras,
  validarImport,
} from "@/modules/cadastros/obras/actions";
import type { ClienteOpcao } from "@/modules/cadastros/obras/queries";
import { ObrasFormDrawer } from "./obras-form-drawer";

export interface ObrasAcoesProps {
  clientes: ClienteOpcao[];
  podeCriar: boolean;
}

/**
 * Ações do cabeçalho de obras: importar planilha e criar uma nova obra.
 * Só renderiza quando o usuário tem permissão de criar.
 */
export function ObrasAcoes({ clientes, podeCriar }: ObrasAcoesProps) {
  const [aberto, setAberto] = React.useState(false);

  if (!podeCriar) return null;

  return (
    <>
      <ImportarCadastro
        titulo="Importar obras"
        modeloHref="/cadastros/obras/modelo"
        validarAction={validarImport}
        importarAction={importarObras}
      />
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Nova obra
      </Button>

      <ObrasFormDrawer
        key={aberto ? "aberto" : "fechado"}
        aberto={aberto}
        onAbertoChange={setAberto}
        obra={null}
        clientes={clientes}
      />
    </>
  );
}
