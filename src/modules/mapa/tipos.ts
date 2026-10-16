/**
 * O que a tela do Mapa recebe de `fn_mapa_estado()` (uma chamada, tudo que o mapa desenha) e o
 * vocabulário do módulo. Posição é sempre [lng, lat], a ordem do GeoJSON e do deck.gl.
 *
 * Espelha a especificação `docs/modulos/mapa.md` (v1.3) e as views da migration
 * `supabase/migrations/20261014120000_modulo_mapa_v1.sql`.
 */

export type Posicao = [number, number];

/** Estados que a pessoa escolhe (os do banco, `mapa_equipamentos.estado`). */
export const ESTADOS_MAQUINA = [
  "operando",
  "parado",
  "em_rota",
  "quebrado_obra",
  "conserto",
] as const;
export type EstadoMaquina = (typeof ESTADOS_MAQUINA)[number];

/** O que a view devolve em `estado_efetivo`: os cinco acima mais os dois que o cadastro impõe. */
export type EstadoEfetivo =
  | EstadoMaquina
  | "sem_posicao"
  | "fora_funcionamento";

export const ROTULO_ESTADO: Record<EstadoEfetivo, string> = {
  operando: "Operando",
  parado: "Parado",
  em_rota: "Em rota",
  quebrado_obra: "Quebrado na obra",
  conserto: "Em conserto",
  sem_posicao: "Sem posição",
  fora_funcionamento: "Fora de funcionamento",
};

export type Propriedade = "propria" | "colorado" | "alugada";

export const ROTULO_PROPRIEDADE: Record<Propriedade, string> = {
  propria: "Própria",
  colorado: "Colorado",
  alugada: "Alugada",
};

export const TIPOS_ALUGUEL = ["hora", "dia", "mes"] as const;
export type TipoAluguel = (typeof TIPOS_ALUGUEL)[number];
export const ROTULO_TIPO_ALUGUEL: Record<TipoAluguel, string> = {
  hora: "Por hora",
  dia: "Por dia",
  mes: "Por mês",
};

export interface LocacaoMapa {
  id: string;
  locadorId: string | null;
  locadorNome: string;
  tipoAluguel: TipoAluguel | null;
  valorUnitario: number;
  inicio: string | null;
  fimPrevisto: string | null;
  custoEstimado: number | null;
}

export interface EquipamentoMapa {
  id: string;
  codigo: string;
  descricao: string;
  tipo: string;
  marca: string;
  modelo: string;
  placa: string;
  propriedade: Propriedade;
  /** Chave em `mapa_modelos_3d` (vibroacabadora, caminhao_pipa...). */
  modelo3d: string;
  /** Null enquanto ninguém posicionou (estado `sem_posicao`). */
  pos: Posicao | null;
  /** Graus a partir do norte, sentido horário: o rumo desenhado (manual ou o da pista). */
  heading: number;
  /** Rumo escolhido na ficha; null = segue o traçado no km da máquina. */
  rumoManual: number | null;
  /** "frete": em rota por um frete aberto; a posição é estimada no traçado (fretes.ts). */
  fontePosicao: "manual" | "gps" | "frete";
  estado: EstadoEfetivo;
  /**
   * O estado marcado na ficha (`mapa_equipamentos.estado`), antes do cadastro e da falta de posição
   * entrarem no efetivo. É o que diz que a carreta sem posição foi marcada operando.
   */
  estadoMarcado: EstadoMaquina | null;
  estadoDesde: string | null;
  diasNoEstado: number | null;
  obraId: string | null;
  obraNome: string;
  trechoId: string | null;
  trechoNome: string;
  frenteId: string | null;
  frenteNome: string;
  areaId: string | null;
  areaNome: string;
  localidadeId: string | null;
  localidadeNome: string;
  km: number | null;
  operadorId: string | null;
  operadorNome: string;
  deslocamento: Record<string, unknown> | null;
  quebraDescricao: string;
  observacao: string;
  consertoMotivo: string;
  consertoPrevisao: string | null;
  consertoDesde: string | null;
  osAbertas: number;
  ultimoAbastecimento: string | null;
  ultimaMedicao: number | null;
  locacao: LocacaoMapa | null;
}

/** Colorado e alugadas fora do mapa: candidatas a "Adicionar máquina alugada". */
export interface EquipamentoForaDoMapa {
  id: string;
  codigo: string;
  descricao: string;
  tipo: string;
  marca: string;
  modelo: string;
  propriedade: Propriedade;
  modelo3d: string;
}

export interface PessoaMapa {
  id: string;
  nome: string;
  funcao: string;
  vinculo: string;
  equipeId: string | null;
  equipeNome: string;
  obraId: string | null;
  frenteId: string | null;
  equipamentoId: string | null;
  areaId: string | null;
  localidadeId: string | null;
  pos: Posicao | null;
  posicaoManual: boolean;
}

export interface TrechoMapa {
  id: string;
  obraId: string;
  obraNome: string;
  trechoPaiId: string | null;
  nome: string;
  rodovia: string;
  kmInicial: number;
  kmFinal: number;
  /** Hex (#rrggbb) ou vazio. */
  cor: string;
  ordem: number;
  /** Traçado em [lng, lat]; MultiLineString vira os pedaços emendados na ordem. */
  pontos: Posicao[];
}

export const TIPOS_AREA = [
  "patio_obra",
  "zona_patio_central",
  "zona_oficina",
  "terreno",
  "jazida",
  "canteiro",
  "edificacao",
] as const;
export type TipoArea = (typeof TIPOS_AREA)[number] | (string & {});

export const ROTULO_TIPO_AREA: Record<string, string> = {
  patio_obra: "Pátio de obra",
  zona_patio_central: "Pátio central",
  zona_oficina: "Oficina",
  terreno: "Terreno",
  jazida: "Jazida",
  canteiro: "Canteiro",
  edificacao: "Edificação",
};

export interface AreaMapa {
  id: string;
  nome: string;
  tipo: TipoArea;
  obraId: string | null;
  obraNome: string;
  localidadeId: string | null;
  atributos: Record<string, unknown>;
  /** Anéis do polígono (o primeiro é o contorno); MultiPolygon vira vários polígonos. */
  poligonos: Posicao[][][];
  centro: Posicao | null;
}

export interface LocalidadeMapa {
  id: string;
  nome: string;
  tipo: string;
  obraId: string | null;
  fornecedorId: string | null;
  pos: Posicao;
  /** Todos os tipos do local (pátio, jazida, oficina...); o primeiro é o principal (`tipo`). */
  tipos: string[];
  /** Raio da área do local, em metros; null = o padrão da configuração (snapLocalM). */
  raioM: number | null;
}

/** Tipos de local aceitos pelo cadastro (CHECK de `localidades.tipo`). */
export const TIPOS_LOCAL = [
  "oficina",
  "patio",
  "sede",
  "deposito",
  "canteiro",
  "alojamento",
  "usina",
  "pulmao",
  "pedreira",
  "jazida",
  "terreno",
  "outro",
] as const;
export type TipoLocal = (typeof TIPOS_LOCAL)[number];

/** Obra ativa do cadastro; `pos` é o ponto dela no mapa (null enquanto ninguém pôs). */
export interface ObraMapa {
  id: string;
  nome: string;
  cor: string | null;
  tipoObra: string;
  noMapa: boolean;
  pos: Posicao | null;
}

/** Tanque do Estoque: fica no mapa pelo local onde está (`localidadeId`). */
export interface TanqueMapa {
  id: string;
  nome: string;
  apelido: string;
  uso: string;
  ehExterno: boolean;
  localidadeId: string | null;
  /** Tanque de comboio (meloza): anda com a máquina, não tem local fixo. */
  equipamentoId: string | null;
  /** Ponto próprio no mapa (null = ainda sem lugar). */
  pos: Posicao | null;
  capacidade: number | null;
  nivel: number | null;
  unidade: string;
  /** O que está dentro (combustível ou material). */
  insumo: string;
}

/** Depósito do almoxarifado: fica no mapa pelo local onde está. */
export interface DepositoMapa {
  id: string;
  nome: string;
  localidadeId: string | null;
  pos: Posicao | null;
}

/** Pilha de agregado do Estoque (areia, brita...). */
export interface PilhaMapa {
  id: string;
  nome: string;
  /** Na unidade do material (as pilhas de agregado são controladas em toneladas). */
  saldo: number;
  /** Tudo o que já entrou na pilha; o que saiu é a diferença para o saldo. */
  totalEntrada: number;
  /** Material da pilha (insumo do Estoque). */
  insumo: string;
  /** Sigla da unidade do material ("t", "m³"). */
  unidade: string;
  localidadeId: string | null;
  pos: Posicao | null;
}

/**
 * Frete aberto (sem chegada) do módulo Frete, com a máquina casada pela placa da carreta. Os
 * valores vêm null para quem não vê a aba Fretes.
 */
export interface FreteEmRota {
  id: string;
  tipo: string;
  /** Dia da saída (yyyy-mm-dd). */
  data: string;
  /** Quando o frete foi registrado: a hora da saída que o mapa usa para estimar a posição. */
  criadoEm: string;
  placa: string;
  motorista: string;
  transportadora: string;
  equipamentoId: string | null;
  origem: string;
  destino: string;
  material: string;
  peso: number | null;
  km: number | null;
  valorTkm: number | null;
  valorTotal: number | null;
  valorMaterial: number | null;
  /** Tempo da rota medido pelo Frete (null = sem medida). */
  horas: number | null;
  /** O traçado da rota em [lng, lat]; sem traçado salvo, a reta da origem ao destino. */
  caminho: Posicao[];
}

/** Tanque, pilha ou depósito: o que o mapa põe no lugar pela mesma RPC. */
export type AlvoObjeto = "tanque" | "pilha" | "deposito";

/** Local do cadastro que ainda não tem ponto no mapa. */
export interface LocalSemPosicao {
  id: string;
  nome: string;
  tipo: string;
  tipos: string[];
}

export interface FrenteHoje {
  id: string;
  obraId: string | null;
  trechoId: string | null;
  areaId: string | null;
  data: string;
  nome: string;
  servico: string;
  kmInicial: number | null;
  kmFinal: number | null;
  observacao: string;
}

export interface Modelo3d {
  chave: string;
  nome: string;
  /** Caminho do GLB servido pelo app (/mapa-modelos/<chave>.glb) ou vazio. */
  arquivo: string;
  escala: number;
  versao: number;
}

export interface FornecedorOpcao {
  id: string;
  nome: string;
}

export interface ConfigMapa {
  snapTracadoM: number;
  snapLocalM: number;
  fornecedorColorado: string | null;
  tiposForaDoMapa: string[];
}

export interface EstadoMapa {
  geradoEm: string;
  hoje: string;
  config: ConfigMapa;
  modelos: Modelo3d[];
  equipamentos: EquipamentoMapa[];
  foraDoMapa: EquipamentoForaDoMapa[];
  pessoas: PessoaMapa[];
  trechos: TrechoMapa[];
  areas: AreaMapa[];
  localidades: LocalidadeMapa[];
  frentesHoje: FrenteHoje[];
  fornecedores: FornecedorOpcao[];
  obras: ObraMapa[];
  tanques: TanqueMapa[];
  depositos: DepositoMapa[];
  pilhas: PilhaMapa[];
  localidadesSemPosicao: LocalSemPosicao[];
  fretesEmRota: FreteEmRota[];
}

/** O que a pessoa pode fazer na tela, decidido no servidor pelo catálogo de permissões. */
export interface PermissoesMapa {
  editar: boolean;
  criar: boolean;
}

/** Chave da configuração do Google Maps que chega ao cliente (as duas são NEXT_PUBLIC). */
export interface ConfigGoogle {
  chave: string;
  mapId: string;
}

/**
 * Números da máquina na ficha (fn_mapa_ficha_equipamento, sob demanda). O gasto em manutenção
 * vem do Financeiro (rateio no centro de custo da máquina, categorias de manutenção), não das OS.
 */
export interface FichaNumeros {
  ultimoAbastecimento: {
    data: string;
    litros: number;
    valor: number;
    tanque: string;
  } | null;
  consumo30Dias: { litros: number; valor: number; abastecimentos: number };
  ultimaManutencao: {
    numero: string;
    tipo: string;
    status: string;
    abertura: string | null;
    conclusao: string | null;
    descricao: string;
    custo: number | null;
  } | null;
  gastoManutencao: {
    total: number;
    ultimos12Meses: number;
    ano: number;
    mesPassado: number;
    /** Primeiro dia do mês passado (yyyy-mm-dd). */
    mesPassadoRef: string;
    anoRef: number;
    /** A máquina tem centro de custo (sem ele, não há como somar o Financeiro). */
    temCentro: boolean;
    /** Desde sempre, por categoria do Financeiro, da maior para a menor. */
    porCategoria: { categoria: string; total: number }[];
  };
  /**
   * Custo das OS concluídas (Manutenção), pela data de conclusão, nos mesmos períodos. Fonte
   * diferente do Financeiro e que pode se sobrepor a ele: a ficha mostra as duas, sem somar.
   */
  custoOs: {
    total: number;
    ultimos12Meses: number;
    ano: number;
    mesPassado: number;
    quantidade: number;
  };
  /** Do cadastro do equipamento; valor nulo = não informado (a ficha não mostra a linha). */
  aquisicao: { valor: number | null; data: string | null };
}
