/**
 * De categoria de insumo para categoria de custo (financeira).
 *
 * O vínculo mora em `insumos.categoria_financeira_id`, por insumo — mas ninguém
 * classifica 3.357 insumos à mão. Este mapa de 27 linhas semeia todos eles pela
 * categoria do insumo; depois qualquer insumo pode ser ajustado individualmente,
 * que é justamente o ganho de a coluna estar no insumo e não na categoria.
 *
 * A chave de "A classificar" leva o grupo entre parênteses porque o nome se repete
 * nos quatro grupos. As outras 23 são únicas.
 *
 * Este mapa é a fonte da semeadura em
 * `supabase/migrations/20260817190100_categoria_de_custo_no_insumo.sql`. Mudou aqui,
 * muda lá — e vice-versa.
 */
export const MAPA_CATEGORIA_CUSTO: Record<string, string> = {
  // Equipamentos
  Combustível: "Combustível",
  "Lubrificantes e graxas": "Combustíveis e lubrificantes",
  Filtros: "Manutenção de equipamentos",
  "Peças e componentes": "Manutenção de equipamentos",
  "Pneus e câmaras": "Manutenção de equipamentos",
  "Manutenção e serviços": "Manutenção de equipamentos",
  "Locação de equipamento": "Aluguel de Equipamento",
  "A classificar (Equipamentos)": "Manutenção de equipamentos",
  // Mão de obra
  "Equipe própria": "Salário Mão de Obra",
  Diaristas: "Mão de Obra Terceirizada",
  "Terceiros e empreitas": "Mão de Obra Terceirizada",
  "A classificar (Mão de obra)": "Mão de Obra Terceirizada",
  // Material
  "Aço, ferragens e fixação": "Materiais de construção",
  "Asfalto e ligantes": "Materiais de construção",
  "Cimento, agregados e concreto": "Materiais de construção",
  Elétrica: "Materiais de construção",
  Hidráulica: "Materiais de construção",
  "Madeira e formas": "Materiais de construção",
  "Pintura e acabamento": "Materiais de construção",
  "EPI e sinalização": "EPI'S",
  "Ferramentas e consumíveis": "Materiais",
  "Limpeza e escritório": "Material de Escritório",
  "A classificar (Material)": "Materiais",
  // Outros
  "Fretes e transporte": "Frete",
  "Taxas e administrativo": "Impostos e taxas",
  "Rancho e alojamento": "Hospedagem",
  "A classificar (Outros)": "Outras despesas",
};

/**
 * Os 14 destinos, conferidos um a um contra `categorias_financeiras`
 * (tipo `despesa`, `ativo`) em 17/08/2026.
 *
 * "Rancho e alojamento" vai para `Hospedagem` por aproximação: rancho é alimentação
 * de equipe em campo e não existe categoria de alimentação. Se aparecer uma melhor,
 * é trocar uma linha aqui e re-semear os insumos daquela categoria.
 */
export const CATEGORIAS_DE_CUSTO_USADAS = [
  "Combustível",
  "Combustíveis e lubrificantes",
  "Manutenção de equipamentos",
  "Aluguel de Equipamento",
  "Salário Mão de Obra",
  "Mão de Obra Terceirizada",
  "Materiais de construção",
  "EPI'S",
  "Materiais",
  "Material de Escritório",
  "Frete",
  "Impostos e taxas",
  "Hospedagem",
  "Outras despesas",
] as const;
