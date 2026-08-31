# -*- coding: utf-8 -*-
"""Mapa etapa-do-MC -> etapa-do-ERP. Explicito de proposito.

Preferi tabela declarada a casamento difuso: cada linha aqui e auditavel e o
Tiago pode discordar de UMA sem derrubar as outras. Nada foi inventado; as
fontes sao:

  a) o que ele ditou em 30/08: escavadeira 01-03 na mesma ordem, retro 06->01
     e 07->02, rolo 012->01 e 013->02, motoniveladora 010->01 e 011->02,
     cacamba sufixo = codigo-105, cavalo XF530 -> SQS7E01 (que vive em Carretas);
  b) as donas que ele declarou: BX6180/Agrale/Amarok e a maquina fora da frota
     -> Amazonia; Dynapac, rolo chapa, meloza Colorado, espargidor Colorado,
     usina 59, Leeboy, AF5500 e Valtra -> Colorado; usina Ciber -> obra BR-364;
  c) nome identico, quando o MC de 2026 ja usa o nome do ERP com placa.

Etapa que nao esta aqui devolve None e o lancamento inteiro fica na raiz.
"""
import re, unicodedata

# ---------------------------------------------------------------- destinos fora
FORA_AMAZONIA = '<AMAZONIA>'
FORA_COLORADO = '<COLORADO>'
FORA_BR364 = '<BR364>'
FORA_CARRETAS = '<CARRETAS>'

# ---------------------------------------------------------------- tabela
# chave = etapa do MC normalizada (so letras e digitos, maiuscula, sem acento)
ALIAS = {
    # --- escavadeiras 320C: codigo e nome de 2026 -----------------------------
    '0001CATERPILLAR320C': 'Escavadeira 320C - 01',
    '0002CATERPILLAR320C': 'Escavadeira 320C - 02',
    '0003CATERPILLAR320C': 'Escavadeira 320C - 03',
    'ESCAVADEIRACAT320C01PECAS': 'Escavadeira 320C - 01',
    'ESCAVADEIRACAT320C02PECAS': 'Escavadeira 320C - 02',
    'ESCAVADEIRACAT320C03PECAS': 'Escavadeira 320C - 03',
    # --- retroescavadeiras 416E: 06 virou 01 e 07 virou 02 -------------------
    '0006CATERPILLAR416E': 'Retroescavadeira 416E - 01',
    '0007CATERPILLAR416E': 'Retroescavadeira 416E - 02',
    'RETROESCAVADEIRA416E06PECAS': 'Retroescavadeira 416E - 01',
    'RETROESCAVADEIRACATERPILLAR416E07PECAS': 'Retroescavadeira 416E - 02',
    # --- pa carregadeira -----------------------------------------------------
    '0008CATERPILLAR924K': 'Pá Carregadeira 924K - 01',
    'PACARREGADEIRACAT924K08PECAS': 'Pá Carregadeira 924K - 01',
    '0009CASEW20': 'Pá Carregadeira W20 - 02',
    # --- motoniveladoras: 010 virou 01 e 011 virou 02 -----------------------
    '0010CATERPILLAR12H': 'Motoniveladora 12H - 01',
    '0011CATERPILLAR12H': 'Motoniveladora 12H - 02',
    'MOTONIVELADORA12HMN1111PECAS': 'Motoniveladora 12H - 02',
    # --- rolos: 012 virou 01 e 013 virou 02 ---------------------------------
    '0012CATERPILLARCP56': 'Rolo CP56 - 01',
    '0013CATERPILLARCP56': 'Rolo Pé de Carneiro CP56 - 02',
    'ROLOPEDECARNEIROCP5601MANUTENCAOUN': 'Rolo CP56 - 01',
    # --- tratores de esteira ------------------------------------------------
    '0015CATERPILLARD6NXL': 'Trator de Esteira D6NXL - 01',
    '0017CATERPILLARD6G': 'Trator de Esteira D6G - 03',
    # --- bobcat --------------------------------------------------------------
    '0018VOLVOMC110C': 'Bobcat MC110C - 01',
    'BOBCAT18PECAS': 'Bobcat MC110C - 01',
    # --- telescopio ----------------------------------------------------------
    '0019JCB540170': 'Manipulador Telescópio 540-170 - 01',
    # --- caminhoes por codigo ------------------------------------------------
    '0101CAMINHAOPIPA2626': 'Caminhão Pipa 2626 NCP-4846 - 01',
    'CAMINHAOPIPAFORD101PECAS': 'Caminhão Pipa 2626 NCP-4846 - 01',
    '0102CAMINHAOMUCKL131850': 'Caminhão Munck L 1620 MZO-4396 - 01',
    '0103CAMINHAOBETONEIRA2631': 'Caminhão Betoneira MZO-9678 - 01',
    '0105CAMINHAOCAVALO2644S33': 'Caminhão Cavalo 2644 S/33 MZO-2987 - 01',
    'CAMINHAOCAVALO2644S33PECAS': 'Caminhão Cavalo 2644 S/33 MZO-2987 - 01',
    # cacambas: sufixo = codigo - 105
    '0106CAMINHAOCACAMBA2423K36': 'Caminhão Caçamba 2423 K/36 MZO-5897 - 01',
    '0107CAMINHAOCACAMBA2423K36': 'Caminhão Caçamba 2423 K/36 MZO-8547 - 02',
    '0108CAMINHAOCACAMBA2423K36': 'Caminhão Caçamba 2423 K/36 MZO-8F87 - 03',
    '0109CAMINHAOCACAMBA242548': 'Caminhão Caçamba 2425/48 NAB-4679 - 04',
    '0110CAMINHAOCACAMBA242548': 'Caminhão Caçamba 2425/48 NAB-4669 - 05',
    '0111CAMINHAOCACAMBA242548': 'Caminhão Caçamba 2425/48 NAB-4619 - 06',
    'CAMINHAOCACAMBA107PECAS': 'Caminhão Caçamba 2423 K/36 MZO-8547 - 02',
    'CAMINHAOCACAMBA107OLEO': 'Caminhão Caçamba 2423 K/36 MZO-8547 - 02',
    'CAMINHAOCACAMBA108PECAS': 'Caminhão Caçamba 2423 K/36 MZO-8F87 - 03',
    'CAMINHAOCACAMBA108OLEO': 'Caminhão Caçamba 2423 K/36 MZO-8F87 - 03',
    'CAMINHAOCACAMBA109PECAS': 'Caminhão Caçamba 2425/48 NAB-4679 - 04',
    'CAMINHAOCACAMBA110PECAS': 'Caminhão Caçamba 2425/48 NAB-4669 - 05',
    'CAMINHAOCACAMBA111PECAS': 'Caminhão Caçamba 2425/48 NAB-4619 - 06',
    # --- meloza da EMT -------------------------------------------------------
    '0113MELOZA1517': 'Meloza 1517 MZO-3926 - 01',
    # --- boiadeiro -----------------------------------------------------------
    'CAMINHAOBOIADEIROMZO7876MANUTENCAOUN': 'CAMINHÃO BOIADEIRO/MIILHO - L1620',
    # --- carreta -------------------------------------------------------------
    '0115CARGASEMIREBOQUESRGUERRABASCB2D095': 'Carga Semi-Reboque SR/GUERRA BASC B2D095 - 02',
    # --- saveiro -------------------------------------------------------------
    '0201SAVEIROROBUSTSAVEIRORBMBVD': 'Saveiro RBMBVD QWP-6B51 - 02',
    'SAVEIROROBUST201PECAS': 'Saveiro RBMBVD QWP-6B51 - 02',
    # --- oficina -------------------------------------------------------------
    'OFICINAPECAS': 'Oficina',
    'OFICINASERVICOUN': 'Oficina',
    'OFICINASERVICO': 'Oficina',
    'OFICINAADMINISTRATIVO': 'Oficina',
    # --- variantes de nome sem o sufixo numerico do ERP ---------------------
    'TRATORDEESTEIRAD6NXL': 'Trator de Esteira D6NXL - 01',
    'CAMINHAOPIPA2626': 'Caminhão Pipa 2626 NCP-4846 - 01',
    'SAVEIROCSRBMFQWQ2I35MANUTENCAOUN': 'SAVEIRO CS RB MF QWQ2I35 - 09',
    'SAVEIROCSRBMFQWQ2I65MANUTENCAOUN': 'SAVEIRO CS RB MF QWQ2I65 - 08',

    # ================= dono declarado: sai da Manutencao ====================
    # Amazonia Agroindustria
    '0020AGRALEBX6180': FORA_AMAZONIA,
    '0021AGRALEBX6180': FORA_AMAZONIA,
    '0022AGRALEBX6180': FORA_AMAZONIA,
    '0202AMAROKCD4X4HIGH': FORA_AMAZONIA,
    'TRATORDEPNEUGIRICOBX618001MANUTENCAOUN': FORA_AMAZONIA,
    'TRATORDEPNEUGIRICOBX618002MANUTENCAOUN': FORA_AMAZONIA,
    'TRATORDEPNEUGIRICO29905MANUTENCAOUN': FORA_AMAZONIA,
    'TRATORDEPNEUGIRICOWALMET12806MANUTENCAOUN': FORA_AMAZONIA,
    '0026JOHNDEERE6110J': FORA_AMAZONIA,
    '0303HONDABROS160': FORA_AMAZONIA,
    'PLACAVIBRATORIAMPV62MMANUTENCAOUN': FORA_AMAZONIA,
    'COLHEITADEIRAYANMARPECAS': FORA_AMAZONIA,
    # Equipamentos Colorado
    '0027VIBROACABADORACIBERAF5500': FORA_COLORADO,
    '0028VIBROACABADORALEEBOY8816B': FORA_COLORADO,
    'ROLOCHAPACOLORADOMANUTENCAO': FORA_COLORADO,
    'ROLOCHAPAMIRLACOLORADOPECAS': FORA_COLORADO,
    'ROLODYNAPACMANUTENCAOUN': FORA_COLORADO,
    'USINADEASFALTO59PECAS': FORA_COLORADO,
    'MELOZACOLORADOPECAS': FORA_COLORADO,
    'ESPAGEDORCOLORADOPECAS': FORA_COLORADO,
    'CAMINHAOCACAMBACOLORADO32PECAS': FORA_COLORADO,
    'TRATORVALTRABH180COLORADOPECAS': FORA_COLORADO,
    'CAMINHAODEPINTURACOLORADOPECAS': FORA_COLORADO,
    # obra BR-364
    'USINACIBERUACF15POLEO': FORA_BR364,
    'USINACIBERUACF15PPECAS': FORA_BR364,
    # Carretas EMT (o cavalo XF 530 e o SQS7E01, que mora la)
    '0114CAMINHAOCAVALOXF530FTT': FORA_CARRETAS,
}

# etapas do MC que eu deliberadamente NAO mapeio, e por que
ABERTAS = {
    'HILUXAPOIO203PECAS': 'o ERP tem cinco Hilux e nenhuma se chama "Apoio 203"',
    'HILUXDEAPOIOCINZA209PECAS': 'o ERP tem cinco Hilux e nenhuma se chama "209"',
    '0205HILUXJAMES': 'qual das cinco Hilux do ERP e a do James',
    '0207HILUXTIAGO': 'qual das cinco Hilux do ERP e a do Tiago',
    '501MOTORCAMPACTADORDESOLO': 'nao existe no cadastro do ERP',
    '502MOTORCAMPACTADORDESOLO': 'nao existe no cadastro do ERP',
    'CARGASEMIREBOQUEPRANCHA104PECAS': 'o ERP tem tres carretas e nenhuma e prancha 104',
    'SKIDYMANUTENCAOUN': 'nao existe no cadastro e ele nao citou',
    '0304YAMAHAXTZ150CROSSER': 'ele citou a Honda BROS, nao a Yamaha',
    '0305YAMAHA': 'ele citou a Honda BROS, nao a Yamaha',
}

ERP_ETAPAS = """Assoprador
Bobcat MC110C - 01
Bobcat S450 - 02
Caminhão Betoneira MZO-9678 - 01
CAMINHÃO BOIADEIRO/MIILHO - L1620
Caminhão Caçamba 2423 K/36 MZO-5897 - 01
Caminhão Caçamba 2423 K/36 MZO-8547 - 02
Caminhão Caçamba 2423 K/36 MZO-8F87 - 03
Caminhão Caçamba 2425/48 NAB-4619 - 06
Caminhão Caçamba 2425/48 NAB-4669 - 05
Caminhão Caçamba 2425/48 NAB-4679 - 04
Caminhão Cavalo 2644 S/33 MZO-2987 - 01
Caminhão DAF - Nissey CF - 310
Caminhão Espargidor - 01
Caminhão Munck L 1620 MZO-4396 - 01
Caminhão Pipa 2626 NCP-4846 - 01
Caminhão Pipa L1318/50 MZO-4486 - 02
Carga Semi-Reboque SR/GUERRA BASC B2D095 - 02
Carga Semi-Reboque SR/GUERRA BASC B2T093 - 03
Carga Semi-Reboque SRCT3E QLU-2791 - 01
Escavadeira 315CL - 04
Escavadeira 320C - 01
Escavadeira 320C - 02
Escavadeira 320C - 03
Escavadeira EC55BPRO - 06
Escavadeira PC200 - 05
Espargidor QWN-7424
Hilux CDLOWA4SD SQQ-8F87 - 06
Hilux CDSRVA4FD QWQ-1D76 - 05
Hilux CDSRXA4FD QLY-7H84 - 04
Hilux CHLSTM4FD QWQ-3H97 - 01
Hilux SQR1C93 - 07
Laboratório
Manipulador Telescópio 540-170 - 01
Meloza 1517 MZO-3926 - 01
Motoniveladora 12H - 01
Motoniveladora 12H - 02
Oficina
Pá Carregadeira 924K - 01
Pá Carregadeira Komatsu 150
Pá Carregadeira W20 - 02
PALIO - NAF 3863
PLATAFORMA ROLL ON - ROLL OFF 6.50 M - CARROCERIA ABERTA
Pulverizador
Retroescavadeira 416E - 01
Retroescavadeira 416E - 02
Rolo Chapa CB10 - 01
Rolo CP56 - 01
Rolo de Pneu CW34 - 01
Rolo Pé de Carneiro CA260 - 03
Rolo Pé de Carneiro CP56 - 02
SAVEIRO CS RB MF QWQ2I35 - 09
SAVEIRO CS RB MF QWQ2I65 - 08
Saveiro RBMBVD QWP-6B51 - 02
SISTEMA DE TRANSPORTE ROLL-ON/ROLL-OFF BASCULANTE
Tracker QWM-9H99 - 03
Trator Agrale 21
Trator de Esteira D6G - 03
Trator de Esteira D6M - 02
Trator de Esteira D6NXL - 01
Vibro Acabadora AF4500 - 01""".split('\n')


def norm(s):
    s = unicodedata.normalize('NFD', str(s or ''))
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^A-Z0-9]', '', s.upper())


ERP_NORM = {norm(e): e for e in ERP_ETAPAS}
# nada no ALIAS pode apontar para etapa que nao existe no ERP
for _k, _v in ALIAS.items():
    if not _v.startswith('<'):
        assert norm(_v) in ERP_NORM, 'ALIAS aponta para etapa inexistente: %r' % _v


def resolve(etapa_mc):
    """(destino, como) ou (None, motivo). Destino '<X>' sai da Manutencao."""
    if not etapa_mc or etapa_mc.strip() in ('-', ''):
        return None, 'sem etapa no MC'
    u = norm(etapa_mc)
    if u in ALIAS:
        return ALIAS[u], 'tabela'
    if u in ABERTAS:
        return None, ABERTAS[u]
    # nome do ERP identico, tirando os sufixos que o MC agrega
    bruto = etapa_mc.upper()
    limpo = bruto
    for _ in range(4):
        novo = re.sub(r'\s*-\s*(MANUTEN\w*|PE\w?AS|OLE?O|SERVI\w*|UN)\s*$', '', limpo).strip()
        if novo == limpo:
            break
        limpo = novo
        if norm(limpo) in ERP_NORM:
            return ERP_NORM[norm(limpo)], 'nome identico'
    if norm(limpo) in ERP_NORM:
        return ERP_NORM[norm(limpo)], 'nome identico'
    return None, 'sem correspondente'


if __name__ == '__main__':
    import sys
    for linha in sys.stdin:
        e = linha.rstrip('\n')
        if not e:
            continue
        d, c = resolve(e)
        print('%-58s -> %-46s (%s)' % (e[:58], d or '???', c))
