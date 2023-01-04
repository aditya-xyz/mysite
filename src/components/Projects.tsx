import reactAndTailwind from "@/assets/portfolio/reactAndTailwind.jpg";
import navbar from "@/assets/portfolio/navbar.jpg";
import reactSmooth from "@/assets/portfolio/reactSmooth.jpg";
import { motion } from "framer-motion";

type Props = {};

const Projects = (props: Props) => {
  const blogs = [
    {
      id: 1,
      src: reactAndTailwind,
      mediumUrl:
        "https://medium.com/@adityapatil.xyz/adding-tailwind-css-to-your-reactjs-app-2ab01a45fe40",
      githubUrl: "https://github.com/aditya-xyz/website_frontend",
    },
    {
      id: 2,
      src: navbar,
      mediumUrl:
        "https://medium.com/@adityapatil.xyz/responsive-nav-bar-for-your-react-app-b08452b39b15",
      githubUrl:
        "https://github.com/aditya-xyz/website_frontend/blob/main/src/components/NavBar.jsx",
    },
    {
      id: 3,
      src: reactSmooth,
      mediumUrl:
        "https://medium.com/@adityapatil.xyz/adding-react-smooth-scroll-to-your-site-74c791a23c4c",
      githubUrl:
        "https://github.com/aditya-xyz/website_frontend/blob/main/src/components/NavBar.jsx",
    },
  ];

  return (
    <div
      id="projects"
      className="min-h-screen w-full bg-gradient-to-b from-black to-gray-800 text-white"
    >
      <div className="mx-auto flex h-full w-full max-w-screen-lg flex-col justify-center p-4 pt-20 md:pt-32">
        <div className="pb-8">
          <p className="inline border-b-4 border-gray-500 text-4xl font-bold">
            Projects
          </p>
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.75 }}
            variants={{
              hidden: { opacity: 0, x: -50 },
              visible: { opacity: 1, x: 0 },
            }}
          >
            <p className="py-6 text-xl text-gray-400">
              Check out some of my work!
            </p>
          </motion.div>
        </div>

        <motion.div
          className="grid gap-8 px-12 sm:grid-cols-2 sm:px-0 md:grid-cols-3"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.25 }}
          transition={{ delay: 0.2, duration: 0.75 }}
          variants={{
            hidden: { opacity: 0, x: -50 },
            visible: { opacity: 1, x: 0 },
          }}
        >
          {blogs.map(({ id, src, mediumUrl, githubUrl }) => (
            <div key={id} className="rounded-lg shadow-md shadow-gray-600">
              <img
                src={src}
                alt=""
                className="rounded-md duration-200 hover:scale-105"
              />
              <div className="flex items-center justify-center">
                <button
                  onClick={() => {
                    window.open(mediumUrl, "_blank");
                  }}
                  className="m-4 w-1/2 rounded-md border-2 border-slate-100 px-6 py-3 duration-200 hover:scale-105"
                >
                  Write-Up
                </button>
                <button
                  onClick={() => {
                    window.open(githubUrl, "_blank");
                  }}
                  className="m-4 w-1/2 rounded-md border-2 border-slate-100 px-6 py-3 duration-200 hover:scale-105"
                >
                  Code
                </button>
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
};

export default Projects;
