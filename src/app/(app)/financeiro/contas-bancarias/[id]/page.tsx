import { notFound } from "next/navigation";

import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { ExtratoContaCabecalho } from "@/modules/financeiro/contas-bancarias/components/extrato-conta-cabecalho";
import { ExtratoContaTabela } from "@/modules/financeiro/contas-bancarias/components/extrato-conta-tabela";
import {
  incluiAnteriores,
  lerEscopoDaUrl,
  PARAM_ESCOPO,
} from "@/modules/financeiro/contas-bancarias/extrato-escopo";
import {
  buscarConta,
  listarExtratoDaConta,
} from "@/modules/financeiro/contas-bancarias/queries";

interface ExtratoContaPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [PARAM_ESCOPO]?: string | string[] }>;
}

/**
 * Extrato de uma conta bancária: todo o dinheiro que entrou e saiu dela.
 *
 * Chega-se aqui clicando na linha da conta em /financeiro/contas-bancarias.
 *
 * A permissão é a MESMA da listagem (`financeiro.contas-bancarias`, ação `ver`),
 * e não uma nova: quem pode ver o saldo da conta pode ver de onde ele veio. O que
 * a tela mostra a mais são lançamentos e transferências, e a RLS deles continua
 * valendo dentro da função do banco, que não é SECURITY DEFINER — quem não pode
 * ler um lançamento não recebe a linha dele.
 *
 * `financeiro.lancamentos` só decide se a LINHA CLICA. Sem essa permissão o
 * clique levaria a um 404, e é melhor não reagir.
 */
export default async function PaginaExtratoConta({
  params,
  searchParams,
}: ExtratoContaPageProps) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "financeiro.contas-bancarias", "ver")) {
    notFound();
  }

  const { id } = await params;
  const conta = await buscarConta(id);
  if (!conta) notFound();

  // O escopo é lido ANTES do extrato porque é ele que decide o que buscar: só o
  // movimento que forma o saldo atual (padrão) ou o histórico inteiro.
  const escopo = lerEscopoDaUrl((await searchParams)[PARAM_ESCOPO]);
  const extrato = await listarExtratoDaConta(conta, incluiAnteriores(escopo));

  const podeEditar = temPermissao(
    usuario,
    "financeiro.contas-bancarias",
    "editar",
  );
  const podeVerLancamentos = temPermissao(
    usuario,
    "financeiro.lancamentos",
    "ver",
  );

  return (
    <div className="flex flex-col gap-4">
      <ExtratoContaCabecalho
        conta={conta}
        saldoFinal={extrato.saldoFinal}
        fechaNoSaldo={extrato.fechaNoSaldo}
        podeEditar={podeEditar}
      />

      <ExtratoContaTabela
        conta={conta}
        movimentos={extrato.movimentos}
        escopo={escopo}
        podeVerLancamentos={podeVerLancamentos}
      />
    </div>
  );
}
