import { ESTADOS_MAQUINA, type EstadoMaquina } from "@/modules/mapa/tipos";
import type {
  AlertaMapa,
  AreaMapa,
  AvisosMapa,
  CarretaRetorno,
  DepositoMapa,
  EquipamentoForaDoMapa,
  EquipamentoMapa,
  EstadoEfetivo,
  EstadoMapa,
  FichaNumeros,
  FreteEmRota,
  FrenteHoje,
  LocacaoMapa,
  LocalidadeMapa,
  Modelo3d,
  MudancaHoje,
  PessoaMapa,
  TanqueMapa,
  Posicao,
  Propriedade,
  TipoAluguel,
  TrechoMapa,
} from "@/modules/mapa/tipos";

/**
 * Converte o JSON de `fn_mapa_estado()` no formato tipado da tela. Tolerante de propósito: campo
 * faltando vira vazio/null, ponto malformado sai, e NADA aqui derruba o mapa inteiro por causa de
 * um registro. Quem garante o conteúdo é a view; aqui só se faz o estreitamento.
 */

type Linha = Record<string, unknown>;

function lista(valor: unknown): Linha[] {
  return Array.isArray(valor)
    ? valor.filter((v): v is Linha => typeof v === "object" && v !== null)
    : [];
}

const texto = (v: unknown): string =>
  typeof v === "string" ? v : v === null || v === undefined ? "" : String(v);
const textoOuNulo = (v: unknown): string | null =>
  typeof v === "string" && v !== "" ? v : null;
const objeto = (v: unknown): Record<string, unknown> | null =>
  typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;

function numero(v: unknown): number {
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string" && v !== ""
        ? Number(v)
        : Number.NaN;
  return Number.isFinite(n) ? n : 0;
}

function numeroOuNulo(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function inteiro(v: unknown): number {
  return Math.trunc(numero(v));
}

function posicao(lng: unknown, lat: unknown): Posicao | null {
  const x = numeroOuNulo(lng);
  const y = numeroOuNulo(lat);
  return x === null || y === null ? null : [x, y];
}

/**
 * O traçado do Frete (frete_rotas_tracado) vem em [lat, lng]; o mapa usa [lng, lat]. Sem traçado,
 * a reta da origem ao destino (quando os dois locais têm ponto).
 */
function caminhoDoFrete(
  tracado: unknown,
  origem: Posicao | null,
  destino: Posicao | null,
): Posicao[] {
  const pontos = Array.isArray(tracado)
    ? tracado.flatMap((p): Posicao[] => {
        if (!Array.isArray(p) || p.length < 2) return [];
        const lat = numeroOuNulo(p[0]);
        const lng = numeroOuNulo(p[1]);
        return lat === null || lng === null ? [] : [[lng, lat]];
      })
    : [];
  if (pontos.length >= 2) return pontos;
  return origem && destino ? [origem, destino] : [];
}

function frete(f: Linha): FreteEmRota {
  return {
    id: texto(f.id),
    tipo: texto(f.tipo),
    data: texto(f.data),
    criadoEm: texto(f.criado_em),
    placa: texto(f.placa),
    motorista: texto(f.motorista),
    transportadora: texto(f.transportadora),
    equipamentoId: textoOuNulo(f.equipamento_id),
    origem: texto(f.origem),
    destino: texto(f.destino),
    material: texto(f.material),
    peso: numeroOuNulo(f.peso),
    km: numeroOuNulo(f.km),
    valorTkm: numeroOuNulo(f.valor_tkm),
    valorTotal: numeroOuNulo(f.valor_total),
    valorMaterial: numeroOuNulo(f.valor_material),
    horas: numeroOuNulo(f.horas),
    caminho: caminhoDoFrete(
      f.tracado,
      posicao(f.origem_lng, f.origem_lat),
      posicao(f.destino_lng, f.destino_lat),
    ),
  };
}

/**
 * A volta da carreta, do destino do frete à pedreira: o traçado da volta, se o Frete mediu; senão
 * o da ida (pedreira → destino) de trás para a frente; sem nenhum, a reta.
 */
function retorno(r: Linha): CarretaRetorno {
  const de = posicao(r.de_lng, r.de_lat);
  const pedreira = posicao(r.pedreira_lng, r.pedreira_lat);
  const volta = caminhoDoFrete(r.tracado_volta, null, null);
  return {
    equipamentoId: texto(r.equipamento_id),
    freteId: texto(r.frete_id),
    chegadaEm: texto(r.chegada_em),
    chegada: texto(r.chegada),
    de: texto(r.de),
    pedreiraId: texto(r.pedreira_id),
    pedreira: texto(r.pedreira),
    pedreiraEscolhida: r.pedreira_escolhida === true,
    horas: numeroOuNulo(r.horas),
    km: numeroOuNulo(r.km),
    caminho:
      volta.length >= 2
        ? volta
        : caminhoDoFrete(r.tracado_ida, pedreira, de).reverse(),
  };
}

const ESTADOS: ReadonlySet<string> = new Set([
  "operando",
  "parado",
  "quebrado_obra",
  "esperando_conserto",
  "conserto",
  "sem_posicao",
  "fora_funcionamento",
]);

/** 'em_rota' manual (fora da tela desde a v1.19) aparece como em deslocamento. */
function estadoEfetivo(v: unknown): EstadoEfetivo {
  if (v === "em_rota") return "em_deslocamento";
  return typeof v === "string" && ESTADOS.has(v)
    ? (v as EstadoEfetivo)
    : "sem_posicao";
}

/** O estado marcado na ficha; fora da lista (RPC antiga sem a chave), null. */
function estadoMarcado(v: unknown): EstadoMaquina | null {
  return typeof v === "string" &&
    (ESTADOS_MAQUINA as readonly string[]).includes(v)
    ? (v as EstadoMaquina)
    : null;
}

function propriedade(v: unknown): Propriedade {
  return v === "colorado" || v === "alugada" ? v : "propria";
}

function tipoAluguel(v: unknown): TipoAluguel | null {
  return v === "hora" || v === "dia" || v === "mes" ? v : null;
}

/** Um par [lng, lat] válido do GeoJSON, ou null. */
function par(v: unknown): Posicao | null {
  if (!Array.isArray(v) || v.length < 2) return null;
  const x = Number(v[0]);
  const y = Number(v[1]);
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
}

function linha(coords: unknown): Posicao[] {
  return Array.isArray(coords)
    ? coords.flatMap((c) => (par(c) ? [par(c) as Posicao] : []))
    : [];
}

/** LineString ou MultiLineString → uma lista de pontos (os pedaços emendados na ordem). */
export function pontosDoTracado(geojson: unknown): Posicao[] {
  const g = objeto(geojson);
  if (!g) return [];
  if (g.type === "LineString") return linha(g.coordinates);
  if (g.type === "MultiLineString" && Array.isArray(g.coordinates))
    return g.coordinates.flatMap(linha);
  return [];
}

/** Polygon ou MultiPolygon → polígonos, cada um com os seus anéis. */
export function poligonosDaArea(geojson: unknown): Posicao[][][] {
  const g = objeto(geojson);
  if (!g) return [];
  const aneis = (p: unknown): Posicao[][] =>
    Array.isArray(p) ? p.map(linha).filter((a) => a.length >= 3) : [];
  if (g.type === "Polygon") {
    const p = aneis(g.coordinates);
    return p.length ? [p] : [];
  }
  if (g.type === "MultiPolygon" && Array.isArray(g.coordinates)) {
    return g.coordinates.map(aneis).filter((p) => p.length > 0);
  }
  return [];
}

function locacao(v: unknown): LocacaoMapa | null {
  const l = objeto(v);
  if (!l || !l.id) return null;
  return {
    id: texto(l.id),
    locadorId: textoOuNulo(l.locador_id),
    locadorNome: texto(l.locador_nome),
    tipoAluguel: tipoAluguel(l.tipo_aluguel),
    valorUnitario: numero(l.valor_unitario),
    inicio: textoOuNulo(l.inicio),
    fimPrevisto: textoOuNulo(l.fim_previsto),
    custoEstimado: numeroOuNulo(l.custo_estimado),
  };
}

function equipamento(e: Linha): EquipamentoMapa {
  return {
    id: texto(e.id),
    codigo: texto(e.codigo),
    descricao: texto(e.descricao),
    tipo: texto(e.tipo),
    marca: texto(e.marca),
    modelo: texto(e.modelo),
    placa: texto(e.placa),
    propriedade: propriedade(e.propriedade),
    modelo3d: texto(e.modelo_3d) || "generico",
    pos: posicao(e.lng, e.lat),
    heading: numeroOuNulo(e.heading) ?? 0,
    rumoManual: numeroOuNulo(e.heading),
    fontePosicao: e.fonte_posicao === "gps" ? "gps" : "manual",
    estado: estadoEfetivo(e.estado),
    estadoMarcado: estadoMarcado(e.estado_mapa),
    estadoDesde: textoOuNulo(e.estado_desde),
    // RPC antiga sem a chave: a mudança de estado é a última marcação conhecida.
    marcadoEm: textoOuNulo(e.marcado_em) ?? textoOuNulo(e.estado_desde),
    carretaEmt: e.carreta_emt === true,
    diasNoEstado: numeroOuNulo(e.dias_no_estado),
    obraId: textoOuNulo(e.obra_id),
    obraNome: texto(e.obra_nome),
    trechoId: textoOuNulo(e.trecho_id),
    trechoNome: texto(e.trecho_nome),
    frenteId: textoOuNulo(e.frente_id),
    frenteNome: texto(e.frente_nome),
    areaId: textoOuNulo(e.area_id),
    areaNome: texto(e.area_nome),
    localidadeId: textoOuNulo(e.localidade_id),
    localidadeNome: texto(e.localidade_nome),
    km: numeroOuNulo(e.km),
    operadorId: textoOuNulo(e.operador_id),
    operadorNome: texto(e.operador_nome),
    deslocamento: objeto(e.deslocamento),
    quebraDescricao: texto(e.quebra_descricao),
    observacao: texto(e.observacao),
    consertoMotivo: texto(e.conserto_motivo),
    consertoPrevisao: textoOuNulo(e.conserto_previsao),
    consertoDesde: textoOuNulo(e.conserto_desde),
    osAbertas: inteiro(e.os_abertas),
    ultimoAbastecimento: textoOuNulo(e.ultimo_abastecimento),
    ultimaMedicao: numeroOuNulo(e.ultima_medicao),
    locacao: locacao(e.locacao),
  };
}

function foraDoMapa(e: Linha): EquipamentoForaDoMapa {
  return {
    id: texto(e.id),
    codigo: texto(e.codigo),
    descricao: texto(e.descricao),
    tipo: texto(e.tipo),
    marca: texto(e.marca),
    modelo: texto(e.modelo),
    propriedade: propriedade(e.propriedade),
    modelo3d: texto(e.modelo_3d) || "generico",
  };
}

function pessoa(p: Linha): PessoaMapa {
  return {
    id: texto(p.id),
    nome: texto(p.nome),
    funcao: texto(p.funcao),
    vinculo: texto(p.vinculo),
    equipeId: textoOuNulo(p.equipe_id),
    equipeNome: texto(p.equipe_nome),
    obraId: textoOuNulo(p.obra_id),
    obraMapaId: textoOuNulo(p.obra_mapa_id),
    frenteId: textoOuNulo(p.frente_id),
    equipamentoId: textoOuNulo(p.equipamento_id),
    areaId: textoOuNulo(p.area_id),
    localidadeId: textoOuNulo(p.localidade_id),
    pos: posicao(p.lng, p.lat),
    posicaoManual: p.posicao_manual === true,
    centroCustoId: textoOuNulo(p.centro_custo_id),
    centroCustoNome: texto(p.centro_custo_nome),
  };
}

function trecho(t: Linha): TrechoMapa {
  return {
    id: texto(t.id),
    obraId: texto(t.obra_id),
    obraNome: texto(t.obra_nome),
    trechoPaiId: textoOuNulo(t.trecho_pai_id),
    nome: texto(t.nome),
    rodovia: texto(t.rodovia),
    kmInicial: numero(t.km_inicial),
    kmFinal: numero(t.km_final),
    cor: texto(t.cor),
    ordem: inteiro(t.ordem),
    pontos: pontosDoTracado(t.tracado),
  };
}

function area(a: Linha): AreaMapa {
  return {
    id: texto(a.id),
    nome: texto(a.nome),
    tipo: texto(a.tipo),
    obraId: textoOuNulo(a.obra_id),
    obraNome: texto(a.obra_nome),
    localidadeId: textoOuNulo(a.localidade_id),
    atributos: objeto(a.atributos) ?? {},
    poligonos: poligonosDaArea(a.poligono),
    centro: posicao(a.centro_lng, a.centro_lat),
  };
}

function frente(f: Linha): FrenteHoje {
  return {
    id: texto(f.id),
    obraId: textoOuNulo(f.obra_id),
    trechoId: textoOuNulo(f.trecho_id),
    areaId: textoOuNulo(f.area_id),
    data: texto(f.data),
    nome: texto(f.nome),
    servico: texto(f.servico),
    kmInicial: numeroOuNulo(f.km_inicial),
    kmFinal: numeroOuNulo(f.km_final),
    observacao: texto(f.observacao),
  };
}

function modelo(m: Linha): Modelo3d {
  const escala = numeroOuNulo(m.escala);
  return {
    chave: texto(m.chave),
    nome: texto(m.nome),
    arquivo: texto(m.arquivo),
    escala: escala && escala > 0 ? escala : 1,
    versao: inteiro(m.versao) || 1,
  };
}

/** Converte o JSON da RPC no estado tipado da tela, ou null quando o formato não é o esperado. */
/** Lista de tipos do local; a RPC antiga (sem `tipos`) vira a lista só com o `tipo`. */
function tiposDoLocal(tipos: unknown, tipo: unknown): string[] {
  const lista = Array.isArray(tipos)
    ? tipos.filter((t): t is string => typeof t === "string" && t !== "")
    : [];
  if (lista.length > 0) return lista;
  const principal = texto(tipo);
  return principal ? [principal] : [];
}

export function paraEstadoMapa(bruto: unknown): EstadoMapa | null {
  const b = objeto(bruto);
  if (!b || !Array.isArray(b.equipamentos) || !Array.isArray(b.trechos))
    return null;
  const config = objeto(b.config) ?? {};
  const tiposFora = Array.isArray(config.tipos_fora_do_mapa)
    ? config.tipos_fora_do_mapa.filter(
        (t): t is string => typeof t === "string",
      )
    : [];
  return {
    geradoEm: texto(b.gerado_em),
    hoje: texto(b.hoje),
    config: {
      snapTracadoM: numeroOuNulo(config.snap_tracado_m) ?? 300,
      snapLocalM: numeroOuNulo(config.snap_local_m) ?? 300,
      fornecedorColorado: textoOuNulo(config.fornecedor_colorado),
      tiposForaDoMapa: tiposFora,
      obraCarretasEmt: textoOuNulo(config.obra_carretas_emt),
    },
    modelos: lista(b.modelos).map(modelo),
    equipamentos: lista(b.equipamentos).map(equipamento),
    foraDoMapa: lista(b.fora_do_mapa).map(foraDoMapa),
    pessoas: lista(b.pessoas).map(pessoa),
    trechos: lista(b.trechos)
      .map(trecho)
      .filter((t) => t.pontos.length >= 2),
    areas: lista(b.areas).map(area),
    localidades: lista(b.localidades).flatMap((l) => {
      const pos = posicao(l.lng, l.lat);
      if (!pos) return [];
      const item: LocalidadeMapa = {
        id: texto(l.id),
        nome: texto(l.nome),
        tipo: texto(l.tipo),
        obraId: textoOuNulo(l.obra_id),
        fornecedorId: textoOuNulo(l.fornecedor_id),
        pos,
        raioM: numeroOuNulo(l.raio_m),
        tipos: tiposDoLocal(l.tipos, l.tipo),
      };
      return [item];
    }),
    frentesHoje: lista(b.frentes_hoje).map(frente),
    fornecedores: lista(b.fornecedores).map((f) => ({
      id: texto(f.id),
      nome: texto(f.nome),
    })),
    obras: lista(b.obras).map((o) => ({
      id: texto(o.id),
      nome: texto(o.nome),
      cor: textoOuNulo(o.cor),
      tipoObra: texto(o.tipo_obra),
      noMapa: o.no_mapa === true,
      pos: posicao(o.lng, o.lat),
    })),
    // Tanque externo (posto de terceiro, ex. Posto Progresso, Transterra Areacre) não é da EMT e
    // não entra no mapa (pedido do Tiago, 16/10/2026).
    tanques: lista(b.tanques)
      .filter((t) => t.eh_externo !== true)
      .map((t) => ({
        id: texto(t.id),
        nome: texto(t.nome),
        apelido: texto(t.apelido),
        uso: texto(t.uso),
        localidadeId: textoOuNulo(t.localidade_id),
        equipamentoId: textoOuNulo(t.equipamento_id),
        pos: posicao(t.lng, t.lat),
        capacidade: numeroOuNulo(t.capacidade),
        nivel: numeroOuNulo(t.nivel),
        unidade: texto(t.unidade) || "L",
        insumo: texto(t.insumo),
      })),
    depositos: lista(b.depositos).map((d) => ({
      id: texto(d.id),
      nome: texto(d.nome),
      localidadeId: textoOuNulo(d.localidade_id),
      pos: posicao(d.lng, d.lat),
      rumo: numero(d.rumo),
      larguraM: numeroOuNulo(d.largura_m),
      comprimentoM: numeroOuNulo(d.comprimento_m),
      alturaM: numeroOuNulo(d.altura_m),
    })),
    pilhas: lista(b.pilhas).map((p) => ({
      id: texto(p.id),
      nome: texto(p.nome),
      saldo: numero(p.saldo),
      totalEntrada: numero(p.total_entrada),
      insumo: texto(p.insumo),
      unidade: texto(p.unidade) || "t",
      localidadeId: textoOuNulo(p.localidade_id),
      pos: posicao(p.lng, p.lat),
    })),
    localidadesSemPosicao: lista(b.localidades_sem_posicao).map((l) => ({
      id: texto(l.id),
      nome: texto(l.nome),
      tipo: texto(l.tipo),
      tipos: tiposDoLocal(l.tipos, l.tipo),
    })),
    fretesEmRota: lista(b.fretes_em_rota).map(frete),
    carretasRetorno: lista(b.carretas_retorno).map(retorno),
    implementos: lista(b.implementos).map((i) => ({
      id: texto(i.id),
      codigo: texto(i.codigo),
      descricao: texto(i.descricao),
      acopladoEm: textoOuNulo(i.acoplado_em),
    })),
  };
}

/**
 * Segunda linha do rótulo de cada local: quantos tanques e depósitos estão ali
 * ("2 tanques · 1 depósito"). Tanque de comboio (meloza) anda com a máquina e não conta.
 */
export function extrasPorLocal(
  tanques: readonly TanqueMapa[],
  depositos: readonly DepositoMapa[],
): Map<string, string> {
  const contagem = new Map<string, { tanques: number; depositos: number }>();
  const somar = (id: string | null, campo: "tanques" | "depositos") => {
    if (!id) return;
    const atual = contagem.get(id) ?? { tanques: 0, depositos: 0 };
    atual[campo] += 1;
    contagem.set(id, atual);
  };
  for (const t of tanques)
    if (!t.equipamentoId) somar(t.localidadeId, "tanques");
  for (const d of depositos) somar(d.localidadeId, "depositos");
  const extras = new Map<string, string>();
  for (const [id, c] of contagem) {
    const partes: string[] = [];
    if (c.tanques)
      partes.push(`${c.tanques} ${c.tanques === 1 ? "tanque" : "tanques"}`);
    if (c.depositos)
      partes.push(
        `${c.depositos} ${c.depositos === 1 ? "depósito" : "depósitos"}`,
      );
    extras.set(id, partes.join(" · "));
  }
  return extras;
}

/** JSON de fn_mapa_ficha_equipamento → FichaNumeros (null se o formato não for o esperado). */
export function paraFichaNumeros(bruto: unknown): FichaNumeros | null {
  const b = objeto(bruto);
  if (!b) return null;
  const abast = objeto(b.ultimo_abastecimento);
  const consumo = objeto(b.consumo_30_dias) ?? {};
  const os = objeto(b.ultima_manutencao);
  const gasto = objeto(b.gasto_manutencao) ?? {};
  const custoOs = objeto(b.custo_os) ?? {};
  const aquisicao = objeto(b.aquisicao) ?? {};
  return {
    ultimoAbastecimento: abast
      ? {
          data: texto(abast.data),
          litros: numero(abast.litros),
          valor: numero(abast.valor),
          tanque: texto(abast.tanque),
        }
      : null,
    consumo30Dias: {
      litros: numero(consumo.litros),
      valor: numero(consumo.valor),
      abastecimentos: inteiro(consumo.abastecimentos),
    },
    ultimaManutencao: os
      ? {
          numero: texto(os.numero),
          tipo: texto(os.tipo),
          status: texto(os.status),
          abertura: textoOuNulo(os.abertura),
          conclusao: textoOuNulo(os.conclusao),
          descricao: texto(os.descricao),
          custo: numeroOuNulo(os.custo),
        }
      : null,
    gastoManutencao: {
      total: numero(gasto.total),
      ultimos12Meses: numero(gasto.ultimos_12_meses),
      ano: numero(gasto.ano),
      mesPassado: numero(gasto.mes_passado),
      mesPassadoRef: texto(gasto.mes_passado_ref),
      anoRef: inteiro(gasto.ano_ref),
      temCentro: gasto.tem_centro === true,
      aquisicao: numero(gasto.aquisicao),
    },
    custoOs: {
      total: numero(custoOs.total),
      ultimos12Meses: numero(custoOs.ultimos_12_meses),
      ano: numero(custoOs.ano),
      mesPassado: numero(custoOs.mes_passado),
      quantidade: inteiro(custoOs.quantidade),
    },
    aquisicao: {
      valor: numeroOuNulo(aquisicao.valor),
      data: textoOuNulo(aquisicao.data),
    },
  };
}

/**
 * JSON de `fn_mapa_avisos()` → alertas e mudanças de hoje. Registro sem id ou sem alvo sai; o
 * resto vira vazio. Formato inesperado inteiro devolve null (a tela segue sem a faixa).
 */
export function paraAvisosMapa(data: unknown): AvisosMapa | null {
  if (typeof data !== "object" || data === null || Array.isArray(data))
    return null;
  const d = data as Linha;
  const alertas: AlertaMapa[] = lista(d.alertas).flatMap((a) => {
    const id = textoOuNulo(a.id);
    if (!id) return [];
    return [
      {
        id,
        tipo: texto(a.tipo),
        alvo: texto(a.alvo),
        alvoId: textoOuNulo(a.alvo_id),
        mensagem: texto(a.mensagem),
        criadoEm: texto(a.criado_em),
      },
    ];
  });
  const mudancasHoje: MudancaHoje[] = lista(d.mudancas_hoje).flatMap((m) => {
    const alvoId = textoOuNulo(m.alvo_id);
    if (!alvoId) return [];
    return [
      {
        alvo: texto(m.alvo),
        alvoId,
        tipo: texto(m.tipo),
        criadoEm: texto(m.criado_em),
      },
    ];
  });
  return { hoje: texto(d.hoje), alertas, mudancasHoje };
}
