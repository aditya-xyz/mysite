import HeroImage from "@/assets/heroImage.png";
import { FiArrowDown, FiArrowUpRight } from "react-icons/fi";
import { linkedInUrl } from "@/socials";
const Home = () => (
  <section id="home" className="hero shell" aria-labelledby="home-title">
    <div className="hero-copy">
      <p className="eyebrow">
        <span className="location-dot" /> Southern California · Builder &
        explorer
      </p>
      <h1 id="home-title">
        Connecting
        <br />
        the dots.
        <br />
        <em>Building what’s next.</em>
      </h1>
      <p className="hero-intro">
        Hi, I’m Aditya. I bring apps, data, and automation together with Power
        Platform, Azure, and a little custom code.
      </p>
      <div className="hero-actions">
        <a className="button button-solid" href="#projects">
          Explore my work <FiArrowDown aria-hidden="true" />
        </a>
        <a
          className="text-link"
          href={linkedInUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Find me on LinkedIn <FiArrowUpRight aria-hidden="true" />
        </a>
      </div>
      <div className="hero-footnote">
        <span>01 / A little introduction</span>
        <span>Usually with Pixel nearby.</span>
      </div>
    </div>
    <figure className="hero-photo">
      <div className="photo-mat">
        <img
          src={HeroImage}
          alt="Aditya and his dog Pixel outside in a grassy field"
        />
        <span className="photo-stamp">AP + P</span>
      </div>
      <figcaption>
        <span>Off-screen, in good company.</span>
        <a
          className="handwritten"
          href="https://www.instagram.com/pixelthegsd/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Meet Pixel ↗<span className="sr-only"> (opens in a new tab)</span>
        </a>
      </figcaption>
    </figure>
  </section>
);
export default Home;
