import { experiences } from "@/content";
import {
  HiOutlineCode,
  HiOutlineDatabase,
  HiOutlineLightningBolt,
  HiOutlineSwitchHorizontal,
  HiOutlineRefresh,
} from "react-icons/hi";
const icons = {
  apps: HiOutlineCode,
  functions: HiOutlineLightningBolt,
  automate: HiOutlineRefresh,
  data: HiOutlineDatabase,
  connectors: HiOutlineSwitchHorizontal,
};
const Experience = () => (
  <section
    id="experience"
    className="toolkit-section section-pad"
    aria-labelledby="toolkit-title"
  >
    <div className="shell toolkit-layout">
      <div className="toolkit-intro">
        <p className="eyebrow">02 / How I build</p>
        <h2 id="toolkit-title">
          The right tools.
          <br />
          <em>Connected.</em>
        </h2>
        <p>
          Low-code where it fits. Custom code where it helps. I work across the
          stack to connect the pieces.
        </p>
        <div className="capability-list">
          <span>
            01 <strong>Business apps</strong>
          </span>
          <span>
            02 <strong>Workflow automation</strong>
          </span>
          <span>
            03 <strong>APIs & integrations</strong>
          </span>
        </div>
      </div>
      <div className="toolkit-list">
        <p className="toolkit-hint">Open a tool to see how I use it.</p>
        {experiences.map(({ id, title, src, icon, description }) => {
          const Icon = icon ? icons[icon as keyof typeof icons] : null;
          return (
            <details className="tool-row" key={id}>
              <summary>
                {src ? (
                  <img src={src} alt="" loading="lazy" />
                ) : Icon ? (
                  <Icon aria-hidden="true" />
                ) : null}
                <span>{title}</span>
                <span className="detail-plus" aria-hidden="true">
                  +
                </span>
              </summary>
              <p>{description}</p>
            </details>
          );
        })}
      </div>
    </div>
  </section>
);
export default Experience;
