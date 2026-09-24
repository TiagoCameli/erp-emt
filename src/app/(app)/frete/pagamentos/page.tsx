import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { mesHojeISO } from "@/lib/formatadores";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { PagamentosAcoesCabecalho } from "@/modules/frete/pagamentos/components/pagamentos-acoes-cabecalho";
import { PagamentosTabela } from "@/modules/frete/pagamentos/components/pagamentos-tabela";
import {
  listarOpcoesPagoPor,
  listarPagamentos,
  listarTransportadoras,
  type OpcaoPagoPor,
  type PagamentoLinha,
} from "@/modules/frete/pagamentos/queries";

const RECURSO = "frete.pagamentos" as const;

// A importação grava linha a linha pela RPC e roda na função desta página: o teto padrão
// da Vercel (10 a 15s) não cobre uma planilha de algumas centenas de linhas.
export const maxDuration = 60;

export default async function PaginaPagamentosFrete() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, RECURSO, "criar");
  const podeEditar = temPermissao(usuario, RECURSO, "editar");
  const podeExcluir = temPermissao(usuario, RECURSO, "excluir");
  const carregaFormulario = podeCriar || podeEditar;
  // Restaurar é a Lixeira da origem: editar a Lixeira E excluir na aba (a
  // fn_frete_restaurar confere as duas de novo).
  const podeRestaurar = temPermissao(usuario, "administracao.lixeira", "editar") && podeExcluir;

  const [pagamentos, excluidos, transportadoras, opcoesPagoPor] = await Promise.all([
    listarPagamentos(),
    podeRestaurar ? listarPagamentos(true) : Promise.resolve<PagamentoLinha[]>([]),
    listarTransportadoras(),
    carregaFormulario ? listarOpcoesPagoPor() : Promise.resolve<OpcaoPagoPor[]>([]),
  ]);
  const mesHoje = mesHojeISO();
  const transportadorasAtivas = transportadoras.filter((t) => t.ativo);

  return (
    <>
      <PageHeader
        modulo="Frete"
        titulo="Pagamentos de frete"
        descricao="Pagamentos feitos às transportadoras. Cada um debita a conta corrente da transportadora"
        acoes={
          <PagamentosAcoesCabecalho
            podeCriar={podeCriar}
            transportadoras={transportadorasAtivas}
            opcoesPagoPor={opcoesPagoPor}
            nomeUsuario={usuario.nome}
            mesHoje={mesHoje}
          />
        }
      />
      <PagamentosTabela
        pagamentos={pagamentos}
        excluidos={excluidos}
        podeRestaurar={podeRestaurar}
        transportadoras={transportadoras}
        opcoesPagoPor={opcoesPagoPor}
        nomeUsuario={usuario.nome}
        mesHoje={mesHoje}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
      />
    </>
  );
}
