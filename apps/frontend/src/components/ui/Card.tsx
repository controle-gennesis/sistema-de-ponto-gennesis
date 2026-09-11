import React from 'react';
import { clsx } from 'clsx';
import { CARD_SURFACE_DEFAULT } from '@/lib/cardSurface';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Faixa colorida no topo. Só Contratos passam isso. */
  accent?: string;
}

export const Card: React.FC<CardProps> = ({
  children,
  className,
  padding = 'md',
  accent,
  ...rest
}) => {
  const paddingClasses = {
    none: '',
    sm: 'p-3 sm:p-4',
    md: 'p-4 sm:p-6',
    lg: 'p-5 sm:p-8',
  };

  const classes = clsx('card', CARD_SURFACE_DEFAULT, paddingClasses[padding], className);

  return (
    <div className={classes} {...rest}>
      {accent ? (
        <div
          className={`pointer-events-none absolute inset-x-0 top-0 z-[1] h-1 bg-gradient-to-r ${accent}`}
        />
      ) : null}
      {children}
    </div>
  );
};

export interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export const CardHeader: React.FC<CardHeaderProps> = ({ children, className }) => {
  return (
    <div
      className={clsx('card-header pb-4 border-b border-gray-200 dark:border-gray-700', className)}
    >
      {children}
    </div>
  );
};

export interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}

export const CardContent: React.FC<CardContentProps> = ({
  children,
  className,
  ...rest
}) => {
  return (
    <div className={clsx('card-content pt-4', className)} {...rest}>
      {children}
    </div>
  );
};

export interface CardFooterProps {
  children: React.ReactNode;
  className?: string;
}

export const CardFooter: React.FC<CardFooterProps> = ({ children, className }) => {
  return (
    <div
      className={clsx('card-footer pt-4 border-t border-gray-200 dark:border-gray-700', className)}
    >
      {children}
    </div>
  );
};
