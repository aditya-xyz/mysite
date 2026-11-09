import Navbar from "@/components/Navbar";
import Home from "@/components/Home";
import Experience from "@/components/Experience";
import Projects from "@/components/Projects";
import About from "@/components/About";
import Footer from "@/components/Footer";
import { useEffect, useState } from "react";

function App() {
  const [selectedPage, setSelectedPage] = useState("home");
  const [palette, setPalette] = useState("night");
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setSelectedPage(entry.target.id);
        });
      },
      { rootMargin: "-15% 0px -60% 0px", threshold: 0 }
    );
    document
      .querySelectorAll("main > section[id]")
      .forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);
  return (
    <div className="portfolio" data-palette={palette}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Navbar selectedPage={selectedPage} />
      <main id="main">
        <Home />
        <Projects />
        <Experience />
        <About />
      </main>
      <Footer palette={palette} setPalette={setPalette} />
    </div>
  );
}
export default App;
