import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { idSchema } from "@/lib/id";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { AlertasFiltros } from "@/modules/medicao/alertas/components/alertas-filtros";
import { AlertasTabela } from "@/modules/medicao/alertas/components/alertas-tabela";
import { ROTULO_GRAVIDADE } from "@/modules/medicao/alertas/formato";
import { carregarAlertas } from "@/modules/medicao/alertas/queries";
import { listarContratos } from "@/modules/medicao/contratos/queries";

const RECURSO = "medicao.alertas" as const;

function primeiro(valor: string | string[] | undefined): string {
  return (Array.isArray(valor) ? valor[0] : valor)?.trim() ?? "";
}

export default async function PaginaAlertas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) notFound();

  const params = await searchParams;
  const contratoParam = primeiro(params.contrato);
  const contratoId = idSchema.safeParse(contratoParam).success ? contratoParam : "";
  const gravidadeParam = primeiro(params.gravidade);
  const gravidade = gravidadeParam in ROTULO_GRAVIDADE ? gravidadeParam : "";

  const [contratos, alertas] = await Promise.all([
    listarContratos({}),
    carregarAlertas({ contratoId: contratoId || undefined, gravidade: gravidade || undefined }),
  ]);

  return (
    <>
      <PageHeader
        modulo="Medição"
        titulo="Alertas"
        descricao="O que pede atenção nos contratos: acumulado acima do previsto, prazo, valor e diferença de planilha"
      />
      <AlertasFiltros
        contratos={contratos.map((c) => ({ id: c.id, codigo: c.codigo, nomeObra: c.nomeObra }))}
        contratoId={contratoId}
        gravidade={gravidade}
      />
      <AlertasTabela alertas={alertas} />
    </>
  );
}
