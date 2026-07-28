"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type {
  CentroCustoOpcao,
  CondicaoPagamentoOpcao,
  FormaPagamentoOpcao,
  FornecedorOpcao,
  InsumoOpcao,
  PrefillOrdemCotacao,
} from "@/modules/compras/ordens/queries";
import { OrdemFormDrawer } from "./ordem-form-drawer";

export interface OrdensAcoesCabecalhoProps {
  podeCriar: boolean;
  fornecedores: FornecedorOpcao[];
  insumos: InsumoOpcao[];
  centrosCusto: CentroCustoOpcao[];
  condicoesPagamento: CondicaoPagamentoOpcao[];
  formasPagamento: FormaPagamentoOpcao[];
  /**
   * Prefill vindo de "Gerar OC" numa cotação finalizada (URL ?gerar=<id>).
   * Quando presente, o drawer abre já preenchido; o botão "Nova ordem" sempre
   * abre em branco.
   */
  prefill?: PrefillOrdemCotacao | null;
}

/**
 * Ações do cabeçalho de ordens: criar uma nova OC. Só renderiza quando o
 * usuário tem permissão de criar. Ao criar, navega para o detalhe da OC.
 * Quando a página recebe ?gerar=<cotacao> (botão "Gerar OC" na cotação
 * finalizada), o drawer abre preenchido com os dados do fornecedor vencedor.
 */
export function OrdensAcoesCabecalho({
  podeCriar,
  fornecedores,
  insumos,
  centrosCusto,
  condicoesPagamento,
  formasPagamento,
  prefill,
}: OrdensAcoesCabecalhoProps) {
  const router = useRouter();
  const pathname = usePathname();
  // "Gerar OC" chega aqui por uma navegação de rota (vinda de
  // /compras/cotacoes/[id]), então o componente monta do zero com o prefill já
  // presente: o inicializador do useState basta para abrir o drawer, sem
  // efeito. O prefill só vale para essa abertura automática; o botão "Nova
  // ordem" zera o estado para abrir em branco.
  const [aberto, setAberto] = React.useState(Boolean(prefill));
  const [prefillAtivo, setPrefillAtivo] =
    React.useState<PrefillOrdemCotacao | null>(prefill ?? null);

  if (!podeCriar) return null;

  function fecharDrawer(novoAberto: boolean) {
    setAberto(novoAberto);
    if (!novoAberto && prefillAtivo) {
      // Tira o ?gerar= da URL para um refresh não reabrir o prefill.
      setPrefillAtivo(null);
      router.replace(pathname);
    }
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        onClick={() => {
          setPrefillAtivo(null);
          setAberto(true);
        }}
      >
        <Plus />
        Nova ordem
      </Button>

      <OrdemFormDrawer
        key={`${aberto ? "aberto" : "fechado"}-${prefillAtivo?.cotacaoId ?? "novo"}`}
        aberto={aberto}
        onAbertoChange={fecharDrawer}
        ordem={null}
        prefill={prefillAtivo}
        fornecedores={fornecedores}
        insumos={insumos}
        centrosCusto={centrosCusto}
        condicoesPagamento={condicoesPagamento}
        formasPagamento={formasPagamento}
        onCriada={(id) => router.push(`/compras/ordens/${id}`)}
      />
    </>
  );
}
