import { FiArrowUpRight, FiCoffee, FiCamera, FiCompass } from "react-icons/fi";
const About = () => (
  <section
    id="about"
    className="about-section section-pad"
    aria-labelledby="about-title"
  >
    <div className="shell about-layout">
      <div>
        <p className="eyebrow">03 / Beyond the job title</p>
        <h2 id="about-title">
          A builder’s mind.
          <br />
          <em>An explorer’s heart.</em>
        </h2>
        <div className="about-copy">
          <p>
            I’m a Microsoft Power Platform professional who loves working with
            code. My work spans business apps, Dataverse, automation, and Azure,
            with React and TypeScript in the mix.
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
      <aside className="personal-note" aria-labelledby="personal-title">
        <div className="note-top">
          <span>A NOTE FROM OFFLINE</span>
          <span>↗</span>
        </div>
        <h3 id="personal-title">
          More life.
          <br />
          More outside.
          <br />
          <em>More Pixel.</em>
        </h3>
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
        <a
          href="https://www.instagram.com/pixelthegsd/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Follow Pixel’s adventures <FiArrowUpRight aria-hidden="true" />
        </a>
        <span className="note-signature">See you out there, Aditya</span>
      </aside>
    </div>
  </section>
);
export default About;
