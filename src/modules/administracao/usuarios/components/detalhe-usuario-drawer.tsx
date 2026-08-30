"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, KeyRound, LoaderCircle, Trash2 } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  ConfirmDialog,
  FormDrawer,
  SelectAtivo,
  StatusBadge,
  submeterComAviso,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  aplicarPerfilUsuario,
  editarUsuario,
  excluirUsuario,
  obterSenhaProvisoria,
  redefinirSenhaUsuario,
} from "@/modules/administracao/usuarios/actions";
import {
  editarUsuarioSchema,
  type EditarUsuarioInput,
} from "@/modules/administracao/usuarios/schemas";
import type {
  PerfilOpcao,
  UsuarioLista,
} from "@/modules/administracao/usuarios/queries";
import { ContatoUsuarioBloco } from "./contato-usuario";
import { MatrizPermissoes } from "./matriz-permissoes";
import { SaldosPorConta } from "./saldos-por-conta";

export interface DetalheUsuarioDrawerProps {
  usuario: UsuarioLista | null;
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  perfis: PerfilOpcao[];
  podeEditar: boolean;
  podeExcluir: boolean;
  usuarioLogadoId: string;
}

/**
 * Drawer de detalhe do usuário: edição de nome e status,
 * aplicação de perfil como template e editor da matriz individual.
 *
 * O pai deve passar key={usuario.id}: a troca de usuário remonta o
 * componente e zera formulário, perfil selecionado e matriz.
 */
export function DetalheUsuarioDrawer({
  usuario,
  aberto,
  onAbertoChange,
  perfis,
  podeEditar,
  podeExcluir,
  usuarioLogadoId,
}: DetalheUsuarioDrawerProps) {
  const [perfilSelecionado, setPerfilSelecionado] = React.useState<string>(
    usuario?.perfilId ?? "",
  );
  const [aplicandoPerfil, setAplicandoPerfil] = React.useState(false);
  const [versaoMatriz, setVersaoMatriz] = React.useState(0);
  const [senhaRevelada, setSenhaRevelada] = React.useState<string | null>(null);
  const [carregandoSenha, setCarregandoSenha] = React.useState(false);
  const [confirmarReset, setConfirmarReset] = React.useState(false);
  const [confirmarExcluir, setConfirmarExcluir] = React.useState(false);

  const form = useForm<EditarUsuarioInput>({
    resolver: zodResolver(editarUsuarioSchema),
    defaultValues: { nome: usuario?.nome ?? "", ativo: usuario?.ativo ?? true },
  });

  const salvando = form.formState.isSubmitting;

  async function aoSalvar(dados: EditarUsuarioInput) {
    if (!usuario) return;
    const resultado = await editarUsuario(usuario.id, dados);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
    } else {
      toast.success("Usuário salvo");
    }
  }

  async function aplicarPerfil() {
    if (!usuario || !perfilSelecionado) return;
    setAplicandoPerfil(true);
    const resultado = await aplicarPerfilUsuario(usuario.id, perfilSelecionado);
    setAplicandoPerfil(false);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
    } else {
      toast.success("Perfil aplicado. A matriz foi atualizada");
      setVersaoMatriz((v) => v + 1);
    }
  }

  async function revelarSenha() {
    if (!usuario) return;
    setCarregandoSenha(true);
    const resultado = await obterSenhaProvisoria(usuario.id);
    setCarregandoSenha(false);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    if (!resultado.senha) {
      toast.info("Este usuário já definiu a própria senha");
      return;
    }
    setSenhaRevelada(resultado.senha);
  }

  async function copiarSenha() {
    if (!senhaRevelada) return;
    await navigator.clipboard.writeText(senhaRevelada);
    toast.success("Senha copiada");
  }

  async function redefinirSenha() {
    if (!usuario) return;
    const resultado = await redefinirSenhaUsuario(usuario.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    setSenhaRevelada(resultado.senhaProvisoria);
    toast.success("Senha redefinida. Copie a nova senha provisória");
  }

  async function excluir() {
    if (!usuario) return;
    const resultado = await excluirUsuario(usuario.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Usuário excluído");
    onAbertoChange(false);
  }

  if (!usuario) return null;

  const ehVoceMesmo = usuario.id === usuarioLogadoId;

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={usuario.nome}
      descricao={usuario.email}
      // A tela cheia era desperdiçada: os campos ficavam numa coluna de 672px
      // no meio do monitor, e a matriz (8 colunas x 50 linhas) rolava dentro de
      // uma caixinha de 384px de altura. O teto de 1900px foi MEDIDO na tela do
      // Tiago (viewport de 2233px): sem teto nenhum, a coluna do nome do recurso
      // engole a sobra e o checkbox fica a mais de mil pixels do nome.
      larguraClassName="sm:max-w-[1900px]"
      // Cobre só o formulário de dados do usuário. A matriz de permissões tem
      // botão próprio de salvar e não entra no `isDirty` deste form.
      temAlteracoesNaoSalvas={form.formState.isDirty && !salvando}
    >
      {/* Duas colunas em tela larga: à esquerda quem a pessoa é e como ela
          entra (blocos curtos, largura de leitura), à direita a matriz, que é o
          único conteúdo desta tela que realmente precisa de largura. Empilha
          abaixo de lg. `items-start` para a coluna curta não esticar até a
          altura da matriz. */}
      <div className="flex flex-col gap-6 xl:grid xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] xl:items-start xl:gap-10">
        <div className="flex min-w-0 flex-col gap-6">
          <div className="flex flex-wrap items-center gap-2">
            {usuario.ativo ? (
              <StatusBadge status="aprovado" rotulo="Ativo" />
            ) : (
              <StatusBadge status="rascunho" rotulo="Inativo" />
            )}
            {usuario.acessoPendente ? (
              <StatusBadge
                status="pendente_aprovacao"
                rotulo="1º acesso pendente"
              />
            ) : null}
            <span className="text-detalhe text-muted-foreground">
              {usuario.perfilNome
                ? `Perfil: ${usuario.perfilNome}`
                : "Sem perfil aplicado"}
            </span>
          </div>

          {/* Dados que a PRÓPRIA pessoa preencheu em Minha conta, em leitura. Fica
            antes do formulário de propósito: quem abre este drawer procurando um
            telefone acha na primeira tela, sem rolar até o fim da matriz de
            permissões. */}
          <div className="flex flex-col gap-2 rounded-md border border-border bg-surface px-3 py-2.5">
            <span className="text-detalhe font-medium">Dados pessoais</span>
            <ContatoUsuarioBloco
              contato={usuario.contato}
              nome={usuario.nome}
            />
          </div>

          {podeEditar ? (
            <>
              <form
                onSubmit={submeterComAviso(form, aoSalvar)}
                className={classesFormulario}
                noValidate
              >
                <CampoFormulario
                  id="usuario-nome"
                  rotulo="Nome"
                  erro={form.formState.errors.nome?.message}
                >
                  <Input
                    id="usuario-nome"
                    disabled={salvando}
                    {...form.register("nome")}
                  />
                </CampoFormulario>

                <SelectAtivo
                  value={form.watch("ativo")}
                  onChange={(valor) => form.setValue("ativo", valor)}
                  disabled={salvando}
                  ajuda="Usuário inativo não entra no sistema"
                  className="rounded-md border border-border px-3 py-2.5"
                />

                <div className="flex justify-end">
                  <Button type="submit" size="sm" disabled={salvando}>
                    {salvando ? (
                      <>
                        <LoaderCircle className="animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      "Salvar alterações"
                    )}
                  </Button>
                </div>
              </form>

              <Separator />

              <CampoFormulario
                id="aplicar-perfil"
                rotulo="Aplicar perfil"
                ajuda="Aplicar um perfil substitui a matriz individual pelo template do perfil"
              >
                <div className="flex items-center gap-2">
                  <Combobox
                    valor={perfilSelecionado}
                    onValorChange={setPerfilSelecionado}
                    opcoes={perfis.map((perfil) => ({
                      valor: perfil.id,
                      rotulo: perfil.nome,
                    }))}
                    placeholder="Escolha um perfil"
                    disabled={aplicandoPerfil || perfis.length === 0}
                    id="aplicar-perfil"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={aplicarPerfil}
                    disabled={aplicandoPerfil || !perfilSelecionado}
                  >
                    {aplicandoPerfil ? (
                      <>
                        <LoaderCircle className="animate-spin" />
                        Aplicando...
                      </>
                    ) : (
                      "Aplicar perfil"
                    )}
                  </Button>
                </div>
              </CampoFormulario>

              <Separator />

              <div className="flex flex-col gap-2">
                <p className="text-corpo font-medium">Acesso</p>
                {ehVoceMesmo ? (
                  <p className="text-detalhe text-muted-foreground">
                    Esta é a sua conta. Para trocar a sua senha, use Minha conta
                    {" > "}Alterar senha.
                  </p>
                ) : (
                  <>
                    <p className="text-detalhe text-muted-foreground">
                      {usuario.acessoPendente
                        ? "Aguardando o 1º acesso. A senha provisória abaixo vale até o usuário definir a própria."
                        : "O usuário já definiu a própria senha. Redefina para gerar uma nova senha provisória."}
                    </p>

                    {senhaRevelada ? (
                      <span className="flex items-center gap-2">
                        <code className="codigo-doc rounded-md border border-border bg-surface px-2 py-1">
                          {senhaRevelada}
                        </code>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={copiarSenha}
                        >
                          <Copy />
                          Copiar
                        </Button>
                      </span>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-2">
                      {usuario.acessoPendente && !senhaRevelada ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={revelarSenha}
                          disabled={carregandoSenha}
                        >
                          {carregandoSenha ? (
                            <>
                              <LoaderCircle className="animate-spin" />
                              Carregando...
                            </>
                          ) : (
                            <>
                              <KeyRound />
                              Revelar senha provisória
                            </>
                          )}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmarReset(true)}
                      >
                        <KeyRound />
                        Redefinir senha
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : null}

          {/* O separador é DESTE bloco, não do anterior: sem isso, quem não pode
              excluir via a coluna terminar com uma linha solta embaixo. */}
          {podeExcluir && !ehVoceMesmo ? (
            <>
              <Separator />
              <div className="flex flex-col gap-2">
                <p className="text-corpo font-medium">Excluir usuário</p>
                <p className="text-detalhe text-muted-foreground">
                  Some da lista e bloqueia o acesso. O nome continua nas ações
                  que ele já fez.
                </p>
                <div>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => setConfirmarExcluir(true)}
                  >
                    <Trash2 />
                    Excluir
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* Coluna da direita: a matriz ocupa a altura da tela em vez de rolar
            dentro de uma caixa de 384px. O desconto cobre cabeçalho do drawer,
            respiro e o título da seção. */}
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-corpo font-medium">Matriz de permissões</p>
          <p className="text-detalhe text-muted-foreground">
            Marque o que este usuário pode fazer em cada aba do sistema. O botão
            &quot;Tudo&quot; da linha marca todas as ações daquele recurso de
            uma vez.
          </p>
          <MatrizPermissoes
            usuarioId={usuario.id}
            podeEditar={podeEditar}
            recarregar={versaoMatriz}
            alturaMaximaClassName="max-h-[26rem] xl:max-h-[calc(100vh-16rem)]"
          />

          {/* Permissão por LINHA, embaixo da matriz de recurso x ação. Recarrega
              com `versaoMatriz` para o aviso de Admin acompanhar o que a matriz
              acima acabou de salvar. */}
          <SaldosPorConta
            usuarioId={usuario.id}
            podeEditar={podeEditar}
            recarregar={versaoMatriz}
          />
        </div>
      </div>

      <ConfirmDialog
        aberto={confirmarReset}
        onAbertoChange={setConfirmarReset}
        titulo="Redefinir a senha deste usuário?"
        descricao="Uma nova senha provisória será gerada. A senha atual do usuário deixa de valer e ele terá que definir uma nova no próximo acesso."
        textoConfirmar="Redefinir senha"
        onConfirmar={redefinirSenha}
      />

      <ConfirmDialog
        aberto={confirmarExcluir}
        onAbertoChange={setConfirmarExcluir}
        titulo="Excluir este usuário?"
        descricao="Ele some da lista e perde o acesso ao sistema. O nome continua aparecendo nas ações que ele já fez. Não dá para desfazer pela tela."
        textoConfirmar="Excluir usuário"
        variante="destrutivo"
        onConfirmar={excluir}
      />
    </FormDrawer>
  );
}
