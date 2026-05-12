import { Check, X } from "lucide-react";

type VoidTarget = {
  action: "void" | "delete";
  entityType: "document" | "ledger_entry";
  id: string;
  title: string;
};

export function AccountingVoidDialog({
  target,
  reason,
  setReason,
  isSaving,
  onConfirm,
  onClose,
}: {
  target: VoidTarget | null;
  reason: string;
  setReason: (reason: string) => void;
  isSaving: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (!target) return null;

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="contact-editor accounting-void-dialog" role="dialog" aria-modal="true" aria-labelledby="accounting-void-title">
        <form
          className="contact-editor-form"
          onSubmit={(event) => {
            event.preventDefault();
            onConfirm();
          }}
        >
          <div className="contact-editor-header">
            <div>
              <p className="eyebrow">Accounting</p>
              <h2 id="accounting-void-title">{target.action === "delete" ? "Delete accounting record" : "Void accounting record"}</h2>
            </div>
            <button type="button" className="icon-button" onClick={onClose} title="Close accounting action dialog" disabled={isSaving}>
              <X size={16} />
            </button>
          </div>

          <p className="accounting-void-summary">
            {target.action === "delete" ? "Permanently delete" : "Void"} {target.entityType === "document" ? "document" : "ledger entry"}{" "}
            <strong>{target.title}</strong>.{" "}
            {target.action === "delete" ? "A snapshot and reason stay in the audit trail." : "The record stays in the audit trail."}
          </p>

          <label className="editor-field">
            {target.action === "delete" ? "Delete reason" : "Void reason"}
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={4}
              maxLength={1000}
              required
              autoFocus
              placeholder={target.action === "delete" ? "Reason for deleting this mistaken record" : "Reason for voiding this record"}
            />
          </label>

          <div className="contact-editor-footer">
            <button type="button" className="secondary-button" onClick={onClose} disabled={isSaving}>
              Cancel
            </button>
            <button type="submit" className="primary-button danger" disabled={reason.trim().length === 0 || isSaving}>
              <Check size={15} /> {isSaving ? (target.action === "delete" ? "Deleting..." : "Voiding...") : target.action === "delete" ? "Delete record" : "Void record"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
