import Link from "next/link";
import { notFound } from "next/navigation";
import { FileSpreadsheet } from "lucide-react";

import { EmptyState, PageHeader } from "@/components/canonicos";
import { idSchema } from "@/lib/id";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { carregarContrato, listarContratos } from "@/modules/medicao/contratos/queries";
import { AbrirProximaMedicaoBotao } from "@/modules/medicao/medicoes/components/abrir-medicao-drawer";
import { MedicoesTabela } from "@/modules/medicao/medicoes/components/medicoes-tabela";
import { carregarMedicoes } from "@/modules/medicao/medicoes/queries";
import { SeletorContrato } from "@/modules/medicao/_shared/seletor-contrato";

const RECURSO = "medicao.medicoes" as const;
const TITULO = "Medições";

function primeiro(valor: string | string[] | undefined): string {
  return (Array.isArray(valor) ? valor[0] : valor)?.trim() ?? "";
}

export default async function PaginaMedicoes({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) notFound();
  const podeAbrir = temPermissao(usuario, RECURSO, "criar");

  const params = await searchParams;
  const contratoParam = primeiro(params.contrato);
  const contratoId = idSchema.safeParse(contratoParam).success ? contratoParam : "";

  const contratos = await listarContratos({});
  const seletor = <SeletorContrato contratos={contratos} contratoId={contratoId} />;

  if (!contratoId) {
    return (
      <>
        <PageHeader modulo="Medição" titulo={TITULO} descricao="Escolha o contrato para ver as medições" />
        {seletor}
        <EmptyState
          icone={FileSpreadsheet}
          titulo="Escolha o contrato"
          descricao={
            contratos.length === 0
              ? "Você não está na lista de acesso de nenhum contrato"
              : "A lista de medições é de um contrato só. Escolha acima qual você quer ver"
          }
        />
      </>
    );
  }

  // A RLS esconde o contrato fora da lista de acesso (D3): fora da lista é 404.
  const contrato = await carregarContrato(contratoId);
  if (!contrato) notFound();

  const medicoes = await carregarMedicoes(contratoId);
  const podeVerContrato = temPermissao(usuario, "medicao.contratos", "ver");
  const podeVerLancamentos = temPermissao(usuario, "medicao.lancamentos", "ver");
  const identificacaoContrato = (
    <>
      <span className="font-mono">{contrato.codigo}</span> · {contrato.nome_obra}
    </>
  );

  return (
    <>
      <PageHeader
        modulo="Medição"
        titulo={TITULO}
        descricao="As medições abertas do contrato, com o valor e os lançamentos de cada uma"
        acoes={podeAbrir ? <AbrirProximaMedicaoBotao contratoId={contratoId} /> : undefined}
      />
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
      <MedicoesTabela medicoes={medicoes} contratoId={contratoId} podeVerLancamentos={podeVerLancamentos} />
    </>
  );
}
