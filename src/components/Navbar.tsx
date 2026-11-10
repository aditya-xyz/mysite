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
    </div>
  </header>
);
export default Navbar;
