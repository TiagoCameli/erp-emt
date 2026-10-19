"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  CalendarClock,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Compass,
  HardHat,
  Layers,
  MapPinPlus,
  MousePointer2,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Route,
  Satellite,
  ArrowRightLeft,
  Tag,
  Users,
  X,
} from "lucide-react";

import {
  BarraFiltrosConfiguravel,
  ConfirmDialog,
  FiltroBusca,
  FiltroSelect,
  type FiltroDaBarra,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dataHojeISO, formatarData } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import { registrarChegada } from "@/modules/frete/fretes/actions";
import {
  acoplarImplemento,
  ajustarRaioLocal,
  alocar,
  assinalarOperador,
  tirarDiaristaDoMapa,
  colocarLocal,
  definirTamanhoDeposito,
  girarDeposito,
  desenharObra,
  editarLocal,
  inativarLocal,
  encerrarLocacao,
  escolherPedreira,
  girarEquipamento,
  marcarEstado,
  moverEquipamentos,
  moverPessoas,
  moverPessoasEmLote,
  posicionarObjeto,
  posicionarObra,
  recarregarEstado,
  tirarObra,
  vincularLocal,
  type ResultadoMapa,
} from "@/modules/mapa/actions";
import {
  loteDeVolta,
  semAlocacao,
  textoDaAlocacao,
} from "@/modules/mapa/alocacao";
import type { ItemAlocacao } from "@/modules/mapa/schemas";
import {
  QuadroAlocacao,
  type PedidoQuadro,
} from "@/modules/mapa/components/quadro-alocacao";
import {
  DialogoEstado,
  type ConfirmacaoEstado,
  type PedidoEstado,
} from "@/modules/mapa/components/dialogo-estado";
import {
  DialogoTransferencia,
  type ConfirmacaoTransferencia,
  type Pendente,
} from "@/modules/mapa/components/dialogo-transferencia";
import {
  DialogoTransferenciaLote,
  type ConfirmacaoLote,
  type DestinoDoLote,
} from "@/modules/mapa/components/dialogo-transferencia-lote";
import {
  DialogoAdicionarLocal,
  DialogoAdicionarObra,
  DialogoConcluirDesenho,
  type PedidoColocar,
} from "@/modules/mapa/components/dialogos-adicionar";
import {
  AlertasMapa,
  LegendaMapa,
} from "@/modules/mapa/components/alertas-mapa";
import { DrawerDiarista } from "@/modules/mapa/components/drawer-diarista";
import { DrawerLocacao } from "@/modules/mapa/components/drawer-locacao";
import {
  LocalizarNoMapa,
  normalizarBusca,
  type ItemLocalizavel,
} from "@/modules/mapa/components/localizar-no-mapa";
import { FichaEquipamento } from "@/modules/mapa/components/ficha-equipamento";
import { FichaLocal } from "@/modules/mapa/components/ficha-local";
import { FichaObjeto } from "@/modules/mapa/components/ficha-objeto";
import {
  MovimentarPilha,
  type PermissoesMovimentoPilha,
} from "@/modules/mapa/components/movimentar-pilha";
import { FichaPessoa } from "@/modules/mapa/components/ficha-pessoa";
import { FichaObra } from "@/modules/mapa/components/ficha-obra";
import {
  ESCALA_MAQUINA,
  RAIO_BONECO_M,
  TAMANHO_BONECO,
  RAIO_MINIMO_ANEL_PX,
  RAIO_MINIMO_BONECO_PX,
  RAIO_MINIMO_GIRO_PX,
  raioDoAnelM,
} from "@/modules/mapa/components/camadas";
import {
  formatarDistancia,
  medirRotaPelaEstrada,
  rotaPelaEstrada,
  type ResultadoRota,
} from "@/modules/mapa/components/rota-estrada";
import {
  MapaEmt,
  type Alvo,
  type ArrasteSolto,
  type CartaoNoMapa,
  type CenaBase,
  type Foco,
  type GiroMapa,
  type InclinacaoMapa,
  type ModoFundo,
  type TipoMotor,
} from "@/modules/mapa/components/mapa-emt";
import {
  FILTROS_VAZIOS,
  PainelMapa,
  type FiltrosMapa,
} from "@/modules/mapa/components/painel-mapa";
import {
  colarNoLocal,
  distanciaM,
  maquinaEm,
  marcosKm,
  medirTrecho,
  pontoNoKm,
  extensaoKm,
  posicaoDoNomeDaObra,
  resolverDestino,
  type ContextoDestino,
  type TrechoMedido,
} from "@/modules/mapa/geo";
import { extrasPorLocal } from "@/modules/mapa/dados";
import { pontoNaObra } from "@/modules/mapa/obra-destino";
import { afastamentoDoOperadorM } from "@/modules/mapa/medidas-modelos";
import { aplicarFretes } from "@/modules/mapa/fretes";
import { linhasDaFicha, objetosDoEstoque } from "@/modules/mapa/objetos";
import {
  destinoDaPessoa,
  pessoaNoFiltro,
  pessoaSemPosicaoNaTela,
  posicaoDoOperador,
} from "@/modules/mapa/pessoas";
import {
  destinoDaPessoaNoLote,
  pontosDoLote,
  rotuloDoLote,
} from "@/modules/mapa/lote";
import { ORDEM_ESTADOS, rotuloTipoLocalidade } from "@/modules/mapa/rotulos";
import {
  ROTULO_ESTADO,
  ROTULO_TIPO_AREA,
  type AlertaMapa,
  type ConfigGoogle,
  type AlvoObjeto,
  type CentroCustoOpcaoMapa,
  type EquipamentoMapa,
  type ObraMapa,
  type EstadoEfetivo,
  type EstadoMapa,
  type PermissoesMapa,
  type LocalidadeMapa,
  type PessoaMapa,
  type Posicao,
} from "@/modules/mapa/tipos";

/**
 * A tela do Mapa: o mapa 3D de um lado, o painel do outro, e aqui o estado que os dois dividem
 * (seleção, filtros, o arraste à espera de confirmação, as ações). Toda gravação passa por uma
 * Server Action que devolve o estado novo do mapa, então a tela nunca fica com dado velho depois
 * de confirmar.
 */

const ROTULO_MOTOR: Record<TipoMotor, string> = {
  "google-vetorial": "Google Maps vetorial + deck.gl",
  "google-raster": "Google Maps raster + deck.gl",
  tiles: "Tiles Esri + deck.gl",
};

/** Cruzeiro do Sul e os lotes da BR-364, quando não há trecho cadastrado para enquadrar. */
/** A pessoa posta num lugar: arrastada, tocada ("Posicionar") ou com a obra escolhida na ficha. */
type PedidoPessoa = {
  pessoa: PessoaMapa;
  /** Ponto solto ou tocado; null quando a máquina foi escolhida na ficha (ela pode não ter posição). */
  para: Posicao | null;
  sobre: EquipamentoMapa | null;
  /** Local onde a pessoa vai trabalhar (soltou dentro do raio dele, ou escolheu na ficha). */
  local: LocalidadeMapa | null;
  /** Obra escolhida na ficha como local de trabalho (só quando `local` é null). */
  obra?: ObraMapa | null;
};

/** Quanto tempo o toast de alocação fica com o "Desfazer" (o sucesso padrão some em 2 s). */
const DURACAO_DESFAZER = 8000;

const CHAVE_PAINEL = "erp-emt:mapa:painel";
/** Raio do anel de giro em volta da máquina (as miniaturas são 3x o tamanho real). */
const RAIO_GIRO_M = 45;
const RAIO_GIRO_USINA_M = 90;

/** Tela larga (md do Tailwind): a ficha abre ao lado do objeto, no mapa. */
const CONSULTA_TELA_LARGA = "(min-width: 768px)";
function assinarTelaLarga(aviso: () => void) {
  const mq = window.matchMedia(CONSULTA_TELA_LARGA);
  mq.addEventListener("change", aviso);
  return () => mq.removeEventListener("change", aviso);
}
const lerTelaLarga = () => window.matchMedia(CONSULTA_TELA_LARGA).matches;
const assinantesPainel = new Set<() => void>();
/** Reserva para quando o storage não existe (aba privada): vale só nesta visita. */
let painelNaMemoria: boolean | null = null;

function lerPainel(): boolean {
  try {
    const valor = window.localStorage.getItem(CHAVE_PAINEL);
    if (valor !== null) return valor !== "fechado";
  } catch {
    // sem storage: cai na memória
  }
  return painelNaMemoria ?? true;
}

function gravarPainel(aberto: boolean): void {
  painelNaMemoria = aberto;
  try {
    window.localStorage.setItem(CHAVE_PAINEL, aberto ? "aberto" : "fechado");
  } catch {
    // sem storage: fica a memória
  }
  for (const avisar of assinantesPainel) avisar();
}

function assinarPainel(avisar: () => void): () => void {
  assinantesPainel.add(avisar);
  return () => {
    assinantesPainel.delete(avisar);
  };
}

// Fundo (mapa ou satélite): fica neste navegador como o painel (16/10/2026: "sempre que eu
// atualizo a página sai do satélite e vai para o mapa").
const CHAVE_FUNDO = "erp-emt:mapa:fundo";
const assinantesFundo = new Set<() => void>();
let fundoNaMemoria: ModoFundo | null = null;

function lerFundo(): ModoFundo {
  try {
    const valor = window.localStorage.getItem(CHAVE_FUNDO);
    if (valor === "satelite" || valor === "mapa") return valor;
  } catch {
    // sem storage: cai na memória
  }
  return fundoNaMemoria ?? "mapa";
}

function gravarFundo(fundo: ModoFundo): void {
  fundoNaMemoria = fundo;
  try {
    window.localStorage.setItem(CHAVE_FUNDO, fundo);
  } catch {
    // sem storage: fica a memória
  }
  for (const avisar of assinantesFundo) avisar();
}

function assinarFundo(avisar: () => void): () => void {
  assinantesFundo.add(avisar);
  return () => {
    assinantesFundo.delete(avisar);
  };
}

const CENTRO_PADRAO: { pos: Posicao; zoom: number } = {
  pos: [-72.47, -7.745],
  zoom: 11.8,
};

function centroDosTrechos(estado: EstadoMapa): { pos: Posicao; zoom: number } {
  const pontos = estado.trechos.flatMap((t) => t.pontos);
  if (pontos.length === 0) return CENTRO_PADRAO;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pontos) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const extensao = Math.max(maxX - minX, maxY - minY);
  const zoom =
    extensao > 1.5 ? 9.5 : extensao > 0.8 ? 10.5 : extensao > 0.4 ? 11.3 : 12.3;
  return { pos: [(minX + maxX) / 2, (minY + maxY) / 2], zoom };
}

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Rumo desenhado: o escolhido na ficha ganha; sem ele, o da pista no km da máquina. */
function headingNoTrecho(
  e: EquipamentoMapa,
  medidos: ReadonlyMap<string, TrechoMedido>,
): number {
  if (e.rumoManual !== null) return e.rumoManual;
  if (e.trechoId && e.km !== null) {
    const m = medidos.get(e.trechoId);
    if (m) return pontoNoKm(m, e.km).heading;
  }
  return e.heading;
}

export interface TelaMapaProps {
  inicial: EstadoMapa;
  google: ConfigGoogle;
  permissoes: PermissoesMapa;
  /** Tanque, pilha ou depósito recém-criado no Estoque: a tela abre no "toque onde fica". */
  colocarInicial?: { alvo: AlvoObjeto; id: string } | null;
  /** Valor em estoque por id de tanque e pilha; nulo para quem não vê a Posição do Estoque. */
  valoresEstoque?: Record<string, number> | null;
  /** Entrada avulsa e saída no card da pilha: as permissões são as do Estoque. */
  movimentarPilha?: PermissoesMovimentoPilha;
  /** Centros de custo para a ficha da pessoa (vazio para quem não edita). */
  centrosCusto?: readonly CentroCustoOpcaoMapa[];
  /** frete.fretes/editar: a ficha da carreta em frete registra a chegada sem sair do mapa. */
  podeRegistrarChegada?: boolean;
}

export function TelaMapa({
  inicial,
  google,
  permissoes,
  colocarInicial = null,
  valoresEstoque = null,
  movimentarPilha = { entrada: false, saida: false },
  centrosCusto = [],
  podeRegistrarChegada = false,
}: TelaMapaProps) {
  const router = useRouter();
  const [estado, setEstado] = React.useState(inicial);
  const valoresDaFicha = React.useMemo(
    () => (valoresEstoque ? new Map(Object.entries(valoresEstoque)) : null),
    [valoresEstoque],
  );
  // Quando o servidor manda um estado novo (router.refresh), a tela adota (padrão "derivar na
  // renderização", sem efeito).
  const [inicialAnterior, setInicialAnterior] = React.useState(inicial);
  if (inicial !== inicialAnterior) {
    setInicialAnterior(inicial);
    setEstado(inicial);
  }

  // Relógio do mapa: a carreta em frete ou na volta anda no traçado a cada minuto (estimativa).
  // Sem frete aberto nem carreta voltando, o relógio fica parado: cada passo refaz a cena inteira.
  const [agora, setAgora] = React.useState(() => Date.now());
  const temCarretaAndando =
    estado.fretesEmRota.length > 0 || estado.carretasRetorno.length > 0;
  React.useEffect(() => {
    if (!temCarretaAndando) return;
    const t = setInterval(() => setAgora(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [temCarretaAndando]);
  // A frota como a tela mostra: a carreta com frete aberto vai para o ponto estimado da rota, e a
  // que já chegou, para o caminho de volta à pedreira.
  const {
    equipamentos: equipamentosVistos,
    freteDe,
    fretesVencidos,
    retornoDe,
  } = React.useMemo(
    () =>
      aplicarFretes(
        estado.equipamentos,
        estado.fretesEmRota,
        estado.carretasRetorno,
        agora,
      ),
    [estado.equipamentos, estado.fretesEmRota, estado.carretasRetorno, agora],
  );
  const pedreiras = React.useMemo(
    () =>
      estado.localidades
        .filter((l) => l.tipos.includes("pedreira"))
        .map((l) => ({ id: l.id, nome: l.nome })),
    [estado.localidades],
  );

  const [selecao, setSelecao] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [ficha, setFicha] = React.useState<Alvo | null>(null);
  // Ficha do local (tocar no nome dele no mapa); some quando outra ficha abre.
  const [localFicha, setLocalFicha] = React.useState<string | null>(null);
  // Ficha da obra (tocar no nome dela no mapa).
  const [obraFicha, setObraFicha] = React.useState<string | null>(null);
  // Ficha do tanque, pilha ou depósito (nome no mapa ou lista "sem lugar").
  const [objetoFicha, setObjetoFicha] = React.useState<string | null>(null);
  const abrirFicha = React.useCallback((alvo: Alvo) => {
    setLocalFicha(null);
    setObraFicha(null);
    setObjetoFicha(null);
    setFicha(alvo);
  }, []);
  // Obra sendo desenhada (pavimentação = linha, edificação = polígono) e, ao concluir, a
  // linha final (pela estrada, quando o serviço de rotas responde) esperando a confirmação.
  const [desenho, setDesenho] = React.useState<{
    obra: ObraMapa;
    forma: "trecho" | "area";
    substituir: boolean;
    pontos: Posicao[];
  } | null>(null);
  const [desenhoFinal, setDesenhoFinal] = React.useState<{
    pontos: Posicao[];
    seguiuEstrada: boolean;
  } | null>(null);
  const [concluindo, setConcluindo] = React.useState(false);
  /**
   * Ferramenta "Rota" (Tiago, 16/10/2026): toca a partida, toca o destino e o mapa mostra a menor
   * distância pela estrada. Tocar de novo muda o destino. A resposta só vale se a partida e o
   * destino ainda forem os mesmos pontos: a de um cálculo antigo que chegue depois é descartada.
   */
  const [rota, setRota] = React.useState<{
    origem: Posicao | null;
    destino: Posicao | null;
    resultado: ResultadoRota | null;
    calculando: boolean;
  } | null>(null);
  // Prévias que valem mais que o banco até gravar: raio do local e rumo da máquina.
  const [raioPrevio, setRaioPrevio] = React.useState<{
    id: string;
    raioM: number;
  } | null>(null);
  const [rumoPrevio, setRumoPrevio] = React.useState<{
    id: string;
    rumo: number;
  } | null>(null);
  const timerGiro = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // Giro do depósito: prévia na hora, grava 600 ms depois do último toque (como a máquina).
  const [rumoDepositoPrevio, setRumoDepositoPrevio] = React.useState<{
    id: string;
    rumo: number;
  } | null>(null);
  const timerGiroDeposito = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [giroMapa, setGiroMapa] = React.useState<GiroMapa | null>(null);
  const girarMapa = (delta: number | null) =>
    setGiroMapa((g) => ({ delta, chave: (g?.chave ?? 0) + 1 }));
  const [inclinacaoMapa, setInclinacaoMapa] =
    React.useState<InclinacaoMapa | null>(null);
  const inclinarMapa = (delta: number) =>
    setInclinacaoMapa((g) => ({ delta, chave: (g?.chave ?? 0) + 1 }));
  // Lista lateral recolhível; a escolha fica neste navegador (conveniência, não dado). A ficha
  // mora na lateral, então ficha aberta mostra a lateral mesmo com a lista recolhida.
  const telaLarga = React.useSyncExternalStore(
    assinarTelaLarga,
    lerTelaLarga,
    () => false,
  );
  const listaAberta = React.useSyncExternalStore(
    assinarPainel,
    lerPainel,
    () => true,
  );
  const fundo = React.useSyncExternalStore(
    assinarFundo,
    lerFundo,
    () => "mapa" as const,
  );
  const [inclinado, setInclinado] = React.useState(true);
  const [multi, setMulti] = React.useState(false);
  const [mostrarPessoas, setMostrarPessoas] = React.useState(true);
  const [mostrarRotulos, setMostrarRotulos] = React.useState(true);
  const [mostrarAreas, setMostrarAreas] = React.useState(true);
  const [filtros, setFiltros] = React.useState<FiltrosMapa>(FILTROS_VAZIOS);
  // "Mudou hoje": só o que teve movimentação desde 0h (lida em fn_mapa_avisos).
  const [soHoje, setSoHoje] = React.useState(false);
  const idsMudaramHoje = React.useMemo(
    () => new Set((estado.avisos?.mudancasHoje ?? []).map((m) => m.alvoId)),
    [estado.avisos],
  );
  // Frete cuja chegada espera a confirmação (ficha da carreta).
  const [chegada, setChegada] = React.useState<{
    freteId: string;
    placa: string;
  } | null>(null);
  const [posicionando, setPosicionando] = React.useState<string | null>(null);
  // Pessoa esperando o toque no mapa (quem ainda não tem lugar não tem o que arrastar).
  const [posicionandoPessoa, setPosicionandoPessoa] = React.useState<
    string | null
  >(null);
  // "Adicionar obra" / "Adicionar localização": diálogo aberto, pedido esperando o toque no
  // mapa e o ponto tocado esperando a confirmação.
  const [adicionando, setAdicionando] = React.useState<"obra" | "local" | null>(
    null,
  );
  const [colocando, setColocando] = React.useState<PedidoColocar | null>(() => {
    if (!colocarInicial) return null;
    const objeto = objetosDoEstoque(
      inicial.tanques,
      inicial.pilhas,
      inicial.depositos,
    ).find((o) => o.id === colocarInicial.id && o.alvo === colocarInicial.alvo);
    return objeto
      ? {
          tipo: "objeto",
          alvo: objeto.alvo,
          id: objeto.id,
          rotulo: objeto.nome,
        }
      : null;
  });
  const [pontoColocar, setPontoColocar] = React.useState<Posicao | null>(null);
  const [pendente, setPendente] = React.useState<Pendente | null>(null);
  // "Transferir" da seleção múltipla: as máquinas e as pessoas selecionadas, juntas.
  const [lote, setLote] = React.useState<{
    equipamentos: EquipamentoMapa[];
    pessoas: PessoaMapa[];
  } | null>(null);
  const [pendentePessoa, setPendentePessoa] =
    React.useState<PedidoPessoa | null>(null);
  // Quadro de alocação aberto (v1.30): tudo, só a seleção, ou só quem está sem alocação.
  const [quadro, setQuadro] = React.useState<PedidoQuadro | null>(null);
  const [pedidoEstado, setPedidoEstado] = React.useState<PedidoEstado | null>(
    null,
  );
  const [encerrando, setEncerrando] = React.useState<EquipamentoMapa | null>(
    null,
  );
  const [fimLocacao, setFimLocacao] = React.useState("");
  const [drawerLocacao, setDrawerLocacao] = React.useState(false);
  const [drawerDiarista, setDrawerDiarista] = React.useState(false);
  const [tirando, setTirando] = React.useState<PessoaMapa | null>(null);
  const [foco, setFoco] = React.useState<Foco | null>(null);
  const [motor, setMotor] = React.useState<{
    tipo: TipoMotor;
    aviso: string | null;
  } | null>(null);
  const [salvando, setSalvando] = React.useState(false);
  const [atualizando, setAtualizando] = React.useState(false);
  const [centroInicial] = React.useState(() => centroDosTrechos(inicial));

  const trechosMedidos = React.useMemo(
    () => estado.trechos.map(medirTrecho),
    [estado.trechos],
  );
  const medidosPorId = React.useMemo(
    () => new Map(trechosMedidos.map((m) => [m.trecho.id, m])),
    [trechosMedidos],
  );
  const marcos = React.useMemo(
    // De 1 em 1 km; quem desenha mostra só os do passo do zoom (passoDosMarcos).
    () => marcosKm(trechosMedidos, 1),
    [trechosMedidos],
  );
  const modelos = React.useMemo(
    () => new Map(estado.modelos.map((m) => [m.chave, m])),
    [estado.modelos],
  );
  const ctxDestino = React.useMemo<ContextoDestino>(
    () => ({
      trechos: trechosMedidos,
      areas: estado.areas,
      localidades: estado.localidades,
      snapTracadoM: estado.config.snapTracadoM,
      snapLocalM: estado.config.snapLocalM,
    }),
    [
      trechosMedidos,
      estado.areas,
      estado.localidades,
      estado.config.snapTracadoM,
      estado.config.snapLocalM,
    ],
  );

  const obras = React.useMemo(() => {
    const mapa = new Map<string, string>();
    for (const t of estado.trechos)
      if (t.obraId) mapa.set(t.obraId, t.obraNome);
    for (const e of equipamentosVistos)
      if (e.obraId && !mapa.has(e.obraId)) mapa.set(e.obraId, e.obraNome);
    return [...mapa]
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [estado.trechos, equipamentosVistos]);

  // Busca e obra recortam tudo; o estado recorta só as listas e a cena (as contagens mostram o todo).
  const baseFiltrada = React.useMemo(() => {
    const termo = normalizar(filtros.busca.trim());
    return equipamentosVistos.filter((e) => {
      if (filtros.obraId && e.obraId !== filtros.obraId) return false;
      if (soHoje && !idsMudaramHoje.has(e.id)) return false;
      if (!termo) return true;
      return normalizar(
        [
          e.codigo,
          e.descricao,
          e.tipo,
          e.marca,
          e.modelo,
          e.placa,
          e.operadorNome,
        ].join(" "),
      ).includes(termo);
    });
  }, [equipamentosVistos, filtros.busca, filtros.obraId, soHoje, idsMudaramHoje]);

  const contagens = React.useMemo(() => {
    const c = Object.fromEntries(ORDEM_ESTADOS.map((k) => [k, 0])) as Record<
      EstadoEfetivo,
      number
    >;
    for (const e of baseFiltrada) c[e.estado] += 1;
    return c;
  }, [baseFiltrada]);

  const filtrados = React.useMemo(
    () =>
      filtros.estado
        ? baseFiltrada.filter((e) => e.estado === filtros.estado)
        : baseFiltrada,
    [baseFiltrada, filtros.estado],
  );

  /** Posições que valem mais que as do banco: o arraste solto (ou o posicionar) à espera do OK. */
  const posicoesPendentes = React.useMemo(() => {
    const mapa = new Map<string, Posicao>();
    if (pendente) {
      for (const item of pendente.itens) {
        const pos =
          item.destino.tipo === "trecho" ? item.destino.pos : item.para;
        mapa.set(item.equipamento.id, pos);
        for (const p of estado.pessoas)
          if (p.equipamentoId === item.equipamento.id) mapa.set(p.id, pos);
      }
    }
    if (pendentePessoa) {
      const pos = pendentePessoa.sobre
        ? pendentePessoa.sobre.pos
        : (pendentePessoa.para ?? pendentePessoa.local?.pos ?? null);
      if (pos) mapa.set(pendentePessoa.pessoa.id, pos);
    }
    return mapa;
  }, [pendente, pendentePessoa, estado.pessoas]);

  const extrasDoLocal = React.useMemo(
    () => extrasPorLocal(estado.tanques, estado.depositos),
    [estado.tanques, estado.depositos],
  );
  const obrasNoMapa = React.useMemo(
    () => estado.obras.flatMap((o) => (o.pos ? [{ ...o, pos: o.pos }] : [])),
    [estado.obras],
  );
  const objetos = React.useMemo(
    () => objetosDoEstoque(estado.tanques, estado.pilhas, estado.depositos),
    [estado.tanques, estado.pilhas, estado.depositos],
  );
  const objetosNoMapa = React.useMemo(
    () =>
      objetos.flatMap((o) =>
        o.pos
          ? [
              rumoDepositoPrevio?.id === o.id
                ? { ...o, pos: o.pos, rumo: rumoDepositoPrevio.rumo }
                : { ...o, pos: o.pos },
            ]
          : [],
      ),
    [objetos, rumoDepositoPrevio],
  );
  const objetosSemLugar = React.useMemo(
    () =>
      objetos
        .filter((o) => !o.pos)
        .map((o) => ({
          id: o.id,
          nome: o.nome,
          tipo:
            o.alvo === "tanque"
              ? "tanque"
              : o.alvo === "pilha"
                ? "pilha"
                : "depósito",
        })),
    [objetos],
  );
  const rotulosObra = React.useMemo(
    () =>
      estado.obras.flatMap((o) => {
        const pos = posicaoDoNomeDaObra(
          o.pos,
          trechosMedidos.filter((t) => t.trecho.obraId === o.id),
          estado.areas.filter(
            (a) => a.obraId === o.id && a.tipo === "edificacao",
          ),
        );
        return pos ? [{ id: o.id, nome: o.nome, pos }] : [];
      }),
    [estado.obras, estado.areas, trechosMedidos],
  );
  const opcoesObra = React.useMemo(
    () =>
      [...estado.obras]
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
        .map((o) => ({ id: o.id, nome: o.nome })),
    [estado.obras],
  );
  // "Transferir" da ficha: para onde a máquina pode ir sem arraste. Obra (no ponto do nome dela
  // no mapa), local (no ponto dele) ou área (no centro); num anel em volta se já houver máquina.
  const lugaresDaFicha = React.useMemo(() => {
    const porNome = (a: { rotulo: string }, b: { rotulo: string }) =>
      a.rotulo.localeCompare(b.rotulo, "pt-BR");
    const deObras = rotulosObra
      .map((o) => ({
        chave: `obra:${o.id}`,
        rotulo: `Obra · ${o.nome}`,
        pos: o.pos,
        obra: o.id,
      }))
      .sort(porNome);
    const deLocais = estado.localidades
      .map((l) => ({
        chave: `local:${l.id}`,
        rotulo: `Local · ${l.nome} (${rotuloTipoLocalidade(l.tipo).toLowerCase()})`,
        pos: l.pos,
        obra: l.obraId,
      }))
      .sort(porNome);
    const deAreas = estado.areas
      .flatMap((a) =>
        a.centro
          ? [
              {
                chave: `area:${a.id}`,
                rotulo: `Área · ${a.nome} (${(ROTULO_TIPO_AREA[a.tipo] ?? a.tipo).toLowerCase()})`,
                pos: a.centro,
                obra: a.obraId,
              },
            ]
          : [],
      )
      .sort(porNome);
    return [...deObras, ...deLocais, ...deAreas];
  }, [rotulosObra, estado.localidades, estado.areas]);
  const levarPara = React.useCallback(
    (chave: string) => {
      if (pendente?.modo !== "destino") return null;
      const lugar = lugaresDaFicha.find((l) => l.chave === chave);
      if (!lugar) return null;
      const equipamento = pendente.principal;
      const ocupados = equipamentosVistos.flatMap((e) =>
        e.id !== equipamento.id && e.pos ? [e.pos] : [],
      );
      const para = pontoNaObra(lugar.pos, ocupados);
      return {
        itens: [
          {
            equipamento,
            de: equipamento.pos,
            para,
            destino: resolverDestino(para, ctxDestino),
          },
        ],
        obraSugerida: lugar.obra,
      };
    },
    [pendente, lugaresDaFicha, equipamentosVistos, ctxDestino],
  );
  const desenhoDe = React.useCallback(
    (obraId: string) => ({
      trechos: estado.trechos.filter((t) => t.obraId === obraId).length,
      areas: estado.areas.filter(
        (a) => a.obraId === obraId && a.tipo === "edificacao",
      ).length,
    }),
    [estado.trechos, estado.areas],
  );

  // Anel de giro: uma máquina só selecionada, com a ficha aberta, no mapa e editável.
  const anelGiro = React.useMemo(() => {
    if (
      !permissoes.editar ||
      ficha?.tipo !== "equipamento" ||
      selecao.size !== 1
    )
      return null;
    const e = equipamentosVistos.find((x) => x.id === ficha.id);
    if (!e || !e.pos || e.fontePosicao !== "manual" || !selecao.has(e.id))
      return null;
    return {
      id: e.id,
      pos: e.pos,
      raioM: e.modelo3d === "usina_asfalto" ? RAIO_GIRO_USINA_M : RAIO_GIRO_M,
    };
  }, [permissoes.editar, ficha, selecao, equipamentosVistos]);

  const cena = React.useMemo<CenaBase>(() => {
    const equipamentos = filtrados.flatMap((e) => {
      const pos = posicoesPendentes.get(e.id) ?? e.pos;
      if (!pos) return [];
      const item = pendente?.itens.find((i) => i.equipamento.id === e.id);
      const heading =
        rumoPrevio?.id === e.id
          ? rumoPrevio.rumo
          : item && item.destino.tipo === "trecho" && e.rumoManual === null
            ? item.destino.heading
            : headingNoTrecho(e, medidosPorId);
      return [{ ...e, pos, heading }];
    });
    const idsNaCena = new Set(equipamentos.map((e) => e.id));
    const pessoas = estado.pessoas.flatMap((p) => {
      const pos = posicoesPendentes.get(p.id) ?? p.pos;
      // "Mudou hoje": a pessoa que mudou, ou que opera máquina que mudou.
      if (
        soHoje &&
        !idsMudaramHoje.has(p.id) &&
        !(p.equipamentoId && idsMudaramHoje.has(p.equipamentoId))
      )
        return [];
      // Operador de máquina filtrada para fora some junto com ela.
      if (
        p.equipamentoId &&
        !idsNaCena.has(p.equipamentoId) &&
        equipamentosVistos.some((e) => e.id === p.equipamentoId)
      )
        return [];
      // Operador: ao lado esquerdo da máquina (onde ela está na cena, inclusive arrastada). A
      // pessoa que está sendo movida segue o arraste, não a máquina de antes.
      const maquina =
        p.equipamentoId && pendentePessoa?.pessoa.id !== p.id
          ? equipamentos.find((e) => e.id === p.equipamentoId)
          : undefined;
      if (maquina)
        return [
          {
            ...p,
            pos: posicaoDoOperador(
              maquina.pos,
              maquina.heading,
              afastamentoDoOperadorM(
                maquina.modelo3d,
                (modelos.get(maquina.modelo3d)?.escala ?? 1) * ESCALA_MAQUINA,
                TAMANHO_BONECO,
              ),
            ),
          },
        ];
      // Sem ponto próprio, só aparece ao lado da máquina (acima): a carreta em frete ou na volta
      // tem ponto só na tela, pela rota, e o motorista dela não tem nenhum no banco.
      if (!pos) return [];
      return [{ ...p, pos }];
    });
    // Rota de cada frete aberto cuja carreta está na cena (filtrou a carreta, some a rota). Frete
    // vencido pela marcação da ficha (a carreta já chegou) não tem rota a desenhar.
    const rotasFrete = estado.fretesEmRota.flatMap((f) =>
      f.caminho.length >= 2 &&
      !fretesVencidos.has(f.id) &&
      (!f.equipamentoId || idsNaCena.has(f.equipamentoId))
        ? [{ id: f.id, caminho: f.caminho }]
        : [],
    );
    // E a volta de cada carreta em deslocamento (na pedreira ou parada pela ficha, sem rota).
    for (const e of equipamentosVistos) {
      const r = retornoDe.get(e.id);
      if (
        r &&
        e.estado === "em_deslocamento" &&
        r.caminho.length >= 2 &&
        idsNaCena.has(e.id)
      )
        rotasFrete.push({ id: `volta-${r.freteId}`, caminho: r.caminho });
    }
    return {
      equipamentos,
      pessoas,
      trechos: trechosMedidos,
      rotasFrete,
      marcos,
      areas: estado.areas,
      localidades: raioPrevio
        ? estado.localidades.map((l) =>
            l.id === raioPrevio.id ? { ...l, raioM: raioPrevio.raioM } : l,
          )
        : estado.localidades,
      extrasDoLocal,
      obras: obrasNoMapa,
      rotulosObra,
      objetos: objetosNoMapa,
      anelGiro,
      desenho: desenhoFinal
        ? { forma: desenho?.forma ?? "trecho", pontos: desenhoFinal.pontos }
        : desenho
          ? { forma: desenho.forma, pontos: desenho.pontos }
          : null,
      rota: rota?.origem
        ? {
            origem: rota.origem,
            destino: rota.destino,
            caminho: rota.resultado?.caminho ?? [],
          }
        : null,
      modelos,
      snapLocalM: estado.config.snapLocalM,
      mostrarPessoas,
      mostrarRotulos,
      mostrarAreas,
    };
  }, [
    filtrados,
    posicoesPendentes,
    pendente,
    pendentePessoa,
    medidosPorId,
    estado.pessoas,
    equipamentosVistos,
    estado.fretesEmRota,
    fretesVencidos,
    retornoDe,
    estado.areas,
    estado.localidades,
    raioPrevio,
    rumoPrevio,
    extrasDoLocal,
    obrasNoMapa,
    rotulosObra,
    objetosNoMapa,
    anelGiro,
    desenho,
    desenhoFinal,
    rota,
    estado.config.snapLocalM,
    trechosMedidos,
    marcos,
    modelos,
    mostrarPessoas,
    mostrarRotulos,
    mostrarAreas,
    soHoje,
    idsMudaramHoje,
  ]);

  const semPosicao = React.useMemo(
    () => filtrados.filter((e) => e.pos === null),
    [filtrados],
  );
  const noMapa = React.useMemo(
    () => filtrados.filter((e) => e.pos !== null),
    [filtrados],
  );
  const equipamentoFicha =
    ficha?.tipo === "equipamento"
      ? (equipamentosVistos.find((e) => e.id === ficha.id) ?? null)
      : null;
  // Com o ponto da cena: o operador está ao lado da máquina, mesmo sem ponto no banco (carreta em
  // frete), e a ficha centraliza nele.
  const pessoaFicha =
    ficha?.tipo === "pessoa"
      ? (cena.pessoas.find((p) => p.id === ficha.id) ??
        estado.pessoas.find((p) => p.id === ficha.id) ??
        null)
      : null;
  const posicionandoEquipamento = posicionando
    ? (equipamentosVistos.find((e) => e.id === posicionando) ?? null)
    : null;
  const pessoaPosicionando = posicionandoPessoa
    ? (estado.pessoas.find((p) => p.id === posicionandoPessoa) ?? null)
    : null;
  // Listas de pessoas do painel, recortadas pela busca e pela obra da barra (a cena não).
  const pessoasNaLista = React.useMemo(
    () =>
      cena.pessoas.filter((p) =>
        pessoaNoFiltro(p, { busca: filtros.busca, obraId: filtros.obraId }),
      ),
    [cena.pessoas, filtros.busca, filtros.obraId],
  );
  // Máquinas com ponto na tela (a carreta em frete ganha o da rota): o operador delas aparece ao lado.
  const maquinasNoMapa = React.useMemo(
    () => new Set(equipamentosVistos.filter((e) => e.pos).map((e) => e.id)),
    [equipamentosVistos],
  );
  const pessoasSemPosicao = React.useMemo(
    () =>
      estado.pessoas.filter(
        (p) =>
          pessoaSemPosicaoNaTela(
            p,
            posicoesPendentes.has(p.id),
            maquinasNoMapa,
          ) &&
          pessoaNoFiltro(p, { busca: filtros.busca, obraId: filtros.obraId }),
      ),
    [
      estado.pessoas,
      posicoesPendentes,
      maquinasNoMapa,
      filtros.busca,
      filtros.obraId,
    ],
  );
  // Sem máquina, local, obra nem área no Mapa: vão para o topo do painel com "Alocar".
  const pessoasSemAlocacao = React.useMemo(
    () => estado.pessoas.filter(semAlocacao).length,
    [estado.pessoas],
  );
  const tiposConhecidos = React.useMemo(
    () =>
      [
        ...new Set(
          [...equipamentosVistos, ...estado.foraDoMapa]
            .map((e) => e.tipo)
            .filter(Boolean),
        ),
      ].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [equipamentosVistos, estado.foraDoMapa],
  );

  const codigoDe = React.useMemo(
    () => new Map(equipamentosVistos.map((e) => [e.id, e.codigo])),
    [equipamentosVistos],
  );

  /** Aplica a resposta de uma action: estado novo + toast. Devolve se deu certo. */
  const aplicar = React.useCallback(
    (resultado: ResultadoMapa, sucesso: string): boolean => {
      if ("erro" in resultado) {
        toast.error(resultado.erro);
        return false;
      }
      if (resultado.estado) setEstado(resultado.estado);
      toast.success(sucesso);
      return true;
    },
    [],
  );

  /**
   * Alocação que grava na hora (v1.30): manda o lote, troca o estado e oferece "Desfazer" no toast,
   * que manda o lote de volta montado com o antes de agora (pessoas e operadores das máquinas).
   */
  const desfazerCom = React.useCallback(
    (volta: ItemAlocacao[]) => ({
      label: "Desfazer",
      onClick: () => {
        void (async () => {
          setSalvando(true);
          try {
            const r = await alocar({
              itens: volta,
              data: estado.hoje,
              motivo: "Desfazer",
            });
            aplicar(r, "Desfeito");
          } finally {
            setSalvando(false);
          }
        })();
      },
    }),
    [estado.hoje, aplicar],
  );

  const voltaDe = React.useCallback(
    (itens: readonly ItemAlocacao[]) =>
      loteDeVolta(
        itens,
        new Map(estado.pessoas.map((p) => [p.id, p])),
        new Map(equipamentosVistos.map((e) => [e.id, e.operadorId])),
      ),
    [estado.pessoas, equipamentosVistos],
  );

  const alocarComDesfazer = React.useCallback(
    async (itens: ItemAlocacao[], texto?: string): Promise<boolean> => {
      if (itens.length === 0) return true;
      const volta = voltaDe(itens);
      const mensagem =
        texto ??
        textoDaAlocacao(itens, {
          pessoa: (id) => estado.pessoas.find((p) => p.id === id),
          maquina: (id) => equipamentosVistos.find((e) => e.id === id),
          nomeDoLocal: (id) =>
            estado.localidades.find((l) => l.id === id)?.nome,
        });
      setSalvando(true);
      try {
        const r = await alocar({ itens, data: estado.hoje });
        if ("erro" in r) {
          toast.error(r.erro);
          return false;
        }
        if (r.estado) setEstado(r.estado);
        if (r.total === 0) {
          toast.info("Nada mudou: já estava assim.");
          return true;
        }
        toast.success(mensagem, {
          duration: DURACAO_DESFAZER,
          action: desfazerCom(volta),
        });
        return true;
      } finally {
        setSalvando(false);
      }
    },
    [voltaDe, estado.pessoas, estado.localidades, estado.hoje, equipamentosVistos, desfazerCom],
  );

  /**
   * Pessoa solta, tocada ou com obra escolhida na ficha: grava direto, com Desfazer. O diálogo
   * fica só para o que tira a pessoa da obra em que está (Tiago, 17/10/2026).
   */
  const pessoaNoLugar = React.useCallback(
    async (pedido: PedidoPessoa) => {
      const { pessoa, para, sobre, local, obra = null } = pedido;
      const obraDestino = sobre
        ? sobre.obraId
        : local
          ? local.obraId
          : (obra?.id ?? null);
      if (obraDestino && pessoa.obraId && obraDestino !== pessoa.obraId) {
        setPendentePessoa(pedido);
        return;
      }
      if (sobre) {
        if (sobre.id !== pessoa.equipamentoId)
          await alocarComDesfazer([
            { colaboradorId: pessoa.id, equipamentoId: sobre.id },
          ]);
        setPosicionandoPessoa(null);
        return;
      }
      const destino = destinoDaPessoa(para, local, obra);
      if (!destino) return;
      // O que o mover faz com a pessoa, para o Desfazer saber o que devolver.
      const efeito: ItemAlocacao = {
        colaboradorId: pessoa.id,
        ...(local
          ? { localidadeId: local.id }
          : obra
            ? { obraId: obra.id }
            : { localidadeId: null }),
        ...(pessoa.equipamentoId ? { equipamentoId: null } : {}),
      };
      const volta = voltaDe([efeito]);
      setSalvando(true);
      try {
        const r = await moverPessoas({
          ids: [pessoa.id],
          destino,
          data: estado.hoje,
        });
        if ("erro" in r) {
          toast.error(r.erro);
          return;
        }
        if (r.estado) setEstado(r.estado);
        setPosicionandoPessoa(null);
        toast.success(
          local
            ? `${pessoa.nome} trabalha em ${local.nome}`
            : obra
              ? `${pessoa.nome} trabalha na obra ${obra.nome}`
              : `${pessoa.nome} realocado`,
          { duration: DURACAO_DESFAZER, action: desfazerCom(volta) },
        );
      } finally {
        setSalvando(false);
      }
    },
    [alocarComDesfazer, voltaDe, desfazerCom, estado.hoje],
  );

  const atualizar = React.useCallback(async () => {
    setAtualizando(true);
    try {
      const r = await recarregarEstado();
      if ("erro" in r) toast.error(r.erro);
      else setEstado(r.estado);
    } finally {
      setAtualizando(false);
    }
  }, []);

  const focar = React.useCallback((pos: Posicao, zoom?: number) => {
    setFoco((f) => ({ pos, zoom, chave: (f?.chave ?? 0) + 1 }));
  }, []);

  const selecionar = React.useCallback(
    (alvo: Alvo | null, multiTecla: boolean) => {
      if (!alvo) {
        setSelecao(new Set());
        setFicha(null);
        return;
      }
      // Pessoa esperando o toque: tocar numa máquina assinala a pessoa como operadora dela (o
      // toque na máquina não chega ao "clicar no mapa", ele seleciona).
      if (pessoaPosicionando && alvo.tipo === "equipamento") {
        const sobre = cena.equipamentos.find((e) => e.id === alvo.id);
        if (sobre) {
          setPendentePessoa({
            pessoa: pessoaPosicionando,
            para: sobre.pos,
            sobre,
            local: null,
          });
          return;
        }
      }
      // Pessoa também entra na seleção múltipla (o id dela não colide com o de máquina): a cena
      // já pinta quem está em `selecao`, e o "Transferir" do lote leva as duas juntas.
      if (alvo.tipo === "equipamento" || multi || multiTecla) {
        setSelecao((atual) => {
          if (multi || multiTecla) {
            const nova = new Set(atual);
            if (nova.has(alvo.id)) nova.delete(alvo.id);
            else nova.add(alvo.id);
            return nova;
          }
          return new Set([alvo.id]);
        });
      }
      // Com a seleção múltipla ligada, a ficha não abre: só a barra do lote (Tiago, 17/10/2026).
      if (!multi) abrirFicha(alvo);
    },
    [multi, abrirFicha, pessoaPosicionando, cena.equipamentos],
  );

  const soltar = React.useCallback(
    (arraste: ArrasteSolto) => {
      if (!permissoes.editar) return;
      if (arraste.principal.tipo === "pessoa") {
        const item = arraste.itens.find(
          (i) => i.alvo.id === arraste.principal.id,
        );
        const pessoa = estado.pessoas.find(
          (p) => p.id === arraste.principal.id,
        );
        if (!item || !pessoa) return;
        const sobre = maquinaEm(item.para, cena.equipamentos);
        void pessoaNoLugar({
          pessoa,
          para: item.para,
          sobre,
          // Soltou dentro do raio de um local: a pessoa passa a trabalhar nele.
          local: sobre
            ? null
            : (colarNoLocal(
                item.para,
                estado.localidades,
                estado.config.snapLocalM,
              )?.local ?? null),
        });
        return;
      }
      const itens = arraste.itens.flatMap((i) => {
        if (i.alvo.tipo !== "equipamento") return [];
        const equipamento = equipamentosVistos.find((e) => e.id === i.alvo.id);
        if (!equipamento) return [];
        if (equipamento.fontePosicao === "gps") {
          toast.warning(
            `${equipamento.codigo} tem posição por GPS e não pode ser arrastado.`,
          );
          return [];
        }
        if (equipamento.fontePosicao === "frete") {
          toast.warning(
            equipamento.estado === "em_frete"
              ? `${equipamento.codigo} está em frete: a posição segue a rota até a chegada ser lançada no Frete.`
              : `${equipamento.codigo} segue a volta do Frete para a pedreira: troque a pedreira ou marque como parado na ficha.`,
          );
          return [];
        }
        return [
          {
            equipamento,
            de: i.de,
            para: i.para,
            destino: resolverDestino(i.para, ctxDestino),
          },
        ];
      });
      const principal =
        itens.find((i) => i.equipamento.id === arraste.principal.id)
          ?.equipamento ?? itens[0]?.equipamento;
      if (!principal) return;
      setPendente({ modo: "arraste", principal, itens });
    },
    [
      permissoes.editar,
      estado.pessoas,
      estado.localidades,
      estado.config.snapLocalM,
      equipamentosVistos,
      cena.equipamentos,
      ctxDestino,
      pessoaNoLugar,
    ],
  );

  const calcularRota = React.useCallback(
    async (origem: Posicao, destino: Posicao) => {
      const resultado = await medirRotaPelaEstrada(origem, destino);
      setRota((r) =>
        r && r.origem === origem && r.destino === destino
          ? { ...r, resultado, calculando: false }
          : r,
      );
    },
    [],
  );

  const alternarRota = React.useCallback(() => {
    setRota((r) =>
      r
        ? null
        : { origem: null, destino: null, resultado: null, calculando: false },
    );
  }, []);

  const clicarMapa = React.useCallback(
    (pos: Posicao) => {
      if (rota) {
        if (!rota.origem) {
          setRota({ ...rota, origem: pos });
          return;
        }
        setRota({ ...rota, destino: pos, resultado: null, calculando: true });
        void calcularRota(rota.origem, pos);
        return;
      }
      if (desenho) {
        setDesenho((d) => (d ? { ...d, pontos: [...d.pontos, pos] } : d));
        return;
      }
      if (colocando) {
        setPontoColocar(pos);
        return;
      }
      if (pessoaPosicionando) {
        // Como soltar a pessoa arrastada: numa máquina vira operador, no raio de um local fica nele.
        const sobre = maquinaEm(pos, cena.equipamentos);
        void pessoaNoLugar({
          pessoa: pessoaPosicionando,
          para: pos,
          sobre,
          local: sobre
            ? null
            : (colarNoLocal(pos, estado.localidades, estado.config.snapLocalM)
                ?.local ?? null),
        });
        return;
      }
      if (!posicionandoEquipamento) return;
      setPendente({
        modo: "posicionar",
        principal: posicionandoEquipamento,
        itens: [
          {
            equipamento: posicionandoEquipamento,
            de: null,
            para: pos,
            destino: resolverDestino(pos, ctxDestino),
          },
        ],
      });
    },
    [
      posicionandoEquipamento,
      pessoaPosicionando,
      cena.equipamentos,
      estado.localidades,
      estado.config.snapLocalM,
      ctxDestino,
      colocando,
      desenho,
      rota,
      calcularRota,
      pessoaNoLugar,
    ],
  );

  const escolherNoMapa = React.useCallback((pedido: PedidoColocar) => {
    setAdicionando(null);
    setPosicionando(null);
    setPosicionandoPessoa(null);
    setColocando(pedido);
    toast.info(
      `Toque no mapa onde fica ${pedido.tipo === "obra" ? pedido.obra.nome : pedido.rotulo}.`,
    );
  }, []);

  const cancelarColocar = React.useCallback(() => {
    setColocando(null);
    setPontoColocar(null);
  }, []);

  const confirmarColocar = React.useCallback(async (): Promise<boolean> => {
    if (!colocando || !pontoColocar) return true;
    const [lng, lat] = pontoColocar;
    const r =
      colocando.tipo === "obra"
        ? await posicionarObra({ obraId: colocando.obra.id, lng, lat })
        : colocando.tipo === "objeto"
          ? await posicionarObjeto({
              alvo: colocando.alvo,
              id: colocando.id,
              lng,
              lat,
            })
          : await colocarLocal({
              localidadeId: colocando.localidadeId,
              nome: colocando.nome,
              tipos: colocando.tipos,
              obraId: colocando.obraId,
              vincular: colocando.vincular,
              lng,
              lat,
            });
    const ok = aplicar(
      r,
      colocando.tipo === "obra"
        ? `${colocando.obra.nome} no mapa`
        : `${colocando.rotulo} no mapa`,
    );
    if (ok) {
      cancelarColocar();
      // Veio da criação no Estoque: limpa o ?colocar= para um recarregar não pedir de novo.
      if (colocarInicial) router.replace("/mapa");
    }
    return ok;
  }, [
    colocando,
    pontoColocar,
    aplicar,
    cancelarColocar,
    colocarInicial,
    router,
  ]);

  const ligarAoLocal = React.useCallback(
    async (
      alvo: "tanque" | "deposito",
      id: string,
      localidadeId: string,
    ): Promise<boolean> => {
      const r = await vincularLocal({ alvo, id, localidadeId });
      const local = estado.localidades.find((l) => l.id === localidadeId);
      return aplicar(r, `Ligado a ${local?.nome ?? "local"}`);
    },
    [aplicar, estado.localidades],
  );

  const clicarLocal = React.useCallback((id: string) => {
    setFicha(null);
    setObraFicha(null);
    setObjetoFicha(null);
    setRaioPrevio(null);
    setLocalFicha(id);
  }, []);

  const clicarObra = React.useCallback((id: string) => {
    setFicha(null);
    setLocalFicha(null);
    setObjetoFicha(null);
    setObraFicha(id);
  }, []);

  const clicarObjeto = React.useCallback((id: string) => {
    setFicha(null);
    setLocalFicha(null);
    setObraFicha(null);
    setObjetoFicha(id);
  }, []);

  const comecarDesenho = React.useCallback(
    (obra: ObraMapa, forma: "trecho" | "area", substituir: boolean) => {
      setAdicionando(null);
      setPosicionando(null);
      setPosicionandoPessoa(null);
      setColocando(null);
      setDesenhoFinal(null);
      setDesenho({ obra, forma, substituir, pontos: [] });
      toast.info(
        forma === "trecho"
          ? `Toque o ponto inicial de ${obra.nome}, as curvas e o ponto final; depois Concluir.`
          : `Toque os cantos de ${obra.nome} em volta (4 ou mais); depois Concluir.`,
      );
    },
    [],
  );

  const cancelarDesenho = React.useCallback(() => {
    setDesenho(null);
    setDesenhoFinal(null);
  }, []);

  const concluirDesenho = React.useCallback(async () => {
    if (!desenho) return;
    if (desenho.forma === "area") {
      setDesenhoFinal({ pontos: desenho.pontos, seguiuEstrada: false });
      return;
    }
    setConcluindo(true);
    try {
      const pelaEstrada = await rotaPelaEstrada(desenho.pontos);
      setDesenhoFinal({
        pontos: pelaEstrada ?? desenho.pontos,
        seguiuEstrada: pelaEstrada !== null,
      });
    } finally {
      setConcluindo(false);
    }
  }, [desenho]);

  const salvarDesenho = React.useCallback(
    async (dados: {
      rodovia: string;
      kmInicial: number;
      kmFinal: number;
    }): Promise<boolean> => {
      if (!desenho || !desenhoFinal) return true;
      const r =
        desenho.forma === "trecho"
          ? await desenharObra({
              forma: "trecho",
              obraId: desenho.obra.id,
              pontos: desenhoFinal.pontos,
              rodovia: dados.rodovia || undefined,
              kmInicial: dados.kmInicial,
              kmFinal: dados.kmFinal,
              substituir: desenho.substituir,
            })
          : await desenharObra({
              forma: "area",
              obraId: desenho.obra.id,
              pontos: desenhoFinal.pontos,
              substituir: desenho.substituir,
            });
      const ok = aplicar(r, `${desenho.obra.nome} desenhada no mapa`);
      if (ok) cancelarDesenho();
      return ok;
    },
    [desenho, desenhoFinal, aplicar, cancelarDesenho],
  );

  const objetoDaFicha = objetoFicha
    ? (objetos.find((o) => o.id === objetoFicha) ?? null)
    : null;

  const obraDaFicha = obraFicha
    ? (estado.obras.find((o) => o.id === obraFicha) ?? null)
    : null;

  const localDaFicha = localFicha
    ? (estado.localidades.find((l) => l.id === localFicha) ?? null)
    : null;
  const itensDoLocal = localDaFicha
    ? [
        ...estado.tanques
          .filter((t) => t.localidadeId === localDaFicha.id)
          .map((t) => `Tanque: ${t.nome}`),
        ...estado.depositos
          .filter((d) => d.localidadeId === localDaFicha.id)
          .map((d) => `Depósito: ${d.nome}`),
      ]
    : [];

  const salvarRaio = React.useCallback(
    async (id: string, raioM: number | null): Promise<boolean> => {
      setSalvando(true);
      try {
        const r = await ajustarRaioLocal({ localidadeId: id, raioM });
        return aplicar(
          r,
          raioM === null ? "Área voltou ao padrão" : "Área do local salva",
        );
      } finally {
        setSalvando(false);
      }
    },
    [aplicar],
  );

  // Para qual pedreira a carreta volta depois do frete (null = a última de onde saiu).
  const trocarPedreira = React.useCallback(
    async (
      equipamento: EquipamentoMapa,
      freteId: string,
      localidadeId: string | null,
    ): Promise<boolean> => {
      setSalvando(true);
      try {
        const r = await escolherPedreira({
          equipamentoId: equipamento.id,
          freteId,
          localidadeId,
        });
        return aplicar(
          r,
          localidadeId === null
            ? `${equipamento.codigo}: volta para a última pedreira`
            : `${equipamento.codigo}: pedreira da volta trocada`,
        );
      } finally {
        setSalvando(false);
      }
    },
    [aplicar],
  );

  /**
   * Girar a máquina: o mapa mostra na hora e grava 600 ms depois do último toque (vários
   * toques de 15° viram uma gravação só). null volta a seguir a pista e grava direto.
   */
  const gravarRumo = React.useCallback(
    async (id: string, rumo: number | null) => {
      const r = await girarEquipamento({ equipamentoId: id, rumo });
      if ("erro" in r) toast.error(r.erro);
      else if (r.estado) setEstado(r.estado);
      setRumoPrevio(null);
    },
    [],
  );

  // Anel de giro (apertar e arrastar em volta da máquina): prévia enquanto arrasta, grava ao soltar.
  const girarPeloAnel = React.useCallback((id: string, rumo: number) => {
    if (timerGiro.current) clearTimeout(timerGiro.current);
    setRumoPrevio({ id, rumo });
  }, []);
  const soltarAnel = React.useCallback(
    (id: string, rumo: number) => {
      setRumoPrevio({ id, rumo });
      void gravarRumo(id, rumo);
    },
    [gravarRumo],
  );

  const girar = (e: EquipamentoMapa, delta: number | null) => {
    if (timerGiro.current) clearTimeout(timerGiro.current);
    const gravar = (rumo: number | null) => gravarRumo(e.id, rumo);
    if (delta === null) {
      setRumoPrevio(null);
      void gravar(null);
      return;
    }
    const base =
      rumoPrevio?.id === e.id
        ? rumoPrevio.rumo
        : headingNoTrecho(e, medidosPorId);
    const rumo = (((base + delta) % 360) + 360) % 360;
    setRumoPrevio({ id: e.id, rumo });
    timerGiro.current = setTimeout(() => void gravar(rumo), 600);
  };

  const alternarNaSelecao = React.useCallback((id: string) => {
    setSelecao((atual) => {
      const nova = new Set(atual);
      if (nova.has(id)) nova.delete(id);
      else nova.add(id);
      return nova;
    });
  }, []);

  /** Ligar a seleção múltipla fecha a ficha (fica a barra); desligar limpa a seleção. */
  const alternarMulti = React.useCallback(() => {
    setFicha(null);
    if (multi) setSelecao(new Set());
    setMulti(!multi);
  }, [multi]);

  const equipamentosDoLote = React.useMemo(
    () => (multi ? equipamentosVistos.filter((e) => selecao.has(e.id)) : []),
    [multi, equipamentosVistos, selecao],
  );
  const pessoasDoLote = React.useMemo(
    () => (multi ? estado.pessoas.filter((p) => selecao.has(p.id)) : []),
    [multi, estado.pessoas, selecao],
  );

  /** Onde cada máquina e cada pessoa do lote cai no lugar escolhido: pontos livres em volta dele. */
  const levarParaLote = React.useCallback(
    (chave: string): DestinoDoLote | null => {
      if (!lote) return null;
      const lugar = lugaresDaFicha.find((l) => l.chave === chave);
      if (!lugar) return null;
      const ids = new Set([
        ...lote.equipamentos.map((e) => e.id),
        ...lote.pessoas.map((p) => p.id),
      ]);
      const ocupados = equipamentosVistos.flatMap((e) =>
        !ids.has(e.id) && e.pos ? [e.pos] : [],
      );
      const pontos = pontosDoLote(
        lugar.pos,
        lote.equipamentos.length + lote.pessoas.length,
        ocupados,
      );
      const n = lote.equipamentos.length;
      return {
        itens: lote.equipamentos.map((equipamento, i) => {
          const para = pontos[i]!;
          return {
            equipamento,
            de: equipamento.pos,
            para,
            destino: resolverDestino(para, ctxDestino),
          };
        }),
        pessoas: lote.pessoas.map((pessoa, i) => ({
          pessoa,
          para: pontos[n + i]!,
        })),
        obraSugerida: lugar.obra,
      };
    },
    [lote, lugaresDaFicha, equipamentosVistos, ctxDestino],
  );

  const confirmarLote = React.useCallback(
    async ({
      data,
      motivo,
      estadoLivre,
      lugar,
      itens,
      pessoas,
      obra,
    }: ConfirmacaoLote) => {
      if (!lote) return true;
      setSalvando(true);
      try {
        const obraId = obra.tipo === "obra" ? obra.obraId : null;
        if (itens.length > 0) {
          const r = await moverEquipamentos({
            itens: itens.map((it) => {
              const pos =
                it.destino.tipo === "trecho" ? it.destino.pos : it.para;
              return {
                id: it.equipamento.id,
                lng: pos[0],
                lat: pos[1],
                // Só quem entra no mapa agora recebe estado (v1.27).
                estado:
                  it.destino.tipo === "livre" && it.equipamento.pos === null
                    ? estadoLivre
                    : undefined,
              };
            }),
            data,
            motivo: motivo || undefined,
            obra_id: obraId ?? undefined,
            sem_obra: obra.tipo === "sem_obra" || undefined,
          });
          if ("erro" in r) {
            toast.error(r.erro);
            const r2 = await recarregarEstado();
            if (!("erro" in r2)) setEstado(r2.estado);
            return false;
          }
          if (r.estado) setEstado(r.estado);
        }
        if (pessoas.length > 0) {
          const r = await moverPessoasEmLote({
            itens: pessoas.map((p) => ({
              id: p.pessoa.id,
              destino: destinoDaPessoaNoLote(lugar, p.para, obraId),
            })),
            data,
            motivo: motivo || undefined,
          });
          if ("erro" in r) {
            toast.error(
              itens.length > 0
                ? `Máquinas transferidas, mas as pessoas não: ${r.erro}`
                : r.erro,
            );
            const r2 = await recarregarEstado();
            if (!("erro" in r2)) setEstado(r2.estado);
            return false;
          }
          if (r.estado) setEstado(r.estado);
        }
        const rotulo = rotuloDoLote(itens.length, pessoas.length);
        toast.success(
          itens.length + pessoas.length > 1
            ? `${rotulo} transferidos`
            : `${rotulo} transferido`,
        );
        setLote(null);
        setSelecao(new Set());
        return true;
      } finally {
        setSalvando(false);
      }
    },
    [lote],
  );

  const confirmarTransferencia = React.useCallback(
    async ({
      data,
      motivo,
      estadoLivre,
      ajuste,
      itens,
      obra,
    }: ConfirmacaoTransferencia) => {
      if (!pendente) return true;
      setSalvando(true);
      try {
        const r = await moverEquipamentos({
          itens: itens.map((it) => {
            const pos = it.destino.tipo === "trecho" ? it.destino.pos : it.para;
            return {
              id: it.equipamento.id,
              lng: pos[0],
              lat: pos[1],
              // Só quem entra no mapa agora recebe estado; quem já está mantém o seu (v1.27).
              estado:
                !ajuste &&
                it.destino.tipo === "livre" &&
                it.equipamento.pos === null
                  ? estadoLivre
                  : undefined,
            };
          }),
          data,
          motivo: motivo || undefined,
          ajuste: ajuste || undefined,
          obra_id: obra?.tipo === "obra" ? obra.obraId : undefined,
          sem_obra: obra?.tipo === "sem_obra" || undefined,
        });
        const n = itens.length;
        const ok = aplicar(
          r,
          pendente.modo === "posicionar"
            ? `${pendente.principal.codigo} posicionada`
            : ajuste
              ? n > 1
                ? `Localização de ${n} equipamentos ajustada`
                : `Localização de ${pendente.principal.codigo} ajustada`
              : n > 1
                ? `${n} equipamentos transferidos`
                : `${pendente.principal.codigo} transferida`,
        );
        if (ok) {
          setPendente(null);
          setPosicionando(null);
        } else if (n > 1) {
          // Parte pode ter ido: relê para a cena não mentir.
          const r2 = await recarregarEstado();
          if (!("erro" in r2)) setEstado(r2.estado);
        }
        return ok;
      } finally {
        setSalvando(false);
      }
    },
    [pendente, aplicar],
  );

  const cancelarTransferencia = React.useCallback(() => {
    setPendente(null);
    if (pendente?.modo === "posicionar") setPosicionando(null);
  }, [pendente]);

  const confirmarPessoa = React.useCallback(
    async (motivo?: string) => {
      if (!pendentePessoa) return true;
      setSalvando(true);
      try {
        const { pessoa, para, sobre, local, obra = null } = pendentePessoa;
        const destino = destinoDaPessoa(para, local, obra);
        if (!sobre && !destino) return true;
        const r = sobre
          ? await assinalarOperador({
              equipamentoId: sobre.id,
              colaboradorId: pessoa.id,
              motivo: motivo?.trim() || undefined,
            })
          : await moverPessoas({
              ids: [pessoa.id],
              destino,
              data: estado.hoje,
              motivo: motivo?.trim() || undefined,
            });
        const ok = aplicar(
          r,
          sobre
            ? `${pessoa.nome} passa a operar ${sobre.codigo}`
            : local
              ? `${pessoa.nome} trabalha em ${local.nome}`
              : obra
                ? `${pessoa.nome} trabalha na obra ${obra.nome}`
                : `${pessoa.nome} realocado`,
        );
        if (ok) {
          setPendentePessoa(null);
          setPosicionandoPessoa(null);
        }
        return ok;
      } finally {
        setSalvando(false);
      }
    },
    [pendentePessoa, estado.hoje, aplicar],
  );

  const confirmarEstado = React.useCallback(
    async (dados: ConfirmacaoEstado) => {
      if (!pedidoEstado) return true;
      setSalvando(true);
      try {
        const r = await marcarEstado({
          id: pedidoEstado.equipamento.id,
          estado: pedidoEstado.estado,
          motivo: dados.motivo || undefined,
          descricao: dados.descricao || undefined,
          previsao: dados.previsao || undefined,
          data: dados.data,
        });
        const ok = aplicar(
          r,
          `${pedidoEstado.equipamento.codigo}: estado atualizado`,
        );
        if (ok) setPedidoEstado(null);
        return ok;
      } finally {
        setSalvando(false);
      }
    },
    [pedidoEstado, aplicar],
  );

  const acoplar = React.useCallback(
    async (implementoId: string, acoplarNela: boolean) => {
      if (!equipamentoFicha) return;
      const codigo =
        estado.implementos.find((i) => i.id === implementoId)?.codigo ??
        "Implemento";
      setSalvando(true);
      try {
        const r = await acoplarImplemento({
          implementoId,
          equipamentoId: acoplarNela ? equipamentoFicha.id : null,
        });
        aplicar(
          r,
          acoplarNela
            ? `${codigo} acoplado em ${equipamentoFicha.codigo}`
            : `${codigo} desacoplado de ${equipamentoFicha.codigo}`,
        );
      } finally {
        setSalvando(false);
      }
    },
    [equipamentoFicha, estado.implementos, aplicar],
  );

  const confirmarEncerramento = React.useCallback(
    async (motivo?: string) => {
      if (!encerrando) return true;
      setSalvando(true);
      try {
        const r = await encerrarLocacao({
          equipamentoId: encerrando.id,
          fim: fimLocacao || undefined,
          motivo: motivo?.trim() || undefined,
        });
        const ok = aplicar(r, `Locação de ${encerrando.codigo} encerrada`);
        if (ok) {
          setEncerrando(null);
          setFicha(null);
          setSelecao(new Set());
        }
        return ok;
      } finally {
        setSalvando(false);
      }
    },
    [encerrando, fimLocacao, aplicar],
  );

  const escolherEquipamento = React.useCallback(
    (e: EquipamentoMapa) => {
      // Com a seleção múltipla ligada, a lista também soma e tira da seleção (pensado para o toque).
      setSelecao((atual) => {
        if (!multi) return new Set([e.id]);
        const nova = new Set(atual);
        if (nova.has(e.id)) nova.delete(e.id);
        else nova.add(e.id);
        return nova;
      });
      if (!multi) abrirFicha({ tipo: "equipamento", id: e.id });
      if (e.pos) focar(e.pos, 15);
    },
    [focar, multi, abrirFicha],
  );

  const iniciarPosicionar = React.useCallback(
    (e: EquipamentoMapa) => {
      setPosicionandoPessoa(null);
      setPosicionando(e.id);
      abrirFicha({ tipo: "equipamento", id: e.id });
      setSelecao(new Set([e.id]));
      toast.info(`Toque no mapa onde está ${e.codigo}.`);
    },
    [abrirFicha],
  );

  const iniciarPosicionarPessoa = React.useCallback(
    (p: PessoaMapa) => {
      setPosicionando(null);
      setColocando(null);
      setPosicionandoPessoa(p.id);
      abrirFicha({ tipo: "pessoa", id: p.id });
      toast.info(
        `Toque no mapa onde fica ${p.nome}. Numa máquina, assinala como operador.`,
      );
    },
    [abrirFicha],
  );

  // Diarista que acabou de entrar: abre a ficha e já pede para posicionar.
  const aoEntrarDiarista = React.useCallback(
    (
      resultado: Extract<ResultadoMapa, { ok: true }>,
      colaboradorId: string | null,
    ) => {
      if (!resultado.estado) return;
      setEstado(resultado.estado);
      const alvo = colaboradorId
        ? resultado.estado.pessoas.find((p) => p.id === colaboradorId)
        : null;
      if (alvo) iniciarPosicionarPessoa(alvo);
    },
    [iniciarPosicionarPessoa],
  );

  const confirmarTirarDiarista = React.useCallback(async () => {
    if (!tirando) return true;
    setSalvando(true);
    try {
      const r = await tirarDiaristaDoMapa({ colaboradorId: tirando.id });
      const ok = aplicar(r, `${tirando.nome} saiu do mapa`);
      if (ok) {
        setTirando(null);
        setFicha(null);
        setSelecao(new Set());
      }
      return ok;
    } finally {
      setSalvando(false);
    }
  }, [tirando, aplicar]);

  const aoIniciarLocacao = React.useCallback(
    (
      resultado: Extract<ResultadoMapa, { ok: true }>,
      equipamentoId: string | null,
    ) => {
      if (!resultado.estado) return;
      const antes = new Set(equipamentosVistos.map((e) => e.id));
      setEstado(resultado.estado);
      const alvoId =
        equipamentoId ??
        resultado.estado.equipamentos.find((e) => !antes.has(e.id))?.id ??
        null;
      const alvo = alvoId
        ? resultado.estado.equipamentos.find((e) => e.id === alvoId)
        : null;
      if (alvo) {
        setPosicionando(alvo.id);
        abrirFicha({ tipo: "equipamento", id: alvo.id });
        setSelecao(new Set([alvo.id]));
      }
    },
    [equipamentosVistos, abrirFicha],
  );

  const aoMotor = React.useCallback((tipo: TipoMotor, aviso: string | null) => {
    setMotor({ tipo, aviso });
    if (aviso) toast.warning(aviso);
  }, []);

  /** O que o "Localizar" acha: máquinas, pessoas, obras e locais (com ou sem lugar no mapa). */
  const itensLocalizaveis = React.useMemo<ItemLocalizavel[]>(() => {
    const itens: ItemLocalizavel[] = [];
    for (const e of equipamentosVistos)
      itens.push({
        tipo: "equipamento",
        id: e.id,
        rotulo: `${e.codigo || "s/ código"} · ${e.descricao}`,
        detalhe: [
          ROTULO_ESTADO[e.estado],
          e.obraNome,
          e.pos ? "" : "sem lugar no mapa",
        ]
          .filter(Boolean)
          .join(" · "),
        busca: normalizarBusca(
          [e.codigo, e.descricao, e.placa, e.tipo, e.modelo, e.operadorNome]
            .filter(Boolean)
            .join(" "),
        ),
      });
    for (const q of estado.pessoas)
      itens.push({
        tipo: "pessoa",
        id: q.id,
        rotulo: q.nome,
        detalhe: [q.funcao, q.pos ? "" : "sem lugar no mapa"]
          .filter(Boolean)
          .join(" · "),
        busca: normalizarBusca([q.nome, q.funcao].filter(Boolean).join(" ")),
      });
    for (const o of rotulosObra)
      itens.push({
        tipo: "obra",
        id: o.id,
        rotulo: o.nome,
        detalhe: "",
        busca: normalizarBusca(o.nome),
      });
    for (const l of estado.localidades)
      itens.push({
        tipo: "local",
        id: l.id,
        rotulo: l.nome,
        detalhe: rotuloTipoLocalidade(l.tipo),
        busca: normalizarBusca(`${l.nome} ${rotuloTipoLocalidade(l.tipo)}`),
      });
    return itens;
  }, [equipamentosVistos, estado.pessoas, estado.localidades, rotulosObra]);

  /** Some o que esconderia o item escolhido (filtros, "Mudou hoje", seleção múltipla). */
  const mostrarTudo = React.useCallback(() => {
    setFiltros(FILTROS_VAZIOS);
    setSoHoje(false);
    setMulti(false);
  }, []);

  const irParaEquipamento = React.useCallback(
    (id: string): boolean => {
      const e = equipamentosVistos.find((x) => x.id === id);
      if (!e) return false;
      if (!filtrados.some((x) => x.id === id)) mostrarTudo();
      // A ficha não abre na seleção múltipla.
      setMulti(false);
      setSelecao(new Set([id]));
      abrirFicha({ tipo: "equipamento", id });
      if (e.pos) focar(e.pos, 16);
      else
        toast.info(
          `${e.codigo || e.descricao} ainda não tem lugar no mapa: use Posicionar na ficha.`,
        );
      return true;
    },
    [equipamentosVistos, filtrados, mostrarTudo, abrirFicha, focar],
  );

  const escolherLocalizado = React.useCallback(
    (item: ItemLocalizavel) => {
      if (item.tipo === "equipamento") {
        irParaEquipamento(item.id);
        return;
      }
      if (item.tipo === "pessoa") {
        const q = estado.pessoas.find((x) => x.id === item.id);
        if (!q) return;
        mostrarTudo();
        setSelecao(new Set([q.id]));
        abrirFicha({ tipo: "pessoa", id: q.id });
        if (q.pos) focar(q.pos, 17);
        return;
      }
      if (item.tipo === "obra") {
        clicarObra(item.id);
        const r = rotulosObra.find((o) => o.id === item.id);
        if (r) focar(r.pos, 13);
        return;
      }
      clicarLocal(item.id);
      const l = estado.localidades.find((x) => x.id === item.id);
      if (l) focar(l.pos, 16);
    },
    [
      irParaEquipamento,
      estado.pessoas,
      estado.localidades,
      rotulosObra,
      mostrarTudo,
      abrirFicha,
      focar,
      clicarObra,
      clicarLocal,
    ],
  );

  /** Alerta tocado: a máquina, o tanque ou a carreta do frete. */
  const irParaAlerta = React.useCallback(
    (a: AlertaMapa): boolean => {
      const naoAchou = () => {
        toast.info("Esse item não está no mapa agora.");
        return false;
      };
      if (!a.alvoId) return naoAchou();
      if (a.alvo === "equipamento")
        return irParaEquipamento(a.alvoId) || naoAchou();
      if (a.alvo === "frete") {
        const f = estado.fretesEmRota.find((x) => x.id === a.alvoId);
        return (
          (f?.equipamentoId ? irParaEquipamento(f.equipamentoId) : false) ||
          naoAchou()
        );
      }
      if (a.alvo === "tanque") {
        const o = objetos.find((x) => x.id === a.alvoId);
        if (!o) return naoAchou();
        clicarObjeto(o.id);
        if (o.pos) focar(o.pos, 16);
        return true;
      }
      return naoAchou();
    },
    [irParaEquipamento, estado.fretesEmRota, objetos, clicarObjeto, focar],
  );

  /** "Selecionar as N do filtro" na seleção múltipla: as máquinas no mapa que o filtro mostra. */
  const selecionarFiltradas = React.useCallback(() => {
    setFicha(null);
    setSelecao(new Set(noMapa.map((e) => e.id)));
  }, [noMapa]);

  const confirmarChegada = React.useCallback(async (): Promise<boolean> => {
    if (!chegada) return false;
    setSalvando(true);
    try {
      const r = await registrarChegada(chegada.freteId, dataHojeISO());
      if ("erro" in r) {
        toast.error(r.erro);
        return false;
      }
      toast.success(`Chegada da carreta ${chegada.placa} registrada`);
      setChegada(null);
      await atualizar();
      return true;
    } finally {
      setSalvando(false);
    }
  }, [chegada, atualizar]);

  /**
   * Barra de filtros canônica (a mesma das tabelas: menu "Filtros", persistência por usuário e
   * o "Limpar filtros"): busca, obra e estado. Os chips do painel mexem no mesmo `estado`.
   */
  const filtrosDaBarra = React.useMemo<FiltroDaBarra[]>(
    () => [
      {
        id: "busca",
        rotulo: "Busca",
        fixo: true,
        temValor: filtros.busca !== "",
        onLimpar: () => setFiltros((f) => ({ ...f, busca: "" })),
        elemento: (
          <FiltroBusca
            valor={filtros.busca}
            onValorChange={(v) => setFiltros((f) => ({ ...f, busca: v }))}
            placeholder="Código, descrição, placa, operador"
          />
        ),
      },
      {
        id: "obra",
        rotulo: "Obra",
        temValor: filtros.obraId !== "",
        onLimpar: () => setFiltros((f) => ({ ...f, obraId: "" })),
        elemento: (
          <FiltroSelect
            valor={filtros.obraId}
            onValorChange={(v) => setFiltros((f) => ({ ...f, obraId: v }))}
            opcoes={obras.map((o) => ({ valor: o.id, rotulo: o.nome }))}
            todosRotulo="Todas as obras"
          />
        ),
      },
      {
        id: "estado",
        rotulo: "Estado",
        temValor: filtros.estado !== "",
        onLimpar: () => setFiltros((f) => ({ ...f, estado: "" })),
        elemento: (
          <FiltroSelect
            valor={filtros.estado}
            onValorChange={(v) =>
              setFiltros((f) => ({ ...f, estado: v as EstadoEfetivo | "" }))
            }
            opcoes={ORDEM_ESTADOS.map((k) => ({
              valor: k,
              rotulo: ROTULO_ESTADO[k],
            }))}
            todosRotulo="Todos os estados"
          />
        ),
      },
    ],
    [filtros, obras],
  );

  const botaoAlternar = (
    ativo: boolean,
    rotulo: string,
    Icone: React.ComponentType<{ className?: string }>,
    onClick: () => void,
    dica?: string,
  ) => (
    <Button
      type="button"
      size="xs"
      variant={ativo ? "default" : "outline"}
      onClick={onClick}
      aria-pressed={ativo}
      title={dica ?? rotulo}
      className="bg-background/95 backdrop-blur data-[ativo=true]:bg-primary"
      data-ativo={ativo}
    >
      <Icone className="size-3" />
      <span className="max-sm:sr-only">{rotulo}</span>
    </Button>
  );

  // A ficha da máquina, da pessoa ou do objeto tocado. Em tela larga ela abre ao lado dele, no
  // mapa (pedido do Tiago, 16/10/2026); no celular, ou sem lugar no mapa, fica na lateral.
  const fichaFlutuante: React.ReactNode = multi ? null : equipamentoFicha ? (
    <FichaEquipamento
      equipamento={
        rumoPrevio?.id === equipamentoFicha.id
          ? {
              ...equipamentoFicha,
              heading: rumoPrevio.rumo,
              rumoManual: rumoPrevio.rumo,
            }
          : {
              ...equipamentoFicha,
              heading: headingNoTrecho(equipamentoFicha, medidosPorId),
            }
      }
      onGirar={(delta) => girar(equipamentoFicha, delta)}
      pessoas={estado.pessoas}
      hoje={estado.hoje}
      frete={freteDe.get(equipamentoFicha.id) ?? null}
      retorno={retornoDe.get(equipamentoFicha.id) ?? null}
      pedreiras={pedreiras}
      onEscolherPedreira={(localidadeId) => {
        const r = retornoDe.get(equipamentoFicha.id);
        if (r) void trocarPedreira(equipamentoFicha, r.freteId, localidadeId);
      }}
      tanque={
        estado.tanques.find((t) => t.equipamentoId === equipamentoFicha.id) ??
        null
      }
      permissoes={permissoes}
      selecionados={selecao.size}
      salvando={salvando}
      onFechar={() => setFicha(null)}
      onFocar={() => equipamentoFicha.pos && focar(equipamentoFicha.pos, 16)}
      onPosicionar={() => iniciarPosicionar(equipamentoFicha)}
      onTransferirParaObra={() =>
        setPendente({ modo: "destino", principal: equipamentoFicha, itens: [] })
      }
      historicoHref={
        permissoes.historico
          ? `/mapa/historico?equipamento=${equipamentoFicha.id}`
          : null
      }
      relatorioCentrosHref={
        permissoes.historico ? "/mapa/dias-por-centro" : null
      }
      onMarcarEstado={(s) =>
        setPedidoEstado({ equipamento: equipamentoFicha, estado: s })
      }
      onAlocar={(item) => alocarComDesfazer([item])}
      codigoDe={codigoDe}
      implementos={estado.implementos}
      onAcoplar={acoplar}
      onRegistrarChegada={(() => {
        const f = freteDe.get(equipamentoFicha.id);
        return podeRegistrarChegada && f
          ? () => setChegada({ freteId: f.id, placa: f.placa || equipamentoFicha.codigo })
          : null;
      })()}
      onEncerrarLocacao={() => {
        setFimLocacao(estado.hoje);
        setEncerrando(equipamentoFicha);
      }}
    />
  ) : pessoaFicha ? (
    <FichaPessoa
      key={pessoaFicha.id}
      pessoa={pessoaFicha}
      maquina={
        pessoaFicha.equipamentoId
          ? (equipamentosVistos.find((e) => e.id === pessoaFicha.equipamentoId)
              ?.codigo ?? null)
          : null
      }
      maquinas={equipamentosVistos}
      localidades={estado.localidades}
      obras={estado.obras}
      centrosCusto={centrosCusto}
      onAlocar={(item) => alocarComDesfazer([item])}
      podeEditar={permissoes.editar}
      salvando={salvando}
      posicionando={posicionandoPessoa === pessoaFicha.id}
      relatorioDiasHref={permissoes.historico ? "/mapa/dias-de-pessoa" : null}
      onTirarDoMapa={
        pessoaFicha.vinculo === "diarista"
          ? () => setTirando(pessoaFicha)
          : undefined
      }
      onFechar={() => setFicha(null)}
      onFocar={() => pessoaFicha.pos && focar(pessoaFicha.pos, 17)}
      onPosicionar={() =>
        posicionandoPessoa === pessoaFicha.id
          ? setPosicionandoPessoa(null)
          : iniciarPosicionarPessoa(pessoaFicha)
      }
      onTrocarObra={(obraId) => {
        const obra = estado.obras.find((o) => o.id === obraId);
        if (!obra) return;
        // A pessoa vai para o ponto do nome da obra no mapa; obra sem ponto (sem trecho, área nem
        // centro) deixa a pessoa onde está.
        const para =
          rotulosObra.find((o) => o.id === obraId)?.pos ?? pessoaFicha.pos;
        void pessoaNoLugar({
          pessoa: pessoaFicha,
          para,
          sobre: null,
          local: null,
          obra,
        });
      }}
    />
  ) : objetoDaFicha ? (
    <FichaObjeto
      key={objetoDaFicha.id}
      objeto={objetoDaFicha}
      linhas={linhasDaFicha(objetoDaFicha, {
        tanques: estado.tanques,
        pilhas: estado.pilhas,
        depositos: estado.depositos,
        localidades: estado.localidades,
        equipamentos: equipamentosVistos,
        snapLocalM: estado.config.snapLocalM,
        valores: valoresDaFicha,
      })}
      podeEditar={permissoes.editar}
      acoes={
        objetoDaFicha.alvo === "pilha" ? (
          <MovimentarPilha
            pilhaId={objetoDaFicha.id}
            saldo={
              estado.pilhas.find((p) => p.id === objetoDaFicha.id)?.saldo ?? 0
            }
            permissoes={movimentarPilha}
          />
        ) : null
      }
      onFechar={() => setObjetoFicha(null)}
      onMover={() =>
        escolherNoMapa({
          tipo: "objeto",
          alvo: objetoDaFicha.alvo,
          id: objetoDaFicha.id,
          rotulo: objetoDaFicha.nome,
        })
      }
      rumo={
        rumoDepositoPrevio?.id === objetoDaFicha.id
          ? rumoDepositoPrevio.rumo
          : (objetoDaFicha.rumo ?? 0)
      }
      onGirar={(delta) => {
        if (timerGiroDeposito.current) clearTimeout(timerGiroDeposito.current);
        const base =
          rumoDepositoPrevio?.id === objetoDaFicha.id
            ? rumoDepositoPrevio.rumo
            : (objetoDaFicha.rumo ?? 0);
        const rumo = delta === null ? 0 : (((base + delta) % 360) + 360) % 360;
        const id = objetoDaFicha.id;
        setRumoDepositoPrevio({ id, rumo });
        timerGiroDeposito.current = setTimeout(async () => {
          const r = await girarDeposito({ id, rumo });
          if ("erro" in r) toast.error(r.erro);
          else if (r.estado) setEstado(r.estado);
          setRumoDepositoPrevio(null);
        }, 600);
      }}
      onSalvarTamanho={async (t) =>
        aplicar(
          await definirTamanhoDeposito({ id: objetoDaFicha.id, ...t }),
          `Tamanho de ${objetoDaFicha.nome} salvo`,
        )
      }
    />
  ) : null;
  const cartao: CartaoNoMapa | null = (() => {
    if (!telaLarga || !fichaFlutuante) return null;
    if (equipamentoFicha) {
      const naCena = cena.equipamentos.find(
        (e) => e.id === equipamentoFicha.id,
      );
      if (!naCena?.pos) return null;
      const giro = anelGiro?.id === naCena.id ? anelGiro : null;
      return {
        chave: naCena.id,
        pos: naCena.pos,
        raioM: giro ? giro.raioM : raioDoAnelM(naCena.modelo3d),
        raioMinimoPx: giro ? RAIO_MINIMO_GIRO_PX : RAIO_MINIMO_ANEL_PX,
        conteudo: fichaFlutuante,
      };
    }
    if (pessoaFicha) {
      const naCena = cena.pessoas.find((q) => q.id === pessoaFicha.id);
      if (!naCena?.pos) return null;
      return {
        chave: naCena.id,
        pos: naCena.pos,
        raioM: RAIO_BONECO_M,
        raioMinimoPx: RAIO_MINIMO_BONECO_PX,
        conteudo: fichaFlutuante,
      };
    }
    if (objetoDaFicha?.pos) {
      // Pilha em escala real; tanque e depósito na escala das máquinas (como em camadas.ts).
      const escala = objetoDaFicha.forma === "cone" ? 1 : ESCALA_MAQUINA;
      return {
        chave: objetoDaFicha.id,
        pos: objetoDaFicha.pos,
        raioM:
          (Math.max(objetoDaFicha.largura, objetoDaFicha.comprimento) / 2) *
          escala,
        raioMinimoPx: 12,
        conteudo: fichaFlutuante,
      };
    }
    return null;
  })();
  // A lateral só abre sozinha para a ficha que não foi para o mapa.
  const fichaNaLateral = fichaFlutuante !== null && cartao === null;
  const painelAberto =
    listaAberta || fichaNaLateral || localFicha !== null || obraFicha !== null;
  const alternarPainel = () => {
    if (painelAberto) {
      setLocalFicha(null);
      setObraFicha(null);
      if (fichaNaLateral) {
        setFicha(null);
        setObjetoFicha(null);
      }
    }
    gravarPainel(!painelAberto);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <BarraFiltrosConfiguravel
        idTabela="mapa-frota-filtros"
        filtros={filtrosDaBarra}
        onLimparFiltros={() => setFiltros(FILTROS_VAZIOS)}
        acoes={
          <>
            <LocalizarNoMapa
              itens={itensLocalizaveis}
              onEscolher={escolherLocalizado}
            />
            {permissoes.editar ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAdicionando("obra")}
                >
                  <HardHat />
                  Adicionar obra
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAdicionando("local")}
                >
                  <MapPinPlus />
                  Adicionar localização
                </Button>
              </>
            ) : null}
          </>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row">
        {/* O motor do mapa fica só no atributo, para conferir em produção sem poluir a tela. */}
        <div
          className="relative h-[48dvh] shrink-0 overflow-hidden rounded-lg border border-border md:h-auto md:min-h-0 md:flex-1"
          data-motor={motor ? ROTULO_MOTOR[motor.tipo] : undefined}
        >
          <MapaEmt
            google={google}
            cena={cena}
            selecao={selecao}
            posicoesPendentes={null}
            fundo={fundo}
            inclinado={inclinado}
            podeArrastar={permissoes.editar && !pendente && !pendentePessoa}
            modoPosicionar={
              rota !== null ||
              (desenho !== null && desenhoFinal === null) ||
              ((posicionando !== null ||
                posicionandoPessoa !== null ||
                colocando !== null) &&
                !pendente &&
                !pontoColocar)
            }
            foco={foco}
            giroMapa={giroMapa}
            inclinacaoMapa={inclinacaoMapa}
            centroInicial={centroInicial}
            onSelecionar={selecionar}
            onSoltar={soltar}
            onClicarMapa={clicarMapa}
            onClicarLocal={clicarLocal}
            onClicarObra={clicarObra}
            onClicarObjeto={clicarObjeto}
            onGirarPrevia={girarPeloAnel}
            onGirarFim={soltarAnel}
            onMotor={aoMotor}
            onClicarVazio={() => {
              setFicha(null);
              setObjetoFicha(null);
            }}
            cartao={cartao}
          />
          {multi && equipamentosDoLote.length + pessoasDoLote.length === 0 ? (
            <div className="pointer-events-none absolute inset-x-2 bottom-3 flex justify-center">
              <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-lg border border-border bg-background/95 px-3 py-2 shadow-md backdrop-blur">
                <span className="text-detalhe text-muted-foreground">
                  Toque nas máquinas e pessoas para selecionar
                </span>
                {noMapa.length > 0 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={selecionarFiltradas}
                    title="Seleciona as máquinas no mapa que a busca e os filtros mostram"
                  >
                    <CheckSquare />
                    Selecionar as {noMapa.length} do filtro
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
          {multi && equipamentosDoLote.length + pessoasDoLote.length > 0 ? (
            <div className="pointer-events-none absolute inset-x-2 bottom-3 flex justify-center">
              <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-lg border border-border bg-background/95 px-3 py-2 shadow-md backdrop-blur">
                <span className="text-detalhe text-foreground">
                  {rotuloDoLote(
                    equipamentosDoLote.length,
                    pessoasDoLote.length,
                  )}{" "}
                  {equipamentosDoLote.length + pessoasDoLote.length > 1
                    ? "selecionados"
                    : "selecionado"}
                </span>
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    setLote({
                      equipamentos: equipamentosDoLote,
                      pessoas: pessoasDoLote,
                    })
                  }
                  disabled={salvando}
                >
                  <ArrowRightLeft />
                  Transferir
                </Button>
                {pessoasDoLote.length > 0 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setQuadro({ idsPessoas: pessoasDoLote.map((p) => p.id) })
                    }
                    disabled={salvando}
                    title="Máquina, local e centro das pessoas selecionadas, de uma vez"
                  >
                    <ClipboardList />
                    Alocar
                  </Button>
                ) : null}
                {noMapa.some((e) => !selecao.has(e.id)) ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={selecionarFiltradas}
                    title="Seleciona as máquinas no mapa que a busca e os filtros mostram"
                  >
                    <CheckSquare />
                    Todas do filtro ({noMapa.length})
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setSelecao(new Set())}
                >
                  <X />
                  Limpar
                </Button>
              </div>
            </div>
          ) : null}
          <div className="pointer-events-none absolute inset-x-2 top-2 flex flex-wrap items-start justify-between gap-2">
            <div className="pointer-events-auto flex flex-wrap gap-1.5">
              {botaoAlternar(fundo === "satelite", "Satélite", Satellite, () =>
                gravarFundo(fundo === "satelite" ? "mapa" : "satelite"),
              )}
              {botaoAlternar(
                inclinado,
                "3D",
                Box,
                () => setInclinado((v) => !v),
                "3D. No computador, Shift + arrastar inclina e gira o mapa",
              )}
              {botaoAlternar(rota !== null, "Rota", Route, alternarRota)}
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() => inclinarMapa(15)}
                title="Inclinar mais (olhar para o horizonte)"
                aria-label="Inclinar mais"
                className="bg-background/95 backdrop-blur"
              >
                <ChevronUp className="size-3" />
              </Button>
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() => inclinarMapa(-15)}
                title="Inclinar menos (olhar de cima)"
                aria-label="Inclinar menos"
                className="bg-background/95 backdrop-blur"
              >
                <ChevronDown className="size-3" />
              </Button>
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() => girarMapa(-30)}
                title="Girar o mapa para a esquerda"
                aria-label="Girar o mapa para a esquerda"
                className="bg-background/95 backdrop-blur"
              >
                <RotateCcw className="size-3" />
              </Button>
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() => girarMapa(30)}
                title="Girar o mapa para a direita"
                aria-label="Girar o mapa para a direita"
                className="bg-background/95 backdrop-blur"
              >
                <RotateCw className="size-3" />
              </Button>
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() => girarMapa(null)}
                title="Norte para cima"
                className="bg-background/95 backdrop-blur"
              >
                <Compass className="size-3" />
                <span className="max-sm:sr-only">Norte</span>
              </Button>
              {permissoes.editar
                ? botaoAlternar(multi, "Seleção múltipla", MousePointer2, () =>
                    alternarMulti(),
                  )
                : null}
              {permissoes.editar
                ? botaoAlternar(
                    quadro !== null,
                    "Alocação",
                    ClipboardList,
                    () => setQuadro({}),
                    "Quadro de alocação: máquina, local e centro de todo mundo",
                  )
                : null}
              {botaoAlternar(mostrarPessoas, "Pessoas", Users, () =>
                setMostrarPessoas((v) => !v),
              )}
              {botaoAlternar(mostrarRotulos, "Rótulos", Tag, () =>
                setMostrarRotulos((v) => !v),
              )}
              {botaoAlternar(mostrarAreas, "Áreas", Layers, () =>
                setMostrarAreas((v) => !v),
              )}
              {estado.avisos
                ? botaoAlternar(
                    soHoje,
                    `Mudou hoje (${idsMudaramHoje.size})`,
                    CalendarClock,
                    () => setSoHoje((v) => !v),
                    "Mostra só as máquinas e pessoas com movimentação desde 0h",
                  )
                : null}
              <LegendaMapa />
            </div>
            <div className="flex gap-1.5">
              {estado.avisos ? (
                <AlertasMapa
                  alertas={estado.avisos.alertas}
                  onIrPara={irParaAlerta}
                />
              ) : null}
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={atualizar}
                disabled={atualizando}
                className="pointer-events-auto bg-background/95 backdrop-blur"
                title="Reler o mapa"
              >
                <RefreshCw
                  className={cn("size-3", atualizando && "animate-spin")}
                />
                <span className="max-sm:sr-only">Atualizar</span>
              </Button>
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={alternarPainel}
                aria-expanded={painelAberto}
                aria-controls="mapa-painel-lateral"
                className="pointer-events-auto bg-background/95 backdrop-blur"
                title={painelAberto ? "Recolher a lista" : "Mostrar a lista"}
              >
                {painelAberto ? (
                  <PanelRightClose className="size-3" />
                ) : (
                  <PanelRightOpen className="size-3" />
                )}
                <span className="max-sm:sr-only">
                  {painelAberto ? "Recolher" : "Lista"}
                </span>
              </Button>
            </div>
          </div>
          {rota ? (
            <div className="absolute inset-x-2 bottom-10 flex justify-center">
              <div
                className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-border bg-background/95 py-1 pr-1 pl-3 text-detalhe shadow-sm backdrop-blur"
                aria-live="polite"
              >
                <span>
                  {!rota.origem ? (
                    "Rota: toque o ponto de partida"
                  ) : !rota.destino ? (
                    "Rota: toque o destino"
                  ) : rota.calculando ? (
                    "Calculando a rota pela estrada..."
                  ) : rota.resultado ? (
                    <>
                      <strong className="tabular-nums">
                        {formatarDistancia(rota.resultado.metros)}
                      </strong>{" "}
                      pela estrada ·{" "}
                      <span className="tabular-nums">
                        {formatarDistancia(
                          distanciaM(rota.origem, rota.destino),
                        )}
                      </span>{" "}
                      em linha reta
                      {rota.resultado.fonte === "osm" ? (
                        <span className="text-muted-foreground">
                          {" "}
                          (OpenStreetMap)
                        </span>
                      ) : null}
                    </>
                  ) : (
                    "Não achei caminho pela estrada entre os dois pontos"
                  )}
                </span>
                {rota.origem ? (
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() =>
                      setRota({
                        origem: null,
                        destino: null,
                        resultado: null,
                        calculando: false,
                      })
                    }
                  >
                    Recomeçar
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => setRota(null)}
                  aria-label="Fechar a rota"
                >
                  <X className="size-3" />
                  Fechar
                </Button>
              </div>
            </div>
          ) : desenho && !desenhoFinal ? (
            <div className="absolute inset-x-2 bottom-10 flex justify-center">
              <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-border bg-background/95 py-1 pr-1 pl-3 text-detalhe shadow-sm backdrop-blur">
                <span>
                  {desenho.forma === "trecho" ? "Pavimentação" : "Edificação"}{" "}
                  de <strong>{desenho.obra.nome}</strong>:{" "}
                  {desenho.pontos.length === 0
                    ? desenho.forma === "trecho"
                      ? "toque o ponto inicial"
                      : "toque o primeiro canto"
                    : `${desenho.pontos.length} ${desenho.pontos.length === 1 ? "ponto" : "pontos"}`}
                </span>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  disabled={desenho.pontos.length === 0}
                  onClick={() =>
                    setDesenho((d) =>
                      d ? { ...d, pontos: d.pontos.slice(0, -1) } : d,
                    )
                  }
                >
                  Desfazer
                </Button>
                <Button
                  type="button"
                  size="xs"
                  disabled={
                    concluindo ||
                    desenho.pontos.length < (desenho.forma === "trecho" ? 2 : 4)
                  }
                  onClick={() => void concluirDesenho()}
                >
                  Concluir
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={cancelarDesenho}
                  aria-label="Cancelar"
                >
                  <X className="size-3" />
                  Cancelar
                </Button>
              </div>
            </div>
          ) : null}
          {colocando && !pontoColocar ? (
            <div className="absolute inset-x-2 bottom-10 flex justify-center">
              <div className="flex items-center gap-2 rounded-full border border-border bg-background/95 py-1 pr-1 pl-3 text-detalhe shadow-sm backdrop-blur">
                <span>
                  Toque no mapa onde fica{" "}
                  <strong>
                    {colocando.tipo === "obra"
                      ? colocando.obra.nome
                      : colocando.rotulo}
                  </strong>
                </span>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={cancelarColocar}
                  aria-label="Cancelar"
                >
                  <X className="size-3" />
                  Cancelar
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <div
          id="mapa-painel-lateral"
          className={cn(
            "flex min-h-[16rem] min-w-0 flex-1 flex-col md:w-64 md:flex-none",
            !painelAberto && "hidden",
          )}
        >
          <PainelMapa
            filtros={filtros}
            onFiltros={setFiltros}
            contagens={contagens}
            semPosicao={semPosicao}
            noMapa={noMapa}
            pessoasNoMapa={pessoasNaLista}
            pessoasSemPosicao={pessoasSemPosicao}
            selecao={selecao}
            posicionando={posicionandoEquipamento}
            posicionandoPessoa={pessoaPosicionando}
            permissoes={permissoes}
            temCandidatosLocacao={estado.foraDoMapa.length > 0}
            onPosicionar={iniciarPosicionar}
            onPosicionarPessoa={(p) =>
              posicionandoPessoa === p.id
                ? setPosicionandoPessoa(null)
                : iniciarPosicionarPessoa(p)
            }
            onCancelarPosicionar={() => {
              setPosicionando(null);
              setPosicionandoPessoa(null);
            }}
            onEscolherEquipamento={escolherEquipamento}
            onEscolherPessoa={(p) => {
              if (multi) alternarNaSelecao(p.id);
              else abrirFicha({ tipo: "pessoa", id: p.id });
              if (p.pos) focar(p.pos, 16);
            }}
            onAdicionarAlugada={() => setDrawerLocacao(true)}
            pessoasSemAlocacao={pessoasSemAlocacao}
            onAlocarSemAlocacao={() => setQuadro({ soSemAlocacao: true })}
            temCandidatosDiarista={estado.diaristasFora.length > 0}
            onAdicionarDiarista={() => setDrawerDiarista(true)}
            objetosSemLugar={objetosSemLugar}
            onEscolherObjeto={clicarObjeto}
          >
            {fichaNaLateral ? (
              fichaFlutuante
            ) : localDaFicha ? (
              <FichaLocal
                key={localDaFicha.id}
                local={localDaFicha}
                obras={estado.obras}
                itens={itensDoLocal}
                padraoM={estado.config.snapLocalM}
                podeEditar={permissoes.editar}
                salvando={salvando}
                onFechar={() => {
                  setLocalFicha(null);
                  setRaioPrevio(null);
                }}
                onPrevia={(raioM) =>
                  setRaioPrevio(
                    raioM === null ? null : { id: localDaFicha.id, raioM },
                  )
                }
                onSalvar={(raioM) => salvarRaio(localDaFicha.id, raioM)}
                onSalvarDados={async (nome, tipos, obraId) => {
                  setSalvando(true);
                  try {
                    const r = await editarLocal({
                      localidadeId: localDaFicha.id,
                      nome,
                      tipos,
                      obraId,
                    });
                    return aplicar(r, `${nome} salvo`);
                  } finally {
                    setSalvando(false);
                  }
                }}
                onInativar={async () => {
                  setSalvando(true);
                  try {
                    const r = await inativarLocal({
                      localidadeId: localDaFicha.id,
                    });
                    const ok = aplicar(r, `${localDaFicha.nome} inativado`);
                    if (ok) {
                      setLocalFicha(null);
                      setRaioPrevio(null);
                    }
                    return ok;
                  } finally {
                    setSalvando(false);
                  }
                }}
                onMover={() =>
                  escolherNoMapa({
                    tipo: "local",
                    rotulo: localDaFicha.nome,
                    localidadeId: localDaFicha.id,
                  })
                }
              />
            ) : obraDaFicha ? (
              <FichaObra
                key={obraDaFicha.id}
                obra={obraDaFicha}
                desenho={desenhoDe(obraDaFicha.id)}
                podeEditar={permissoes.editar}
                salvando={salvando}
                onFechar={() => setObraFicha(null)}
                onDesenhar={(forma) => {
                  const d = desenhoDe(obraDaFicha.id);
                  comecarDesenho(
                    obraDaFicha,
                    forma,
                    forma === "trecho" ? d.trechos > 0 : d.areas > 0,
                  );
                }}
                onMoverPonto={() =>
                  escolherNoMapa({ tipo: "obra", obra: obraDaFicha })
                }
                onTirar={async () => {
                  const r = await tirarObra({ obraId: obraDaFicha.id });
                  const ok = aplicar(r, `${obraDaFicha.nome} saiu do mapa`);
                  if (ok) setObraFicha(null);
                  return ok;
                }}
              />
            ) : null}
          </PainelMapa>
        </div>
      </div>

      {/* Montados só enquanto há pedido: cada arraste/pedido nasce com os campos limpos. */}
      {adicionando === "obra" ? (
        <DialogoAdicionarObra
          obras={estado.obras}
          desenhoDe={desenhoDe}
          onCancelar={() => setAdicionando(null)}
          onEscolher={(obra, forma, substituir) =>
            forma === "ponto"
              ? escolherNoMapa({ tipo: "obra", obra })
              : comecarDesenho(obra, forma, substituir)
          }
        />
      ) : null}
      {desenho && desenhoFinal ? (
        <DialogoConcluirDesenho
          obra={desenho.obra}
          forma={desenho.forma}
          extensaoKm={extensaoKm(desenhoFinal.pontos)}
          seguiuEstrada={desenhoFinal.seguiuEstrada}
          substituir={desenho.substituir}
          onCancelar={() => setDesenhoFinal(null)}
          onConfirmar={salvarDesenho}
        />
      ) : null}
      {adicionando === "local" ? (
        <DialogoAdicionarLocal
          localidades={estado.localidades}
          obras={estado.obras}
          semPosicao={estado.localidadesSemPosicao}
          tanques={estado.tanques}
          depositos={estado.depositos}
          podeCriar={permissoes.criar}
          onCancelar={() => setAdicionando(null)}
          onEscolherNoMapa={escolherNoMapa}
          onLigar={ligarAoLocal}
        />
      ) : null}
      {chegada ? (
        <ConfirmDialog
          aberto
          onAbertoChange={(aberto) => {
            if (!aberto) setChegada(null);
          }}
          titulo={`Registrar a chegada da carreta ${chegada.placa}?`}
          descricao={`O frete fica com chegada em ${formatarData(dataHojeISO())} e a carreta sai da rota no mapa. Para outra data, edite no Frete.`}
          textoConfirmar="Registrar chegada"
          onConfirmar={confirmarChegada}
        />
      ) : null}
      {colocando && pontoColocar ? (
        <ConfirmDialog
          aberto
          onAbertoChange={(aberto) => {
            if (!aberto) setPontoColocar(null);
          }}
          titulo={
            colocando.tipo === "obra"
              ? `Pôr ${colocando.obra.nome} aqui?`
              : `Pôr ${colocando.rotulo} aqui?`
          }
          descricao={
            colocando.tipo === "obra"
              ? "A obra fica marcada neste ponto do mapa."
              : colocando.tipo === "objeto"
                ? "Fica neste ponto do mapa. O cadastro continua no Estoque."
                : colocando.localidadeId
                  ? "O local fica neste ponto do mapa."
                  : `Cria o local ${colocando.nome ?? ""} (${(colocando.tipos ?? ["outro"]).map((t) => rotuloTipoLocalidade(t).toLowerCase()).join(", ")}) neste ponto${colocando.vincular ? ` e liga ${colocando.vincular.alvo === "tanque" ? "o tanque" : "o depósito"} a ele` : ""}.`
          }
          textoConfirmar="Confirmar"
          conteudo={
            <p className="text-detalhe text-muted-foreground">
              {pontoColocar[1].toFixed(5)}, {pontoColocar[0].toFixed(5)}.
              Cancelar volta para escolher outro ponto.
            </p>
          }
          onConfirmar={confirmarColocar}
        />
      ) : null}
      {pendente ? (
        <DialogoTransferencia
          pendente={pendente}
          hoje={estado.hoje}
          obras={opcoesObra}
          lugares={lugaresDaFicha}
          obraCarretasEmt={estado.config.obraCarretasEmt}
          levarPara={levarPara}
          onCancelar={cancelarTransferencia}
          onConfirmar={confirmarTransferencia}
        />
      ) : null}
      {lote ? (
        <DialogoTransferenciaLote
          equipamentos={lote.equipamentos}
          pessoas={lote.pessoas}
          hoje={estado.hoje}
          obras={opcoesObra}
          lugares={lugaresDaFicha}
          obraCarretasEmt={estado.config.obraCarretasEmt}
          levarPara={levarParaLote}
          codigoDaMaquina={(id) =>
            equipamentosVistos.find((e) => e.id === id)?.codigo ?? null
          }
          onCancelar={() => setLote(null)}
          onConfirmar={confirmarLote}
        />
      ) : null}
      {pedidoEstado ? (
        <DialogoEstado
          pedido={pedidoEstado}
          hoje={estado.hoje}
          onCancelar={() => setPedidoEstado(null)}
          onConfirmar={confirmarEstado}
        />
      ) : null}

      <QuadroAlocacao
        pedido={quadro}
        onFechar={() => setQuadro(null)}
        telaLarga={telaLarga}
        pessoas={estado.pessoas}
        maquinas={equipamentosVistos}
        localidades={estado.localidades}
        obras={estado.obras}
        centrosCusto={centrosCusto}
        salvando={salvando}
        onSalvar={(itens) => alocarComDesfazer(itens)}
      />
      {pendentePessoa ? (
        <ConfirmDialog
          aberto
          onAbertoChange={(aberto) => {
            if (!aberto) setPendentePessoa(null);
          }}
          titulo={
            pendentePessoa.sobre
              ? `${pendentePessoa.pessoa.nome} opera ${pendentePessoa.sobre.codigo}?`
              : pendentePessoa.local
                ? `${pendentePessoa.pessoa.nome} trabalha em ${pendentePessoa.local.nome}?`
                : pendentePessoa.obra
                  ? `${pendentePessoa.pessoa.nome} trabalha na obra ${pendentePessoa.obra.nome}?`
                  : `Realocar ${pendentePessoa.pessoa.nome}`
          }
          descricao={
            pendentePessoa.sobre
              ? `A pessoa passa a ser o operador de ${pendentePessoa.sobre.codigo}${pendentePessoa.sobre.operadorNome ? ` no lugar de ${pendentePessoa.sobre.operadorNome}` : ""} e acompanha a máquina no mapa.`
              : pendentePessoa.local
                ? `${pendentePessoa.para ? `A pessoa trabalha em ${pendentePessoa.local.nome} e fica no ponto tocado` : `A pessoa aparece no ponto de ${pendentePessoa.local.nome}`} até ser realocada.${pendentePessoa.pessoa.equipamentoId ? ` Deixa de operar ${equipamentosVistos.find((e) => e.id === pendentePessoa.pessoa.equipamentoId)?.codigo ?? "a máquina"}.` : ""}`
                : pendentePessoa.obra
                  ? `A obra passa a ser o local de trabalho enquanto estiver ativa: os dias trabalhados contam na obra (ou no centro escolhido na ficha).${pendentePessoa.para ? "" : " A pessoa fica sem posição até ser posta no mapa."}${pendentePessoa.pessoa.equipamentoId ? ` Deixa de operar ${equipamentosVistos.find((e) => e.id === pendentePessoa.pessoa.equipamentoId)?.codigo ?? "a máquina"}.` : ""}`
                  : `A pessoa fica neste ponto (${pendentePessoa.para?.[1].toFixed(5)}, ${pendentePessoa.para?.[0].toFixed(5)}) até ser realocada de novo.${pendentePessoa.pessoa.equipamentoId ? ` Deixa de operar ${equipamentosVistos.find((e) => e.id === pendentePessoa.pessoa.equipamentoId)?.codigo ?? "a máquina"}.` : ""}`
          }
          textoConfirmar={
            pendentePessoa.sobre
              ? "Assinalar operador"
              : pendentePessoa.local
                ? "Pôr no local"
                : pendentePessoa.obra
                  ? "Pôr na obra"
                  : "Realocar"
          }
          exigeMotivo={false}
          onConfirmar={confirmarPessoa}
        />
      ) : null}

      {encerrando ? (
        <ConfirmDialog
          aberto
          onAbertoChange={(aberto) => {
            if (!aberto) setEncerrando(null);
          }}
          titulo={`Encerrar a locação de ${encerrando.codigo}`}
          descricao="A máquina sai do mapa e a vigência da locação fecha na data informada. O custo do período fica no relatório de locações."
          textoConfirmar="Encerrar locação"
          variante="destrutivo"
          conteudo={
            <div className="flex flex-col gap-2">
              <Label htmlFor="mapa-fim-locacao">Data do fim</Label>
              <Input
                id="mapa-fim-locacao"
                type="date"
                value={fimLocacao}
                onChange={(e) => setFimLocacao(e.target.value)}
                className="max-w-[12rem]"
              />
            </div>
          }
          onConfirmar={confirmarEncerramento}
        />
      ) : null}

      <DrawerLocacao
        aberto={drawerLocacao}
        onAbertoChange={setDrawerLocacao}
        hoje={estado.hoje}
        candidatos={estado.foraDoMapa}
        fornecedores={estado.fornecedores}
        fornecedorColorado={estado.config.fornecedorColorado}
        tiposConhecidos={tiposConhecidos}
        onSucesso={aoIniciarLocacao}
      />

      <DrawerDiarista
        aberto={drawerDiarista}
        onAbertoChange={setDrawerDiarista}
        candidatos={estado.diaristasFora}
        funcoes={estado.funcoes}
        podeCadastrar={!!permissoes.cadastrarColaborador}
        onSucesso={aoEntrarDiarista}
      />

      {tirando ? (
        <ConfirmDialog
          aberto
          onAbertoChange={(aberto) => {
            if (!aberto) setTirando(null);
          }}
          titulo={`Tirar ${tirando.nome} do mapa`}
          descricao="O diarista sai da máquina e do local e some do mapa. A partir de amanhã não conta mais dia nem diária. O cadastro no RH não muda; para voltar, use Adicionar diarista."
          textoConfirmar="Tirar do mapa"
          variante="destrutivo"
          onConfirmar={confirmarTirarDiarista}
        />
      ) : null}
    </div>
  );
}
