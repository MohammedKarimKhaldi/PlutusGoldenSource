import { Filter, Search, X } from "lucide-react";
import { FilterSelect } from "@/components/shared";
import { FUNDRAISING_CLIENT_STAGES, FUNDRAISING_CLIENT_STAGE_LABELS, FUNDRAISING_TARGET_STAGES, FUNDRAISING_TARGET_STAGE_LABELS } from "./fundraising-types";
import type { Company } from "@/lib/types";

type FundraisingFiltersProps = {
  query: string;
  onQueryChange: (value: string) => void;
  clientStageFilter: string;
  onClientStageFilterChange: (value: string) => void;
  targetStageFilter: string;
  onTargetStageFilterChange: (value: string) => void;
  companyFilter: string;
  onCompanyFilterChange: (value: string) => void;
  currencyFilter: string;
  onCurrencyFilterChange: (value: string) => void;
  investorTypeFilter: string;
  onInvestorTypeFilterChange: (value: string) => void;
  clientCompanies: { id: string; name: string }[];
  currencies: string[];
  investorTypes: string[];
  filterCount: number;
  onClearFilters: () => void;
};

export function FundraisingFilters({
  query, onQueryChange,
  clientStageFilter, onClientStageFilterChange,
  targetStageFilter, onTargetStageFilterChange,
  companyFilter, onCompanyFilterChange,
  currencyFilter, onCurrencyFilterChange,
  investorTypeFilter, onInvestorTypeFilterChange,
  clientCompanies, currencies, investorTypes,
  filterCount, onClearFilters,
}: FundraisingFiltersProps) {
  return (
    <>
      <div className="accounting-toolbar fundraising-toolbar">
        <label className="search-box accounting-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search clients, investors, next steps"
          />
        </label>
        {filterCount > 0 ? (
          <button type="button" className="text-button compact" onClick={onClearFilters}>
            <X size={13} /> Clear {filterCount} filter{filterCount > 1 ? "s" : ""}
          </button>
        ) : null}
      </div>

      <div className="accounting-filters">
        <FilterSelect
          value={clientStageFilter}
          onChange={onClientStageFilterChange}
          label="Client stage"
          options={FUNDRAISING_CLIENT_STAGES.map((stage) => FUNDRAISING_CLIENT_STAGE_LABELS[stage])}
          optionValues={[...FUNDRAISING_CLIENT_STAGES]}
        />
        <FilterSelect
          value={targetStageFilter}
          onChange={onTargetStageFilterChange}
          label="Target stage"
          options={FUNDRAISING_TARGET_STAGES.map((stage) => FUNDRAISING_TARGET_STAGE_LABELS[stage])}
          optionValues={[...FUNDRAISING_TARGET_STAGES]}
        />
        <FilterSelect
          value={companyFilter}
          onChange={onCompanyFilterChange}
          label="Client company"
          options={clientCompanies.map((c) => c.name)}
          optionValues={clientCompanies.map((c) => c.id)}
        />
        <FilterSelect value={currencyFilter} onChange={onCurrencyFilterChange} label="Currency" options={currencies} />
        <FilterSelect value={investorTypeFilter} onChange={onInvestorTypeFilterChange} label="Investor type" options={investorTypes} />
      </div>
    </>
  );
}
