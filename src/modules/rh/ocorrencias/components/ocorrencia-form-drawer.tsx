"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import { Anexos } from "@/components/canonicos/anexos";
import {
  FilaAnexos,
  subirFilaDeAnexos,
} from "@/components/canonicos/fila-anexos";
import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  FormDrawer,
  LinhaCampos,
  submeterComAviso,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { dataHojeISO } from "@/lib/formatadores";
import type { AnexoDoDocumento } from "@/modules/_shared/anexos/queries";
import {
  criarOcorrencia,
  editarOcorrencia,
} from "@/modules/rh/ocorrencias/actions";
import type { OcorrenciaLista } from "@/modules/rh/ocorrencias/queries";
import {
  ocorrenciaFormParaInput,
  ocorrenciaFormSchema,
  ROTULO_TIPO_OCORRENCIA,
  TIPOS_OCORRENCIA,
  type OcorrenciaFormInput,
} from "@/modules/rh/ocorrencias/schemas";
import type { ColaboradorOpcao } from "@/modules/rh/_shared/queries";

const ID_FORM = "form-ocorrencia";

function valoresIniciais(): OcorrenciaFormInput {
  return {
    colaboradorId: "",
    data: dataHojeISO(),
    dataFim: "",
    tipo: "advertencia",
    descricao: "",
    observacao: "",
  };
}

export interface OcorrenciaFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  colaboradores: ColaboradorOpcao[];
  /** Ocorrência em edição. Ausente significa criar. */
  ocorrencia?: OcorrenciaLista | null;
  /** Libera anexar/remover arquivos (permissão de editar do recurso). */
  podeEditar?: boolean;
  /** Anexos da ocorrência pré-carregados no server, para não travar em "Carregando". */
  anexosIniciais?: AnexoDoDocumento[];
}

/**
 * Drawer com o formulário de ocorrência. Cria quando não recebe registro e
 * edita quando recebe. Fecha sozinho ao salvar. Na edição, mostra a seção de
 * anexos (atestado em PDF ou imagem) do registro já existente.
 */
export function OcorrenciaFormDrawer({
  aberto,
  onAbertoChange,
  colaboradores,
  ocorrencia,
  podeEditar = false,
  anexosIniciais,
}: OcorrenciaFormDrawerProps) {
  const router = useRouter();
  const editando = Boolean(ocorrencia);

  const form = useForm<OcorrenciaFormInput>({
    resolver: zodResolver(ocorrenciaFormSchema),
    defaultValues: valoresIniciais(),
  });

  // Sincroniza o formulário sempre que o drawer abre ou troca de registro.
  React.useEffect(() => {
    if (!aberto) return;
    if (ocorrencia) {
      form.reset({
        colaboradorId: ocorrencia.colaboradorId,
        data: ocorrencia.data,
        dataFim: ocorrencia.dataFim ?? "",
        tipo: ocorrencia.tipo,
        descricao: ocorrencia.descricao,
        observacao: ocorrencia.observacao ?? "",
      });
    } else {
      form.reset(valoresIniciais());
    }
  }, [aberto, ocorrencia, form]);

  const [filaAnexos, setFilaAnexos] = React.useState<File[]>([]);
  const [subindoAnexos, setSubindoAnexos] = React.useState(false);

  const salvando = form.formState.isSubmitting;
  const tipoAtual = form.watch("tipo");
  const ehAtestado = tipoAtual === "atestado";

  async function aoEnviar(dados: OcorrenciaFormInput) {
    const entrada = ocorrenciaFormParaInput(dados);
    const resultado = ocorrencia
      ? await editarOcorrencia(ocorrencia.id, entrada)
      : await criarOcorrencia(entrada);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(editando ? "Ocorrência salva" : "Ocorrência criada");

    // A fila de anexos sobe agora que o registro existe.
    if (!ocorrencia && filaAnexos.length > 0 && "id" in resultado) {
      setSubindoAnexos(true);
      await subirFilaDeAnexos("rh_ocorrencia", String(resultado.id), filaAnexos);
      setSubindoAnexos(false);
      setFilaAnexos([]);
    }
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar ocorrência" : "Nova ocorrência"}
      descricao="Ausências e ocorrências por colaborador."
      rodape={
        <>
          <Button
            type="button"
            variant="outline"
            disabled={salvando}
            onClick={() => onAbertoChange(false)}
          >
            Cancelar
          </Button>
          <Button type="submit" form={ID_FORM} disabled={salvando}>
            {salvando ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : null}
            {editando ? "Salvar ocorrência" : "Criar ocorrência"}
          </Button>
        </>
      }
    >
      <form
        id={ID_FORM}
        onSubmit={submeterComAviso(form, aoEnviar)}
        className={classesFormulario}
      >
        <CampoFormulario
          id="ocorrencia-colaborador"
          rotulo="Colaborador"
          erro={form.formState.errors.colaboradorId?.message}
        >
          <Combobox
            valor={form.watch("colaboradorId")}
            onValorChange={(valor) =>
              form.setValue("colaboradorId", valor, { shouldValidate: true })
            }
            opcoes={colaboradores.map((colaborador) => ({
              valor: colaborador.id,
              rotulo: `${colaborador.nome}${
                colaborador.funcao ? ` - ${colaborador.funcao}` : ""
              }`,
            }))}
            placeholder="Selecione o colaborador"
            className="w-full"
            id="ocorrencia-colaborador"
          />
        </CampoFormulario>

        <LinhaCampos colunas={ehAtestado ? 3 : 2}>
          <CampoFormulario
            id="ocorrencia-data"
            rotulo={ehAtestado ? "Início" : "Data"}
            erro={form.formState.errors.data?.message}
          >
            <Input
              id="ocorrencia-data"
              type="date"
              {...form.register("data")}
            />
          </CampoFormulario>

          {ehAtestado ? (
            <CampoFormulario
              id="ocorrencia-data-fim"
              rotulo="Fim"
              erro={form.formState.errors.dataFim?.message}
            >
              <Input
                id="ocorrencia-data-fim"
                type="date"
                {...form.register("dataFim")}
              />
            </CampoFormulario>
          ) : null}

          <CampoFormulario
            id="ocorrencia-tipo"
            rotulo="Tipo"
            erro={form.formState.errors.tipo?.message}
          >
            <Combobox
              valor={tipoAtual}
              onValorChange={(valor) => {
                form.setValue("tipo", valor as OcorrenciaFormInput["tipo"], {
                  shouldValidate: true,
                });
                if (valor !== "atestado") {
                  form.setValue("dataFim", "", { shouldValidate: true });
                }
              }}
              opcoes={TIPOS_OCORRENCIA.map((valor) => ({
                valor,
                rotulo: ROTULO_TIPO_OCORRENCIA[valor],
              }))}
              placeholder="Selecione o tipo"
              className="w-full"
              id="ocorrencia-tipo"
            />
          </CampoFormulario>
        </LinhaCampos>

        <CampoFormulario
          id="ocorrencia-descricao"
          rotulo="Descrição"
          erro={form.formState.errors.descricao?.message}
        >
          <Textarea
            id="ocorrencia-descricao"
            rows={3}
            placeholder="O que aconteceu"
            {...form.register("descricao")}
          />
        </CampoFormulario>

        <CampoFormulario
          id="ocorrencia-observacao"
          rotulo="Observação"
          erro={form.formState.errors.observacao?.message}
        >
          <Textarea
            id="ocorrencia-observacao"
            rows={2}
            placeholder="Opcional"
            {...form.register("observacao")}
          />
        </CampoFormulario>
      </form>

      <div className="border-t border-border pt-4">
        <h3 className="mb-3 text-detalhe font-medium">Anexos</h3>
        {ocorrencia ? (
          <Anexos
            entidade="rh_ocorrencia"
            entidadeId={ocorrencia.id}
            anexos={anexosIniciais ?? []}
            podeEditar={podeEditar}
            onMudou={() => router.refresh()}
          />
        ) : (
          <FilaAnexos
            arquivos={filaAnexos}
            onMudar={setFilaAnexos}
            ocupado={salvando || subindoAnexos}
            legenda="Sobem junto quando você salvar"
          />
        )}
      </div>
    </FormDrawer>
  );
}
