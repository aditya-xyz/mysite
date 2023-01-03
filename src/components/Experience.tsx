import html from "@/assets/html.png";
import css from "@/assets/css.png";
import javascript from "@/assets/javascript.png";
import typescript from "@/assets/typescript.png";
import reactImage from "@/assets/react.png";
import python from "@/assets/python.png";
import nodejs from "@/assets/node.png";
import github from "@/assets/github.png";
import tailwind from "@/assets/tailwind.png";
import { motion } from "framer-motion";

type Props = {};

const Experience = (props: Props) => {
  const technologies = [
    {
      id: 1,
      src: html,
      title: "HTML",
      style: "shadow-orange-500",
    },
    {
      id: 2,
      src: css,
      title: "CSS",
      style: "shadow-blue-500",
    },
    {
      id: 3,
      src: javascript,
      title: "JavaScript",
      style: "shadow-yellow-500",
    },
    {
      id: 4,
      src: typescript,
      title: "TypeScript",
      style: "shadow-blue-600",
    },
    {
      id: 5,
      src: reactImage,
      title: "ReactJS",
      style: "shadow-blue-600",
    },
    {
      id: 6,
      src: tailwind,
      title: "Tailwind CSS",
      style: "shadow-sky-500",
    },
    {
      id: 7,
      src: nodejs,
      title: "NodeJS",
      style: "shadow-green-400",
    },
    {
      id: 8,
      src: python,
      title: "Python",
      style: "shadow-sky-400",
    },
    {
      id: 9,
      src: github,
      title: "GitHub",
      style: "shadow-gray-400",
    },
  ];

  return (
    <div
      id="experience"
      className="min-h-screen w-full bg-gradient-to-b from-gray-800 to-black"
    >
      <div className="mx-auto flex h-full w-full max-w-screen-lg flex-col justify-center p-4 pt-20 text-white md:pt-32">
        <div>
          <p className="inline border-b-4 border-gray-500 p-2 text-4xl font-bold">
            Experience
          </p>
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.75 }}
            variants={{
              hidden: { opacity: 0, x: -50 },
              visible: { opacity: 1, x: 0 },
            }}
          >
            <p className="py-6 text-xl text-gray-400">
              These are the technologies I have worked with.
            </p>
          </motion.div>
        </div>
        <motion.div
          className="grid w-full grid-cols-2 gap-8 py-8 px-12 text-center sm:grid-cols-3 sm:px-0"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.5 }}
          transition={{ delay: 0.2, duration: 0.75 }}
          variants={{
            hidden: { opacity: 0, x: -50 },
            visible: { opacity: 1, x: 0 },
          }}
        >
          {technologies.map(({ id, src, title, style }) => (
            <div
              key={id}
              className={`rounded-lg py-2 shadow-md duration-500 hover:scale-105 ${style}`}
            >
              <img src={src} alt="" className="mx-auto w-20" />
              <p className="mt-4">{title}</p>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
};

export default Experience;
