// Public content lives with the site; images are bundled by Vite.
import html from "@/assets/public-content/html.png";
import css from "@/assets/public-content/css.png";
import javascript from "@/assets/public-content/javascript.png";
import typescript from "@/assets/public-content/typescript.png";
import react from "@/assets/public-content/react.png";
import tailwind from "@/assets/public-content/tailwind.png";
import node from "@/assets/public-content/node.png";
import mongodb from "@/assets/public-content/mongodb-3629020-3030245.webp";
import python from "@/assets/public-content/python.png";
import mernApp from "@/assets/public-content/mern_app.png";
import reactAndTailwind from "@/assets/public-content/reactAndTailwind.jpg";
import navbar from "@/assets/public-content/navbar.jpg";
import reactSmooth from "@/assets/public-content/reactSmooth.jpg";
import highlightNavbar from "@/assets/public-content/highlight_nav_bar.png";

export const experiences = [
  { id: 1, src: html, title: "HTML" },
  { id: 2, src: css, title: "CSS" },
  { id: 3, src: javascript, title: "JavaScript" },
  { id: 4, src: typescript, title: "TypeScript" },
  { id: 5, src: react, title: "React" },
  { id: 6, src: tailwind, title: "Tailwind CSS" },
  { id: 7, src: node, title: "NodeJS" },
  { id: 8, src: mongodb, title: "MongoDB" },
  { id: 9, src: python, title: "Python" },
];

export const projects = [
  {
    id: 1,
    src: mernApp,
    title: "MERN App",
    mediumUrl: "https://medium.com/@adityapatil.xyz/the-mern-app-2b8e5d03b33",
    githubUrl: "https://github.com/aditya-xyz/backend",
  },
  {
    id: 2,
    src: reactAndTailwind,
    title: "Adding Tailwind CSS to React",
    mediumUrl:
      "https://medium.com/@adityapatil.xyz/adding-tailwind-css-to-your-reactjs-app-2ab01a45fe40",
    githubUrl: "https://github.com/aditya-xyz/website_frontend",
  },
  {
    id: 3,
    src: navbar,
    title: "Responsive Navigation Bar",
    mediumUrl:
      "https://medium.com/@adityapatil.xyz/responsive-nav-bar-for-your-react-app-b08452b39b15",
    githubUrl:
      "https://github.com/aditya-xyz/website_frontend/blob/main/src/components/NavBar.jsx",
  },
  {
    id: 4,
    src: reactSmooth,
    title: "Smooth Scrolling in React",
    mediumUrl:
      "https://medium.com/@adityapatil.xyz/adding-react-smooth-scroll-to-your-site-74c791a23c4c",
    githubUrl:
      "https://github.com/aditya-xyz/website_frontend/blob/main/src/components/NavBar.jsx",
  },
  {
    id: 5,
    src: highlightNavbar,
    title: "Highlight Navigation on Scroll",
    mediumUrl:
      "https://medium.com/@adityapatil.xyz/highlight-nav-bar-items-on-page-scroll-using-framer-motion-a69ae40528be",
    githubUrl: "https://github.com/aditya-xyz/mysite",
  },
];
