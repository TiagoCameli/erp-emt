"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { SecaoDetalhe } from "@/components/canonicos";
import { semDerrubarSucesso } from "@/components/canonicos/acao-sem-silencio";
import { toast } from "@/components/canonicos/toast";
import { Switch } from "@/components/ui/switch";
import { definirAcesso } from "@/modules/execucao/obras/actions";
import type { UsuarioDaObra } from "@/modules/execucao/obras/queries";

export interface AcessoObraProps {
  obraId: string;
  usuarios: UsuarioDaObra[];
}

/** Lista de acesso da obra: sem estar na lista, a pessoa não vê a pasta nem os cronogramas. */
export function AcessoObra({ obraId, usuarios }: AcessoObraProps) {
  const router = useRouter();
  // Só o que o usuário mexeu nesta sessão; o resto vem do servidor.
  const [alterados, setAlterados] = React.useState<Record<string, boolean>>({});
  const [ocupado, setOcupado] = React.useState<string | null>(null);

  async function alternar(u: UsuarioDaObra, tem: boolean) {
    setAlterados((e) => ({ ...e, [u.id]: tem }));
    setOcupado(u.id);
    try {
      const r = await definirAcesso(obraId, u.id, tem);
      if ("erro" in r) {
        setAlterados((e) => ({ ...e, [u.id]: !tem }));
        toast.error(r.erro);
        return;
      }
      semDerrubarSucesso("execucao.obras.acesso.refresh", () => router.refresh());
    } finally {
      setOcupado(null);
    }
  }

  return (
    <SecaoDetalhe titulo="Acesso à obra">
      {usuarios.length === 0 ? (
        <p className="text-detalhe text-muted-foreground">Nenhum usuário ativo</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {usuarios.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-detalhe">
                {u.nome}
                <span className="ml-1.5 text-muted-foreground">{u.email}</span>
              </span>
              <label className="flex items-center gap-2 text-detalhe">
                Na lista
                <Switch
                  checked={alterados[u.id] ?? u.naLista}
                  disabled={ocupado === u.id}
                  aria-label={`Na lista: ${u.nome}`}
                  onCheckedChange={(v) => void alternar(u, v)}
                />
              </label>
            </li>
          ))}
        </ul>
      )}
    </SecaoDetalhe>
  );
}
