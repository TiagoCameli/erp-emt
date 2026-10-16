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
 * o estado quando alguma caiu fora de qualquer zona. No arraste, a pessoa escolhe entre
 * transferência e ajuste de localização (só corrige o ponto: estado, obra e frente ficam, sem data
 * nem estado); a sugestão vem de `sugereAjuste` (continua na mesma zona = ajuste). Confirmar grava; cancelar devolve as
 * máquinas para onde estavam. Montado pelo pai só enquanto há pedido, por isso nasce limpo.
 *
 * Fora do ajuste, a "Obra de destino" vem da zona e pode ser trocada; quando o ponto não é de
 * obra nenhuma, a pessoa escolhe a obra ou "Sem obra" (obra-destino.ts). No modo "obra" (botão
 * "Transferir para obra" da ficha, sem arraste) a obra é o próprio destino: a máquina vai para o
 * ponto da obra no mapa, que o pai calcula em `levarParaObra`.
 */

export interface ItemPendente {
  equipamento: EquipamentoMapa;
  de: Posicao | null;
  para: Posicao;
  destino: DestinoResolvido;
}

export interface Pendente {
  modo: "arraste" | "posicionar" | "obra";
  principal: EquipamentoMapa;
  /** No modo "obra" vem vazio: os itens nascem da obra escolhida (`levarParaObra`). */
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
  /** Os itens que vão gravar (no modo "obra", os do ponto da obra escolhida). */
  itens: ItemPendente[];
  /** Obra de destino; null só no ajuste, que não mexe na obra. */
  obra: DecisaoObra | null;
}

const ESTADOS_LIVRE: EstadoMaquina[] = ["operando", "parado"];

/** Onde a máquina cai; no ajuste sem o estado da zona, que não muda. */
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

export function DialogoTransferencia({
  pendente,
  hoje,
  obras,
  obrasNoMapa,
  levarParaObra,
  onCancelar,
  onConfirmar,
}: {
  pendente: Pendente;
  hoje: string;
  /** Todas as obras, para o campo "Obra de destino". */
  obras: ObraOpcao[];
  /** Só as que têm lugar no mapa: as que o modo "obra" pode receber. */
  obrasNoMapa: ObraOpcao[];
  /** Modo "obra": onde a máquina cai no ponto da obra; null = obra sem lugar no mapa. */
  levarParaObra: (obraId: string) => ItemPendente[] | null;
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
  const paraObra = pendente.modo === "obra";
  const podeAjustar =
    pendente.modo === "arraste" &&
    pendente.itens.every((i) => i.equipamento.pos !== null);
  const [ajuste, setAjuste] = React.useState(
    () =>
      podeAjustar &&
      pendente.itens.every((i) => sugereAjuste(i.equipamento, i.destino)),
  );
  const escolhaInicial = React.useMemo(
    () =>
      paraObra ? "" : escolhaInicialObra(pendente.itens.map((i) => i.destino)),
    [paraObra, pendente.itens],
  );
  const [escolhaObra, setEscolhaObra] = React.useState(escolhaInicial);

  const itens = React.useMemo(
    () =>
      paraObra
        ? escolhaObra
          ? (levarParaObra(escolhaObra) ?? [])
          : []
        : pendente.itens,
    [paraObra, escolhaObra, levarParaObra, pendente.itens],
  );
  const nomeObra = React.useMemo(
    () => new Map(obras.map((o) => [o.id, o.nome])),
    [obras],
  );
  const opcoesObra = React.useMemo(() => {
    if (paraObra)
      return obrasNoMapa
        .map((o) => ({ valor: o.id, rotulo: o.nome }))
        .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
    return [
      ...(escolhaInicial === PELA_ZONA
        ? [{ valor: PELA_ZONA, rotulo: "Cada uma pela obra do ponto onde caiu" }]
        : []),
      ...obras.map((o) => ({ valor: o.id, rotulo: o.nome })),
      { valor: SEM_OBRA, rotulo: ROTULO_SEM_OBRA },
    ];
  }, [paraObra, obrasNoMapa, obras, escolhaInicial]);

  const n = paraObra ? 1 : pendente.itens.length;
  const algumLivre = !ajuste && itens.some((i) => i.destino.tipo === "livre");
  const alvo = n > 1 ? `${n} equipamentos` : pendente.principal.codigo;
  const titulo =
    pendente.modo === "posicionar"
      ? `Posicionar ${pendente.principal.codigo}`
      : paraObra
        ? `Transferir ${pendente.principal.codigo} para outra obra`
        : ajuste
          ? `Ajustar localização de ${alvo}`
          : `Transferir ${alvo}`;

  /** "· obra X" ou "· sem obra" na linha de cada máquina, e o aviso quando a escolha vence a zona. */
  function obraDaLinha(item: ItemPendente): {
    texto: string;
    aviso: string | null;
  } {
    const efetiva = obraEfetiva(escolhaObra, item.destino);
    const daZona = obraDoDestino(item.destino);
    const texto = efetiva
      ? `Obra: ${nomeObra.get(efetiva) ?? "obra escolhida"}`
      : escolhaObra === SEM_OBRA
        ? "Sem obra"
        : "Este ponto não é de nenhuma obra: escolha a obra de destino";
    const aviso =
      !paraObra && efetiva && daZona && daZona !== efetiva
        ? `O ponto é de ${nomeObra.get(daZona) ?? "outra obra"}; a máquina fica com a obra escolhida.`
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
          : paraObra
            ? "A máquina vai para o ponto da obra no mapa. Depois, se quiser, arraste para o lugar exato (ajuste de localização)."
            : ajuste
              ? "Só corrige o ponto no mapa. Estado, obra e frente continuam os mesmos; não conta como transferência."
              : "A posição nova vale a partir da data efetiva e fica na trilha de movimentações."
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
          {ajuste ? null : (
            <div className="flex flex-col gap-2">
              <Label htmlFor={idObra}>Obra de destino</Label>
              <Combobox
                id={idObra}
                valor={escolhaObra}
                onValorChange={setEscolhaObra}
                opcoes={opcoesObra}
                placeholder="Selecione a obra"
                buscaPlaceholder="Buscar obra"
                vazioTexto={
                  paraObra
                    ? "Nenhuma obra com lugar no mapa"
                    : "Nenhuma obra encontrada"
                }
              />
              {paraObra && obrasNoMapa.length < obras.length ? (
                <p className="text-detalhe text-muted-foreground">
                  Só aparecem as obras desenhadas ou posicionadas no mapa.
                </p>
              ) : null}
            </div>
          )}
          {itens.length > 0 ? (
            <ul className="flex flex-col gap-2 text-detalhe">
              {itens.map((item) => {
                const linha = ajuste ? null : obraDaLinha(item);
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
                      {descreverDestino(item.destino, !ajuste)}
                    </p>
                    {linha ? (
                      <p
                        className={
                          obraEfetiva(escolhaObra, item.destino) ||
                          escolhaObra === SEM_OBRA
                            ? "text-foreground"
                            : "text-destructive"
                        }
                      >
                        {linha.texto}
                      </p>
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
        const obra = ajuste ? null : decisaoObra(escolhaObra);
        if (!ajuste && !obra) {
          toast.warning(
            paraObra
              ? "Escolha a obra de destino."
              : `Escolha a obra de destino, ou "Sem obra" se a máquina não fica em obra nenhuma.`,
          );
          return false;
        }
        if (itens.length === 0) {
          toast.warning("Essa obra ainda não tem lugar no mapa.");
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
