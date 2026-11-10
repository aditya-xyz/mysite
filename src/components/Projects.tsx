import { projects } from "@/content";
import { FiArrowUpRight } from "react-icons/fi";
const Projects = () => (
  <section
    id="projects"
    className="work-section section-pad"
    aria-labelledby="work-title"
  >
    <div className="shell">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Work & writing</p>
          <h2 id="work-title">
            Built & <em>shared.</em>
          </h2>
        </div>
        <p className="section-aside">
          Stories from building apps, connecting data, and making room for the
          little moments. The decisions and lessons along the way.
        </p>
      </div>
      <div className="work-grid">
        {projects.map((project) => (
          <article className="work-item" key={project.id}>
            <img
              className="project-cover"
              src={project.src}
              alt=""
              width="1200"
              height="675"
              loading="lazy"
              decoding="async"
            />
            <p className="project-category">{project.category}</p>
            <h3>{project.title}</h3>
            <p className="project-description">{project.description}</p>
            <div className="project-links">
              <a
                href={project.mediumUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Read the story <FiArrowUpRight aria-hidden="true" />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              {project.githubUrl && (
                <a
                  href={project.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Source code <FiArrowUpRight aria-hidden="true" />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  </section>
);
export default Projects;
