import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { ImportacoesCliente } from "@/modules/financeiro/conciliacao/components/importacoes-cliente";
import {
  listarContasBancarias,
  listarImportacoes,
} from "@/modules/financeiro/conciliacao/queries";

/**
 * Histórico de importações de extrato (Bloco G, 03/10/2026): o que já entrou,
 * de qual conta, por quem, e a cobertura de cada conta nos últimos 12 meses.
 * Fica sob a mesma permissão da Conciliação (ver), acessível pela escolha de
 * conta e pela tela da conta.
 */
export default async function PaginaImportacoes({
  searchParams,
}: {
  searchParams: Promise<{ conta?: string }>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "financeiro.conciliacao", "ver")) {
    notFound();
  }

  const { conta } = await searchParams;
  const [importacoes, contas] = await Promise.all([
    listarImportacoes(),
    listarContasBancarias(),
  ]);

  const comExtrato = new Set(importacoes.map((i) => i.contaId));
  const contasConciliaveis = contas.filter(
    (c) => comExtrato.has(c.id) || c.tipo === "corrente",
  );

  return (
    <>
      <PageHeader
        modulo="Financeiro"
        titulo="Importações de extrato"
        descricao="O que já foi importado, conta por conta, e o que falta importar"
      />
      <ImportacoesCliente
        importacoes={importacoes}
        contas={contasConciliaveis}
        contaInicial={conta ?? ""}
        podeExcluir={temPermissao(usuario, "financeiro.conciliacao", "excluir")}
        // Mês corrente no fuso da EMT (Rio Branco), não no do servidor.
        hoje={new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Rio_Branco",
        })
          .format(new Date())
          .slice(0, 7)}
      />
    </>
  );
}
