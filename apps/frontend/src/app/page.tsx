import { redirect } from 'next/navigation';

/**
 * A sessão JWT fica no browser (localStorage/sessionStorage), então o servidor
 * não sabe se o visitante está logado.
 *
 * Antes redirecionava para /ponto/home — caminho bloqueado no robots.txt.
 * O Google seguia o redirect e recusava a indexação da home.
 * Encaminhamos para o login (público e indexável); se houver sessão, a própria
 * tela de login restaura e manda para o app.
 */
export default function HomePage() {
  redirect('/auth/login');
}
