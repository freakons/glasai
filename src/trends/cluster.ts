function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '');
}

function isSimilar(a: string, b: string): boolean {
  const aw = normalize(a).split(' ').filter(Boolean);
  const bw = normalize(b).split(' ').filter(Boolean);
  const overlap = aw.filter((w) => bw.includes(w)).length;
  return overlap >= Math.min(aw.length, bw.length) / 2;
}

export function clusterTopics(topics: string[]): string[][] {
  const clusters: string[][] = [];
  for (const topic of topics) {
    let found = false;
    for (const cluster of clusters) {
      if (isSimilar(topic, cluster[0])) {
        cluster.push(topic);
        found = true;
        break;
      }
    }
    if (!found) {
      clusters.push([topic]);
    }
  }
  return clusters;
}
