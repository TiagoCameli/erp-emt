"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Plus, X } from "lucide-react";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  FormDrawer,
  InputDecimal,
  InputPreco,
  LinhaCampos,
  MoneyText,
  submeterComAviso,
} from "@/components/canonicos";
import { Anexos } from "@/components/canonicos/anexos";
import { FilaAnexos, subirFilaDeAnexos } from "@/components/canonicos/fila-anexos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { anexosDoDocumento } from "@/modules/_shared/anexos/actions";
import type { AnexoDoDocumento } from "@/modules/_shared/anexos/queries";
import { salvarPedido } from "@/modules/frete/pedidos-material/actions";
import type { FornecedorOpcao, InsumoOpcao, PedidoLinha } from "@/modules/frete/pedidos-material/queries";
import {
  CASAS_QUANTIDADE_PEDIDO,
  itensDoForm,
  itensValidos,
  itemVazio,
  podeRemoverItem,
  subtotalDoItem,
  totalDoForm,
  type ItemPedidoForm,
} from "@/modules/frete/pedidos-material/regras";
import { pedidoFormSchema, type PedidoFormInput } from "@/modules/frete/pedidos-material/schemas";
import { formatarValorOperacional } from "@/modules/manutencao/servicos/formato";

const ID_FORM = "form-pedido-material";
const ENTIDADE_ANEXO = "pedido_material";

/** Número do banco para o campo, sem arredondar (a quantidade tem até 6 casas). */
function numeroParaCampo(valor: number): string {
  if (!Number.isFinite(valor)) return "";
  return String(Number(valor.toFixed(CASAS_QUANTIDADE_PEDIDO))).replace(".", ",");
}

function valoresIniciais(pedido: PedidoLinha | null): PedidoFormInput {
  return {
    data: pedido?.data ?? "",
    fornecedorId: pedido?.fornecedorId ?? "",
    observacoes: pedido?.observacoes ?? "",
  };
}

function itensIniciais(pedido: PedidoLinha | null): ItemPedidoForm[] {
  if (!pedido || pedido.itens.length === 0) return [itemVazio()];
  return pedido.itens.map((i) => ({
    insumoId: i.insumoId,
    quantidade: numeroParaCampo(i.quantidade),
    valorUnitario: numeroParaCampo(i.valorUnitario),
  }));
}

export interface PedidoFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Nulo: novo pedido. */
  pedido: PedidoLinha | null;
  fornecedores: FornecedorOpcao[];
  insumos: InsumoOpcao[];
}

/**
 * Criar ou editar um pedido de material na pedreira, igual ao PedidoMaterialForm da origem:
 * data, fornecedor e observações; itens com material, unidade, quantidade, valor unitário e
 * subtotal (quantidade × valor unitário); "Valor total do pedido" = soma dos subtotais.
 * Quem usa passa `key` com o id do pedido, para os itens recomeçarem a cada abertura.
 */
export function PedidoFormDrawer({ aberto, onAbertoChange, pedido, fornecedores, insumos }: PedidoFormDrawerProps) {
  const editando = pedido !== null;
  const form = useForm<PedidoFormInput>({
    resolver: zodResolver(pedidoFormSchema),
    defaultValues: valoresIniciais(pedido),
  });
  const [itens, setItens] = React.useState<ItemPedidoForm[]>(() => itensIniciais(pedido));
  const [fila, setFila] = React.useState<File[]>([]);
  const [subindo, setSubindo] = React.useState(false);
  const [anexos, setAnexos] = React.useState<AnexoDoDocumento[]>([]);
  const ocupado = form.formState.isSubmitting || subindo;

  React.useEffect(() => {
    if (!aberto) return;
    form.reset(valoresIniciais(pedido));
  }, [aberto, pedido, form]);

  React.useEffect(() => {
    if (!aberto || !pedido) return;
    let vivo = true;
    anexosDoDocumento(ENTIDADE_ANEXO, pedido.id)
      .then((lista) => {
        if (vivo) setAnexos(lista);
      })
      .catch(() => {
        if (vivo) toast.error("Não foi possível carregar os anexos do pedido");
      });
    return () => {
      vivo = false;
    };
  }, [aberto, pedido]);

  function mudarAberto(novo: boolean) {
    if (!novo) {
      setItens(itensIniciais(pedido));
      setFila([]);
    }
    onAbertoChange(novo);
  }

  const fornecedorId = useWatch({ control: form.control, name: "fornecedorId" });
  const opcoesFornecedores = React.useMemo(() => fornecedores.map((f) => ({ valor: f.id, rotulo: f.nome })), [fornecedores]);
  const opcoesInsumos = React.useMemo(() => insumos.map((i) => ({ valor: i.id, rotulo: i.nome })), [insumos]);
  const unidadePorInsumo = React.useMemo(() => new Map(insumos.map((i) => [i.id, i.unidade])), [insumos]);
  const nomeGravado = React.useMemo(() => new Map((pedido?.itens ?? []).map((i) => [i.insumoId, i])), [pedido]);

  function mudarItem(indice: number, mudanca: Partial<ItemPedidoForm>) {
    setItens((atual) => atual.map((item, i) => (i === indice ? { ...item, ...mudanca } : item)));
  }

  const erros = form.formState.errors;
  const total = totalDoForm(itens);
  const validos = itensValidos(itens);
  const itensSujos = React.useMemo(
    () => JSON.stringify(itens) !== JSON.stringify(itensIniciais(pedido)),
    [itens, pedido],
  );

  async function aoEnviar(dados: PedidoFormInput) {
    if (!validos) {
      toast.error("Cada material precisa de quantidade e valor unitário maiores que zero");
      return;
    }
    const resultado = await salvarPedido(pedido?.id ?? null, {
      data: dados.data,
      fornecedorId: dados.fornecedorId,
      observacoes: dados.observacoes.trim() || null,
      itens: itensDoForm(itens),
    });
    if ("erro" in resultado) {
      toast.error(`${editando ? "Erro ao atualizar pedido" : "Erro ao criar pedido"}: ${resultado.erro}`);
      return;
    }
    if (!editando && fila.length > 0) {
      setSubindo(true);
      try {
        await subirFilaDeAnexos(ENTIDADE_ANEXO, resultado.id, fila);
      } finally {
        setSubindo(false);
      }
    }
    toast.success(editando ? "Pedido atualizado" : "Pedido criado");
    mudarAberto(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={mudarAberto}
      titulo={editando ? "Editar pedido de material" : "Novo pedido de material"}
      descricao="Material comprado na pedreira. É a base do saldo na pedreira (pedido menos transportado)"
      temAlteracoesNaoSalvas={(form.formState.isDirty || itensSujos || fila.length > 0) && !ocupado}
      larguraClassName="sm:max-w-5xl"
      rodape={
        <>
          <Button type="button" variant="outline" onClick={() => mudarAberto(false)} disabled={ocupado}>
            Cancelar
          </Button>
          <Button type="submit" form={ID_FORM} disabled={ocupado}>
            {ocupado ? (
              <>
                <LoaderCircle className="animate-spin" />
                Salvando...
              </>
            ) : editando ? (
              "Salvar alterações"
            ) : (
              "Registrar pedido"
            )}
          </Button>
        </>
      }
    >
      <form id={ID_FORM} onSubmit={submeterComAviso(form, aoEnviar)} className={classesFormulario} noValidate>
        <LinhaCampos>
          <CampoFormulario id="ped-data" rotulo="Data do pedido" obrigatorio erro={erros.data?.message}>
            <Input id="ped-data" type="date" disabled={ocupado} {...form.register("data")} />
          </CampoFormulario>
          <CampoFormulario id="ped-fornecedor" rotulo="Fornecedor" obrigatorio erro={erros.fornecedorId?.message}>
            <Combobox
              id="ped-fornecedor"
              valor={fornecedorId ?? ""}
              rotuloDoValor={pedido?.fornecedorNome}
              onValorChange={(v) => form.setValue("fornecedorId", v, { shouldDirty: true, shouldValidate: true })}
              opcoes={opcoesFornecedores}
              placeholder="Selecione o fornecedor"
              vazioTexto="Nenhum fornecedor ativo"
              disabled={ocupado}
            />
          </CampoFormulario>
        </LinhaCampos>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Itens do pedido</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={ocupado}
              onClick={() => setItens((atual) => [...atual, itemVazio()])}
            >
              <Plus />
              Adicionar material
            </Button>
          </div>
          <div className="flex flex-col gap-2" data-testid="itens-pedido">
            {itens.map((item, indice) => {
              const unidade = unidadePorInsumo.get(item.insumoId) ?? nomeGravado.get(item.insumoId)?.unidade ?? null;
              return (
                <div
                  key={indice}
                  className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[minmax(0,2fr)_5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_2.25rem]"
                >
                  <div className="flex flex-col gap-1">
                    {indice === 0 ? <span className="text-legenda text-muted-foreground">Material</span> : null}
                    <Combobox
                      valor={item.insumoId}
                      rotuloDoValor={nomeGravado.get(item.insumoId)?.insumoNome}
                      onValorChange={(v) => mudarItem(indice, { insumoId: v })}
                      opcoes={opcoesInsumos}
                      placeholder="Selecione..."
                      ariaLabel={`Material do item ${indice + 1}`}
                      disabled={ocupado}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    {indice === 0 ? <span className="text-legenda text-muted-foreground">Unidade</span> : null}
                    <span className="flex h-9 items-center justify-center rounded-md border border-border bg-surface text-detalhe text-muted-foreground">
                      {unidade ?? "-"}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {indice === 0 ? <span className="text-legenda text-muted-foreground">Quantidade</span> : null}
                    <InputDecimal
                      casas={CASAS_QUANTIDADE_PEDIDO}
                      aria-label={`Quantidade do item ${indice + 1}`}
                      className="text-right tabular-nums"
                      value={item.quantidade}
                      onChange={(e) => mudarItem(indice, { quantidade: e.target.value })}
                      disabled={ocupado}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    {indice === 0 ? <span className="text-legenda text-muted-foreground">Valor unitário (R$)</span> : null}
                    <InputPreco
                      valor={item.valorUnitario}
                      onValorChange={(v) => mudarItem(indice, { valorUnitario: v })}
                      ariaLabel={`Valor unitário do item ${indice + 1}`}
                      disabled={ocupado}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    {indice === 0 ? <span className="text-legenda text-muted-foreground">Subtotal</span> : null}
                    <span
                      className="flex h-9 items-center justify-end rounded-md border border-border bg-surface px-3 text-detalhe font-medium tabular-nums"
                      data-testid={`subtotal-${indice}`}
                    >
                      {formatarValorOperacional(subtotalDoItem(item))}
                    </span>
                  </div>
                  <div>
                    {podeRemoverItem(itens) ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remover item ${indice + 1}`}
                        disabled={ocupado}
                        onClick={() => setItens((atual) => atual.filter((_, i) => i !== indice))}
                      >
                        <X />
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-end pt-1">
            <div className="flex flex-col items-end gap-1">
              <span className="text-sm font-medium">Valor total do pedido</span>
              <span className="text-secao font-semibold" data-testid="total-pedido">
                <MoneyText valor={total} />
              </span>
            </div>
          </div>
        </div>

        <CampoFormulario id="ped-observacoes" rotulo="Observações" erro={erros.observacoes?.message}>
          <Textarea
            id="ped-observacoes"
            rows={3}
            placeholder="Alguma observação..."
            disabled={ocupado}
            {...form.register("observacoes")}
          />
        </CampoFormulario>

        <div>
          <h3 className="mb-3 text-detalhe font-medium">Anexos</h3>
          {pedido ? (
            <Anexos entidade={ENTIDADE_ANEXO} entidadeId={pedido.id} anexos={anexos} podeEditar />
          ) : (
            <FilaAnexos arquivos={fila} onMudar={setFila} ocupado={ocupado} />
          )}
        </div>
      </form>
    </FormDrawer>
  );
}
