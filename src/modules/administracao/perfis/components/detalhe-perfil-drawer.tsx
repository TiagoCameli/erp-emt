"use client";

import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog, FormDrawer } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type { Acao } from "@/config/recursos";
import {
  editarPerfil,
  excluirPerfil,
  salvarPermissoesPerfil,
} from "@/modules/administracao/perfis/actions";
import {
  perfilSchema,
  type PerfilInput,
  type PermissaoPerfilInput,
} from "@/modules/administracao/perfis/schemas";
import type {
  PerfilResumo,
  PermissaoPerfil,
} from "@/modules/administracao/perfis/queries";
import {
  chavePermissao,
  MatrizPermissoesPerfil,
  permissaoDaChave,
} from "./matriz-permissoes-perfil";

export interface DetalhePerfilDrawerProps {
  perfil: PerfilResumo;
  permissoesIniciais: PermissaoPerfil[];
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  podeEditar: boolean;
  podeExcluir: boolean;
}

/**
 * Drawer de detalhe do perfil: edita nome e descrição, monta a matriz
 * de permissões e permite excluir (com motivo, sem usuários vinculados).
 * Monte com key={perfil.id} para reiniciar o estado ao trocar de perfil.
 */
export function DetalhePerfilDrawer({
  perfil,
  permissoesIniciais,
  aberto,
  onAbertoChange,
  podeEditar,
  podeExcluir,
}: DetalhePerfilDrawerProps) {
  const idFormulario = useId();
  const [selecionadas, setSelecionadas] = useState<Set<string>>(
    () =>
      new Set(
        permissoesIniciais.map((permissao) =>
          chavePermissao(permissao.recurso, permissao.acao),
        ),
      ),
  );
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  const form = useForm<PerfilInput>({
    resolver: zodResolver(perfilSchema),
    defaultValues: {
      nome: perfil.nome,
      descricao: perfil.descricao ?? "",
    },
  });

  const salvando = form.formState.isSubmitting;

  function alternarPermissao(recurso: string, acao: Acao, marcada: boolean) {
    setSelecionadas((atual) => {
      const proxima = new Set(atual);
      const chave = chavePermissao(recurso, acao);
      if (marcada) proxima.add(chave);
      else proxima.delete(chave);
      return proxima;
    });
  }

  async function aoSalvar(dados: PerfilInput) {
    if (!podeEditar) return;

    const permissoes: PermissaoPerfilInput[] = [...selecionadas].map(
      permissaoDaChave,
    );

    const erroEdicao = await editarPerfil(perfil.id, dados);
    if (erroEdicao) {
      toast.error(erroEdicao.erro);
      return;
    }

    const erroPermissoes = await salvarPermissoesPerfil(perfil.id, permissoes);
    if (erroPermissoes) {
      toast.error(erroPermissoes.erro);
      return;
    }

    toast.success("Perfil atualizado");
    onAbertoChange(false);
  }

  async function aoExcluir(motivo?: string) {
    const resultado = await excluirPerfil(perfil.id, motivo ?? "");
    if (resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Perfil excluído");
    onAbertoChange(false);
  }

  function trocarAberto(novoAberto: boolean) {
    if (salvando) return;
    onAbertoChange(novoAberto);
  }

  return (
    <>
      <FormDrawer
        aberto={aberto}
        onAbertoChange={trocarAberto}
        titulo={perfil.nome}
        descricao={
          perfil.totalUsuarios === 1
            ? "1 usuário usa este perfil"
            : `${perfil.totalUsuarios} usuários usam este perfil`
        }
        larguraClassName="sm:max-w-2xl"
        rodape={
          <>
            {podeExcluir ? (
              <Button
                type="button"
                variant="outline"
                disabled={salvando}
                onClick={() => setConfirmandoExclusao(true)}
                className="mr-auto border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 />
                Excluir perfil
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              disabled={salvando}
              onClick={() => trocarAberto(false)}
            >
              Cancelar
            </Button>
            {podeEditar ? (
              <Button type="submit" form={idFormulario} disabled={salvando}>
                {salvando ? (
                  <>
                    <LoaderCircle className="animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Salvar"
                )}
              </Button>
            ) : null}
          </>
        }
      >
        <Form {...form}>
          <form
            id={idFormulario}
            onSubmit={form.handleSubmit(aoSalvar)}
            className="space-y-4"
            noValidate
          >
            <FormField
              control={form.control}
              name="nome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome</FormLabel>
                  <FormControl>
                    <Input disabled={!podeEditar || salvando} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="descricao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="O que esse perfil pode fazer no sistema"
                      disabled={!podeEditar || salvando}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator className="my-5" />

            <section className="space-y-2">
              <div>
                <h3 className="text-corpo font-medium">Permissões do perfil</h3>
                <p className="text-detalhe text-muted-foreground">
                  Salvar a matriz não muda quem já usa o perfil. Para
                  atualizar esses usuários, aplique o perfil de novo na aba
                  Usuários.
                </p>
              </div>
              <MatrizPermissoesPerfil
                selecionadas={selecionadas}
                onAlternar={alternarPermissao}
                desabilitada={!podeEditar || salvando}
              />
            </section>
          </form>
        </Form>
      </FormDrawer>

      <ConfirmDialog
        aberto={confirmandoExclusao}
        onAbertoChange={setConfirmandoExclusao}
        titulo="Excluir perfil"
        descricao={`O perfil "${perfil.nome}" e a matriz de permissões dele serão excluídos. A auditoria guarda o registro da exclusão.`}
        textoConfirmar="Excluir perfil"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={aoExcluir}
      />
    </>
  );
}
