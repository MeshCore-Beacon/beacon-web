import { useLocation } from "react-router-dom";

export function Probe() {
  return <output data-testid="search">{useLocation().search}</output>;
}
