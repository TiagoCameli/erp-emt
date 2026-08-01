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
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
/** Um uuid inteiro tem 36 caracteres: o que passa disso é ruído colado. */
const MAX_REGISTRO = 36;

interface AuditoriaPageProps {
  searchParams: Promise<{
    pagina?: string | string[];
    tamanho?: string | string[];
    tabela?: string | string[];
    usuario?: string | string[];
    acao?: string | string[];
    de?: string | string[];
    ate?: string | string[];
    registro?: string | string[];
  }>;
}

function primeiro(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

/** Data yyyy-MM-dd da query string, ou undefined. Lixo nunca vai pro banco. */
function dataDe(valor: string | string[] | undefined): string | undefined {
  const texto = primeiro(valor);
  return texto && DATA_ISO.test(texto) ? texto : undefined;
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
  // Período invertido é trocado de lado: senão a lista volta vazia e o usuário
  // não tem como saber por quê.
  let de = dataDe(params.de);
  let ate = dataDe(params.ate);
  if (de && ate && de > ate) [de, ate] = [ate, de];
  const registro =
    (primeiro(params.registro) ?? "").trim().slice(0, MAX_REGISTRO) ||
    undefined;

  const [{ registros, total, nomes }, tabelas, usuarios] = await Promise.all([
    listarAuditoria({
      pagina,
      tamanho,
      tabela,
      usuarioId,
      acao,
      de,
      ate,
      registro,
    }),
    listarTabelasAuditadas(),
    listarUsuariosParaFiltro(),
  ]);

  return (
    <>
      <PageHeader
        modulo="Administração"
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
        filtroDe={de ?? ""}
        filtroAte={ate ?? ""}
        filtroRegistro={registro ?? ""}
        tabelas={tabelas}
        usuarios={usuarios}
        nomes={nomes}
      />
    </>
  );
}
