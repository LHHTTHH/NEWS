export type RelatedLink = {
  title: string;
  sourceName: string;
  publishedAt: string;
  articleUrl: string;
  keyword: string;
};

export type NewsGroup = {
  id: string;
  title: string;
  sourceName: string;
  publishedAt: string;
  summary: string;
  articleUrl: string;
  keyword: string;
  relatedLinks: RelatedLink[];
};

export type SavedArticle = NewsGroup & {
  savedAt: string;
};

export type NewsResponse = {
  articles: NewsGroup[];
};
