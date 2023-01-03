import { useState } from "react";
import { FaBars, FaTimes } from "react-icons/fa";
import { Link } from "react-scroll";

type Props = {};

const Navbar = (props: Props) => {
  const [nav, setNav] = useState(false);

  const links = [
    {
      id: 1,
      link: "home",
    },
    {
      id: 2,
      link: "experience",
    },
    {
      id: 3,
      link: "projects",
    },
    {
      id: 4,
      link: "about",
    },
    {
      id: 5,
      link: "contact",
    },
  ];

  return (
    <div className="fixed z-40 flex h-16 w-full items-center justify-between bg-black px-4 text-white">
      <Link to="home" smooth duration={500}>
        <h1 className="ml-2 cursor-pointer font-signature text-3xl">Aditya</h1>
      </Link>

      <ul className="hidden md:flex">
        {links.map(({ id, link }) => (
          <li
            key={id}
            className="cursor-pointer px-4 font-medium capitalize text-gray-400 duration-200 hover:scale-105"
          >
            <Link to={link} smooth duration={500}>
              {link}
            </Link>
          </li>
        ))}
      </ul>

      <div
        onClick={() => {
          setNav(!nav);
          !nav
            ? (document.body.style.overflow = "hidden")
            : (document.body.style.overflow = "unset");
        }}
        className="z-10 cursor-pointer pr-4 text-gray-500 md:hidden"
      >
        {nav ? <FaTimes size={30} /> : <FaBars size={30} />}
      </div>

      {nav && (
        <ul className="absolute top-0 left-0 flex h-screen w-full flex-col items-center justify-center bg-gradient-to-b from-black to-gray-800 text-gray-400">
          {links.map(({ id, link }) => (
            <li
              key={id}
              className="cursor-pointer px-4 py-6 text-4xl capitalize"
            >
              <Link
                onClick={() => {
                  setNav(!nav);
                  !nav
                    ? (document.body.style.overflow = "hidden")
                    : (document.body.style.overflow = "unset");
                }}
                to={link}
                smooth
                duration={500}
              >
                {link}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default Navbar;
