"use client";
"use no memo";

import { useMemo, useRef, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type SortingState,
  type SortingFn,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import clsx from "clsx";

import type { Company } from "@/lib/types";
import { OUTREACH_STAGES } from "@/lib/types";

// Local format functions
function formatCompanyWebsites(company: { websiteDomains: string[]; country: string | null }): string {
  if (company.websiteDomains.length === 0) return company.country ?? "No domain";
  if (company.websiteDomains.length === 1) return company.websiteDomains[0];
  return `${company.websiteDomains[0]} +${company.websiteDomains.length - 1}`;
}

function formatDate(value: string | null): string {
  if (!value) return "No activity";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const textSortingFn: SortingFn<Company> = (rowA, rowB, columnId) => {
  const a = rowA.getValue(columnId) as string ?? "";
  const b = rowB.getValue(columnId) as string ?? "";
  return a.localeCompare(b);
};

const numberSortingFn: SortingFn<Company> = (rowA, rowB, columnId) => {
  const a = rowA.getValue(columnId) as number ?? 0;
  const b = rowB.getValue(columnId) as number ?? 0;
  return a - b;
};

const SOURCE_QUALITY_LABELS: Record<string, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
  review: "Review",
};

type CompaniesTableProps = {
  companies: Company[];
  activeCompanyId: string;
  selectedIds: Set<string>;
  onSelectCompany: (id: string) => void;
  onToggleSelection: (id: string) => void;
  onDoubleClickCompany?: (id: string) => void;
  stageFilter: Set<string>;
  onStageFilterChange: (set: Set<string>) => void;
  countryFilter: Set<string>;
  onCountryFilterChange: (set: Set<string>) => void;
  tagFilter: Set<string>;
  onTagFilterChange: (set: Set<string>) => void;
  qualityFilter: Set<string>;
  onQualityFilterChange: (set: Set<string>) => void;
};

export function CompaniesTable({
  companies,
  activeCompanyId,
  selectedIds,
  onSelectCompany,
  onToggleSelection,
  onDoubleClickCompany,
  stageFilter,
  onStageFilterChange,
  countryFilter,
  onCountryFilterChange,
  tagFilter,
  onTagFilterChange,
  qualityFilter,
  onQualityFilterChange,
}: CompaniesTableProps) {
  "use no memo";

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnSizing, setColumnSizing] = useState({});
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const lastClickTime = useRef(0);
  const lastClickId = useRef("");

  const columns = useMemo<ColumnDef<Company>[]>(
    () => [
      {
        id: "select",
        header: () => null,
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={selectedIds.has(row.original.id)}
            onChange={(event) => {
              event.stopPropagation();
              onToggleSelection(row.original.id);
            }}
            aria-label={`Select ${row.original.name}`}
          />
        ),
        size: 40,
        enableSorting: false,
        enableResizing: false,
      },
      {
        id: "name",
        header: "Company",
        accessorFn: (row) => row.name,
        cell: ({ row }) => (
          <div className="company-cell">
            <strong>{row.original.name}</strong>
            <span title={row.original.websiteDomains.join(", ")}>{formatCompanyWebsites(row.original)}</span>
          </div>
        ),
        sortingFn: textSortingFn,
        size: 240,
        enableResizing: true,
      },
      {
        id: "stage",
        header: "Stage",
        accessorFn: (row) => row.outreachStage,
        cell: ({ getValue }) => <span className="stage-badge">{getValue() as string}</span>,
        sortingFn: textSortingFn,
        size: 120,
        enableResizing: true,
      },
      {
        id: "tags",
        header: "Tags",
        accessorFn: (row) => row.tags.map((t) => t.name).join(","),
        cell: ({ row }) => (
          <div className="tag-list">
            {row.original.tags.slice(0, 3).map((item) => (
              <span key={item.id} className="tag-chip" style={{ "--tag-color": item.color } as React.CSSProperties}>
                {item.name}
              </span>
            ))}
            {row.original.tags.length > 3 ? <span className="email-more">+{row.original.tags.length - 3}</span> : null}
          </div>
        ),
        enableSorting: false,
        size: 180,
        enableResizing: true,
      },
      {
        id: "people",
        header: "People",
        accessorFn: (row) => row.people.length,
        cell: ({ getValue }) => getValue() as number,
        sortingFn: numberSortingFn,
        size: 80,
        enableResizing: true,
      },
      {
        id: "quality",
        header: "Quality",
        accessorFn: (row) => row.sourceQuality,
        cell: ({ getValue }) => {
          const quality = getValue() as string;
          return <span className={clsx("quality-pill", quality)}>{SOURCE_QUALITY_LABELS[quality] ?? quality}</span>;
        },
        sortingFn: textSortingFn,
        size: 100,
        enableResizing: true,
      },
      {
        id: "nextTask",
        header: "Next task",
        accessorFn: (row) => row.nextTask?.title ?? "",
        cell: ({ row }) => <span className="muted-cell">{row.original.nextTask?.title ?? "No open task"}</span>,
        sortingFn: textSortingFn,
        size: 180,
        enableResizing: true,
      },
      {
        id: "lastActivity",
        header: "Last touch",
        accessorFn: (row) => row.lastActivityAt ?? "",
        cell: ({ row }) => <span className="muted-cell">{formatDate(row.original.lastActivityAt)}</span>,
        sortingFn: textSortingFn,
        size: 120,
        enableResizing: true,
      },
    ],
    [selectedIds, onToggleSelection],
  );

  const table = useReactTable({
    data: companies,
    columns,
    state: { sorting, columnSizing },
    onSortingChange: setSorting,
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableSortingRemoval: false,
    enableColumnResizing: true,
    columnResizeMode: "onChange",
  });

  const { rows } = table.getRowModel();
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 54,
    overscan: 10,
    paddingEnd: 4,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  const allCountries = useMemo(() => [...new Set(companies.map((c) => c.country).filter(Boolean) as string[])].sort(), [companies]);
  const allTags = useMemo(() => [...new Set(companies.flatMap((c) => c.tags.map((t) => t.name)))].sort(), [companies]);
  const allQualities = ["high", "medium", "low", "review"];

  function toggleSetItem(set: Set<string>, value: string): Set<string> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  function FilterPopover({
    label,
    options,
    selected,
    onChange,
  }: {
    label: string;
    options: readonly string[];
    selected: Set<string>;
    onChange: (set: Set<string>) => void;
  }) {
    return (
      <div className="filter-popover">
        <strong>{label}</strong>
        <div className="filter-options">
          {options.map((option) => (
            <label key={option} className="filter-option">
              <input
                type="checkbox"
                checked={selected.has(option)}
                onChange={() => onChange(toggleSetItem(selected, option))}
              />
              {option}
            </label>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="companies-table-wrapper">
      <div className="table-toolbar">
        <FilterPopover label="Stage" options={OUTREACH_STAGES} selected={stageFilter} onChange={onStageFilterChange} />
        <FilterPopover label="Country" options={allCountries} selected={countryFilter} onChange={onCountryFilterChange} />
        <FilterPopover label="Tags" options={allTags} selected={tagFilter} onChange={onTagFilterChange} />
        <FilterPopover label="Quality" options={allQualities} selected={qualityFilter} onChange={onQualityFilterChange} />
      </div>
      <div className="company-table-wrap" ref={tableContainerRef}>
        <table className="company-table">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    style={{
                      width: header.getSize(),
                      cursor: header.column.getCanSort() ? "pointer" : undefined,
                      position: 'relative' as const,
                    }}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="th-content">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() ? (
                        <span className="sort-icon">
                          {{ asc: <ChevronUp size={14} />, desc: <ChevronDown size={14} /> }[header.column.getIsSorted() as string] ?? <ChevronsUpDown size={14} />}
                        </span>
                      ) : null}
                    </div>
                    {header.column.getCanResize() && (
                      <div
                        className="resize-handle"
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                      />
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody
            style={{
              display: "block",
              height: `${totalSize}px`,
              position: "relative",
            }}
          >
            {virtualItems.map((virtualRow) => {
              const row = rows[virtualRow.index] as Row<Company>;
              return (
                <tr
                  key={row.id}
                  className={clsx(activeCompanyId === row.original.id && "active-row")}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  onClick={() => {
                    const now = Date.now();
                    if (lastClickId.current === row.original.id && now - lastClickTime.current < 300) {
                      onDoubleClickCompany?.(row.original.id);
                      lastClickTime.current = 0;
                    } else {
                      onSelectCompany(row.original.id);
                      lastClickTime.current = now;
                      lastClickId.current = row.original.id;
                    }
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} style={{ width: cell.column.getSize() }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="table-footer">
        <span>Showing {rows.length} of {companies.length} companies</span>
      </div>
    </div>
  );
}
