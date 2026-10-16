"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, ArrowUpFromLine, LoaderCircle } from "lucide-react";

import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { chaveSaldo } from "@/modules/estoque/calculo";
import { EntradaFormDrawer } from "@/modules/estoque/components/entrada-form-drawer";
import { SaidaFormDrawer } from "@/modules/estoque/components/saida-form-drawer";
import { carregarMovimentoDaPilha, type DadosMovimentoPilha } from "@/modules/estoque/pilhas/actions";

/** Quem pode o quê no Estoque (não no Mapa): a entrada e a saída são as do Estoque. */
export interface PermissoesMovimentoPilha {
  entrada: boolean;
  saida: boolean;
}

type Dados = Extract<DadosMovimentoPilha, { ok: true }>;
type Aberto = "entrada" | "saida" | null;

/**
 * Entrada avulsa e saída direto do card da pilha no Mapa (16/10/2026, pedido do Tiago). São os
 * mesmos formulários do Estoque, já na pilha e no material dela. O frete continua entrando
 * sozinho na chegada (e a transferência, saindo de uma pilha e entrando na outra): isto é para o
 * que não passa pelo Frete, como o consumo na obra ou um acerto de inventário.
 *
 * Os dados (insumo e centros de custo) carregam no clique, não com o Mapa.
 */
export function MovimentarPilha({
  pilhaId,
  saldo,
  permissoes,
}: {
  pilhaId: string;
  /** O do estado do Mapa, só para desligar a saída da pilha vazia. */
  saldo: number;
  permissoes: PermissoesMovimentoPilha;
}) {
  const router = useRouter();
  const [dados, setDados] = React.useState<Dados | null>(null);
  const [carregando, setCarregando] = React.useState<Aberto>(null);
  const [aberto, setAberto] = React.useState<Aberto>(null);

  async function abrir(qual: "entrada" | "saida") {
    setCarregando(qual);
    try {
      const r = await carregarMovimentoDaPilha(pilhaId);
      if ("erro" in r) {
        toast.error(r.erro);
        return;
      }
      setDados(r);
      setAberto(qual);
    } finally {
      setCarregando(null);
    }
  }

  function fechar(abertoAgora: boolean) {
    if (abertoAgora) return;
    setAberto(null);
    // Saldo, valor e "já entrou/saiu" do card vêm do servidor.
    router.refresh();
  }

  // Objetos estáveis: o formulário se refaz quando `inicial` muda.
  const inicial = React.useMemo(
    () => (dados ? { local: dados.local, insumoId: dados.insumo.id } : undefined),
    [dados],
  );
  const locais = React.useMemo(
    () => (dados ? [{ id: dados.local, nome: dados.nome, insumoId: dados.insumo.id }] : []),
    [dados],
  );
  const insumos = React.useMemo(() => (dados ? [dados.insumo] : []), [dados]);
  const saldos = React.useMemo(
    () => new Map(dados ? [[chaveSaldo(dados.local, dados.insumo.id), dados.saldo]] : []),
    [dados],
  );

  if (!permissoes.entrada && !permissoes.saida) return null;
  const vazia = saldo <= 0;

  return (
    <>
      <div className="grid grid-cols-2 gap-1.5">
        {permissoes.entrada ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={carregando !== null}
            onClick={() => void abrir("entrada")}
            className={permissoes.saida ? undefined : "col-span-2"}
          >
            {carregando === "entrada" ? <LoaderCircle className="animate-spin" /> : <ArrowDownToLine />}
            Entrada avulsa
          </Button>
        ) : null}
        {permissoes.saida ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={carregando !== null || vazia}
            title={vazia ? "A pilha está vazia" : undefined}
            onClick={() => void abrir("saida")}
            className={permissoes.entrada ? undefined : "col-span-2"}
          >
            {carregando === "saida" ? <LoaderCircle className="animate-spin" /> : <ArrowUpFromLine />}
            Registrar saída
          </Button>
        ) : null}
      </div>
      {dados && permissoes.entrada ? (
        <EntradaFormDrawer
          aberto={aberto === "entrada"}
          onAbertoChange={fechar}
          entrada={null}
          locais={locais}
          insumos={insumos}
          itensOc={[]}
          inicial={inicial}
          apenasAvulsa
        />
      ) : null}
      {dados && permissoes.saida ? (
        <SaidaFormDrawer
          aberto={aberto === "saida"}
          onAbertoChange={fechar}
          saida={null}
          locais={locais}
          materiais={insumos}
          saldos={saldos}
          centros={dados.centros}
          inicial={inicial}
        />
      ) : null}
    </>
  );
}
