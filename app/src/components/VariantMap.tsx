import { getVariantClusters, hasExtraVariants } from '../utils/rootHighlight';

interface VariantMapProps {
  roots: string[];
}

export function VariantMap({ roots }: VariantMapProps) {
  if (!hasExtraVariants(roots)) return null;

  const clusters = getVariantClusters(roots);

  return (
    <section className="doc-section variant-map">
      <h2>拼写变体对照</h2>
      <p className="variant-map-hint">
        同一词根族常因发音/拼写规则出现不同写法，含义相同。实色为教材列出的词根，虚线为常见变体。
      </p>
      <div className="root-legend root-legend-static">
        <span className="root-mark">教材词根</span>
        <span className="root-mark root-mark-variant">拼写变体</span>
      </div>
      <div className="variant-clusters">
        {clusters.map((cluster) => (
          <div key={cluster.label} className="variant-cluster">
            <span className="variant-cluster-label">{cluster.label} 系</span>
            <div className="variant-cluster-forms">
              {cluster.allForms.map((form) => {
                const isCatalog = cluster.catalogForms.includes(form);
                return (
                  <span
                    key={form}
                    className={isCatalog ? 'root-mark' : 'root-mark root-mark-variant'}
                    title={isCatalog ? '教材词根' : `${form} · ${cluster.label} 变体`}
                  >
                    {form}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
