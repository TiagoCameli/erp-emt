import {
  casarPorNome,
  dataDaCelula,
  numeroDaCelula,
  textoDaCelula,
  type CadastroCasavel,
  type Celula,
} from "@/modules/frete/pagamentos/importacao";
import {
  CASAS_QUANTIDADE_PEDIDO,
  CASAS_VALOR_UNITARIO_PEDIDO,
  type DadosPedido,
  type ItemPedido,
} from "@/modules/frete/pedidos-material/regras";

/**
 * Importação de pedidos de material, igual à origem (PedidoMaterialForm, "Importar do
 * Excel", template_pedidos_material.xlsx, aba "Pedidos"): uma linha por item; fornecedor e
 * material casados pelo nome; linhas da mesma data e do mesmo fornecedor viram UM pedido,
 * com a observação da primeira linha do grupo.
 *
 * O que muda por necessidade: quantidade e valor unitário precisam ser maiores que zero
 * (o banco exige; a origem só conferia se estavam preenchidos), o número lê o formato
 * brasileiro, e o nome casa sem acento e sem caixa, com a fantasia ou a razão social do
 * fornecedor (a origem casava o "nome" exato em minúsculas). Módulo puro.
 */

export const COLUNAS_PEDIDOS = [
  { chave: "data", rotulo: "Data", exemplo: "2026-01-15" },
  { chave: "fornecedor", rotulo: "Fornecedor", exemplo: "Fornecedor ABC" },
  { chave: "material", rotulo: "Material", exemplo: "Brita" },
  { chave: "quantidade", rotulo: "Quantidade", exemplo: "100" },
  { chave: "valorUnitario", rotulo: "Valor Unitário", exemplo: "25,00" },
  { chave: "observacoes", rotulo: "Observações", exemplo: "" },
] as const;

export type ChaveColunaPedido = (typeof COLUNAS_PEDIDOS)[number]["chave"];
export type LinhaCruaPedido = Partial<Record<ChaveColunaPedido, Celula>>;

export interface LinhaPedidoPronta {
  data: string;
  fornecedorId: string;
  observacoes: string;
  item: ItemPedido;
}

export type LinhaPedidoLida = { dados: LinhaPedidoPronta; erros: [] } | { dados: null; erros: string[] };

export interface CadastrosPedido {
  fornecedores: readonly CadastroCasavel[];
  insumos: readonly CadastroCasavel[];
}

function casar(nome: string, cadastro: readonly CadastroCasavel[], rotulo: "Fornecedor" | "Material", erros: string[]): string {
  const casado = casarPorNome(nome, cadastro);
  if ("id" in casado) return casado.id;
  erros.push(
    casado.erro === "ambiguo"
      ? `${rotulo} "${nome}" tem mais de um cadastro com esse nome`
      : `${rotulo} "${nome}" não encontrado`,
  );
  return "";
}

/** Valida uma linha com as mensagens da origem ("Falta data", `Fornecedor "x" não encontrado`...). */
export function lerLinhaPedido(linha: LinhaCruaPedido, cadastros: CadastrosPedido): LinhaPedidoLida {
  const erros: string[] = [];

  const data = dataDaCelula(linha.data);
  if (textoDaCelula(linha.data) === "") erros.push("Falta data");
  else if (!data) erros.push(`Data "${textoDaCelula(linha.data)}" inválida`);

  const nomeFornecedor = textoDaCelula(linha.fornecedor);
  const fornecedorId = nomeFornecedor ? casar(nomeFornecedor, cadastros.fornecedores, "Fornecedor", erros) : "";
  if (!nomeFornecedor) erros.push("Falta fornecedor");

  const nomeMaterial = textoDaCelula(linha.material);
  const insumoId = nomeMaterial ? casar(nomeMaterial, cadastros.insumos, "Material", erros) : "";
  if (!nomeMaterial) erros.push("Falta material");

  const quantidade = numeroDaCelula(linha.quantidade, CASAS_QUANTIDADE_PEDIDO);
  if ("erro" in quantidade)
    erros.push(quantidade.erro === "vazio" ? "Falta quantidade" : `Quantidade inválida (até ${CASAS_QUANTIDADE_PEDIDO} casas)`);
  else if (!(quantidade.numero > 0)) erros.push("Quantidade deve ser > 0");

  const valor = numeroDaCelula(linha.valorUnitario, CASAS_VALOR_UNITARIO_PEDIDO);
  if ("erro" in valor)
    erros.push(valor.erro === "vazio" ? "Falta valor unitário" : `Valor unitário inválido (até ${CASAS_VALOR_UNITARIO_PEDIDO} casas)`);
  else if (!(valor.numero > 0)) erros.push("Valor unitário deve ser > 0");

  const observacoes = textoDaCelula(linha.observacoes);
  if (observacoes.length > 500) erros.push("Observações com mais de 500 caracteres");

  if (erros.length > 0 || !data || "erro" in quantidade || "erro" in valor) return { dados: null, erros };
  return {
    erros: [],
    dados: {
      data,
      fornecedorId,
      observacoes,
      item: { insumoId, quantidade: quantidade.numero, valorUnitario: valor.numero },
    },
  };
}

export interface PedidoAgrupado {
  /** Linhas da planilha que formam o pedido. */
  linhas: number[];
  dados: DadosPedido;
}

/** Agrupa por `data|fornecedor`, na ordem em que o grupo aparece; observação da 1ª linha. */
export function agruparPedidos(linhas: readonly { linha: number; dados: LinhaPedidoPronta }[]): PedidoAgrupado[] {
  const grupos = new Map<string, PedidoAgrupado>();
  for (const { linha, dados } of linhas) {
    const chave = `${dados.data}|${dados.fornecedorId}`;
    let grupo = grupos.get(chave);
    if (!grupo) {
      grupo = {
        linhas: [],
        dados: { data: dados.data, fornecedorId: dados.fornecedorId, observacoes: dados.observacoes || null, itens: [] },
      };
      grupos.set(chave, grupo);
    }
    grupo.linhas.push(linha);
    grupo.dados.itens.push(dados.item);
  }
  return [...grupos.values()];
}

/** O toast da origem: "N pedidos importados com sucesso (M itens)". */
export function mensagemImportados(pedidos: number, itens: number): string {
  return `${pedidos} ${pedidos === 1 ? "pedido importado" : "pedidos importados"} com sucesso (${itens} ${
    itens === 1 ? "item" : "itens"
  })`;
}
