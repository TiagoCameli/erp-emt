import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { CompetenciasTabela } from "@/modules/financeiro/competencias/components/competencias-tabela";
import { listarCompetencias } from "@/modules/financeiro/competencias/queries";

/**
 * Fechar a competência roda na função desta página e varre o mês inteiro de
 * lançamentos para checar o que trava o fechamento. Teto padrão da Vercel é 10
 * a 15s, e invocação morta não devolve nem `{ erro }`. Mesma razão do
 * `maxDuration` de /rh/folha/[id].
 */
export const maxDuration = 60;

export default async function PaginaCompetencias() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "financeiro.competencias", "ver")) {
    notFound();
  }

  const competencias = await listarCompetencias();

  const podeFechar = temPermissao(usuario, "financeiro.competencias", "aprovar");
  const podeReabrir = temPermissao(
    usuario,
    "financeiro.competencias",
    "desaprovar",
  );

  return (
    <>
      <PageHeader
        modulo="Financeiro"
        titulo="Fechamento de competência"
        descricao="Fechar um mês congela o custo dele: depois disso, lançar com aquele mês de referência exige reabrir a competência, e a exceção fica registrada na auditoria"
      />
      <CompetenciasTabela
        competencias={competencias}
        podeFechar={podeFechar}
        podeReabrir={podeReabrir}
      />
    </>
  );
}
