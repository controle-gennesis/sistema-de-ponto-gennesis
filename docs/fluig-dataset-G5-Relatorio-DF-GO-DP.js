/**
 * Dataset: G5-Relatorio-DF-GO-DP
 * Cole este arquivo no Fluig (código do dataset customizado).
 *
 * Mudanças vs versão anterior:
 * - Lookup AppDS com fallback java:/jdbc/AppDS
 * - Join da tabela principal na versão ativa (MAX version)
 * - Filtro DP mais amplo (DP, DP DF, Departamento Pessoal, etc.)
 * - Se a SQL falhar, devolve 1 linha com a coluna ERRO (aparece no Testar)
 */
function createDataset(fields, constraints, sortFields) {
  var newDataset = DatasetBuilder.newDataset();
  var ic = new javax.naming.InitialContext();
  var ds = null;
  var conn = null;
  var stmt = null;
  var rs = null;

  try {
    try {
      ds = ic.lookup("/jdbc/AppDS");
    } catch (e1) {
      ds = ic.lookup("java:/jdbc/AppDS");
    }

    var myQuery = "";
    myQuery += " SELECT ";
    myQuery += "    MAX(PROCES_WORKFLOW.COD_EMPRESA) AS COD_EMPRESA, ";
    myQuery += "    PROCES_WORKFLOW.NUM_PROCES, ";
    myQuery += "    MAX(PROCES_WORKFLOW.START_DATE) AS START_DATE, ";
    myQuery += "    MAX(PROCES_WORKFLOW.STATUS) AS STATUS, ";
    myQuery += "    MAX(HISTOR_PROCES.NUM_SEQ_ESTADO) AS NUM_SEQ_ESTADO, ";
    myQuery += "    MAX(rateio.coluna_natureza) AS natureza, ";
    myQuery += "    MAX(vencimento.data_pagamento_av) AS data_pagamento, ";
    myQuery += "    MAX(TabelaPrincipalG5.data_vencimento) AS data_vencimento, ";
    myQuery += "    MAX(CASE ";
    myQuery += "      WHEN UltimoMovimento.NUM_SEQ_ESTADO = 216 THEN 'Tratamento de Erro' ";
    myQuery += "      WHEN UltimoMovimento.NUM_SEQ_ESTADO = 295 THEN 'Tratamento de Erro' ";
    myQuery += "      WHEN UltimoMovimento.NUM_SEQ_ESTADO = 221 THEN 'Tratativa de Erro' ";
    myQuery += "      WHEN UltimoMovimento.NUM_SEQ_ESTADO = 7 THEN 'Aprovação Gestor' ";
    myQuery += "      WHEN UltimoMovimento.NUM_SEQ_ESTADO = 382 THEN 'Aprovação Controladoria' ";
    myQuery += "      WHEN UltimoMovimento.NUM_SEQ_ESTADO = 12 THEN 'Aprovação Diretoria' ";
    myQuery += "      WHEN UltimoMovimento.NUM_SEQ_ESTADO = 368 THEN 'Solicitação em análise' ";
    myQuery += "      WHEN UltimoMovimento.NUM_SEQ_ESTADO = 274 THEN 'Cadastro de Fornecedor' ";
    myQuery += "      WHEN UltimoMovimento.NUM_SEQ_ESTADO = 14 THEN 'Provisionamento' ";
    myQuery += "      WHEN UltimoMovimento.NUM_SEQ_ESTADO = 97 THEN 'Provisionado' ";
    myQuery += "      WHEN UltimoMovimento.NUM_SEQ_ESTADO = 127 THEN 'Pagamento' ";
    myQuery += "      WHEN UltimoMovimento.NUM_SEQ_ESTADO = 128 THEN 'Aguardando Vencimento' ";
    myQuery += "      WHEN UltimoMovimento.NUM_SEQ_ESTADO = 318 THEN 'Tratamento de Erro' ";
    myQuery += "      WHEN UltimoMovimento.NUM_SEQ_ESTADO = 352 THEN 'Tratamento de Erro' ";
    myQuery += "      WHEN UltimoMovimento.NUM_SEQ_ESTADO = 353 THEN 'Tratamento de Erro' ";
    myQuery += "      WHEN UltimoMovimento.NUM_SEQ_ESTADO = 4 THEN 'Início' ";
    myQuery += "      WHEN UltimoMovimento.NUM_SEQ_ESTADO = 34 THEN 'Revisão de solicitação' ";
    myQuery += "      ELSE CONCAT('Etapa ', UltimoMovimento.NUM_SEQ_ESTADO) ";
    myQuery += "    END) AS fase_Atual, ";
    myQuery += "    MAX(TabelaPrincipalG5.centro_de_custo) AS contrato, ";
    myQuery += "    MAX(TabelaPrincipalG5.titulo_solicitacao) AS titulo_solicitacao, ";
    myQuery += "    MAX(TabelaPrincipalG5.Valor) AS Valor, ";
    myQuery += "    MAX(TabelaPrincipalG5.solicitante) AS solicitante, ";
    myQuery += "    MAX(TabelaPrincipalG5.empresa) AS empresa, ";
    myQuery += "    MAX(TabelaPrincipalG5.coligada) AS coligada, ";
    myQuery += "    MAX(TabelaPrincipalG5.setor_solicitante) AS setor_solicitante, ";
    myQuery += "    MAX(TabelaPrincipalG5.filial) AS filial, ";
    myQuery += "    MAX(TabelaPrincipalG5.urgencia_solicitacao) AS urgencia_solicitacao, ";
    myQuery += "    MAX(TabelaPrincipalG5.descricao_solicitacao) AS descricao_solicitacao, ";
    myQuery += "    MAX(TabelaPrincipalG5.responsavel_solicitacao) AS responsavel_solicitacao, ";
    myQuery += "    MAX(TabelaPrincipalG5.email_solicitante) AS email_solicitante, ";
    myQuery += "    MAX(TabelaPrincipalG5.copia_email_solicitante) AS copia_email_solicitante, ";
    myQuery += "    MAX(TabelaPrincipalG5.teve_juros) AS teve_juros, ";
    myQuery += "    MAX(TabelaPrincipalG5.valor_original) AS valor_original, ";
    myQuery += "    MAX(TabelaPrincipalG5.valor_juros) AS valor_juros, ";
    myQuery += "    MAX(TabelaPrincipalG5.fornecedor_cadastrado) AS fornecedor_cadastrado, ";
    myQuery += "    MAX(TabelaPrincipalG5.vincular_fornecedor) AS vincular_fornecedor, ";
    myQuery += "    MAX(TabelaPrincipalG5.dados_pagamento) AS dados_pagamento, ";
    myQuery += "    MAX(TabelaPrincipalG5.cod_boleto) AS cod_boleto, ";
    myQuery += "    MAX(TabelaPrincipalG5.nome_social) AS nome_social, ";
    myQuery += "    MAX(TabelaPrincipalG5.nome) AS nome, ";
    myQuery += "    MAX(TabelaPrincipalG5.classificacao) AS classificacao, ";
    myQuery += "    MAX(TabelaPrincipalG5.categoria) AS categoria, ";
    myQuery += "    MAX(TabelaPrincipalG5.CPF) AS CPF, ";
    myQuery += "    MAX(TabelaPrincipalG5.CNPJ) AS CNPJ, ";
    myQuery += "    MAX(TabelaPrincipalG5.tipo_cliente_forn) AS tipo_cliente_forn, ";
    myQuery += "    MAX(TabelaPrincipalG5.nome_cliente_forn) AS nome_cliente_forn, ";
    myQuery += "    MAX(TabelaPrincipalG5.status_tipo_cliente) AS status_tipo_cliente, ";
    myQuery += "    MAX(TabelaPrincipalG5.CEP) AS CEP, ";
    myQuery += "    MAX(TabelaPrincipalG5.tipo_rua) AS tipo_rua, ";
    myQuery += "    MAX(TabelaPrincipalG5.rua) AS rua, ";
    myQuery += "    MAX(TabelaPrincipalG5.numero) AS numero, ";
    myQuery += "    MAX(TabelaPrincipalG5.tipo_bairro) AS tipo_bairro, ";
    myQuery += "    MAX(TabelaPrincipalG5.bairro) AS bairro, ";
    myQuery += "    MAX(TabelaPrincipalG5.id_pais) AS id_pais, ";
    myQuery += "    MAX(TabelaPrincipalG5.pais) AS pais, ";
    myQuery += "    MAX(TabelaPrincipalG5.sigla_estado) AS sigla_estado, ";
    myQuery += "    MAX(TabelaPrincipalG5.nome_estado) AS nome_estado, ";
    myQuery += "    MAX(TabelaPrincipalG5.telefone) AS telefone, ";
    myQuery += "    MAX(TabelaPrincipalG5.celular) AS celular, ";
    myQuery += "    MAX(TabelaPrincipalG5.telefone_comercial) AS telefone_comercial, ";
    myQuery += "    MAX(TabelaPrincipalG5.fax) AS fax, ";
    myQuery += "    MAX(TabelaPrincipalG5.email) AS email, ";
    myQuery += "    MAX(TabelaPrincipalG5.contato) AS contato, ";
    myQuery += "    MAX(TabelaPrincipalG5.cad_referencia) AS cad_referencia, ";
    myQuery += "    MAX(TabelaPrincipalG5.descricao) AS descricao, ";
    myQuery += "    MAX(TabelaPrincipalG5.filial_d_bancarios) AS filial_d_bancarios, ";
    myQuery += "    MAX(TabelaPrincipalG5.nome_filial_d_banc) AS nome_filial_d_banc, ";
    myQuery += "    MAX(TabelaPrincipalG5.forma_pagamento) AS forma_pagamento, ";
    myQuery += "    MAX(TabelaPrincipalG5.banco) AS banco, ";
    myQuery += "    MAX(TabelaPrincipalG5.agencia) AS agencia, ";
    myQuery += "    MAX(TabelaPrincipalG5.digito) AS digito, ";
    myQuery += "    MAX(TabelaPrincipalG5.nome_agencia) AS nome_agencia, ";
    myQuery += "    MAX(TabelaPrincipalG5.conta_corrente) AS conta_corrente, ";
    myQuery += "    MAX(TabelaPrincipalG5.digito_conta_corrente) AS digito_conta_corrente, ";
    myQuery += "    MAX(TabelaPrincipalG5.tipo_conta) AS tipo_conta, ";
    myQuery += "    MAX(TabelaPrincipalG5.camara_comp) AS camara_comp, ";
    myQuery += "    MAX(TabelaPrincipalG5.favorecido) AS favorecido, ";
    myQuery += "    MAX(TabelaPrincipalG5.CpfCnpj_favorecido) AS CpfCnpj_favorecido, ";
    myQuery += "    MAX(TabelaPrincipalG5.tipo_chave_pix) AS tipo_chave_pix, ";
    myQuery += "    MAX(TabelaPrincipalG5.chave_CPF) AS chave_CPF, ";
    myQuery += "    MAX(TabelaPrincipalG5.chave_CNPJ) AS chave_CNPJ, ";
    myQuery += "    MAX(TabelaPrincipalG5.chave_email) AS chave_email, ";
    myQuery += "    MAX(TabelaPrincipalG5.chave_celular) AS chave_celular, ";
    myQuery += "    MAX(TabelaPrincipalG5.chave_aleatoria) AS chave_aleatoria, ";
    myQuery += "    MAX(TabelaPrincipalG5.valor_total_rateio) AS valor_total_rateio, ";
    myQuery += "    MAX(TabelaPrincipalG5.aprovacao_gestor) AS satatus_aprovacao_gestor, ";
    myQuery += "    MAX(TabelaPrincipalG5.mensagem_cancel_gestor) AS mensagem_cancel_gestor, ";
    myQuery += "    MAX(TabelaPrincipalG5.aprovacao_diretoria) AS status_aprovacao_diretoria, ";
    myQuery += "    MAX(TabelaPrincipalG5.mensagem_cancel_diretoria) AS mensagem_cancel_diretoria, ";
    myQuery += "    MAX(TabelaPrincipalG5.pagar_receber) AS pagar_receber, ";
    myQuery += "    MAX(TabelaPrincipalG5.filial_analise) AS filial_analise, ";
    myQuery += "    MAX(TabelaPrincipalG5.nome_filial_analise) AS nome_filial_analise, ";
    myQuery += "    MAX(TabelaPrincipalG5.referencia_analise) AS referencia_analise, ";
    myQuery += "    MAX(TabelaPrincipalG5.tipo_documento_analise) AS tipo_documento_analise, ";
    myQuery += "    MAX(TabelaPrincipalG5.nome_tipo_documento) AS nome_tipo_documento, ";
    myQuery += "    MAX(TabelaPrincipalG5.numero_documento_analise) AS numero_documento_analise, ";
    myQuery += "    MAX(TabelaPrincipalG5.data_emissao_analise) AS data_emissao_analise, ";
    myQuery += "    MAX(TabelaPrincipalG5.data_vencimento_analise) AS data_vencimento_analise, ";
    myQuery += "    MAX(TabelaPrincipalG5.data_valor_liquido) AS data_valor_liquido, ";
    myQuery += "    MAX(TabelaPrincipalG5.valor_liquido) AS valor_liquido, ";
    myQuery += "    MAX(TabelaPrincipalG5.tipo_contabil) AS tipo_contabil, ";
    myQuery += "    MAX(TabelaPrincipalG5.status_liquidacao) AS status_liquidacao, ";
    myQuery += "    MAX(TabelaPrincipalG5.seleciona_fase_envio) AS seleciona_fase_envio, ";
    myQuery += "    MAX(TabelaPrincipalG5.CODCOLIGADA) AS CODCOLIGADA, ";
    myQuery += "    MAX(TabelaPrincipalG5.CODFILIAL) AS CODFILIAL, ";
    myQuery += "    MAX(TabelaPrincipalG5.CODCCUSTO) AS CODCCUSTO, ";
    myQuery += "    MAX(TabelaPrincipalG5.SETORSOLICITANTE) AS SETORSOLICITANTE, ";
    myQuery += "    MAX(TabelaPrincipalG5.COD_PERIOD_EXPED) AS COD_PERIOD_EXPED, ";
    myQuery += "    MAX(TabelaPrincipalG5.NUM_HORA_INIC_PERIOD) AS NUM_HORA_INIC_PERIOD, ";
    myQuery += "    MAX(TabelaPrincipalG5.DATA_FIM) AS DATA_FIM, ";
    myQuery += "    MAX(TabelaPrincipalG5.NUM_HORA_FIM_PERIOD) AS NUM_HORA_FIM_PERIOD, ";
    myQuery += "    MAX(TabelaPrincipalG5.NUMEROBANCO) AS NUMEROBANCO, ";
    myQuery += "    MAX(TabelaPrincipalG5.CGCCFO) AS CGCCFO, ";
    myQuery += "    MAX(TabelaPrincipalG5.CODTDO) AS CODTDO, ";
    myQuery += "    MAX(TabelaPrincipalG5.idLan) AS idLan, ";
    myQuery += "    MAX(TabelaPrincipalG5.municipio) AS municipio, ";
    myQuery += "    MAX(TabelaPrincipalG5.IDPRJ) AS IDPRJ, ";
    myQuery += "    MAX(anexos.lista_anexos) AS anexos_nomes, ";
    myQuery += "    MAX(anexos.lista_ids) AS anexos_ids ";

    myQuery += " FROM PROCES_WORKFLOW ";
    myQuery += " INNER JOIN ( ";
    myQuery += "    SELECT t.* FROM ML001037 t ";
    myQuery += "    INNER JOIN ( ";
    myQuery += "      SELECT companyid, documentid, MAX(version) AS version ";
    myQuery += "      FROM ML001037 GROUP BY companyid, documentid ";
    myQuery += "    ) tv ";
    myQuery += "      ON tv.companyid = t.companyid ";
    myQuery += "     AND tv.documentid = t.documentid ";
    myQuery += "     AND tv.version = t.version ";
    myQuery += " ) TabelaPrincipalG5 ";
    myQuery += "    ON TabelaPrincipalG5.companyid = PROCES_WORKFLOW.COD_EMPRESA ";
    myQuery += "   AND TabelaPrincipalG5.documentid = PROCES_WORKFLOW.NR_DOCUMENTO_CARD ";

    myQuery += " INNER JOIN HISTOR_PROCES ";
    myQuery += "    ON HISTOR_PROCES.COD_EMPRESA = PROCES_WORKFLOW.COD_EMPRESA ";
    myQuery += "   AND HISTOR_PROCES.NUM_PROCES = PROCES_WORKFLOW.NUM_PROCES ";
    myQuery += "   AND HISTOR_PROCES.NUM_SEQ_MOVTO = ( ";
    myQuery += "        SELECT MAX(h2.NUM_SEQ_MOVTO) FROM HISTOR_PROCES h2 ";
    myQuery += "        WHERE h2.COD_EMPRESA = PROCES_WORKFLOW.COD_EMPRESA ";
    myQuery += "          AND h2.NUM_PROCES = PROCES_WORKFLOW.NUM_PROCES ";
    myQuery += "   ) ";

    myQuery += " LEFT JOIN HISTOR_PROCES UltimoMovimento ";
    myQuery += "    ON UltimoMovimento.COD_EMPRESA = HISTOR_PROCES.COD_EMPRESA ";
    myQuery += "   AND UltimoMovimento.NUM_PROCES = HISTOR_PROCES.NUM_PROCES ";
    myQuery += "   AND UltimoMovimento.NUM_SEQ_MOVTO = HISTOR_PROCES.NUM_SEQ_MOVTO ";

    myQuery += " LEFT JOIN ( ";
    myQuery += "      SELECT companyid, documentid, MAX(version) AS version ";
    myQuery += "      FROM ML001039 GROUP BY companyid, documentid ";
    myQuery += " ) rateioVersao ";
    myQuery += "    ON rateioVersao.companyid = PROCES_WORKFLOW.COD_EMPRESA ";
    myQuery += "   AND rateioVersao.documentid = PROCES_WORKFLOW.NR_DOCUMENTO_CARD ";
    myQuery += " LEFT JOIN ML001039 rateio ";
    myQuery += "    ON rateio.companyid = rateioVersao.companyid ";
    myQuery += "   AND rateio.documentid = rateioVersao.documentid ";
    myQuery += "   AND rateio.version = rateioVersao.version ";

    myQuery += " LEFT JOIN ( ";
    myQuery += "      SELECT companyid, documentid, MAX(version) AS version ";
    myQuery += "      FROM ML001041 GROUP BY companyid, documentid ";
    myQuery += " ) vencVersao ";
    myQuery += "    ON vencVersao.companyid = PROCES_WORKFLOW.COD_EMPRESA ";
    myQuery += "   AND vencVersao.documentid = PROCES_WORKFLOW.NR_DOCUMENTO_CARD ";
    myQuery += " LEFT JOIN ML001041 vencimento ";
    myQuery += "    ON vencimento.companyid = vencVersao.companyid ";
    myQuery += "   AND vencimento.documentid = vencVersao.documentid ";
    myQuery += "   AND vencimento.version = vencVersao.version ";

    myQuery += " LEFT JOIN ( ";
    myQuery += "    SELECT ";
    myQuery += "        ap.COD_EMPRESA, ";
    myQuery += "        ap.NUM_PROCES, ";
    myQuery += "        GROUP_CONCAT(DISTINCT d.DS_PRINCIPAL_DOCUMENTO SEPARATOR ' | ') AS lista_anexos, ";
    myQuery += "        GROUP_CONCAT(DISTINCT d.NR_DOCUMENTO SEPARATOR ' | ') AS lista_ids ";
    myQuery += "    FROM ANEXO_PROCES ap ";
    myQuery += "    INNER JOIN DOCUMENTO d ";
    myQuery += "        ON d.COD_EMPRESA = ap.COD_EMPRESA ";
    myQuery += "       AND d.NR_DOCUMENTO = ap.NR_DOCUMENTO ";
    myQuery += "       AND d.VERSAO_ATIVA = 1 ";
    myQuery += "       AND (d.LOG_DELETE = 0 OR d.LOG_DELETE IS NULL) ";
    myQuery += "    GROUP BY ap.COD_EMPRESA, ap.NUM_PROCES ";
    myQuery += " ) anexos ";
    myQuery += "    ON anexos.COD_EMPRESA = PROCES_WORKFLOW.COD_EMPRESA ";
    myQuery += "   AND anexos.NUM_PROCES = PROCES_WORKFLOW.NUM_PROCES ";

    // Filtro DP (só campos do formulário — HISTOR_PROCES não tem CD_MATRICULA)
    myQuery += " WHERE ( ";
    myQuery += "      UPPER(IFNULL(TabelaPrincipalG5.solicitante, '')) LIKE '%DP%' ";
    myQuery += "   OR UPPER(IFNULL(TabelaPrincipalG5.responsavel_solicitacao, '')) LIKE '%DP%' ";
    myQuery += "   OR UPPER(IFNULL(TabelaPrincipalG5.setor_solicitante, '')) LIKE '%DP%' ";
    myQuery += "   OR UPPER(IFNULL(TabelaPrincipalG5.SETORSOLICITANTE, '')) LIKE '%DP%' ";
    myQuery += "   OR UPPER(IFNULL(TabelaPrincipalG5.solicitante, '')) LIKE '%DEPARTAMENTO PESSOAL%' ";
    myQuery += "   OR UPPER(IFNULL(TabelaPrincipalG5.responsavel_solicitacao, '')) LIKE '%DEPARTAMENTO PESSOAL%' ";
    myQuery += "   OR UPPER(IFNULL(TabelaPrincipalG5.setor_solicitante, '')) LIKE '%DEPARTAMENTO PESSOAL%' ";
    myQuery += "   OR UPPER(IFNULL(TabelaPrincipalG5.setor_solicitante, '')) LIKE '%PESSOAL%' ";
    myQuery += " ) ";

    myQuery += " GROUP BY PROCES_WORKFLOW.NUM_PROCES ";
    myQuery += " ORDER BY MAX(PROCES_WORKFLOW.START_DATE) DESC ";

    log.info("G5-Relatorio-DF-GO-DP QUERY: " + myQuery);

    conn = ds.getConnection();
    stmt = conn.createStatement();
    rs = stmt.executeQuery(myQuery);
    var columnCount = rs.getMetaData().getColumnCount();

    var created = false;
    while (rs.next()) {
      if (!created) {
        for (var i = 1; i <= columnCount; i++) {
          newDataset.addColumn(rs.getMetaData().getColumnName(i));
        }
        created = true;
      }

      var row = [];
      for (var j = 1; j <= columnCount; j++) {
        row.push(rs.getString(j));
      }
      newDataset.addRow(row);
    }
  } catch (e) {
    // Aparece no "Testar" do Fluig — não engole o erro em silêncio
    log.error("Erro ao executar query no dataset DP: " + e);
    try {
      newDataset = DatasetBuilder.newDataset();
      newDataset.addColumn("ERRO");
      newDataset.addRow([String(e && e.message ? e.message : e)]);
    } catch (e2) {
      log.error("Falha ao montar linha de ERRO: " + e2);
    }
  } finally {
    try { if (rs) rs.close(); } catch (e3) {}
    try { if (stmt) stmt.close(); } catch (e4) {}
    try { if (conn) conn.close(); } catch (e5) {}
  }

  return newDataset;
}
