import { db, sources, articles } from "./index";

const allSources = db.select().from(sources).all();
const allArticles = db.select().from(articles).all();

console.log(`Sources: ${allSources.length}`);
console.log(`Articles: ${allArticles.length}`);

const articleBySource = allArticles.reduce<Record<number, number>>((acc, article) => {
  const sourceId = article.sourceId as number;
  acc[sourceId] = (acc[sourceId] ?? 0) + 1;
  return acc;
}, {});

console.log("Articles by source:");
for (const source of allSources) {
  const count = articleBySource[source.id as number] ?? 0;
  console.log(`- ${source.name}: ${count}`);
}
