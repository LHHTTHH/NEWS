import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { fetchArticleContent, fetchNews } from "./lib/api";
import { formatDateTime } from "./lib/format";
import {
  loadExcludedSources,
  loadExcludedWords,
  loadKeywordEnabledMap,
  loadKeywords,
  loadPeriodFilter,
  loadSavedArticles,
  saveExcludedSources,
  saveExcludedWords,
  saveKeywordEnabledMap,
  saveKeywords,
  savePeriodFilter,
  saveSavedArticles
} from "./lib/storage";
import type { NewsGroup, SavedArticle } from "./types";

type PeriodFilter = "24h" | "3d" | "7d";

const PERIOD_FILTER_OPTIONS: Array<{ value: PeriodFilter; label: string; days: number }> = [
  { value: "24h", label: "24時間以内", days: 1 },
  { value: "3d", label: "3日以内", days: 3 },
  { value: "7d", label: "7日以内", days: 7 }
];
const SHOW_SAVED_PANEL = false;

type ArticleContentState = {
  status: "idle" | "loading" | "ready" | "error";
  content?: string;
  resolvedUrl?: string;
  error?: string;
};

function App() {
  const [keywords, setKeywords] = useState<string[]>(() => loadKeywords());
  const [keywordEnabledMap, setKeywordEnabledMap] = useState<
    Record<string, boolean>
  >(() => loadKeywordEnabledMap());
  const [excludedWords, setExcludedWords] = useState<string[]>(() =>
    loadExcludedWords()
  );
  const [excludedSources, setExcludedSources] = useState<string[]>(() =>
    loadExcludedSources()
  );
  const [savedArticles, setSavedArticles] = useState<SavedArticle[]>(() =>
    loadSavedArticles()
  );
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>(() => {
    const storedFilter = loadPeriodFilter();
    return isPeriodFilter(storedFilter) ? storedFilter : "24h";
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [articles, setArticles] = useState<NewsGroup[]>([]);
  const [expandedArticleIds, setExpandedArticleIds] = useState<
    Record<string, boolean>
  >({});
  const [articleContentMap, setArticleContentMap] = useState<
    Record<string, ArticleContentState>
  >({});
  const [keywordInput, setKeywordInput] = useState("");
  const [excludedWordInput, setExcludedWordInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    saveKeywords(keywords);
  }, [keywords]);

  useEffect(() => {
    const nextEnabledMap = Object.fromEntries(
      keywords.map((keyword) => [keyword, keywordEnabledMap[keyword] ?? true])
    );
    saveKeywordEnabledMap(nextEnabledMap);
  }, [keywords, keywordEnabledMap]);

  useEffect(() => {
    saveExcludedWords(excludedWords);
  }, [excludedWords]);

  useEffect(() => {
    saveExcludedSources(excludedSources);
  }, [excludedSources]);

  useEffect(() => {
    savePeriodFilter(periodFilter);
  }, [periodFilter]);

  useEffect(() => {
    saveSavedArticles(savedArticles);
  }, [savedArticles]);

  useEffect(() => {
    const activeKeywords = keywords.filter(
      (keyword) => keywordEnabledMap[keyword] ?? true
    );

    if (keywords.length === 0 || activeKeywords.length === 0) {
      setArticles([]);
      setError(null);
      if (keywords.length === 0) {
        setLastUpdatedAt(null);
      }
      return;
    }

    let active = true;

    async function loadArticles() {
      setLoading(true);
      setError(null);

      try {
        const nextArticles = await fetchNews(activeKeywords);
        if (!active) {
          return;
        }

        setArticles(nextArticles);
        setLastUpdatedAt(new Date().toISOString());
      } catch (loadError) {
        if (!active) {
          return;
        }

        const message =
          loadError instanceof Error
            ? loadError.message
            : "ニュースの取得に失敗しました。";

        setError(message);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadArticles();

    return () => {
      active = false;
    };
  }, [keywords, keywordEnabledMap]);

  const activeKeywords = keywords.filter(
    (keyword) => keywordEnabledMap[keyword] ?? true
  );
  const sortedSavedArticles = [...savedArticles].sort(
    (left, right) =>
      new Date(right.savedAt).getTime() - new Date(left.savedAt).getTime()
  );
  const periodFilteredArticles = articles.filter((article) =>
    isArticleInPeriod(article.publishedAt, periodFilter)
  );
  const sourceFilteredArticles = periodFilteredArticles.filter((article) => {
    const normalizedSourceName = normalizeSourceName(article.sourceName);

    if (
      excludedSources.some(
        (sourceName) => normalizeSourceName(sourceName) === normalizedSourceName
      )
    ) {
      return false;
    }

    return true;
  });
  const visibleArticles = sourceFilteredArticles.filter((article) => {
    if (excludedWords.length === 0) {
      return true;
    }

    const haystack = `${article.title} ${article.summary}`.toLowerCase();
    return !excludedWords.some((word) => haystack.includes(word.toLowerCase()));
  });
  const periodExcludedCount = articles.length - periodFilteredArticles.length;
  const sourceExcludedCount =
    periodFilteredArticles.length - sourceFilteredArticles.length;
  const wordExcludedCount = sourceFilteredArticles.length - visibleArticles.length;
  const excludedArticleCount =
    sourceExcludedCount + wordExcludedCount;
  const countBreakdownText = [
    periodExcludedCount > 0 ? `期間で${periodExcludedCount}件` : null,
    sourceExcludedCount > 0 ? `ソース除外で${sourceExcludedCount}件` : null,
    wordExcludedCount > 0 ? `除外ワードで${wordExcludedCount}件` : null
  ]
    .filter(Boolean)
    .join(" / ");
  const activePeriodLabel =
    PERIOD_FILTER_OPTIONS.find((option) => option.value === periodFilter)?.label ??
    "24時間以内";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextKeyword = keywordInput.trim();
    if (!nextKeyword) {
      return;
    }

    const alreadyExists = keywords.some(
      (keyword) => keyword.toLowerCase() === nextKeyword.toLowerCase()
    );

    if (alreadyExists) {
      setKeywordInput("");
      return;
    }

    setKeywords((currentKeywords) => [...currentKeywords, nextKeyword]);
    setKeywordEnabledMap((currentMap) => ({
      ...currentMap,
      [nextKeyword]: true
    }));
    setKeywordInput("");
  }

  function handleExcludedWordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextExcludedWord = excludedWordInput.trim();
    if (!nextExcludedWord) {
      return;
    }

    const alreadyExists = excludedWords.some(
      (word) => word.toLowerCase() === nextExcludedWord.toLowerCase()
    );

    if (alreadyExists) {
      setExcludedWordInput("");
      return;
    }

    setExcludedWords((currentWords) => [...currentWords, nextExcludedWord]);
    setExcludedWordInput("");
  }

  function handleRemoveKeyword(keywordToRemove: string) {
    setKeywords((currentKeywords) =>
      currentKeywords.filter((keyword) => keyword !== keywordToRemove)
    );
    setKeywordEnabledMap((currentMap) => {
      const nextMap = { ...currentMap };
      delete nextMap[keywordToRemove];
      return nextMap;
    });
  }

  function handleToggleKeyword(keywordToToggle: string) {
    setKeywordEnabledMap((currentMap) => ({
      ...currentMap,
      [keywordToToggle]: !(currentMap[keywordToToggle] ?? true)
    }));
  }

  function handleRemoveExcludedWord(wordToRemove: string) {
    setExcludedWords((currentWords) =>
      currentWords.filter((word) => word !== wordToRemove)
    );
  }

  function handleAddExcludedSource(sourceName: string) {
    const normalizedSourceName = normalizeSourceName(sourceName);
    if (!normalizedSourceName) {
      return;
    }

    setExcludedSources((currentSources) => {
      if (
        currentSources.some(
          (currentSource) =>
            normalizeSourceName(currentSource) === normalizedSourceName
        )
      ) {
        return currentSources;
      }

      return [...currentSources, sourceName];
    });
  }

  function handleRemoveExcludedSource(sourceNameToRemove: string) {
    const normalizedSourceName = normalizeSourceName(sourceNameToRemove);

    setExcludedSources((currentSources) =>
      currentSources.filter(
        (sourceName) =>
          normalizeSourceName(sourceName) !== normalizedSourceName
      )
    );
  }

  async function handleToggleArticleContent(article: NewsGroup) {
    const isExpanded = expandedArticleIds[article.id] ?? false;

    if (isExpanded) {
      setExpandedArticleIds((current) => ({
        ...current,
        [article.id]: false
      }));
      return;
    }

    setExpandedArticleIds((current) => ({
      ...current,
      [article.id]: true
    }));

    const currentContentState = articleContentMap[article.id];
    if (
      currentContentState?.status === "ready" ||
      currentContentState?.status === "loading"
    ) {
      return;
    }

    setArticleContentMap((current) => ({
      ...current,
      [article.id]: {
        status: "loading"
      }
    }));

    try {
      const articleContent = await fetchArticleContent(article.articleUrl);
      setArticleContentMap((current) => ({
        ...current,
        [article.id]: {
          status: "ready",
          content: articleContent.content,
          resolvedUrl: articleContent.resolvedUrl
        }
      }));
    } catch (contentError) {
      const message =
        contentError instanceof Error
          ? contentError.message
          : "本文の取得に失敗しました。";

      setArticleContentMap((current) => ({
        ...current,
        [article.id]: {
          status: "error",
          error: message
        }
      }));
    }
  }

  async function handleRefresh() {
    if (activeKeywords.length === 0) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const nextArticles = await fetchNews(activeKeywords);
      setArticles(nextArticles);
      setLastUpdatedAt(new Date().toISOString());
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "ニュースの取得に失敗しました。";

      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function handleSaveArticle(article: NewsGroup) {
    setSavedArticles((currentArticles) => {
      if (currentArticles.some((savedArticle) => savedArticle.id === article.id)) {
        return currentArticles;
      }

      return [
        {
          ...article,
          savedAt: new Date().toISOString()
        },
        ...currentArticles
      ];
    });
  }

  function handleRemoveSavedArticle(articleId: string) {
    setSavedArticles((currentArticles) =>
      currentArticles.filter((article) => article.id !== articleId)
    );
  }

  function isSaved(articleId: string): boolean {
    return savedArticles.some((article) => article.id === articleId);
  }

  return (
    <div className="page-shell">
      <main className="app-container">
        <section className="panel hero-panel">
          <div className="hero-copy">
            <p className="eyebrow">AI News Collector</p>
            <h1>AIニュース収集</h1>
            <p className="hero-description">
              登録したキーワードで記事をまとめて取得し、気になったものを後で読める最小版です。
            </p>
          </div>

          <form className="keyword-form" onSubmit={handleSubmit}>
            <label className="field-label" htmlFor="keyword-input">
              キーワード
            </label>
            <div className="keyword-form-row">
              <input
                id="keyword-input"
                className="text-input"
                type="text"
                placeholder="例: OpenAI, LLM, Anthropic"
                value={keywordInput}
                onChange={(event) => setKeywordInput(event.target.value)}
              />
              <button className="primary-button" type="submit">
                追加
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => void handleRefresh()}
                disabled={loading || activeKeywords.length === 0}
              >
                再取得
              </button>
              <button
                className="ghost-button"
                type="button"
                onClick={() => setIsSettingsOpen((current) => !current)}
              >
                {isSettingsOpen ? "条件設定を閉じる" : "条件設定を開く"}
              </button>
            </div>
          </form>

          {isSettingsOpen ? (
            <div className="settings-panel">
              <form
                className="keyword-form settings-form"
                onSubmit={handleExcludedWordSubmit}
              >
                <label className="field-label" htmlFor="excluded-word-input">
                  除外ワード
                </label>
                <div className="keyword-form-row">
                  <input
                    id="excluded-word-input"
                    className="text-input"
                    type="text"
                    placeholder="例: 求人, PR, セール"
                    value={excludedWordInput}
                    onChange={(event) => setExcludedWordInput(event.target.value)}
                  />
                  <button className="secondary-button" type="submit">
                    追加
                  </button>
                </div>
              </form>

              <div className="settings-grid">
                <div className="filter-word-section">
                  <div className="inline-section-header">
                    <p className="field-label">登録済みキーワード</p>
                    <span className="count-badge">
                      有効 {activeKeywords.length}/{keywords.length}
                    </span>
                  </div>

                  {keywords.length === 0 ? (
                    <p className="muted-text">
                      まだキーワードがありません。まずは1つ登録してください。
                    </p>
                  ) : (
                    <div className="filter-word-list">
                      {keywords.map((keyword) => {
                        const isEnabled = keywordEnabledMap[keyword] ?? true;

                        return (
                          <div
                            key={keyword}
                            className={`filter-word-item keyword-item${
                              isEnabled ? "" : " is-disabled"
                            }`}
                          >
                            <div className="keyword-item-copy">
                              <span className="filter-word-text">{keyword}</span>
                              <span className="chip-action">
                                {isEnabled ? "有効" : "無効"}
                              </span>
                            </div>
                            <div className="keyword-item-actions">
                              <button
                                className={`compact-button ${
                                  isEnabled ? "secondary-button" : "ghost-button"
                                }`}
                                type="button"
                                onClick={() => handleToggleKeyword(keyword)}
                              >
                                {isEnabled ? "OFF" : "ON"}
                              </button>
                              <button
                                className="ghost-button compact-button"
                                type="button"
                                onClick={() => handleRemoveKeyword(keyword)}
                              >
                                削除
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="filter-word-section">
                  <div className="inline-section-header">
                    <p className="field-label">登録済みの除外ワード</p>
                    <span className="count-badge">{excludedWords.length}件</span>
                  </div>

                  {excludedWords.length === 0 ? (
                    <p className="muted-text">除外ワードは未設定です。</p>
                  ) : (
                    <div className="filter-word-list">
                      {excludedWords.map((word) => (
                        <div key={word} className="filter-word-item">
                          <span className="filter-word-text">{word}</span>
                          <button
                            className="ghost-button compact-button"
                            type="button"
                            onClick={() => handleRemoveExcludedWord(word)}
                          >
                            削除
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="filter-word-section">
                  <div className="inline-section-header">
                    <p className="field-label">登録済みの除外ソース</p>
                    <span className="count-badge">{excludedSources.length}件</span>
                  </div>

                  {excludedSources.length === 0 ? (
                    <p className="muted-text">除外ソースは未設定です。</p>
                  ) : (
                    <div className="source-chip-list">
                      {excludedSources.map((sourceName) => (
                        <div key={sourceName} className="source-chip">
                          <span className="filter-word-text">{sourceName}</span>
                          <button
                            className="ghost-button compact-button"
                            type="button"
                            onClick={() => handleRemoveExcludedSource(sourceName)}
                          >
                            解除
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          <div className="status-row">
            <div className="status-card">
              <span className="status-label">状態</span>
              <span className="status-value">{loading ? "取得中..." : "待機中"}</span>
            </div>
            <div className="status-card">
              <span className="status-label">最終更新</span>
              <span className="status-value">
                {lastUpdatedAt ? formatDateTime(lastUpdatedAt) : "未取得"}
              </span>
            </div>
          </div>

          {error ? <p className="error-banner">{error}</p> : null}
        </section>

        <section
          className={`content-grid${SHOW_SAVED_PANEL ? "" : " content-grid-single"}`}
        >
          <div className="panel">
            <div className="section-header">
              <div className="section-heading">
                <p className="eyebrow">Latest</p>
                <h2>記事一覧</h2>
                {countBreakdownText ? (
                  <p className="header-subtext">
                    内訳: {countBreakdownText}
                  </p>
                ) : null}
              </div>
              <div className="section-header-actions">
                <div className="period-filter-group" aria-label="期間フィルタ">
                  {PERIOD_FILTER_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      className={`period-filter-button${
                        periodFilter === option.value ? " is-active" : ""
                      }`}
                      type="button"
                      onClick={() => setPeriodFilter(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className="header-badges">
                  <span className="count-badge count-badge-strong">
                    表示 {visibleArticles.length}件
                  </span>
                  {excludedArticleCount > 0 ? (
                    <span className="count-badge muted-badge">
                      除外 {excludedArticleCount}件
                    </span>
                  ) : null}
                  <span className="count-badge count-badge-soft">
                    {activePeriodLabel}
                  </span>
                </div>
              </div>
            </div>

            <div className="card-list">
              {keywords.length === 0 ? (
                <EmptyState
                  title="キーワードを登録すると記事一覧が表示されます"
                  description="Google News RSS を Vercel Functions 経由で取得します。"
                />
              ) : activeKeywords.length === 0 ? (
                <EmptyState
                  title="有効なキーワードがありません"
                  description="登録済みキーワードを ON にすると記事一覧を再取得できます。"
                />
              ) : articles.length === 0 && !loading ? (
                <EmptyState
                  title="表示できる記事がまだありません"
                  description="キーワードを変えるか、再取得を試してください。"
                />
              ) : periodFilteredArticles.length === 0 && !loading ? (
                <EmptyState
                  title="選択中の期間に該当する記事がありません"
                  description="期間を広げるか、キーワードを変えて再取得してください。"
                />
              ) : visibleArticles.length === 0 && !loading ? (
                <EmptyState
                  title="除外ワードの条件で記事が表示されていません"
                  description="除外ワードを減らすか、キーワードを変えて再取得してください。"
                />
              ) : (
                visibleArticles.map((article) => (
                  <article className="article-card" key={article.id}>
                    <div className="article-card-header">
                      <div className="article-card-main">
                        <p className="article-meta">
                          {article.sourceName}・{formatDateTime(article.publishedAt)}
                        </p>
                        <h3>{article.title}</h3>
                      </div>
                      <div className="article-card-actions">
                        <button
                          className="ghost-button compact-button article-action-button"
                          type="button"
                          onClick={() => void handleToggleArticleContent(article)}
                        >
                          {expandedArticleIds[article.id] ? "本文を閉じる" : "本文を表示"}
                        </button>
                        <button
                          className="ghost-button compact-button article-action-button"
                          type="button"
                          onClick={() => handleAddExcludedSource(article.sourceName)}
                        >
                          このソースを除外
                        </button>
                        <button
                          className="secondary-button compact-button article-action-button"
                          type="button"
                          onClick={() => handleSaveArticle(article)}
                          disabled={isSaved(article.id)}
                        >
                          {isSaved(article.id) ? "保存済み" : "後で読む"}
                        </button>
                      </div>
                    </div>

                    <p className="summary">{article.summary}</p>

                    {expandedArticleIds[article.id] ? (
                      <div className="article-content-panel">
                        {articleContentMap[article.id]?.status === "loading" ? (
                          <p className="article-content-status">本文を取得中...</p>
                        ) : null}

                        {articleContentMap[article.id]?.status === "error" ? (
                          <p className="article-content-error">
                            {articleContentMap[article.id]?.error}
                          </p>
                        ) : null}

                        {articleContentMap[article.id]?.status === "ready" ? (
                          <>
                            <div className="article-content-text">
                              {articleContentMap[article.id]?.content
                                ?.split(/\n{2,}/)
                                .filter(Boolean)
                                .map((paragraph, index) => (
                                  <p key={`${article.id}-${index}`}>{paragraph}</p>
                                ))}
                            </div>
                            {articleContentMap[article.id]?.resolvedUrl &&
                            articleContentMap[article.id]?.resolvedUrl !==
                              article.articleUrl ? (
                              <p className="article-content-note">
                                抽出元:{" "}
                                <a
                                  href={articleContentMap[article.id]?.resolvedUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  実際の記事URLを開く
                                </a>
                              </p>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="article-footer">
                      <span className="keyword-pill">{article.keyword}</span>
                      <a
                        className="link-button"
                        href={article.articleUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        元記事を開く
                      </a>
                    </div>

                    {article.relatedLinks.length > 0 ? (
                      <p className="related-count">
                        関連記事 {article.relatedLinks.length} 件を同一グループにまとめています。
                      </p>
                    ) : null}
                  </article>
                ))
              )}
            </div>
          </div>

          {SHOW_SAVED_PANEL ? (
            <div className="panel">
              <div className="section-header">
                <div>
                  <p className="eyebrow">Saved</p>
                  <h2>後で読む</h2>
                </div>
                <span className="count-badge">{sortedSavedArticles.length}件</span>
              </div>

              <div className="card-list">
                {sortedSavedArticles.length === 0 ? (
                  <EmptyState
                    title="保存した記事はここに表示されます"
                    description="記事一覧の「後で読む」ボタンで追加できます。"
                  />
                ) : (
                  sortedSavedArticles.map((article) => (
                    <article className="article-card compact-card" key={article.id}>
                      <p className="article-meta">
                        保存日時: {formatDateTime(article.savedAt)}
                      </p>
                      <h3>{article.title}</h3>
                      <p className="summary">{article.summary}</p>
                      <div className="article-footer">
                        <a
                          className="link-button"
                          href={article.articleUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          元記事を開く
                        </a>
                        <button
                          className="ghost-button"
                          type="button"
                          onClick={() => handleRemoveSavedArticle(article.id)}
                        >
                          削除
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}

type EmptyStateProps = {
  title: string;
  description: string;
};

function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <p className="empty-title">{title}</p>
      <p className="muted-text">{description}</p>
    </div>
  );
}

function isPeriodFilter(value: string): value is PeriodFilter {
  return PERIOD_FILTER_OPTIONS.some((option) => option.value === value);
}

function isArticleInPeriod(publishedAt: string, periodFilter: PeriodFilter): boolean {
  const publishedAtTime = new Date(publishedAt).getTime();
  if (Number.isNaN(publishedAtTime)) {
    return false;
  }

  const selectedOption = PERIOD_FILTER_OPTIONS.find(
    (option) => option.value === periodFilter
  );

  if (!selectedOption) {
    return true;
  }

  const cutoffTime = Date.now() - selectedOption.days * 24 * 60 * 60 * 1000;
  return publishedAtTime >= cutoffTime;
}

function normalizeSourceName(sourceName: string): string {
  return sourceName.trim().toLowerCase();
}

export default App;
