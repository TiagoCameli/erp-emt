"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  FormDrawer,
  LinhaCampos,
  submeterComAviso,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { entrarDiarista, type ResultadoMapa } from "@/modules/mapa/actions";
import {
  diaristaFormSchema,
  type DiaristaFormInput,
  type EntrarDiaristaInput,
} from "@/modules/mapa/schemas";
import type { DiaristaForaDoMapa, FuncaoOpcao } from "@/modules/mapa/tipos";

const ID_FORM = "form-diarista-mapa";

export interface DrawerDiaristaProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  candidatos: DiaristaForaDoMapa[];
  funcoes: FuncaoOpcao[];
  /** Pode cadastrar colaborador (cadastros.colaboradores/criar): libera "Novo diarista". */
  podeCadastrar: boolean;
  onSucesso: (
    resultado: Extract<ResultadoMapa, { ok: true }>,
    colaboradorId: string | null,
  ) => void;
}

function valoresIniciais(): DiaristaFormInput {
  return {
    origem: "existente",
    colaboradorId: "",
    nome: "",
    cpf: "",
    funcaoId: "",
  };
}

/**
 * "Adicionar diarista": põe no mapa um diarista do RH que está fora dele, ou cadastra um novo
 * (entra no cadastro de colaboradores como diarista). Diarista só entra e sai pelo Mapa, igual
 * máquina alugada (Tiago, 17/10/2026). Ao salvar, a tela já pede para posicionar.
 */
export function DrawerDiarista({
  aberto,
  onAbertoChange,
  candidatos,
  funcoes,
  podeCadastrar,
  onSucesso,
}: DrawerDiaristaProps) {
  const form = useForm<DiaristaFormInput>({
    resolver: zodResolver(diaristaFormSchema),
    defaultValues: valoresIniciais(),
  });

  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais());
  }, [aberto, form]);

  const salvando = form.formState.isSubmitting;
  const origem = form.watch("origem");
  const colaboradorId = form.watch("colaboradorId");
  const funcaoId = form.watch("funcaoId");
  const erros = form.formState.errors;

  const opcoesDiarista = React.useMemo(
    () =>
      candidatos.map((c) => ({
        valor: c.id,
        rotulo: c.funcao ? `${c.nome} · ${c.funcao}` : c.nome,
      })),
    [candidatos],
  );
  const opcoesFuncao = React.useMemo(
    () => funcoes.map((f) => ({ valor: f.id, rotulo: f.nome })),
    [funcoes],
  );

  async function aoEnviar(valores: DiaristaFormInput) {
    const pedido: EntrarDiaristaInput = {
      colaboradorId:
        valores.origem === "existente" ? valores.colaboradorId : null,
      novo:
        valores.origem === "novo"
          ? {
              nome: valores.nome,
              cpf: valores.cpf || undefined,
              funcaoId: valores.funcaoId || undefined,
            }
          : null,
    };
    const resultado = await entrarDiarista(pedido);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Diarista no mapa. Agora posicione no mapa.");
    onAbertoChange(false);
    onSucesso(resultado, resultado.colaboradorId ?? null);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Adicionar diarista"
      descricao="Diarista entra e sai do mapa por aqui, como máquina alugada. Quem está fora do mapa não conta dia nem diária."
      temAlteracoesNaoSalvas={form.formState.isDirty && !salvando}
      larguraClassName="max-w-2xl"
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
                Adicionando...
              </>
            ) : (
              "Adicionar ao mapa"
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
          id="diar-origem"
          rotulo="Diarista"
          obrigatorio
          largura="medio"
        >
          <Select
            value={origem}
            onValueChange={(v) =>
              form.setValue("origem", v as "existente" | "novo", {
                shouldDirty: true,
              })
            }
            disabled={salvando}
          >
            <SelectTrigger id="diar-origem" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="existente">Já cadastrado no RH</SelectItem>
              {podeCadastrar ? (
                <SelectItem value="novo">Novo diarista</SelectItem>
              ) : null}
            </SelectContent>
          </Select>
        </CampoFormulario>

        {origem === "existente" ? (
          <CampoFormulario
            id="diar-colaborador"
            rotulo="Quem"
            obrigatorio
            erro={erros.colaboradorId?.message}
            largura="longo"
            ajuda={
              candidatos.length === 0
                ? "Nenhum diarista ativo do RH fora do mapa."
                : undefined
            }
          >
            <Combobox
              id="diar-colaborador"
              valor={colaboradorId}
              onValorChange={(v) =>
                form.setValue("colaboradorId", v, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              opcoes={opcoesDiarista}
              placeholder="Escolha o diarista"
              buscaPlaceholder="Nome ou função"
              disabled={salvando}
            />
          </CampoFormulario>
        ) : (
          <>
            <CampoFormulario
              id="diar-nome"
              rotulo="Nome"
              obrigatorio
              erro={erros.nome?.message}
              largura="longo"
            >
              <Input
                id="diar-nome"
                disabled={salvando}
                maxLength={300}
                {...form.register("nome")}
              />
            </CampoFormulario>
            <LinhaCampos>
              <CampoFormulario
                id="diar-cpf"
                rotulo="CPF"
                erro={erros.cpf?.message}
                largura="medio"
              >
                <Input
                  id="diar-cpf"
                  inputMode="numeric"
                  disabled={salvando}
                  maxLength={20}
                  {...form.register("cpf")}
                />
              </CampoFormulario>
              <CampoFormulario
                id="diar-funcao"
                rotulo="Função"
                erro={erros.funcaoId?.message}
                largura="medio"
              >
                <Combobox
                  id="diar-funcao"
                  valor={funcaoId}
                  onValorChange={(v) =>
                    form.setValue("funcaoId", v, { shouldDirty: true })
                  }
                  opcoes={opcoesFuncao}
                  placeholder="Sem função"
                  buscaPlaceholder="Nome da função"
                  disabled={salvando}
                />
              </CampoFormulario>
            </LinhaCampos>
            <p className="text-legenda text-muted-foreground">
              Entra no cadastro de colaboradores como diarista. O resto da ficha
              (conta, documentos) se completa no RH.
            </p>
          </>
        )}
      </form>
    </FormDrawer>
  );
}
