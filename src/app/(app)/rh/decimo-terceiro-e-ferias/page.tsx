import { notFound } from "next/navigation";

import {
  GradeKpis,
  KPICard,
  PageHeader,
  SecaoDetalhe,
} from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarColaboradores } from "@/modules/rh/_shared/queries";
import { LoteAcoesCabecalho } from "@/modules/rh/decimo-terceiro/components/lote-acoes-cabecalho";
import { LotesTabela } from "@/modules/rh/decimo-terceiro/components/lotes-tabela";
import {
  listarForaDoLote,
  listarLotes,
  temProvisaoDe13Ativa,
} from "@/modules/rh/decimo-terceiro/queries";
import { FeriasAcoesCabecalho } from "@/modules/rh/ferias/components/ferias-acoes-cabecalho";
import { FeriasTabela } from "@/modules/rh/ferias/components/ferias-tabela";
import { listarFerias } from "@/modules/rh/ferias/queries";

const RECURSO = "rh.decimo-terceiro-ferias" as const;

export default async function PaginaDecimoTerceiroEFerias() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, RECURSO, "criar");
  const podeEditar = temPermissao(usuario, RECURSO, "editar");
  const podeExcluir = temPermissao(usuario, RECURSO, "excluir");

  // Cinco leituras independentes: em paralelo para a página não somar cinco
  // idas ao banco em sequência.
  const [ferias, colaboradores, lotes, fora, temProvisao] = await Promise.all([
    listarFerias(),
    listarColaboradores(),
    listarLotes(),
    listarForaDoLote(),
    temProvisaoDe13Ativa(),
  ]);

  const vencidas = ferias.filter((item) => item.situacao === "vencida").length;
  const aVencer = ferias.filter((item) => item.situacao === "a_vencer").length;

  // O 13º é do ano corrente. Em janeiro e fevereiro a 2ª parcela do ano
  // anterior ainda pode estar para sair, mas o campo é editável.
  const anoSugerido = new Date().getFullYear();

  return (
    <>
      <PageHeader
        modulo="RH"
        titulo="13º e Férias"
        descricao="Períodos aquisitivos e gozo de férias por colaborador, e o 13º salário em lote por ano e parcela."
      />

      <GradeKpis className="mb-4">
        <KPICard
          titulo="Férias vencidas"
          valor={vencidas}
          detalhe="Passaram do limite de gozo e ainda programadas"
        />
        <KPICard
          titulo="A vencer (60 dias)"
          valor={aVencer}
          detalhe="Faltam 60 dias ou menos para o limite"
        />
        <KPICard
          titulo="Fora do 13º"
          valor={fora.length}
          detalhe="CLT ativo sem data de admissão no cadastro"
        />
      </GradeKpis>

      <div className="flex flex-col gap-6">
        <SecaoDetalhe
          titulo="Férias"
          acao={
            podeCriar ? (
              <FeriasAcoesCabecalho colaboradores={colaboradores} />
            ) : undefined
          }
        >
          <FeriasTabela
            ferias={ferias}
            colaboradores={colaboradores}
            podeCriar={podeCriar}
            podeEditar={podeEditar}
            podeExcluir={podeExcluir}
          />
        </SecaoDetalhe>

        <SecaoDetalhe
          titulo="13º salário"
          acao={
            podeCriar ? (
              <LoteAcoesCabecalho
                anoSugerido={anoSugerido}
                quantidadeForaDoLote={fora.length}
                temProvisaoDe13={temProvisao}
              />
            ) : undefined
          }
        >
          <LotesTabela
            lotes={lotes}
            podeCriar={podeCriar}
            anoSugerido={anoSugerido}
            quantidadeForaDoLote={fora.length}
            temProvisaoDe13={temProvisao}
          />
        </SecaoDetalhe>
      </div>
    </>
  );
}
