"use client";

import * as React from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { FormDrawer } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  criarEtapa,
  criarItem,
  editarNo,
} from "@/modules/cadastros/centros-custo/actions";
import {
  criarEtapaSchema,
  criarItemSchema,
  editarNoSchema,
} from "@/modules/cadastros/centros-custo/schemas";
import type { NoCentroCusto } from "@/modules/cadastros/centros-custo/queries";

const ID_FORM = "form-no-centro-custo";

/** Modo do drawer: criar etapa, criar item ou editar um nó existente. */
export type ModoNo =
  | { tipo: "criar-etapa"; pai: NoCentroCusto }
  | { tipo: "criar-item"; pai: NoCentroCusto }
  | { tipo: "editar"; no: NoCentroCusto };

export interface NoFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  modo: ModoNo | null;
}

/** Converte o texto do campo orçamento em number ou undefined. */
function lerOrcamento(texto: string): number | undefined {
  const limpo = texto.trim();
  if (limpo === "") return undefined;
  const numero = Number(limpo.replace(/\./g, "").replace(",", "."));
  return Number.isNaN(numero) ? Number.NaN : numero;
}

/**
 * Drawer único para criar etapa, criar item e editar nó. Em nó gerido pelo
 * sistema (sistema=true ou equipamento), o nome e o código ficam travados e só
 * o orçamento é editável.
 */
export function NoFormDrawer({ aberto, onAbertoChange, modo }: NoFormDrawerProps) {
  const [nome, setNome] = React.useState("");
  const [codigo, setCodigo] = React.useState("");
  const [orcamento, setOrcamento] = React.useState("");
  const [erroNome, setErroNome] = React.useState<string | null>(null);
  const [erroOrcamento, setErroOrcamento] = React.useState<string | null>(null);
  const [salvando, setSalvando] = React.useState(false);

  const editando = modo?.tipo === "editar";
  const noEditado = modo?.tipo === "editar" ? modo.no : null;
  const geridoSistema = Boolean(
    noEditado && (noEditado.sistema || noEditado.equipamento_id !== null),
  );

  // Sincroniza os campos com o modo no momento em que o drawer abre. Em vez de um
  // efeito com setState (que dispara renders em cascata), guarda a chave da última
  // abertura e ajusta o estado durante a renderização, padrão recomendado pelo React
  // para reiniciar estado quando uma prop muda.
  const chaveAbertura = aberto && modo ? `${modo.tipo}:${
    modo.tipo === "editar" ? modo.no.id : modo.pai.id
  }` : null;
  const [ultimaAbertura, setUltimaAbertura] = React.useState<string | null>(null);

  if (chaveAbertura !== null && chaveAbertura !== ultimaAbertura) {
    setUltimaAbertura(chaveAbertura);
    setErroNome(null);
    setErroOrcamento(null);
    if (modo!.tipo === "editar") {
      setNome(modo!.no.nome);
      setCodigo(modo!.no.codigo ?? "");
      setOrcamento(
        modo!.no.orcamento === null
          ? ""
          : String(modo!.no.orcamento).replace(".", ","),
      );
    } else {
      setNome("");
      setCodigo("");
      setOrcamento("");
    }
  } else if (chaveAbertura === null && ultimaAbertura !== null) {
    setUltimaAbertura(null);
  }

  function titulo(): string {
    if (!modo) return "";
    if (modo.tipo === "criar-etapa") return "Adicionar etapa";
    if (modo.tipo === "criar-item") return "Adicionar item";
    return geridoSistema ? "Editar orçamento" : "Editar nó";
  }

  function descricao(): string {
    if (!modo) return "";
    if (modo.tipo === "criar-etapa") {
      return `Nova etapa sob ${modo.pai.nome}`;
    }
    if (modo.tipo === "criar-item") {
      return `Novo item sob ${modo.pai.nome}`;
    }
    return geridoSistema
      ? "Este nó é gerido pelo sistema. Só o orçamento pode ser ajustado."
      : `Edição de ${modo.no.nome}`;
  }

  async function aoEnviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!modo || salvando) return;

    setErroNome(null);
    setErroOrcamento(null);

    const orcamentoNumero = lerOrcamento(orcamento);
    if (orcamentoNumero !== undefined && Number.isNaN(orcamentoNumero)) {
      setErroOrcamento("Informe um valor numérico");
      return;
    }

    setSalvando(true);
    try {
      if (modo.tipo === "criar-etapa") {
        const validado = criarEtapaSchema.safeParse({
          nome,
          pai_id: modo.pai.id,
          orcamento: orcamentoNumero,
        });
        if (!validado.success) {
          setErroNome(validado.error.issues[0]?.message ?? "Dados inválidos");
          return;
        }
        const resultado = await criarEtapa(validado.data);
        if ("erro" in resultado) {
          toast.error(resultado.erro);
          return;
        }
        toast.success("Etapa criada");
      } else if (modo.tipo === "criar-item") {
        const validado = criarItemSchema.safeParse({
          nome,
          pai_id: modo.pai.id,
          orcamento: orcamentoNumero,
        });
        if (!validado.success) {
          setErroNome(validado.error.issues[0]?.message ?? "Dados inválidos");
          return;
        }
        const resultado = await criarItem(validado.data);
        if ("erro" in resultado) {
          toast.error(resultado.erro);
          return;
        }
        toast.success("Item criado");
      } else {
        const validado = editarNoSchema.safeParse({
          nome,
          codigo: codigo.trim() === "" ? undefined : codigo,
          orcamento: orcamentoNumero,
        });
        if (!validado.success) {
          setErroNome(validado.error.issues[0]?.message ?? "Dados inválidos");
          return;
        }
        const resultado = await editarNo(modo.no.id, validado.data);
        if ("erro" in resultado) {
          toast.error(resultado.erro);
          return;
        }
        toast.success("Alterações salvas");
      }
      onAbertoChange(false);
    } finally {
      setSalvando(false);
    }
  }

  const nomeTravado = editando && geridoSistema;

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={titulo()}
      descricao={descricao()}
      rodape={
        <>
          <Button
            type="button"
            variant="outline"
            disabled={salvando}
            onClick={() => onAbertoChange(false)}
          >
            Cancelar
          </Button>
          <Button type="submit" form={ID_FORM} disabled={salvando}>
            {salvando ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : null}
            {editando ? "Salvar alterações" : "Criar"}
          </Button>
        </>
      }
    >
      <form id={ID_FORM} onSubmit={aoEnviar} className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label htmlFor="no-nome">Nome</Label>
          <Input
            id="no-nome"
            value={nome}
            onChange={(evento) => setNome(evento.target.value)}
            placeholder="Ex: Terraplenagem"
            disabled={nomeTravado}
            autoFocus={!nomeTravado}
          />
          {nomeTravado ? (
            <p className="text-legenda text-muted-foreground">
              O nome é gerido pelo sistema e não pode ser alterado aqui.
            </p>
          ) : null}
          {erroNome ? (
            <p className="text-legenda text-destructive">{erroNome}</p>
          ) : null}
        </div>

        {editando ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="no-codigo">Código</Label>
            <Input
              id="no-codigo"
              value={codigo}
              onChange={(evento) => setCodigo(evento.target.value)}
              placeholder="Opcional, ex: 1.2.3"
              disabled={nomeTravado}
              className="font-mono"
            />
            {nomeTravado ? (
              <p className="text-legenda text-muted-foreground">
                O código é gerido pelo sistema.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <Label htmlFor="no-orcamento">Orçamento</Label>
          <Input
            id="no-orcamento"
            value={orcamento}
            onChange={(evento) => setOrcamento(evento.target.value)}
            placeholder="Opcional, ex: 150000,00"
            inputMode="decimal"
            className="text-right tabular-nums"
          />
          <p className="text-legenda text-muted-foreground">
            Quando preenchido, habilita o orçado x realizado deste nó.
          </p>
          {erroOrcamento ? (
            <p className="text-legenda text-destructive">{erroOrcamento}</p>
          ) : null}
        </div>
      </form>
    </FormDrawer>
  );
}
