import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { idSchema } from "@/lib/id";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarCentrosCusto } from "@/modules/_shared/centro-custo/queries";
import {
  ConciliacaoCliente,
  type VisaoConciliacao,
} from "@/modules/financeiro/conciliacao/components/conciliacao-cliente";
import { EscolherConta } from "@/modules/financeiro/conciliacao/components/escolher-conta";
import {
  montarVisoes,
  periodoDoMes,
} from "@/modules/financeiro/conciliacao/painel";
import {
  carregarPainel,
  contarPendentesPorConta,
  listarContasBancarias,
  listarExtratos,
  mesesDosExtratos,
} from "@/modules/financeiro/conciliacao/queries";
import {
  listarCategorias,
  listarClientes,
  listarFornecedores,
} from "@/modules/financeiro/lancamentos/queries";

const VISOES: readonly VisaoConciliacao[] = ["faltam", "fora", "casados"];

export default async function PaginaConciliacao({
  searchParams,
}: {
  searchParams: Promise<{ conta?: string; mes?: string; ver?: string }>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "financeiro.conciliacao", "ver")) {
    notFound();
  }

  // Cada ação da tela confere a permissão que a RPC também cobra no banco:
  // conciliar pede `editar` da Conciliação, e lançar, transferir ou excluir
  // pedem a permissão do módulo dono do registro.
  const conciliar = temPermissao(usuario, "financeiro.conciliacao", "editar");
  const permissoes = {
    importar: temPermissao(usuario, "financeiro.conciliacao", "criar"),
    conciliar,
    lancar:
      conciliar &&
      (temPermissao(usuario, "financeiro.lancamentos", "criar") ||
        temPermissao(usuario, "financeiro.recebimentos", "criar")),
    transferir: conciliar && temPermissao(usuario, "financeiro.transferencias", "criar"),
    mexerNoPago:
      conciliar &&
      (temPermissao(usuario, "financeiro.pagamentos", "criar") ||
        temPermissao(usuario, "financeiro.recebimentos", "editar")),
    excluir: conciliar && temPermissao(usuario, "financeiro.lancamentos", "excluir"),
  };

  const { conta: contaParam, mes: mesParam, ver } = await searchParams;

  const [extratos, contas, pendentes] = await Promise.all([
    listarExtratos(),
    listarContasBancarias(),
    contarPendentesPorConta(),
  ]);

  // Conciliável = tem extrato, ou é conta corrente (pode receber o primeiro).
  const comExtrato = new Set(extratos.map((e) => e.contaBancariaId));
  const contasConciliaveis = contas.filter(
    (c) => comExtrato.has(c.id) || c.tipo === "corrente",
  );

  const conta =
    contaParam && idSchema.safeParse(contaParam).success
      ? contas.find((c) => c.id === contaParam)
      : undefined;

  const cabecalho = (
    <PageHeader
      modulo="Financeiro"
      titulo={conta ? `Conciliação · ${conta.nome}` : "Conciliação"}
      descricao="Uma conta por vez: o app casa o extrato com os lançamentos, e você resolve o que sobrou dos dois lados"
    />
  );

  if (!conta) {
    return (
      <>
        {cabecalho}
        <EscolherConta
          contas={contasConciliaveis}
          todasContas={contas}
          podeImportar={permissoes.importar}
          resumos={contasConciliaveis.map((c) => ({
            contaId: c.id,
            qtdExtratos: extratos.filter((e) => e.contaBancariaId === c.id).length,
            ultimoMes: mesesDosExtratos(extratos, c.id)[0] ?? null,
            qtdPendentes: pendentes.get(c.id) ?? 0,
          }))}
        />
      </>
    );
  }

  const meses = mesesDosExtratos(extratos, conta.id);
  const mes = mesParam && meses.includes(mesParam) ? mesParam : meses[0];
  const periodo = mes ? periodoDoMes(mes) : null;

  if (!mes || !periodo) {
    return (
      <>
        {cabecalho}
        <EscolherConta
          contas={[conta]}
          todasContas={contas}
          podeImportar={permissoes.importar}
          resumos={[{ contaId: conta.id, qtdExtratos: 0, ultimoMes: null, qtdPendentes: 0 }]}
        />
      </>
    );
  }

  const [painel, centros, categorias, fornecedores, clientes] = await Promise.all([
    carregarPainel(conta.id, periodo.inicio, periodo.fim),
    listarCentrosCusto(),
    permissoes.lancar ? listarCategorias() : Promise.resolve([]),
    permissoes.lancar ? listarFornecedores() : Promise.resolve([]),
    permissoes.lancar ? listarClientes() : Promise.resolve([]),
  ]);

  // Sem `ver` na URL, abre onde está o trabalho: primeiro o que falta no app,
  // depois o que sobra no app, e só então os casados.
  let visao: VisaoConciliacao;
  if (ver && (VISOES as readonly string[]).includes(ver)) {
    visao = ver as VisaoConciliacao;
  } else {
    const visoes = montarVisoes(painel, periodo);
    visao =
      visoes.faltamNoApp.length > 0
        ? "faltam"
        : visoes.foraDoBanco.length > 0
          ? "fora"
          : "casados";
  }

  return (
    <>
      {cabecalho}
      <ConciliacaoCliente
        conta={conta}
        contasConciliaveis={contasConciliaveis}
        contas={contas}
        mes={mes}
        meses={meses}
        periodo={periodo}
        painel={painel}
        visao={visao}
        opcoes={{ centros, categorias, fornecedores, clientes }}
        permissoes={permissoes}
      />
    </>
  );
}
