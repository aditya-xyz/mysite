import { experiences } from "@/content";
import ToolkitIcon from "@/components/ToolkitIcon";
import { useEntrance } from "@/hooks/useEntrance";
const Tool = ({
  tool,
  index,
}: {
  tool: typeof experiences[number];
  index: number;
}) => {
  const entrance = useEntrance<HTMLDetailsElement>();
  return (
    <details
      ref={entrance.ref}
      data-entered={entrance.entered}
      className="tool-row entrance entrance-right"
      style={{ animationDelay: `${index * 65}ms` }}
    >
      <summary>
        <ToolkitIcon id={tool.id} />
        <span>{tool.title}</span>
        <span className="detail-plus" aria-hidden="true">
          +
        </span>
      </summary>
      <p>{tool.description}</p>
    </details>
  );
};
const Experience = () => (
  <section
    id="experience"
    className="toolkit-section section-pad"
    aria-labelledby="toolkit-title"
  >
    <div className="shell toolkit-layout">
      <div className="toolkit-intro">
        <p className="eyebrow">How I build</p>
        <h2 id="toolkit-title">
          A connected
          <br />
          <em>toolkit.</em>
        </h2>
        <p>
          Low-code where it fits. Custom code where it helps. I work across the
          stack to connect the pieces.
        </p>
      </div>
      <div className="toolkit-list">
        <p className="toolkit-hint">Open a tool to see how I use it.</p>
        {experiences.map((tool, index) => (
          <Tool tool={tool} index={index} key={tool.id} />
        ))}
      </div>
    </div>
  </section>
);
export default Experience;
