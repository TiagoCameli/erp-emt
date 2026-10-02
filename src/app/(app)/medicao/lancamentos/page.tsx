import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardList, TriangleAlert } from "lucide-react";

import { EmptyState, FilterBar, PageHeader } from "@/components/canonicos";
import { idSchema } from "@/lib/id";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { carregarContrato, listarContratos } from "@/modules/medicao/contratos/queries";
import { LancamentosTabela } from "@/modules/medicao/lancamentos/components/lancamentos-tabela";
import { facetasLancamentos, listarLancamentos, servicosParaLancar } from "@/modules/medicao/lancamentos/queries";
import { carregarMedicoes } from "@/modules/medicao/medicoes/queries";
import { FiltroContrato } from "@/modules/medicao/_shared/seletor-contrato";

const RECURSO = "medicao.lancamentos" as const;
const TITULO = "Lançamentos";
/** Filtros de contrato que zeram na troca (não existem no contrato seguinte). */
const LIMPA_AO_TROCAR_CONTRATO = ["medicao", "de", "ate", "item", "busca"];

function primeiro(valor: string | string[] | undefined): string {
  return (Array.isArray(valor) ? valor[0] : valor)?.trim() ?? "";
}

export default async function PaginaLancamentos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) notFound();

  const params = await searchParams;
  const contratoParam = primeiro(params.contrato);
  const contratoId = idSchema.safeParse(contratoParam).success ? contratoParam : "";

  const contratos = await listarContratos({});
  const seletor = (
    <FilterBar>
      <FiltroContrato contratos={contratos} contratoId={contratoId} limparAoTrocar={LIMPA_AO_TROCAR_CONTRATO} />
    </FilterBar>
  );

  if (!contratoId) {
    return (
      <>
        <PageHeader modulo="Medição" titulo={TITULO} descricao="Escolha o contrato para ver os lançamentos" />
        {seletor}
        <EmptyState
          icone={ClipboardList}
          titulo="Escolha o contrato"
          descricao={
            contratos.length === 0
              ? "Você não está na lista de acesso de nenhum contrato"
              : "A lista de lançamentos é de um contrato só. Escolha acima qual você quer ver"
          }
        />
      </>
    );
  }

  // A RLS esconde o contrato fora da lista de acesso (D3): fora da lista é 404.
  const contrato = await carregarContrato(contratoId);
  if (!contrato) notFound();

  const medicaoParam = primeiro(params.medicao);
  const medicaoNumero = medicaoParam !== "" && /^\d+$/.test(medicaoParam) ? Number(medicaoParam) : undefined;
  const de = primeiro(params.de) || undefined;
  const ate = primeiro(params.ate) || undefined;
  const itemParam = primeiro(params.item);
  const itemId = idSchema.safeParse(itemParam).success ? itemParam : undefined;
  const busca = primeiro(params.busca) || undefined;

  const filtrosLista = { contratoId, medicao: medicaoNumero, de, ate, itemId, busca };
  const [medicoes, servicos, lancamentos, facetas] = await Promise.all([
    carregarMedicoes(contratoId),
    servicosParaLancar(contratoId),
    listarLancamentos(filtrosLista),
    facetasLancamentos(filtrosLista),
  ]);

  const podeVerMedicoes = temPermissao(usuario, "medicao.medicoes", "ver");
  const podeVerContrato = temPermissao(usuario, "medicao.contratos", "ver");
  const podeCriar = temPermissao(usuario, RECURSO, "criar");
  const podeEditar = temPermissao(usuario, RECURSO, "editar");
  const podeExcluir = temPermissao(usuario, RECURSO, "excluir");

  const identificacaoContrato = (
    <>
      <span className="font-mono">{contrato.codigo}</span> · {contrato.nome_obra}
    </>
  );

  const linkMedicoes = `/medicao/medicoes?contrato=${contratoId}`;

  return (
    <>
      <PageHeader modulo="Medição" titulo={TITULO} descricao="O serviço executado, dia a dia, dentro de uma medição aberta" />
      {seletor}
      <p className="mb-2 text-detalhe text-muted-foreground">
        {podeVerContrato ? (
          <Link href={`/medicao/contratos/${contrato.id}`} className="underline-offset-2 hover:underline">
            {identificacaoContrato}
          </Link>
        ) : (
          identificacaoContrato
        )}
      </p>

      {servicos.length === 0 ? (
        <div
          role="alert"
          className="mb-3 flex items-start gap-2 rounded-md border border-status-pendente/40 bg-status-pendente/10 px-3 py-2 text-detalhe"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Este contrato não tem nenhuma medição aberta agora.{" "}
            {podeVerMedicoes ? (
              <Link href={linkMedicoes} className="font-medium underline-offset-2 hover:underline">
                Abra a próxima medição em Medições
              </Link>
            ) : (
              "Peça para abrir a próxima medição em Medições"
            )}{" "}
            antes de lançar.
          </span>
        </div>
      ) : null}

      <LancamentosTabela
        lancamentos={lancamentos}
        contratoId={contratoId}
        tipoLocalizacao={contrato.tipo_localizacao === "rodovia" ? "rodovia" : "texto"}
        servicos={servicos}
        medicoesParaFiltro={medicoes.map((m) => ({ numero: m.numero, periodoInicio: m.periodoInicio, periodoFim: m.periodoFim }))}
        podeCriar={podeCriar}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
        facetas={facetas}
      />
    </>
  );
}
