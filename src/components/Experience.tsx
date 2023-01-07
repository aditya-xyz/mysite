import { motion } from "framer-motion";
import axios from "axios";
import { useState, useEffect } from "react";

type Props = {
  selectedPage: string;
  setSelectedPage: (val: string) => void;
};

export interface IExperience {
  _id: string;
  id: number;
  src: string;
  title: string;
  styleString: string;
}

const Experience = (props: Props) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<IExperience[] | null>(null);

  useEffect(() => {
    axios
      .get("https://mysite-api.up.railway.app/experience")
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
      id="experience"
      className="min-h-screen w-full bg-gradient-to-b from-gray-900 to-black"
    >
      <div className="mx-auto flex h-full w-full max-w-screen-lg flex-col justify-center p-4 pt-20 text-white md:pt-32">
        <div>
          <p className="inline border-b-4 border-gray-500 p-2 text-4xl font-bold">
            Experience
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
          >
            <p className="py-6 text-xl text-gray-100">
              These are the technologies I have worked with.
            </p>
          </motion.div>
        </div>
        <motion.div
          className="grid w-full grid-cols-2 gap-8 py-8 px-12 text-center sm:grid-cols-3 sm:px-0"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: false }}
          transition={{ delay: 0.2, duration: 0.25 }}
          variants={{
            hidden: { opacity: 0, x: -25 },
            visible: { opacity: 1, x: 0 },
          }}
          onViewportEnter={() => {
            props.setSelectedPage("experience");
          }}
        >
          {!loading && data && data.map ? (
            data.map(({ id, src, title }) => (
              <div
                key={id}
                className="rounded-lg py-2 shadow-md
                 shadow-gray-400 duration-200 hover:scale-105"
              >
                <img src={src} alt="" className="mx-auto w-20" />
                <p className="mt-4">{title}</p>
              </div>
            ))
          ) : (
            <p>Loading...</p>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default Experience;
