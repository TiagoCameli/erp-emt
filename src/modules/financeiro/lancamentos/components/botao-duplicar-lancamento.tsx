"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy, LoaderCircle } from "lucide-react";

import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { duplicarLancamento } from "@/modules/financeiro/lancamentos/actions";

export interface BotaoDuplicarLancamentoProps {
  /** Ids marcados na tabela. Duplicar é de um por vez. */
  selecionados: string[];
  onLimparSelecao: () => void;
}

/**
 * "Duplicar" da barra de seleção da lista de lançamentos.
 *
 * Pedido do Tiago em 27/08/2026, e a escolha dele foi criar NA HORA e abrir o
 * novo — não abrir um formulário preenchido para salvar depois. Então o clique
 * grava, avisa o número que saiu e leva para a tela do duplicado, que é onde a
 * edição acontece.
 *
 * UM POR VEZ, de propósito. Duplicar em lote é uma tecla que cria N documentos
 * de dinheiro de uma vez, e o pedido foi "quando eu seleciono UM lançamento".
 * Com dois ou mais marcados o botão continua à vista, desabilitado, com a razão
 * escrita ao lado: sumir faria a pessoa procurar o botão que ela viu ontem.
 */
export function BotaoDuplicarLancamento({
  selecionados,
  onLimparSelecao,
}: BotaoDuplicarLancamentoProps) {
  const router = useRouter();
  const [duplicando, setDuplicando] = React.useState(false);

  const quantidade = selecionados.length;
  // Guarda de reforço: quem decide mostrar a barra é o BarraSelecao, que não
  // renderiza os filhos com zero marcado. Isto cobre o componente montado
  // isolado, como em teste.
  if (quantidade === 0) return null;

  const soUm = quantidade === 1;

  async function aoDuplicar() {
    const id = selecionados[0];
    if (!id) return;

    setDuplicando(true);
    try {
      const resultado = await duplicarLancamento(id);
      if ("erro" in resultado) {
        // A seleção fica: a pessoa lê o motivo e decide, sem remarcar.
        toast.error(resultado.erro);
        return;
      }

      toast.success(
        resultado.numero
          ? `Lançamento duplicado em ${resultado.numero}`
          : "Lançamento duplicado",
      );
      // Os avisos vão num toast SEPARADO e mais longo: são coisas para conferir
      // antes de aprovar (o número da nota que veio junto, a origem que ficou
      // para trás), e misturá-los na confirmação faria a frase que diz "deu
      // certo" ser a mesma que diz "olha isto aqui".
      for (const aviso of resultado.avisos) {
        toast.warning(aviso);
      }

      onLimparSelecao();
      router.push(`/financeiro/lancamentos/${resultado.id}`);
    } finally {
      setDuplicando(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!soUm || duplicando}
        onClick={() => void aoDuplicar()}
      >
        {duplicando ? <LoaderCircle className="animate-spin" /> : <Copy />}
        {duplicando ? "Duplicando..." : "Duplicar"}
      </Button>
      {!soUm ? (
        <span className="text-detalhe text-muted-foreground">
          Duplicar é de um lançamento por vez.
        </span>
      ) : null}
    </>
  );
}
