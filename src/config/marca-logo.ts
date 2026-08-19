/**
 * A marca da EMT como PNG, em base64.
 *
 * O app desenha a logo em SVG ({@link LogoEmt}); este arquivo existe só para
 * quem não sabe ler SVG: o exceljs, que embute a marca no topo da planilha
 * exportada. Base64 embutido, e não arquivo em `public/`, porque a planilha é
 * montada no SERVIDOR — buscar o próprio site por HTTP para ler um asset é
 * dependência de rede dentro de um export que só precisa de CPU, e falha em
 * build de preview onde a URL pública ainda não existe.
 *
 * É a variante `simbolo` (EMT sobre a pista, sem o "Construtora Ltda"), 168x107,
 * fundo transparente, gerada a partir do MESMO desenho do componente. A razão
 * social vai escrita ao lado, em texto, como no cabeçalho do espelho.
 */
export const LOGO_EMT_PNG_BASE64 =
  "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" +
  "a4PbSO50V50AAAAASUVORK5CYII=";

/** Proporção do PNG acima (168 x 107), para dimensionar sem distorcer. */
export const LOGO_EMT_PNG_PROPORCAO = 168 / 107;
