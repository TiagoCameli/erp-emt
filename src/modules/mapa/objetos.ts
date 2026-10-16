import { formatarBRL } from "@/lib/formatadores";
import { colarNoLocal, distanciaM } from "@/modules/mapa/geo";
import type {
  AlvoObjeto,
  DepositoMapa,
  LocalidadeMapa,
  PilhaMapa,
  Posicao,
  TanqueMapa,
} from "@/modules/mapa/tipos";
import {
  COMPRIMENTO_HORIZONTAL,
  PROFUNDIDADE_TAMPO,
  type FormaTanque,
} from "@/modules/mapa/malha-tanque";

/**
 * Tanques, pilhas e depósitos do Estoque como objetos 3D do mapa (pedido do Tiago, 15/10/2026).
 * O 3D é gerado pelo próprio mapa (tanque detalhado, cone, caixa), sem arquivo de modelo: o
 * tamanho sai da capacidade do tanque e a cor do que está dentro. Medidas reais, em metros; quem desenha
 * aplica a mesma escala das máquinas.
 */

export type Rgb = [number, number, number];
export type FormaObjeto = FormaTanque | "cone" | "caixa";

export interface ObjetoMapa {
  id: string;
  alvo: AlvoObjeto;
  nome: string;
  /** Linha de baixo do rótulo e da ficha ("15.000 L de Diesel S10", "pilha"). */
  detalhe: string;
  pos: Posicao | null;
  forma: FormaObjeto;
  /** Diâmetro (tanque e cone) ou largura (caixa), em metros. */
  largura: number;
  /** Comprimento do tanque horizontal e da caixa (galpão); igual à largura nas formas redondas. */
  comprimento: number;
  altura: number;
  cor: Rgb;
  /** Rumo em graus a partir do norte, sentido horário (só o depósito gira; 0 nos outros). */
  rumo?: number;
}

/** Tanque sem capacidade cadastrada (posto externo, por exemplo) desenha como um de 15 mil L. */
export const CAPACIDADE_PADRAO_L = 15000;

export const COR_COMBUSTIVEL: Rgb = [207, 148, 58];
export const COR_MATERIAL: Rgb = [69, 70, 75];
export const COR_EXTERNO: Rgb = [150, 150, 150];
export const COR_DEPOSITO: Rgb = [62, 119, 68];

/**
 * Depósito sem tamanho escolhido na ficha, em metros e em tamanho real (16/10/2026: "diminua o
 * almoxarifado, deixa eu escolher o tamanho"). Antes era esta caixa vezes a escala das máquinas.
 */
export const TAMANHO_DEPOSITO_PADRAO = {
  largura: 10,
  comprimento: 15,
  altura: 5,
} as const;

/** Capacidade do tanque em litros (m³ vira L); sem capacidade, a padrão. */
function litrosDoTanque(capacidade: number | null, unidade: string): number {
  if (!capacidade || capacidade <= 0) return CAPACIDADE_PADRAO_L;
  const u = unidade.toLowerCase();
  return u === "m3" || u === "m³" ? capacidade * 1000 : capacidade;
}

/**
 * Tanque vertical com altura 1,5 vez o diâmetro: V = π·d²/4·1,5d, então d = ∛(4V / 1,5π).
 * 15 mil L ≈ 2,3 m × 3,5 m; 100 mil L ≈ 4,4 m × 6,6 m.
 */
export function dimensoesDoTanque(
  capacidade: number | null,
  unidade: string,
): { diametro: number; altura: number } {
  const volume = litrosDoTanque(capacidade, unidade) / 1000;
  const diametro = Math.cbrt((4 * volume) / (1.5 * Math.PI));
  return { diametro, altura: diametro * 1.5 };
}

/** Acima disto o tanque de combustível já é de usina, em pé (os aéreos de obra vão até 30 mil L). */
export const LIMITE_HORIZONTAL_L = 30000;

/**
 * Tanque aéreo deitado: 2,8 diâmetros de tampo a tampo, tampos elípticos 2:1 (d/4 de fundo).
 * V = π·d²/4·(2,8d − 2·d/4) + π·d³/12 (os dois meio-elipsoides), então d = ∛(V / 0,6583π).
 * 15 mil L ≈ 1,9 m × 5,4 m; 4 mil L ≈ 1,25 m × 3,5 m.
 */
export function dimensoesDoTanqueHorizontal(
  capacidade: number | null,
  unidade: string,
): { diametro: number; comprimento: number } {
  const volume = litrosDoTanque(capacidade, unidade) / 1000;
  const k =
    (COMPRIMENTO_HORIZONTAL - 2 * PROFUNDIDADE_TAMPO) / 4 +
    PROFUNDIDADE_TAMPO / 3;
  const diametro = Math.cbrt(volume / (k * Math.PI));
  return { diametro, comprimento: diametro * COMPRIMENTO_HORIZONTAL };
}

/** Material (CAP, emulsão, imprimação) e tanque grande ficam em pé; diesel e ARLA de obra, deitados. */
export function formaDoTanque(
  t: Pick<TanqueMapa, "uso" | "capacidade" | "unidade">,
): FormaTanque {
  return t.uso === "material" ||
    litrosDoTanque(t.capacidade, t.unidade) > LIMITE_HORIZONTAL_L
    ? "tanque_vertical"
    : "tanque_horizontal";
}

/** 1,5 t de agregado ocupa 1 m³ de pilha (Tiago, 15/10/2026). */
export const TONELADAS_POR_M3 = 1.5;
/** Pilha zerada ainda aparece, do tamanho de 1 m³. */
export const VOLUME_MINIMO_PILHA_M3 = 1;
/** Altura/raio do cone: ângulo de repouso de agregado, uns 35° (tg 35° ≈ 0,7). */
const INCLINACAO_PILHA = 0.7;

/** A unidade é de volume (m³)? As demais (t, kg não) entram como massa. */
function ehMetroCubico(unidade: string): boolean {
  const u = unidade.trim().toLowerCase();
  return u === "m3" || u === "m³";
}

/** Volume da pilha em m³: saldo em t ÷ 1,5, ou o próprio saldo quando o material é medido em m³. */
export function volumeDaPilha(saldo: number, unidade = "t"): number {
  const s = Number.isFinite(saldo) ? Math.max(saldo, 0) : 0;
  return ehMetroCubico(unidade) ? s : s / TONELADAS_POR_M3;
}

/**
 * Tamanho da pilha pelo saldo: volume pela unidade do material (t ÷ 1,5 ou m³ direto); cone com
 * altura 0,7 do raio, então V = π·r²·h/3 = 0,7·π·r³/3 e r = ∛(3V / 0,7π). 150 t = 100 m³ ≈ 10,3 m
 * de base × 3,6 m de altura.
 */
export function dimensoesDaPilha(
  saldo: number,
  unidade = "t",
): {
  diametro: number;
  altura: number;
  volume: number;
} {
  const volume = Math.max(
    VOLUME_MINIMO_PILHA_M3,
    volumeDaPilha(saldo, unidade),
  );
  const raio = Math.cbrt((3 * volume) / (INCLINACAO_PILHA * Math.PI));
  return { diametro: raio * 2, altura: raio * INCLINACAO_PILHA, volume };
}

/** Cor da pilha pelo nome do material: brita cinza, areia bege, terra/argila marrom, pó claro. */
export function corDaPilha(nome: string): Rgb {
  const n = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/areia/.test(n)) return [214, 186, 128];
  if (/terra|argila|saibro|laterita|cascalho/.test(n)) return [150, 98, 60];
  if (/\bpo\b|po de pedra|filler/.test(n)) return [200, 200, 195];
  return [140, 140, 136];
}

const litrosTexto = (n: number) =>
  `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(n)} L`;

const numeroTexto = (n: number, casas: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: casas }).format(n);

/** "282 t ≈ 188 m³" (t) ou "40 m³": o saldo e, quando em massa, o volume que ele ocupa. */
export function textoSaldoPilha(saldo: number, unidade: string): string {
  const base = `${numeroTexto(saldo, 1)} ${unidade}`;
  if (ehMetroCubico(unidade) || saldo <= 0) return base;
  return `${base} ≈ ${numeroTexto(volumeDaPilha(saldo, unidade), 0)} m³`;
}

/** Todos os tanques, pilhas e depósitos ativos como objetos do mapa (com ou sem lugar). */
export function objetosDoEstoque(
  tanques: readonly TanqueMapa[],
  pilhas: readonly PilhaMapa[],
  depositos: readonly DepositoMapa[],
): ObjetoMapa[] {
  const objetos: ObjetoMapa[] = [];
  for (const t of tanques) {
    // Tanque de comboio (Meloza) anda com a máquina: é ela que aparece no mapa, não um tanque fixo.
    if (t.equipamentoId) continue;
    const forma = formaDoTanque(t);
    const vertical = dimensoesDoTanque(t.capacidade, t.unidade);
    const deitado = dimensoesDoTanqueHorizontal(t.capacidade, t.unidade);
    const medidas =
      forma === "tanque_vertical"
        ? {
            largura: vertical.diametro,
            comprimento: vertical.diametro,
            altura: vertical.altura,
          }
        : {
            largura: deitado.diametro,
            comprimento: deitado.comprimento,
            altura: deitado.diametro,
          };
    const capacidade =
      t.capacidade && t.capacidade > 0 ? litrosTexto(t.capacidade) : "";
    objetos.push({
      id: t.id,
      alvo: "tanque",
      nome: t.nome,
      detalhe: [
        t.ehExterno
          ? "posto externo"
          : t.uso === "material"
            ? "tanque de material"
            : "tanque",
        capacidade,
        t.insumo,
      ]
        .filter(Boolean)
        .join(" · "),
      pos: t.pos,
      forma,
      ...medidas,
      cor: t.ehExterno
        ? COR_EXTERNO
        : t.uso === "material"
          ? COR_MATERIAL
          : COR_COMBUSTIVEL,
    });
  }
  for (const p of pilhas) {
    const { diametro, altura } = dimensoesDaPilha(p.saldo, p.unidade);
    objetos.push({
      id: p.id,
      alvo: "pilha",
      nome: p.nome,
      detalhe: p.saldo > 0 ? textoSaldoPilha(p.saldo, p.unidade) : "vazia",
      pos: p.pos,
      forma: "cone",
      largura: diametro,
      comprimento: diametro,
      altura,
      cor: corDaPilha(p.nome),
    });
  }
  for (const d of depositos)
    objetos.push({
      id: d.id,
      alvo: "deposito",
      nome: d.nome,
      detalhe: "depósito",
      pos: d.pos,
      forma: "caixa",
      largura: d.larguraM ?? TAMANHO_DEPOSITO_PADRAO.largura,
      comprimento: d.comprimentoM ?? TAMANHO_DEPOSITO_PADRAO.comprimento,
      altura: d.alturaM ?? TAMANHO_DEPOSITO_PADRAO.altura,
      cor: COR_DEPOSITO,
      rumo: d.rumo,
    });
  return objetos;
}

export interface LinhaFicha {
  rotulo: string;
  valor: string;
}

/** O que a ficha do objeto lê além dele: o cadastro de onde ele veio, locais e máquinas. */
export interface FontesFicha {
  tanques: readonly TanqueMapa[];
  pilhas: readonly PilhaMapa[];
  depositos: readonly DepositoMapa[];
  localidades: readonly LocalidadeMapa[];
  equipamentos: readonly { id: string; codigo: string }[];
  /** Raio padrão de um local sem raio próprio (`config.snapLocalM`). */
  snapLocalM: number;
  /**
   * Valor do que está dentro, por id do tanque ou da pilha (o mesmo da aba Posição do Estoque:
   * combustível pelo preço médio do tanque, material pelo PEPS). Nulo para quem não vê a Posição.
   */
  valores: ReadonlyMap<string, number> | null;
}

/** Até onde o "perto de" alcança quando o ponto não cai na área de nenhum local. */
export const PERTO_DE_MAX_M = 1000;

/**
 * Onde o objeto está, pelo lugar marcado no mapa (pedido do Tiago, 16/10/2026: "deve pegar a
 * localização de onde eles estão"). Dentro do raio de um local: o nome dele. Fora, mas a até 1 km:
 * "perto de X (374 m)", para não dizer que está dentro. Sem lugar marcado ou longe de tudo: null.
 */
export function localDoPonto(
  pos: Posicao | null,
  localidades: readonly LocalidadeMapa[],
  snapLocalM: number,
): string | null {
  if (!pos) return null;
  const dentro = colarNoLocal(pos, [...localidades], snapLocalM);
  if (dentro) return dentro.local.nome;
  let perto: { nome: string; d: number } | null = null;
  for (const l of localidades) {
    const d = distanciaM(pos, l.pos);
    if (d <= PERTO_DE_MAX_M && (!perto || d < perto.d))
      perto = { nome: l.nome, d };
  }
  return perto ? `perto de ${perto.nome} (${Math.round(perto.d)} m)` : null;
}

/** O local cadastrado manda; sem ele, o do lugar no mapa. */
function textoDoLocal(
  localidadeId: string | null,
  pos: Posicao | null,
  fontes: FontesFicha,
): string {
  const cadastrado = localidadeId
    ? fontes.localidades.find((l) => l.id === localidadeId)?.nome
    : undefined;
  if (cadastrado) return cadastrado;
  if (!pos) return "sem lugar no mapa";
  return (
    localDoPonto(pos, fontes.localidades, fontes.snapLocalM) ??
    "fora de um local"
  );
}

/** Linha "Valor" quando quem vê tem a Posição do Estoque; o que não está na posição vale zero. */
function linhaValor(id: string, fontes: FontesFicha): LinhaFicha[] {
  if (!fontes.valores) return [];
  return [{ rotulo: "Valor", valor: formatarBRL(fontes.valores.get(id) ?? 0) }];
}

/**
 * As linhas da ficha do tanque, pilha ou depósito, lidas do cadastro do Estoque e do Combustível
 * (pedido do Tiago, 16/10/2026: "com informações corretas"). Pilha: material, saldo (com o volume
 * quando em t), o que entrou e saiu, local. Tanque: conteúdo, nível sobre a capacidade, local ou
 * máquina que o leva. Depósito: local.
 */
export function linhasDaFicha(
  objeto: Pick<ObjetoMapa, "id" | "alvo">,
  fontes: FontesFicha,
): LinhaFicha[] {
  if (objeto.alvo === "pilha") {
    const p = fontes.pilhas.find((x) => x.id === objeto.id);
    if (!p) return [];
    const saiu = Math.max(p.totalEntrada - p.saldo, 0);
    return [
      { rotulo: "Material", valor: p.insumo || "sem material" },
      {
        rotulo: "Saldo",
        valor: p.saldo > 0 ? textoSaldoPilha(p.saldo, p.unidade) : "vazia",
      },
      {
        rotulo: "Já entrou",
        valor: `${numeroTexto(p.totalEntrada, 1)} ${p.unidade}`,
      },
      { rotulo: "Já saiu", valor: `${numeroTexto(saiu, 1)} ${p.unidade}` },
      ...linhaValor(p.id, fontes),
      { rotulo: "Local", valor: textoDoLocal(p.localidadeId, p.pos, fontes) },
    ];
  }
  if (objeto.alvo === "tanque") {
    const t = fontes.tanques.find((x) => x.id === objeto.id);
    if (!t) return [];
    const un = t.unidade || "L";
    const capacidade = t.capacidade && t.capacidade > 0 ? t.capacidade : null;
    const nivel = t.nivel ?? 0;
    const linhas: LinhaFicha[] = [
      {
        rotulo: "Tipo",
        valor: t.ehExterno
          ? "Posto externo"
          : t.uso === "material"
            ? "Tanque de material"
            : "Tanque de combustível",
      },
      { rotulo: "Conteúdo", valor: t.insumo || "vazio" },
    ];
    if (!t.ehExterno)
      linhas.push({
        rotulo: "Nível",
        valor: capacidade
          ? `${numeroTexto(nivel, 1)} de ${numeroTexto(capacidade, 0)} ${un} (${numeroTexto((nivel / capacidade) * 100, 0)}%)`
          : `${numeroTexto(nivel, 1)} ${un}`,
      });
    if (!t.ehExterno) linhas.push(...linhaValor(t.id, fontes));
    const maquina = t.equipamentoId
      ? fontes.equipamentos.find((e) => e.id === t.equipamentoId)
      : null;
    linhas.push(
      maquina
        ? { rotulo: "Anda com", valor: maquina.codigo }
        : {
            rotulo: "Local",
            valor: textoDoLocal(t.localidadeId, t.pos, fontes),
          },
    );
    return linhas;
  }
  const d = fontes.depositos.find((x) => x.id === objeto.id);
  if (!d) return [];
  return [
    { rotulo: "Local", valor: textoDoLocal(d.localidadeId, d.pos, fontes) },
  ];
}
