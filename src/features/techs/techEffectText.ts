/** Issue 710: this technology trains units; retain shared numeric effect projection. */
export const techEffectText = (id: number, text: string) => (id === 884 ? text.replaceAll('建造速度', '训练速度').replaceAll('建造时间', '训练时间') : text);
