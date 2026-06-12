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
        {modulosVisiveis.map((modulo) => (
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
