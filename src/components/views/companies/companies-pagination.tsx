import { ChevronDown } from "lucide-react";
import { formatNumber } from "@/components/shared";

const PAGE_SIZE_OPTIONS = [50, 100, 250, 500, "all"] as const;

export function CompaniesPagination({
  companyStart,
  companyEnd,
  filteredCount,
  companyPageSize,
  onPageSizeChange,
  effectiveCompanyPage,
  companyTotalPages,
  onPrevPage,
  onNextPage,
  onFirstPage,
}: {
  companyStart: number;
  companyEnd: number;
  filteredCount: number;
  companyPageSize: string | number;
  onPageSizeChange: (value: string | number) => void;
  effectiveCompanyPage: number;
  companyTotalPages: number;
  onPrevPage: () => void;
  onNextPage: () => void;
  onFirstPage: () => void;
}) {
  return (
    <div className="company-countbar">
      <span>
        Showing {formatNumber(companyStart)}-{formatNumber(companyEnd)} of {formatNumber(filteredCount)}
      </span>
      <div className="people-pager">
        <label className="select-filter">
          <span>Show</span>
          <select
            value={String(companyPageSize)}
            onChange={(event) => {
              onFirstPage();
              onPageSizeChange(event.target.value);
            }}
          >
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={String(option)} value={String(option)}>
                {option === "all" ? "All" : option}
              </option>
            ))}
          </select>
          <ChevronDown size={14} />
        </label>
        <button type="button" className="pager-button" disabled={effectiveCompanyPage <= 1 || companyPageSize === "all"} onClick={onPrevPage}>
          Previous
        </button>
        <span>
          Page {formatNumber(effectiveCompanyPage)} / {formatNumber(companyTotalPages)}
        </span>
        <button
          type="button"
          className="pager-button"
          disabled={effectiveCompanyPage >= companyTotalPages || companyPageSize === "all"}
          onClick={onNextPage}
        >
          Next
        </button>
      </div>
    </div>
  );
}
