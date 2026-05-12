import { ListChecks, Plus } from "lucide-react";
import { formatNumber, formatDate } from "@/components/shared";
import type { Company } from "@/lib/types";

type TaskRow = {
  task: { id: string; title: string; dueDate: string | null };
  company: Company;
};

export function TasksView({
  taskRows,
  openCompany,
}: {
  taskRows: TaskRow[];
  openCompany: (id: string) => void;
}) {
  return (
    <section className="view-surface">
      <div className="surface-header">
        <div>
          <p className="eyebrow">Tasks</p>
          <h2>{formatNumber(taskRows.length)} open next steps</h2>
        </div>
        <button type="button" className="secondary-button">
          <Plus size={15} /> New task
        </button>
      </div>
      <div className="task-list">
        {taskRows.map(({ task, company }) => (
          <article key={task.id} className="task-row">
            <ListChecks size={18} />
            <div>
              <strong>{task.title}</strong>
              <span>{company.name}</span>
            </div>
            <span>{task.dueDate ? formatDate(task.dueDate) : "No due date"}</span>
            <button type="button" className="text-button" onClick={() => openCompany(company.id)}>
              Open company
            </button>
          </article>
        ))}
        {taskRows.length === 0 ? <p className="empty-state">No open tasks yet.</p> : null}
      </div>
    </section>
  );
}
