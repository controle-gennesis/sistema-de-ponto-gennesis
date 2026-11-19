/**
 * Desconto da OC diluído nos preços unitários (proporcional ao valor de cada item, 4 casas).
 * A sobra de arredondamento vai para o item de menor quantidade, para o total bater com o mapa.
 * Mesma conta do envio ao TOTVS — manter igual a `diluirDescontoNosItens` (backend, PurchaseOrderService).
 */
export function diluirDescontoOc<T extends { quantidade: number; precoUnitario: number }>(
  itens: T[],
  desconto: number
): { items: T[]; aplicado: boolean; desconto: number; totalOriginal: number; totalComDesconto: number } {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const r4 = (n: number) => Math.round(n * 10000) / 10000;
  const totalOriginal = r2(itens.reduce((s, it) => s + it.quantidade * it.precoUnitario, 0));
  const d = r2(Number(desconto) || 0);
  if (!(d > 0) || !(totalOriginal > 0) || d >= totalOriginal) {
    return { items: itens, aplicado: false, desconto: 0, totalOriginal, totalComDesconto: totalOriginal };
  }
  const alvo = r2(totalOriginal - d);
  const fator = alvo / totalOriginal;
  const novos = itens.map((it) => ({ ...it, precoUnitario: r4(it.precoUnitario * fator) }));
  const soma = novos.reduce((s, it) => s + it.quantidade * it.precoUnitario, 0);
  const sobra = alvo - soma;
  if (Math.abs(sobra) >= 0.00005 && novos.length > 0) {
    let idx = 0;
    novos.forEach((it, i) => {
      if (it.quantidade < novos[idx].quantidade) idx = i;
    });
    const ajustado = r4(novos[idx].precoUnitario + sobra / novos[idx].quantidade);
    if (ajustado > 0) novos[idx] = { ...novos[idx], precoUnitario: ajustado };
  }
  const totalComDesconto = r2(novos.reduce((s, it) => s + it.quantidade * it.precoUnitario, 0));
  return { items: novos, aplicado: true, desconto: d, totalOriginal, totalComDesconto };
}
