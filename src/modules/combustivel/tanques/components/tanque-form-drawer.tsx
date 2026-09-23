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
  InputQuantidade,
  LinhaCampos,
  SelectAtivo,
  submeterComAviso,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatarLitros } from "@/modules/combustivel/_shared/rotulos";
import { criarTanque, editarTanque } from "@/modules/combustivel/tanques/actions";
import type { FornecedorOpcao, TanqueLinha } from "@/modules/combustivel/tanques/queries";
import {
  tanqueDoForm,
  tanqueFormSchema,
  type TanqueFormInput,
} from "@/modules/combustivel/tanques/schemas";
import { litrosParaTexto } from "@/modules/combustivel/transferencias/schemas";

const ID_FORM = "form-tanque";

function valoresIniciais(tanque: TanqueLinha | null | undefined): TanqueFormInput {
  return {
    nome: tanque?.nome ?? "",
    apelido: tanque?.apelido ?? "",
    capacidade: tanque ? litrosParaTexto(tanque.capacidade) || "0" : "",
    ehExterno: tanque?.ehExterno ?? false,
    proprietarioId: tanque?.proprietarioId ?? "",
    observacoes: tanque?.observacoes ?? "",
    ativo: tanque?.ativo ?? true,
  };
}

export interface TanqueFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Tanque em edição. Ausente abre em modo de criação. */
  tanque?: TanqueLinha | null;
  fornecedores: FornecedorOpcao[];
}

/**
 * Criação e edição de tanque. Nível e combustível atuais não aparecem para
 * editar: são calculados pelo banco a partir dos movimentos.
 */
export function TanqueFormDrawer({ aberto, onAbertoChange, tanque, fornecedores }: TanqueFormDrawerProps) {
  const editando = Boolean(tanque);

  const form = useForm<TanqueFormInput>({
    resolver: zodResolver(tanqueFormSchema),
    defaultValues: valoresIniciais(tanque),
  });

  const salvando = form.formState.isSubmitting;
  const erros = form.formState.errors;

  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais(tanque));
  }, [aberto, tanque, form]);

  const [ehExterno, proprietarioId, capacidade, ativo] = useWatch({
    control: form.control,
    name: ["ehExterno", "proprietarioId", "capacidade", "ativo"],
  });

  const opcoesFornecedores = React.useMemo(
    () => fornecedores.map((f) => ({ valor: f.id, rotulo: f.nome })),
    [fornecedores],
  );

  async function aoEnviar(valores: TanqueFormInput) {
    const dados = tanqueDoForm(valores);
    const resultado = tanque ? await editarTanque(tanque.id, dados) : await criarTanque(dados);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(editando ? "Tanque salvo" : "Tanque criado");
    onAbertoChange(false);
  }

  // Virar de terceiro com combustível dentro deixa litros da EMT num tanque sem estoque.
  const avisoNivel =
    tanque && !tanque.ehExterno && ehExterno && tanque.nivel > 0
      ? `Este tanque tem ${formatarLitros(tanque.nivel)} da EMT. Tanque de terceiro não tem estoque: esvazie ou transfira antes.`
      : undefined;

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar tanque" : "Novo tanque"}
      descricao={
        editando
          ? "Atualize o cadastro. O nível vem dos movimentos e não se edita aqui"
          : "Cadastre um tanque da EMT ou de terceiro onde as carretas abastecem"
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
              "Salvar tanque"
            ) : (
              "Criar tanque"
            )}
          </Button>
        </>
      }
    >
      <form id={ID_FORM} onSubmit={submeterComAviso(form, aoEnviar)} className={classesFormulario} noValidate>
        <LinhaCampos colunas={2}>
          <CampoFormulario id="tanque-nome" rotulo="Nome" obrigatorio erro={erros.nome?.message}>
            <Input
              id="tanque-nome"
              autoComplete="off"
              placeholder="Tanque Comboio 01"
              disabled={salvando}
              {...form.register("nome")}
            />
          </CampoFormulario>
          <CampoFormulario id="tanque-apelido" rotulo="Apelido" erro={erros.apelido?.message}>
            <Input
              id="tanque-apelido"
              autoComplete="off"
              placeholder="Comboio"
              disabled={salvando}
              {...form.register("apelido")}
            />
          </CampoFormulario>
        </LinhaCampos>

        <CampoFormulario
          id="tanque-capacidade"
          rotulo="Capacidade (litros)"
          obrigatorio
          largura="medio"
          ajuda="Zero desliga a trava de capacidade nas entradas"
          erro={erros.capacidade?.message}
        >
          <InputQuantidade
            id="tanque-capacidade"
            valor={capacidade ?? ""}
            onValorChange={(valor) => form.setValue("capacidade", valor, { shouldDirty: true })}
            onBlur={() => void form.trigger("capacidade")}
            placeholder="0"
            disabled={salvando}
          />
        </CampoFormulario>

        <SelectAtivo
          id="tanque-externo"
          rotulo="Tanque de terceiro"
          value={ehExterno ?? false}
          onChange={(valor) => {
            form.setValue("ehExterno", valor, { shouldDirty: true });
            if (!valor) form.setValue("proprietarioId", "", { shouldDirty: true, shouldValidate: true });
          }}
          disabled={salvando}
          ajuda={
            avisoNivel ??
            "Tanque de outra empresa (posto ou transportadora) onde as carretas abastecem. Não tem estoque nem PEPS."
          }
        />

        {ehExterno ? (
          <CampoFormulario
            id="tanque-dono"
            rotulo="Dono do tanque"
            obrigatorio
            erro={erros.proprietarioId?.message}
          >
            <Combobox
              id="tanque-dono"
              valor={proprietarioId ?? ""}
              rotuloDoValor={tanque?.proprietarioNome ?? undefined}
              onValorChange={(valor) =>
                form.setValue("proprietarioId", valor, { shouldDirty: true, shouldValidate: true })
              }
              opcoes={opcoesFornecedores}
              placeholder="Selecione o fornecedor"
              buscaPlaceholder="Buscar fornecedor"
              disabled={salvando}
            />
          </CampoFormulario>
        ) : null}

        <CampoFormulario id="tanque-observacoes" rotulo="Observações" erro={erros.observacoes?.message}>
          <Textarea id="tanque-observacoes" rows={3} disabled={salvando} {...form.register("observacoes")} />
        </CampoFormulario>

        {/* Como a origem: tanque novo nasce ativo, e o "ativo" só aparece na edição. */}
        {editando ? (
          <SelectAtivo
            id="tanque-ativo"
            value={ativo ?? true}
            onChange={(valor) => form.setValue("ativo", valor, { shouldDirty: true })}
            disabled={salvando}
            ajuda="Tanques inativos somem das listas de seleção, mas continuam no histórico."
          />
        ) : null}
      </form>
    </FormDrawer>
  );
}
