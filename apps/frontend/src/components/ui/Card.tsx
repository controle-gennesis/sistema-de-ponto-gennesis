import React from 'react';
import { clsx } from 'clsx';
import { CARD_ACCENT_DEFAULT, CARD_SURFACE } from '@/lib/cardSurface';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Faixa no topo. `false` esconde. String = classes `from-… via-… to-…`. */
  accent?: string | false;
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

  const classes = clsx('card', CARD_SURFACE, paddingClasses[padding], className);

  return (
    <div className={classes} {...rest}>
      {accent !== false ? (
        <div
          className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${
            accent || CARD_ACCENT_DEFAULT
          }`}
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
      className={clsx('card-header pb-4 border-b border-gray-100 dark:border-white/10', className)}
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
      className={clsx('card-footer pt-4 border-t border-gray-100 dark:border-white/10', className)}
    >
      {children}
    </div>
  );
};
