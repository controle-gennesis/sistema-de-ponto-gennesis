'use client';

import React from 'react';
import { AsyncSearchSelectDropdown } from '@/components/ui/AsyncSearchSelectDropdown';
import {
  getRmMaterialLabel,
  isRmServiceMaterial,
  palavrasDaBusca,
  searchRmMaterials,
  searchRmMaterialsTotvs,
  sugerirRmMaterials,
  sugerirRmMaterialsTotvs,
  type RmMaterialListItem,
} from '@/lib/searchRmMaterials';

/** Opção da busca de material: código, nome com as palavras buscadas em destaque, unidade e tipo. */
export function OpcaoMaterial({ material, busca }: { material: RmMaterialListItem; busca: string }) {
  const nome = material.name?.trim() || material.description?.trim() || 'Material sem nome';
  const termos = palavrasDaBusca(busca);
  const normal = (w: string) => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const partes = nome.split(/(\s+)/);
  return (
    <span className="block min-w-0">
      <span className="flex items-baseline gap-2">
        {material.code ? (
          <span className="shrink-0 font-mono text-[11px] text-gray-500 dark:text-gray-400">{material.code}</span>
        ) : null}
        <span className="min-w-0 whitespace-normal break-words text-sm text-gray-900 dark:text-gray-100">
          {partes.map((parte, i) =>
            termos.length > 0 && termos.some((t) => normal(parte).includes(t)) ? (
              <mark key={i} className="rounded bg-amber-200/70 px-0.5 text-inherit dark:bg-amber-500/30">
                {parte}
              </mark>
            ) : (
              <React.Fragment key={i}>{parte}</React.Fragment>
            )
          )}
        </span>
      </span>
      <span className="mt-0.5 block text-[11px] text-gray-500 dark:text-gray-400">
        {material.unit?.trim() ? `Unidade: ${material.unit.trim()}` : 'Sem unidade'}
        {' · '}
        {isRmServiceMaterial(material) ? 'Serviço' : 'Produto'}
      </span>
    </span>
  );
}

type Props = {
  value: string;
  selectedLabel?: string;
  onChange: (material: RmMaterialListItem) => void;
  /** Texto usado para as sugestões (descrição do item da FD ou o material atual). */
  sugestaoTexto?: string;
  /** Chave que troca as sugestões (ex.: item da FD). */
  sugestaoKey?: string;
  sugestaoLabel?: string;
  /** Pedido pelo orçamento/FD (vai para o TOTVS): só materiais com identificador (IDPRD). */
  somenteComIdentificador?: boolean;
  listMaxPx?: number;
};

/** Lista suspensa de materiais do pedido pela FD: busca por palavras, unidade na lista, destaque e sugestões. */
export function MaterialBuscaDropdown({
  value,
  selectedLabel,
  onChange,
  sugestaoTexto,
  sugestaoKey,
  sugestaoLabel = 'Sugestões',
  somenteComIdentificador = false,
  listMaxPx = 440,
}: Props) {
  const buscar = somenteComIdentificador ? searchRmMaterialsTotvs : searchRmMaterials;
  const sugerir = somenteComIdentificador ? sugerirRmMaterialsTotvs : sugerirRmMaterials;
  const texto = (sugestaoTexto || '').trim();
  return (
    <AsyncSearchSelectDropdown<RmMaterialListItem>
      value={value}
      selectedLabel={selectedLabel || undefined}
      onChange={onChange}
      searchFn={buscar}
      getOptionId={(m) => m.id}
      // Mostra a unidade do cadastro (a mesma do TOTVS) já na lista.
      getOptionLabel={(m) =>
        m.unit?.trim() ? `${getRmMaterialLabel(m)} · ${m.unit.trim()}` : getRmMaterialLabel(m)
      }
      placeholder="Buscar material..."
      searchPlaceholder="Digite palavras do material, em qualquer ordem (ex.: jan bas alu)"
      minSearchLength={2}
      queryKeyPrefix={somenteComIdentificador ? 'rm-materials-search-totvs' : 'rm-materials-search'}
      listMaxPx={listMaxPx}
      showResultCount
      {...(texto
        ? {
            defaultOptionsFn: () => sugerir(texto),
            defaultOptionsKey: `${somenteComIdentificador ? 'totvs' : 'todos'}:${sugestaoKey || texto}`,
            defaultOptionsLabel: sugestaoLabel,
          }
        : {})}
      renderOptionWithQuery={(m, q) => <OpcaoMaterial material={m} busca={q} />}
      openDownOnly
    />
  );
}
