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
  capacidadeParaNumero,
  densidadeParaNumero,
  tanqueDoForm,
  tanqueFormSchema,
  type TanqueFormInput,
} from "@/modules/combustivel/tanques/schemas";
import {
  deLitros,
  emLitros,
  ROTULO_UNIDADE_CAPACIDADE,
  siglaVisivel,
  UNIDADES_CAPACIDADE,
  type UnidadeCapacidade,
} from "@/modules/combustivel/tanques/unidades";
import { formatarCapacidade } from "@/modules/combustivel/tanques/visual";
import { litrosParaTexto } from "@/modules/combustivel/transferencias/schemas";

const ID_FORM = "form-tanque";

const OPCOES_USO = [
  { valor: "combustivel", rotulo: "Combustível" },
  { valor: "material", rotulo: "Material (CAP, emulsão...)" },
];

const OPCOES_UNIDADE = UNIDADES_CAPACIDADE.map((u) => ({ valor: u, rotulo: ROTULO_UNIDADE_CAPACIDADE[u] }));

/** Betume, emulsão e imprimação ficam perto da água: o tanque novo de material nasce com 1. */
const DENSIDADE_PADRAO = "1";

function valoresIniciais(tanque: TanqueLinha | null | undefined): TanqueFormInput {
  const unidade = tanque?.capacidadeUnidade ?? "L";
  // A capacidade volta na unidade em que foi digitada (o banco guarda em litros).
  const capacidade = tanque ? deLitros(tanque.capacidade, unidade, tanque.densidade) ?? tanque.capacidade : null;
  return {
    nome: tanque?.nome ?? "",
    apelido: tanque?.apelido ?? "",
    capacidade: capacidade === null ? "" : litrosParaTexto(capacidade) || "0",
    capacidadeUnidade: unidade,
    densidade: tanque?.densidade ? litrosParaTexto(tanque.densidade) : DENSIDADE_PADRAO,
    uso: tanque?.uso ?? "combustivel",
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

  const [ehExterno, proprietarioId, capacidade, ativo, uso, capacidadeUnidade, densidade] = useWatch({
    control: form.control,
    name: ["ehExterno", "proprietarioId", "capacidade", "ativo", "uso", "capacidadeUnidade", "densidade"],
  });
  const material = uso === "material";
  const densidadeNumero = densidadeParaNumero(densidade ?? "");

  // Trocar a unidade converte o número já digitado (30.000 L vira 30 m³), quando dá.
  function trocarUnidade(nova: UnidadeCapacidade) {
    const atual = capacidadeParaNumero(capacidade ?? "");
    const litros = atual === null ? null : emLitros(atual, capacidadeUnidade, densidadeNumero);
    const convertida = litros === null ? null : deLitros(litros, nova, densidadeNumero);
    form.setValue("capacidadeUnidade", nova, { shouldDirty: true });
    if (convertida !== null) {
      form.setValue("capacidade", litrosParaTexto(Math.round(convertida * 10_000) / 10_000) || "0", {
        shouldDirty: true,
      });
    }
  }

  // O tanque é volume: mostra quantos litros a capacidade digitada ocupa.
  const capacidadeNumero = capacidadeParaNumero(capacidade ?? "");
  const capacidadeEmLitros =
    capacidadeNumero === null ? null : emLitros(capacidadeNumero, capacidadeUnidade, densidadeNumero);
  const ajudaCapacidade =
    capacidadeNumero === null || capacidadeNumero === 0
      ? "Zero desliga a trava de capacidade nas entradas"
      : capacidadeUnidade === "L"
        ? "O saldo em kg ou t é convertido pela densidade para conferir a capacidade"
        : capacidadeEmLitros === null
          ? "Informe a densidade para converter em litros"
          : `Volume do tanque: ${formatarCapacidade(capacidadeEmLitros)} L`;

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

        {material ? (
          <>
            <LinhaCampos colunas={2}>
              <CampoFormulario
                id="tanque-capacidade"
                rotulo={`Capacidade (${siglaVisivel(capacidadeUnidade ?? "L")})`}
                obrigatorio
                ajuda={ajudaCapacidade}
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
              <CampoFormulario id="tanque-capacidade-unidade" rotulo="Unidade da capacidade" obrigatorio>
                <Combobox
                  id="tanque-capacidade-unidade"
                  valor={capacidadeUnidade ?? "L"}
                  onValorChange={(valor) => {
                    const nova = UNIDADES_CAPACIDADE.find((u) => u === valor);
                    if (nova) trocarUnidade(nova);
                  }}
                  opcoes={OPCOES_UNIDADE}
                  disabled={salvando}
                />
              </CampoFormulario>
            </LinhaCampos>
            <CampoFormulario
              id="tanque-densidade"
              rotulo="Densidade do material (kg/L)"
              obrigatorio
              largura="medio"
              ajuda="Converte kg e t em litros. Betume, emulsão e imprimação ficam perto de 1,00"
              erro={erros.densidade?.message}
            >
              <InputQuantidade
                id="tanque-densidade"
                valor={densidade ?? ""}
                onValorChange={(valor) => form.setValue("densidade", valor, { shouldDirty: true })}
                onBlur={() => void form.trigger("densidade")}
                placeholder={DENSIDADE_PADRAO}
                disabled={salvando}
              />
            </CampoFormulario>
          </>
        ) : (
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
        )}

        <CampoFormulario
          id="tanque-uso"
          rotulo="Uso"
          obrigatorio
          ajuda={
            uso === "material"
              ? "CAP, emulsão e outros materiais: entrada e saída pelo Estoque"
              : "Diesel, gasolina, Arla: entrada e saída pelo módulo Combustível"
          }
          erro={erros.uso?.message}
        >
          <Combobox
            id="tanque-uso"
            valor={uso ?? "combustivel"}
            onValorChange={(valor) => {
              const novo = valor === "material" ? "material" : "combustivel";
              // Combustível é só em litros: o número digitado em outra unidade volta para L.
              if (novo === "combustivel" && capacidadeUnidade !== "L") trocarUnidade("L");
              form.setValue("uso", novo, { shouldDirty: true });
              if (novo === "material") {
                form.setValue("ehExterno", false, { shouldDirty: true });
                form.setValue("proprietarioId", "", { shouldDirty: true });
              }
            }}
            opcoes={OPCOES_USO}
            disabled={salvando}
          />
        </CampoFormulario>

        {uso === "material" ? null : (
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
        )}

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
