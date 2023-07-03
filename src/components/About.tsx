import { motion } from "framer-motion";

type Props = {
  selectedPage: string;
  setSelectedPage: (val: string) => void;
};

const About = (props: Props) => {
  return (
    <section
      id="about"
      className="min-h-screen w-full bg-gradient-to-b from-gray-900 to-black text-white"
    >
      <div className="mx-auto flex h-full w-full max-w-screen-lg flex-col justify-center p-4 pt-20 md:pt-32">
        <div className="pb-8">
          <p className="inline border-b-4 border-gray-500 text-4xl font-bold">
            About
          </p>
        </div>
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: false }}
          transition={{ delay: 0.25, duration: 0.25 }}
          variants={{
            hidden: { opacity: 0, scale: 0.95 },
            visible: { opacity: 1, scale: 1 },
          }}
          onViewportEnter={() => {
            props.setSelectedPage("about");
          }}
        >
          <p className="text-lg text-gray-100">
            This site is hosted on Netlify and built using React, TypeScript,
            and Tailwind CSS. I am using getform.io for the contact form, React
            Scroll for smooth scrolling, Axios for API calls, and Framer Motion
            for the animations.
          </p>
          <br />
          <br />
          <p className="text-lg text-gray-100">
            I am using Node.js and Express for the back-end, which is hosted on
            Railway.app (can't recommend them enough!). Both the front-end and
            back-end auto deploy from my GitHub repos. I chose MongoDB for the
            database which makes it super easy to add new content to the site on
            the fly. For image hosting, I am using an AWS S3 bucket.
          </p>
          <br />
          <br />
          <p className="text-lg text-gray-100">
            As a full time Microsoft Power Platform professional by trade, I
            work on using Microsoft Dataverse and its suite of connectors and
            functionalities to build low-code/no-code solutions. This includes
            standalone web apps, mobile apps, websites, and automations.
          </p>
          <br />
          <br />
          <p className="text-lg text-gray-100">
            Check out my{" "}
            <a
              href={"https://github.com/aditya-xyz"}
              className={`cursor-pointer duration-200 hover:text-blue-500 `}
              target="_blank"
              rel="noreferrer"
            >
              GitHub repos
            </a>{" "}
            and social links in the Contact section!
          </p>
        </motion.div>
      </div>
    </section>
  );
};

export default About;
