import { Badge } from "../../components/Badge";
import { Tooltip } from "../../components/Tooltip";

export function ForeignNodeBadge({ possiblyForeign }: { possiblyForeign?: boolean }) {
  if (possiblyForeign !== true) return null;
  return (
    <Tooltip label="Reported position is outside this server's configured local borders.">
      <Badge variant="default">Possibly foreign</Badge>
    </Tooltip>
  );
}
