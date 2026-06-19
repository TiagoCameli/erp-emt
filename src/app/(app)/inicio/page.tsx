import { KPICard, PageHeader } from "@/components/canonicos";
import { MODULOS, recursosDoModulo, type RecursoId } from "@/config/recursos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";

export default async function InicioPage() {
  const usuario = await getUsuarioLogado();

  const modulosVisiveis = MODULOS.filter((modulo) =>
    recursosDoModulo(modulo.id).some((recurso) =>
      temPermissao(usuario, recurso.id as RecursoId, "ver"),
    ),
  );

  const veCompras = recursosDoModulo("compras").some((recurso) =>
    temPermissao(usuario, recurso.id as RecursoId, "ver"),
  );

  const veFinanceiro = recursosDoModulo("financeiro").some((recurso) =>
    temPermissao(usuario, recurso.id as RecursoId, "ver"),
  );

  return (
    <div>
      <PageHeader
        titulo="Início"
        descricao="Bem-vindo ao ERP da EMT Construtora"
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KPICard
          titulo="Fase 0"
          valor="Fundação"
          detalhe="Permissões, auditoria e administração ativas"
        />
        {veCompras ? (
          <KPICard
            titulo="Módulo"
            valor="Compras"
            detalhe="Pedidos, cotações, ordens e recebimentos"
            href="/compras"
          />
        ) : null}
        {veFinanceiro ? (
          <KPICard
            titulo="Módulo"
            valor="Financeiro"
            detalhe="Lançamentos, aprovação, pagamentos e conciliação"
            href="/financeiro"
          />
        ) : null}
        {modulosVisiveis
          .filter(
            (modulo) => modulo.id !== "compras" && modulo.id !== "financeiro",
          )
          .map((modulo) => (
            <KPICard
              key={modulo.id}
              titulo="Módulo"
              valor={modulo.nome}
              detalhe={`Abrir ${modulo.nome.toLowerCase()}`}
              href={modulo.rota}
            />
          ))}
      </div>
    </div>
  );
}
