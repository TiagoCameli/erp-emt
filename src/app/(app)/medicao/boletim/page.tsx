import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleAlert, FileSpreadsheet } from "lucide-react";

import { EmptyState, PageHeader } from "@/components/canonicos";
import { idSchema } from "@/lib/id";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { BoletimCartoes } from "@/modules/medicao/boletim/components/boletim-cartoes";
import { BoletimTabela } from "@/modules/medicao/boletim/components/boletim-tabela";
import { SeletorBoletim } from "@/modules/medicao/boletim/components/seletor-boletim";
import { carregarBoletim } from "@/modules/medicao/boletim/queries";
import { listarContratos } from "@/modules/medicao/contratos/queries";

const RECURSO = "medicao.boletim" as const;

function primeiro(valor: string | string[] | undefined): string {
  return (Array.isArray(valor) ? valor[0] : valor)?.trim() ?? "";
}

/** `?ate=` só vale como inteiro positivo; o resto é "última". O banco confere se a Nª existe. */
function numeroDaMedicao(texto: string): number | null {
  return /^[1-9]\d{0,3}$/.test(texto) ? Number(texto) : null;
}

const TITULO = "Boletim de medição";

export default async function PaginaBoletim({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) notFound();

  const params = await searchParams;
  const contratoParam = primeiro(params.contrato);
  const contratoId = idSchema.safeParse(contratoParam).success ? contratoParam : "";
  const ate = numeroDaMedicao(primeiro(params.ate));
  const grupoId = primeiro(params.grupo);

  const contratos = await listarContratos({});

  if (!contratoId) {
    return (
      <>
        <PageHeader modulo="Medição" titulo={TITULO} descricao="Escolha o contrato para ver o boletim" />
        <SeletorBoletim contratos={contratos} contratoId="" medicoes={[]} ate="" grupos={[]} grupoId="" />
        <EmptyState
          icone={FileSpreadsheet}
          titulo="Escolha o contrato"
          descricao={
            contratos.length === 0
              ? "Você não está na lista de acesso de nenhum contrato"
              : "O boletim é de um contrato só. Escolha acima qual você quer ver"
          }
        />
      </>
    );
  }

  const { boletim, erro } = await carregarBoletim(contratoId, ate);

  if (!boletim) {
    // A Nª pedida não existe: a lista de medições ainda serve para o seletor escolher outra.
    const medicoes = ate !== null ? ((await carregarBoletim(contratoId, null)).boletim?.medicoes ?? []) : [];
    return (
      <>
        <PageHeader modulo="Medição" titulo={TITULO} descricao="A planilha do contrato com as quantidades e os valores de cada medição" />
        <SeletorBoletim contratos={contratos} contratoId={contratoId} medicoes={medicoes} ate={ate === null ? "" : String(ate)} grupos={[]} grupoId="" />
        <EmptyState icone={CircleAlert} titulo="Não foi possível montar o boletim" descricao={erro ?? undefined} />
      </>
    );
  }

  const grupos = boletim.linhas
    .filter((l) => l.nivel === 1 && l.tipo === "titulo")
    .map((l) => ({ id: l.id, codigo: l.codigo, descricao: l.descricao }));
  const semRegra = boletim.contrato.regra_arredondamento === null;

  return (
    <>
      <PageHeader
        modulo="Medição"
        titulo={TITULO}
        descricao="A planilha do contrato com as quantidades de cada medição, o acumulado e o saldo a medir"
      />
      <SeletorBoletim
        contratos={contratos}
        contratoId={contratoId}
        medicoes={boletim.medicoes}
        ate={ate === null ? "" : String(ate)}
        grupos={grupos}
        grupoId={grupoId}
      />
      <p className="mb-2 text-detalhe text-muted-foreground">
        <Link href={`/medicao/contratos/${boletim.contrato.id}`} className="underline-offset-2 hover:underline">
          <span className="font-mono">{boletim.contrato.codigo}</span> · {boletim.contrato.nome_obra}
        </Link>
        {boletim.versao ? ` · planilha v${boletim.versao.numero}` : " · sem versão vigente da planilha"}
        {semRegra ? " · o contrato ainda não tem regra de arredondamento, então os valores ficam em branco" : null}
      </p>
      <BoletimCartoes boletim={boletim} />
      <BoletimTabela boletim={boletim} grupoId={grupoId} />
    </>
  );
}
