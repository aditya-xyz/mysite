import HeroImage from "../assets/heroImage.png";
import { FiArrowRight } from "react-icons/fi";
import { Link } from "react-scroll";
import { motion } from "framer-motion";

type Props = {
  selectedPage: string;
  setSelectedPage: (val: string) => void;
};

const Home = (props: Props) => {
  return (
    <div
      id="home"
      className="min-h-screen w-full bg-gradient-to-b from-black via-black to-gray-900"
    >
      <div className="mx-auto flex max-w-screen-lg flex-col items-center justify-center gap-8 px-4 pt-20 md:flex-row md:pt-32">
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
            props.setSelectedPage("home");
          }}
        >
          <img
            src={HeroImage}
            alt="my profile"
            className="mx-auto w-2/3 rounded-2xl md:w-full"
          />
        </motion.div>
        <div className="flex h-full flex-col justify-center">
          <h2 className="text-3xl text-white sm:text-5xl">Hi y'all!</h2>
          <br />
          <div>
            <p className="mr-2 max-w-md py-4 text-lg text-gray-100">
              I am a Full Stack React Developer, dog dad, coffee connoisseur,
              photography enthusiast, and &mdash; like a true Coloradan &mdash;
              a fan of the outdoors and a beginner snowboarder.
            </p>
            <p className="mr-2 max-w-md py-4 text-lg text-gray-100">
              Outside of work, I like to spend time with my dog, Pixel. So far
              she has been to 10 states and that number will only go up! If
              you're interested in following her adventures, check out her
              Instagram! All links are under the Contact section.
            </p>
            <br />
          </div>
          <div>
            <Link
              to="experience"
              onClick={() => {
                props.setSelectedPage("experience");
              }}
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
        </div>
      </div>
    </div>
  );
};

export default Home;
