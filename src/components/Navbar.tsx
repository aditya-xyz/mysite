import { FiArrowUpRight } from "react-icons/fi";
import { linkedInUrl } from "@/socials";
const Navbar = ({ selectedPage }: { selectedPage: string }) => (
  <header className="site-header">
    <div className="shell header-inner">
      <a href="#home" className="wordmark" aria-label="Aditya Patil home">
        aditya<span>.</span>
      </a>
      <nav aria-label="Main navigation">
        <a
          href="#projects"
          aria-current={selectedPage === "projects" ? "location" : undefined}
        >
          Work
        </a>
        <a
          href="#experience"
          aria-current={selectedPage === "experience" ? "location" : undefined}
        >
          Toolkit
        </a>
        <a
          href="#about"
          aria-current={selectedPage === "about" ? "location" : undefined}
        >
          About
        </a>
      </nav>
      <a
        className="header-social"
        href={linkedInUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="LinkedIn (opens in a new tab)"
      >
        Let’s connect <FiArrowUpRight aria-hidden="true" />
      </a>
    </div>
  </header>
);
export default Navbar;
