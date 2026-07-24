"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog, SecaoFormulario } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatarData } from "@/lib/formatadores";
import {
  removerDependente,
  type Dependente,
} from "@/modules/cadastros/colaboradores/dependentes";
import { rotuloParentesco } from "@/modules/cadastros/colaboradores/dependentes-schemas";
import { DependenteFormDialog } from "./dependente-form-drawer";

export interface DependentesSecaoProps {
  colaboradorId: string;
  /** Dependentes buscados no server (Task 3), sem fetch no cliente. */
  dependentesIniciais: Dependente[];
  /** Libera adicionar/editar (permissão "editar" de cadastros.colaboradores). */
  podeEditar: boolean;
  /** Libera remover (permissão "excluir" de cadastros.colaboradores). */
  podeExcluir: boolean;
}

/**
 * Seção de dependentes do colaborador, dentro do drawer de edição (Task 3).
 * A lista vem sempre das props (buscadas no server e recarregadas via
 * `router.refresh()` depois de cada ação, mesmo padrão de `ColaboradoresTabela`
 * pra `colaboradores`): não guarda cópia própria em estado, então some
 * automaticamente qualquer risco de ficar dessincronizada da fonte.
 *
 * Permissão tripla na UI: adicionar/editar exige `podeEditar`, remover exige
 * `podeExcluir` — o dono checa `cadastros.colaboradores` (não existe recurso
 * próprio de dependentes) tanto na Server Action quanto na RLS de
 * `rh_dependentes`; aqui é só a camada de UI escondendo o que a permissão já
 * bloqueia embaixo.
 */
export function DependentesSecao({
  colaboradorId,
  dependentesIniciais,
  podeEditar,
  podeExcluir,
}: DependentesSecaoProps) {
  const router = useRouter();

  const [formAberto, setFormAberto] = React.useState(false);
  const [emEdicao, setEmEdicao] = React.useState<Dependente | null>(null);

  const [confirmarAberto, setConfirmarAberto] = React.useState(false);
  const [aExcluir, setAExcluir] = React.useState<Dependente | null>(null);

  function abrirNovo() {
    setEmEdicao(null);
    setFormAberto(true);
  }

  function abrirEdicao(dependente: Dependente) {
    setEmEdicao(dependente);
    setFormAberto(true);
  }

  function pedirExclusao(dependente: Dependente) {
    setAExcluir(dependente);
    setConfirmarAberto(true);
  }

  async function confirmarExclusao() {
    if (!aExcluir) return;
    const resultado = await removerDependente(aExcluir.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Dependente removido");
    router.refresh();
  }

  const podeAgir = podeEditar || podeExcluir;

  return (
    <SecaoFormulario
      titulo="Dependentes"
      acao={
        podeEditar ? (
          <Button type="button" size="sm" variant="outline" onClick={abrirNovo}>
            <Plus />
            Adicionar dependente
          </Button>
        ) : undefined
      }
    >
      {dependentesIniciais.length === 0 ? (
        <p className="text-detalhe text-muted-foreground">
          Nenhum dependente cadastrado.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {dependentesIniciais.map((dependente) => (
            <li
              key={dependente.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2"
            >
              <div>
                <p className="text-detalhe font-medium">{dependente.nome}</p>
                <p className="text-legenda text-muted-foreground">
                  {rotuloParentesco(dependente.parentesco)}
                  {dependente.dataNascimento
                    ? ` · Nasc. ${formatarData(dependente.dataNascimento)}`
                    : ""}
                  {dependente.dependenteIrrf ? " · IRRF" : ""}
                  {dependente.dependenteSalarioFamilia
                    ? " · Salário-família"
                    : ""}
                </p>
              </div>

              {podeAgir ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Ações do dependente ${dependente.nome}`}
                    >
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {podeEditar ? (
                      <DropdownMenuItem onSelect={() => abrirEdicao(dependente)}>
                        Editar
                      </DropdownMenuItem>
                    ) : null}
                    {podeExcluir ? (
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => pedirExclusao(dependente)}
                      >
                        Remover
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {podeEditar ? (
        <DependenteFormDialog
          aberto={formAberto}
          onAbertoChange={setFormAberto}
          colaboradorId={colaboradorId}
          dependente={emEdicao}
          onSalvo={() => router.refresh()}
        />
      ) : null}

      {podeExcluir ? (
        <ConfirmDialog
          aberto={confirmarAberto}
          onAbertoChange={setConfirmarAberto}
          titulo="Remover dependente"
          descricao={
            aExcluir
              ? `Remover ${aExcluir.nome} da lista de dependentes? Essa ação não pode ser desfeita.`
              : ""
          }
          textoConfirmar="Remover"
          variante="destrutivo"
          onConfirmar={confirmarExclusao}
        />
      ) : null}
    </SecaoFormulario>
  );
}
