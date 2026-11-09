// Public content lives with the site; images are bundled by Vite.
import mernApp from "@/assets/public-content/mern_app.png";
import reactAndTailwind from "@/assets/public-content/reactAndTailwind.jpg";
import navbar from "@/assets/public-content/navbar.jpg";
import reactSmooth from "@/assets/public-content/reactSmooth.jpg";
import highlightNavbar from "@/assets/public-content/highlight_nav_bar.png";

export const experiences = [
  {
    id: "code-apps",
    title: "Power Apps code apps",
    description:
      "Building custom web experiences with React and TypeScript inside Power Platform.",
  },
  {
    id: "functions",
    title: "Azure Functions",
    description:
      "Writing serverless backend logic and APIs to support apps and integrations.",
  },
  {
    id: "automate",
    title: "Power Automate",
    description:
      "Connecting services and automating business processes with cloud flows.",
  },
  {
    id: "dataverse",
    title: "Microsoft Dataverse",
    description:
      "Working with business data and relationships to support Power Platform solutions.",
  },
  {
    id: "connectors",
    title: "APIs & custom connectors",
    description:
      "Bringing services together through APIs and connectors for apps and workflows.",
  },
  {
    id: "react",
    title: "React",
    description:
      "Building interactive interfaces and reusable components for web apps.",
  },
  {
    id: "typescript",
    title: "TypeScript",
    description:
      "Adding types and clear contracts to frontend and backend application code.",
  },
  {
    id: "javascript",
    title: "JavaScript",
    description:
      "Writing the application logic and interactions behind web experiences.",
  },
  {
    id: "node",
    title: "Node.js",
    description:
      "Building backend services and API integrations with JavaScript and TypeScript.",
  },
] as const;

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
