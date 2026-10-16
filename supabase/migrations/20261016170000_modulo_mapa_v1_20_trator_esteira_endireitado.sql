-- Módulo Mapa v1.20: trator de esteira endireitado
--
-- Pedido do Tiago (16/10/2026): "tem que consertar a imagem 3D do trator de esteira". O .glb
-- gerado pela IA vinha com o corpo andando no eixo X e girado ~29°, e a lâmina e o escarificador
-- soltos, fora do corpo: no mapa a lâmina aparecia flutuando ao lado da máquina. O arquivo
-- public/mapa-modelos/trator_esteira.glb foi refeito (corpo andando em +y, como os outros modelos;
-- lâmina encostada na frente, escarificador atrás). A versão sobe para o navegador baixar o novo
-- (a tela põe ?v=versao na URL do modelo).

update public.mapa_modelos_3d set versao = versao + 1 where chave = 'trator_esteira';
