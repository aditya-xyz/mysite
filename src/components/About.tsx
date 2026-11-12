import { FiArrowUpRight, FiCoffee, FiCamera, FiCompass } from "react-icons/fi";
import { useEntrance } from "@/hooks/useEntrance";
const About = () => {
  const entrance = useEntrance<HTMLElement>();
  return (
    <section
      id="about"
      className="about-section section-pad"
      aria-labelledby="about-title"
    >
      <div className="shell about-layout">
        <div>
          <p className="eyebrow">About</p>
          <h2 id="about-title">
            A little <em>about me.</em>
          </h2>
          <div className="about-copy">
            <p>
              I’m a Microsoft Power Platform professional who loves working with
              code. My work spans business apps, Dataverse, automation, and
              Azure, with React and TypeScript in the mix.
            </p>
            <p>
              I enjoy figuring out how the pieces fit: a custom interface, a
              useful API, or a workflow that handles the repetitive steps. The
              goal is something useful, understandable, and easy to work with.
            </p>
            <p>
              These days, Southern California is home. Away from the keyboard,
              there’s usually a camera, a good coffee, or an adventure with my
              dog, Pixel.
            </p>
          </div>
          <a
            className="text-link"
            href="https://github.com/aditya-xyz"
            target="_blank"
            rel="noopener noreferrer"
          >
            See what I’m building <FiArrowUpRight aria-hidden="true" />
          </a>
        </div>
        <aside
          ref={entrance.ref}
          data-entered={entrance.entered}
          className="personal-note entrance entrance-left"
          aria-labelledby="personal-title"
        >
          <h3 id="personal-title">Away from the keyboard.</h3>
          <ul>
            <li>
              <FiCompass aria-hidden="true" />
              Trails & little adventures
            </li>
            <li>
              <FiCamera aria-hidden="true" />
              Photos of the everyday
            </li>
            <li>
              <FiCoffee aria-hidden="true" />
              Always time for coffee
            </li>
          </ul>
        </aside>
      </div>
    </section>
  );
};
export default About;
