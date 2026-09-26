import Link from "next/link";
import { notFound } from "next/navigation";
import { FileSpreadsheet } from "lucide-react";

import { EmptyState, PageHeader } from "@/components/canonicos";
import { idSchema } from "@/lib/id";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { carregarContrato, listarContratos } from "@/modules/medicao/contratos/queries";
import { NovaVersaoBotao } from "@/modules/medicao/planilha/components/nova-versao-botao";
import { SeletorContrato, VersoesTabela } from "@/modules/medicao/planilha/components/versoes-tabela";
import { aditivosSemVersao, listarVersoes } from "@/modules/medicao/planilha/queries";

const RECURSO = "medicao.planilha" as const;

function primeiro(valor: string | string[] | undefined): string {
  return (Array.isArray(valor) ? valor[0] : valor)?.trim() ?? "";
}

export default async function PaginaPlanilha({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) notFound();
  const podeCriar = temPermissao(usuario, RECURSO, "criar");

  const params = await searchParams;
  const contratoParam = primeiro(params.contrato);
  const contratoId = idSchema.safeParse(contratoParam).success ? contratoParam : "";

  const contratos = await listarContratos({});
  const seletor = <SeletorContrato contratos={contratos} contratoId={contratoId} />;

  if (!contratoId) {
    return (
      <>
        <PageHeader modulo="Medição" titulo="Planilha contratual" descricao="Escolha o contrato para ver as versões da planilha" />
        {seletor}
        <EmptyState
          icone={FileSpreadsheet}
          titulo="Escolha o contrato"
          descricao={
            contratos.length === 0
              ? "Você não está na lista de acesso de nenhum contrato"
              : "A planilha contratual é de um contrato só. Escolha acima qual você quer ver"
          }
        />
      </>
    );
  }

  // A RLS esconde o contrato fora da lista de acesso (D3): fora da lista é 404.
  const contrato = await carregarContrato(contratoId);
  if (!contrato || contrato.excluido_em !== null) notFound();

  const versoes = await listarVersoes(contratoId);
  const proximoNumero = versoes.length === 0 ? 0 : Math.max(...versoes.map((v) => v.numero)) + 1;
  const temRascunho = versoes.some((v) => v.status === "rascunho");
  const aditivos = podeCriar && proximoNumero > 0 ? await aditivosSemVersao(contratoId) : [];

  return (
    <>
      <PageHeader
        modulo="Medição"
        titulo="Planilha contratual"
        descricao="Versões da planilha. A v0 é a licitada; cada aditivo entra como versão nova, sem apagar a anterior"
        acoes={
          podeCriar ? (
            <NovaVersaoBotao contratoId={contratoId} proximoNumero={proximoNumero} aditivos={aditivos} temRascunho={temRascunho} />
          ) : undefined
        }
      />
      {seletor}
      <p className="mb-2 text-detalhe text-muted-foreground">
        <Link href={`/medicao/contratos/${contrato.id}`} className="underline-offset-2 hover:underline">
          <span className="font-mono">{contrato.codigo}</span> · {contrato.nome_obra}
        </Link>
        {contrato.regra_arredondamento === null ? " · o contrato ainda não tem regra de arredondamento" : null}
      </p>
      <VersoesTabela versoes={versoes} podeCriar={podeCriar} />
    </>
  );
}
