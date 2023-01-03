import HeroImage from "../assets/heroImage.png";
import { FiArrowRight } from "react-icons/fi";
import { Link } from "react-scroll";
import { motion } from "framer-motion";

type Props = {};

const Home = (props: Props) => {
  return (
    <div
      id="home"
      className="min-h-screen w-full bg-gradient-to-b from-black via-black to-gray-800 pt-20 md:pt-32"
    >
      <div className="mx-auto flex max-w-screen-lg flex-col items-center justify-center px-4 md:flex-row">
        <motion.div
          className="flex h-full flex-col justify-center"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.75 }}
          variants={{
            hidden: { opacity: 0, x: -100 },
            visible: { opacity: 1, x: 0 },
          }}
        >
          <h2 className="text-4xl text-white sm:text-6xl">Hi y'all!</h2>
          <br />
          <p className="mr-2 max-w-md py-4 text-xl text-gray-400">
            I am a Full Stack Developer, dog dad, coffee connoisseur,
            photography enthusiast, and a fan of the outdoors, like I'm sure
            every Coloradan is!
          </p>
          <p className="mr-2 max-w-md py-4 text-xl text-gray-400">
            Outside of work, I like to spend time with my dog, Pixel. So far she
            has been to 10 states and that number will only go up! If you're
            interested in following her adventures, check out her Instagram! All
            links are under the Contact section.
          </p>
          <br />
          <div>
            <Link
              to="experience"
              smooth
              duration={500}
              className="from group my-2 flex w-fit cursor-pointer items-center rounded-md bg-gradient-to-r from-cyan-500 to-blue-500 px-6 py-3 text-white"
            >
              Experience
              <span className="duration-300 group-hover:rotate-90">
                <FiArrowRight size={25} className="ml-1" />
              </span>
            </Link>
          </div>
        </motion.div>
        <div>
          <img
            src={HeroImage}
            alt="my profile"
            className="mx-auto w-2/3 rounded-2xl md:w-full"
          />
        </div>
      </div>
    </div>
  );
};

export default Home;
