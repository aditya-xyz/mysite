import { motion } from "framer-motion";
import axios from "axios";
import { useState, useEffect } from "react";

type Props = {};

export interface IProject {
  _id: string;
  id: number;
  src: string;
  mediumUrl: string;
  githubUrl: string;
}

const Projects = (props: Props) => {
  //grid cursor-pointer gap-8 px-12 sm:grid-cols-2 sm:px-0 md:grid-cols-3
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<IProject[] | null>(null);

  useEffect(() => {
    axios
      .get("https://mysite-api.up.railway.app/project")
      .then((response) => {
        setData(response.data);
      })
      .catch((error) => {
        console.log(error.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return (
    <div
      id="projects"
      className="min-h-screen w-full bg-gradient-to-b from-black to-gray-800"
    >
      <div className="mx-auto flex h-full w-full max-w-screen-lg flex-col justify-center p-4 pt-20 text-white md:pt-32">
        <div>
          <p className="inline border-b-4 border-gray-500 p-2 text-4xl font-bold">
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
            <p className="py-6 text-xl text-gray-100">
              Check out some of my work! Click on the tiles for Medium articles.
            </p>
          </motion.div>
        </div>

        <motion.div
          className="grid w-full cursor-pointer grid-cols-2 gap-8 py-8 px-12 text-center sm:grid-cols-4 sm:px-0"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.25 }}
          transition={{ delay: 0.2, duration: 0.75 }}
          variants={{
            hidden: { opacity: 0, x: -50 },
            visible: { opacity: 1, x: 0 },
          }}
        >
          {loading || !data || !data.map ? (
            <p>Loading</p>
          ) : (
            data.map(({ id, src, mediumUrl, githubUrl }) => (
              <div
                key={id}
                onClick={() => {
                  window.open(mediumUrl, "_blank");
                }}
                className="rounded-lg py-2 shadow-md shadow-gray-400"
              >
                <img
                  src={src}
                  alt=""
                  className="h-3/5 rounded-md duration-200 hover:scale-105 sm:h-auto"
                />
                <button
                  onClick={() => {
                    window.open(githubUrl, "_blank");
                  }}
                  className="m-4 mb-10 w-20 rounded-md border-2 border-slate-100 py-2 px-3 duration-200 hover:scale-105 sm:mb-2 sm:w-1/2 sm:px-6"
                >
                  Code
                </button>
              </div>
            ))
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default Projects;
