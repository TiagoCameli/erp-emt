/**
 * Saldo na pedreira (pedido menos transportado) e as agregações que o painel e as
 * anomalias leem. Módulo puro, sem banco: UMA implementação para os três pontos em que
 * a origem (Gestão Obras) repetia a mesma conta (FreteDashboard.tsx:654-769 e
 * :1363-1410, anomalias/detect.ts:47-73 e :152-188).
 *
 * Igual à origem (Tiago: "exatamente igual, só mude o que for necessário"):
 * - Só frete de material conta (`apenasFretesDePedreira`): a transferência move material
 *   que a EMT já tem, não tem pedido e não desconta saldo.
 * - Chave = pedreira (fornecedor) + material (insumo).
 * - Pedido: Σ quantidade e Σ quantidade × valor unitário, e a lista de preços distintos
 *   (dois preços a menos de R$ 0,005 são o mesmo preço).
 * - Transportado: Σ peso, Σ valor do frete e Σ valor de material gravado no frete.
 * - Saldo em toneladas = pedido − transportado, zerado abaixo de 0,001 t; saldo em R$ =
 *   Σ valor dos pedidos − Σ valor de material dos fretes, zerado abaixo de R$ 0,01. O saldo
 *   em R$ NÃO é saldo × preço (é como a origem calcula; ver docs/FASE4-FRETE.md).
 *
 * O que muda por necessidade: a origem casava o texto da origem do frete com o nome do
 * fornecedor ("exato, depois contém nos dois sentidos"). No ERP a origem do frete é uma
 * localidade e a localidade grava a pedreira (`localidades.fornecedor_id`). Quem monta a
 * entrada resolve `pedreiraId` por esse vínculo; `null` é o caso em que a origem não
 * casava com fornecedor nenhum (o frete fica fora do saldo, como lá, e vira F5).
 */

export type TipoFrete = "material" | "transferencia";

/** Leitura tolerante, como utils/freteTipo.ts: ausente ou desconhecido é material. */
export function tipoDoFrete(frete: { tipo?: string | null } | null | undefined): TipoFrete {
  return frete?.tipo === "transferencia" ? "transferencia" : "material";
}

export function ehTransferencia(frete: { tipo?: string | null } | null | undefined): boolean {
  return tipoDoFrete(frete) === "transferencia";
}

export function ehFreteDePedreira(frete: { tipo?: string | null } | null | undefined): boolean {
  return !ehTransferencia(frete);
}

export function apenasFretesDePedreira<T extends { tipo?: string | null }>(fretes: readonly T[]): T[] {
  return fretes.filter(ehFreteDePedreira);
}

/** Tolerâncias da origem (FreteDashboard.tsx:1399-1402). */
export const TOLERANCIA_SALDO_TONELADAS = 0.001;
export const TOLERANCIA_SALDO_REAIS = 0.01;
/** Dois preços de pedido a menos disto são o mesmo preço (detect.ts:66). */
export const TOLERANCIA_PRECO_IGUAL = 0.005;

/** O que o saldo lê de um frete. */
export interface FreteDaPedreira {
  tipo: string;
  /** Fornecedor da localidade de origem; null = a origem não é pedreira cadastrada. */
  pedreiraId: string | null;
  insumoId: string;
  peso: number;
  valorTotal: number;
  valorMaterial: number;
}

export interface ItemDoPedido {
  insumoId: string;
  quantidade: number;
  valorUnitario: number;
}

export interface PedidoDaPedreira {
  fornecedorId: string;
  itens: readonly ItemDoPedido[];
}

/** Separador que não aparece em uuid (a origem usava "|" no painel e "\x00" nas anomalias). */
const SEPARADOR = "|";

export function chavePedreira(fornecedorId: string, insumoId: string): string {
  return `${fornecedorId}${SEPARADOR}${insumoId}`;
}

export function separarChave(chave: string): { fornecedorId: string; insumoId: string } {
  const i = chave.indexOf(SEPARADOR);
  return { fornecedorId: chave.slice(0, i), insumoId: chave.slice(i + 1) };
}

export interface PedidoAgregado {
  qtd: number;
  valor: number;
  /** Preços unitários distintos, na ordem em que apareceram. */
  precos: number[];
}

export interface AgregadoDosPedidos {
  porChave: Map<string, PedidoAgregado>;
  /** Fornecedores com algum pedido no recorte (mesmo sem item). */
  fornecedores: Set<string>;
}

/** Σ dos pedidos por pedreira e material (buildPedidoInfo + pedidosPorFornecedor da origem). */
export function agregarPedidos(pedidos: readonly PedidoDaPedreira[]): AgregadoDosPedidos {
  const porChave = new Map<string, PedidoAgregado>();
  const fornecedores = new Set<string>();
  for (const pedido of pedidos) {
    if (!pedido.fornecedorId) continue;
    fornecedores.add(pedido.fornecedorId);
    for (const item of pedido.itens) {
      const chave = chavePedreira(pedido.fornecedorId, item.insumoId);
      const atual = porChave.get(chave) ?? { qtd: 0, valor: 0, precos: [] };
      if (!atual.precos.some((preco) => Math.abs(preco - item.valorUnitario) < TOLERANCIA_PRECO_IGUAL)) {
        atual.precos.push(item.valorUnitario);
      }
      atual.qtd += item.quantidade;
      atual.valor += item.quantidade * item.valorUnitario;
      porChave.set(chave, atual);
    }
  }
  return { porChave, fornecedores };
}

export interface TransporteAgregado {
  peso: number;
  freteValor: number;
  valorMaterial: number;
}

/**
 * Σ do transportado por pedreira e material. Só frete de material com pedreira: a
 * transferência e o frete cuja origem não é pedreira ficam fora (a origem ignorava
 * quem não casava com fornecedor).
 */
export function agregarTransporte(fretes: readonly FreteDaPedreira[]): Map<string, TransporteAgregado> {
  const mapa = new Map<string, TransporteAgregado>();
  for (const frete of apenasFretesDePedreira(fretes)) {
    if (!frete.pedreiraId || !frete.insumoId) continue;
    const chave = chavePedreira(frete.pedreiraId, frete.insumoId);
    const atual = mapa.get(chave) ?? { peso: 0, freteValor: 0, valorMaterial: 0 };
    atual.peso += frete.peso;
    atual.freteValor += frete.valorTotal;
    atual.valorMaterial += frete.valorMaterial || 0;
    mapa.set(chave, atual);
  }
  return mapa;
}

/** Zera o resíduo de ponto flutuante abaixo da tolerância, como a origem. */
export function comTolerancia(bruto: number, tolerancia: number): number {
  return Math.abs(bruto) < tolerancia ? 0 : bruto;
}

/** Preço médio ponderado do pedido (getCustoUnitMaterial da origem): 0 sem pedido. */
export function custoUnitarioDoPedido(
  pedidos: AgregadoDosPedidos,
  fornecedorId: string | null,
  insumoId: string,
): number {
  if (!fornecedorId) return 0;
  const dados = pedidos.porChave.get(chavePedreira(fornecedorId, insumoId));
  if (!dados || dados.qtd === 0) return 0;
  return dados.valor / dados.qtd;
}

export interface LinhaSaldoPedreira {
  fornecedorId: string;
  insumoId: string;
  qtd: number;
  valor: number;
  qtdTransportada: number;
  freteValor: number;
  valorMaterialTransp: number;
  /** Preço médio do pedido (R$/t). */
  vlrMedio: number;
  /** Frete médio (R$/t). */
  custoMedioFrete: number;
  saldoQtd: number;
  saldoValor: number;
}

export interface GrupoSaldoPedreira {
  fornecedorId: string;
  linhas: LinhaSaldoPedreira[];
  totalQtd: number;
  totalQtdTransp: number;
  totalValor: number;
  totalFreteValor: number;
  totalValorMaterialTransp: number;
  /** Σ dos saldos em R$ das linhas (cada um já com a tolerância). */
  totalSaldoValor: number;
  /** Saldo em toneladas recalculado do total, com a tolerância. */
  saldoQtd: number;
  /** A origem só mostra o grupo com pedido, com transporte ou escolhido nos cards. */
  visivel: boolean;
}

export interface TotalSaldoPedreira {
  qtd: number;
  qtdTransp: number;
  valor: number;
  freteValor: number;
  valorMaterialTransp: number;
  saldoValor: number;
  saldoQtd: number;
}

export interface EntradaSaldoPedreira {
  pedidos: AgregadoDosPedidos;
  transporte: Map<string, TransporteAgregado>;
  /** Fornecedores de material escolhidos nos cards do painel: aparecem mesmo sem pedido. */
  sempreVisiveis?: ReadonlySet<string>;
  /** Filtro local de fornecedor (vazio = todos). */
  fornecedores?: readonly string[];
  /** Filtro local de material (vazio = todos). */
  materiais?: readonly string[];
  nomeFornecedor: (id: string) => string;
}

/**
 * A tabela "Pedidos de Material por Fornecedor" (FreteDashboard.tsx:1363-1410).
 *
 * O grupo nasce de quem tem pedido no recorte (e dos escolhidos nos cards); a pedreira
 * com frete e sem pedido no recorte não aparece, como na origem. Dentro do grupo entram
 * também os materiais só transportados (qtd pedida 0), senão o transporte sem pedido
 * ficaria invisível. Grupos por nome; materiais por valor pedido, do maior.
 */
export function saldoNaPedreira(entrada: EntradaSaldoPedreira): { grupos: GrupoSaldoPedreira[]; total: TotalSaldoPedreira } {
  const { pedidos, transporte, nomeFornecedor } = entrada;
  const sempreVisiveis = entrada.sempreVisiveis ?? new Set<string>();
  const filtroFornecedores = entrada.fornecedores ?? [];
  const filtroMateriais = entrada.materiais ?? [];

  // fornecedor -> insumo -> { qtd, valor }, na ordem de chegada dos itens.
  const porFornecedor = new Map<string, Map<string, { qtd: number; valor: number }>>();
  for (const id of pedidos.fornecedores) porFornecedor.set(id, new Map());
  for (const [chave, dados] of pedidos.porChave) {
    const { fornecedorId, insumoId } = separarChave(chave);
    porFornecedor.get(fornecedorId)?.set(insumoId, { qtd: dados.qtd, valor: dados.valor });
  }
  for (const id of sempreVisiveis) if (!porFornecedor.has(id)) porFornecedor.set(id, new Map());

  const grupos: GrupoSaldoPedreira[] = [];
  const total: TotalSaldoPedreira = { qtd: 0, qtdTransp: 0, valor: 0, freteValor: 0, valorMaterialTransp: 0, saldoValor: 0, saldoQtd: 0 };

  const ordenados = [...porFornecedor.entries()]
    .filter(([id]) => filtroFornecedores.length === 0 || filtroFornecedores.includes(id))
    .sort((a, b) => nomeFornecedor(a[0]).localeCompare(nomeFornecedor(b[0])));

  for (const [fornecedorId, materiais] of ordenados) {
    // unirInsumosTransportados: material só transportado entra com pedido zero.
    const unido = new Map(materiais);
    for (const chave of transporte.keys()) {
      const { fornecedorId: f, insumoId } = separarChave(chave);
      if (f === fornecedorId && !unido.has(insumoId)) unido.set(insumoId, { qtd: 0, valor: 0 });
    }

    const grupo: GrupoSaldoPedreira = {
      fornecedorId,
      linhas: [],
      totalQtd: 0,
      totalQtdTransp: 0,
      totalValor: 0,
      totalFreteValor: 0,
      totalValorMaterialTransp: 0,
      totalSaldoValor: 0,
      saldoQtd: 0,
      visivel: false,
    };

    const linhas = [...unido.entries()]
      .filter(([insumoId]) => filtroMateriais.length === 0 || filtroMateriais.includes(insumoId))
      .sort((a, b) => b[1].valor - a[1].valor);
    for (const [insumoId, dados] of linhas) {
      const t = transporte.get(chavePedreira(fornecedorId, insumoId));
      const qtdTransportada = t?.peso ?? 0;
      const freteValor = t?.freteValor ?? 0;
      const valorMaterialTransp = t?.valorMaterial ?? 0;
      const linha: LinhaSaldoPedreira = {
        fornecedorId,
        insumoId,
        qtd: dados.qtd,
        valor: dados.valor,
        qtdTransportada,
        freteValor,
        valorMaterialTransp,
        vlrMedio: dados.qtd > 0 ? dados.valor / dados.qtd : 0,
        custoMedioFrete: qtdTransportada > 0 ? freteValor / qtdTransportada : 0,
        saldoQtd: comTolerancia(dados.qtd - qtdTransportada, TOLERANCIA_SALDO_TONELADAS),
        saldoValor: comTolerancia(dados.valor - valorMaterialTransp, TOLERANCIA_SALDO_REAIS),
      };
      grupo.linhas.push(linha);
      grupo.totalQtd += linha.qtd;
      grupo.totalQtdTransp += linha.qtdTransportada;
      grupo.totalValor += linha.valor;
      grupo.totalFreteValor += linha.freteValor;
      grupo.totalSaldoValor += linha.saldoValor;
      grupo.totalValorMaterialTransp += linha.valorMaterialTransp;
    }
    grupo.saldoQtd = comTolerancia(grupo.totalQtd - grupo.totalQtdTransp, TOLERANCIA_SALDO_TONELADAS);
    grupo.visivel = grupo.totalQtd > 0 || grupo.totalQtdTransp > 0 || sempreVisiveis.has(fornecedorId);

    if (grupo.visivel) {
      total.qtd += grupo.totalQtd;
      total.qtdTransp += grupo.totalQtdTransp;
      total.valor += grupo.totalValor;
      total.freteValor += grupo.totalFreteValor;
      total.saldoValor += grupo.totalSaldoValor;
      total.valorMaterialTransp += grupo.totalValorMaterialTransp;
    }
    grupos.push(grupo);
  }
  total.saldoQtd = comTolerancia(total.qtd - total.qtdTransp, TOLERANCIA_SALDO_TONELADAS);

  return { grupos, total };
}

/** Limite do F3: só saldo abaixo de −0,1 t acusa (detect.ts:171). */
export const LIMITE_SALDO_NEGATIVO_TONELADAS = -0.1;

export interface SaldoToneladas {
  fornecedorId: string;
  insumoId: string;
  qtdPedida: number;
  qtdTransportada: number;
  saldo: number;
}

/**
 * Saldo cumulativo em toneladas de cada pedreira e material que TEM transporte (o F3 da
 * origem): Σ pedido − Σ peso, sem tolerância e sem recorte de período.
 */
export function saldosEmToneladas(
  pedidos: AgregadoDosPedidos,
  transporte: Map<string, TransporteAgregado>,
): SaldoToneladas[] {
  const saldos: SaldoToneladas[] = [];
  for (const [chave, dados] of transporte) {
    const { fornecedorId, insumoId } = separarChave(chave);
    const qtdPedida = pedidos.porChave.get(chave)?.qtd ?? 0;
    saldos.push({ fornecedorId, insumoId, qtdPedida, qtdTransportada: dados.peso, saldo: qtdPedida - dados.peso });
  }
  return saldos;
}
