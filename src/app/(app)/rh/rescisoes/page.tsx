import { notFound } from "next/navigation";

import {
  GradeKpis,
  KPICard,
  MoneyText,
  PageHeader,
} from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { RescisoesTabela } from "@/modules/rh/rescisoes/components/rescisoes-tabela";
import {
  listarColaboradoresParaRescisao,
  listarRescisoes,
} from "@/modules/rh/rescisoes/queries";

export default async function PaginaRescisoes() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "rh.rescisoes", "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, "rh.rescisoes", "criar");

  // As duas leituras são independentes: em paralelo para a tela não somar duas
  // idas ao banco em sequência.
  const [rescisoes, colaboradores] = await Promise.all([
    listarRescisoes(),
    podeCriar
      ? listarColaboradoresParaRescisao()
      : Promise.resolve([]),
  ]);

  const emAberto = rescisoes.filter(
    (rescisao) =>
      rescisao.status === "rascunho" ||
      rescisao.status === "pendente_aprovacao",
  );
  const aPagar = emAberto.reduce(
    (soma, rescisao) => soma + rescisao.valorLiquido,
    0,
  );

  return (
    <>
      <PageHeader
        modulo="RH"
        titulo="Rescisões"
        descricao="Rescisão do contrato CLT: o sistema calcula as verbas, você confere e edita o que precisar, e a aprovação desliga o colaborador e gera a conta a pagar."
      />

      {/* Sem rescisão nenhuma não há número para mostrar: o estado vazio da
          tabela já explica o que fazer, e cartão zerado só ocupa espaço. */}
      {rescisoes.length > 0 ? (
        <GradeKpis className="mb-4">
          <KPICard
            titulo="Rescisões em aberto"
            valor={emAberto.length}
            detalhe="Em rascunho ou aguardando aprovação"
          />
          <KPICard
            titulo="Líquido a pagar em aberto"
            valor={<MoneyText valor={aPagar} />}
            detalhe="Soma das rescisões que ainda não foram aprovadas"
          />
          <KPICard
            titulo="Desligamentos registrados"
            valor={
              rescisoes.filter((rescisao) => rescisao.status === "aprovado")
                .length
            }
            detalhe="Rescisões aprovadas, com a pessoa já desligada"
          />
        </GradeKpis>
      ) : null}

      <RescisoesTabela
        rescisoes={rescisoes}
        colaboradores={colaboradores}
        podeCriar={podeCriar}
      />
    </>
  );
}
