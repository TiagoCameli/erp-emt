"use client";

import * as React from "react";
import Link from "next/link";

import { Combobox, ConfirmDialog } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { rotuloTipoLocalidade } from "@/modules/mapa/rotulos";
import {
  TIPOS_LOCAL,
  type DepositoMapa,
  type LocalidadeMapa,
  type LocalSemPosicao,
  type ObraMapa,
  type TanqueMapa,
  type TipoLocal,
} from "@/modules/mapa/tipos";

/**
 * "Adicionar obra" e "Adicionar localização", os dois botões do topo do Mapa (pedido do Tiago,
 * 15/10/2026). Cada diálogo só monta o pedido; o ponto é escolhido tocando no mapa, e quem grava
 * é o pai (confirmação do ponto + action). Ligar um tanque ou depósito a um local que já está
 * no mapa não precisa de toque: grava direto.
 *
 * O Mapa não cria obra: obra nova nasce no Cadastros, que cria o centro de custo raiz junto.
 */

/** O que fica esperando o toque no mapa. */
export type PedidoColocar =
  | { tipo: "obra"; obra: ObraMapa }
  | {
      tipo: "local";
      /** Nome mostrado no aviso e na confirmação. */
      rotulo: string;
      /** Dá ponto a um local que já existe; sem ele, cria um novo com nome e tipo. */
      localidadeId?: string;
      nome?: string;
      tipoLocal?: TipoLocal;
      vincular?: { alvo: "tanque" | "deposito"; id: string };
    };

const OPCOES_TIPO_LOCAL = TIPOS_LOCAL.map((t) => ({
  valor: t,
  rotulo: rotuloTipoLocalidade(t),
}));

/** Botões de escolha única (mesmo padrão da confirmação de arraste). */
function Escolha<T extends string>({
  rotulo,
  valor,
  opcoes,
  onChange,
}: {
  rotulo: string;
  valor: T;
  opcoes: readonly { valor: T; rotulo: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={rotulo}
      className="grid gap-2"
      style={{
        gridTemplateColumns: `repeat(${opcoes.length}, minmax(0, 1fr))`,
      }}
    >
      {opcoes.map((o) => (
        <Button
          key={o.valor}
          type="button"
          variant={valor === o.valor ? "default" : "outline"}
          aria-pressed={valor === o.valor}
          onClick={() => onChange(o.valor)}
        >
          {o.rotulo}
        </Button>
      ))}
    </div>
  );
}

export function DialogoAdicionarObra({
  obras,
  onCancelar,
  onEscolherNoMapa,
}: {
  obras: readonly ObraMapa[];
  onCancelar: () => void;
  onEscolherNoMapa: (obra: ObraMapa) => void;
}) {
  const [obraId, setObraId] = React.useState("");
  const idObra = React.useId();
  const opcoes = React.useMemo(
    () =>
      obras.map((o) => ({
        valor: o.id,
        rotulo: o.pos ? `${o.nome} (já no mapa)` : o.nome,
      })),
    [obras],
  );
  const escolhida = obras.find((o) => o.id === obraId) ?? null;

  return (
    <ConfirmDialog
      aberto
      onAbertoChange={(aberto) => {
        if (!aberto) onCancelar();
      }}
      titulo="Adicionar obra ao mapa"
      descricao="Escolha a obra e toque no mapa onde ela fica. Obra que já está no mapa muda de lugar."
      textoConfirmar="Escolher no mapa"
      conteudo={
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor={idObra}>Obra</Label>
            <Combobox
              id={idObra}
              valor={obraId}
              onValorChange={setObraId}
              opcoes={opcoes}
              placeholder="Selecione a obra"
              buscaPlaceholder="Buscar obra"
            />
          </div>
          <p className="text-detalhe text-muted-foreground">
            Obra nova se cadastra em{" "}
            <Link
              href="/cadastros/obras"
              className="text-foreground underline underline-offset-2"
            >
              Cadastros › Obras
            </Link>
            , que cria o centro de custo junto. Depois ela aparece aqui.
          </p>
        </div>
      }
      onConfirmar={() => {
        if (!escolhida) {
          toast.error("Escolha a obra");
          return false;
        }
        onEscolherNoMapa(escolhida);
      }}
    />
  );
}

type OQue = "local" | "tanque" | "deposito";
const NOVO = "__novo__";

export function DialogoAdicionarLocal({
  localidades,
  semPosicao,
  tanques,
  depositos,
  podeCriar,
  onCancelar,
  onEscolherNoMapa,
  onLigar,
}: {
  localidades: readonly LocalidadeMapa[];
  semPosicao: readonly LocalSemPosicao[];
  tanques: readonly TanqueMapa[];
  depositos: readonly DepositoMapa[];
  podeCriar: boolean;
  onCancelar: () => void;
  onEscolherNoMapa: (pedido: PedidoColocar) => void;
  /** Liga tanque/depósito a um local que já está no mapa. false = recusou (toast já avisou). */
  onLigar: (
    alvo: "tanque" | "deposito",
    id: string,
    localidadeId: string,
  ) => Promise<boolean>;
}) {
  const [oQue, setOQue] = React.useState<OQue>("local");
  const [localExistente, setLocalExistente] = React.useState(
    podeCriar || semPosicao.length === 0 ? NOVO : (semPosicao[0]?.id ?? NOVO),
  );
  const [nome, setNome] = React.useState("");
  const [tipo, setTipo] = React.useState<string>("oficina");
  const [itemId, setItemId] = React.useState("");
  const [ondeFica, setOndeFica] = React.useState("");
  const ids = {
    existente: React.useId(),
    nome: React.useId(),
    tipo: React.useId(),
    item: React.useId(),
    onde: React.useId(),
  };

  const nomeDoLocal = new Map(localidades.map((l) => [l.id, l.nome]));
  // Tanque de comboio (meloza) anda com a máquina: não tem local fixo.
  const itens =
    oQue === "tanque"
      ? tanques
          .filter((t) => !t.equipamentoId)
          .map((t) => ({
            id: t.id,
            nome: t.nome,
            localidadeId: t.localidadeId,
          }))
      : depositos.map((d) => ({
          id: d.id,
          nome: d.nome,
          localidadeId: d.localidadeId,
        }));
  const opcoesItem = itens.map((i) => {
    const atual = i.localidadeId ? nomeDoLocal.get(i.localidadeId) : null;
    return { valor: i.id, rotulo: atual ? `${i.nome} (em ${atual})` : i.nome };
  });
  const opcoesOnde = [
    ...(podeCriar
      ? [{ valor: NOVO, rotulo: "Novo local: tocar no mapa" }]
      : []),
    ...localidades.map((l) => ({
      valor: l.id,
      rotulo: `${l.nome} (${rotuloTipoLocalidade(l.tipo).toLowerCase()})`,
    })),
  ];
  const opcoesExistente = [
    ...(podeCriar ? [{ valor: NOVO, rotulo: "Novo local" }] : []),
    ...semPosicao.map((l) => ({
      valor: l.id,
      rotulo: `${l.nome} (${rotuloTipoLocalidade(l.tipo).toLowerCase()}, sem ponto)`,
    })),
  ];

  const item = itens.find((i) => i.id === itemId) ?? null;
  const criandoLocal =
    (oQue === "local" && localExistente === NOVO) ||
    (oQue !== "local" && ondeFica === NOVO);
  const ligaDireto = oQue !== "local" && ondeFica !== "" && ondeFica !== NOVO;

  const trocarItem = (id: string) => {
    setItemId(id);
    const escolhido = itens.find((i) => i.id === id);
    if (escolhido && !nome) setNome(escolhido.nome);
  };

  const confirmar = async (): Promise<boolean | void> => {
    if (oQue === "local") {
      if (localExistente !== NOVO) {
        const l = semPosicao.find((x) => x.id === localExistente);
        if (!l) {
          toast.error("Escolha o local");
          return false;
        }
        onEscolherNoMapa({ tipo: "local", rotulo: l.nome, localidadeId: l.id });
        return;
      }
      if (!nome.trim()) {
        toast.error("Informe o nome do local");
        return false;
      }
      onEscolherNoMapa({
        tipo: "local",
        rotulo: nome.trim(),
        nome: nome.trim(),
        tipoLocal: tipo as TipoLocal,
      });
      return;
    }
    if (!item) {
      toast.error(
        oQue === "tanque" ? "Escolha o tanque" : "Escolha o depósito",
      );
      return false;
    }
    if (!ondeFica) {
      toast.error("Diga onde fica");
      return false;
    }
    if (ligaDireto) return onLigar(oQue, item.id, ondeFica);
    if (!nome.trim()) {
      toast.error("Informe o nome do local novo");
      return false;
    }
    onEscolherNoMapa({
      tipo: "local",
      rotulo: item.nome,
      nome: nome.trim(),
      tipoLocal: tipo as TipoLocal,
      vincular: { alvo: oQue, id: item.id },
    });
  };

  return (
    <ConfirmDialog
      aberto
      onAbertoChange={(aberto) => {
        if (!aberto) onCancelar();
      }}
      titulo="Adicionar localização"
      descricao="Oficina, pátio e outros locais da empresa, e os tanques e depósitos do Estoque. Tanque e depósito aparecem no mapa pelo local onde estão."
      textoConfirmar={ligaDireto ? "Ligar ao local" : "Escolher no mapa"}
      conteudo={
        <div className="flex flex-col gap-4">
          <Escolha
            rotulo="O que vai no mapa"
            valor={oQue}
            onChange={(v) => {
              setOQue(v);
              setItemId("");
              setOndeFica("");
              setNome("");
              setTipo(
                v === "deposito"
                  ? "deposito"
                  : v === "tanque"
                    ? "patio"
                    : "oficina",
              );
            }}
            opcoes={[
              { valor: "local", rotulo: "Local" },
              { valor: "tanque", rotulo: "Tanque" },
              { valor: "deposito", rotulo: "Depósito" },
            ]}
          />

          {oQue === "local" && opcoesExistente.length > 1 ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor={ids.existente}>Local</Label>
              <Combobox
                id={ids.existente}
                valor={localExistente}
                onValorChange={setLocalExistente}
                opcoes={opcoesExistente}
              />
            </div>
          ) : null}

          {oQue !== "local" ? (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor={ids.item}>
                  {oQue === "tanque"
                    ? "Tanque do Estoque"
                    : "Depósito do Estoque"}
                </Label>
                <Combobox
                  id={ids.item}
                  valor={itemId}
                  onValorChange={trocarItem}
                  opcoes={opcoesItem}
                  placeholder="Selecione"
                  vazioTexto={
                    oQue === "tanque"
                      ? "Nenhum tanque ativo"
                      : "Nenhum depósito ativo"
                  }
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={ids.onde}>Onde fica</Label>
                <Combobox
                  id={ids.onde}
                  valor={ondeFica}
                  onValorChange={setOndeFica}
                  opcoes={opcoesOnde}
                  placeholder="Local no mapa ou novo"
                />
              </div>
            </>
          ) : null}

          {criandoLocal ? (
            <div className="grid gap-4 sm:grid-cols-[1fr_11rem]">
              <div className="flex flex-col gap-2">
                <Label htmlFor={ids.nome}>Nome do local</Label>
                <Input
                  id={ids.nome}
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="ex.: Oficina central"
                  maxLength={300}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={ids.tipo}>Tipo</Label>
                <Combobox
                  id={ids.tipo}
                  valor={tipo}
                  onValorChange={setTipo}
                  opcoes={OPCOES_TIPO_LOCAL}
                />
              </div>
            </div>
          ) : null}
        </div>
      }
      onConfirmar={confirmar}
    />
  );
}
