"use client";

import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  ComboboxCriavel,
  FormDrawer,
  LinhaCampos,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { criarCondicaoPagamento } from "@/modules/compras/condicoes-pagamento/actions";
import { adicionarFornecedor } from "@/modules/compras/cotacoes/actions";
import {
  fornecedorCotacaoFormSchema,
  type FornecedorCotacaoFormInput,
} from "@/modules/compras/cotacoes/schemas";
import type { FornecedorOpcao } from "@/modules/compras/cotacoes/queries";

const ID_FORM = "form-fornecedor-cotacao";

export interface FornecedorCotacaoDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  cotacaoId: string;
  fornecedores: FornecedorOpcao[];
  /** Ids de fornecedor já na cotação, para não oferecer de novo. */
  fornecedoresUsados: string[];
  condicoesPagamento: string[];
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
}: FornecedorCotacaoDrawerProps) {
  const form = useForm<FornecedorCotacaoFormInput>({
    resolver: zodResolver(fornecedorCotacaoFormSchema),
    defaultValues: {
      fornecedorId: "",
      condicaoPagamento: "",
      prazoEntregaDias: "",
      observacao: "",
    },
  });

  async function criarCondicao(texto: string) {
    const r = await criarCondicaoPagamento(texto);
    if ("erro" in r) {
      toast.error(r.erro);
      return null;
    }
    return r.descricao;
  }

  React.useEffect(() => {
    if (aberto) {
      form.reset({
        fornecedorId: "",
        condicaoPagamento: "",
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
      condicaoPagamento: valores.condicaoPagamento,
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

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Adicionar fornecedor"
      descricao="Quem vai cotar os insumos desta cotação"
      larguraClassName="sm:max-w-[95vw]"
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

        <LinhaCampos>
          <CampoFormulario
            id="fornecedor-condicao"
            rotulo="Condição de pagamento"
            erro={form.formState.errors.condicaoPagamento?.message}
          >
            <Controller
              name="condicaoPagamento"
              control={form.control}
              render={({ field }) => (
                <ComboboxCriavel
                  id="fornecedor-condicao"
                  valor={field.value ?? ""}
                  onValorChange={field.onChange}
                  opcoes={condicoesPagamento}
                  onCriar={criarCondicao}
                  placeholder="30 dias"
                  disabled={salvando}
                />
              )}
            />
          </CampoFormulario>

          <CampoFormulario
            id="fornecedor-prazo"
            rotulo="Prazo de entrega (dias)"
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
      </form>
    </FormDrawer>
  );
}
