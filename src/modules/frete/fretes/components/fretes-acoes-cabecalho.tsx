"use client";

import * as React from "react";
import { FileSpreadsheet, LoaderCircle, Plus } from "lucide-react";

import { useFiltrosUrl } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { baixarBase64 } from "@/lib/download";
import { ImportarCadastro } from "@/modules/cadastros/_shared/importar-cadastro";
import { gerarPlanilhaFretes } from "@/modules/frete/fretes/actions";
import { importarFretes, validarImportFretes } from "@/modules/frete/fretes/importacao-actions";
import type { TipoFrete } from "@/modules/frete/fretes/schemas";
import type { OpcoesFrete } from "@/modules/frete/fretes/tipos";
import { FreteFormDrawer } from "./frete-form-drawer";

export interface FretesAcoesCabecalhoProps {
  podeCriar: boolean;
  opcoes: OpcoesFrete;
}

/**
 * Ações do cabeçalho da aba (as da origem): "Exportar Excel" (os filtros da lista),
 * "Importar planilha" (frete de material), "Nova transferência" e "Novo frete". Criar e
 * importar só com `frete.fretes/criar`.
 */
export function FretesAcoesCabecalho({ podeCriar, opcoes }: FretesAcoesCabecalhoProps) {
  const { query } = useFiltrosUrl();
  const [tipo, setTipo] = React.useState<TipoFrete>("material");
  const [aberto, setAberto] = React.useState(false);
  const [exportando, setExportando] = React.useState(false);

  async function exportar() {
    if (exportando) return;
    setExportando(true);
    try {
      const resultado = await gerarPlanilhaFretes(Object.fromEntries(new URLSearchParams(query)));
      if ("erro" in resultado) {
        toast.error(resultado.erro);
        return;
      }
      baixarBase64(resultado.base64, resultado.nomeArquivo);
    } catch {
      toast.error("Não foi possível gerar a planilha. Recarregue a página e tente de novo");
    } finally {
      setExportando(false);
    }
  }

  function abrir(novo: TipoFrete) {
    setTipo(novo);
    setAberto(true);
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => void exportar()} disabled={exportando}>
        {exportando ? <LoaderCircle className="animate-spin" aria-hidden /> : <FileSpreadsheet />}
        Exportar Excel
      </Button>
      {podeCriar ? (
        <>
          <ImportarCadastro
            titulo="Importar fretes"
            modeloHref="/frete/fretes/modelo"
            validarAction={validarImportFretes}
            importarAction={importarFretes}
          />
          <Button type="button" variant="outline" size="sm" onClick={() => abrir("transferencia")}>
            <Plus />
            Nova transferência
          </Button>
          <Button type="button" size="sm" onClick={() => abrir("material")}>
            <Plus />
            Novo frete
          </Button>
          <FreteFormDrawer
            key={tipo}
            aberto={aberto}
            onAbertoChange={setAberto}
            frete={null}
            tipo={tipo}
            opcoes={opcoes}
          />
        </>
      ) : null}
    </>
  );
}
