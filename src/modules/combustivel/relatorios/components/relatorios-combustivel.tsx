"use client";

import * as React from "react";
import { FileSpreadsheet, LoaderCircle } from "lucide-react";

import { Combobox, FiltroMes, FiltroPeriodo, SecaoDetalhe } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { baixarBase64 } from "@/lib/download";
import { gerarPlanilhaCombustivel } from "@/modules/combustivel/relatorios/actions";
import type { TipoRelatorio } from "@/modules/combustivel/relatorios/consolidar";

export interface Opcao {
  valor: string;
  rotulo: string;
}

export interface RelatoriosCombustivelProps {
  /** Mês anterior (yyyy-MM): o padrão da origem nos relatórios por mês. */
  mesPadrao: string;
  /** Últimos 90 dias: o padrão da origem no Por Equipamento. */
  periodoEquipamento: { de: string; ate: string };
  /** Últimos 30 dias, para o atalho do Por Equipamento. */
  periodo30: { de: string; ate: string };
  obras: Opcao[];
  equipamentos: Opcao[];
}

/**
 * A aba Relatórios da origem: quatro templates, cada um com os parâmetros do seu modal
 * (mês; obra e mês; equipamento e intervalo; mês). Na origem saíam em PDF e Excel; aqui
 * em Excel, com as mesmas abas e números.
 */
export function RelatoriosCombustivel({ mesPadrao, periodoEquipamento, periodo30, obras, equipamentos }: RelatoriosCombustivelProps) {
  const [gerando, setGerando] = React.useState<TipoRelatorio | null>(null);
  const [mesMensal, setMesMensal] = React.useState(mesPadrao);
  const [mesObra, setMesObra] = React.useState(mesPadrao);
  const [obraId, setObraId] = React.useState("");
  const [equipamentoId, setEquipamentoId] = React.useState("");
  const [intervalo, setIntervalo] = React.useState(periodoEquipamento);
  const [mesBruto, setMesBruto] = React.useState(mesPadrao);

  async function exportar(tipo: TipoRelatorio, pedido: Record<string, string>) {
    if (gerando) return;
    setGerando(tipo);
    try {
      const resultado = await gerarPlanilhaCombustivel({ tipo, ...pedido });
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

  const botao = (tipo: TipoRelatorio, desabilitado: boolean, aoClicar: () => void) => (
    <Button type="button" variant="outline" size="sm" disabled={gerando !== null || desabilitado} onClick={aoClicar}>
      {gerando === tipo ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <FileSpreadsheet />}
      Exportar Excel
    </Button>
  );

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <SecaoDetalhe
        card
        titulo="Mensal consolidado"
        acao={botao("mensal", !mesMensal, () => void exportar("mensal", { mes: mesMensal }))}
      >
        <div className="flex flex-col gap-3">
          <p className="text-detalhe text-muted-foreground">
            Visão executiva do mês: indicadores gerais, top 10 equipamentos próprios, top 10 carretas, top 10 obras por
            custo, fornecedores e anomalias. Padrão: mês anterior.
          </p>
          <FiltroMes valor={mesMensal} onValorChange={setMesMensal} rotulo="Mês de referência" />
        </div>
      </SecaoDetalhe>

      <SecaoDetalhe
        card
        titulo="Por obra"
        acao={botao("obra", !obraId || !mesObra, () => void exportar("obra", { obraId, mes: mesObra }))}
      >
        <div className="flex flex-col gap-3">
          <p className="text-detalhe text-muted-foreground">
            As saídas de uma obra no mês (equipamentos e carretas): indicadores, saídas, top equipamentos, fornecedores
            e anomalias. Padrão: mês anterior.
          </p>
          <div className="grid gap-2">
            <Label htmlFor="relatorio-obra">Obra</Label>
            <Combobox
              id="relatorio-obra"
              valor={obraId}
              onValorChange={setObraId}
              opcoes={obras}
              placeholder="Selecionar obra"
              buscaPlaceholder="Buscar obra"
              vazioTexto="Nenhuma obra com saída"
            />
          </div>
          <FiltroMes valor={mesObra} onValorChange={setMesObra} rotulo="Mês de referência" />
        </div>
      </SecaoDetalhe>

      <SecaoDetalhe
        card
        titulo="Por equipamento"
        acao={botao("equipamento", !equipamentoId, () =>
          void exportar("equipamento", { equipamentoId, de: intervalo.de, ate: intervalo.ate }),
        )}
      >
        <div className="flex flex-col gap-3">
          <p className="text-detalhe text-muted-foreground">
            O histórico de um equipamento próprio no intervalo: indicadores, saídas, obras frequentes, fornecedores e
            anomalias. Padrão: últimos 90 dias.
          </p>
          <div className="grid gap-2">
            <Label htmlFor="relatorio-equipamento">Equipamento</Label>
            <Combobox
              id="relatorio-equipamento"
              valor={equipamentoId}
              onValorChange={setEquipamentoId}
              opcoes={equipamentos}
              placeholder="Selecionar equipamento"
              buscaPlaceholder="Buscar por código ou nome"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <FiltroPeriodo
              de={intervalo.de}
              ate={intervalo.ate}
              rotulo="Data da saída"
              onPeriodoChange={(de, ate) => {
                if (de && ate) setIntervalo({ de, ate });
              }}
            />
            <Button type="button" variant="ghost" size="sm" onClick={() => setIntervalo(periodo30)}>
              Últimos 30 dias
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setIntervalo(periodoEquipamento)}>
              Últimos 90 dias
            </Button>
          </div>
        </div>
      </SecaoDetalhe>

      <SecaoDetalhe
        card
        titulo="Raw export"
        acao={botao("bruto", !mesBruto, () => void exportar("bruto", { mes: mesBruto }))}
      >
        <div className="flex flex-col gap-3">
          <p className="text-detalhe text-muted-foreground">
            Todas as saídas, entradas, transferências e cadastros do mês, com os nomes no lugar dos códigos e sem
            agregação. Cinco abas.
          </p>
          <FiltroMes valor={mesBruto} onValorChange={setMesBruto} rotulo="Mês de referência" />
        </div>
      </SecaoDetalhe>
    </div>
  );
}
