import { FaGithub, FaLinkedin, FaInstagram } from "react-icons/fa";
import { BsMedium } from "react-icons/bs";
import { socialLinks } from "@/socials";
const icons = {
  github: FaGithub,
  linkedin: FaLinkedin,
  medium: BsMedium,
  instagram: FaInstagram,
};
const Footer = ({
  palette,
  setPalette,
}: {
  palette: string;
  setPalette: (value: string) => void;
}) => (
  <footer className="site-footer" id="socials">
    <div className="shell">
      <div className="footer-top">
        <p>
          Good things start
          <br />
          with a <em>connection.</em>
        </p>
        <nav aria-label="Social links">
          {socialLinks.map(({ id, label, href }) => {
            const Icon = icons[id as keyof typeof icons];
            return (
              <a href={href} key={id} target="_blank" rel="noopener noreferrer">
                <Icon aria-hidden="true" />
                {label}
                <span aria-hidden="true">↗</span>
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            );
          })}
        </nav>
      </div>
      <div className="footer-bottom">
        <a className="wordmark" href="#home">
          aditya<span>.</span>
        </a>
        <p>Southern California · Made with curiosity.</p>
        <div className="palette-picker" role="group" aria-label="Color palette">
          <span>Make it yours</span>
          {[
            { id: "paper", label: "Paper & clay" },
            { id: "moss", label: "Moss & cream" },
            { id: "night", label: "After hours" },
          ].map((p) => (
            <button
              type="button"
              key={p.id}
              data-swatch={p.id}
              title={p.label}
              aria-label={p.label}
              aria-pressed={palette === p.id}
              onClick={() => setPalette(p.id)}
            />
          ))}
        </div>
      </div>
    </div>
  </footer>
);
export default Footer;
