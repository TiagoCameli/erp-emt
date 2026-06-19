"use client";

import { FiltroSelect, useFiltrosUrl } from "@/components/canonicos";
import { Label } from "@/components/ui/label";
import type { FornecedorOpcao } from "../queries";

interface SeletorFornecedorProps {
  fornecedores: FornecedorOpcao[];
  /** Id do fornecedor selecionado, ou "" para todos. */
  valor: string;
}

/**
 * Seletor de fornecedor do extrato. Escreve o id no parâmetro `fornecedor` da
 * URL ("todos" remove o parâmetro), re-renderizando o Server Component.
 */
export function SeletorFornecedor({
  fornecedores,
  valor,
}: SeletorFornecedorProps) {
  const { set } = useFiltrosUrl();

  return (
    <div className="flex items-center gap-2">
      <Label className="text-detalhe text-muted-foreground">Fornecedor</Label>
      <FiltroSelect
        valor={valor}
        onValorChange={(novo) => set("fornecedor", novo === "" ? null : novo)}
        opcoes={fornecedores.map((fornecedor) => ({
          valor: fornecedor.id,
          rotulo: fornecedor.nome,
        }))}
        placeholder="Todos os fornecedores"
        todosRotulo="Todos os fornecedores"
      />
    </div>
  );
}
