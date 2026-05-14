import { GitMerge } from "lucide-react";
import clsx from "clsx";
import { formatCompanyWebsites } from "@/components/shared";
import type { Company } from "@/lib/types";

export function CompanyMergePanel({
  companyMergeTarget,
  selectedCompanies,
  closeCompanyMerge,
  setCompanyMergeTargetId,
  handleCompanyMerge,
  companyMergeSources,
}: {
  companyMergeTarget: Company | null;
  selectedCompanies: Company[];
  closeCompanyMerge: () => void;
  setCompanyMergeTargetId: (id: string | null) => void;
  handleCompanyMerge: () => void;
  companyMergeSources: Company[];
}) {
  if (!companyMergeTarget) return null;
  return (
    <div className="people-merge-panel company-merge-panel">
      <div className="people-merge-header">
        <div>
          <strong>Merge {selectedCompanies.length} selected companies</strong>
          <span>Websites, people, tags, activity, notes, tasks, and outreach history will move onto it.</span>
        </div>
        <button type="button" className="secondary-button" onClick={closeCompanyMerge}>
          Cancel
        </button>
      </div>
      <div className="people-merge-list">
        {selectedCompanies.map((company) => (
          <article key={company.id} className="merge-candidate-row company-merge-row">
            <label className="merge-keeper-option">
              <input
                type="radio"
                checked={companyMergeTarget.id === company.id}
                onChange={() => setCompanyMergeTargetId(company.id)}
                aria-label={`Keep ${company.name}`}
              />
              <span>
                <strong>{company.name}</strong>
                {formatCompanyWebsites(company)} • {company.people.length} people • {company.activities.length} activities
              </span>
            </label>
            <div className="tag-list">
              {company.tags.slice(0, 3).map((item) => (
                <span key={item.id} className="tag-chip" style={{ "--tag-color": item.color } as React.CSSProperties}>
                  {item.name}
                </span>
              ))}
              {company.tags.length > 3 ? <span className="email-more">+{company.tags.length - 3}</span> : null}
            </div>
          </article>
        ))}
      </div>
      <div className="company-merge-actions">
        <button type="button" className="primary-button" onClick={handleCompanyMerge} disabled={companyMergeSources.length === 0}>
          <GitMerge size={15} /> Queue merge
        </button>
      </div>
    </div>
  );
}
