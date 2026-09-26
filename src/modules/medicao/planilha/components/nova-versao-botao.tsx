"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Plus } from "lucide-react";

import { CampoFormulario, classesFormulario, Combobox, FormDrawer, submeterComAviso } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { criarRascunho } from "@/modules/medicao/planilha/actions";
import { rascunhoSchema, type RascunhoInput } from "@/modules/medicao/planilha/schemas";

const ID_FORM = "form-nova-versao";
const VALORES_INICIAIS: RascunhoInput = { aditivoId: null, vigenteDesde: "", motivo: "" };

export interface NovaVersaoBotaoProps {
  contratoId: string;
  /** Número que a versão nova vai receber (0 = licitada). */
  proximoNumero: number;
  /** Aditivos que mudam a planilha e ainda não têm versão. */
  aditivos: { id: string; numero: number; motivo: string }[];
  /** Já existe versão em rascunho: a RPC recusa a segunda, então o botão já avisa. */
  temRascunho: boolean;
}

/**
 * "Nova versão" da lista de versões. A v0 é a planilha licitada, sem aditivo; da v1 em diante o
 * aditivo que a originou é obrigatório (a RPC confere de novo). Ao criar, vai direto para a
 * importação do xlsx.
 */
export function NovaVersaoBotao({ contratoId, proximoNumero, aditivos, temRascunho }: NovaVersaoBotaoProps) {
  const router = useRouter();
  const [aberto, setAberto] = React.useState(false);
  const precisaAditivo = proximoNumero > 0;
  const form = useForm<RascunhoInput>({ resolver: zodResolver(rascunhoSchema), defaultValues: VALORES_INICIAIS });
  const salvando = form.formState.isSubmitting;
  const erros = form.formState.errors;
  const aditivoId = useWatch({ control: form.control, name: "aditivoId" });

  React.useEffect(() => {
    if (aberto) form.reset(VALORES_INICIAIS);
  }, [aberto, form]);

  async function aoEnviar(valores: RascunhoInput) {
    if (precisaAditivo && !valores.aditivoId) {
      form.setError("aditivoId", { message: "Escolha o aditivo que originou esta versão" });
      return;
    }
    const resultado = await criarRascunho(contratoId, { ...valores, aditivoId: precisaAditivo ? valores.aditivoId : null });
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(`Versão v${proximoNumero} criada. Agora anexe o xlsx oficial`);
    setAberto(false);
    router.push(`/medicao/planilha/${resultado.id}/importar`);
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        onClick={() => setAberto(true)}
        disabled={temRascunho}
        title={temRascunho ? "Já existe uma versão em rascunho. Termine ou exclua antes de começar outra" : undefined}
      >
        <Plus />
        {proximoNumero === 0 ? "Importar planilha licitada" : "Nova versão por aditivo"}
      </Button>
      <FormDrawer
        aberto={aberto}
        onAbertoChange={setAberto}
        titulo={`Nova versão v${proximoNumero}`}
        descricao={
          precisaAditivo
            ? "A versão nova entra em rascunho. A anterior continua valendo até esta ficar vigente"
            : "A v0 é a planilha licitada. Ela entra em rascunho até você torná-la vigente"
        }
        temAlteracoesNaoSalvas={form.formState.isDirty && !salvando}
        rodape={
          <>
            <Button type="button" variant="outline" onClick={() => setAberto(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button type="submit" form={ID_FORM} disabled={salvando}>
              {salvando ? (
                <>
                  <LoaderCircle className="animate-spin" />
                  Criando...
                </>
              ) : (
                "Criar e importar"
              )}
            </Button>
          </>
        }
      >
        <form id={ID_FORM} onSubmit={submeterComAviso(form, aoEnviar)} className={classesFormulario} noValidate>
          <CampoFormulario id="versao-vigente-desde" rotulo="Vigente desde" obrigatorio erro={erros.vigenteDesde?.message} largura="curto">
            <Input id="versao-vigente-desde" type="date" disabled={salvando} {...form.register("vigenteDesde")} />
          </CampoFormulario>

          {precisaAditivo ? (
            <CampoFormulario id="versao-aditivo" rotulo="Aditivo" obrigatorio erro={erros.aditivoId?.message}>
              <Combobox
                id="versao-aditivo"
                valor={aditivoId ?? ""}
                onValorChange={(v) => form.setValue("aditivoId", v === "" ? null : v, { shouldDirty: true, shouldValidate: true })}
                opcoes={aditivos.map((a) => ({ valor: a.id, rotulo: `Aditivo nº ${a.numero} · ${a.motivo}` }))}
                placeholder={aditivos.length === 0 ? "Nenhum aditivo sem versão" : "Selecione o aditivo"}
                buscaPlaceholder="Buscar aditivo"
                vazioTexto="Registre o aditivo no cadastro do contrato"
                disabled={salvando}
              />
            </CampoFormulario>
          ) : null}

          <CampoFormulario id="versao-motivo" rotulo="Motivo" erro={erros.motivo?.message}>
            <Textarea id="versao-motivo" rows={3} disabled={salvando} {...form.register("motivo")} />
          </CampoFormulario>
        </form>
      </FormDrawer>
    </>
  );
}
