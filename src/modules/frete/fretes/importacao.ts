import { CASAS_TAXA } from "@/lib/casas-decimais";
import { dataIsoValida, REGEX_PLACA, type FreteInput } from "@/modules/frete/fretes/schemas";
import type { Opcao } from "@/modules/frete/fretes/tipos";
import { textoParaNumero } from "@/modules/manutencao/servicos/numero";

/**
 * Importar fretes do Excel (só criação, só frete de material), igual ao FreteForm da
 * origem (FreteForm.tsx:56-59, 210-308): mesmo modelo, mesmas colunas, mesmas mensagens,
 * o mesmo casamento por nome (minúsculo, exato), valor do material zero e uma gravação
 * por linha (pela `fn_frete_salvar`).
 *
 * O que muda por necessidade: origem, destino, transportadora e obra viram cadastro no
 * ERP, então também casam por nome, e sem casar a linha fica com erro (na origem eram
 * texto livre e a obra ficava vazia; o banco agora exige a obra no frete de material).
 * E os números seguem o padrão do ERP ("1.234,56" é 1234,56; a origem trocava só a
 * primeira vírgula e lia 1,234).
 *
 * Módulo puro: a action e o teste importam direto.
 */

export interface LinhaPlanilhaFrete {
  dataSaida: unknown;
  dataChegada: unknown;
  origem: unknown;
  destino: unknown;
  transportadora: unknown;
  motorista: unknown;
  material: unknown;
  peso: unknown;
  km: unknown;
  valorTkm: unknown;
  obra: unknown;
  nf: unknown;
  placa: unknown;
  observacoes: unknown;
}

/** Colunas do modelo `template_fretes.xlsx` da origem, na mesma ordem. */
export const COLUNAS_PLANILHA_FRETE: { chave: keyof LinhaPlanilhaFrete; rotulo: string; exemplo: string }[] = [
  { chave: "dataSaida", rotulo: "Data Saída", exemplo: "2026-09-20" },
  { chave: "dataChegada", rotulo: "Data Chegada", exemplo: "2026-09-21" },
  { chave: "origem", rotulo: "Origem", exemplo: "Pedreira Exemplo" },
  { chave: "destino", rotulo: "Destino", exemplo: "Canteiro BR-364" },
  { chave: "transportadora", rotulo: "Transportadora", exemplo: "Transportadora Exemplo" },
  { chave: "motorista", rotulo: "Motorista", exemplo: "João Silva" },
  { chave: "material", rotulo: "Material", exemplo: "Brita 1" },
  { chave: "peso", rotulo: "Peso (t)", exemplo: "32,5" },
  { chave: "km", rotulo: "KM", exemplo: "120" },
  { chave: "valorTkm", rotulo: "R$/TKM", exemplo: "0,37" },
  { chave: "obra", rotulo: "Obra", exemplo: "BR-364 Lote 09" },
  { chave: "nf", rotulo: "NF", exemplo: "12345" },
  { chave: "placa", rotulo: "Placa Carreta", exemplo: "ABC-1D23" },
  { chave: "observacoes", rotulo: "Observações", exemplo: "" },
];

function textoCelula(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  return String(valor).trim();
}

/** Data de 1899-12-30 + n dias: o serial do Excel. */
function serialExcel(n: number): string {
  const base = Date.UTC(1899, 11, 30);
  return new Date(base + Math.round(n) * 86_400_000).toISOString().slice(0, 10);
}

function doisDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * O `parseData` da origem: serial do Excel, `YYYY-M-D`, `D/M/YYYY`. O que não for data
 * válida volta nulo (na origem voltava a string crua e o banco recusava depois).
 */
export function lerDataPlanilha(valor: unknown): string | null {
  if (valor === null || valor === undefined || valor === "") return null;
  if (valor instanceof Date) {
    const iso = valor.toISOString().slice(0, 10);
    return dataIsoValida(iso) ? iso : null;
  }
  if (typeof valor === "number") return serialExcel(valor);
  const texto = String(valor).trim();
  let iso: string | null = null;
  const ymd = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(texto);
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(texto);
  if (ymd) iso = `${ymd[1]}-${doisDigitos(Number(ymd[2]))}-${doisDigitos(Number(ymd[3]))}`;
  else if (dmy) iso = `${dmy[3]}-${doisDigitos(Number(dmy[2]))}-${doisDigitos(Number(dmy[1]))}`;
  else if (/^\d+(\.\d+)?$/.test(texto)) iso = serialExcel(Number(texto));
  return iso && dataIsoValida(iso) ? iso : null;
}

/** Número da célula: número do Excel direto; texto no padrão do ERP (4 casas). */
export function lerNumeroPlanilha(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  return textoParaNumero(String(valor), CASAS_TAXA);
}

/** Índice por nome minúsculo, com trim (o `toLowerCase()` exato da origem). */
export function indicePorNome(opcoes: readonly Opcao[]): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const o of opcoes) {
    const chave = o.nome.trim().toLowerCase();
    if (!mapa.has(chave)) mapa.set(chave, o.id);
  }
  return mapa;
}

export interface CadastrosImportacao {
  localidades: Map<string, string>;
  transportadoras: Map<string, string>;
  insumos: Map<string, string>;
  obras: Map<string, string>;
}

export type LinhaValidada = { erros: string[]; frete: FreteInput | null };

/**
 * Valida uma linha, com as mensagens da origem ("Falta data", `Material "x" nao
 * encontrado`...), e monta o frete de material com valor do material zero.
 */
export function validarLinhaFrete(linha: Partial<LinhaPlanilhaFrete>, cadastros: CadastrosImportacao): LinhaValidada {
  const erros: string[] = [];
  const dataBruta = textoCelula(linha.dataSaida);
  const data = lerDataPlanilha(linha.dataSaida);
  if (!dataBruta) erros.push("Falta data");
  else if (!data) erros.push(`Data "${dataBruta}" inválida`);

  const chegadaBruta = textoCelula(linha.dataChegada);
  const dataChegada = chegadaBruta ? lerDataPlanilha(linha.dataChegada) : null;
  if (chegadaBruta && !dataChegada) erros.push(`Data de chegada "${chegadaBruta}" inválida`);

  const casar = (valor: unknown, mapa: Map<string, string>, falta: string, rotulo: string, genero: "o" | "a" = "o"): string | null => {
    const nome = textoCelula(valor);
    if (!nome) {
      erros.push(falta);
      return null;
    }
    const id = mapa.get(nome.toLowerCase()) ?? null;
    if (!id) erros.push(`${rotulo} "${nome}" nao encontrad${genero}`);
    return id;
  };

  const origem = casar(linha.origem, cadastros.localidades, "Falta origem", "Origem", "a");
  const destino = casar(linha.destino, cadastros.localidades, "Falta destino", "Destino");
  const transportadora = casar(linha.transportadora, cadastros.transportadoras, "Falta transportadora", "Transportadora");
  const motorista = textoCelula(linha.motorista);
  if (!motorista) erros.push("Falta motorista");
  else if (motorista.length < 2) erros.push("Nome do motorista");
  const insumo = casar(linha.material, cadastros.insumos, "Falta material", "Material");

  const numero = (valor: unknown, falta: string, invalido: string): number | null => {
    if (textoCelula(valor) === "") {
      erros.push(falta);
      return null;
    }
    const n = lerNumeroPlanilha(valor);
    if (n === null || !(n > 0)) {
      erros.push(invalido);
      return null;
    }
    return n;
  };
  const peso = numero(linha.peso, "Falta peso", "Peso deve ser > 0");
  const km = numero(linha.km, "Falta KM", "KM deve ser > 0");
  const valorTkm = numero(linha.valorTkm, "Falta R$/TKM", "R$/TKM deve ser > 0");

  const obra = casar(linha.obra, cadastros.obras, "Falta obra", "Obra", "a");

  const placa = textoCelula(linha.placa).toUpperCase();
  if (placa && !REGEX_PLACA.test(placa)) erros.push("Placa inválida (ex: ABC-1D34)");
  const observacoes = textoCelula(linha.observacoes);
  if (observacoes.length > 500) erros.push("Máximo 500 caracteres");
  const nf = textoCelula(linha.nf);

  if (erros.length > 0 || !data || !origem || !destino || !transportadora || !insumo || !obra) {
    return { erros, frete: null };
  }
  return {
    erros,
    frete: {
      tipo: "material",
      data,
      dataChegada,
      centroCustoId: obra,
      origemLocalidadeId: origem,
      destinoLocalidadeId: destino,
      transportadoraId: transportadora,
      motorista,
      placaCarreta: placa || null,
      insumoId: insumo,
      pesoToneladas: peso as number,
      kmRodados: km as number,
      valorTkm: valorTkm as number,
      valorUnitarioMaterial: 0,
      notaFiscal: nf || null,
      notaFiscal2: null,
      observacoes: observacoes || null,
    },
  };
}
