"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ImportarCadastro } from "@/modules/cadastros/_shared/importar-cadastro";
import {
  importarEquipamentos,
  validarImport,
} from "@/modules/cadastros/equipamentos/actions";
import {
  BotaoEtiquetasQr,
  type EquipamentoParaEtiqueta,
} from "./botao-etiquetas-qr";
import { EquipamentosFormDrawer } from "./equipamentos-form-drawer";

export interface EquipamentosAcoesCabecalhoProps {
  podeCriar: boolean;
  /** Equipamentos ativos, para a escolha das etiquetas QR. */
  equipamentosAtivos: EquipamentoParaEtiqueta[];
}

/**
 * Ações do cabeçalho de equipamentos: etiquetas QR (quem vê a página), e
 * importar planilha e criar um novo equipamento (só com permissão de criar).
 */
export function EquipamentosAcoesCabecalho({
  podeCriar,
  equipamentosAtivos,
}: EquipamentosAcoesCabecalhoProps) {
  const [aberto, setAberto] = React.useState(false);

  const etiquetas = <BotaoEtiquetasQr equipamentosAtivos={equipamentosAtivos} />;

  if (!podeCriar) return etiquetas;

  return (
    <>
      {etiquetas}
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
