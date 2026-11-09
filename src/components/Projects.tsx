import { projects } from "@/content";
import {
  FiArrowUpRight,
  FiCode,
  FiLayers,
  FiMousePointer,
} from "react-icons/fi";
const features = [
  {
    id: 1,
    label: "Full-stack exploration",
    title: "From interface to API.",
    description:
      "An exploration of a MERN application, with a write-up and backend source to dig into.",
    type: "01",
    Icon: FiLayers,
    style: "coral",
    words: ["INTERFACE", "LOGIC", "DATA"],
  },
  {
    id: 5,
    label: "Motion & interaction",
    title: "Navigation that follows along.",
    description:
      "Using Framer Motion to highlight navigation as you move through a page.",
    type: "02",
    Icon: FiMousePointer,
    style: "teal",
    words: ["SCROLL", "OBSERVE", "RESPOND"],
  },
  {
    id: 3,
    label: "React fundamentals",
    title: "Small screens. Thoughtful navigation.",
    description:
      "Building a responsive navigation bar for a React app, step by step.",
    type: "03",
    Icon: FiCode,
    style: "ochre",
    words: ["DESKTOP", "TABLET", "MOBILE"],
  },
];
const Projects = () => (
  <section
    id="projects"
    className="work-section section-pad"
    aria-labelledby="work-title"
  >
    <div className="shell">
      <div className="section-heading">
        <div>
          <p className="eyebrow">01 / Selected builds & writing</p>
          <h2 id="work-title">
            Made to work.
            <br />
            <em>Shared to learn.</em>
          </h2>
        </div>
        <p className="section-aside">
          A few experiments from my web development journey. Code, lessons, and
          the details along the way.
        </p>
      </div>
      <div className="work-grid">
        {features.map(
          ({ id, label, title, description, type, Icon, style, words }) => {
            const project = projects.find((p) => p.id === id)!;
            return (
              <article className="work-item" key={id}>
                <a
                  className={`project-art ${style}`}
                  href={project.mediumUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Read ${project.title} (opens in a new tab)`}
                >
                  <div className="art-meta">
                    <span>FIELD NOTES / {type}</span>
                    <FiArrowUpRight aria-hidden="true" />
                  </div>
                  <Icon className="art-icon" aria-hidden="true" />
                  <div className="art-words" aria-hidden="true">
                    {words.map((word) => (
                      <span key={word}>
                        {word}
                        <span className="art-dot">.</span>
                      </span>
                    ))}
                  </div>
                  <span className="art-caption">
                    An Aditya Patil experiment
                  </span>
                </a>
                <p className="project-category">{label}</p>
                <h3>{title}</h3>
                <p className="project-description">{description}</p>
                <div className="project-links">
                  <a
                    href={project.mediumUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Read the story <FiArrowUpRight aria-hidden="true" />
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                  <a
                    href={project.githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Source code <FiArrowUpRight aria-hidden="true" />
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </div>
              </article>
            );
          }
        )}
      </div>
      <details className="writing-archive">
        <summary>
          More from the notebook <span>02 more articles</span>
        </summary>
        <div>
          {projects
            .filter((p) => p.id === 2 || p.id === 4)
            .map((p) => (
              <a
                href={p.mediumUrl}
                key={p.id}
                target="_blank"
                rel="noopener noreferrer"
              >
                {p.title}
                <FiArrowUpRight aria-hidden="true" />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ))}
        </div>
      </details>
    </div>
  </section>
);
export default Projects;
