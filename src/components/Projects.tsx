import { motion } from "framer-motion";
import { projects } from "@/content";

type Props = {
  selectedPage: string;
  setSelectedPage: (val: string) => void;
};

const Projects = (props: Props) => {
  return (
    <div
      id="projects"
      className="min-h-screen w-full bg-gradient-to-b from-black to-gray-900 text-white"
    >
      <div className="mx-auto flex h-full w-full max-w-screen-lg flex-col justify-center p-4 pt-20 md:pt-32">
        <div className="pb-8">
          <p className="inline border-b-4 border-gray-500 text-4xl font-bold">
            Projects
          </p>
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: false }}
            transition={{ duration: 0.25 }}
            variants={{
              hidden: { opacity: 0, x: -25 },
              visible: { opacity: 1, x: 0 },
            }}
            onViewportEnter={() => {
              props.setSelectedPage("projects");
            }}
          >
            <p className="py-6 text-xl text-gray-100">
              Check out some of my work!
            </p>
          </motion.div>
        </div>

        <motion.div
          className="grid gap-8 px-12 sm:grid-cols-2 sm:px-0 md:grid-cols-3"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: false }}
          transition={{ delay: 0.25, duration: 0.25 }}
          variants={{
            hidden: { opacity: 0, scale: 0.95 },
            visible: { opacity: 1, scale: 1 },
          }}
        >
          {projects.map(({ id, src, title, mediumUrl, githubUrl }) => (
            <div key={id} className="rounded-lg shadow-md shadow-gray-600">
              {src && (
                <img
                  src={src}
                  alt={title}
                  className="rounded-md duration-200 hover:scale-105"
                  onError={(event) => {
                    event.currentTarget.hidden = true;
                  }}
                />
              )}
              <h3 className="px-4 pt-4 text-center">
                {title || `Project ${id}`}
              </h3>
              <div className="flex items-center justify-center">
                <button
                  onClick={() => {
                    window.open(mediumUrl, "_blank");
                  }}
                  className="m-4 w-1/2 rounded-md border-2 border-slate-100 px-6 py-3 duration-200 hover:scale-105 hover:border-blue-500 hover:text-blue-500"
                >
                  Blog
                </button>
                <button
                  onClick={() => {
                    window.open(githubUrl, "_blank");
                  }}
                  className="m-4 w-1/2 rounded-md border-2 border-slate-100 px-6 py-3 duration-200 hover:scale-105 hover:border-blue-500 hover:text-blue-500"
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
