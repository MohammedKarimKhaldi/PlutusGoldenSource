import { Check, Tags } from "lucide-react";
import clsx from "clsx";
import { formatNumber, formatChangeCount } from "@/components/shared";
import type { TagSummary } from "@/components/shared";

export function TagsView({
  tagSummaries,
  tagDrafts,
  setTagDrafts,
  renameTag,
  pendingChanges,
}: {
  tagSummaries: TagSummary[];
  tagDrafts: Record<string, string>;
  setTagDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  renameTag: (summary: TagSummary) => void;
  pendingChanges: { length: number };
}) {
  return (
    <section className="view-surface">
      <div className="surface-header">
        <div>
          <p className="eyebrow">Tags</p>
          <h2>{formatNumber(tagSummaries.length)} tags in use</h2>
        </div>
        <span>{formatChangeCount(pendingChanges.length)}</span>
      </div>
      <div className="tag-manager">
        {tagSummaries.map((summary) => (
          <article key={summary.key} className="tag-manager-row">
            <div>
              <span className={clsx("tag-type", summary.type)}>{summary.type === "company" ? "Company" : "Contact"}</span>
              <strong>{summary.name}</strong>
              <span>{formatNumber(summary.count)} {summary.type === "company" ? "companies" : "contacts"}</span>
            </div>
            <label className="tag-rename-field">
              <Tags size={15} />
              <input
                value={tagDrafts[summary.key] ?? summary.name}
                onChange={(event) => setTagDrafts((current) => ({ ...current, [summary.key]: event.target.value }))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    renameTag(summary);
                  }
                }}
              />
            </label>
            <button type="button" className="text-button" onClick={() => renameTag(summary)}>
              <Check size={14} /> Rename
            </button>
          </article>
        ))}
        {tagSummaries.length === 0 ? <p className="empty-state">No tags are in use yet.</p> : null}
      </div>
    </section>
  );
}
