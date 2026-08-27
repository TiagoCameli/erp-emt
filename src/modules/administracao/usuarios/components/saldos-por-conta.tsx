"use client";

import * as React from "react";
import { LoaderCircle } from "lucide-react";

import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { ROTULO_BANCO, type BancoConta } from "@/modules/financeiro/_shared/formato";
import { salvarSaldosUsuario } from "@/modules/administracao/usuarios/actions";

interface ContaMarcavel {
  id: string;
  nome: string;
  banco: string;
}

export interface SaldosPorContaProps {
  usuarioId: string;
  podeEditar: boolean;
  /** Incremente para forçar recarga (ex: depois de aplicar um perfil). */
  recarregar?: number;
}

/**
 * Quais contas bancárias este usuário pode ver o SALDO.
 *
 * Fica separado da matriz de recursos x ações porque é outro tipo de permissão:
 * a matriz é (recurso, ação) e esta é (usuário, LINHA de uma tabela). Enfiar
 * contas como colunas da matriz faria a tabela crescer com o cadastro e
 * confundiria dois conceitos que se editam em momentos diferentes.
 *
 * O que a marcação NÃO controla: o NOME da conta. Ele aparece em Pagamentos,
 * Programados, Aprovação, Conciliação, Transferências e no espelho para qualquer
 * usuário — desmarcar aqui esconde o VALOR, não a conta.
 */
export function SaldosPorConta({
  usuarioId,
  podeEditar,
  recarregar = 0,
}: SaldosPorContaProps) {
  // Mesmo padrão da MatrizPermissoes: carregando = a chave da carga está
  // desatualizada, sem um `loading` booleano que possa dessincronizar.
  const chaveCarga = `${usuarioId}|${recarregar}`;
  const [carga, setCarga] = React.useState<{
    chave: string;
    contas: ContaMarcavel[];
    marcadas: Set<string>;
    ehAdmin: boolean;
  } | null>(null);
  const [salvando, setSalvando] = React.useState(false);

  const carregando = carga?.chave !== chaveCarga;

  React.useEffect(() => {
    let ativo = true;
    const supabase = createClient();

    // Três leituras juntas: as contas ativas, o que já está marcado, e se este
    // usuário é Admin.
    //
    // `ehAdmin` é LIDO AQUI, e não recebido por prop, de propósito: ele tem que
    // refletir a matriz DEPOIS de ela ser salva no mesmo drawer. Vindo de fora, o
    // aviso ficaria contando a verdade de antes do último clique — e é justamente
    // um aviso sobre "por que a marcação não está valendo".
    //
    // `saldo_inicial` não entra no select das contas: a coluna não é legível pelo
    // client, e esta tela marca permissão, não mostra saldo.
    void Promise.all([
      supabase
        .from("contas_bancarias")
        .select("id, nome, banco")
        .eq("ativo", true)
        .order("nome"),
      supabase
        .from("usuario_conta_saldo")
        .select("conta_bancaria_id")
        .eq("usuario_id", usuarioId),
      supabase
        .from("usuario_permissoes")
        .select("recurso")
        .eq("usuario_id", usuarioId)
        .eq("recurso", "administracao.usuarios")
        .eq("acao", "editar"),
    ]).then(([contasResultado, marcadasResultado, adminResultado]) => {
      if (!ativo) return;
      if (contasResultado.error || marcadasResultado.error) {
        toast.error("Não foi possível carregar as contas bancárias");
        setCarga({
          chave: chaveCarga,
          contas: [],
          marcadas: new Set(),
          ehAdmin: false,
        });
        return;
      }
      setCarga({
        chave: chaveCarga,
        contas: contasResultado.data ?? [],
        marcadas: new Set(
          (marcadasResultado.data ?? []).map((linha) => linha.conta_bancaria_id),
        ),
        // Erro aqui não derruba a tela: o pior efeito é o aviso não aparecer.
        ehAdmin: (adminResultado.data ?? []).length > 0,
      });
    });

    return () => {
      ativo = false;
    };
  }, [usuarioId, chaveCarga]);

  function alternar(contaId: string, marcado: boolean) {
    setCarga((atual) => {
      if (!atual) return atual;
      const novas = new Set(atual.marcadas);
      if (marcado) novas.add(contaId);
      else novas.delete(contaId);
      return { ...atual, marcadas: novas };
    });
  }

  function marcarTodas(marcar: boolean) {
    setCarga((atual) => {
      if (!atual) return atual;
      return {
        ...atual,
        marcadas: marcar ? new Set(atual.contas.map((c) => c.id)) : new Set(),
      };
    });
  }

  async function salvar() {
    if (!carga) return;
    setSalvando(true);
    const resultado = await salvarSaldosUsuario(usuarioId, [...carga.marcadas]);
    setSalvando(false);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
    } else {
      toast.success("Contas com saldo visível salvas");
    }
  }

  if (carregando) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-32 w-full rounded-md" />
      </div>
    );
  }

  const contas = carga?.contas ?? [];
  const marcadas = carga?.marcadas ?? new Set<string>();
  const ehAdmin = carga?.ehAdmin ?? false;
  const todasMarcadas = contas.length > 0 && marcadas.size === contas.length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="border-l-[3px] border-faixa pl-2 text-detalhe font-semibold">
            Saldo por conta bancária
          </h3>
          <p className="text-legenda text-muted-foreground">
            Marque as contas cujo <strong>saldo</strong> este usuário pode ver. O
            nome da conta aparece em todo o aplicativo de qualquer forma.
          </p>
        </div>
        {podeEditar && contas.length > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={salvando}
            onClick={() => marcarTodas(!todasMarcadas)}
          >
            {todasMarcadas ? "Limpar" : "Todas"}
          </Button>
        ) : null}
      </div>

      {/*
        O aviso do Admin não é enfeite: quem tem permissão de editar usuários vê o
        saldo de TODAS as contas por `fn_pode_ver_saldo`, independente destas
        caixinhas. Sem a frase, testar a marcação no próprio usuário (que é
        Admin) daria a impressão de que ela não funciona, e o teste seguinte seria
        desconfiar do banco.
      */}
      {ehAdmin ? (
        <p className="rounded-md border border-status-pendente/40 bg-status-pendente/5 p-2.5 text-legenda text-status-pendente">
          Este usuário pode editar usuários, então vê o saldo de todas as contas
          independente do que estiver marcado aqui. Para a marcação valer, tire a
          permissão de editar em Administração &gt; Usuários na matriz acima.
        </p>
      ) : null}

      {contas.length === 0 ? (
        <p className="text-detalhe text-muted-foreground">
          Nenhuma conta bancária ativa cadastrada.
        </p>
      ) : (
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          {contas.map((conta) => (
            <div key={conta.id} className="flex items-center gap-2">
              <Checkbox
                id={`saldo-${conta.id}`}
                checked={marcadas.has(conta.id)}
                onCheckedChange={(valor) => alternar(conta.id, valor === true)}
                disabled={!podeEditar || salvando}
              />
              <Label
                htmlFor={`saldo-${conta.id}`}
                className="text-detalhe font-normal"
              >
                {conta.nome}
                <span className="text-muted-foreground">
                  {" · "}
                  {ROTULO_BANCO[conta.banco as BancoConta] ?? conta.banco}
                </span>
              </Label>
            </div>
          ))}
        </div>
      )}

      {podeEditar && contas.length > 0 ? (
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={salvar} disabled={salvando}>
            {salvando ? (
              <>
                <LoaderCircle className="animate-spin" />
                Salvando...
              </>
            ) : (
              "Salvar contas"
            )}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
