import powerApps from "@/assets/toolkit/power-apps.svg";
import azureFunctions from "@/assets/toolkit/azure-functions.svg";
import powerAutomate from "@/assets/toolkit/power-automate.svg";
import dataverse from "@/assets/toolkit/dataverse.svg";
import connectors from "@/assets/toolkit/custom-connectors.svg";
import react from "@/assets/toolkit/react.svg";
import typescript from "@/assets/toolkit/typescript.svg";
import javascript from "@/assets/toolkit/javascript.svg";
import node from "@/assets/toolkit/node.svg";

const icons = {
  "code-apps": powerApps,
  functions: azureFunctions,
  automate: powerAutomate,
  dataverse,
  connectors,
  react,
  typescript,
  javascript,
  node,
};

const ToolkitIcon = ({ id }: { id: keyof typeof icons }) => (
  <span className="tool-icon" aria-hidden="true">
    <img src={icons[id]} alt="" loading="lazy" width={26} height={26} />
  </span>
);
export default ToolkitIcon;
