"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { UserMinus, UserPlus } from "lucide-react";

import { Combobox, ConfirmDialog, SecaoDetalhe } from "@/components/canonicos";
import { semDerrubarSucesso } from "@/components/canonicos/acao-sem-silencio";
import { toast } from "@/components/canonicos/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { definirAcesso } from "@/modules/medicao/contratos/actions";

export interface UsuarioDoContrato {
  usuario_id: string;
  nome: string;
  email: string;
  ativo: boolean;
}

export interface UsuarioAtivo {
  id: string;
  nome: string;
  email: string;
}

export interface AcessoContratoProps {
  contratoId: string;
  usuarios: UsuarioDoContrato[];
  usuariosAtivos: UsuarioAtivo[];
  podeEditar: boolean;
}

/**
 * Quem está na lista de acesso do contrato (D3): sem estar aqui, a pessoa não
 * vê nada dele (contrato, aditivos, planilha). Editar exige `medicao.contratos
 * / editar`; a própria RPC recusa tirar o último usuário ATIVO da lista.
 */
export function AcessoContrato({ contratoId, usuarios, usuariosAtivos, podeEditar }: AcessoContratoProps) {
  const router = useRouter();
  const [novoUsuarioId, setNovoUsuarioId] = React.useState("");
  const [adicionando, setAdicionando] = React.useState(false);
  const [removendo, setRemovendo] = React.useState<UsuarioDoContrato | null>(null);

  const opcoesParaAdicionar = usuariosAtivos
    .filter((u) => !usuarios.some((já) => já.usuario_id === u.id))
    .map((u) => ({ valor: u.id, rotulo: `${u.nome} (${u.email})` }));

  function recarregar() {
    semDerrubarSucesso("medicao.contratos.acesso.refresh", () => router.refresh());
  }

  async function darAcesso() {
    if (!novoUsuarioId) return;
    setAdicionando(true);
    try {
      const resultado = await definirAcesso(contratoId, novoUsuarioId, true);
      if ("erro" in resultado) {
        toast.error(resultado.erro);
        return;
      }
      toast.success("Acesso concedido");
      setNovoUsuarioId("");
      recarregar();
    } finally {
      setAdicionando(false);
    }
  }

  async function confirmarRemocao() {
    if (!removendo) return;
    const resultado = await definirAcesso(contratoId, removendo.usuario_id, false);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Acesso removido");
    setRemovendo(null);
    recarregar();
  }

  return (
    <SecaoDetalhe titulo="Acesso ao contrato" card>
      <div className="flex flex-col gap-3">
        {usuarios.length === 0 ? (
          <p className="text-detalhe text-muted-foreground">Ninguém na lista de acesso</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {usuarios.map((u) => (
              <li
                key={u.usuario_id}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-detalhe">
                  {u.nome}
                  <span className="ml-1.5 text-muted-foreground">{u.email}</span>
                </span>
                {!u.ativo ? (
                  <Badge variant="secondary" className="shrink-0 border-transparent bg-accent text-legenda font-normal">
                    Inativo
                  </Badge>
                ) : null}
                {podeEditar ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Tirar acesso de ${u.nome}`}
                    onClick={() => setRemovendo(u)}
                  >
                    <UserMinus aria-hidden />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {podeEditar ? (
          <div className="flex flex-wrap items-center gap-2">
            <Combobox
              valor={novoUsuarioId}
              onValorChange={setNovoUsuarioId}
              opcoes={opcoesParaAdicionar}
              placeholder="Selecione o usuário"
              buscaPlaceholder="Buscar usuário"
              disabled={adicionando}
              className="max-w-xs"
              ariaLabel="Usuário para dar acesso"
            />
            <Button type="button" size="sm" variant="outline" disabled={!novoUsuarioId || adicionando} onClick={() => void darAcesso()}>
              <UserPlus />
              Dar acesso
            </Button>
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        aberto={removendo !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setRemovendo(null);
        }}
        titulo="Tirar acesso ao contrato"
        descricao={removendo ? `${removendo.nome} deixa de ver este contrato e tudo dele.` : ""}
        textoConfirmar="Tirar acesso"
        variante="destrutivo"
        onConfirmar={confirmarRemocao}
      />
    </SecaoDetalhe>
  );
}
