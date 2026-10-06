'use client';

import React from 'react';
import { clsx } from 'clsx';

/** Ritmo vertical canônico (Aprovações): título → abas → cards → lista. */
export const pageStackClass = 'space-y-6';

/** Grid padrão de cards de filtro/estatística (4 colunas em lg). */
export const pageStatCardsGridClass =
  'grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4';

/** Variante 3 colunas (ex.: alguns dashboards). */
export const pageStatCardsGrid3Class =
  'grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3';

/** Variante 5 colunas em 2xl (ex.: combustível). */
export const pageStatCardsGrid5Class =
  'grid w-full grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 2xl:grid-cols-5';

type PageStackProps = {
  children: React.ReactNode;
  className?: string;
  as?: 'div' | 'section';
  id?: string;
};

/** Stack vertical com o mesmo gap da página de Aprovações. */
export function PageStack({ children, className, as: Tag = 'div', id }: PageStackProps) {
  return (
    <Tag id={id} className={clsx(pageStackClass, className)}>
      {children}
    </Tag>
  );
}

type ListPageHeaderProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
  /** Conteúdo abaixo do subtítulo (ex.: botões absolutos / ações). */
  children?: React.ReactNode;
};

/**
 * Título centralizado + subtítulo — tipografia e `mt-2` iguais à Aprovações.
 */
export function ListPageHeader({ title, description, className, children }: ListPageHeaderProps) {
  return (
    <div className={clsx('text-center', className)}>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">{title}</h1>
      {description != null && description !== '' ? (
        <p className="mx-auto mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400 sm:text-base">
          {description}
        </p>
      ) : null}
      {children}
    </div>
  );
}
