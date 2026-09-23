"use client";

import * as React from "react";
import { FileSpreadsheet, LoaderCircle } from "lucide-react";

import { BarraFiltrosConfiguravel, FiltroPeriodo, SecaoDetalhe, useFiltrosUrl } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { baixarBase64 } from "@/lib/download";
import { gerarPlanilhaCombustivel } from "@/modules/combustivel/relatorios/actions";
import type { TipoRelatorio } from "@/modules/combustivel/relatorios/consolidar";

const RELATORIOS: { tipo: TipoRelatorio; titulo: string; descricao: string }[] = [
  {
    tipo: "mensal",
    titulo: "Consumo mensal consolidado",
    descricao: "Litros e valor por mês, combustível e tipo de consumidor. Filtre no Excel para ver um corte só.",
  },
  {
    tipo: "obra",
    titulo: "Consumo por obra",
    descricao:
      "Litros e custo por centro de custo, pela alocação de cada abastecimento. O custo é só de equipamento próprio.",
  },
  {
    tipo: "equipamento",
    titulo: "Consumo por equipamento",
    descricao: "Litros, valor, média por litro e a leitura de horímetro ou km. Carretas saem numa aba própria, por placa.",
  },
  {
    tipo: "bruto",
    titulo: "Abastecimentos do período",
    descricao: "Um abastecimento por linha, com todas as colunas, para conferir ou cruzar com outra planilha.",
  },
];

export interface RelatoriosCombustivelProps {
  /** Período (yyyy-MM-dd) já resolvido pela página, com o padrão aplicado. */
  de: string;
  ate: string;
}

/**
 * Os quatro relatórios do Combustível em Excel, todos sobre o mesmo período.
 * O período vive na URL; o arquivo sai com o período que está na tela.
 */
export function RelatoriosCombustivel({ de, ate }: RelatoriosCombustivelProps) {
  const { setMuitos } = useFiltrosUrl();
  const [gerando, setGerando] = React.useState<TipoRelatorio | null>(null);

  async function aoExportar(tipo: TipoRelatorio) {
    if (gerando) return;
    setGerando(tipo);
    try {
      const resultado = await gerarPlanilhaCombustivel({ tipo, de, ate });
      if ("erro" in resultado) {
        toast.error(resultado.erro);
        return;
      }
      baixarBase64(resultado.base64, resultado.nomeArquivo);
    } catch {
      toast.error("Não foi possível gerar a planilha. Recarregue a página e tente de novo");
    } finally {
      setGerando(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <BarraFiltrosConfiguravel
        idTabela="combustivel.relatorios.filtros"
        onLimparFiltros={() => setMuitos({ de: null, ate: null })}
        filtros={[
          {
            id: "periodo",
            rotulo: "Período",
            fixo: true,
            temValor: true,
            onLimpar: () => setMuitos({ de: null, ate: null }),
            elemento: (
              <FiltroPeriodo
                de={de}
                ate={ate}
                rotulo="Data do abastecimento"
                onPeriodoChange={(novoDe, novoAte) =>
                  setMuitos({ de: novoDe === "" ? null : novoDe, ate: novoAte === "" ? null : novoAte })
                }
              />
            ),
          },
        ]}
      />

      <div className="grid gap-4 md:grid-cols-2">
        {RELATORIOS.map((relatorio) => (
          <SecaoDetalhe
            key={relatorio.tipo}
            card
            titulo={relatorio.titulo}
            acao={
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={gerando !== null}
                onClick={() => {
                  void aoExportar(relatorio.tipo);
                }}
              >
                {gerando === relatorio.tipo ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden />
                ) : (
                  <FileSpreadsheet />
                )}
                Exportar Excel
              </Button>
            }
          >
            <p className="text-detalhe text-muted-foreground">{relatorio.descricao}</p>
          </SecaoDetalhe>
        ))}
      </div>
    </div>
  );
}
