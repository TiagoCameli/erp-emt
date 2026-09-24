import { notFound, redirect } from "next/navigation";

import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarCentrosCusto } from "@/modules/_shared/centro-custo/queries";
import { TituloAba } from "@/modules/combustivel/_shared/components/titulo-aba";
import { AbastecimentosTabela } from "@/modules/combustivel/abastecimentos/components/abastecimentos-tabela";
import {
  lerFiltrosAbastecimentos,
  lerSaidaDoLink,
  rotaDoAbastecimento,
} from "@/modules/combustivel/abastecimentos/filtros";
import {
  listarAbastecimentos,
  listarCombustivelDaUltimaEntrada,
  listarEquipamentos,
  listarTransportadoras,
} from "@/modules/combustivel/abastecimentos/queries";
import { obrasParaAlocacao } from "@/modules/combustivel/abastecimentos/opcoes";
import { listarInsumosCombustivel, listarTanques } from "@/modules/combustivel/entradas/queries";

const RECURSO = "combustivel.saidas" as const;

export default async function PaginaAbastecimentos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) {
    notFound();
  }

  const params = await searchParams;
  // Link de outra tela (Anomalias): abre o detalhe do abastecimento direto.
  const saidaDoLink = lerSaidaDoLink(params);
  if (saidaDoLink) redirect(rotaDoAbastecimento(saidaDoLink));

  const podeCriar = temPermissao(usuario, RECURSO, "criar");
  const podeEditar = temPermissao(usuario, RECURSO, "editar");
  const podeExcluir = temPermissao(usuario, RECURSO, "excluir");
  const carregaFormulario = podeCriar || podeEditar;
  // Restaurar é a Lixeira da origem: pede editar a Lixeira e excluir na aba (a
  // fn_comb_restaurar confere as duas de novo). Sem isso, "excluidos" na URL é ignorado.
  const podeRestaurar = temPermissao(usuario, "administracao.lixeira", "editar") && podeExcluir;
  // Sem `de`/`ate` na URL é qualquer data, como no resto do ERP. Os últimos 30 dias da
  // origem eram reinjetados aqui, e limpar o período nunca desligava o filtro (24/09/2026).
  const lidos = lerFiltrosAbastecimentos(params);
  const filtros = { ...lidos, excluidos: podeRestaurar && lidos.excluidos ? true : undefined };

  // Os tanques vêm antes: as sub-abas Internas/Externas dependem de quais são de terceiro.
  const tanques = await listarTanques();
  const contexto = { idsTanquesExternos: tanques.filter((t) => t.ehExterno).map((t) => t.id) };

  const [lista, equipamentos, transportadoras, insumos, centros, combustivelPorTanque] = await Promise.all([
    listarAbastecimentos(filtros, contexto),
    listarEquipamentos(),
    listarTransportadoras(),
    listarInsumosCombustivel(),
    listarCentrosCusto(),
    carregaFormulario ? listarCombustivelDaUltimaEntrada() : Promise.resolve<Record<string, string>>({}),
  ]);

  const inativo = (rotulo: string, ativo: boolean) => (ativo ? rotulo : `${rotulo} (inativo)`);
  const obras = obrasParaAlocacao(centros);

  return (
    <>
      <TituloAba titulo="Saídas" />
      <AbastecimentosTabela
        abastecimentos={lista.itens}
        total={lista.total}
        litrosDoFiltro={lista.litrosDoFiltro}
        valorDoFiltro={lista.valorDoFiltro}
        contagens={lista.contagens}
        filtros={filtros}
        podeCriar={podeCriar}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
        podeRestaurar={podeRestaurar}
        opcoesFormulario={
          carregaFormulario
            ? { tanques, equipamentos, transportadoras, insumos, obras, combustivelPorTanque }
            : null
        }
        opcoesFiltro={{
          tanques: tanques.map((t) => ({
            id: t.id,
            rotulo: inativo(t.ehExterno ? `${t.rotulo} (externo)` : t.rotulo, t.ativo),
          })),
          equipamentos: equipamentos.map((e) => ({ id: e.id, rotulo: inativo(e.rotulo, e.ativo) })),
          transportadoras: transportadoras.map((t) => ({ id: t.id, rotulo: inativo(t.nome, t.ativo) })),
          obras: obras.map((o) => ({ id: o.id, rotulo: o.nome })),
          combustiveis: insumos.map((i) => ({ id: i.id, rotulo: inativo(i.nome, i.ativo) })),
        }}
      />
    </>
  );
}
