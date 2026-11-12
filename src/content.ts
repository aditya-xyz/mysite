// Public content lives with the site; images are bundled by Vite.
import scrapbookCover from "@/assets/public-content/scrapbook-cover.jpg";
import congressCover from "@/assets/public-content/congress-sync-cover.jpg";
import codeAppCover from "@/assets/public-content/codeapp-mda-cover.jpg";

export const experiences = [
  {
    id: "code-apps",
    title: "Power Apps code apps",
    description:
      "Building custom web experiences with React and TypeScript inside Power Platform.",
  },
  {
    id: "functions",
    title: "Azure Functions",
    description:
      "Writing serverless backend logic and APIs to support apps and integrations.",
  },
  {
    id: "automate",
    title: "Power Automate",
    description:
      "Connecting services and automating business processes with cloud flows.",
  },
  {
    id: "dataverse",
    title: "Microsoft Dataverse",
    description:
      "Working with business data and relationships to support Power Platform solutions.",
  },
  {
    id: "connectors",
    title: "APIs & custom connectors",
    description:
      "Bringing services together through APIs and connectors for apps and workflows.",
  },
  {
    id: "react",
    title: "React",
    description:
      "Building interactive interfaces and reusable components for web apps.",
  },
  {
    id: "typescript",
    title: "TypeScript",
    description:
      "Adding types and clear contracts to frontend and backend application code.",
  },
  {
    id: "javascript",
    title: "JavaScript",
    description:
      "Writing the application logic and interactions behind web experiences.",
  },
  {
    id: "node",
    title: "Node.js",
    description:
      "Building backend services and API integrations with JavaScript and TypeScript.",
  },
] as const;

export const projects = [
  {
    id: "scrapbook",
    src: scrapbookCover,
    category: "Personal projects",
    title: "I Built a Scrapbook. My Dog Turned It Into Pixelbook.",
    description:
      "A gift for friends became Pixelbook: a private scrapbook edited by our dog, with playful photos, keepsakes, mugshots, and a Studio behind the scenes.",
    mediumUrl:
      "https://medium.com/@adityapatil.xyz/i-built-a-scrapbook-then-it-needed-a-backend-b3bef6c0f482?sharedUserId=adityapatil.xyz",
    githubUrl: "https://github.com/aditya-xyz/mysite",
  },
  {
    id: "congress",
    src: congressCover,
    category: "Data & background processing",
    title:
      "I Built a System to Keep Up With Congress. The Hard Part Wasn’t Politics.",
    description:
      "Bringing legislative information together—and teaching the software to recover, repeat itself safely, and know when the work is actually done.",
    mediumUrl:
      "https://medium.com/@adityapatil.xyz/i-built-a-system-to-keep-up-with-congress-the-hard-part-wasnt-politics-b8caaf7fdb63?sharedUserId=adityapatil.xyz",
    githubUrl: null,
  },
  {
    id: "code-app",
    src: codeAppCover,
    category: "Power Platform & custom interfaces",
    title:
      "Two Apps, One Source of Truth, and a Save Button That Needed a Break",
    description:
      "A custom interface and a model-driven app share the same foundation, while heavier processing moves behind the scenes.",
    mediumUrl:
      "https://medium.com/@adityapatil.xyz/two-apps-one-source-of-truth-and-a-save-button-that-needed-a-break-d5fd83a0a8f7?sharedUserId=adityapatil.xyz",
    githubUrl: null,
  },
];
