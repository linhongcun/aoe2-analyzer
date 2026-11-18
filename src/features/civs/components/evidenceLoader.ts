export function createEvidenceLoader<C, R>(loadCore: () => Promise<C>, loadRenderer: () => Promise<R>) {
  let successful: { core: C; renderer: R } | null = null;
  let pending: Promise<{ core: C; renderer: R }> | null = null;
  return () => {
    if (successful) return Promise.resolve(successful);
    if (pending) return pending;
    const request = Promise.all([loadCore(), loadRenderer()])
      .then(([core, renderer]) => {
        successful = { core, renderer };
        return successful;
      })
      .finally(() => {
        if (pending === request) pending = null;
      });
    pending = request;
    return request;
  };
}
