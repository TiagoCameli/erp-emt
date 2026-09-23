import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarCentrosCusto } from "@/modules/_shared/centro-custo/queries";
import { AbastecimentosTabela } from "@/modules/combustivel/abastecimentos/components/abastecimentos-tabela";
import { NovoAbastecimentoBotao } from "@/modules/combustivel/abastecimentos/components/novo-abastecimento-botao";
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
import {
  listarInsumosCombustivel,
  listarTanques,
  type InsumoCombustivel,
} from "@/modules/combustivel/entradas/queries";

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
  // Restaurar é a Lixeira da origem: pede editar a Lixeira e excluir na aba (a
  // fn_comb_restaurar confere as duas de novo). Sem isso, "excluidos" na URL é ignorado.
  const podeRestaurar =
    temPermissao(usuario, "administracao.lixeira", "editar") && temPermissao(usuario, RECURSO, "excluir");
  const lidos = lerFiltrosAbastecimentos(params);
  const filtros = { ...lidos, excluidos: podeRestaurar && lidos.excluidos ? true : undefined };

  const [lista, tanques, equipamentos, transportadoras, insumos, centros, combustivelPorTanque] = await Promise.all([
    listarAbastecimentos(filtros),
    listarTanques(),
    listarEquipamentos(),
    listarTransportadoras(),
    podeCriar ? listarInsumosCombustivel() : Promise.resolve<InsumoCombustivel[]>([]),
    podeCriar ? listarCentrosCusto() : Promise.resolve([]),
    podeCriar ? listarCombustivelDaUltimaEntrada() : Promise.resolve<Record<string, string>>({}),
  ]);

  const inativo = (rotulo: string, ativo: boolean) => (ativo ? rotulo : `${rotulo} (inativo)`);

  return (
    <>
      <PageHeader
        modulo="Combustível"
        titulo="Abastecimentos"
        descricao="Saídas de combustível: equipamentos da EMT e carretas de transportadora, do tanque ou do posto"
        acoes={
          podeCriar ? (
            <NovoAbastecimentoBotao
              opcoes={{
                tanques,
                equipamentos,
                transportadoras,
                insumos,
                obras: obrasParaAlocacao(centros),
                combustivelPorTanque,
              }}
            />
          ) : undefined
        }
      />
      <AbastecimentosTabela
        abastecimentos={lista.itens}
        total={lista.total}
        litrosDoFiltro={lista.litrosDoFiltro}
        valorDoFiltro={lista.valorDoFiltro}
        pagina={filtros.pagina}
        tamanho={filtros.tamanho}
        de={filtros.de ?? ""}
        ate={filtros.ate ?? ""}
        tanqueId={filtros.tanqueId ?? ""}
        equipamentoId={filtros.equipamentoId ?? ""}
        transportadoraId={filtros.transportadoraId ?? ""}
        tipo={filtros.tipo ?? ""}
        origem={filtros.origem ?? ""}
        canal={filtros.canal ?? ""}
        excluidos={filtros.excluidos ?? false}
        podeRestaurar={podeRestaurar}
        tanques={tanques.map((t) => ({ id: t.id, rotulo: inativo(t.ehExterno ? `${t.rotulo} (externo)` : t.rotulo, t.ativo) }))}
        equipamentos={equipamentos.map((e) => ({ id: e.id, rotulo: inativo(e.rotulo, e.ativo) }))}
        transportadoras={transportadoras.map((t) => ({ id: t.id, rotulo: inativo(t.nome, t.ativo) }))}
      />
    </>
  );
}
