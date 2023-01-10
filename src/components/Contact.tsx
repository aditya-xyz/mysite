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

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Inputs>();

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
            transition={{ duration: 0.25 }}
            variants={{
              hidden: { opacity: 0, x: -25 },
              visible: { opacity: 1, x: 0 },
            }}
            onViewportEnter={() => {
              props.setSelectedPage("contact");
            }}
          >
            <p className="py-6 text-xl text-gray-100">Send me a message!</p>
          </motion.div>
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
          className="flex items-center justify-center"
        >
          <form
            onSubmit={handleSubmit(submit)}
            className="flex w-full flex-col md:w-1/2"
          >
            <input
              {...register("name", {
                required: true,
                maxLength: 100,
              })}
              type="text"
              placeholder="NAME"
              className="border-2 bg-transparent p-2 text-white focus:outline-none"
            />
            {errors.name && (
              <p className="text-red mt-1">
                {errors.name.type === "required" && "This field is required."}
                {errors.name.type === "maxLength" &&
                  "Max length is 100 characters."}
              </p>
            )}
            <input
              {...register("email", {
                required: true,
                pattern: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
              })}
              type="text"
              placeholder="EMAIL"
              className="my-4 border-2 bg-transparent p-2 text-white focus:outline-none"
            />
            {errors.email && (
              <p className="text-red mt-1">
                {errors.email.type === "required" && "This field is required."}
                {errors.email.type === "pattern" && "Invalid email address."}
              </p>
            )}
            <textarea
              {...register("message", {
                required: true,
                maxLength: 2000,
              })}
              placeholder="MESSAGE"
              required
              rows={10}
              className="border-2 bg-transparent p-2 text-white focus:outline-none"
            />
            {errors.message && (
              <p className="text-red mt-1">
                {errors.message.type === "required" &&
                  "This field is required."}
                {errors.message.type === "maxLength" &&
                  "Max length is 2000 char."}
              </p>
            )}
            <button className="my-8 mx-auto flex items-center rounded-md bg-gradient-to-b from-cyan-500 to-blue-500 px-6 py-3 text-white duration-300 hover:scale-110">
              Let's talk
            </button>
            <ToastContainer />
          </form>
        </motion.div>
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: false }}
          transition={{ delay: 0.35, duration: 0.25 }}
          variants={{
            hidden: { opacity: 0, scale: 0.95 },
            visible: { opacity: 1, scale: 1 },
          }}
          className="right-0 flex flex-row justify-center"
        >
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
        </motion.div>
      </div>
    </div>
  );
};

export default Contact;
