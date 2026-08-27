"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type {
  CategoriaOpcao,
  CentroCustoOpcao,
  CondicaoPagamentoOpcao,
  FormaPagamentoOpcao,
  FornecedorOpcao,
  InsumoOpcao,
  PrefillOrdemCotacao,
} from "@/modules/compras/ordens/queries";
import type { CartaoOpcao } from "@/modules/cadastros/cartoes/queries";
import { OrdemFormDrawer } from "./ordem-form-drawer";

interface ContextoNovaOrdem {
  podeCriar: boolean;
  abrir: () => void;
}

const Contexto = React.createContext<ContextoNovaOrdem | null>(null);

/**
 * Abre o formulário de nova OC de qualquer ponto da página (botão do cabeçalho,
 * estado vazio da tabela). Devolve null fora do provider.
 */
export function useNovaOrdem(): ContextoNovaOrdem | null {
  return React.useContext(Contexto);
}

export interface NovaOrdemProviderProps {
  podeCriar: boolean;
  fornecedores: FornecedorOpcao[];
  insumos: InsumoOpcao[];
  centrosCusto: CentroCustoOpcao[];
  condicoesPagamento: CondicaoPagamentoOpcao[];
  formasPagamento: FormaPagamentoOpcao[];
  categorias: CategoriaOpcao[];
  /** Cartões de crédito ativos, para a compra paga no crédito. */
  cartoes: CartaoOpcao[];
  /**
   * Prefill vindo de "Gerar OC" numa cotação finalizada (URL ?gerar=<id>).
   * Quando presente, o drawer abre já preenchido; o botão "Nova ordem" sempre
   * abre em branco.
   */
  prefill?: PrefillOrdemCotacao | null;
  children: React.ReactNode;
}

/**
 * Dono do formulário de nova OC na página de listagem. Existe UMA instância do
 * drawer para os dois gatilhos (cabeçalho e estado vazio) — antes cada gatilho
 * teria o seu, com estado próprio.
 *
 * Quando a página recebe ?gerar=<cotacao> (botão "Gerar OC" na cotação
 * finalizada), o drawer abre preenchido com os dados do fornecedor vencedor.
 */
export function NovaOrdemProvider({
  podeCriar,
  fornecedores,
  insumos,
  centrosCusto,
  condicoesPagamento,
  formasPagamento,
  categorias,
  cartoes,
  prefill,
  children,
}: NovaOrdemProviderProps) {
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

  const abrir = React.useCallback(() => {
    setPrefillAtivo(null);
    setAberto(true);
  }, []);

  const valor = React.useMemo(() => ({ podeCriar, abrir }), [podeCriar, abrir]);

  function fecharDrawer(novoAberto: boolean) {
    setAberto(novoAberto);
    if (!novoAberto && prefillAtivo) {
      // Tira o ?gerar= da URL para um refresh não reabrir o prefill.
      setPrefillAtivo(null);
      router.replace(pathname);
    }
  }

  return (
    <Contexto.Provider value={valor}>
      {children}
      {podeCriar ? (
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
          categorias={categorias}
          cartoes={cartoes}
          onCriada={(id) => router.push(`/compras/ordens/${id}`)}
        />
      ) : null}
    </Contexto.Provider>
  );
}

/** Botão primário do cabeçalho. Some sem permissão de criar. */
export function BotaoNovaOrdem() {
  const novaOrdem = useNovaOrdem();
  if (!novaOrdem?.podeCriar) return null;

  return (
    <Button type="button" size="sm" onClick={novaOrdem.abrir}>
      <Plus />
      Nova ordem
    </Button>
  );
}
