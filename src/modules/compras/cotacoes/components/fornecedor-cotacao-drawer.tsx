"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  FormDrawer,
  LinhaCampos,
  SecaoFormulario,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { OpcaoPagamento } from "@/modules/compras/_shared/pagamento";
import {
  criarCondicaoPagamento,
  criarFormaPagamento,
} from "@/modules/compras/_shared/pagamento-actions";
import { adicionarFornecedor } from "@/modules/compras/cotacoes/actions";
import {
  fornecedorCotacaoFormSchema,
  type FornecedorCotacaoFormInput,
} from "@/modules/compras/cotacoes/schemas";
import type {
  CondicaoPagamentoOpcao,
  FornecedorOpcao,
} from "@/modules/compras/cotacoes/queries";

const ID_FORM = "form-fornecedor-cotacao";
const SEM_CONDICAO = "sem-condicao";

export interface FornecedorCotacaoDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  cotacaoId: string;
  fornecedores: FornecedorOpcao[];
  /** Ids de fornecedor já na cotação, para não oferecer de novo. */
  fornecedoresUsados: string[];
  condicoesPagamento: CondicaoPagamentoOpcao[];
  formasPagamento: OpcaoPagamento[];
}

/**
 * Drawer para adicionar um fornecedor à cotação, com condição de pagamento,
 * prazo de entrega e observação. Fornecedores já na cotação não aparecem.
 *
 * Kit canônico: campos com `CampoFormulario`, condição de pagamento e prazo
 * de entrega (curtos, andam juntos) em `LinhaCampos`. Sem itens aqui — a
 * lista de insumos e preços da cotação é editada em `mapa-comparativo.tsx`,
 * uma matriz comparativa com uma coluna por fornecedor (layout N×M), que não
 * casa com a `TabelaItens` (linhas homogêneas), então fica fora do kit.
 */
export function FornecedorCotacaoDrawer({
  aberto,
  onAbertoChange,
  cotacaoId,
  fornecedores,
  fornecedoresUsados,
  condicoesPagamento,
  formasPagamento,
}: FornecedorCotacaoDrawerProps) {
  const form = useForm<FornecedorCotacaoFormInput>({
    resolver: zodResolver(fornecedorCotacaoFormSchema),
    // Erro aparece ao sair do campo, não só no submit.
    mode: "onBlur",
    defaultValues: {
      fornecedorId: "",
      condicaoPagamentoId: undefined,
      formaPagamentoId: undefined,
      prazoEntregaDias: "",
      observacao: "",
    },
  });

  React.useEffect(() => {
    if (aberto) {
      form.reset({
        fornecedorId: "",
        condicaoPagamentoId: undefined,
        formaPagamentoId: undefined,
        prazoEntregaDias: "",
        observacao: "",
      });
    }
  }, [aberto, form]);

  const salvando = form.formState.isSubmitting;

  const disponiveis = React.useMemo(() => {
    const usados = new Set(fornecedoresUsados);
    return fornecedores.filter((fornecedor) => !usados.has(fornecedor.id));
  }, [fornecedores, fornecedoresUsados]);

  async function aoEnviar(valores: FornecedorCotacaoFormInput) {
    const prazo =
      valores.prazoEntregaDias.trim() !== ""
        ? Number(valores.prazoEntregaDias)
        : undefined;

    const resultado = await adicionarFornecedor(cotacaoId, {
      fornecedorId: valores.fornecedorId,
      condicaoPagamentoId: valores.condicaoPagamentoId,
      formaPagamentoId: valores.formaPagamentoId,
      prazoEntregaDias: prazo,
      observacao: valores.observacao,
    });

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Fornecedor adicionado");
    onAbertoChange(false);
  }

  const fornecedorValor = form.watch("fornecedorId");
  const condicaoPagamentoValor =
    form.watch("condicaoPagamentoId") ?? SEM_CONDICAO;
  const formaPagamentoValor = form.watch("formaPagamentoId") ?? "";

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Adicionar fornecedor"
      descricao="Quem vai cotar os insumos desta cotação"
      temAlteracoesNaoSalvas={form.formState.isDirty && !salvando}
      rodape={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => onAbertoChange(false)}
            disabled={salvando}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            form={ID_FORM}
            disabled={salvando || disponiveis.length === 0}
          >
            {salvando ? (
              <>
                <LoaderCircle className="animate-spin" />
                Adicionando...
              </>
            ) : (
              "Adicionar fornecedor"
            )}
          </Button>
        </>
      }
    >
      <form
        id={ID_FORM}
        onSubmit={form.handleSubmit(aoEnviar)}
        className={classesFormulario}
        noValidate
      >
        <SecaoFormulario titulo="Fornecedor">
          <CampoFormulario
            id="fornecedor-cotacao"
            rotulo="Fornecedor"
            obrigatorio
            erro={form.formState.errors.fornecedorId?.message}
          >
            <Combobox
              valor={fornecedorValor}
              onValorChange={(valor) =>
                form.setValue("fornecedorId", valor, { shouldValidate: true })
              }
              opcoes={disponiveis.map((fornecedor) => ({
                valor: fornecedor.id,
                rotulo: fornecedor.nome,
              }))}
              placeholder={
                disponiveis.length === 0
                  ? "Todos os fornecedores já estão na cotação"
                  : "Escolha um fornecedor"
              }
              disabled={salvando || disponiveis.length === 0}
              id="fornecedor-cotacao"
              className="w-full"
            />
          </CampoFormulario>
        </SecaoFormulario>

        <SecaoFormulario titulo="Condições da proposta">
          <LinhaCampos colunas={3}>
            <CampoFormulario
              id="fornecedor-condicao"
              rotulo="Condição de pagamento"
              erro={form.formState.errors.condicaoPagamentoId?.message}
            >
              <Combobox
                valor={condicaoPagamentoValor}
                onValorChange={(valor) =>
                  form.setValue(
                    "condicaoPagamentoId",
                    valor === SEM_CONDICAO ? undefined : valor,
                  )
                }
                opcoes={[
                  { valor: SEM_CONDICAO, rotulo: "Sem condição informada" },
                  ...condicoesPagamento.map((condicao) => ({
                    valor: condicao.id,
                    rotulo: condicao.descricao,
                  })),
                ]}
                onCriar={async (texto) => {
                  const r = await criarCondicaoPagamento(texto);
                  if ("erro" in r) {
                    toast.error(r.erro);
                    return null;
                  }
                  toast.success("Condição criada");
                  return r.id;
                }}
                placeholder="Selecione a condição de pagamento"
                disabled={salvando}
                id="fornecedor-condicao"
              />
            </CampoFormulario>

            <CampoFormulario
              id="fornecedor-forma"
              rotulo="Forma de pagamento"
              erro={form.formState.errors.formaPagamentoId?.message}
            >
              <Combobox
                valor={formaPagamentoValor}
                onValorChange={(valor) =>
                  form.setValue(
                    "formaPagamentoId",
                    valor === "" ? undefined : valor,
                  )
                }
                opcoes={formasPagamento.map((forma) => ({
                  valor: forma.id,
                  rotulo: forma.nome,
                }))}
                onCriar={async (texto) => {
                  const r = await criarFormaPagamento(texto);
                  if ("erro" in r) {
                    toast.error(r.erro);
                    return null;
                  }
                  toast.success("Forma de pagamento criada");
                  return r.id;
                }}
                limpavel
                placeholder="Selecione a forma de pagamento"
                disabled={salvando}
                id="fornecedor-forma"
              />
            </CampoFormulario>

            <CampoFormulario
              id="fornecedor-prazo"
              rotulo="Prazo de entrega (dias)"
              largura="curto"
              ajuda="Dias corridos após a compra"
              erro={form.formState.errors.prazoEntregaDias?.message}
            >
              <Input
                id="fornecedor-prazo"
                inputMode="numeric"
                placeholder="7"
                className="tabular-nums"
                disabled={salvando}
                {...form.register("prazoEntregaDias")}
              />
            </CampoFormulario>
          </LinhaCampos>
        </SecaoFormulario>

        <SecaoFormulario titulo="Observação">
          <CampoFormulario
            id="fornecedor-observacao"
            rotulo="Observação"
            erro={form.formState.errors.observacao?.message}
          >
            <Textarea
              id="fornecedor-observacao"
              rows={2}
              placeholder="Anotações sobre a proposta deste fornecedor"
              disabled={salvando}
              {...form.register("observacao")}
            />
          </CampoFormulario>
        </SecaoFormulario>
      </form>
    </FormDrawer>
  );
}
