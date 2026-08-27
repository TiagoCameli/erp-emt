import { describe, expect, it } from "vitest";

import {
  caminhoDaFoto,
  FOTO_LADO_PX,
  FOTO_MIME,
  FOTO_ORIGEM_MAXIMO_MB,
  FOTO_QUALIDADE_JPEG,
  FOTO_TAMANHO_MAXIMO_MB,
} from "@/lib/foto-limite";

/**
 * O caminho da foto é calculado DUAS vezes: aqui, em TypeScript (para o token de
 * upload), e em SQL, dentro de `fn_salvar_minha_foto` (para gravar na coluna). O
 * CHECK `foto_path = 'avatares/' || id || '.jpg'` é o que garante que as duas
 * contas concordam, e `confirmarEnvioFoto` compara os dois valores.
 *
 * Este teste é a terceira trava, e a única que roda no CI: se alguém mexer no
 * formato daqui sem mexer na migration, ele quebra ANTES de o binário ir para um
 * lugar em que a linha não aponta.
 */
describe("caminho da foto", () => {
  const ID = "7d0194c2-fd7e-41d1-b6c4-f05c0a652229";

  it("é exatamente a fórmula que o CHECK do banco exige", () => {
    // A fórmula em SQL é 'avatares/' || id::text || '.jpg'. Escrita aqui como
    // literal de propósito: reescrever a concatenação com template string
    // repetiria o mesmo erro nos dois lados.
    expect(caminhoDaFoto(ID)).toBe(
      "avatares/7d0194c2-fd7e-41d1-b6c4-f05c0a652229.jpg",
    );
  });

  it("é determinístico: o mesmo usuário sempre no mesmo objeto", () => {
    // É o que evita órfão. Caminho novo a cada troca deixaria a foto antiga no
    // bucket para sempre, porque este bucket fica FORA da faxina de binários
    // órfãos (se estivesse dentro, as fotos seriam apagadas em 24h).
    expect(caminhoDaFoto(ID)).toBe(caminhoDaFoto(ID));
  });

  it("não mistura usuários", () => {
    const outro = "3767e529-eae7-4178-852c-2dd2782efaaf";
    expect(caminhoDaFoto(ID)).not.toBe(caminhoDaFoto(outro));
  });
});

describe("limites da foto", () => {
  it("o teto do que CHEGA é menor que o teto do que se ESCOLHE", () => {
    // Os dois medem coisas diferentes: o de origem é o arquivo do celular (3 a
    // 8 MB), o outro é o JPEG de 512px que sobe. Invertidos, a tela recusaria
    // toda foto de celular antes de tentar reduzir.
    expect(FOTO_TAMANHO_MAXIMO_MB).toBeLessThan(FOTO_ORIGEM_MAXIMO_MB);
  });

  it("o MIME é o que o bucket aceita", () => {
    // `allowed_mime_types = {image/jpeg}` na migration 20260827140000. Trocar
    // aqui sem trocar lá faz todo upload voltar recusado pelo Storage.
    expect(FOTO_MIME).toBe("image/jpeg");
  });

  it("o lado é potência de dois e cabe num avatar retina", () => {
    expect(FOTO_LADO_PX).toBe(512);
  });

  it("a qualidade do JPEG fica na faixa válida do toBlob", () => {
    // Fora de 0..1 o `canvas.toBlob` ignora o valor e usa o padrão do
    // navegador, silenciosamente — o arquivo sairia com outro tamanho sem aviso.
    expect(FOTO_QUALIDADE_JPEG).toBeGreaterThan(0);
    expect(FOTO_QUALIDADE_JPEG).toBeLessThanOrEqual(1);
  });
});
