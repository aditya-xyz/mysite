import { FaGithub, FaLinkedin, FaInstagram } from "react-icons/fa";
import { BsMedium } from "react-icons/bs";
import { useForm, SubmitHandler } from "react-hook-form";
import axios from "axios";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { motion } from "framer-motion";

type Props = {
  selectedPage: string;
  setSelectedPage: (val: string) => void;
};

const Contact = (props: Props) => {
  const GETFORM_FORM_ENDPOINT =
    "https://getform.io/f/0754b1cf-543b-4f39-82bb-5f766c1a44a7";

  type Inputs = {
    name: string;
    email: string;
    message: string;
  };

  const { register, handleSubmit, reset } = useForm<Inputs>();

  const submit: SubmitHandler<Inputs> = (data) => {
    axios
      .post(GETFORM_FORM_ENDPOINT, {
        name: data.name,
        email: data.email,
        message: data.message,
      })
      .then(() => {
        toast.success("Thank you! I will reach out to you shortly.", {
          position: toast.POSITION.BOTTOM_CENTER,
        });
        reset();
      })
      .catch((error) => console.log(error));
  };

  const links = [
    {
      id: 1,
      child: (
        <>
          <FaGithub size={30} />
        </>
      ),
      href: "https://github.com/aditya-xyz",
      style: "rounded-tl-md",
    },
    {
      id: 2,
      child: (
        <>
          <FaLinkedin size={30} />
        </>
      ),
      href: "https://www.linkedin.com/in/aditya-fullstack/",
    },
    {
      id: 3,
      child: (
        <>
          <BsMedium size={30} />
        </>
      ),
      href: "https://medium.com/@adityapatil.xyz",
    },
    {
      id: 4,
      child: (
        <>
          <FaInstagram size={30} />
        </>
      ),
      href: "https://www.instagram.com/pixelthegsd/",
      style: "rounded-bl-md",
    },
  ];

  return (
    <div
      id="contact"
      className="min-h-screen w-full bg-gradient-to-b from-black to-gray-900 p-4 text-white"
    >
      <div className="mx-auto flex h-full max-w-screen-lg flex-col justify-center p-4 pt-20 md:pt-32">
        <div className="pb-8">
          <p className="inline border-b-4 border-gray-500 text-4xl font-bold">
            Contact
          </p>
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: false }}
            transition={{ duration: 0.5 }}
            variants={{
              hidden: { opacity: 0, x: -25 },
              visible: { opacity: 1, x: 0 },
            }}
          >
            <p className="py-6 text-xl text-gray-100">Send me a message!</p>
          </motion.div>
        </div>
        <motion.div
          className="flex items-center justify-center"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: false }}
          transition={{ delay: 0.2, duration: 0.5 }}
          variants={{
            hidden: { opacity: 0, x: -25 },
            visible: { opacity: 1, x: 0 },
          }}
          onViewportEnter={() => {
            props.setSelectedPage("contact");
          }}
        >
          <form
            onSubmit={handleSubmit(submit)}
            className="flex w-full flex-col md:w-1/2"
          >
            <input
              {...register("name")}
              type="text"
              placeholder="Enter your name"
              required
              className="border-2 bg-transparent p-2 text-white focus:outline-none"
            />
            <input
              {...register("email")}
              type="text"
              placeholder="Enter your email"
              required
              className="my-4 border-2 bg-transparent p-2 text-white focus:outline-none"
            />
            <textarea
              {...register("message")}
              placeholder="Enter your message"
              required
              rows={10}
              className="border-2 bg-transparent p-2 text-white focus:outline-none"
            ></textarea>
            <button className="my-8 mx-auto flex items-center rounded-md bg-gradient-to-b from-cyan-500 to-blue-500 px-6 py-3 text-white duration-300 hover:scale-110">
              Let's talk
            </button>
            <ToastContainer />
          </form>
        </motion.div>
        <div className="right-0 flex flex-row justify-center">
          <ul className="flex flex-row">
            {links.map(({ id, child, href, style }) => (
              <li
                key={id}
                className={`flex h-14 w-20 items-center justify-between px-4 duration-300 hover:scale-125 ${style}`}
              >
                <a
                  href={href}
                  className="flex w-full items-center justify-between text-white"
                  target="_blank"
                  rel="noreferrer"
                >
                  {child}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Contact;
