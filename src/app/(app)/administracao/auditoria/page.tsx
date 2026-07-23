import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { AuditoriaTabela } from "@/modules/administracao/auditoria/components/auditoria-tabela";
import {
  listarAuditoria,
  listarTabelasAuditadas,
  listarUsuariosParaFiltro,
  type AcaoAuditoria,
} from "@/modules/administracao/auditoria/queries";

const ACOES_VALIDAS: readonly AcaoAuditoria[] = ["INSERT", "UPDATE", "DELETE"];
const TAMANHOS_VALIDOS = [10, 25, 50, 100];
const TAMANHO_PADRAO = 25;

interface AuditoriaPageProps {
  searchParams: Promise<{
    pagina?: string | string[];
    tamanho?: string | string[];
    tabela?: string | string[];
    usuario?: string | string[];
    acao?: string | string[];
  }>;
}

function primeiro(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

export default async function AuditoriaPage({
  searchParams,
}: AuditoriaPageProps) {
  const usuario = await getUsuarioLogado();
  if (!temPermissao(usuario, "administracao.auditoria", "ver")) notFound();

  const params = await searchParams;

  const pagina = Math.max(1, Math.trunc(Number(primeiro(params.pagina))) || 1);
  const tamanhoBruto = Number(primeiro(params.tamanho));
  const tamanho = TAMANHOS_VALIDOS.includes(tamanhoBruto)
    ? tamanhoBruto
    : TAMANHO_PADRAO;
  const tabela = primeiro(params.tabela) || undefined;
  const usuarioId = primeiro(params.usuario) || undefined;
  const acaoBruta = primeiro(params.acao);
  const acao = ACOES_VALIDAS.find((opcao) => opcao === acaoBruta);

  const [{ registros, total, nomes }, tabelas, usuarios] = await Promise.all([
    listarAuditoria({ pagina, tamanho, tabela, usuarioId, acao }),
    listarTabelasAuditadas(),
    listarUsuariosParaFiltro(),
  ]);

  return (
    <>
      <PageHeader
        titulo="Auditoria"
        descricao="Trilha de criações, edições e exclusões em todos os registros do sistema"
      />
      <AuditoriaTabela
        registros={registros}
        total={total}
        pagina={pagina}
        tamanho={tamanho}
        filtroTabela={tabela ?? ""}
        filtroUsuario={usuarioId ?? ""}
        filtroAcao={acao ?? ""}
        tabelas={tabelas}
        usuarios={usuarios}
        nomes={nomes}
      />
    </>
  );
}
