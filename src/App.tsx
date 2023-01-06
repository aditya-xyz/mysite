import Navbar from "@/components/Navbar";
import Home from "@/components/Home";
import Experience from "@/components/Experience";
import Projects from "@/components/Projects";
import About from "@/components/About";
import Contact from "@/components/Contact";
import { useState } from "react";

function App() {
  const [selectedPage, setSelectedPage] = useState("home");

  return (
    <div>
      <Navbar {...{ selectedPage, setSelectedPage }} />
      <Home {...{ selectedPage, setSelectedPage }} />
      <Experience {...{ selectedPage, setSelectedPage }} />
      <Projects {...{ selectedPage, setSelectedPage }} />
      <About {...{ selectedPage, setSelectedPage }} />
      <Contact {...{ selectedPage, setSelectedPage }} />
    </div>
  );
}

export default App;
