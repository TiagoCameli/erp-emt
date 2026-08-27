"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  FormDrawer,
  SelectAtivo,
  submeterComAviso,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AJUDA_TIPO_FORMA,
  CAMINHO_DO_PAGAMENTO,
  ROTULO_TIPO_FORMA,
  TIPOS_FORMA_PAGAMENTO,
  tipoFormaPagamento,
} from "@/modules/_shared/forma-pagamento";
import {
  criarForma,
  editarForma,
} from "@/modules/cadastros/formas-pagamento/actions";
import type { FormaLista } from "@/modules/cadastros/formas-pagamento/queries";
import {
  formaPagamentoSchema,
  type FormaPagamentoFormInput,
} from "@/modules/cadastros/formas-pagamento/schemas";

const ID_FORM = "form-forma-pagamento";

const PADRAO: FormaPagamentoFormInput = {
  nome: "",
  tipo: "bancario",
  ativo: true,
};

const OPCOES_TIPO = TIPOS_FORMA_PAGAMENTO.map((tipo) => ({
  valor: tipo,
  rotulo: `${ROTULO_TIPO_FORMA[tipo]} — ${AJUDA_TIPO_FORMA[tipo]}`,
}));

/** Valores iniciais a partir de uma forma existente, ou em branco. */
function valoresIniciais(
  forma: FormaLista | null | undefined,
): FormaPagamentoFormInput {
  if (!forma) return PADRAO;
  return { nome: forma.nome, tipo: forma.tipo, ativo: forma.ativo };
}

export interface FormaFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Forma em edição. Ausente abre o drawer em modo de criação. */
  forma?: FormaLista | null;
}

/**
 * Drawer de criação e edição de forma de pagamento: nome, tipo e status.
 *
 * O tipo é o campo que importa: ele decide o caminho de todo pagamento futuro
 * que usar esta forma. A tela diz o que cada tipo provoca antes de salvar, e
 * avisa quando a forma já está em uso, porque mudar o tipo muda o comportamento
 * das próximas compras (as antigas seguem o caminho que já tomaram).
 */
export function FormaFormDrawer({
  aberto,
  onAbertoChange,
  forma,
}: FormaFormDrawerProps) {
  const editando = Boolean(forma);

  const form = useForm<FormaPagamentoFormInput>({
    resolver: zodResolver(formaPagamentoSchema),
    defaultValues: valoresIniciais(forma),
  });

  const salvando = form.formState.isSubmitting;
  const tipoEscolhido = tipoFormaPagamento(form.watch("tipo"));

  async function aoEnviar(entrada: FormaPagamentoFormInput) {
    // Aplica o default (ativo) e normaliza (trim) antes de chamar a action.
    const dados = formaPagamentoSchema.parse(entrada);
    const resultado = forma
      ? await editarForma(forma.id, dados)
      : await criarForma(dados);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(
      editando ? "Forma de pagamento salva" : "Forma de pagamento criada",
    );
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={
        editando ? "Editar forma de pagamento" : "Nova forma de pagamento"
      }
      descricao={
        editando
          ? "O tipo decide o caminho dos próximos pagamentos que usarem esta forma"
          : "Cadastre uma forma para usar em cotações, ordens de compra e lançamentos"
      }
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
          <Button type="submit" form={ID_FORM} disabled={salvando}>
            {salvando ? (
              <>
                <LoaderCircle className="animate-spin" />
                Salvando...
              </>
            ) : editando ? (
              "Salvar forma"
            ) : (
              "Criar forma"
            )}
          </Button>
        </>
      }
    >
      <form
        id={ID_FORM}
        onSubmit={submeterComAviso(form, aoEnviar)}
        className={classesFormulario}
        noValidate
      >
        <CampoFormulario
          id="forma-nome"
          rotulo="Nome"
          obrigatorio
          erro={form.formState.errors.nome?.message}
        >
          <Input
            id="forma-nome"
            autoComplete="off"
            placeholder="PIX, boleto, dinheiro, cartão de crédito"
            disabled={salvando}
            {...form.register("nome")}
          />
        </CampoFormulario>

        <CampoFormulario
          id="forma-tipo"
          rotulo="Tipo"
          obrigatorio
          ajuda={CAMINHO_DO_PAGAMENTO[tipoEscolhido]}
          erro={form.formState.errors.tipo?.message}
        >
          <Combobox
            valor={tipoEscolhido}
            onValorChange={(valor) =>
              form.setValue("tipo", tipoFormaPagamento(valor), {
                shouldDirty: true,
              })
            }
            opcoes={OPCOES_TIPO}
            placeholder="Selecione o tipo"
            disabled={salvando}
            id="forma-tipo"
          />
        </CampoFormulario>

        {editando && forma && forma.usoEmOrdens > 0 ? (
          <p className="rounded-md border border-dashed border-border bg-surface/50 px-3 py-3 text-legenda text-muted-foreground">
            {forma.usoEmOrdens === 1
              ? "1 ordem de compra usa esta forma."
              : `${forma.usoEmOrdens} ordens de compra usam esta forma.`}{" "}
            Trocar o tipo muda o caminho dos pagamentos das próximas compras. Os
            lançamentos já criados seguem o caminho que tomaram.
          </p>
        ) : null}

        <SelectAtivo
          value={form.watch("ativo") ?? true}
          onChange={(valor) => form.setValue("ativo", valor)}
          disabled={salvando}
          rotulo="Ativa"
          ajuda="Formas inativas somem das opções de novos documentos, mas continuam no histórico."
        />
      </form>
    </FormDrawer>
  );
}
