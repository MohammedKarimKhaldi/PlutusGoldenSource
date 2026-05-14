import clsx from "clsx";

export function PipelineStrip({
  pipelineCounts,
  stageFilters,
  onStageClick,
}: {
  pipelineCounts: { stage: string; count: number }[];
  stageFilters: Set<string>;
  onStageClick: (stage: string) => void;
}) {
  return (
    <section className="pipeline-strip" aria-label="Pipeline stages">
      {pipelineCounts.map((item) => (
        <button
          key={item.stage}
          type="button"
          className={clsx("pipeline-pill", stageFilters.has(item.stage) && "active")}
          onClick={() => onStageClick(item.stage)}
          title={`Filter ${item.stage}`}
        >
          <span>{item.stage}</span>
          <strong>{item.count}</strong>
        </button>
      ))}
    </section>
  );
}
