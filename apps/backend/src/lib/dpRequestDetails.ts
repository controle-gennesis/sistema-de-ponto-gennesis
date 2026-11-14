import { z } from 'zod';

/** Anexo enviado em Base64 (evita multipart no MVP). Limite ~15 MB decodificados. */
export const dpAttachmentSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  dataBase64: z.string().min(1).max(22_000_000),
});

const str = z.string().min(1);
const strOpt = z.string().optional();
const numeroDiasField = z.union([z.string().min(1), z.number()]).transform((v) => String(v));
const diasHotelField = z.union([z.string(), z.number()]).optional();

const admissaoCandidatoSchema = z.object({
  nome: str,
  funcao: str,
  contato: str,
  motivoContratacao: str,
  setor: str,
  observacao: strOpt,
  anexoDocumento: dpAttachmentSchema.optional(),
});

function normalizeAdmissaoDetails(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const data = input as Record<string, unknown>;
  const topMotivo = data.motivoContratacao;
  const topSetor = data.setor;
  const topObservacao = data.observacao;
  if (!Array.isArray(data.candidatos)) return input;
  return {
    ...data,
    candidatos: data.candidatos.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const row = item as Record<string, unknown>;
      return {
        ...row,
        motivoContratacao: row.motivoContratacao ?? topMotivo,
        setor: row.setor ?? topSetor,
        observacao: row.observacao ?? topObservacao,
      };
    }),
  };
}

const medidaDisciplinarItemSchema = z.object({
  employeeId: str,
  punicao: z.enum(['ADVERTENCIA', 'SUSPENSAO']),
  motivo: str,
});

const feriasItemSchema = z.object({
  employeeId: str,
  dataInicial: str,
  dataFinal: str,
  observacao: strOpt,
});

const rescisaoItemSchema = z.object({
  employeeId: str,
  tipoAviso: str,
  tipoRescisao: str,
  motivo: str,
  observacoes: strOpt,
  anexoDocumento: dpAttachmentSchema.optional(),
});

const alteracaoItemSchema = z.object({
  employeeId: str,
  tipoAlteracaoFuncaoOuSalario: z.enum(['FUNCAO', 'SALARIO']).optional(),
  funcaoSalarioAntigo: str,
  funcaoSalarioNovo: str,
  justificativa: str,
});

const atestadoItemSchema = z.object({
  employeeId: str,
  dataInicial: str,
  dataFinal: str,
  numeroDias: numeroDiasField,
  anexoAtestado: dpAttachmentSchema,
});

const retificacaoItemSchema = z.object({
  employeeId: str,
  data: str,
  justificativa: str,
});

const horaExtraItemSchema = z.object({
  employeeIds: z.array(str).min(1).max(50),
  justificativa: str,
  datas: str,
  anexoAutorizacao: dpAttachmentSchema,
});

const viagemBeneficioItemSchema = z.object({
  employeeId: str,
  dataInicial: str,
  dataFinal: str,
  numeroDias: numeroDiasField,
  motivoViagem: str,
  diasHotel: diasHotelField,
});

const outrasItemSchema = z.object({
  employeeId: str,
  tipoSolicitacao: str,
  situacao: str,
  justificativa: str,
  datas: strOpt,
  valores: z.string().optional(),
  observacoes: strOpt,
});

const admViagemItemSchema = z.object({
  employeeId: str,
  /** CPF do colaborador (preenchido automaticamente ao escolher o colaborador). */
  cpf: strOpt,
  dataIda: str,
  dataVolta: str,
  cidade: str,
  motivoViagem: str,
  numeroDias: numeroDiasField,
  pedagio: z.enum(['SIM', 'NAO']),
  observacoes: strOpt,
});

const admSimpleItemSchema = z.object({
  employeeId: str,
  detalhes: str,
});

const admAsosItemSchema = z
  .object({
    asoTipo: z.enum(['ADMISSIONAL', 'DEMISSIONAL', 'PERIODICO', 'ALTERACAO_FUNCAO']),
    employeeId: str,
    dataNascimento: str,
    cpf: str,
    setor: str,
    cargo: str,
    novoCargo: strOpt,
    centroCusto: str,
    localTrabalho: str,
    empresa: str,
    seguirPcmso: z.enum(['SIM', 'NAO']),
  })
  .superRefine((data, ctx) => {
    if (data.asoTipo === 'ALTERACAO_FUNCAO' && !data.novoCargo?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['novoCargo'],
        message: 'Informe o novo cargo',
      });
    }
  });

function normalizeAdmAsosDetails(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const data = input as Record<string, unknown>;
  if (Array.isArray(data.asos)) return input;
  if (data.asoTipo || data.employeeId) {
    return { asos: [data] };
  }
  return input;
}

function uniqueEmployeeRefine<T extends { employeeId: string }>(
  arrayKey: string,
  data: Record<string, T[]>,
  ctx: z.RefinementCtx
) {
  const seen = new Set<string>();
  const items = data[arrayKey] ?? [];
  items.forEach((item, index) => {
    if (seen.has(item.employeeId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [arrayKey, index, 'employeeId'],
        message: 'Não é permitido repetir o mesmo colaborador',
      });
    }
    seen.add(item.employeeId);
  });
}

/** Igual a uniqueEmployeeRefine, mas para linhas com múltiplos colaboradores (employeeIds: string[]). */
/**
 * Compatibilidade: o app mobile ainda envia `employeeId` (singular) por linha de hora
 * extra. O web já manda `employeeIds` (array, multi-colaborador). Normaliza pro formato
 * novo antes de validar, pra não quebrar o mobile enquanto ele não for atualizado.
 */
function normalizeHoraExtraDetails(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const data = input as Record<string, unknown>;
  if (!Array.isArray(data.horasExtras)) return input;
  return {
    ...data,
    horasExtras: data.horasExtras.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const row = item as Record<string, unknown>;
      if (Array.isArray(row.employeeIds)) return row;
      if (typeof row.employeeId === 'string' && row.employeeId.trim()) {
        return { ...row, employeeIds: [row.employeeId] };
      }
      return row;
    }),
  };
}

function uniqueEmployeeIdsRefine<T extends { employeeIds: string[] }>(
  arrayKey: string,
  data: Record<string, T[]>,
  ctx: z.RefinementCtx
) {
  const seen = new Set<string>();
  const items = data[arrayKey] ?? [];
  items.forEach((item, rowIndex) => {
    item.employeeIds.forEach((employeeId, idIndex) => {
      if (seen.has(employeeId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [arrayKey, rowIndex, 'employeeIds', idIndex],
          message: 'Não é permitido repetir o mesmo colaborador',
        });
      }
      seen.add(employeeId);
    });
  });
}

function employeeArraySchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.array(itemSchema).min(1).max(20);
}

// ── Solicitações criadas direto para a Contabilidade (sem gestor/DP) ─────────

/** Tipos que vão direto para o Atendimento Contábil ao serem criados. */
export const ACCOUNTING_DIRECT_REQUEST_TYPES = [
  'CONVENCAO_COLETIVA',
  'FECHAMENTO_FOLHA',
  'IMPOSTOS_ENCARGOS',
  'REALOCACAO_COLABORADOR',
  'RETIFICACAO_RECALCULO',
  'SOLICITACAO_GERAL',
  // Têm prefixo CONTAB_ porque Admissão, Férias e Rescisão já existem no fluxo do DP.
  'CONTAB_ADMISSAO',
  'CONTAB_AFASTAMENTO',
  'CONTAB_ATESTADO',
  'CONTAB_ALTERACAO_FUNCAO',
  'CONTAB_ALTERACAO_SALARIAL',
  'CONTAB_FERIAS',
  'CONTAB_RESCISAO',
] as const;

/** Tipo equivalente no módulo DP/Contabilidade (tira o prefixo CONTAB_ dos tipos novos). */
export function accountingTypeOfDirect(requestType: string): string {
  return requestType.replace(/^CONTAB_/, '');
}

export type AccountingDirectRequestType = (typeof ACCOUNTING_DIRECT_REQUEST_TYPES)[number];

export function isAccountingDirectRequestType(requestType: string): requestType is AccountingDirectRequestType {
  return (ACCOUNTING_DIRECT_REQUEST_TYPES as readonly string[]).includes(requestType);
}

/** Anexo na criação: chega em Base64 e o servidor grava no S3 (guarda só a referência). */
const accountingAttachmentInputSchema = dpAttachmentSchema.extend({
  tipoArquivo: str,
  dataValidade: strOpt,
});

const accountingAnexosField = z.array(accountingAttachmentInputSchema).max(10).optional();

const simNao = z.enum(['SIM', 'NAO']);

const convencaoColetivaDetails = z.object({
  sindicatoCategoria: str,
  vigenciaDataBase: str,
  assunto: str,
  observacoes: str,
  anexos: accountingAnexosField,
});

const fechamentoFolhaDetails = z.object({
  competencia: str,
  novosOptantesVt: strOpt,
  desistentesVt: strOpt,
  outrasInformacoes: strOpt,
  observacoes: str,
  anexos: accountingAnexosField,
});

const impostosEncargosDetails = z.object({
  competencia: str,
  tipoImpostoEncargo: str,
  colaboradorEmployeeId: strOpt,
  dataVencimento: str,
  observacoes: str,
  anexos: accountingAnexosField,
});

const realocacaoColaboradorDetails = z
  .object({
    employeeId: str,
    empresaAtual: str,
    poloAtual: str,
    contratoAtual: str,
    setorAtual: str,
    novaEmpresa: str,
    novoPolo: str,
    novoContrato: str,
    novoSetor: str,
    dataRealocacao: str,
    funcaoPermanece: simNao,
    novaFuncao: strOpt,
    salarioPermanece: simNao,
    novoSalario: strOpt,
    observacoes: str,
    anexos: accountingAnexosField,
  })
  .superRefine((data, ctx) => {
    if (data.funcaoPermanece === 'NAO' && !data.novaFuncao?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['novaFuncao'], message: 'Informe a nova função' });
    }
    if (data.salarioPermanece === 'NAO' && !data.novoSalario?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['novoSalario'], message: 'Informe o novo salário' });
    }
  });

const retificacaoRecalculoDetails = z.object({
  numeroSolicitacaoOriginal: str,
  tipoSolicitacaoOriginal: str,
  competencia: str,
  motivo: str,
  informacaoOriginal: str,
  informacaoCorreta: str,
  observacoes: str,
  anexos: accountingAnexosField,
});

const solicitacaoGeralDetails = z.object({
  assunto: str,
  colaboradorEmployeeId: strOpt,
  descricao: str,
  anexos: accountingAnexosField,
});

const contabAdmissaoDetails = z.object({
  nomeCompleto: str,
  dataAdmissao: str,
  tomadorLocal: strOpt,
  funcao: str,
  salario: str,
  cargaHoraria: str,
  pis: strOpt,
  optanteVt: simNao,
  insalubridade: simNao,
  observacoes: str,
  anexos: accountingAnexosField,
});

const contabAfastamentoDetails = z.object({
  employeeId: str,
  tipoMotivo: str,
  dataInicio: str,
  dataPrevistaTermino: strOpt,
  observacoes: str,
  anexos: accountingAnexosField,
});

/** Atestados seguem num arquivo único por empresa (todos da semana juntos): sem colaborador por pedido. */
const contabAtestadoDetails = z
  .object({
    observacoes: strOpt,
    anexos: accountingAnexosField,
  })
  .superRefine((data, ctx) => {
    if (!data.anexos || data.anexos.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['anexos'], message: 'Anexe o atestado' });
    }
  });

const contabAlteracaoFuncaoDetails = z
  .object({
    employeeId: str,
    funcaoAtual: str,
    novaFuncao: str,
    dataInicio: str,
    alteracaoSalarial: simNao,
    novoSalario: strOpt,
    observacoes: str,
    anexos: accountingAnexosField,
  })
  .superRefine((data, ctx) => {
    if (data.alteracaoSalarial === 'SIM' && !data.novoSalario?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['novoSalario'], message: 'Informe o novo salário' });
    }
  });

const contabAlteracaoSalarialDetails = z.object({
  employeeId: str,
  salarioAtual: str,
  novoSalario: str,
  dataVigencia: str,
  motivo: str,
  observacoes: str,
  anexos: accountingAnexosField,
});

const contabFeriasDetails = z
  .object({
    employeeId: str,
    dataInicio: str,
    quantidadeDias: str,
    abonoPecuniario: simNao,
    quantidadeDiasAbono: strOpt,
    adiantamento13: simNao,
    observacoes: str,
    anexos: accountingAnexosField,
  })
  .superRefine((data, ctx) => {
    if (data.abonoPecuniario === 'SIM' && !data.quantidadeDiasAbono?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['quantidadeDiasAbono'], message: 'Informe a quantidade de dias de abono' });
    }
  });

const contabRescisaoDetails = z
  .object({
    employeeId: str,
    tipoRescisao: str,
    tipoAvisoPrevio: str,
    dataDemissao: str,
    ultimoDiaTrabalhado: str,
    possuiProventoDesconto: simNao,
    proventoDesconto: strOpt,
    valor: strOpt,
    observacoes: str,
    anexos: accountingAnexosField,
  })
  .superRefine((data, ctx) => {
    if (data.possuiProventoDesconto === 'SIM') {
      if (!data.proventoDesconto?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['proventoDesconto'], message: 'Informe se é provento ou desconto' });
      }
      if (!data.valor?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['valor'], message: 'Informe o valor' });
      }
    }
  });

/** Anexo de "Outros" (ADM): chega em Base64 e o servidor grava no S3; o tipo do arquivo é opcional. */
const admOutrosAnexosField = z
  .array(dpAttachmentSchema.extend({ tipoArquivo: strOpt }))
  .max(10)
  .optional();

const admOutrosDetails = z.object({
  assunto: str,
  colaboradorEmployeeId: strOpt,
  descricao: str,
  anexos: admOutrosAnexosField,
});

export const dpDetailsSchemas = {
  ADMISSAO: z.preprocess(
    normalizeAdmissaoDetails,
    z
      .object({
        candidatos: z.array(admissaoCandidatoSchema).min(1).max(30),
        quantidade: z.coerce.number().int().min(1).max(30).optional(),
        quantidadeNomeFuncaoContato: strOpt,
        funcaoNomeQuantidadeContato: strOpt,
        motivoContratacao: strOpt,
        setor: strOpt,
        observacao: strOpt,
      })
      .transform((data) => ({
        candidatos: data.candidatos,
        quantidade: data.candidatos.length,
      }))
  ),
  FERIAS: z
    .object({ ferias: employeeArraySchema(feriasItemSchema) })
    .superRefine((data, ctx) => uniqueEmployeeRefine('ferias', data, ctx)),
  RESCISAO: z
    .object({ rescisoes: employeeArraySchema(rescisaoItemSchema) })
    .superRefine((data, ctx) => uniqueEmployeeRefine('rescisoes', data, ctx)),
  ALTERACAO_FUNCAO_SALARIO: z
    .object({ alteracoes: employeeArraySchema(alteracaoItemSchema) })
    .superRefine((data, ctx) => uniqueEmployeeRefine('alteracoes', data, ctx)),
  ADVERTENCIA_SUSPENSAO: z
    .object({ medidas: employeeArraySchema(medidaDisciplinarItemSchema) })
    .superRefine((data, ctx) => uniqueEmployeeRefine('medidas', data, ctx)),
  ATESTADO_MEDICO: z
    .object({ atestados: employeeArraySchema(atestadoItemSchema) })
    .superRefine((data, ctx) => uniqueEmployeeRefine('atestados', data, ctx)),
  RETIFICACAO_ALOCACAO: z
    .object({ retificacoes: employeeArraySchema(retificacaoItemSchema) })
    .superRefine((data, ctx) => uniqueEmployeeRefine('retificacoes', data, ctx)),
  HORA_EXTRA: z.preprocess(
    normalizeHoraExtraDetails,
    z
      .object({ horasExtras: employeeArraySchema(horaExtraItemSchema) })
      .superRefine((data, ctx) => uniqueEmployeeIdsRefine('horasExtras', data, ctx))
  ),
  BENEFICIOS_VIAGEM: z
    .object({ viagensBeneficio: employeeArraySchema(viagemBeneficioItemSchema) })
    .superRefine((data, ctx) => uniqueEmployeeRefine('viagensBeneficio', data, ctx)),
  OUTRAS_SOLICITACOES: z
    .object({ itens: employeeArraySchema(outrasItemSchema) })
    .superRefine((data, ctx) => uniqueEmployeeRefine('itens', data, ctx)),
  ADM_VIAGENS: z
    .object({ viagens: employeeArraySchema(admViagemItemSchema) })
    .superRefine((data, ctx) => uniqueEmployeeRefine('viagens', data, ctx)),
  ADM_EPI_FARDAMENTO: z
    .object({ itens: employeeArraySchema(admSimpleItemSchema) })
    .superRefine((data, ctx) => uniqueEmployeeRefine('itens', data, ctx)),
  ADM_MANUTENCAO_ESCRITORIO: z
    .object({ itens: employeeArraySchema(admSimpleItemSchema) })
    .superRefine((data, ctx) => uniqueEmployeeRefine('itens', data, ctx)),
  ADM_MATERIAL_ESCRITORIO: z
    .object({ itens: employeeArraySchema(admSimpleItemSchema) })
    .superRefine((data, ctx) => uniqueEmployeeRefine('itens', data, ctx)),
  ADM_INFORMATICA: z
    .object({ itens: employeeArraySchema(admSimpleItemSchema) })
    .superRefine((data, ctx) => uniqueEmployeeRefine('itens', data, ctx)),
  ADM_TREINAMENTOS_NR: z
    .object({ itens: employeeArraySchema(admSimpleItemSchema) })
    .superRefine((data, ctx) => uniqueEmployeeRefine('itens', data, ctx)),
  ADM_ASOS: z.preprocess(
    normalizeAdmAsosDetails,
    z
      .object({ asos: employeeArraySchema(admAsosItemSchema) })
      .superRefine((data, ctx) => uniqueEmployeeRefine('asos', data, ctx))
  ),
  ADM_OUTROS: admOutrosDetails,
  CONVENCAO_COLETIVA: convencaoColetivaDetails,
  FECHAMENTO_FOLHA: fechamentoFolhaDetails,
  IMPOSTOS_ENCARGOS: impostosEncargosDetails,
  REALOCACAO_COLABORADOR: realocacaoColaboradorDetails,
  RETIFICACAO_RECALCULO: retificacaoRecalculoDetails,
  SOLICITACAO_GERAL: solicitacaoGeralDetails,
  CONTAB_ADMISSAO: contabAdmissaoDetails,
  CONTAB_AFASTAMENTO: contabAfastamentoDetails,
  CONTAB_ATESTADO: contabAtestadoDetails,
  CONTAB_ALTERACAO_FUNCAO: contabAlteracaoFuncaoDetails,
  CONTAB_ALTERACAO_SALARIAL: contabAlteracaoSalarialDetails,
  CONTAB_FERIAS: contabFeriasDetails,
  CONTAB_RESCISAO: contabRescisaoDetails,
} as const;

export type DpRequestTypeKey = keyof typeof dpDetailsSchemas;

export function parseDpRequestDetails(requestType: string, details: unknown): Record<string, unknown> {
  const schema = dpDetailsSchemas[requestType as DpRequestTypeKey];
  if (!schema) {
    throw new Error(`Tipo de solicitação DP sem schema de detalhes: ${requestType}`);
  }
  const parsed = schema.safeParse(details ?? {});
  if (!parsed.success) {
    const msg = parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    throw new Error(msg);
  }
  return parsed.data as Record<string, unknown>;
}
