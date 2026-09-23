'use client';

import React, { useMemo } from 'react';
// isomorphic-dompurify (não 'dompurify' puro) porque este componente também roda no
// servidor durante o SSR do Next.js, onde não existe `window`/DOM — o pacote plano
// quebra nesse ambiente (DOMPurify.sanitize não é função sem um DOM real).
import DOMPurify from 'isomorphic-dompurify';

/**
 * O sanitizador anterior era um regex caseiro (remover <script>, remover on*=, remover
 * "javascript:") — tem bypasses conhecidos (ex: `<svg/onload=...>` sem espaço antes do
 * atributo, ou `javascript&#58;` com o protocolo escapado em entidade HTML). O editor
 * (HelpRichTextEditor) só produz um conjunto pequeno de tags — mantemos só essas na lista
 * de permissão do DOMPurify, que faz sanitização real via parser de DOM, não regex.
 */
const ALLOWED_TAGS = [
  'p', 'div', 'span', 'br',
  'h1', 'h2',
  'ul', 'ol', 'li',
  'a', 'b', 'strong', 'i', 'em', 'u',
];
const ALLOWED_ATTR = ['href', 'target', 'rel'];

function sanitizeRichHtml(html: string): string {
  return DOMPurify.sanitize(String(html || ''), { ALLOWED_TAGS, ALLOWED_ATTR });
}

export function HelpTutorialRichHtml({ html }: { html: string }) {
  const safe = useMemo(() => sanitizeRichHtml(html), [html]);

  if (!safe.trim()) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Sem conteúdo.</p>;
  }

  return (
    <div
      className="help-rich text-sm leading-relaxed text-gray-700 dark:text-gray-300 [&_a]:font-medium [&_a]:text-red-600 [&_a]:underline dark:[&_a]:text-red-400 [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-bold [&_h1]:text-gray-900 dark:[&_h1]:text-gray-100 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-gray-900 dark:[&_h2]:text-gray-100 [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
