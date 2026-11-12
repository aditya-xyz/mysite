import HeroImage from "@/assets/heroImage.png";
import { useLayoutEffect, useRef, useState } from "react";
const Home = () => {
  const image = useRef<HTMLImageElement>(null);
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    const photo = image.current;
    if (!photo) return;
    let active = true;
    const reveal = () => {
      const decoded =
        photo.naturalWidth && photo.decode ? photo.decode() : Promise.resolve();
      Promise.resolve(decoded)
        .catch(() => {})
        .then(() => {
          if (active) setReady(true);
        });
    };
    photo.addEventListener("load", reveal);
    photo.addEventListener("error", reveal);
    if (photo.complete) reveal();
    return () => {
      active = false;
      photo.removeEventListener("load", reveal);
      photo.removeEventListener("error", reveal);
    };
  }, []);
  return (
    <section id="home" className="hero shell" aria-labelledby="home-title">
      <div className="hero-copy">
        <p className="eyebrow">Hi, I’m Aditya</p>
        <h1 id="home-title">
          Connecting the dots.
          <br />
          <em>Building what’s next.</em>
        </h1>
        <p className="hero-intro">
          I bring apps, data, and automation together with Power Platform,
          Azure, and a little custom code.
        </p>
      </div>
      <figure className="hero-photo" data-ready={ready}>
        <div className="photo-mat">
          <img
            ref={image}
            src={HeroImage}
            alt="Aditya and his dog Pixel outside in a grassy field"
          />
        </div>
      </figure>
    </section>
  );
};
export default Home;
