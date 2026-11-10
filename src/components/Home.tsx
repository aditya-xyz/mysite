import HeroImage from "@/assets/heroImage.png";
import { FiArrowDown } from "react-icons/fi";
const Home = () => (
  <section id="home" className="hero shell" aria-labelledby="home-title">
    <div className="hero-copy">
      <p className="eyebrow">Hi, I’m Aditya · Southern California</p>
      <h1 id="home-title">
        Connecting the dots.
        <br />
        <em>Building what’s next.</em>
      </h1>
      <p className="hero-intro">
        I bring apps, data, and automation together with Power Platform, Azure,
        and a little custom code.
      </p>
      <div className="hero-actions">
        <a className="button button-solid" href="#projects">
          Explore my work <FiArrowDown aria-hidden="true" />
        </a>
      </div>
    </div>
    <figure className="hero-photo">
      <div className="photo-mat">
        <img
          src={HeroImage}
          alt="Aditya and his dog Pixel outside in a grassy field"
        />
      </div>
      <figcaption>
        <span>Aditya & Pixel</span>
        <a
          className="photo-link"
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
