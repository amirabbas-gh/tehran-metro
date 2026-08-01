import type { ReactElement } from "react";
import type { ConnectivityInfo } from "../types/metro";

export type GraphInfoPanelProps = {
  info: ConnectivityInfo;
};

export default function GraphInfoPanel({
  info,
}: GraphInfoPanelProps): ReactElement {
  return (
    <aside className="graphInfo" aria-label="Graph theory summary">
      <strong>G = (V, E)</strong>
      <dl>
        <div>
          <dt>|V|</dt>
          <dd>{info.n} stations</dd>
        </div>
        <div>
          <dt>|E|</dt>
          <dd>{info.e} edges</dd>
        </div>
        <div>
          <dt>Type</dt>
          <dd>Undirected · sparse</dd>
        </div>
        <div>
          <dt>Store</dt>
          <dd>Adjacency list</dd>
        </div>
        <div>
          <dt>Route</dt>
          <dd>BFS · O(n+e)</dd>
        </div>
        <div>
          <dt>Connected</dt>
          <dd>
            {info.connected
              ? "Yes (DFS)"
              : `${info.componentCount} components`}
          </dd>
        </div>
      </dl>
    </aside>
  );
}
