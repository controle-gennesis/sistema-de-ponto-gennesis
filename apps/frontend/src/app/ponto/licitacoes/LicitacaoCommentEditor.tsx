'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Bold, Italic, Link2, List, ListOrdered, Redo2, Underline, Undo2 } from 'lucide-react';

function applyInlineMarkdown(text: string): string {
  let s = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Placeholders evitam conflito ** vs * e funcionam com espaços/Tab na frente
  const slots: string[] = [];
  const park = (html: string) => {
    const i = slots.length;
    slots.push(html);
    return `\u0001${i}\u0001`;
  };

  s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)"]+|mailto:[^\s)"]+)\)/g, (_m, label, url) =>
    park(`<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`),
  );
  s = s.replace(/__([^_]+)__/g, (_m, inner) => park(`<u>${inner}</u>`));
  s = s.replace(/\*\*([^*]+)\*\*/g, (_m, inner) => park(`<strong>${inner}</strong>`));
  s = s.replace(/\*([^*\n]+)\*/g, (_m, inner) => park(`<em>${inner}</em>`));
  s = s.replace(/\u0001(\d+)\u0001/g, (_m, i) => slots[Number(i)] ?? '');
  return s;
}

/** Converte markdown simples (negrito + sublinhado + listas) em HTML para contentEditable. */
export function commentMarkdownToHtml(md: string): string {
  if (!md.trim()) return '';

  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const parts: string[] = [];
  let inList: 'ul' | 'ol' | null = null;

  for (const line of lines) {
    const bullet = line.match(/^[ \t]*[•\-]\s+(.*)$/);
    const numbered = bullet ? null : line.match(/^[ \t]*\d+[.)]\s+(.*)$/);
    const kind = bullet ? 'ul' : numbered ? 'ol' : null;
    if (kind) {
      if (inList !== kind) {
        if (inList) parts.push(`</${inList}>`);
        parts.push(`<${kind}>`);
        inList = kind;
      }
      const content = (bullet ?? numbered)![1];
      parts.push(`<li>${applyInlineMarkdown(content) || '<br>'}</li>`);
      continue;
    }
    if (inList) {
      parts.push(`</${inList}>`);
      inList = null;
    }
    if (!line.trim()) {
      parts.push('<div><br></div>');
    } else {
      // Preserva indentação (Tab) com espaços não quebráveis no início
      const leading = line.match(/^[ \t]+/)?.[0] ?? '';
      const rest = line.slice(leading.length);
      const indentHtml = leading.replace(/ /g, '&nbsp;').replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
      parts.push(`<div>${indentHtml}${applyInlineMarkdown(rest)}</div>`);
    }
  }
  if (inList) parts.push(`</${inList}>`);
  return parts.join('');
}

function isUnderlineElement(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === 'u' || tag === 'ins') return true;
  const styleAttr = el.getAttribute('style') || '';
  if (/text-decoration[^;]*underline/i.test(styleAttr)) return true;
  const deco = `${el.style?.textDecoration || ''} ${el.style?.textDecorationLine || ''}`.toLowerCase();
  return deco.includes('underline');
}

function isBoldElement(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === 'strong' || tag === 'b') return true;
  const weight = el.style?.fontWeight || '';
  if (weight === 'bold' || weight === '700' || Number(weight) >= 600) return true;
  const styleAttr = el.getAttribute('style') || '';
  return /font-weight\s*:\s*(bold|[6-9]00)/i.test(styleAttr);
}

function isItalicElement(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === 'em' || tag === 'i') return true;
  const styleAttr = el.getAttribute('style') || '';
  if (/font-style\s*:\s*italic/i.test(styleAttr)) return true;
  return (el.style?.fontStyle || '').toLowerCase() === 'italic';
}

type ActiveStyles = { bold: boolean; italic: boolean; underline: boolean };

/** Serializa o HTML do editor de volta para markdown compatível com preview/PDF. */
export function commentHtmlToMarkdown(root: HTMLElement): string {
  const blocks: string[] = [];

  // Processa filhos aplicando apenas os estilos que ESTE nível introduz
  // (evita duplicar marcadores quando o navegador aninha <i><i>, <b><span bold>, etc.).
  const walkChildren = (node: Node, active: ActiveStyles): string =>
    Array.from(node.childNodes)
      .map((child) => walkInline(child, active))
      .join('');

  const walkInline = (node: Node, active: ActiveStyles): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent ?? '';
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === 'br') return '';

    if (tag === 'a') {
      const href = el.getAttribute('href') || '';
      const label = walkChildren(el, active);
      return /^(https?:\/\/|mailto:)/i.test(href) && label ? `[${label}](${href})` : label;
    }

    const nowBold = active.bold || isBoldElement(el);
    const nowItalic = active.italic || isItalicElement(el);
    const nowUnder = active.underline || isUnderlineElement(el);

    let out = walkChildren(el, {
      bold: nowBold,
      italic: nowItalic,
      underline: nowUnder,
    });
    if (!out) return '';

    // Envolve só o que for NOVO neste elemento
    if (!active.italic && nowItalic) out = `*${out}*`;
    if (!active.bold && nowBold) out = `**${out}**`;
    if (!active.underline && nowUnder) out = `__${out}__`;
    return out;
  };

  const pushParagraph = (text: string) => {
    blocks.push(text.replace(/\u00a0/g, ' ').replace(/\s+$/g, ''));
  };

  const base: ActiveStyles = { bold: false, italic: false, underline: false };

  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent ?? '').replace(/\u00a0/g, ' ');
      if (t) pushParagraph(t);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === 'ul' || tag === 'ol') {
      let n = 0;
      for (const li of Array.from(el.children)) {
        if (li.tagName.toLowerCase() !== 'li') continue;
        n += 1;
        const marker = tag === 'ol' ? `${n}.` : '•';
        const text = walkChildren(li, base).replace(/\u00a0/g, ' ').trimEnd();
        blocks.push(text ? `${marker} ${text}` : `${marker} `);
      }
      return;
    }

    if (tag === 'li') {
      const text = walkChildren(el, base).replace(/\u00a0/g, ' ').trimEnd();
      blocks.push(text ? `• ${text}` : '• ');
      return;
    }

    if (tag === 'div' || tag === 'p') {
      const onlyList =
        el.children.length === 1 &&
        ['ul', 'ol'].includes(el.children[0].tagName.toLowerCase());
      if (onlyList) {
        visit(el.children[0]);
        return;
      }
      const text = walkInline(el, base).replace(/\u00a0/g, ' ');
      if (!text.trim() && el.querySelector('br') && !(el.textContent ?? '').trim()) {
        blocks.push('');
      } else {
        pushParagraph(text);
      }
      return;
    }

    if (tag === 'br') {
      blocks.push('');
      return;
    }

    if (
      isUnderlineElement(el) ||
      isBoldElement(el) ||
      isItalicElement(el) ||
      tag === 'span' ||
      tag === 'a'
    ) {
      pushParagraph(walkInline(el, base).replace(/\u00a0/g, ' '));
      return;
    }

    for (const child of Array.from(el.childNodes)) visit(child);
  };

  for (const child of Array.from(root.childNodes)) visit(child);

  while (blocks.length > 0 && blocks[blocks.length - 1] === '') blocks.pop();
  return blocks.join('\n');
}

function isEditorVisuallyEmpty(el: HTMLElement): boolean {
  const text = (el.textContent ?? '').replace(/\u00a0/g, ' ').trim();
  return !text;
}

/** Preview do comentário (fora do campo / resumo) — mesmo HTML do editor, sem mostrar ** ou __. */
export function LicitacaoCommentFormatted({
  text,
  className = '',
}: {
  text: string;
  className?: string;
}) {
  const html = commentMarkdownToHtml(text);
  if (!html) return null;
  return (
    <div
      className={`leading-relaxed [&_b]:font-bold [&_em]:italic [&_i]:italic [&_li]:my-0.5 [&_strong]:font-bold [&_u]:underline [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-red-600 [&_a]:underline dark:[&_a]:text-red-400 ${className}`}
      style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  /** Barra de formatação (negrito, itálico, sublinhado, lista) no estilo Google Docs. */
  toolbar?: boolean;
};

/**
 * Editor de comentário com negrito (Ctrl+B), sublinhado (Ctrl+U), Tab e lista "-"+espaço.
 */
export function LicitacaoCommentEditor({
  value,
  onChange,
  disabled,
  placeholder = 'Comentário…',
  className = '',
  toolbar = false,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const lastEmittedRef = useRef(value);
  const focusedRef = useRef(false);
  const [showPlaceholder, setShowPlaceholder] = useState(!value.trim());
  const [active, setActive] = useState({
    bold: false,
    italic: false,
    underline: false,
    list: false,
    olist: false,
  });
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const savedRangeRef = useRef<Range | null>(null);

  useEffect(() => {
    if (!toolbar) return;
    const update = () => {
      const el = ref.current;
      const sel = window.getSelection();
      if (!el || !sel || !sel.anchorNode || !el.contains(sel.anchorNode)) return;
      setActive({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        list: document.queryCommandState('insertUnorderedList'),
        olist: document.queryCommandState('insertOrderedList'),
      });
    };
    document.addEventListener('selectionchange', update);
    return () => document.removeEventListener('selectionchange', update);
  }, [toolbar]);

  const runCommand = (cmd: string) => {
    if (disabled) return;
    ref.current?.focus();
    document.execCommand(cmd, false);
    emitFromDom();
  };

  const syncPlaceholder = useCallback(() => {
    const el = ref.current;
    setShowPlaceholder(!el || (isEditorVisuallyEmpty(el) && !el.querySelector('li')));
  }, []);

  const writeHtmlFromMarkdown = useCallback(
    (md: string) => {
      const el = ref.current;
      if (!el) return;
      el.innerHTML = commentMarkdownToHtml(md);
      syncPlaceholder();
    },
    [syncPlaceholder]
  );

  const emitFromDom = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const md = commentHtmlToMarkdown(el);
    syncPlaceholder();
    if (md === lastEmittedRef.current) return;
    lastEmittedRef.current = md;
    onChange(md);
  }, [onChange, syncPlaceholder]);

  const openLinkInput = () => {
    if (disabled) return;
    const sel = window.getSelection();
    savedRangeRef.current =
      sel && sel.rangeCount && ref.current?.contains(sel.anchorNode)
        ? sel.getRangeAt(0).cloneRange()
        : null;
    setLinkUrl('');
    setLinkOpen(true);
  };

  const applyLink = () => {
    const raw = linkUrl.trim();
    setLinkOpen(false);
    if (!raw) return;
    const url = /^(https?:\/\/|mailto:)/i.test(raw) ? raw : `https://${raw}`;
    if (!/^(https?:\/\/|mailto:)[^\s"<>]+$/i.test(url)) return;
    const el = ref.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (sel && savedRangeRef.current) {
      sel.removeAllRanges();
      sel.addRange(savedRangeRef.current);
    }
    if (sel && sel.isCollapsed) {
      const label = url.replace(/^(https?:\/\/|mailto:)/i, '');
      document.execCommand(
        'insertHTML',
        false,
        `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>&nbsp;`,
      );
    } else {
      document.execCommand('createLink', false, url);
    }
    emitFromDom();
  };

  // Hidrata / normaliza quando não está focado (evita mostrar __cru__ no editor).
  useEffect(() => {
    const el = ref.current;
    if (!el || focusedRef.current) return;
    lastEmittedRef.current = value;
    writeHtmlFromMarkdown(value);
  }, [value, writeHtmlFromMarkdown]);

  const tryStartBulletFromHyphen = (): boolean => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return false;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return false;

    const text = node.textContent ?? '';
    const offset = range.startOffset;
    const before = text.slice(0, offset);
    const lineStart = before.lastIndexOf('\n') + 1;
    const lineBefore = before.slice(lineStart);
    if (!/^[ \t]*-$/.test(lineBefore)) return false;

    const indent = lineBefore.match(/^[ \t]*/)?.[0] ?? '';
    const newBefore = before.slice(0, lineStart) + `${indent}• `;
    node.textContent = newBefore + text.slice(offset);

    const pos = newBefore.length;
    const next = document.createRange();
    next.setStart(node, Math.min(pos, node.textContent?.length ?? pos));
    next.collapse(true);
    sel.removeAllRanges();
    sel.addRange(next);

    emitFromDom();
    return true;
  };

  const tryContinueBulletOnEnter = (): boolean => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return false;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return false;

    const text = node.textContent ?? '';
    const offset = range.startOffset;
    const before = text.slice(0, offset);
    const lineStart = before.lastIndexOf('\n') + 1;
    const lineBefore = before.slice(lineStart);
    const bulletMatch = lineBefore.match(/^([ \t]*)•\s?(.*)$/);
    if (!bulletMatch) return false;

    const [, indent, rest] = bulletMatch;
    if (!rest.trim()) {
      const newBefore = before.slice(0, lineStart);
      node.textContent = newBefore + '\n' + text.slice(offset);
      const pos = newBefore.length + 1;
      const next = document.createRange();
      next.setStart(node, Math.min(pos, node.textContent?.length ?? pos));
      next.collapse(true);
      sel.removeAllRanges();
      sel.addRange(next);
      emitFromDom();
      return true;
    }

    const newText = before + `\n${indent}• ` + text.slice(offset);
    node.textContent = newText;
    const pos = before.length + 1 + indent.length + 2;
    const next = document.createRange();
    next.setStart(node, Math.min(pos, node.textContent?.length ?? pos));
    next.collapse(true);
    sel.removeAllRanges();
    sel.addRange(next);
    emitFromDom();
    return true;
  };

  const tryOutdentCurrentLine = () => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return;

    const text = node.textContent ?? '';
    const offset = range.startOffset;
    const before = text.slice(0, offset);
    const lineStart = before.lastIndexOf('\n') + 1;
    const lineBefore = before.slice(lineStart);
    const leading = lineBefore.match(/^[ \t]{1,4}/)?.[0];
    if (!leading) return;

    const removeLen = leading.length;
    node.textContent = text.slice(0, lineStart) + text.slice(lineStart + removeLen);
    const pos = Math.max(lineStart, offset - removeLen);
    const next = document.createRange();
    next.setStart(node, Math.min(pos, node.textContent?.length ?? pos));
    next.collapse(true);
    sel.removeAllRanges();
    sel.addRange(next);
    emitFromDom();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) {
      e.preventDefault();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      document.execCommand('bold', false);
      emitFromDom();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u') {
      e.preventDefault();
      document.execCommand('underline', false);
      emitFromDom();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      document.execCommand('italic', false);
      emitFromDom();
      return;
    }

    if (e.key === ' ' && tryStartBulletFromHyphen()) {
      e.preventDefault();
      return;
    }

    if (e.key === 'Enter' && tryContinueBulletOnEnter()) {
      e.preventDefault();
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        tryOutdentCurrentLine();
      } else {
        document.execCommand('insertText', false, '    ');
        emitFromDom();
      }
    }
  };

  type ToolbarItem = {
    key: string;
    label: string;
    Icon: typeof Bold;
    on?: boolean;
    run: () => void;
  };
  const toolbarGroups: ToolbarItem[][] = [
    [
      { key: 'undo', label: 'Desfazer (Ctrl+Z)', Icon: Undo2, run: () => runCommand('undo') },
      { key: 'redo', label: 'Refazer (Ctrl+Y)', Icon: Redo2, run: () => runCommand('redo') },
    ],
    [
      { key: 'bold', label: 'Negrito (Ctrl+B)', Icon: Bold, on: active.bold, run: () => runCommand('bold') },
      { key: 'italic', label: 'Itálico (Ctrl+I)', Icon: Italic, on: active.italic, run: () => runCommand('italic') },
      { key: 'underline', label: 'Sublinhado (Ctrl+U)', Icon: Underline, on: active.underline, run: () => runCommand('underline') },
    ],
    [
      { key: 'ul', label: 'Lista com marcadores', Icon: List, on: active.list, run: () => runCommand('insertUnorderedList') },
      { key: 'ol', label: 'Lista numerada', Icon: ListOrdered, on: active.olist, run: () => runCommand('insertOrderedList') },
    ],
    [{ key: 'link', label: 'Inserir link', Icon: Link2, on: linkOpen, run: openLinkInput }],
  ];

  const editor = (
    <div className="relative">
      {showPlaceholder ? (
        <span
          aria-hidden
          className={`pointer-events-none absolute text-gray-400 dark:text-gray-500 ${toolbar ? 'left-3 top-2.5 text-sm' : 'left-2 top-1.5 text-xs'}`}
        >
          {placeholder}
        </span>
      ) : null}
      <div
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        aria-disabled={disabled || undefined}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onFocus={() => {
          focusedRef.current = true;
        }}
        onBlur={() => {
          focusedRef.current = false;
          const el = ref.current;
          if (el) {
            const md = commentHtmlToMarkdown(el);
            lastEmittedRef.current = md;
            // Normaliza o DOM: <u>texto</u> em vez de __texto__ cru
            writeHtmlFromMarkdown(md);
            onChange(md);
          }
        }}
        onInput={emitFromDom}
        onKeyDown={onKeyDown}
        className={`w-full overflow-auto text-gray-900 outline-none dark:text-gray-100 ${
          toolbar
            ? 'min-h-[7.5rem] bg-transparent px-3 py-2.5 text-sm leading-relaxed'
            : 'min-h-[4.5rem] rounded border border-gray-200 bg-white px-2 py-1.5 text-xs leading-relaxed focus:border-red-400 focus:ring-1 focus:ring-red-400 dark:border-gray-600 dark:bg-gray-900'
        } [&_b]:font-bold [&_em]:italic [&_i]:italic [&_li]:my-0.5 [&_strong]:font-bold [&_u]:underline [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-red-600 [&_a]:underline ${
          disabled ? 'cursor-not-allowed opacity-60' : ''
        } ${className}`}
        style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
      />
    </div>
  );

  if (!toolbar) return editor;

  return (
    <div className="overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-900">
      <div className="flex items-center gap-0.5 border-b border-gray-200 bg-gray-50 px-2 py-1 dark:border-gray-700 dark:bg-gray-800/60">
        {toolbarGroups.map((group, gi) => (
          <span key={gi} className="flex items-center gap-0.5">
            {gi > 0 ? <span className="mx-1 h-4 w-px bg-gray-300 dark:bg-gray-600" /> : null}
            {group.map(({ key, label, Icon, on, run }) => (
              <button
                key={key}
                type="button"
                title={label}
                aria-label={label}
                aria-pressed={on}
                disabled={disabled}
                onMouseDown={(e) => e.preventDefault()}
                onClick={run}
                className={`rounded p-1.5 transition-colors ${
                  on
                    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                    : 'text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700'
                }`}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </span>
        ))}
      </div>
      {linkOpen ? (
        <div className="flex items-center gap-2 border-b border-gray-200 bg-white px-2 py-1.5 dark:border-gray-700 dark:bg-gray-900">
          <Link2 className="h-4 w-4 shrink-0 text-gray-400" />
          <input
            autoFocus
            type="text"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                applyLink();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setLinkOpen(false);
              }
            }}
            placeholder="Cole ou digite o endereço do link"
            className="min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100"
          />
          <button
            type="button"
            onClick={applyLink}
            className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            Aplicar
          </button>
        </div>
      ) : null}
      {editor}
    </div>
  );
}
