"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
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
import { Textarea } from "@/components/ui/textarea";
import { criarPilha, editarPilha } from "@/modules/estoque/pilhas/actions";
import type { PilhaLinha } from "@/modules/estoque/pilhas/queries";
import { pilhaSchema, type PilhaInput } from "@/modules/estoque/pilhas/schemas";
import type { InsumoOpcao } from "@/modules/manutencao/almoxarifado/queries";

const ID_FORM = "form-pilha-estoque";

const PADRAO: PilhaInput = { nome: "", localidadeId: "", insumoId: "", observacoes: "" };

export interface PilhaFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Pilha em edição. Ausente abre em modo de criação. */
  pilha?: PilhaLinha | null;
  /** Insumos ativos, com a unidade do cadastro. */
  insumos: InsumoOpcao[];
  /** Localidades ativas (as mesmas de origem e destino do Frete). */
  localidades: { id: string; nome: string }[];
}

/**
 * Criação e edição da pilha: nome, insumo e observações. A unidade é a do cadastro do
 * insumo, por isso o insumo aparece com ela. Depois da primeira entrada o insumo não troca.
 */
export function PilhaFormDrawer({ aberto, onAbertoChange, pilha, insumos, localidades }: PilhaFormDrawerProps) {
  const router = useRouter();
  const editando = Boolean(pilha);
  // Saída só existe depois de entrada: entrou alguma coisa = tem movimento.
  const insumoTravado = (pilha?.totalEntrada ?? 0) > 0;

  const form = useForm<PilhaInput>({
    resolver: zodResolver(pilhaSchema),
    defaultValues: PADRAO,
  });
  const salvando = form.formState.isSubmitting;
  const [insumoId, localidadeId] = useWatch({ control: form.control, name: ["insumoId", "localidadeId"] });

  React.useEffect(() => {
    if (!aberto) return;
    form.reset(
      pilha
        ? {
            nome: pilha.nome,
            localidadeId: pilha.localidadeId ?? "",
            insumoId: pilha.insumoId ?? "",
            observacoes: pilha.observacoes ?? "",
          }
        : PADRAO,
    );
  }, [aberto, pilha, form]);

  const opcoesInsumos = React.useMemo(
    () => insumos.map((i) => ({ valor: i.id, rotulo: i.unidade ? `${i.nome} · ${i.unidade}` : i.nome })),
    [insumos],
  );
  const opcoesLocalidades = React.useMemo(
    () => localidades.map((l) => ({ valor: l.id, rotulo: l.nome })),
    [localidades],
  );
  const insumo = insumos.find((i) => i.id === insumoId) ?? null;
  const unidade = insumo ? insumo.unidade : insumoId && insumoId === pilha?.insumoId ? pilha.unidade : null;

  async function aoEnviar(dados: PilhaInput) {
    const resultado = pilha ? await editarPilha(pilha.id, dados) : await criarPilha(dados);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    onAbertoChange(false);
    // Criado agora: o lugar é marcado no mapa do módulo Mapa (quem pode editar o Mapa vai direto).
    if (!editando && resultado.mapa) {
      toast.success("Pilha criada: toque no mapa onde ela fica");
      router.push(resultado.mapa);
      return;
    }
    toast.success(editando ? "Pilha salva" : "Pilha criada");
  }

  const erros = form.formState.errors;

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar pilha" : "Nova pilha"}
      descricao="Cada pilha guarda um insumo só, na unidade do cadastro dele. Quando zera, fica inativa sozinha"
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
              "Salvar pilha"
            ) : (
              "Criar pilha"
            )}
          </Button>
        </>
      }
    >
      <form id={ID_FORM} onSubmit={submeterComAviso(form, aoEnviar)} className={classesFormulario} noValidate>
        <CampoFormulario id="pilha-nome" rotulo="Nome" obrigatorio erro={erros.nome?.message}>
          <Input
            id="pilha-nome"
            autoComplete="off"
            placeholder="Brita 1 — Canteiro km 50"
            disabled={salvando}
            {...form.register("nome")}
          />
        </CampoFormulario>

        <CampoFormulario
          id="pilha-local"
          rotulo="Local"
          obrigatorio
          ajuda={
            insumoTravado
              ? "A pilha já teve entrada: o local não troca mais"
              : "O frete que chega neste local entra nesta pilha"
          }
          erro={erros.localidadeId?.message}
        >
          <Combobox
            id="pilha-local"
            valor={localidadeId ?? ""}
            rotuloDoValor={pilha?.localidadeNome ?? undefined}
            onValorChange={(valor) => form.setValue("localidadeId", valor, { shouldDirty: true, shouldValidate: true })}
            opcoes={opcoesLocalidades}
            placeholder="Selecione o local"
            buscaPlaceholder="Buscar local"
            vazioTexto="Nenhum local ativo. Cadastre em Cadastros › Localidades"
            disabled={salvando || insumoTravado}
          />
        </CampoFormulario>

        <LinhaCampos>
          <CampoFormulario
            id="pilha-insumo"
            rotulo="Insumo"
            obrigatorio
            ajuda={insumoTravado ? "A pilha já teve entrada: o insumo não troca mais" : undefined}
            erro={erros.insumoId?.message}
          >
            <Combobox
              id="pilha-insumo"
              valor={insumoId ?? ""}
              rotuloDoValor={pilha?.insumoNome ?? undefined}
              onValorChange={(valor) => form.setValue("insumoId", valor, { shouldDirty: true, shouldValidate: true })}
              opcoes={opcoesInsumos}
              placeholder="Selecione o insumo"
              buscaPlaceholder="Buscar insumo"
              disabled={salvando || insumoTravado}
            />
          </CampoFormulario>
          <CampoFormulario
            id="pilha-unidade"
            rotulo="Unidade"
            largura="curto"
            ajuda={insumoId ? "A do cadastro do insumo" : undefined}
          >
            <Input id="pilha-unidade" value={unidade ?? (insumoId ? "Sem unidade" : "—")} readOnly disabled />
          </CampoFormulario>
        </LinhaCampos>

        <CampoFormulario id="pilha-observacoes" rotulo="Observações" erro={erros.observacoes?.message}>
          <Textarea id="pilha-observacoes" rows={3} disabled={salvando} {...form.register("observacoes")} />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
