import React from 'react';
import { SalaryAdjustment, AdjustmentType } from '@/types';
import { Edit, Trash2, AlertTriangle } from 'lucide-react';

interface AdjustmentsListProps {
  adjustments: SalaryAdjustment[];
  onEdit: (adjustment: SalaryAdjustment) => void;
  onDelete: (id: string) => void;
}

const getTypeColor = (type: AdjustmentType): string => {
  const colors = {
    BONUS: 'text-green-600 bg-green-50',
    OVERTIME: 'text-blue-600 bg-blue-50',
    COMMISSION: 'text-purple-600 bg-purple-50',
    OTHER: 'text-gray-600 bg-gray-50'
  };
  return colors[type] || colors.OTHER;
};

const getTypeLabel = (type: AdjustmentType): string => {
  const labels = {
    BONUS: 'Bônus/Prêmio',
    OVERTIME: 'Horas Extras',
    COMMISSION: 'Comissão',
    OTHER: 'Outros'
  };
  return labels[type] || 'Outros';
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export function AdjustmentsList({ adjustments, onEdit, onDelete }: AdjustmentsListProps) {
  if (adjustments.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500 bg-gray-50">
        <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-gray-400" />
        Nenhum acréscimo registrado
      </div>
    );
  }

  const total = adjustments.reduce((sum, a) => sum + Number(a.amount || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-2 pb-1">
        <div className="text-xs text-gray-500">{adjustments.length} registro{adjustments.length > 1 ? 's' : ''}</div>
        <div className="text-xs"><span className="text-gray-500 mr-1">Total:</span><span className="font-semibold text-green-600">R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
      </div>

      {adjustments.map((adjustment) => (
        <div key={adjustment.id} className="group rounded-xl border border-gray-200 bg-white px-4 py-3 hover:bg-gray-50 transition-colors">
          <div className="grid grid-cols-[auto,1fr,auto,auto] items-center gap-3">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getTypeColor(adjustment.type)}`}>{getTypeLabel(adjustment.type)}</span>
            <div className="min-w-0">
              <p className="text-sm text-gray-900 truncate">{adjustment.description}</p>
              <div className="text-xs text-gray-500 truncate">{`Criado por ${adjustment.creator.name} • ${new Date(adjustment.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`}</div>
            </div>
            <div className="text-sm font-semibold text-green-600">+R$ {adjustment.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
              <button onClick={() => onEdit(adjustment)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md" title="Editar">
                <Edit className="w-4 h-4" />
              </button>
              <button onClick={() => onDelete(adjustment.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-md" title="Excluir">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
