import { motion } from "framer-motion";
type Props = {};

const About = (props: Props) => {
  return (
    <section
      id="about"
      className="min-h-screen w-full bg-gradient-to-b from-gray-800 to-black text-white"
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
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.75 }}
          variants={{
            hidden: { opacity: 0, x: -50 },
            visible: { opacity: 1, x: 0 },
          }}
        >
          <p className="text-xl text-gray-100">
            This site is responsive and is built using React, TypeScript, and
            Tailwind CSS. I am using getform.io for the contact form, React
            Scroll for smooth scrolling, and Axios for API calls. More recently,
            I have added Framer Motion for the animation effects you see when
            the viewport presents itself. The frontend is hosted on Netlify.
          </p>
          <br />
          <br />
          <p className="text-xl text-gray-100">
            I am using Node.js and Express for the backend, which is hosted on
            Railway.app (can't recommend them enough!). Both the frontend and
            backend auto deploy from my GitHub repos. I am using MongoDB for the
            database to store a list of the technologies I use and the latest
            projects I am working on. This makes it super easy to order the
            content or add new content to the site on the fly! For storing the
            images that go along with those two components, I am using AWS S3.
          </p>
          <br />
          <br />
          <p className="text-xl text-gray-100">
            As a full time Microsoft Power Platform professional by trade, I
            work on using Microsoft Dataverse and its suite of connectors and
            functionalities to build low-code/no-code solutions. This includes
            standalone web apps, mobile apps, websites, and automations.
          </p>
          <br />
          <br />
          <p className="text-xl text-gray-100">
            Check out my GitHub repos and social links on the Contact page!
          </p>
        </motion.div>
      </div>
    </section>
  );
};

export default About;
