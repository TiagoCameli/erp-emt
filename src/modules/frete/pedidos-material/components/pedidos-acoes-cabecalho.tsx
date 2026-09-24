"use client";

import * as React from "react";
import { Download, LoaderCircle, Plus } from "lucide-react";

import { toast } from "@/components/canonicos/toast";
import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";
import { Button } from "@/components/ui/button";
import { baixarBase64 } from "@/lib/download";
import { ImportarPlanilhaFrete } from "@/modules/frete/pagamentos/components/importar-planilha-frete";
import {
  gerarPlanilhaPedidosMaterial,
  importarPedidos,
  validarImportPedidos,
} from "@/modules/frete/pedidos-material/actions";
import { mensagemImportados } from "@/modules/frete/pedidos-material/importacao";
import type { FornecedorOpcao, InsumoOpcao } from "@/modules/frete/pedidos-material/queries";
import { PedidoFormDrawer } from "./pedido-form-drawer";
import { FILTRO_PEDIDOS } from "./pedidos-tabela";

export interface PedidosAcoesCabecalhoProps {
  podeCriar: boolean;
  fornecedores: FornecedorOpcao[];
  insumos: InsumoOpcao[];
}

/**
 * Ações do cabeçalho: "Exportar Excel" (com o filtro da lista, como a origem), "Importar
 * planilha" e "Novo pedido" (os dois com `frete.pedidos-material/criar`).
 */
export function PedidosAcoesCabecalho({ podeCriar, fornecedores, insumos }: PedidosAcoesCabecalhoProps) {
  const [aberto, setAberto] = React.useState(false);
  const [exportando, setExportando] = React.useState(false);
  const [fornecedorId] = useFiltroSessao(FILTRO_PEDIDOS.fornecedor, "");
  const [materialId] = useFiltroSessao(FILTRO_PEDIDOS.material, "");
  const [de] = useFiltroSessao(FILTRO_PEDIDOS.de, "");
  const [ate] = useFiltroSessao(FILTRO_PEDIDOS.ate, "");

  async function exportar() {
    setExportando(true);
    try {
      const resultado = await gerarPlanilhaPedidosMaterial({ fornecedorId, materialId, de, ate });
      if ("erro" in resultado) {
        toast.error(resultado.erro);
        return;
      }
      baixarBase64(resultado.base64, resultado.nomeArquivo);
    } catch {
      toast.error("Não foi possível gerar a planilha. Tente novamente");
    } finally {
      setExportando(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => void exportar()} disabled={exportando}>
        {exportando ? <LoaderCircle className="animate-spin" /> : <Download />}
        Exportar Excel
      </Button>
      {podeCriar ? (
        <>
          <ImportarPlanilhaFrete
            titulo="Importar pedidos de material"
            modeloHref="/frete/pedidos-material/modelo"
            validarAction={validarImportPedidos}
            importarAction={importarPedidos}
            mensagemSucesso={mensagemImportados}
          />
          <Button type="button" size="sm" onClick={() => setAberto(true)}>
            <Plus />
            Novo pedido
          </Button>
          <PedidoFormDrawer
            aberto={aberto}
            onAbertoChange={setAberto}
            pedido={null}
            fornecedores={fornecedores}
            insumos={insumos}
          />
        </>
      ) : null}
    </>
  );
}
