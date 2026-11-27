import ExcelJS from "exceljs";

import type { RelatorioConsumo, LinhaConsumo } from "@/modules/combustivel/consumo/servico";
import { escreverAba, type Coluna } from "@/modules/combustivel/relatorios/planilhas";
import type { MediaGrupo } from "@/modules/combustivel/consumo/calculo";

/**
 * O Consumo em Excel, com a moldura de marca de todo documento do ERP: a aba dos veículos
 * (a mesma tabela da tela) e a das médias por tipo. Módulo de servidor (exceljs).
 */

const pct = (v: number | null) => (v === null ? "" : `${v.toFixed(0)}% acima da média`);

const COLUNAS_VEICULOS: readonly Coluna<LinhaConsumo>[] = [
  { cabecalho: "Veículo / máquina", largura: 40, tipo: "texto", celula: (l) => l.nome },
  { cabecalho: "Placa", largura: 12, tipo: "texto", celula: (l) => l.placa || "" },
  { cabecalho: "Tipo", largura: 22, tipo: "texto", celula: (l) => l.tipo },
  { cabecalho: "Obra", largura: 28, tipo: "texto", celula: (l) => l.obra ?? "" },
  { cabecalho: "Odômetro inicial", largura: 15, tipo: "leitura", celula: (l) => l.leituraInicialKm },
  { cabecalho: "Odômetro final", largura: 15, tipo: "leitura", celula: (l) => l.leituraFinalKm },
  { cabecalho: "Horímetro inicial", largura: 15, tipo: "leitura", celula: (l) => l.leituraInicialH },
  { cabecalho: "Horímetro final", largura: 15, tipo: "leitura", celula: (l) => l.leituraFinalH },
  { cabecalho: "Km rodados", largura: 13, tipo: "leitura", celula: (l) => l.km, somar: true },
  { cabecalho: "Horas", largura: 11, tipo: "leitura", celula: (l) => l.h, somar: true },
  { cabecalho: "Litros", largura: 13, tipo: "litros", celula: (l) => l.litros, somar: true },
  { cabecalho: "L/km", largura: 10, tipo: "decimal", celula: (l) => l.lPorKm },
  { cabecalho: "km/L", largura: 10, tipo: "decimal", celula: (l) => l.kmPorL },
  { cabecalho: "L/h", largura: 10, tipo: "decimal", celula: (l) => l.lPorH },
  { cabecalho: "R$/km", largura: 11, tipo: "preco", celula: (l) => l.rPorKm },
  { cabecalho: "R$/h", largura: 11, tipo: "preco", celula: (l) => l.rPorH },
  { cabecalho: "Abastecimentos", largura: 14, tipo: "inteiro", celula: (l) => l.abastecimentos, somar: true },
  { cabecalho: "Sem leitura", largura: 12, tipo: "inteiro", celula: (l) => l.semLeitura, somar: true },
  {
    cabecalho: "Destaque",
    largura: 34,
    tipo: "texto",
    celula: (l) =>
      l.destaque
        ? [l.destaque.kmPercentual !== null ? `L/km ${pct(l.destaque.kmPercentual)}` : "", l.destaque.hPercentual !== null ? `L/h ${pct(l.destaque.hPercentual)}` : ""]
            .filter(Boolean)
            .join("; ")
        : "",
  },
];

const COLUNAS_MEDIAS: readonly Coluna<MediaGrupo>[] = [
  { cabecalho: "Grupo", largura: 28, tipo: "texto", celula: (m) => m.grupo },
  { cabecalho: "Veículos", largura: 10, tipo: "inteiro", celula: (m) => m.veiculos },
  { cabecalho: "Km rodados", largura: 13, tipo: "leitura", celula: (m) => m.km },
  { cabecalho: "Horas", largura: 11, tipo: "leitura", celula: (m) => m.h },
  { cabecalho: "L/km", largura: 10, tipo: "decimal", celula: (m) => m.lPorKm },
  { cabecalho: "km/L", largura: 10, tipo: "decimal", celula: (m) => m.kmPorL },
  { cabecalho: "L/h", largura: 10, tipo: "decimal", celula: (m) => m.lPorH },
  { cabecalho: "R$/km", largura: 11, tipo: "preco", celula: (m) => m.rPorKm },
  { cabecalho: "R$/h", largura: 11, tipo: "preco", celula: (m) => m.rPorH },
];

export async function planilhaConsumo(relatorio: RelatorioConsumo, periodo: string): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  escreverAba(workbook, {
    nome: "Veículos",
    titulo: `Consumo de combustível por veículo · ${periodo}`,
    colunas: COLUNAS_VEICULOS,
    linhas: relatorio.linhas,
  });
  escreverAba(workbook, {
    nome: "Médias por tipo",
    titulo: `Consumo médio por tipo e da frota · ${periodo}`,
    colunas: COLUNAS_MEDIAS,
    linhas: relatorio.medias,
  });
  return workbook;
}

