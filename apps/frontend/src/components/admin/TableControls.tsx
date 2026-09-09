import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type SortDirection = 'asc' | 'desc';

interface SortableHeaderProps {
  label: string;
  field: string;
  sortBy: string;
  sortOrder: SortDirection;
  onSort: (field: string) => void;
  align?: 'left' | 'center' | 'right';
}

export function SortableHeader({ label, field, sortBy, sortOrder, onSort, align = 'left' }: SortableHeaderProps) {
  const active = sortBy === field;
  const Icon = active ? (sortOrder === 'asc' ? ArrowUp : ArrowDown) : ChevronsUpDown;
  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  return (
    <th className={`px-4 py-3 font-medium text-cefide-muted ${alignClass}`} aria-sort={active ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(field)} className={`inline-flex items-center gap-1 hover:text-cefide-text ${align === 'right' ? 'ml-auto' : align === 'center' ? 'mx-auto' : ''}`}>
        {label}<Icon className="h-3.5 w-3.5" />
      </button>
    </th>
  );
}

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  itemLabel: string;
  pluralLabel?: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

export function PaginationControls({ page, totalPages, total, pageSize, itemLabel, pluralLabel, onPageChange, onPageSizeChange }: PaginationControlsProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-cefide-muted">{total} {total === 1 ? itemLabel : (pluralLabel ?? `${itemLabel}s`)}</p>
      <div className="flex items-center gap-2">
        <span className="text-sm text-cefide-muted">Mostrar</span>
        <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
          <SelectTrigger className="h-9 w-[80px]"><SelectValue /></SelectTrigger>
          <SelectContent>{[5, 10, 20, 100].map((value) => <SelectItem key={value} value={String(value)}>{value}</SelectItem>)}</SelectContent>
        </Select>
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Anterior</Button>
        <span className="px-2 text-sm text-cefide-muted">{page} / {Math.max(totalPages, 1)}</span>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Siguiente</Button>
      </div>
    </div>
  );
}
