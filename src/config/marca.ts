/**
 * A marca da EMT em um lugar só: quem a empresa é no papel e as cores medidas
 * no arquivo da logo.
 *
 * Existe porque todo documento que sai do sistema (espelho de OC, de lançamento
 * e de pagamento, holerite, planilha exportada) precisa carimbar a MESMA
 * empresa. Enquanto o CNPJ e o endereço estavam apenas dentro do rodapé de um
 * componente, cada relatório novo copiava um pedaço e os documentos passavam a
 * discordar entre si — e discordar de CNPJ num papel que vai pro contador é
 * problema, não detalhe visual.
 *
 * Aqui NÃO é lugar de dado que muda por operação (obra, competência, conta).
 * Só a identidade da empresa, que muda de anos em anos e por decisão do Tiago.
 */

/** Dados cadastrais da empresa, como saem impressos. */
export const EMPRESA = {
  nome: "EMT Construtora",
  razaoSocial: "EMT Construtora Ltda",
  cnpj: "05.036.194/0001-07",
  endereco: "Rua Pedro Teles, 360, Centro, Cruzeiro do Sul-AC, CEP: 69980-000",
  telefones: "(68) 3322-1020 / (68) 99974-9950",
  email: "tiago@jccempresas.onmicrosoft.com",
} as const;

/**
 * Cores da marca, em hex.
 *
 * Medidas no próprio arquivo da logo (`personal-os/brand/images/emt-logo.jpg`),
 * não estimadas de memória: verde das letras #3E7744, cinza do asfalto #45464B,
 * amarelo do eixo da pista #CF943A.
 *
 * A fonte de verdade da COR NA TELA são os tokens `--emt-*` do `globals.css`;
 * estas constantes existem para quem não tem CSS: o exceljs, que escreve o
 * cabeçalho da planilha, e o pdfmake. Os dois hexes precisam bater — mudar um
 * sem o outro faz a planilha exportada sair com um verde e a tela com outro.
 */
export const CORES_MARCA = {
  verde: "#3E7744",
  /** Verde escurecido, para hover e texto sobre fundo claro. */
  verdeEscuro: "#2E5B34",
  /** Fundo de bloco na cor da marca (verde a 6% sobre branco). */
  verdeLavado: "#F0F5F1",
  asfalto: "#45464B",
  amarelo: "#CF943A",
  /** O âmbar da Faixa, assinatura do app. Vem do eixo da pista, clareado. */
  faixa: "#F59E0B",
  texto: "#1F1F1F",
  textoSecundario: "#6B6B6B",
  borda: "#E8E6E1",
  superficie: "#F7F7F5",
} as const;

/** Hex `#RRGGBB` no `FFRRGGBB` que o exceljs exige. */
export function argb(hex: string): string {
  return `FF${hex.replace("#", "").toUpperCase()}`;
}
