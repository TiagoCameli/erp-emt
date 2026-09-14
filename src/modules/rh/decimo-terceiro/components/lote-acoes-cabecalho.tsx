"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

import { GerarLoteDrawer } from "./gerar-lote-drawer";

export interface LoteAcoesCabecalhoProps {
  anoSugerido: number;
  quantidadeDeAtivos: number;
  temProvisaoDe13: boolean;
}

/**
 * Botão "Gerar 13º" + drawer, para a ação do cabeçalho da seção de 13º.
 *
 * A tabela monta o próprio drawer no estado vazio (mesmo padrão do módulo de
 * férias): dois pontos de entrada, cada um com estado próprio, e nenhum botão
 * solto no corpo da página.
 */
export function LoteAcoesCabecalho({
  anoSugerido,
  quantidadeDeAtivos,
  temProvisaoDe13,
}: LoteAcoesCabecalhoProps) {
  const router = useRouter();
  const [aberto, setAberto] = React.useState(false);

  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Gerar 13º
      </Button>
      <GerarLoteDrawer
        aberto={aberto}
        onAbertoChange={setAberto}
        anoSugerido={anoSugerido}
        quantidadeDeAtivos={quantidadeDeAtivos}
        temProvisaoDe13={temProvisaoDe13}
        onGerado={(id) =>
          router.push(`/rh/decimo-terceiro-e-ferias/13o/${id}`)
        }
      />
    </>
  );
}
