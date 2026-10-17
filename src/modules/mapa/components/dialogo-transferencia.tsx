"use client";

import * as React from "react";

import { Combobox, ConfirmDialog } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatarKm,
  formatarMetros,
  sugereAjuste,
  type DestinoResolvido,
} from "@/modules/mapa/geo";
import {
  PELA_ZONA,
  SEM_OBRA,
  decisaoObra,
  escolhaInicialObra,
  obraDoDestino,
  obraEfetiva,
  type DecisaoObra,
} from "@/modules/mapa/obra-destino";
import { rotuloTipoLocalidade } from "@/modules/mapa/rotulos";
import {
  ROTULO_ESTADO,
  ROTULO_TIPO_AREA,
  type EquipamentoMapa,
  type EstadoMaquina,
  type Posicao,
} from "@/modules/mapa/tipos";

/**
 * Confirmação do arraste (ou do "posicionar"): diz onde cada máquina vai cair, segundo a mesma
 * regra do banco (área > trecho > local > livre), pede a data efetiva e o motivo, e só pergunta
 * o estado quando alguma que ainda não está no mapa caiu fora de qualquer zona. Transferir não muda o
 * estado de quem já está no mapa (v1.27): o da zona só vale na primeira entrada. No arraste, a pessoa escolhe entre
 * transferência e ajuste de localização (só corrige o ponto: estado, obra e frente ficam, sem data
 * nem estado); a sugestão vem de `sugereAjuste` (continua na mesma zona = ajuste). Confirmar grava; cancelar devolve as
 * máquinas para onde estavam. Montado pelo pai só enquanto há pedido, por isso nasce limpo.
 *
 * Fora do ajuste, a "Obra em que trabalha" vem da zona e pode ser trocada; não é obrigatória:
 * vazio é "Sem obra", e a linha da máquina diz a obra que ela deixa (obra-destino.ts). No modo "destino"
 * (botão "Transferir" da ficha, sem arraste) a pessoa escolhe primeiro PARA ONDE (uma obra, um
 * local ou uma área do mapa) e depois em que obra a máquina trabalha; o lugar só sugere a obra.
 * O ponto vem do pai (`levarPara`).
 */

export interface ItemPendente {
  equipamento: EquipamentoMapa;
  de: Posicao | null;
  para: Posicao;
  destino: DestinoResolvido;
}

export interface Pendente {
  modo: "arraste" | "posicionar" | "destino";
  principal: EquipamentoMapa;
  /** No modo "destino" vem vazio: os itens nascem do lugar escolhido (`levarPara`). */
  itens: ItemPendente[];
}

export interface ObraOpcao {
  id: string;
  nome: string;
}

export interface ConfirmacaoTransferencia {
  data: string;
  motivo: string;
  /** Estado para os itens que caíram em ponto livre. */
  estadoLivre: EstadoMaquina;
  /** Só corrige o ponto no mapa; não é transferência. */
  ajuste: boolean;
  /** Os itens que vão gravar (no modo "destino", os do ponto do lugar escolhido). */
  itens: ItemPendente[];
  /** Obra de destino; null só no ajuste, que não mexe na obra. Vazio no campo vira "Sem obra". */
  obra: DecisaoObra | null;
}

const ESTADOS_LIVRE: EstadoMaquina[] = ["operando", "parado"];

/**
 * Onde a máquina cai. O estado da zona só aparece para quem entra no mapa agora (`comEstado`);
 * quem já está mantém o seu, e no ajuste nada muda.
 */
function descreverDestino(d: DestinoResolvido, comEstado: boolean): string {
  const estado = (e: EstadoMaquina) =>
    comEstado ? ` · ${ROTULO_ESTADO[e].toLowerCase()}` : "";
  switch (d.tipo) {
    case "area":
      return `${d.area.nome} (${ROTULO_TIPO_AREA[d.area.tipo] ?? d.area.tipo})${estado(d.estado)}`;
    case "trecho":
      return `${d.trecho.nome} · km ${formatarKm(d.km)} · a ${formatarMetros(d.distanciaM)} do traçado${estado(d.estado)}`;
    case "localidade":
      return `${d.local.nome} (${rotuloTipoLocalidade(d.local.tipo).toLowerCase()}, ${formatarMetros(d.distanciaM)})${estado(d.estado)}`;
    default:
      return `Fora de qualquer zona (${d.pos[1].toFixed(5)}, ${d.pos[0].toFixed(5)})`;
  }
}


const ROTULO_SEM_OBRA = "Sem obra (pátio central, oficina, em trânsito)";

/** Um lugar para onde a ficha manda a máquina: uma obra, um local ou uma área do mapa. */
export interface LugarOpcao {
  /** "obra:<id>", "local:<id>" ou "area:<id>". */
  chave: string;
  rotulo: string;
}

/** O que a máquina vira ao ir para o lugar escolhido na ficha. */
export interface DestinoDaFicha {
  itens: ItemPendente[];
  /** A obra do lugar (a própria obra, ou a obra do local ou da área); null = lugar sem obra. */
  obraSugerida: string | null;
}

export function DialogoTransferencia({
  pendente,
  hoje,
  obras,
  lugares,
  levarPara,
  obraCarretasEmt = null,
  onCancelar,
  onConfirmar,
}: {
  pendente: Pendente;
  /**
   * Obra "001 - Carretas EMT": a das carretas da EMT Transportes, fixa (o banco impõe, v1.22).
   * Só com carretas na transferência, o campo some e a obra é essa.
   */
  obraCarretasEmt?: string | null;
  hoje: string;
  /** Todas as obras, para o campo "Obra em que trabalha". */
  obras: ObraOpcao[];
  /** Modo "destino": obras, locais e áreas com lugar no mapa. */
  lugares: LugarOpcao[];
  /** Modo "destino": onde a máquina cai no lugar escolhido; null = lugar sem ponto no mapa. */
  levarPara: (chave: string) => DestinoDaFicha | null;
  onCancelar: () => void;
  onConfirmar: (dados: ConfirmacaoTransferencia) => Promise<boolean>;
}) {
  const [data, setData] = React.useState(hoje);
  const [motivo, setMotivo] = React.useState("");
  const [estadoLivre, setEstadoLivre] =
    React.useState<EstadoMaquina>("operando");
  const idData = React.useId();
  const idMotivo = React.useId();
  const idEstado = React.useId();
  const idObra = React.useId();
  const idLugar = React.useId();
  const daFicha = pendente.modo === "destino";
  const podeAjustar =
    pendente.modo === "arraste" &&
    pendente.itens.every((i) => i.equipamento.pos !== null);
  const [ajuste, setAjuste] = React.useState(
    () =>
      podeAjustar &&
      pendente.itens.every((i) => sugereAjuste(i.equipamento, i.destino)),
  );
  const soCarretas =
    obraCarretasEmt !== null &&
    (daFicha
      ? pendente.principal.carretaEmt
      : pendente.itens.length > 0 &&
        pendente.itens.every((i) => i.equipamento.carretaEmt));
  const escolhaInicial = React.useMemo(
    () =>
      soCarretas && obraCarretasEmt
        ? obraCarretasEmt
        : daFicha
          ? ""
          : escolhaInicialObra(pendente.itens.map((i) => i.destino)),
    [daFicha, soCarretas, obraCarretasEmt, pendente.itens],
  );
  const [escolhaObra, setEscolhaObra] = React.useState(escolhaInicial);
  const [lugar, setLugar] = React.useState("");
  const destinoDaFicha = React.useMemo(
    () => (daFicha && lugar ? levarPara(lugar) : null),
    [daFicha, lugar, levarPara],
  );

  /** Trocou o lugar: a obra em que trabalha passa a ser a do lugar (pode trocar depois). */
  function escolherLugar(chave: string) {
    setLugar(chave);
    if (soCarretas) return;
    const d = chave ? levarPara(chave) : null;
    setEscolhaObra(
      d?.obraSugerida ??
        (d ? escolhaInicialObra(d.itens.map((i) => i.destino)) : ""),
    );
  }

  const itens = React.useMemo(
    () => (daFicha ? (destinoDaFicha?.itens ?? []) : pendente.itens),
    [daFicha, destinoDaFicha, pendente.itens],
  );
  const nomeObra = React.useMemo(
    () => new Map(obras.map((o) => [o.id, o.nome])),
    [obras],
  );
  const opcoesObra = React.useMemo(
    () => [
      ...(escolhaInicial === PELA_ZONA
        ? [{ valor: PELA_ZONA, rotulo: "Cada uma pela obra do ponto onde caiu" }]
        : []),
      ...obras.map((o) => ({ valor: o.id, rotulo: o.nome })),
      { valor: SEM_OBRA, rotulo: ROTULO_SEM_OBRA },
    ],
    [obras, escolhaInicial],
  );
  const opcoesLugar = React.useMemo(
    () => lugares.map((l) => ({ valor: l.chave, rotulo: l.rotulo })),
    [lugares],
  );

  const n = daFicha ? 1 : pendente.itens.length;
  const algumLivre =
    !ajuste &&
    itens.some((i) => i.destino.tipo === "livre" && i.equipamento.pos === null);
  const alvo = n > 1 ? `${n} equipamentos` : pendente.principal.codigo;
  const titulo =
    pendente.modo === "posicionar"
      ? `Posicionar ${pendente.principal.codigo}`
      : ajuste
        ? `Ajustar localização de ${alvo}`
        : `Transferir ${alvo}`;

  /** "Obra: X" ou "Sem obra" na linha de cada máquina, e o aviso quando a escolha vence a zona. */
  function obraDaLinha(item: ItemPendente): {
    texto: string;
    aviso: string | null;
  } {
    if (item.equipamento.carretaEmt && obraCarretasEmt)
      return {
        texto: `Obra: ${nomeObra.get(obraCarretasEmt) ?? "Carretas EMT"} (fixa: carreta da EMT Transportes)`,
        aviso: null,
      };
    const efetiva = obraEfetiva(escolhaObra, item.destino);
    const daZona = obraDoDestino(item.destino);
    const texto = efetiva
      ? `Obra: ${nomeObra.get(efetiva) ?? "obra escolhida"}`
      : "Sem obra";
    const obraAtual = item.equipamento.obraId;
    const aviso =
      !daFicha && efetiva && daZona && daZona !== efetiva
        ? `O ponto é de ${nomeObra.get(daZona) ?? "outra obra"}; a máquina fica com a obra escolhida.`
        : !efetiva && obraAtual
          ? `Deixa a obra ${nomeObra.get(obraAtual) ?? item.equipamento.obraNome}.`
          : null;
    return { texto, aviso };
  }

  return (
    <ConfirmDialog
      aberto
      onAbertoChange={(aberto) => {
        if (!aberto) onCancelar();
      }}
      titulo={titulo}
      descricao={
        pendente.modo === "posicionar"
          ? "A máquina entra no mapa neste ponto. A alocação e a movimentação ficam registradas."
          : daFicha
            ? "Escolha para onde a máquina vai e em que obra ela trabalha. Depois, se quiser, arraste para o lugar exato (ajuste de localização)."
            : ajuste
              ? "Só corrige o ponto no mapa. Estado, obra e frente continuam os mesmos; não conta como transferência."
              : "A posição nova vale a partir da data efetiva e fica na trilha de movimentações. O estado da máquina não muda."
      }
      textoConfirmar={
        pendente.modo === "posicionar"
          ? "Posicionar"
          : ajuste
            ? "Ajustar"
            : "Transferir"
      }
      conteudo={
        <div className="flex flex-col gap-4">
          {podeAjustar ? (
            <div
              role="group"
              aria-label="Tipo de mudança"
              className="grid grid-cols-2 gap-2"
            >
              <Button
                type="button"
                variant={ajuste ? "default" : "outline"}
                aria-pressed={ajuste}
                onClick={() => setAjuste(true)}
              >
                Ajuste de localização
              </Button>
              <Button
                type="button"
                variant={ajuste ? "outline" : "default"}
                aria-pressed={!ajuste}
                onClick={() => setAjuste(false)}
              >
                Transferência
              </Button>
            </div>
          ) : null}
          {daFicha ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor={idLugar}>Para onde</Label>
              <Combobox
                id={idLugar}
                valor={lugar}
                onValorChange={escolherLugar}
                opcoes={opcoesLugar}
                placeholder="Obra, local ou área"
                buscaPlaceholder="Buscar obra, local ou área"
                vazioTexto="Nada com lugar no mapa"
              />
            </div>
          ) : null}
          {ajuste || soCarretas ? null : (
            <div className="flex flex-col gap-2">
              <Label htmlFor={idObra}>Obra em que trabalha</Label>
              <Combobox
                id={idObra}
                valor={escolhaObra}
                onValorChange={setEscolhaObra}
                opcoes={opcoesObra}
                placeholder="Sem obra"
                buscaPlaceholder="Buscar obra"
                vazioTexto="Nenhuma obra encontrada"
              />
            </div>
          )}
          {itens.length > 0 ? (
            <ul className="flex flex-col gap-2 text-detalhe">
              {itens.map((item) => {
                const linha = ajuste ? null : obraDaLinha(item);
                const entra = item.equipamento.pos === null;
                return (
                  <li
                    key={item.equipamento.id}
                    className="rounded-md border border-border bg-surface px-3 py-2"
                  >
                    <p className="font-medium text-foreground">
                      {item.equipamento.codigo}{" "}
                      <span className="font-normal text-muted-foreground">
                        {item.equipamento.descricao}
                      </span>
                    </p>
                    <p className="text-muted-foreground">
                      {descreverDestino(item.destino, !ajuste && entra)}
                    </p>
                    {!ajuste && !entra ? (
                      <p className="text-muted-foreground">
                        Continua {ROTULO_ESTADO[item.equipamento.estado].toLowerCase()}.
                      </p>
                    ) : null}
                    {linha ? (
                      <p className="text-foreground">{linha.texto}</p>
                    ) : null}
                    {linha?.aviso ? (
                      <p className="text-muted-foreground">{linha.aviso}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
          {algumLivre ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor={idEstado}>
                Fora de qualquer zona: qual o estado?
              </Label>
              <Select
                value={estadoLivre}
                onValueChange={(v) => setEstadoLivre(v as EstadoMaquina)}
              >
                <SelectTrigger id={idEstado} className="w-full max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ESTADOS_LIVRE.map((e) => (
                    <SelectItem key={e} value={e}>
                      {ROTULO_ESTADO[e]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div
            className={
              ajuste ? "grid gap-4" : "grid gap-4 sm:grid-cols-[10rem_1fr]"
            }
          >
            {ajuste ? null : (
              <div className="flex flex-col gap-2">
                <Label htmlFor={idData}>Data efetiva</Label>
                <Input
                  id={idData}
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor={idMotivo}>Motivo</Label>
              <Input
                id={idMotivo}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder={
                  ajuste
                    ? "ex.: ponto corrigido para dentro do pátio"
                    : "ex.: frente de CBUQ km 701"
                }
                maxLength={300}
              />
            </div>
          </div>
        </div>
      }
      onConfirmar={() => {
        if (daFicha && !lugar) {
          toast.warning("Escolha para onde a máquina vai.");
          return false;
        }
        const obra = ajuste ? null : decisaoObra(escolhaObra);
        if (itens.length === 0) {
          toast.warning("Esse lugar ainda não tem ponto no mapa.");
          return false;
        }
        return onConfirmar({
          data: ajuste ? hoje : data,
          motivo: motivo.trim(),
          estadoLivre,
          ajuste,
          itens,
          obra,
        });
      }}
    />
  );
}
