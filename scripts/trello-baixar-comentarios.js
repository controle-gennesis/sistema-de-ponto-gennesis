/**
 * Baixa TODOS os comentários de um quadro do Trello (a exportação do menu corta nas últimas
 * 1000 ações) e grava um novo JSON: o seu export original + todos os comentários.
 *
 * Uso (no terminal, na pasta do projeto):
 *   node scripts/trello-baixar-comentarios.js "C:\caminho\do\export.json"
 *
 * O script pergunta a chave e o token da API do Trello (não ficam gravados em nenhum arquivo).
 * Saída: o mesmo arquivo com sufixo "-completo.json", pronto para importar no Tasks.
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const input = process.argv[2];
if (!input || !fs.existsSync(input)) {
  console.error('Informe o caminho do JSON exportado do Trello.');
  console.error('Exemplo: node scripts/trello-baixar-comentarios.js "C:\\Users\\voce\\Downloads\\quadro.json"');
  process.exit(1);
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    }),
  );
}

async function fetchJson(url) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const res = await fetch(url);
    if (res.status === 429) {
      // Limite de requisições do Trello: espera e tenta de novo.
      await new Promise((r) => setTimeout(r, 4000 * attempt));
      continue;
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Trello respondeu ${res.status}: ${body.slice(0, 200)}`);
    }
    return res.json();
  }
  throw new Error('Trello recusou várias vezes (limite de requisições). Tente de novo em alguns minutos.');
}

(async () => {
  const board = JSON.parse(fs.readFileSync(input, 'utf8'));
  const boardId = board.id;
  if (!boardId) throw new Error('O JSON não tem o id do quadro (campo "id").');

  const key = await ask('Chave da API do Trello: ');
  const token = await ask('Token do Trello: ');
  if (!key || !token) throw new Error('Chave e token são obrigatórios.');

  const have = new Set((board.actions || []).map((a) => a.id));
  const all = [];
  let before = '';
  for (let page = 1; page <= 60; page += 1) {
    const url =
      `https://api.trello.com/1/boards/${boardId}/actions?filter=commentCard&limit=1000` +
      `&key=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}` +
      (before ? `&before=${encodeURIComponent(before)}` : '');
    const rows = await fetchJson(url);
    all.push(...rows);
    console.log(`Página ${page}: ${rows.length} comentários (total ${all.length})`);
    if (rows.length < 1000) break;
    // As ações vêm da mais nova para a mais antiga: a última da página é a mais antiga.
    before = rows[rows.length - 1].id;
  }

  const novos = all.filter((a) => !have.has(a.id));
  board.actions = [...(board.actions || []), ...novos];

  const out = path.join(
    path.dirname(input),
    path.basename(input, path.extname(input)) + '-completo.json',
  );
  fs.writeFileSync(out, JSON.stringify(board));
  console.log('');
  console.log(`Comentários baixados: ${all.length} (já estavam no arquivo: ${all.length - novos.length}).`);
  console.log(`Gravado em: ${out}`);
})().catch((e) => {
  console.error('Erro:', e.message);
  process.exit(1);
});
