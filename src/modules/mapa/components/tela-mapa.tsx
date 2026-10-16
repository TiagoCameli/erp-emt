"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Box,
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
  Satellite,
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
import { cn } from "@/lib/utils";
import {
  ajustarRaioLocal,
  assinalarOperador,
  colocarLocal,
  desenharObra,
  editarLocal,
  encerrarLocacao,
  girarEquipamento,
  marcarEstado,
  moverEquipamentos,
  moverPessoas,
  posicionarObjeto,
  posicionarObra,
  recarregarEstado,
  tirarObra,
  vincularLocal,
  type ResultadoMapa,
} from "@/modules/mapa/actions";
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
  DialogoAdicionarLocal,
  DialogoAdicionarObra,
  DialogoConcluirDesenho,
  type PedidoColocar,
} from "@/modules/mapa/components/dialogos-adicionar";
import { DrawerLocacao } from "@/modules/mapa/components/drawer-locacao";
import { FichaEquipamento } from "@/modules/mapa/components/ficha-equipamento";
import { FichaLocal } from "@/modules/mapa/components/ficha-local";
import { FichaObjeto } from "@/modules/mapa/components/ficha-objeto";
import { FichaObra } from "@/modules/mapa/components/ficha-obra";
import {
  ESCALA_MAQUINA,
  RAIO_MINIMO_ANEL_PX,
  RAIO_MINIMO_GIRO_PX,
  raioDoAnelM,
} from "@/modules/mapa/components/camadas";
import { rotaPelaEstrada } from "@/modules/mapa/components/rota-estrada";
import {
  MapaEmt,
  type Alvo,
  type ArrasteSolto,
  type CartaoNoMapa,
  type CenaBase,
  type Foco,
  type GiroMapa,
  type ModoFundo,
  type TipoMotor,
} from "@/modules/mapa/components/mapa-emt";
import {
  FILTROS_VAZIOS,
  PainelMapa,
  type FiltrosMapa,
} from "@/modules/mapa/components/painel-mapa";
import {
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
import { linhasDaFicha, objetosDoEstoque } from "@/modules/mapa/objetos";
import { ORDEM_ESTADOS, rotuloTipoLocalidade } from "@/modules/mapa/rotulos";
import {
  ROTULO_ESTADO,
  type ConfigGoogle,
  type AlvoObjeto,
  type EquipamentoMapa,
  type ObraMapa,
  type EstadoEfetivo,
  type EstadoMapa,
  type PermissoesMapa,
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
}

export function TelaMapa({
  inicial,
  google,
  permissoes,
  colocarInicial = null,
}: TelaMapaProps) {
  const router = useRouter();
  const [estado, setEstado] = React.useState(inicial);
  // Quando o servidor manda um estado novo (router.refresh), a tela adota (padrão "derivar na
  // renderização", sem efeito).
  const [inicialAnterior, setInicialAnterior] = React.useState(inicial);
  if (inicial !== inicialAnterior) {
    setInicialAnterior(inicial);
    setEstado(inicial);
  }

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
  const [giroMapa, setGiroMapa] = React.useState<GiroMapa | null>(null);
  const girarMapa = (delta: number | null) =>
    setGiroMapa((g) => ({ delta, chave: (g?.chave ?? 0) + 1 }));
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
  const [hover, setHover] = React.useState<string | null>(null);
  const [fundo, setFundo] = React.useState<ModoFundo>("mapa");
  const [inclinado, setInclinado] = React.useState(true);
  const [multi, setMulti] = React.useState(false);
  const [mostrarPessoas, setMostrarPessoas] = React.useState(true);
  const [mostrarRotulos, setMostrarRotulos] = React.useState(true);
  const [mostrarAreas, setMostrarAreas] = React.useState(true);
  const [filtros, setFiltros] = React.useState<FiltrosMapa>(FILTROS_VAZIOS);
  const [posicionando, setPosicionando] = React.useState<string | null>(null);
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
  const [pendentePessoa, setPendentePessoa] = React.useState<{
    pessoa: PessoaMapa;
    para: Posicao;
    sobre: EquipamentoMapa | null;
  } | null>(null);
  const [pedidoEstado, setPedidoEstado] = React.useState<PedidoEstado | null>(
    null,
  );
  const [encerrando, setEncerrando] = React.useState<EquipamentoMapa | null>(
    null,
  );
  const [fimLocacao, setFimLocacao] = React.useState("");
  const [drawerLocacao, setDrawerLocacao] = React.useState(false);
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
    for (const e of estado.equipamentos)
      if (e.obraId && !mapa.has(e.obraId)) mapa.set(e.obraId, e.obraNome);
    return [...mapa]
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [estado.trechos, estado.equipamentos]);

  // Busca e obra recortam tudo; o estado recorta só as listas e a cena (as contagens mostram o todo).
  const baseFiltrada = React.useMemo(() => {
    const termo = normalizar(filtros.busca.trim());
    return estado.equipamentos.filter((e) => {
      if (filtros.obraId && e.obraId !== filtros.obraId) return false;
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
  }, [estado.equipamentos, filtros.busca, filtros.obraId]);

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
    if (pendentePessoa)
      mapa.set(
        pendentePessoa.pessoa.id,
        pendentePessoa.sobre?.pos ?? pendentePessoa.para,
      );
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
    () => objetos.flatMap((o) => (o.pos ? [{ ...o, pos: o.pos }] : [])),
    [objetos],
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
    const e = estado.equipamentos.find((x) => x.id === ficha.id);
    if (!e || !e.pos || e.fontePosicao === "gps" || !selecao.has(e.id))
      return null;
    return {
      id: e.id,
      pos: e.pos,
      raioM: e.modelo3d === "usina_asfalto" ? RAIO_GIRO_USINA_M : RAIO_GIRO_M,
    };
  }, [permissoes.editar, ficha, selecao, estado.equipamentos]);

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
      if (!pos) return [];
      // Operador de máquina filtrada para fora some junto com ela.
      if (
        p.equipamentoId &&
        !idsNaCena.has(p.equipamentoId) &&
        estado.equipamentos.some((e) => e.id === p.equipamentoId)
      )
        return [];
      return [{ ...p, pos }];
    });
    return {
      equipamentos,
      pessoas,
      trechos: trechosMedidos,
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
    medidosPorId,
    estado.pessoas,
    estado.equipamentos,
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
    estado.config.snapLocalM,
    trechosMedidos,
    marcos,
    modelos,
    mostrarPessoas,
    mostrarRotulos,
    mostrarAreas,
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
      ? (estado.equipamentos.find((e) => e.id === ficha.id) ?? null)
      : null;
  const pessoaFicha =
    ficha?.tipo === "pessoa"
      ? (estado.pessoas.find((p) => p.id === ficha.id) ?? null)
      : null;
  const posicionandoEquipamento = posicionando
    ? (estado.equipamentos.find((e) => e.id === posicionando) ?? null)
    : null;
  const tiposConhecidos = React.useMemo(
    () =>
      [
        ...new Set(
          [...estado.equipamentos, ...estado.foraDoMapa]
            .map((e) => e.tipo)
            .filter(Boolean),
        ),
      ].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [estado.equipamentos, estado.foraDoMapa],
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
      if (alvo.tipo === "equipamento") {
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
      abrirFicha(alvo);
    },
    [multi, abrirFicha],
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
        setPendentePessoa({
          pessoa,
          para: item.para,
          sobre: maquinaEm(item.para, cena.equipamentos),
        });
        return;
      }
      const itens = arraste.itens.flatMap((i) => {
        if (i.alvo.tipo !== "equipamento") return [];
        const equipamento = estado.equipamentos.find((e) => e.id === i.alvo.id);
        if (!equipamento) return [];
        if (equipamento.fontePosicao === "gps") {
          toast.warning(
            `${equipamento.codigo} tem posição por GPS e não pode ser arrastado.`,
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
      estado.equipamentos,
      cena.equipamentos,
      ctxDestino,
    ],
  );

  const clicarMapa = React.useCallback(
    (pos: Posicao) => {
      if (desenho) {
        setDesenho((d) => (d ? { ...d, pontos: [...d.pontos, pos] } : d));
        return;
      }
      if (colocando) {
        setPontoColocar(pos);
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
    [posicionandoEquipamento, ctxDestino, colocando, desenho],
  );

  const escolherNoMapa = React.useCallback((pedido: PedidoColocar) => {
    setAdicionando(null);
    setPosicionando(null);
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

  const confirmarTransferencia = React.useCallback(
    async ({ data, motivo, estadoLivre, ajuste }: ConfirmacaoTransferencia) => {
      if (!pendente) return true;
      setSalvando(true);
      try {
        const r = await moverEquipamentos({
          itens: pendente.itens.map((it) => {
            const pos = it.destino.tipo === "trecho" ? it.destino.pos : it.para;
            return {
              id: it.equipamento.id,
              lng: pos[0],
              lat: pos[1],
              estado:
                !ajuste && it.destino.tipo === "livre"
                  ? estadoLivre
                  : undefined,
            };
          }),
          data,
          motivo: motivo || undefined,
          ajuste: ajuste || undefined,
        });
        const n = pendente.itens.length;
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
        const { pessoa, para, sobre } = pendentePessoa;
        const r = sobre
          ? await assinalarOperador({
              equipamentoId: sobre.id,
              colaboradorId: pessoa.id,
              motivo: motivo?.trim() || undefined,
            })
          : await moverPessoas({
              ids: [pessoa.id],
              destino: { lng: para[0], lat: para[1] },
              data: estado.hoje,
              motivo: motivo?.trim() || undefined,
            });
        const ok = aplicar(
          r,
          sobre
            ? `${pessoa.nome} passa a operar ${sobre.codigo}`
            : `${pessoa.nome} realocado`,
        );
        if (ok) setPendentePessoa(null);
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
          deslocamento: dados.deslocamento
            ? {
                origem: dados.deslocamento.origem || undefined,
                destino: dados.deslocamento.destino || undefined,
                transporte: dados.deslocamento.transporte || undefined,
                previsao: dados.deslocamento.previsao || undefined,
              }
            : undefined,
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

  const assinalar = React.useCallback(
    async (colaboradorId: string | null) => {
      if (!equipamentoFicha) return;
      setSalvando(true);
      try {
        const r = await assinalarOperador({
          equipamentoId: equipamentoFicha.id,
          colaboradorId,
        });
        aplicar(r, colaboradorId ? "Operador assinalado" : "Operador retirado");
      } finally {
        setSalvando(false);
      }
    },
    [equipamentoFicha, aplicar],
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
      abrirFicha({ tipo: "equipamento", id: e.id });
      if (e.pos) focar(e.pos, 15);
    },
    [focar, multi, abrirFicha],
  );

  const iniciarPosicionar = React.useCallback(
    (e: EquipamentoMapa) => {
      setPosicionando(e.id);
      abrirFicha({ tipo: "equipamento", id: e.id });
      setSelecao(new Set([e.id]));
      toast.info(`Toque no mapa onde está ${e.codigo}.`);
    },
    [abrirFicha],
  );

  const aoIniciarLocacao = React.useCallback(
    (
      resultado: Extract<ResultadoMapa, { ok: true }>,
      equipamentoId: string | null,
    ) => {
      if (!resultado.estado) return;
      const antes = new Set(estado.equipamentos.map((e) => e.id));
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
    [estado.equipamentos, abrirFicha],
  );

  const aoMotor = React.useCallback((tipo: TipoMotor, aviso: string | null) => {
    setMotor({ tipo, aviso });
    if (aviso) toast.warning(aviso);
  }, []);

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
  ) => (
    <Button
      type="button"
      size="xs"
      variant={ativo ? "default" : "outline"}
      onClick={onClick}
      aria-pressed={ativo}
      title={rotulo}
      className="bg-background/95 backdrop-blur data-[ativo=true]:bg-primary"
      data-ativo={ativo}
    >
      <Icone className="size-3" />
      <span className="max-sm:sr-only">{rotulo}</span>
    </Button>
  );

  // A ficha da máquina, da pessoa ou do objeto tocado. Em tela larga ela abre ao lado dele, no
  // mapa (pedido do Tiago, 16/10/2026); no celular, ou sem lugar no mapa, fica na lateral.
  const fichaFlutuante: React.ReactNode = equipamentoFicha ? (
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
      permissoes={permissoes}
      selecionados={selecao.size}
      salvando={salvando}
      onFechar={() => setFicha(null)}
      onFocar={() => equipamentoFicha.pos && focar(equipamentoFicha.pos, 16)}
      onPosicionar={() => iniciarPosicionar(equipamentoFicha)}
      onMarcarEstado={(s) =>
        setPedidoEstado({ equipamento: equipamentoFicha, estado: s })
      }
      onAssinalarOperador={assinalar}
      onEncerrarLocacao={() => {
        setFimLocacao(estado.hoje);
        setEncerrando(equipamentoFicha);
      }}
    />
  ) : pessoaFicha ? (
    <section
      className="flex flex-col gap-1 rounded-lg border border-border bg-background p-3 text-detalhe"
      aria-label={`Ficha de ${pessoaFicha.nome}`}
    >
      <p className="text-corpo font-semibold">{pessoaFicha.nome}</p>
      <p className="text-muted-foreground">
        {[pessoaFicha.funcao, pessoaFicha.vinculo, pessoaFicha.equipeNome]
          .filter(Boolean)
          .join(" · ") || "Sem função cadastrada"}
      </p>
      <p>
        Opera:{" "}
        {pessoaFicha.equipamentoId ? (
          (estado.equipamentos.find((e) => e.id === pessoaFicha.equipamentoId)
            ?.codigo ?? "–")
        ) : (
          <span className="text-muted-foreground">ninguém assinalado</span>
        )}
      </p>
      {permissoes.editar ? (
        <p className="text-legenda text-muted-foreground">
          Arraste a pessoa até uma máquina para assinalar como operador.
        </p>
      ) : null}
    </section>
  ) : objetoDaFicha ? (
    <FichaObjeto
      key={objetoDaFicha.id}
      objeto={objetoDaFicha}
      linhas={linhasDaFicha(objetoDaFicha, {
        tanques: estado.tanques,
        pilhas: estado.pilhas,
        depositos: estado.depositos,
        localidades: estado.localidades,
        equipamentos: estado.equipamentos,
      })}
      podeEditar={permissoes.editar}
      onFechar={() => setObjetoFicha(null)}
      onMover={() =>
        escolherNoMapa({
          tipo: "objeto",
          alvo: objetoDaFicha.alvo,
          id: objetoDaFicha.id,
          rotulo: objetoDaFicha.nome,
        })
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
        raioM: 3,
        raioMinimoPx: 14,
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
          permissoes.editar ? (
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
          ) : undefined
        }
      />
      <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row">
        <div className="relative h-[48dvh] shrink-0 overflow-hidden rounded-lg border border-border md:h-auto md:min-h-0 md:flex-1">
          <MapaEmt
            google={google}
            cena={cena}
            selecao={selecao}
            hover={hover}
            posicoesPendentes={null}
            fundo={fundo}
            inclinado={inclinado}
            podeArrastar={permissoes.editar && !pendente && !pendentePessoa}
            modoPosicionar={
              (desenho !== null && desenhoFinal === null) ||
              ((posicionando !== null || colocando !== null) &&
                !pendente &&
                !pontoColocar)
            }
            foco={foco}
            giroMapa={giroMapa}
            centroInicial={centroInicial}
            onSelecionar={selecionar}
            onHover={setHover}
            onSoltar={soltar}
            onClicarMapa={clicarMapa}
            onClicarLocal={clicarLocal}
            onClicarObra={clicarObra}
            onClicarObjeto={clicarObjeto}
            onGirarPrevia={girarPeloAnel}
            onGirarFim={soltarAnel}
            onMotor={aoMotor}
            cartao={cartao}
          />
          <div className="pointer-events-none absolute inset-x-2 top-2 flex flex-wrap items-start justify-between gap-2">
            <div className="pointer-events-auto flex flex-wrap gap-1.5">
              {botaoAlternar(fundo === "satelite", "Satélite", Satellite, () =>
                setFundo((f) => (f === "satelite" ? "mapa" : "satelite")),
              )}
              {botaoAlternar(inclinado, "3D", Box, () =>
                setInclinado((v) => !v),
              )}
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
                    setMulti((v) => !v),
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
            </div>
            <div className="flex gap-1.5">
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
          {desenho && !desenhoFinal ? (
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
          {/* No canto de cima para não cobrir o logo nem a atribuição do Google (ficam embaixo). */}
          {motor ? (
            <div
              className="pointer-events-none absolute top-11 right-2 max-w-[60%] truncate rounded-md bg-background/90 px-2 py-0.5 text-legenda text-muted-foreground backdrop-blur"
              title={motor.aviso ?? undefined}
            >
              {ROTULO_MOTOR[motor.tipo]}
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
            pessoasNoMapa={cena.pessoas}
            selecao={selecao}
            posicionando={posicionandoEquipamento}
            permissoes={permissoes}
            temCandidatosLocacao={estado.foraDoMapa.length > 0}
            onPosicionar={iniciarPosicionar}
            onCancelarPosicionar={() => setPosicionando(null)}
            onEscolherEquipamento={escolherEquipamento}
            onEscolherPessoa={(p) => {
              abrirFicha({ tipo: "pessoa", id: p.id });
              if (p.pos) focar(p.pos, 16);
            }}
            onAdicionarAlugada={() => setDrawerLocacao(true)}
            objetosSemLugar={objetosSemLugar}
            onEscolherObjeto={clicarObjeto}
          >
            {fichaNaLateral ? (
              fichaFlutuante
            ) : localDaFicha ? (
              <FichaLocal
                key={localDaFicha.id}
                local={localDaFicha}
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
                onSalvarDados={async (nome, tipos) => {
                  setSalvando(true);
                  try {
                    const r = await editarLocal({
                      localidadeId: localDaFicha.id,
                      nome,
                      tipos,
                    });
                    return aplicar(r, `${nome} salvo`);
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
          semPosicao={estado.localidadesSemPosicao}
          tanques={estado.tanques}
          depositos={estado.depositos}
          podeCriar={permissoes.criar}
          onCancelar={() => setAdicionando(null)}
          onEscolherNoMapa={escolherNoMapa}
          onLigar={ligarAoLocal}
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
          onCancelar={cancelarTransferencia}
          onConfirmar={confirmarTransferencia}
        />
      ) : null}
      {pedidoEstado ? (
        <DialogoEstado
          pedido={pedidoEstado}
          onCancelar={() => setPedidoEstado(null)}
          onConfirmar={confirmarEstado}
        />
      ) : null}

      {pendentePessoa ? (
        <ConfirmDialog
          aberto
          onAbertoChange={(aberto) => {
            if (!aberto) setPendentePessoa(null);
          }}
          titulo={
            pendentePessoa.sobre
              ? `${pendentePessoa.pessoa.nome} opera ${pendentePessoa.sobre.codigo}?`
              : `Realocar ${pendentePessoa.pessoa.nome}`
          }
          descricao={
            pendentePessoa.sobre
              ? `A pessoa passa a ser o operador de ${pendentePessoa.sobre.codigo}${pendentePessoa.sobre.operadorNome ? ` no lugar de ${pendentePessoa.sobre.operadorNome}` : ""} e acompanha a máquina no mapa.`
              : `A pessoa fica neste ponto (${pendentePessoa.para[1].toFixed(5)}, ${pendentePessoa.para[0].toFixed(5)}) até ser realocada de novo.`
          }
          textoConfirmar={
            pendentePessoa.sobre ? "Assinalar operador" : "Realocar"
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
    </div>
  );
}
