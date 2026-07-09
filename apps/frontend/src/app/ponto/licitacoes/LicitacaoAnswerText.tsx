'use client';

import React from 'react';

function formatInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={index} className="font-semibold text-gray-900 dark:text-gray-100">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

function normalizeAnswerText(text: string): string {
  return text
    .replace(/\s\|\|\s/g, '\n')
    .replace(/\|\|/g, '\n');
}

type LicitacaoAnswerTextProps = {
  text: string;
};

export function LicitacaoAnswerText({ text }: LicitacaoAnswerTextProps) {
  const normalized = normalizeAnswerText(text);
  const lines = normalized.split('\n');

  return (
    <div className="space-y-1.5 leading-relaxed">
      {lines.map((line, index) => {
        const trimmed = line.trim();

        if (!trimmed) {
          return <div key={index} className="h-1" aria-hidden />;
        }

        if (trimmed.startsWith('### ')) {
          return (
            <h4 key={index} className="pt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
              {formatInline(trimmed.slice(4))}
            </h4>
          );
        }

        if (trimmed.startsWith('## ')) {
          return (
            <h3 key={index} className="pt-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
              {formatInline(trimmed.slice(3))}
            </h3>
          );
        }

        if (trimmed.startsWith('# ')) {
          return (
            <h2 key={index} className="pt-2 text-base font-bold text-gray-900 dark:text-gray-100">
              {formatInline(trimmed.slice(2))}
            </h2>
          );
        }

        if (trimmed.startsWith('> ')) {
          return (
            <blockquote
              key={index}
              className="border-l-2 border-red-300 pl-3 italic text-gray-600 dark:border-red-700 dark:text-gray-400"
            >
              {formatInline(trimmed.slice(2))}
            </blockquote>
          );
        }

        const bulletMatch = trimmed.match(/^[-*•]\s+(.*)$/);
        if (bulletMatch) {
          return (
            <div key={index} className="flex gap-2 pl-1">
              <span className="shrink-0 text-red-500">•</span>
              <span>{formatInline(bulletMatch[1])}</span>
            </div>
          );
        }

        const numberedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
        if (numberedMatch) {
          return (
            <div key={index} className="flex gap-2 pl-1">
              <span className="shrink-0 font-medium text-gray-500">{numberedMatch[1]}.</span>
              <span>{formatInline(numberedMatch[2])}</span>
            </div>
          );
        }

        return (
          <p key={index} className="text-gray-800 dark:text-gray-200">
            {formatInline(trimmed)}
          </p>
        );
      })}
    </div>
  );
}
