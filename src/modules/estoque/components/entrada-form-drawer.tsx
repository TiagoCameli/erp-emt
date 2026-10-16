"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  FormDrawer,
  InputPreco,
  InputQuantidade,
  LinhaCampos,
  MoneyText,
  submeterComAviso,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { CASAS_TAXA } from "@/lib/casas-decimais";
import { formatarData, formatarQuantidade } from "@/lib/formatadores";
import { salvarEntrada } from "@/modules/estoque/actions";
import type { LocalFormOpcao } from "@/modules/estoque/calculo";
import type { EntradaLinha, ItemOcDisponivel } from "@/modules/estoque/queries";
import {
  entradaDoForm,
  entradaFormSchema,
  type EntradaFormInput,
  type OrigemEntrada,
} from "@/modules/estoque/schemas";
import {
  formatarPreco,
  numeroParaTexto,
  paraNumero,
  totalDaLinha,
} from "@/modules/manutencao/almoxarifado/calculo";
import type { InsumoOpcao } from "@/modules/manutencao/almoxarifado/queries";

const ID_FORM = "form-entrada-estoque";

function valoresIniciais(entrada: EntradaLinha | null, inicial?: EntradaInicial): EntradaFormInput {
  if (!entrada) {
    return {
      origem: "avulsa",
      ocItemId: "",
      local: inicial?.local ?? "",
      insumoId: inicial?.insumoId ?? "",
      quantidade: "",
      valorUnitario: "",
      // A data fica em branco de propósito: é o único campo que nem a OC preenche.
      data: "",
      notaFiscal: "",
      observacoes: "",
    };
  }
  return {
    origem: entrada.ocItemId ? "oc" : "avulsa",
    ocItemId: entrada.ocItemId ?? "",
    local: entrada.local,
    insumoId: entrada.insumoId,
    quantidade: numeroParaTexto(entrada.quantidade),
    valorUnitario: numeroParaTexto(entrada.valorUnitario),
    data: entrada.data,
    notaFiscal: entrada.notaFiscal ?? "",
    observacoes: entrada.observacoes ?? "",
  };
}

function rotuloItemOc(item: ItemOcDisponivel): string {
  const restante = `${formatarQuantidade(item.quantidadeRestante)}${item.unidade ? ` ${item.unidade}` : ""}`;
  return `${item.ocNumero} · ${item.insumoNome} · falta ${restante}`;
}

/** Registrar já num local (o card da pilha no Mapa): o local e o insumo vêm escolhidos. */
export interface EntradaInicial {
  local: string;
  insumoId: string;
}

export interface EntradaFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Nula para registrar; a linha para editar. */
  entrada: EntradaLinha | null;
  /** Depósitos, tanques de material e pilhas ativos (`listarLocais`); a pilha leva o insumo dela. */
  locais: LocalFormOpcao[];
  insumos: InsumoOpcao[];
  itensOc: ItemOcDisponivel[];
  inicial?: EntradaInicial;
  /** Sem a aba "De uma OC" (o Mapa não carrega os itens das OCs). */
  apenasAvulsa?: boolean;
}

/**
 * Registrar ou editar uma entrada no estoque.
 *
 * Avulsa: depósito, insumo, quantidade e valor unitário; a unidade vem do cadastro do
 * insumo. De uma OC: escolhe o item e vem tudo da OC (insumo, quantidade que falta
 * entrar, valor unitário, fornecedor); só a data a pessoa informa, e a quantidade pode
 * baixar para uma entrega parcial. O banco confere o saldo do item da OC.
 */
export function EntradaFormDrawer({
  aberto,
  onAbertoChange,
  entrada,
  locais,
  insumos,
  itensOc,
  inicial,
  apenasAvulsa = false,
}: EntradaFormDrawerProps) {
  const editando = entrada !== null;
  const form = useForm<EntradaFormInput>({
    resolver: zodResolver(entradaFormSchema),
    defaultValues: valoresIniciais(entrada, inicial),
  });
  const salvando = form.formState.isSubmitting;

  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais(entrada, inicial));
  }, [aberto, entrada, inicial, form]);

  const [origem, ocItemId, local, insumoId, quantidade, valorUnitario] = useWatch({
    control: form.control,
    name: ["origem", "ocItemId", "local", "insumoId", "quantidade", "valorUnitario"],
  });

  const itemOc = React.useMemo(() => itensOc.find((item) => item.ocItemId === ocItemId) ?? null, [itensOc, ocItemId]);
  const insumo = React.useMemo(() => insumos.find((opcao) => opcao.id === insumoId) ?? null, [insumos, insumoId]);
  const unidade = origem === "oc" ? (itemOc?.unidade ?? entrada?.unidade ?? null) : (insumo?.unidade ?? entrada?.unidade ?? null);

  const opcoesLocais = React.useMemo(() => locais.map((l) => ({ valor: l.id, rotulo: l.nome })), [locais]);
  const opcoesInsumos = React.useMemo(
    () => insumos.map((i) => ({ valor: i.id, rotulo: i.unidade ? `${i.nome} (${i.unidade})` : i.nome })),
    [insumos],
  );
  // Pilha guarda um insumo só: escolhida a pilha, o insumo é o dela (e da OC, só os itens dele).
  const insumoDaPilha = locais.find((l) => l.id === local)?.insumoId ?? null;
  const opcoesItensOc = React.useMemo(
    () =>
      itensOc
        .filter((item) => insumoDaPilha === null || item.insumoId === insumoDaPilha)
        .map((item) => ({ valor: item.ocItemId, rotulo: rotuloItemOc(item) })),
    [itensOc, insumoDaPilha],
  );

  function escolherLocal(valor: string) {
    form.setValue("local", valor, { shouldDirty: true, shouldValidate: true });
    const insumoNovo = locais.find((l) => l.id === valor)?.insumoId ?? null;
    if (insumoNovo === null) return;
    if (origem === "oc") {
      if (itemOc && itemOc.insumoId !== insumoNovo) form.setValue("ocItemId", "", { shouldDirty: true });
    } else {
      form.setValue("insumoId", insumoNovo, { shouldDirty: true, shouldValidate: true });
    }
  }

  function escolherItemOc(valor: string) {
    form.setValue("ocItemId", valor, { shouldDirty: true, shouldValidate: true });
    const item = itensOc.find((opcao) => opcao.ocItemId === valor);
    if (!item) return;
    form.setValue("insumoId", item.insumoId, { shouldDirty: true });
    form.setValue("quantidade", numeroParaTexto(item.quantidadeRestante), { shouldDirty: true, shouldValidate: true });
    form.setValue("valorUnitario", numeroParaTexto(item.precoUnitario), { shouldDirty: true });
  }

  function trocarOrigem(valor: string) {
    const nova = valor as OrigemEntrada;
    form.setValue("origem", nova, { shouldDirty: true });
    form.setValue("ocItemId", "", { shouldDirty: true });
    form.setValue("insumoId", "", { shouldDirty: true });
    form.setValue("quantidade", "", { shouldDirty: true });
    form.setValue("valorUnitario", "", { shouldDirty: true });
    form.clearErrors();
  }

  const q = paraNumero(quantidade ?? "", CASAS_TAXA);
  const u = origem === "oc" ? (itemOc?.precoUnitario ?? entrada?.valorUnitario ?? null) : paraNumero(valorUnitario ?? "", CASAS_TAXA);
  const total = q !== null && u !== null ? totalDaLinha(q, u) : 0;

  async function aoEnviar(dados: EntradaFormInput) {
    const resultado = await salvarEntrada(entrada?.id ?? null, entradaDoForm(dados));
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(editando ? "Entrada salva" : "Entrada registrada");
    onAbertoChange(false);
  }

  const erros = form.formState.errors;
  const daOc = origem === "oc";

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar entrada" : "Registrar entrada"}
      descricao={
        daOc
          ? "Os dados vêm da OC. Informe a data em que o material chegou"
          : "Material que entrou sem OC. A unidade é a do cadastro do insumo"
      }
      temAlteracoesNaoSalvas={form.formState.isDirty && !salvando}
      rodape={
        <>
          <Button type="button" variant="outline" onClick={() => onAbertoChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button type="submit" form={ID_FORM} disabled={salvando}>
            {salvando ? (
              <>
                <LoaderCircle className="animate-spin" />
                Salvando...
              </>
            ) : editando ? (
              "Salvar entrada"
            ) : (
              "Registrar entrada"
            )}
          </Button>
        </>
      }
    >
      <form id={ID_FORM} onSubmit={submeterComAviso(form, aoEnviar)} className={classesFormulario} noValidate>
        {editando || apenasAvulsa ? null : (
          <Tabs value={origem} onValueChange={trocarOrigem}>
            <TabsList aria-label="Origem da entrada">
              <TabsTrigger value="avulsa" disabled={salvando}>
                Avulsa
              </TabsTrigger>
              <TabsTrigger value="oc" disabled={salvando}>
                De uma OC
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {daOc ? (
          editando ? (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p className="font-medium">{entrada?.insumoNome}</p>
              <p className="text-muted-foreground">
                {entrada?.ocNumero ?? "OC"}
                {entrada?.fornecedorNome ? ` · ${entrada.fornecedorNome}` : ""} · {formatarPreco(entrada?.valorUnitario)}
              </p>
            </div>
          ) : (
            <CampoFormulario id="entrada-oc-item" rotulo="Item da OC" obrigatorio erro={erros.ocItemId?.message}>
              <Combobox
                id="entrada-oc-item"
                valor={ocItemId ?? ""}
                onValorChange={escolherItemOc}
                opcoes={opcoesItensOc}
                placeholder="Selecione o item da OC"
                buscaPlaceholder="Buscar por OC ou insumo"
                vazioTexto="Nenhuma OC aprovada com item para dar entrada"
                disabled={salvando}
              />
            </CampoFormulario>
          )
        ) : null}

        {daOc && itemOc && !editando ? (
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <p className="font-medium">{itemOc.insumoNome}</p>
            <p className="text-muted-foreground">
              {itemOc.fornecedorNome || "Sem fornecedor"}
              {itemOc.dataCompra ? ` · compra em ${formatarData(itemOc.dataCompra)}` : ""}
              {itemOc.centroCustoNome ? ` · ${itemOc.centroCustoNome}` : ""}
            </p>
            <p className="text-muted-foreground tabular-nums">
              Pedido {formatarQuantidade(itemOc.quantidade)}
              {itemOc.unidade ? ` ${itemOc.unidade}` : ""}, falta entrar {formatarQuantidade(itemOc.quantidadeRestante)}
              {itemOc.unidade ? ` ${itemOc.unidade}` : ""} a {formatarPreco(itemOc.precoUnitario)}
            </p>
          </div>
        ) : null}

        <CampoFormulario id="entrada-local" rotulo="Local" obrigatorio erro={erros.local?.message}>
          <Combobox
            id="entrada-local"
            valor={local ?? ""}
            rotuloDoValor={entrada?.localNome}
            onValorChange={escolherLocal}
            opcoes={opcoesLocais}
            placeholder="Selecione o depósito, o tanque ou a pilha"
            vazioTexto="Nenhum depósito, tanque de material ou pilha ativa. Crie nas abas Depósitos, Tanques e Pilhas"
            disabled={salvando}
          />
        </CampoFormulario>

        {daOc ? null : (
          <CampoFormulario
            id="entrada-insumo"
            rotulo="Insumo"
            obrigatorio
            ajuda={insumoDaPilha ? "O insumo da pilha escolhida" : undefined}
            erro={erros.insumoId?.message}
          >
            <Combobox
              id="entrada-insumo"
              valor={insumoId ?? ""}
              rotuloDoValor={entrada?.insumoNome}
              onValorChange={(valor) => form.setValue("insumoId", valor, { shouldDirty: true, shouldValidate: true })}
              opcoes={opcoesInsumos}
              placeholder="Selecione o insumo"
              buscaPlaceholder="Buscar insumo"
              disabled={salvando || insumoDaPilha !== null}
            />
          </CampoFormulario>
        )}

        <LinhaCampos colunas={3}>
          <CampoFormulario
            id="entrada-quantidade"
            rotulo={unidade ? `Quantidade (${unidade})` : "Quantidade"}
            obrigatorio
            erro={erros.quantidade?.message}
          >
            <InputQuantidade
              id="entrada-quantidade"
              valor={quantidade ?? ""}
              onValorChange={(valor) => form.setValue("quantidade", valor, { shouldDirty: true })}
              onBlur={() => void form.trigger("quantidade")}
              disabled={salvando}
            />
          </CampoFormulario>
          <CampoFormulario
            id="entrada-valor"
            rotulo="Valor unitário"
            obrigatorio={!daOc}
            ajuda={daOc ? "O da OC" : undefined}
            erro={erros.valorUnitario?.message}
          >
            <InputPreco
              id="entrada-valor"
              valor={daOc ? numeroParaTexto(u) : (valorUnitario ?? "")}
              onValorChange={(valor) => form.setValue("valorUnitario", valor, { shouldDirty: true })}
              onBlur={() => void form.trigger("valorUnitario")}
              disabled={salvando || daOc}
            />
          </CampoFormulario>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Total</span>
            <span className="flex h-9 items-center justify-end">
              <MoneyText valor={total} />
            </span>
          </div>
        </LinhaCampos>

        <LinhaCampos>
          <CampoFormulario id="entrada-data" rotulo="Data da entrada" obrigatorio largura="medio" erro={erros.data?.message}>
            <Input id="entrada-data" type="date" disabled={salvando} {...form.register("data")} />
          </CampoFormulario>
          <CampoFormulario id="entrada-nf" rotulo="Nota fiscal" erro={erros.notaFiscal?.message}>
            <Input id="entrada-nf" autoComplete="off" disabled={salvando} {...form.register("notaFiscal")} />
          </CampoFormulario>
        </LinhaCampos>

        <CampoFormulario id="entrada-observacoes" rotulo="Observações" erro={erros.observacoes?.message}>
          <Textarea id="entrada-observacoes" rows={2} disabled={salvando} {...form.register("observacoes")} />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
