// =====================================================================
// MetaJus — Modelos de documentos da Área de Atendimentos
// Baseados nos modelos em Word da pasta ATENDIMENTOS do Fórum.
// Cada modelo tem: id, grupo, titulo, desc (para que serve), campos e corpo.
//   campos: { id, rot, tipo, ex, obr, ops, se }
//     tipo: texto | nome | cpf | cnpj | rg | processo | telefone | data | hora | opcao | longo | sim | numero
//     se(d): o campo só aparece quando a função devolve true
//   corpo(f, d): devolve os parágrafos (HTML). f('campo') já vem escapado,
//     ou com uma marca amarela [CAMPO] quando ainda não foi preenchido.
// Nada do que é digitado fica guardado (LGPD).
// =====================================================================
(function () {
  'use strict';

  const CIDADE = 'Santa Luzia do Norte/AL';
  const FECHO = 'O referido é verdade. Dou fé.';
  // Atualizado: a Lei 8.666/93 (art. 32) foi revogada; equivalente atual é o art. 70, I, da Lei 14.133/2021.
  const NOTA_VALIDADE = 'Esta certidão só terá validade por 30 (trinta) dias, no seu original, sem rasuras, ressalvado o disposto no art. 70, inciso I, da Lei nº 14.133/2021.';

  // Campos que se repetem
  const NOME = { id: 'nome', rot: 'Nome completo da pessoa', tipo: 'nome', obr: true, ex: 'Ex.: Maria José da Silva' };
  const CPF = { id: 'cpf', rot: 'CPF', tipo: 'cpf', obr: true, ex: '000.000.000-00' };
  const CPF_OPC = { ...CPF, obr: false, rot: 'CPF (se tiver)' };
  const PROC = { id: 'processo', rot: 'Número do processo', tipo: 'processo', obr: true, ex: '0000000-00.0000.8.02.0034' };
  const PROC_OPC = { ...PROC, obr: false, rot: 'Número do processo (se tiver)' };
  const HORA = { id: 'hora', rot: 'Horário', tipo: 'hora', obr: true };

  const MODELOS = [
    // ------------------------------------------------------------ COMPARECIMENTO
    {
      id: 'comp-pessoal', grupo: 'Comparecimento', icone: 'pessoa',
      titulo: 'Comparecimento — assuntos de interesse pessoal',
      desc: 'A pessoa veio ao Fórum resolver algo pessoal e precisa comprovar que esteve aqui (trabalho, escola…).',
      campos: [NOME,
        { id: 'docTipo', rot: 'Documento apresentado', tipo: 'opcao', ops: ['CPF', 'RG'], obr: true },
        { id: 'docNum', rot: 'Número do documento', tipo: 'texto', obr: true, ex: 'Ex.: 000.000.000-00 ou 0000000 SSP/AL' }],
      corpo: (f) => [
        `CERTIFICO, para os devidos fins, que <b>${f('nome')}</b>, portador(a) do ${f('docTipo')} nº ${f('docNum')}, compareceu nesta Comarca de ${CIDADE}, na data de hoje, para tratar de assuntos de seu interesse pessoal. ${FECHO}`
      ]
    },
    {
      id: 'comp-audiencia', grupo: 'Comparecimento', icone: 'balanca',
      titulo: 'Comparecimento em audiência (partes, testemunhas, policiais)',
      desc: 'Para quem participou de audiência, presencial ou pelo Zoom, e precisa justificar a ausência no trabalho.',
      campos: [
        { id: 'qualidade', rot: 'A pessoa é', tipo: 'opcao', ops: ['(não informar)', 'parte', 'testemunha', 'vítima', 'policial', 'advogado(a)', 'acompanhante'], obr: false },
        NOME, CPF_OPC,
        { id: 'modalidade', rot: 'Como participou', tipo: 'opcao', ops: ['presencialmente', 'virtualmente, pelo aplicativo Zoom'], obr: true },
        { ...HORA, rot: 'Horário da audiência' }, PROC],
      corpo: (f, d) => [
        `CERTIFICO, para os devidos fins, que ${d.qualidade && d.qualidade !== '(não informar)' ? 'o(a) ' + f('qualidade') + ' ' : ''}<b>${f('nome')}</b>${d.cpf ? `, inscrito(a) no CPF sob o nº ${f('cpf')},` : ''} compareceu ${f('modalidade')}, às ${f('hora')} horas, a esta Comarca para participar de audiência nos autos do processo nº ${f('processo')}. ${FECHO}`
      ]
    },
    {
      id: 'comp-seeu', grupo: 'Comparecimento', icone: 'relogio',
      titulo: 'Comparecimento SEEU — justificar atividades',
      desc: 'Apresentação periódica de quem cumpre pena/benefício no SEEU. Marque se já saiu intimado(a) da audiência admonitória.',
      campos: [NOME, CPF, { ...PROC, rot: 'Número do processo no SEEU' },
        { id: 'telefone', rot: 'Telefone de contato (opcional)', tipo: 'telefone', obr: false },
        { id: 'endereco', rot: 'Endereço atual (opcional)', tipo: 'texto', obr: false, ex: 'Rua, número, bairro, cidade' },
        { id: 'temAud', rot: 'Foi intimado(a) de audiência admonitória?', tipo: 'sim' },
        { id: 'audData', rot: 'Data da audiência', tipo: 'data', obr: true, se: (d) => d.temAud },
        { id: 'audHora', rot: 'Horário da audiência', tipo: 'hora', obr: true, se: (d) => d.temAud }],
      corpo: (f, d) => [
        `CERTIFICO, para os devidos fins, que <b>${f('nome')}</b>, portador(a) do CPF nº ${f('cpf')}${d.telefone ? `, contato ${f('telefone')}` : ''}${d.endereco ? `, residente em ${f('endereco')}` : ''}, compareceu nesta Comarca de ${CIDADE}, na data de hoje, para justificar suas atividades nos autos do processo nº ${f('processo')} (SEEU).${d.temAud ? ` Na oportunidade, foi intimado(a) da <b>AUDIÊNCIA ADMONITÓRIA</b> designada para o dia ${f('audData')}, às ${f('audHora')} horas.` : ''} ${FECHO}`
      ]
    },
    {
      id: 'comp-endereco', grupo: 'Comparecimento', icone: 'casa',
      titulo: 'Atualização de endereço (SEEU)',
      desc: 'A pessoa veio atualizar endereço e telefone no processo de execução.',
      campos: [{ ...PROC, rot: 'Número do processo no SEEU' }, NOME, CPF,
        { id: 'endereco', rot: 'Novo endereço', tipo: 'texto', obr: true, ex: 'Rua, número, condomínio, bairro, cidade' },
        { id: 'telefone', rot: 'Novo telefone', tipo: 'telefone', obr: false },
        { id: 'h1', rot: 'Chegou às', tipo: 'hora', obr: false }, { id: 'h2', rot: 'Saiu às', tipo: 'hora', obr: false }],
      tituloDoc: (f) => `CERTIDÃO — PROCESSO Nº ${f('processo')}`,
      corpo: (f, d) => [
        `CERTIFICO, para os devidos fins, que, na presente data${d.h1 && d.h2 ? `, no horário compreendido entre ${f('h1')} e ${f('h2')} horas` : ''}, o(a) Sr(a). <b>${f('nome')}</b>, inscrito(a) no CPF sob o nº ${f('cpf')}, esteve à disposição deste Juízo com a finalidade de atualizar seus dados cadastrais: endereço ${f('endereco')}${d.telefone ? `; contato ${f('telefone')}` : ''}. ${FECHO}`
      ]
    },
    {
      id: 'comp-cautelares', grupo: 'Comparecimento', icone: 'check',
      titulo: 'Comparecimento — medidas cautelares',
      desc: 'Comprovação do comparecimento periódico imposto como medida cautelar.',
      campos: [NOME, CPF, PROC],
      corpo: (f) => [
        `CERTIFICO, para os devidos fins, que <b>${f('nome')}</b>, portador(a) do CPF nº ${f('cpf')}, compareceu nesta Comarca de ${CIDADE}, na data de hoje, para comprovar o comparecimento referente às medidas cautelares impostas nos autos do processo nº ${f('processo')}. ${FECHO}`
      ]
    },
    {
      id: 'comp-jurado', grupo: 'Comparecimento', icone: 'balanca',
      titulo: 'Comparecimento de jurado (Tribunal do Júri)',
      desc: 'Jurado(a) convocado(a) para sessão do Júri. Marque se a sessão foi cancelada e redesignada.',
      campos: [NOME, CPF, PROC_OPC,
        { id: 'cancelada', rot: 'A sessão foi cancelada e redesignada?', tipo: 'sim' },
        { id: 'novaData', rot: 'Nova data da sessão', tipo: 'data', obr: true, se: (d) => d.cancelada },
        { id: 'novaHora', rot: 'Horário da nova sessão', tipo: 'hora', obr: true, se: (d) => d.cancelada }],
      corpo: (f, d) => [
        `CERTIFICO, para os devidos fins, que <b>${f('nome')}</b>, portador(a) do CPF nº ${f('cpf')}, compareceu nesta Comarca de ${CIDADE}, na data de hoje, para participar como jurado(a) da Sessão Ordinária do Tribunal do Júri${d.processo ? ` (processo nº ${f('processo')})` : ''}.${d.cancelada ? ` A sessão foi <b>CANCELADA</b> e, ato contínuo, o(a) jurado(a) ficou intimado(a) da <b>REDESIGNAÇÃO</b> para o dia ${f('novaData')}, às ${f('novaHora')} horas.` : ''} ${FECHO}`
      ]
    },
    {
      id: 'comp-estudante', grupo: 'Comparecimento', icone: 'pessoa',
      titulo: 'Comparecimento de estudante (assistir audiência)',
      desc: 'Estudante de Direito que assistiu audiência ou sessão do Júri (horas complementares).',
      campos: [NOME, CPF,
        { id: 'curso', rot: 'Curso', tipo: 'texto', obr: true, ex: 'Direito' },
        { id: 'ato', rot: 'O que assistiu', tipo: 'texto', obr: true, ex: 'Ex.: Sessão de Julgamento do Tribunal do Júri' }, PROC_OPC],
      valores: { curso: 'Direito' },
      corpo: (f, d) => [
        `CERTIFICO, para os devidos fins, que <b>${f('nome')}</b>, portador(a) do CPF nº ${f('cpf')}, estudante do curso de ${f('curso')}, compareceu nesta Comarca de ${CIDADE}, na data de hoje, para assistir ao seguinte ato: ${f('ato')}${d.processo ? ` (processo nº ${f('processo')})` : ''}. ${FECHO}`
      ]
    },
    {
      id: 'comp-autoridade', grupo: 'Comparecimento', icone: 'balanca',
      titulo: 'Comparecimento de juiz(a), promotor(a) ou defensor(a)',
      desc: 'Dias em que a autoridade esteve no Fórum (inclui plantão).',
      campos: [
        { id: 'trat', rot: 'Tratamento', tipo: 'opcao', ops: ['Dr.', 'Dra.'], obr: true },
        { ...NOME, rot: 'Nome da autoridade' },
        { id: 'cargo', rot: 'Cargo', tipo: 'opcao', ops: ['Juiz de Direito', 'Juíza de Direito', 'Promotor de Justiça', 'Promotora de Justiça', 'Defensor Público', 'Defensora Pública'], obr: true },
        { id: 'dias', rot: 'Dia(s)', tipo: 'texto', obr: true, ex: 'Ex.: 05/12, 12/12 e 19/12/2026' },
        { id: 'finalidade', rot: 'Finalidade (opcional)', tipo: 'texto', obr: false, ex: 'Ex.: participar do plantão regional da 1ª Circunscrição' }],
      corpo: (f, d) => [
        `CERTIFICO, para os devidos fins, que ${f('trat')} <b>${f('nome')}</b>, ${f('cargo')}, compareceu a este Fórum da Comarca de ${CIDADE}${d.finalidade ? `, para ${f('finalidade')},` : ''} ${/,| e /.test(d.dias || '') ? 'nos dias' : 'no dia'} ${f('dias')}. ${FECHO}`
      ]
    },

    // ------------------------------------------------------------ PROCESSOS
    {
      id: 'andamento', grupo: 'Processos', icone: 'lista',
      titulo: 'Certidão de andamento processual (INSS e outros fins)',
      desc: 'Informa que o processo tramita aqui e em que situação está. Muito pedida para INSS e benefícios.',
      campos: [
        { id: 'acao', rot: 'Tipo de ação', tipo: 'texto', obr: true, ex: 'Ex.: Ação de Curatela com Pedido de Tutela de Urgência' }, PROC,
        { ...NOME, id: 'requerente', rot: 'Nome do(a) requerente' },
        { id: 'reqCpf', rot: 'CPF do(a) requerente', tipo: 'cpf', obr: true },
        { id: 'reqRg', rot: 'RG do(a) requerente (opcional)', tipo: 'rg', obr: false },
        { id: 'temBen', rot: 'Tem beneficiário (curatelado, menor…)?', tipo: 'sim' },
        { id: 'beneficiario', rot: 'Nome do(a) beneficiário(a)', tipo: 'nome', obr: true, se: (d) => d.temBen },
        { id: 'benCpf', rot: 'CPF do(a) beneficiário(a)', tipo: 'cpf', obr: false, se: (d) => d.temBen },
        { id: 'situacao', rot: 'Situação do processo', tipo: 'opcao', ops: ['em ANDAMENTO', 'SUSPENSO', 'ARQUIVADO', 'CONCLUSO para decisão', 'CONCLUSO para sentença'], obr: true },
        { id: 'subscritor', rot: 'Quem subscreve e assina (se não for você)', tipo: 'nome', obr: false, ex: 'Deixe vazio se você mesmo assina' },
        { id: 'subCargo', rot: 'Cargo de quem subscreve', tipo: 'opcao', ops: ['Chefe de Secretaria', 'Analista Judiciário', 'Técnico Judiciário'], obr: false, se: (d) => d.subscritor }],
      validade: true,
      assinaturas: (d, a) => d.subscritor ? [{ nome: d.subscritor, cargo: d.subCargo || 'Chefe de Secretaria' }] : [a],
      corpo: (f, d, a) => [
        `CERTIFICO e dou fé que tramita no Cartório da Vara Única desta Comarca de ${CIDADE} a ação de <b>${f('acao')}</b>, registrada no Sistema de Automação do Judiciário (SAJ) sob o nº ${f('processo')}, movida por <b>${f('requerente')}</b>${d.reqRg ? `, portador(a) do RG nº ${f('reqRg')}` : ''} e inscrito(a) no CPF sob o nº ${f('reqCpf')}${d.temBen ? `, e que tem como beneficiário(a) <b>${f('beneficiario')}</b>${d.benCpf ? `, inscrito(a) no CPF sob o nº ${f('benCpf')}` : ''}` : ''}.`,
        `CERTIFICO, ainda, que o citado processo encontra-se <b>${f('situacao')}</b>. ${FECHO}`,
        d.subscritor ? `Eu, ${esc(a.nome)}, ${esc(a.cargo)}, digitei. E eu, ${f('subscritor')}, ${esc(d.subCargo || 'Chefe de Secretaria')}, subscrevo e assino.` : ''
      ]
    },
    {
      id: 'negativa-criminal', grupo: 'Processos', icone: 'check',
      titulo: 'Certidão negativa — ações criminais e cíveis (pessoa física)',
      desc: 'Nada consta em nome da pessoa nesta unidade (Resolução CNJ nº 121/2010). Confira no SAJ antes de emitir.',
      campos: [NOME, { id: 'mae', rot: 'Nome da mãe', tipo: 'nome', obr: true }, { id: 'nasc', rot: 'Data de nascimento', tipo: 'data', obr: true }, CPF],
      validade: true,
      tituloDoc: () => 'CERTIDÃO NEGATIVA',
      subtitulo: 'Certidão regional para fins gerais · Ações criminais e cíveis — pessoa física',
      corpo: (f) => [
        `Nos termos da Resolução nº 121, de 05 de outubro de 2010, do Conselho Nacional de Justiça — CNJ, CERTIFICAMOS que, em nome de <b>${f('nome')}</b>, filho(a) de ${f('mae')}, nascido(a) em ${f('nasc')}, inscrito(a) no CPF sob o nº ${f('cpf')}:`,
        `<span class="destaque-doc">NADA CONSTA</span> nos registros de distribuição referentes a AÇÕES CRIMINAIS E CÍVEIS com condenação transitada em julgado, nem de EXECUÇÕES PENAIS definitivas, nesta unidade judiciária do Tribunal de Justiça do Estado de Alagoas.`
      ]
    },
    {
      id: 'negativa-falencia', grupo: 'Processos', icone: 'check',
      titulo: 'Certidão negativa de falência (empresa)',
      desc: 'Nada consta de pedido de falência em nome da empresa nesta unidade.',
      campos: [{ id: 'razao', rot: 'Razão social da empresa', tipo: 'texto', obr: true }, { id: 'cnpj', rot: 'CNPJ', tipo: 'cnpj', obr: true }],
      validade: true,
      tituloDoc: () => 'CERTIDÃO NEGATIVA',
      corpo: (f) => [
        `Nos termos da Resolução nº 121, de 05 de outubro de 2010, do Conselho Nacional de Justiça — CNJ, CERTIFICAMOS que, em nome da empresa <b>${f('razao')}</b>, inscrita no CNPJ sob o nº ${f('cnpj')}:`,
        `<span class="destaque-doc">NADA CONSTA</span> nos registros de distribuição referentes a AÇÕES DE PEDIDO DE FALÊNCIA nesta unidade judiciária do Tribunal de Justiça do Estado de Alagoas.`
      ]
    },
    {
      id: 'pratica-advocaticia', grupo: 'Processos', icone: 'balanca',
      titulo: 'Certidão de prática advocatícia',
      desc: 'Atesta que o(a) advogado(a) atua no processo, desde quando e em favor de quem.',
      campos: [
        { id: 'flsPet', rot: 'Folhas da petição que pediu a certidão', tipo: 'texto', obr: false, ex: 'Ex.: 57/58' },
        { ...NOME, id: 'adv', rot: 'Nome do(a) advogado(a)' },
        { id: 'oab', rot: 'Número da OAB/AL', tipo: 'texto', obr: true, ex: 'Ex.: 19.292' },
        { id: 'classe', rot: 'Classe do processo', tipo: 'texto', obr: true, ex: 'Ex.: Guarda de Infância e Juventude' }, PROC,
        { id: 'requerente', rot: 'Parte requerente', tipo: 'texto', obr: true },
        { id: 'requerido', rot: 'Parte requerida', tipo: 'texto', obr: true },
        { id: 'polo', rot: 'Atua em favor da parte', tipo: 'opcao', ops: ['requerente', 'requerida'], obr: true },
        { id: 'flsProc', rot: 'Folhas da procuração', tipo: 'texto', obr: false, ex: 'Ex.: 53/54' },
        { id: 'inicio', rot: 'Data inicial da representação', tipo: 'data', obr: true },
        { id: 'situacao', rot: 'Situação atual do processo', tipo: 'texto', obr: false, ex: 'Ex.: concluso para Decisão Interlocutória' }],
      tituloDoc: () => 'CERTIDÃO DE PRÁTICA ADVOCATÍCIA',
      corpo: (f, d) => [
        `${d.flsPet ? `Em virtude da petição de fls. ${f('flsPet')}, certifico` : 'CERTIFICO'}, para os devidos fins, que o(a) advogado(a) <b>${f('adv')}</b>, inscrito(a) na Ordem dos Advogados do Brasil — Seccional Alagoas sob o nº ${f('oab')}, conforme consulta ao Sistema de Automação do Judiciário (SAJ), atua neste Juízo no processo de ${f('classe')} nº ${f('processo')}, que tem como parte requerente ${f('requerente')} e como parte requerida ${f('requerido')}.`,
        `O(A) advogado(a) atua em favor da parte ${f('polo')}${d.flsProc ? `, com procuração às fls. ${f('flsProc')}` : ''}, desde ${f('inicio')}, estando atuando até a presente data.${d.situacao ? ` CERTIFICO, ainda, que o referido processo encontra-se ${f('situacao')}.` : ''} ${FECHO}`
      ]
    },
    {
      id: 'carta-precatoria', grupo: 'Processos', icone: 'enviar',
      titulo: 'Envio de carta precatória (com kit de DNA, se houver)',
      desc: 'Registra a expedição da carta precatória ao juízo deprecado e, se for o caso, o envio do kit de DNA pelos Correios.',
      campos: [
        { id: 'fls', rot: 'Folhas do despacho', tipo: 'texto', obr: true, ex: 'Ex.: 57/59' },
        { id: 'sistema', rot: 'Enviada por', tipo: 'opcao', ops: ['sistema PJe', 'Malote Digital', 'e-mail institucional'], obr: true },
        { id: 'juizo', rot: 'Juízo deprecado (comarca/UF)', tipo: 'texto', obr: true, ex: 'Ex.: Comarca de São José do Ribamar - MA' },
        { id: 'kit', rot: 'Foi enviado kit de coleta de DNA pelos Correios?', tipo: 'sim' }],
      corpo: (f, d) => [
        `CERTIFICO que, nesta data, em cumprimento ao despacho de fls. ${f('fls')}, procedi à expedição e ao encaminhamento da CARTA PRECATÓRIA, via ${f('sistema')}, ao Juízo Deprecado da ${f('juizo')}, visando ao devido cumprimento do ato deprecado.`,
        d.kit ? 'CERTIFICO, ainda, que, em complemento à solicitação, foi encaminhado pelos Correios o kit para coleta de DNA, ficando consignado que o material genético poderá ser colhido tanto por meio de swab (bucal) quanto por coletor sanguíneo, conforme disponibilidade e critérios técnicos do laboratório ou profissional responsável no juízo destinatário.' : '',
        FECHO
      ]
    },

    // ------------------------------------------------------------ SERVIDORES E SERVIÇOS
    {
      id: 'vinculo', grupo: 'Servidores e serviços', icone: 'pessoa',
      titulo: 'Certidão de vínculo funcional',
      desc: 'Comprova que a pessoa é servidor(a) ativo(a) lotado(a) nesta unidade.',
      campos: [{ ...NOME, rot: 'Nome do(a) servidor(a)' }, { id: 'matricula', rot: 'Matrícula', tipo: 'texto', obr: true }, CPF,
        { id: 'cargo', rot: 'Cargo', tipo: 'texto', obr: true, ex: 'Ex.: Analista Judiciário' },
        { id: 'email', rot: 'E-mail institucional (opcional)', tipo: 'texto', obr: false },
        { id: 'telefone', rot: 'Telefone (opcional)', tipo: 'telefone', obr: false }],
      tituloDoc: () => 'CERTIDÃO DE VÍNCULO FUNCIONAL',
      corpo: (f, d) => [
        'O TRIBUNAL DE JUSTIÇA DO ESTADO DE ALAGOAS, por meio desta unidade judiciária, no uso de suas atribuições legais, CERTIFICA, para os devidos fins de direito, que:',
        `<span class="lista-doc">Nome: <b>${f('nome')}</b><br>Matrícula: ${f('matricula')}<br>CPF: ${f('cpf')}<br>Cargo: ${f('cargo')}${d.email ? `<br>E-mail institucional: ${f('email')}` : ''}${d.telefone ? `<br>Telefone: ${f('telefone')}` : ''}</span>`,
        `é servidor(a) público(a) ativo(a) do quadro de pessoal deste Poder Judiciário, atualmente lotado(a) na Vara do Único Ofício de ${CIDADE}.`,
        'A presente certidão é expressão da verdade e destina-se a comprovar o vínculo funcional do(a) referido(a) servidor(a) para os fins que se fizerem necessários.'
      ]
    },
    {
      id: 'ponto', grupo: 'Servidores e serviços', icone: 'relogio',
      titulo: 'Certidão de ponto (esqueceu de registrar)',
      desc: 'O(a) servidor(a) trabalhou normalmente, mas não registrou o ponto.',
      campos: [{ ...NOME, rot: 'Nome do(a) servidor(a)' }, { id: 'matricula', rot: 'Matrícula', tipo: 'texto', obr: true },
        { id: 'data', rot: 'Dia sem registro', tipo: 'data', obr: true },
        { id: 'motivo', rot: 'Motivo', tipo: 'opcao', ops: ['deixou de registrar o ponto', 'não conseguiu registrar o ponto por falha no sistema'], obr: true }],
      corpo: (f) => [
        `CERTIFICO, para os devidos fins, que <b>${f('nome')}</b>, matrícula ${f('matricula')}, ${f('motivo')} no dia ${f('data')}, mas desenvolveu normalmente suas funções nesta unidade judiciária na referida data. ${FECHO}`
      ]
    },
    {
      id: 'servico', grupo: 'Servidores e serviços', icone: 'check',
      titulo: 'Prestação de serviços (empresas, DIAT, manutenção)',
      desc: 'Equipe técnica ou empresa esteve no Fórum fazendo um serviço (ar-condicionado, computadores…).',
      campos: [
        { id: 'equipe', rot: 'Empresa ou equipe', tipo: 'texto', obr: true, ex: 'Ex.: equipe do DIAT / empresa GOTHERM' },
        { id: 'pessoas', rot: 'Pessoas (nome e CPF ou matrícula)', tipo: 'longo', obr: true, ex: 'Ex.: Fulano de Tal, CPF 000.000.000-00; Beltrano, matrícula 1234' },
        { id: 'servico', rot: 'Serviço realizado', tipo: 'texto', obr: true, ex: 'Ex.: substituição de 02 (dois) aparelhos de ar-condicionado' },
        { id: 'determ', rot: 'Conforme determinado pelo TJ/AL?', tipo: 'sim' }],
      corpo: (f, d) => [
        `CERTIFICO, para os devidos fins, que, na presente data, compareceram a esta Comarca de ${CIDADE}, pela ${f('equipe')}, os(as) Srs(as). ${f('pessoas')}, para realização do seguinte serviço: ${f('servico')}${d.determ ? ', conforme determinado pelo Tribunal de Justiça do Estado de Alagoas' : ''}. ${FECHO}`
      ]
    },
    {
      id: 'equipamento', grupo: 'Servidores e serviços', icone: 'setas',
      titulo: 'Recebimento ou devolução de equipamento',
      desc: 'Registra a entrega de um bem patrimoniado (com tombo). Sai com duas assinaturas.',
      campos: [
        { ...NOME, id: 'recebedor', rot: 'Quem recebeu' },
        { id: 'matricula', rot: 'Matrícula de quem recebeu (opcional)', tipo: 'texto', obr: false },
        { id: 'equipamento', rot: 'Equipamento', tipo: 'texto', obr: true, ex: 'Ex.: cafeteira, monitor, notebook' },
        { id: 'tombo', rot: 'Número do tombo', tipo: 'texto', obr: true },
        { id: 'deQuem', rot: 'Recebido de', tipo: 'texto', obr: true, ex: 'Ex.: Chefia de Secretaria desta Comarca' }],
      valores: { deQuem: 'Chefia de Secretaria desta Comarca' },
      assinaturas: (d, a) => [a, { nome: d.recebedor || '', cargo: d.matricula ? 'Matrícula ' + d.matricula : 'Recebedor(a)' }],
      corpo: (f) => [
        `CERTIFICO, para os devidos fins, que <b>${f('recebedor')}</b> recebeu da ${f('deQuem')} o seguinte bem: ${f('equipamento')}, tombo nº ${f('tombo')}, nesta unidade judiciária, na presente data. ${FECHO}`
      ]
    },

    // ------------------------------------------------------------ OFÍCIOS E TERMOS
    {
      id: 'oficio-fia', grupo: 'Ofícios e termos', icone: 'enviar', tipoDoc: 'oficio',
      titulo: 'Ofício — Fundo da Infância e Adolescência (FIA)',
      desc: 'Pede à prefeitura informações sobre valores e destinação do FIA.',
      campos: [
        { id: 'numero', rot: 'Número do ofício', tipo: 'texto', obr: true, ex: 'Ex.: 134/2026' },
        { id: 'destino', rot: 'Destinatário', tipo: 'texto', obr: true },
        { id: 'magistrado', rot: 'De ordem de', tipo: 'opcao', ops: ['MM. Juíza de Direito', 'MM. Juiz de Direito'], obr: true },
        { id: 'prazo', rot: 'Prazo para resposta (dias)', tipo: 'numero', obr: true }],
      valores: { destino: 'Excelentíssimo(a) Senhor(a) Prefeito(a) do Município de Santa Luzia do Norte/AL', prazo: '05' },
      assunto: 'Fundo para a Infância e Adolescência — FIA',
      vocativo: 'Excelentíssimo(a) Senhor(a) Prefeito(a),',
      corpo: (f) => [
        `De ordem da ${f('magistrado')} da Comarca de ${CIDADE}, cumprimentando-o(a) cordialmente, sirvo-me do presente para requerer a Vossa Excelência que informe a este Juízo, no prazo de ${f('prazo')} dias:`,
        'a) as boas práticas locais implementadas nesta comarca voltadas à primeira infância;<br>b) os valores e a destinação das verbas do Fundo para a Infância e Adolescência (FIA) nos últimos 02 (dois) anos.',
        'Sem mais para o momento, aproveito o ensejo para externar votos de estima e consideração.'
      ]
    },
    {
      id: 'oficio-juri', grupo: 'Ofícios e termos', icone: 'enviar', tipoDoc: 'oficio',
      titulo: 'Ofício — lista de servidores para sorteio do Júri',
      desc: 'Pede às prefeituras a relação de servidores efetivos para o alistamento/sorteio de jurados.',
      campos: [
        { id: 'numero', rot: 'Número do ofício', tipo: 'texto', obr: true, ex: 'Ex.: 163/2026' },
        { id: 'municipio', rot: 'Município', tipo: 'opcao', ops: ['Santa Luzia do Norte/AL', 'Coqueiro Seco/AL', 'Satuba/AL'], obr: true },
        { id: 'magistrado', rot: 'De ordem de', tipo: 'opcao', ops: ['MM. Juíza de Direito', 'MM. Juiz de Direito'], obr: true },
        { id: 'ano', rot: 'Ano das sessões do Júri', tipo: 'numero', obr: true }],
      valores: () => ({ ano: String(new Date().getFullYear() + 1) }),
      destinoTxt: (f) => `Ao(À) Senhor(a) Secretário(a) de Administração do Município de ${f('municipio')}`,
      assunto: 'Solicitação de informações',
      vocativo: 'Senhor(a) Secretário(a),',
      corpo: (f) => [
        `De ordem da ${f('magistrado')} desta Comarca de ${CIDADE}, cumprimentando-o(a) cordialmente, sirvo-me do presente para requerer a Vossa Senhoria que informe a relação dos servidores efetivos do município, para fins do sorteio referente às sessões do Tribunal do Júri que ocorrerão no ano de ${f('ano')}.`,
        'Sem mais para o momento, aproveito o ensejo para externar votos de estima e consideração.'
      ]
    },
    {
      id: 'oficio-livre', grupo: 'Ofícios e termos', icone: 'enviar', tipoDoc: 'oficio',
      titulo: 'Ofício (texto livre)',
      desc: 'Ofício com número, destinatário e assunto já formatados. Você escreve o texto.',
      campos: [
        { id: 'numero', rot: 'Número do ofício', tipo: 'texto', obr: true },
        { id: 'destino', rot: 'Destinatário', tipo: 'texto', obr: true, ex: 'Ex.: Ao(À) Senhor(a) Delegado(a) de Polícia de …' },
        { id: 'assunto', rot: 'Assunto', tipo: 'texto', obr: true },
        { id: 'vocativo', rot: 'Vocativo', tipo: 'texto', obr: false, ex: 'Ex.: Senhor(a) Delegado(a),' },
        { id: 'texto', rot: 'Texto do ofício', tipo: 'longo', obr: true }],
      corpo: (f) => [f('texto'), 'Sem mais para o momento, aproveito o ensejo para externar votos de estima e consideração.']
    },
    {
      id: 'termo-menor', grupo: 'Ofícios e termos', icone: 'pessoa',
      titulo: 'Termo de entrega de menor',
      desc: 'Entrega da guarda de criança/adolescente a outra pessoa. Sai com 4 assinaturas (partes e 2 testemunhas).',
      campos: [
        { id: 'secE', rot: 'Quem entrega', tipo: 'secao' },
        { ...NOME, id: 'eNome', rot: 'Nome de quem entrega' }, { id: 'eQualif', rot: 'Nacionalidade, estado civil e profissão', tipo: 'texto', obr: false, ex: 'Ex.: brasileira, solteira, doméstica' },
        { id: 'eRg', rot: 'RG', tipo: 'rg', obr: false }, { ...CPF, id: 'eCpf' },
        { id: 'eEnd', rot: 'Endereço', tipo: 'texto', obr: true }, { id: 'eTel', rot: 'Telefone', tipo: 'telefone', obr: false },
        { id: 'eRel', rot: 'Relação com o(a) menor', tipo: 'texto', obr: true, ex: 'Ex.: mãe' },
        { id: 'secM', rot: 'Criança/adolescente', tipo: 'secao' },
        { ...NOME, id: 'mNome', rot: 'Nome do(a) menor' }, { id: 'mNasc', rot: 'Data de nascimento', tipo: 'data', obr: true },
        { id: 'mPais', rot: 'Filho(a) de', tipo: 'texto', obr: true, ex: 'Nome do pai e da mãe' },
        { id: 'mCpf', rot: 'CPF do(a) menor (se tiver)', tipo: 'cpf', obr: false },
        { id: 'secR', rot: 'Quem recebe', tipo: 'secao' },
        { ...NOME, id: 'rNome', rot: 'Nome de quem recebe' }, { id: 'rQualif', rot: 'Nacionalidade, estado civil e profissão', tipo: 'texto', obr: false },
        { id: 'rRg', rot: 'RG', tipo: 'rg', obr: false }, { ...CPF, id: 'rCpf' },
        { id: 'rEnd', rot: 'Endereço', tipo: 'texto', obr: true }, { id: 'rTel', rot: 'Telefone', tipo: 'telefone', obr: false },
        { id: 'rRel', rot: 'Relação com o(a) menor', tipo: 'texto', obr: true, ex: 'Ex.: avó materna' },
        { id: 'periodo', rot: 'Por quanto tempo', tipo: 'texto', obr: true, ex: 'Ex.: por tempo indeterminado' }],
      valores: { periodo: 'por tempo indeterminado' },
      tituloDoc: () => 'TERMO DE ENTREGA DE MENOR',
      assinaturas: (d) => [
        { nome: d.eNome || '', cargo: 'Entregador(a)' }, { nome: d.rNome || '', cargo: 'Recebedor(a)' },
        { nome: '', cargo: 'Testemunha 1' }, { nome: '', cargo: 'Testemunha 2' }],
      semDataAntesAssinatura: false,
      corpo: (f, d) => {
        const pessoa = (p) => `<b>${f(p + 'Nome')}</b>${d[p + 'Qualif'] ? ', ' + f(p + 'Qualif') : ''}${d[p + 'Rg'] ? `, portador(a) do RG nº ${f(p + 'Rg')}` : ''}, inscrito(a) no CPF sob o nº ${f(p + 'Cpf')}, residente e domiciliado(a) em ${f(p + 'End')}${d[p + 'Tel'] ? `, telefone ${f(p + 'Tel')}` : ''}, na qualidade de ${f(p + 'Rel')} do(a) menor`;
        return [
          `Eu, ${pessoa('e')}, doravante denominado(a) ENTREGADOR(A), DECLARO, para os devidos fins, que entrego o(a) menor <b>${f('mNome')}</b>, nascido(a) em ${f('mNasc')}, filho(a) de ${f('mPais')}${d.mCpf ? `, inscrito(a) no CPF sob o nº ${f('mCpf')}` : ''}, a ${pessoa('r')}, doravante denominado(a) RECEBEDOR(A), para que exerça a guarda e a responsabilidade sobre o(a) MENOR, a partir desta data, ${f('periodo')}, mediante as seguintes condições:`,
          '1. O(A) RECEBEDOR(A) se compromete a zelar pelo bem-estar físico e emocional do(a) MENOR, garantindo-lhe acesso à educação, saúde, lazer e demais direitos previstos no Estatuto da Criança e do Adolescente (ECA).<br>' +
          '2. O(A) RECEBEDOR(A) se compromete a informar o(a) ENTREGADOR(A) sobre qualquer ocorrência relevante relacionada ao(à) MENOR, bem como a manter contato regular para atualização sobre seu desenvolvimento.<br>' +
          '3. O(A) RECEBEDOR(A) se compromete a respeitar e preservar os laços afetivos do(a) MENOR com o(a) ENTREGADOR(A) e demais familiares, facilitando o contato e a convivência, sempre que possível e no melhor interesse do(a) MENOR.<br>' +
          '4. O(A) ENTREGADOR(A) se compromete a auxiliar o(a) RECEBEDOR(A) no que for necessário para o bom desenvolvimento do(a) MENOR, dentro de suas possibilidades.<br>' +
          '5. Este termo poderá ser revogado a qualquer momento, mediante acordo entre as partes ou por decisão judicial, sempre com o objetivo de garantir o melhor interesse do(a) MENOR.',
          'E, por estarem assim justos e acordados, assinam o presente termo em 2 (duas) vias de igual teor e forma, na presença de 2 (duas) testemunhas.'
        ];
      }
    },
    {
      id: 'certidao-livre', grupo: 'Ofícios e termos', icone: 'lista',
      titulo: 'Certidão em branco (texto livre)',
      desc: 'Para algum caso que não está na lista. Sai na folha oficial, com data e sua assinatura.',
      campos: [
        { id: 'tituloLivre', rot: 'Título', tipo: 'texto', obr: true },
        { id: 'texto', rot: 'Texto da certidão', tipo: 'longo', obr: true, ex: 'CERTIFICO, para os devidos fins, que …' },
        { id: 'comValidade', rot: 'Incluir aviso de validade de 30 dias?', tipo: 'sim' }],
      valores: { tituloLivre: 'CERTIDÃO' },
      tituloDoc: (f) => f('tituloLivre'),
      validadeSe: (d) => d.comValidade,
      corpo: (f) => [f('texto')]
    }
  ];

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  window.MODELOS = MODELOS;
  window.MODELOS_INFO = { CIDADE, FECHO, NOTA_VALIDADE, GRUPOS: ['Comparecimento', 'Processos', 'Servidores e serviços', 'Ofícios e termos'] };
})();
