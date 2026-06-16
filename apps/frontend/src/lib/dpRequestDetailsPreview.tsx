/* eslint-disable react/no-array-index-key */
'use client';

import React from 'react';

function formatYmdToBr(ymd: unknown): string {
  if (typeof ymd !== 'string') return '—';
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '—';
  const [, year, month, day] = m;
  return `${day}/${month}/${year}`;
}

function formatDateTimeLocalToBr(value: unknown): string {
  if (typeof value !== 'string') return '—';
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return '—';
  const [, year, month, day, hh, mm] = m;
  return `${day}/${month}/${year} ${hh}:${mm}`;
}

function toTrimmedString(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.trim();
}

function toNumberMaybe(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v !== 'string' && typeof v !== 'bigint') return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function renderValueOrDash(value: string | null | undefined) {
  return value && value.trim() ? value : '—';
}

function parseRangeRaw(raw: string): [string, string] {
  const parts = raw.split(' - ').map((s) => s.trim());
  if (parts.length >= 2) return [parts[0] ?? '', parts[1] ?? ''];
  return [parts[0] ?? '', ''];
}

type Props = {
  requestType: string;
  details?: Record<string, unknown> | null;
};

export function DpRequestDetailsPreview({ requestType, details }: Props) {
  const d = details ?? null;
  if (!d) return null;

  const sectionBaseCls =
    'rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3 space-y-4 text-sm';
  const titleCls = 'text-sm font-semibold text-gray-900 dark:text-gray-100';
  const keyValueCls = 'text-sm text-gray-700 dark:text-gray-300';
  const keyCls = 'font-semibold text-gray-900 dark:text-gray-100';
  const metaItemCls = 'space-y-0.5';
  const metaLabelCls = 'text-xs font-medium text-gray-500 dark:text-gray-400';
  const metaValueCls = 'text-sm text-gray-900 dark:text-gray-100';
  const personItemCls =
    'border-l-2 border-gray-200 pl-3 py-1 dark:border-gray-600';

  const MOTIVO_CONTRATACAO_LABELS: Record<string, string> = {
    AUMENTO_QUADRO: 'Aumento de quadro',
    SUBSTITUICAO: 'Substituição',
    DEMANDA_TEMPORARIA: 'Demanda temporária / obra',
    OUTRO: 'Outro',
  };

  if (requestType === 'ADMISSAO') {
    const quantidade = toNumberMaybe(d.quantidade) ?? null;
    const candidatosRaw = Array.isArray(d.candidatos) ? (d.candidatos as unknown[]) : [];
    const candidatos = candidatosRaw
      .map((c) => {
        if (!c || typeof c !== 'object') return null;
        const row = c as Record<string, unknown>;
        return {
          nome: toTrimmedString(row.nome),
          funcao: toTrimmedString(row.funcao),
          contato: toTrimmedString(row.contato),
        };
      })
      .filter(Boolean) as Array<{ nome: string; funcao: string; contato: string }>;

    const shown = candidatos.slice(0, 6);
    const remaining = candidatos.length - shown.length;

    return (
      <div className={sectionBaseCls}>
        <h3 className={titleCls}>Detalhes da admissão</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className={metaItemCls}>
            <div className={metaLabelCls}>Quantidade</div>
            <div className={metaValueCls}>{quantidade ?? candidatos.length ?? '—'}</div>
          </div>
          <div className={metaItemCls}>
            <div className={metaLabelCls}>Motivo</div>
            <div className={metaValueCls}>
              {toTrimmedString(d.motivoContratacao)
                ? MOTIVO_CONTRATACAO_LABELS[toTrimmedString(d.motivoContratacao)] ??
                  (d.motivoContratacao as string)
                : '—'}
            </div>
          </div>
          <div className={metaItemCls}>
            <div className={metaLabelCls}>Setor</div>
            <div className={metaValueCls}>{toTrimmedString(d.setor) || '—'}</div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Pessoas</div>
            {remaining > 0 ? (
              <div className="text-xs text-gray-500 dark:text-gray-400">+ {remaining} outros</div>
            ) : null}
          </div>

          {candidatos.length ? (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {shown.map((c, idx) => (
                <li key={idx} className={personItemCls}>
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{renderValueOrDash(c.nome)}</div>
                  <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                    {renderValueOrDash(c.funcao)}
                    {c.contato ? ` (${c.contato})` : ''}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className={keyValueCls}>—</div>
          )}

          {toTrimmedString(d.observacao) ? (
            <div className={metaItemCls}>
              <div className={metaLabelCls}>Observação</div>
              <div className={`${metaValueCls} whitespace-pre-wrap break-words`}>{d.observacao as string}</div>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (requestType === 'FERIAS') {
    return (
      <div className={sectionBaseCls}>
        <h3 className={titleCls}>Detalhes das férias</h3>
        <div className={keyValueCls}>
          <span className={keyCls}>Período:</span> {formatYmdToBr(d.dataInicial)} à {formatYmdToBr(d.dataFinal)}
        </div>
        {toTrimmedString(d.observacao) ? (
          <div className={keyValueCls}>
            <span className={keyCls}>Observação:</span> {d.observacao as string}
          </div>
        ) : null}
      </div>
    );
  }

  if (requestType === 'RESCISAO') {
    return (
      <div className={sectionBaseCls}>
        <h3 className={titleCls}>Detalhes da rescisão</h3>
        <div className={keyValueCls}>
          <span className={keyCls}>Tipo de aviso:</span> {renderValueOrDash(toTrimmedString(d.tipoAviso))}
        </div>
        <div className={keyValueCls}>
          <span className={keyCls}>Tipo de rescisão:</span> {renderValueOrDash(toTrimmedString(d.tipoRescisao))}
        </div>
        <div className={keyValueCls}>
          <span className={keyCls}>Motivo:</span> {renderValueOrDash(toTrimmedString(d.motivo))}
        </div>
        {toTrimmedString(d.observacoes) ? (
          <div className={keyValueCls}>
            <span className={keyCls}>Observações:</span> {d.observacoes as string}
          </div>
        ) : null}
      </div>
    );
  }

  if (requestType === 'ALTERACAO_FUNCAO_SALARIO') {
    const oldOrFunc = toTrimmedString(d.funcaoSalarioAntigo);
    const newOrFunc = toTrimmedString(d.funcaoSalarioNovo);
    const isSalary = /R\$\s*\d/.test(oldOrFunc) || /R\$\s*\d/.test(newOrFunc);
    return (
      <div className={sectionBaseCls}>
        <h3 className={titleCls}>{isSalary ? 'Detalhes da alteração salarial' : 'Detalhes da alteração de função'}</h3>
        <div className={keyValueCls}>
          <span className={keyCls}>{isSalary ? 'Salário antigo:' : 'Função antiga:'}</span> {renderValueOrDash(oldOrFunc)}
        </div>
        <div className={keyValueCls}>
          <span className={keyCls}>{isSalary ? 'Salário novo:' : 'Função nova:'}</span> {renderValueOrDash(newOrFunc)}
        </div>
        <div className={keyValueCls}>
          <span className={keyCls}>Justificativa:</span> {renderValueOrDash(toTrimmedString(d.justificativa))}
        </div>
      </div>
    );
  }

  if (requestType === 'ADVERTENCIA_SUSPENSAO') {
    const punicao = toTrimmedString(d.punicao);
    const punicaoLabel = punicao === 'ADVERTENCIA' ? 'Advertência' : punicao === 'SUSPENSAO' ? 'Suspensão' : punicao || '—';
    return (
      <div className={sectionBaseCls}>
        <h3 className={titleCls}>Detalhes da medida disciplinar</h3>
        <div className={keyValueCls}>
          <span className={keyCls}>Punição:</span> {punicaoLabel}
        </div>
        <div className={keyValueCls}>
          <span className={keyCls}>Motivo:</span> {renderValueOrDash(toTrimmedString(d.motivo))}
        </div>
      </div>
    );
  }

  if (requestType === 'ATESTADO_MEDICO') {
    return (
      <div className={sectionBaseCls}>
        <h3 className={titleCls}>Detalhes do atestado</h3>
        <div className={keyValueCls}>
          <span className={keyCls}>Período:</span> {formatYmdToBr(d.dataInicial)} à {formatYmdToBr(d.dataFinal)}
        </div>
        <div className={keyValueCls}>
          <span className={keyCls}>Número de dias:</span> {renderValueOrDash(toTrimmedString(d.numeroDias))}
        </div>
      </div>
    );
  }

  if (requestType === 'RETIFICACAO_ALOCACAO') {
    return (
      <div className={sectionBaseCls}>
        <h3 className={titleCls}>Detalhes da retificação</h3>
        <div className={keyValueCls}>
          <span className={keyCls}>Data:</span> {formatYmdToBr(d.data)}
        </div>
        <div className={keyValueCls}>
          <span className={keyCls}>Justificativa:</span> {renderValueOrDash(toTrimmedString(d.justificativa))}
        </div>
      </div>
    );
  }

  if (requestType === 'HORA_EXTRA') {
    const rawDatas = toTrimmedString(d.datas);
    const [inicioRaw, fimRaw] = rawDatas ? parseRangeRaw(rawDatas) : ['', ''];
    return (
      <div className={sectionBaseCls}>
        <h3 className={titleCls}>Detalhes de hora extra</h3>
        <div className={keyValueCls}>
          <span className={keyCls}>Período:</span>{' '}
          {inicioRaw && fimRaw ? (
            <>
              {formatDateTimeLocalToBr(inicioRaw)} à {formatDateTimeLocalToBr(fimRaw)}
            </>
          ) : rawDatas ? (
            formatDateTimeLocalToBr(rawDatas)
          ) : (
            '—'
          )}
        </div>
        <div className={keyValueCls}>
          <span className={keyCls}>Justificativa:</span> {renderValueOrDash(toTrimmedString(d.justificativa))}
        </div>
      </div>
    );
  }

  if (requestType === 'BENEFICIOS_VIAGEM') {
    const diasHotel = d.diasHotel;
    return (
      <div className={sectionBaseCls}>
        <h3 className={titleCls}>Detalhes da viagem</h3>
        <div className={keyValueCls}>
          <span className={keyCls}>Período:</span> {formatYmdToBr(d.dataInicial)} à {formatYmdToBr(d.dataFinal)}
        </div>
        <div className={keyValueCls}>
          <span className={keyCls}>Número de dias:</span> {renderValueOrDash(toTrimmedString(d.numeroDias))}
        </div>
        {diasHotel !== undefined && diasHotel !== null && String(diasHotel).trim() !== '' ? (
          <div className={keyValueCls}>
            <span className={keyCls}>Hotel:</span> {renderValueOrDash(toTrimmedString(d.diasHotel))}
          </div>
        ) : null}
        <div className={keyValueCls}>
          <span className={keyCls}>Motivo:</span> {renderValueOrDash(toTrimmedString(d.motivoViagem))}
        </div>
      </div>
    );
  }

  if (requestType === 'OUTRAS_SOLICITACOES') {
    const rawDatas = toTrimmedString(d.datas);
    const [dataInicioRaw, dataFimRaw] = rawDatas ? parseRangeRaw(rawDatas) : ['', ''];
    const hasDatas = !!(dataInicioRaw || dataFimRaw);
    const valores = d.valores ? String(d.valores) : '';

    return (
      <div className={sectionBaseCls}>
        <h3 className={titleCls}>Detalhes da solicitação</h3>
        <div className={keyValueCls}>
          <span className={keyCls}>Tipo:</span> {renderValueOrDash(toTrimmedString(d.tipoSolicitacao))}
        </div>
        <div className={keyValueCls}>
          <span className={keyCls}>Situação:</span> {renderValueOrDash(toTrimmedString(d.situacao))}
        </div>
        {hasDatas ? (
          <div className={keyValueCls}>
            <span className={keyCls}>Datas:</span>{' '}
            {dataInicioRaw && dataFimRaw ? (
              <>
                {formatYmdToBr(dataInicioRaw)} à {formatYmdToBr(dataFimRaw)}
              </>
            ) : (
              formatYmdToBr(dataInicioRaw || dataFimRaw)
            )}
          </div>
        ) : null}
        {toTrimmedString(valores) ? (
          <div className={keyValueCls}>
            <span className={keyCls}>Valores:</span> {valores}
          </div>
        ) : null}
        <div className={keyValueCls}>
          <span className={keyCls}>Justificativa:</span> {renderValueOrDash(toTrimmedString(d.justificativa))}
        </div>
        {toTrimmedString(d.observacoes) ? (
          <div className={keyValueCls}>
            <span className={keyCls}>Observações:</span> {d.observacoes as string}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={sectionBaseCls}>
      <h3 className={titleCls}>Detalhes da solicitação</h3>
      <div className={keyValueCls}>—</div>
    </div>
  );
}

