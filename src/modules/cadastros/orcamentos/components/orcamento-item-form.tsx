"use client";

import * as React from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { FormDrawer } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatarBRL, formatarQuantidade } from "@/lib/formatadores";
import {
  criarGrupo,
  criarItem,
  editarGrupo,
  editarItem,
} from "@/modules/cadastros/orcamentos/actions";
import type { OrcamentoItem } from "@/modules/cadastros/orcamentos/queries";
import {
  calcularTotaisItem,
  criarGrupoSchema,
  criarItemSchema,
  editarGrupoSchema,
  editarItemSchema,
} from "@/modules/cadastros/orcamentos/schemas";

const ID_FORM = "form-orcamento-item";

/** Modo do drawer: criar etapa/subetapa/item ou editar um nó existente. */
export type ModoItem =
  | { tipo: "criar-etapa"; orcamentoId: string }
  | { tipo: "criar-subetapa"; orcamentoId: string; pai: OrcamentoItem }
  | { tipo: "criar-item"; orcamentoId: string; pai: OrcamentoItem }
  | { tipo: "editar"; orcamentoId: string; item: OrcamentoItem };

export interface OrcamentoItemFormProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  modo: ModoItem | null;
}

/** Lê decimal pt-BR (vírgula). "" → undefined; inválido → NaN. */
function lerNumero(texto: string): number | undefined {
  const limpo = texto.trim();
  if (limpo === "") return undefined;
  const numero = Number(limpo.replace(/\./g, "").replace(",", "."));
  return Number.isNaN(numero) ? Number.NaN : numero;
}

/** Mostra number com vírgula decimal pra preencher o input ao editar. */
function paraCampo(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return "";
  return String(valor).replace(".", ",");
}

/**
 * Drawer único de criação/edição de linha do orçamento. Etapas e subetapas são
 * grupos (só descrição/índice/código — o total é a soma dos filhos). Itens são
 * folhas, com quantidade, custo unitário e BDI, e mostram o total calculado ao
 * vivo (preço = custo × (1 + BDI), igual à trigger do banco).
 */
export function OrcamentoItemForm({
  aberto,
  onAbertoChange,
  modo,
}: OrcamentoItemFormProps) {
  const [descricao, setDescricao] = React.useState("");
  const [indice, setIndice] = React.useState("");
  const [codigo, setCodigo] = React.useState("");
  const [unidade, setUnidade] = React.useState("");
  const [quantidade, setQuantidade] = React.useState("");
  const [custoUnitario, setCustoUnitario] = React.useState("");
  const [bdi, setBdi] = React.useState("");
  const [erro, setErro] = React.useState<string | null>(null);
  const [salvando, setSalvando] = React.useState(false);

  // Item folha (mostra valores) quando criando item ou editando um nó tipo item.
  const ehItem =
    modo?.tipo === "criar-item" ||
    (modo?.tipo === "editar" && modo.item.tipo === "item");
  const editando = modo?.tipo === "editar";

  // Sincroniza os campos quando o drawer abre, sem efeito em cascata.
  const chaveAbertura =
    aberto && modo
      ? `${modo.tipo}:${
          modo.tipo === "editar"
            ? modo.item.id
            : modo.tipo === "criar-etapa"
              ? modo.orcamentoId
              : modo.pai.id
        }`
      : null;
  const [ultimaAbertura, setUltimaAbertura] = React.useState<string | null>(
    null,
  );

  if (chaveAbertura !== null && chaveAbertura !== ultimaAbertura) {
    setUltimaAbertura(chaveAbertura);
    setErro(null);
    if (modo!.tipo === "editar") {
      const item = modo!.item;
      setDescricao(item.descricao);
      setIndice(item.indice ?? "");
      setCodigo(item.codigo ?? "");
      setUnidade(item.unidade ?? "");
      setQuantidade(paraCampo(item.quantidade));
      setCustoUnitario(paraCampo(item.custoUnitario));
      setBdi(paraCampo(item.bdi));
    } else {
      setDescricao("");
      setIndice("");
      setCodigo("");
      setUnidade("");
      setQuantidade("");
      setCustoUnitario("");
      setBdi("");
    }
  } else if (chaveAbertura === null && ultimaAbertura !== null) {
    setUltimaAbertura(null);
  }

  // Preview ao vivo dos totais (trata vazio/inválido como 0 só pra exibir).
  const preview = React.useMemo(() => {
    const q = lerNumero(quantidade);
    const cu = lerNumero(custoUnitario);
    const b = lerNumero(bdi);
    return calcularTotaisItem({
      quantidade: q && !Number.isNaN(q) ? q : 0,
      custoUnitario: cu && !Number.isNaN(cu) ? cu : 0,
      bdi: b && !Number.isNaN(b) ? b : 0,
    });
  }, [quantidade, custoUnitario, bdi]);

  function titulo(): string {
    if (!modo) return "";
    if (modo.tipo === "criar-etapa") return "Nova etapa";
    if (modo.tipo === "criar-subetapa") return "Nova subetapa";
    if (modo.tipo === "criar-item") return "Novo item";
    return modo.item.tipo === "item" ? "Editar item" : "Editar grupo";
  }

  function descricaoDrawer(): string {
    if (!modo) return "";
    if (modo.tipo === "criar-subetapa") return `Subetapa sob ${modo.pai.descricao}`;
    if (modo.tipo === "criar-item") return `Item sob ${modo.pai.descricao}`;
    if (modo.tipo === "criar-etapa") return "Etapa na raiz do orçamento";
    return ehItem
      ? "O total sai de quantidade × custo unitário (preço com BDI)."
      : "O total deste grupo é a soma dos filhos.";
  }

  async function aoEnviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!modo || salvando) return;
    setErro(null);

    // Valida os números antes (só quando é item).
    let q: number | undefined;
    let cu: number | undefined;
    let b: number | undefined;
    if (ehItem) {
      q = lerNumero(quantidade);
      cu = lerNumero(custoUnitario);
      b = lerNumero(bdi);
      if (
        (q !== undefined && Number.isNaN(q)) ||
        (cu !== undefined && Number.isNaN(cu)) ||
        (b !== undefined && Number.isNaN(b))
      ) {
        setErro("Confira os números: use vírgula para os decimais.");
        return;
      }
    }

    setSalvando(true);
    try {
      const indiceOpc = indice.trim() === "" ? undefined : indice;
      const codigoOpc = codigo.trim() === "" ? undefined : codigo;
      const unidadeOpc = unidade.trim() === "" ? undefined : unidade;

      if (modo.tipo === "criar-etapa" || modo.tipo === "criar-subetapa") {
        const validado = criarGrupoSchema.safeParse({
          orcamentoId: modo.orcamentoId,
          parentId: modo.tipo === "criar-etapa" ? null : modo.pai.id,
          tipo: modo.tipo === "criar-etapa" ? "etapa" : "subetapa",
          descricao,
          indice: indiceOpc,
          codigo: codigoOpc,
        });
        if (!validado.success) {
          setErro(validado.error.issues[0]?.message ?? "Dados inválidos");
          return;
        }
        const r = await criarGrupo(validado.data);
        if ("erro" in r) {
          toast.error(r.erro);
          return;
        }
        toast.success(modo.tipo === "criar-etapa" ? "Etapa criada" : "Subetapa criada");
      } else if (modo.tipo === "criar-item") {
        const validado = criarItemSchema.safeParse({
          orcamentoId: modo.orcamentoId,
          parentId: modo.pai.id,
          descricao,
          unidade: unidadeOpc,
          quantidade: q,
          custoUnitario: cu,
          bdi: b,
          indice: indiceOpc,
          codigo: codigoOpc,
        });
        if (!validado.success) {
          setErro(validado.error.issues[0]?.message ?? "Dados inválidos");
          return;
        }
        const r = await criarItem(validado.data);
        if ("erro" in r) {
          toast.error(r.erro);
          return;
        }
        toast.success("Item criado");
      } else if (ehItem) {
        const validado = editarItemSchema.safeParse({
          descricao,
          unidade: unidadeOpc,
          quantidade: q,
          custoUnitario: cu,
          bdi: b,
          indice: indiceOpc,
          codigo: codigoOpc,
        });
        if (!validado.success) {
          setErro(validado.error.issues[0]?.message ?? "Dados inválidos");
          return;
        }
        const r = await editarItem(modo.item.id, validado.data);
        if ("erro" in r) {
          toast.error(r.erro);
          return;
        }
        toast.success("Item salvo");
      } else {
        const validado = editarGrupoSchema.safeParse({
          descricao,
          indice: indiceOpc,
          codigo: codigoOpc,
        });
        if (!validado.success) {
          setErro(validado.error.issues[0]?.message ?? "Dados inválidos");
          return;
        }
        const r = await editarGrupo(modo.item.id, validado.data);
        if ("erro" in r) {
          toast.error(r.erro);
          return;
        }
        toast.success("Grupo salvo");
      }
      onAbertoChange(false);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={titulo()}
      descricao={descricaoDrawer()}
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
            {editando ? "Salvar" : "Criar"}
          </Button>
        </>
      }
    >
      <form id={ID_FORM} onSubmit={aoEnviar} className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label htmlFor="oi-descricao">Descrição</Label>
          <Input
            id="oi-descricao"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder={ehItem ? "Ex: Escavação mecânica" : "Ex: Terraplenagem"}
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="oi-indice">Índice</Label>
            <Input
              id="oi-indice"
              value={indice}
              onChange={(e) => setIndice(e.target.value)}
              placeholder="Auto (ex: 1.2.3)"
              className="font-mono"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="oi-codigo">Código</Label>
            <Input
              id="oi-codigo"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="Opcional"
              className="font-mono"
            />
          </div>
        </div>

        {ehItem ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="oi-unidade">Unidade</Label>
                <Input
                  id="oi-unidade"
                  value={unidade}
                  onChange={(e) => setUnidade(e.target.value)}
                  placeholder="Ex: m³, kg, vb"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="oi-quantidade">Quantidade</Label>
                <Input
                  id="oi-quantidade"
                  value={quantidade}
                  onChange={(e) => setQuantidade(e.target.value)}
                  placeholder="0"
                  inputMode="decimal"
                  className="text-right tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="oi-custo">Custo unitário</Label>
                <Input
                  id="oi-custo"
                  value={custoUnitario}
                  onChange={(e) => setCustoUnitario(e.target.value)}
                  placeholder="0,00"
                  inputMode="decimal"
                  className="text-right tabular-nums"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="oi-bdi">BDI (%)</Label>
                <Input
                  id="oi-bdi"
                  value={bdi}
                  onChange={(e) => setBdi(e.target.value)}
                  placeholder="0"
                  inputMode="decimal"
                  className="text-right tabular-nums"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3">
              <p className="text-legenda font-medium text-muted-foreground">
                Cálculo automático
              </p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-detalhe tabular-nums">
                <dt className="text-muted-foreground">Preço unitário</dt>
                <dd className="text-right">{formatarBRL(preview.precoUnitario)}</dd>
                <dt className="text-muted-foreground">Quantidade</dt>
                <dd className="text-right">
                  {formatarQuantidade(lerNumero(quantidade) || 0)}
                </dd>
                <dt className="border-t border-border pt-1 font-medium text-foreground">
                  Custo total
                </dt>
                <dd className="border-t border-border pt-1 text-right font-medium">
                  {formatarBRL(preview.custoTotal)}
                </dd>
                <dt className="font-medium text-foreground">Preço total</dt>
                <dd className="text-right font-medium text-foreground">
                  {formatarBRL(preview.precoTotal)}
                </dd>
              </dl>
            </div>
          </>
        ) : null}

        {erro ? <p className="text-legenda text-destructive">{erro}</p> : null}
      </form>
    </FormDrawer>
  );
}
