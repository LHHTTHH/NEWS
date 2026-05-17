import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  checkSession,
  fetchArticleContent,
  fetchNews,
  login,
  logout
} from "./lib/api";
import { formatDateTime } from "./lib/format";
import {
  loadExcludedSources,
  loadExcludedWords,
  loadKeywordEnabledMap,
  loadKeywords,
  loadPeriodFilter,
  loadReadingState,
  loadSavedArticles,
  saveExcludedSources,
  saveExcludedWords,
  saveKeywordEnabledMap,
  saveKeywords,
  savePeriodFilter,
  saveReadingState,
  saveSavedArticles
} from "./lib/storage";
import {
  PERIOD_FILTER_OPTIONS,
  buildPartialFailureMessage,
  filterNewsArticles,
  isPeriodFilter,
  normalizeSourceName
} from "./lib/news";
import type { PeriodFilter, ReadingView } from "./lib/news";
import {
  filterArticlesByReadingView,
  getReadingCounts,
  isArticleNewSince,
  isArticleRead,
  markArticleUnread,
  markArticlesRead,
  markSessionOpened,
  mergeSeenArticles
} from "./lib/reading";
import type { ReadingState } from "./lib/reading";
import type { NewsGroup, SavedArticle } from "./types";

type AuthStatus = "checking" | "authenticated" | "unauthenticated";
type ActiveTab =
  | { type: "all" }
  | { type: "keyword"; keyword: string }
  | { type: "saved" };

type ArticleContentState = {
  status: "idle" | "loading" | "ready" | "error";
  content?: string;
  resolvedUrl?: string;
  error?: string;
};

function App() {
  const [initialReadingState] = useState<ReadingState>(() => loadReadingState());
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
  const [readingState, setReadingState] = useState<ReadingState>(
    initialReadingState
  );
  const [previousSessionAt] = useState<string | null>(
    initialReadingState.lastOpenedAt
  );
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>(() => {
    const storedFilter = loadPeriodFilter();
    return isPeriodFilter(storedFilter) ? storedFilter : "24h";
  });
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
  const [warning, setWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>("checking");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>({ type: "all" });
  const [readingView, setReadingView] = useState<ReadingView>("unread");
  const [readNotice, setReadNotice] = useState<string | null>(null);
  const isFirstReadingSession = previousSessionAt === null;

  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isMobileMenuOpen]);

  useEffect(() => {
    let active = true;

    async function loadSession() {
      try {
        const session = await checkSession();
        if (!active) {
          return;
        }

        setAuthStatus(session.authenticated ? "authenticated" : "unauthenticated");
        setAuthError(session.error ?? null);
      } catch (sessionError) {
        if (!active) {
          return;
        }

        setAuthStatus("unauthenticated");
        setAuthError(
          sessionError instanceof Error
            ? sessionError.message
            : "ログイン状態の確認に失敗しました。"
        );
      }
    }

    void loadSession();

    return () => {
      active = false;
    };
  }, []);

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
    saveReadingState(readingState);
  }, [readingState]);

  useEffect(() => {
    if (!readNotice) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setReadNotice(null);
    }, 4500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [readNotice]);

  useEffect(() => {
    if (authStatus !== "authenticated") {
      return;
    }

    setReadingState((currentState) =>
      markSessionOpened(currentState, new Date().toISOString())
    );
  }, [authStatus]);

  useEffect(() => {
    if (authStatus !== "authenticated") {
      return;
    }

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
      setWarning(null);

      try {
        const newsResponse = await fetchNews(activeKeywords);
        if (!active) {
          return;
        }

        setArticles(newsResponse.articles);
        setReadingState((currentState) =>
          mergeSeenArticles(currentState, newsResponse.articles)
        );
        setWarning(buildPartialFailureMessage(newsResponse.partialFailureKeywords));
        setLastUpdatedAt(new Date().toISOString());
      } catch (loadError) {
        if (!active) {
          return;
        }

        const message =
          loadError instanceof Error
            ? loadError.message
            : "ニュースの取得に失敗しました。";

        if (message.includes("ログイン")) {
          setAuthStatus("unauthenticated");
        }

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
  }, [authStatus, keywords, keywordEnabledMap]);

  const activeKeywords = keywords.filter(
    (keyword) => keywordEnabledMap[keyword] ?? true
  );
  const activeKeywordSignature = activeKeywords.join("\u0000");

  useEffect(() => {
    if (activeTab.type === "keyword" && !activeKeywords.includes(activeTab.keyword)) {
      setActiveTab({ type: "all" });
    }
  }, [activeTab, activeKeywordSignature]);

  const sortedSavedArticles = [...savedArticles].sort(
    (left, right) =>
      new Date(right.savedAt).getTime() - new Date(left.savedAt).getTime()
  );
  const {
    periodFilteredArticles,
    visibleArticles,
    periodExcludedCount,
    sourceExcludedCount,
    wordExcludedCount
  } = filterNewsArticles(articles, {
    excludedSources,
    excludedWords,
    periodFilter
  });
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

  const tabFilteredArticles = visibleArticles.filter(
    (article) => activeTab.type !== "keyword" || article.keyword === activeTab.keyword
  );
  const readingCounts = getReadingCounts(
    tabFilteredArticles,
    readingState,
    previousSessionAt
  );
  const readingFilteredArticles = filterArticlesByReadingView(
    tabFilteredArticles,
    readingState,
    readingView,
    previousSessionAt
  );
  const firstUnreadArticle = readingFilteredArticles.find(
    (article) => !isArticleRead(readingState, article.id)
  );

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

      if (message.includes("ログイン")) {
        setAuthStatus("unauthenticated");
      }

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
    setWarning(null);

    try {
      const newsResponse = await fetchNews(activeKeywords);
      setArticles(newsResponse.articles);
      setReadingState((currentState) =>
        mergeSeenArticles(currentState, newsResponse.articles)
      );
      setWarning(buildPartialFailureMessage(newsResponse.partialFailureKeywords));
      setLastUpdatedAt(new Date().toISOString());
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "ニュースの取得に失敗しました。";

      if (message.includes("ログイン")) {
        setAuthStatus("unauthenticated");
      }

      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function handleSaveArticle(article: NewsGroup) {
    setSavedArticles((currentArticles) => {
      if (
        currentArticles.some(
          (savedArticle) =>
            savedArticle.id === article.id ||
            savedArticle.articleUrl === article.articleUrl
        )
      ) {
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

  function handleMarkArticleRead(articleId: string) {
    setReadingState((currentState) => markArticlesRead(currentState, [articleId]));
  }

  function handleToggleRead(articleId: string) {
    setReadingState((currentState) =>
      isArticleRead(currentState, articleId)
        ? markArticleUnread(currentState, articleId)
        : markArticlesRead(currentState, [articleId])
    );
  }

  function handleMarkVisibleRead() {
    const articleIds = readingFilteredArticles.map((article) => article.id);
    if (articleIds.length === 0) {
      return;
    }

    setReadingState((currentState) =>
      markArticlesRead(currentState, articleIds)
    );
    setReadNotice(`${articleIds.length}件を既読にしました。`);
  }

  function handleJumpToFirstUnread() {
    if (!firstUnreadArticle) {
      return;
    }

    document
      .getElementById(toArticleElementId(firstUnreadArticle.id))
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleLoginSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const submittedPassword = String(formData.get("password") ?? authPassword).trim();

    if (!submittedPassword) {
      return;
    }

    setAuthLoading(true);
    setAuthError(null);

    try {
      const response = await login(submittedPassword);
      setAuthStatus(response.authenticated ? "authenticated" : "unauthenticated");
      setAuthPassword("");
    } catch (loginError) {
      setAuthError(
        loginError instanceof Error ? loginError.message : "ログインに失敗しました。"
      );
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    setAuthLoading(true);
    setAuthError(null);

    try {
      await logout();
      setAuthStatus("unauthenticated");
      setArticles([]);
      setLastUpdatedAt(null);
    } catch (logoutError) {
      setAuthError(
        logoutError instanceof Error
          ? logoutError.message
          : "ログアウトに失敗しました。"
      );
    } finally {
      setAuthLoading(false);
    }
  }

  if (authStatus !== "authenticated") {
    return (
      <AuthScreen
        authError={authError}
        authLoading={authLoading}
        authPassword={authPassword}
        authStatus={authStatus}
        onPasswordChange={setAuthPassword}
        onSubmit={handleLoginSubmit}
      />
    );
  }

  return (
    <div className="app-container">
      {/* Mobile Header */}
      <div className="mobile-header">
        <div className="brand-small">
          <h2>AI News</h2>
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label="Open filters menu"
          onClick={() => setIsMobileMenuOpen(true)}
        >
          ☰
        </button>
      </div>

      {isMobileMenuOpen && (
        <div className="mobile-overlay" onClick={() => setIsMobileMenuOpen(false)}></div>
      )}

      <aside className={`sidebar ${isMobileMenuOpen ? "is-open" : ""}`}>
        <button
          className="mobile-close-btn"
          type="button"
          aria-label="Close filters menu"
          onClick={() => setIsMobileMenuOpen(false)}
        >
          ×
        </button>
        <div className="brand">
          <p className="eyebrow">Powered by AI</p>
          <h1>AI News</h1>
        </div>

        <div className="sidebar-section">
          <p className="sidebar-section-title">Topics & Keywords</p>
          <form className="keyword-form" onSubmit={handleSubmit}>
            <div className="keyword-form-row">
              <input
                id="keyword-input"
                className="text-input"
                type="text"
                placeholder="Ex: AI, GPT-4"
                value={keywordInput}
                onChange={(event) => setKeywordInput(event.target.value)}
              />
              <button className="primary-button" type="submit">
                Add
              </button>
            </div>
          </form>

          {keywords.length > 0 && (
            <div className="filter-word-list">
              {keywords.map((keyword) => {
                const isEnabled = keywordEnabledMap[keyword] ?? true;
                return (
                  <div key={keyword} className={`keyword-item ${isEnabled ? "" : "is-disabled"}`}>
                    <span>{keyword}</span>
                    <button className="toggle-btn" type="button" onClick={() => handleToggleKeyword(keyword)}>
                      {isEnabled ? "✓" : "○"}
                    </button>
                    <button className="remove-btn" type="button" onClick={() => handleRemoveKeyword(keyword)}>
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="sidebar-section">
          <p className="sidebar-section-title">Exclude Words</p>
          <form className="keyword-form" onSubmit={handleExcludedWordSubmit}>
            <div className="keyword-form-row">
              <input
                id="excluded-word-input"
                className="text-input"
                type="text"
                placeholder="Ex: PR, Job"
                value={excludedWordInput}
                onChange={(event) => setExcludedWordInput(event.target.value)}
              />
              <button className="secondary-button" type="submit">
                Add
              </button>
            </div>
          </form>
          {excludedWords.length > 0 && (
            <div className="filter-word-list">
              {excludedWords.map((word) => (
                <div key={word} className="keyword-item">
                  <span>{word}</span>
                  <button className="remove-btn" type="button" onClick={() => handleRemoveExcludedWord(word)}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {excludedSources.length > 0 && (
          <div className="sidebar-section">
            <p className="sidebar-section-title">Excluded Sources</p>
            <div className="filter-word-list">
              {excludedSources.map((sourceName) => (
                <div key={sourceName} className="keyword-item">
                  <span>{sourceName}</span>
                  <button className="remove-btn" type="button" onClick={() => handleRemoveExcludedSource(sourceName)}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="sidebar-section status-row">
           <div className="status-card">
              <span className="status-label">Status:</span>
              <span className="status-value">{loading ? "Updating..." : "Ready"}</span>
            </div>
            <div className="status-card">
              <span className="status-label">Last Updated:</span>
              <span className="status-value">
                {lastUpdatedAt ? formatDateTime(lastUpdatedAt) : "N/A"}
              </span>
            </div>
            <button className="ghost-button" type="button" onClick={() => void handleLogout()} disabled={authLoading} style={{marginTop: '8px', width: '100%'}}>
              Logout
            </button>
        </div>

        {error && <p className="error-banner">{error}</p>}
        {warning && <p className="warning-banner">{warning}</p>}

      </aside>

      <main className="main-content">
        <div className="main-header">
          <div>
            <h2>Dashboard</h2>
            <p className="header-subtitle">
              {activePeriodLabel}
              {previousSessionAt ? ` / 前回閲覧 ${formatDateTime(previousSessionAt)}` : ""}
            </p>
            {countBreakdownText && <p style={{color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px'}}>Excluded: {countBreakdownText}</p>}
          </div>
          <div className="header-actions">
             <div className="period-filters">
                {PERIOD_FILTER_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    className={`period-filter-button ${periodFilter === option.value ? "is-active" : ""}`}
                    type="button"
                    onClick={() => setPeriodFilter(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
             </div>
             <button
                className="primary-button"
                type="button"
                onClick={() => void handleRefresh()}
                disabled={loading || activeKeywords.length === 0}
              >
                Refresh
             </button>
          </div>
        </div>

        <div className="tab-bar-shell" aria-label="News tabs scroll horizontally">
          <div className="tab-bar">
            <button
              className={`tab-item ${activeTab.type === "all" ? "is-active" : ""}`}
              onClick={() => setActiveTab({ type: "all" })}
            >
              All News
            </button>
            {activeKeywords.map(keyword => (
              <button
                key={`tab-${keyword}`}
                className={`tab-item ${
                  activeTab.type === "keyword" && activeTab.keyword === keyword ? "is-active" : ""
                }`}
                onClick={() => setActiveTab({ type: "keyword", keyword })}
              >
                {keyword}
              </button>
            ))}
            <button
              className={`tab-item saved-tab ${activeTab.type === "saved" ? "is-active" : ""}`}
              onClick={() => setActiveTab({ type: "saved" })}
            >
              Saved ({savedArticles.length})
            </button>
          </div>
        </div>

        {activeTab.type !== "saved" && (
          <div className="reading-toolbar">
            <div className="reading-filters" role="tablist" aria-label="Reading filters">
              <button
                className={`reading-filter-button ${readingView === "new" ? "is-active" : ""}`}
                type="button"
                onClick={() => setReadingView("new")}
              >
                新着 {readingCounts.newCount}
              </button>
              <button
                className={`reading-filter-button ${readingView === "unread" ? "is-active" : ""}`}
                type="button"
                onClick={() => setReadingView("unread")}
              >
                未読 {readingCounts.unreadCount}
              </button>
              <button
                className={`reading-filter-button ${readingView === "all" ? "is-active" : ""}`}
                type="button"
                onClick={() => setReadingView("all")}
              >
                すべて {tabFilteredArticles.length}
              </button>
            </div>
            <div className="reading-actions">
              <button
                className="secondary-button compact-button"
                type="button"
                onClick={handleJumpToFirstUnread}
                disabled={!firstUnreadArticle}
              >
                未読へ
              </button>
              <button
                className="ghost-button compact-button"
                type="button"
                onClick={handleMarkVisibleRead}
                disabled={readingFilteredArticles.length === 0}
              >
                表示分を既読
              </button>
            </div>
          </div>
        )}

        {activeTab.type !== "saved" && (
          <div className="reading-helper-row" aria-live="polite">
            {readNotice ? (
              <span className="reading-notice">{readNotice}</span>
            ) : isFirstReadingSession ? (
              <span className="reading-hint">
                初回表示のため、新着は未読に近い扱いです。次回以降は前回閲覧後の記事だけが新着になります。
              </span>
            ) : null}
          </div>
        )}

        <div className="bento-grid">
          {activeTab.type === "saved" ? (
             sortedSavedArticles.length === 0 ? (
               <EmptyState
                 title="No saved articles"
                 description="Click the star icon on any article to read it later."
               />
             ) : (
               sortedSavedArticles.map((article) => (
                 <article className="article-card" key={`saved-${article.id}`} style={{border: '1px solid var(--accent-purple)'}}>
                    <div className="article-meta">
                      <span className="source" style={{color: 'var(--accent-purple)'}}>Saved</span>
                      <span className="time">{formatDateTime(article.savedAt)}</span>
                    </div>
                    <h3>{article.title}</h3>
                    <div className="article-actions">
                      <a className="icon-button" href={article.articleUrl} target="_blank" rel="noreferrer" title="Open Original">Link</a>
                      <button className="icon-button" style={{color: 'var(--danger)'}} type="button" onClick={() => handleRemoveSavedArticle(article.id)} title="Remove from saved">Remove</button>
                    </div>
                 </article>
               ))
             )
          ) : (
             keywords.length === 0 ? (
              <EmptyState
                title="Add a keyword to see the news"
                description="Articles are fetched via Vercel Functions using Google News RSS."
              />
            ) : activeKeywords.length === 0 ? (
              <EmptyState
                title="No active keywords"
                description="Turn on at least one keyword to view articles."
              />
            ) : loading && articles.length === 0 ? (
              <EmptyState
                title="Loading news"
                description="Fetching the latest articles..."
              />
            ) : articles.length === 0 && !loading ? (
              <EmptyState
                title="No articles found"
                description="Try changing keywords or refreshing."
              />
            ) : periodFilteredArticles.length === 0 && !loading ? (
              <EmptyState
                title="No articles in the selected period"
                description="Expand the period or refresh the feed."
              />
            ) : tabFilteredArticles.length === 0 && !loading ? (
              <EmptyState
                title="All articles excluded or no articles for this tab"
                description="Try reducing excluded words or switch tabs."
              />
            ) : readingFilteredArticles.length === 0 && !loading ? (
              <EmptyState
                title={readingView === "new" ? "No new articles" : "No unread articles"}
                description={
                  readingView === "new"
                    ? "No articles were first seen after your previous visit."
                    : "Switch to All to revisit articles you have already read."
                }
              />
            ) : (
              readingFilteredArticles.map((article) => {
                const articleRead = isArticleRead(readingState, article.id);
                const articleNew = isArticleNewSince(
                  readingState,
                  article.id,
                  previousSessionAt
                );

                return (
                <article
                  id={toArticleElementId(article.id)}
                  className={`article-card ${articleRead ? "is-read" : ""}`}
                  key={article.id}
                >
                  <div className="article-meta">
                    <span className="source">{article.sourceName}</span>
                    <span className="time">{formatDateTime(article.publishedAt)}</span>
                  </div>

                  <div className="article-badges">
                    {articleNew && <span className="status-pill is-new">New</span>}
                    {!articleRead && <span className="status-pill">Unread</span>}
                    {article.groupSize > 1 && (
                      <span className="status-pill is-grouped">
                        +{article.groupSize - 1} related
                      </span>
                    )}
                  </div>

                  <h3>{article.title}</h3>

                  {(!expandedArticleIds[article.id] && article.summary) && (
                     <p className="article-summary">{article.summary}</p>
                  )}

                  {expandedArticleIds[article.id] && (
                    <div className="article-content-panel">
                      {articleContentMap[article.id]?.status === "loading" && (
                        <p className="article-content-text" style={{color: 'var(--accent-blue)'}}>Loading article content...</p>
                      )}
                      {articleContentMap[article.id]?.status === "error" && (
                        <p className="article-content-text" style={{color: 'var(--danger)'}}>{articleContentMap[article.id]?.error}</p>
                      )}
                      {articleContentMap[article.id]?.status === "ready" && (
                        <div className="article-content-text">
                          {articleContentMap[article.id]?.content?.split(/\n{2,}/).filter(Boolean).map((paragraph, index) => (
                            <p key={`${article.id}-${index}`}>{paragraph}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {article.relatedLinks.length > 0 && (
                    <details className="related-links">
                      <summary>Related coverage ({article.relatedLinks.length})</summary>
                      <ul>
                        {article.relatedLinks.map((relatedArticle) => (
                          <li key={`${article.id}-${relatedArticle.articleUrl}`}>
                            <a
                              href={relatedArticle.articleUrl}
                              target="_blank"
                              rel="noreferrer"
                              onClick={() => handleMarkArticleRead(article.id)}
                            >
                              {relatedArticle.sourceName}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}

                  <div className="article-actions">
                    <span className="keyword-pill">{article.keyword}</span>
                    <div className="card-icon-buttons">
                      <button className="icon-button" type="button" onClick={() => { handleMarkArticleRead(article.id); void handleToggleArticleContent(article); }} title="Toggle Content">
                        {expandedArticleIds[article.id] ? "Collapse" : "Read"}
                      </button>
                      <a className="icon-button" href={article.articleUrl} target="_blank" rel="noreferrer" title="Open Original" onClick={() => handleMarkArticleRead(article.id)}>
                        Link
                      </a>
                      <button className="icon-button" type="button" onClick={() => handleToggleRead(article.id)} title={articleRead ? "Mark unread" : "Mark read"}>
                        {articleRead ? "Unread" : "Done"}
                      </button>
                      <button className="icon-button" type="button" onClick={() => handleSaveArticle(article)} disabled={isSaved(article.id)} title={isSaved(article.id) ? "Saved" : "Save for later"}>
                        {isSaved(article.id) ? "★" : "☆"}
                      </button>
                      <button className="icon-button" type="button" onClick={() => handleAddExcludedSource(article.sourceName)} title="Exclude Source">
                        🚫
                      </button>
                    </div>
                  </div>
                </article>
                );
              })
            )
          )}
        </div>
      </main>
    </div>
  );
}

type EmptyStateProps = {
  title: string;
  description: string;
};

type AuthScreenProps = {
  authError: string | null;
  authLoading: boolean;
  authPassword: string;
  authStatus: AuthStatus;
  onPasswordChange(password: string): void;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
};

function AuthScreen({
  authError,
  authLoading,
  authPassword,
  authStatus,
  onPasswordChange,
  onSubmit
}: AuthScreenProps) {
  return (
    <div className="auth-page-shell">
      <div className="auth-panel">
        <p className="eyebrow" style={{marginBottom: '8px', color: 'var(--text-secondary)'}}>Private News</p>
        <h1>AI News Collector</h1>
        <p className="auth-description">
          Enter your password to access the modern news dashboard.
        </p>

        {authStatus === "checking" ? (
          <p className="muted-text">Checking authentication...</p>
        ) : (
          <form className="auth-form" autoComplete="on" onSubmit={onSubmit}>
            <input
              type="text"
              name="username"
              autoComplete="username"
              value="news"
              readOnly
              tabIndex={-1}
              aria-hidden="true"
              style={{position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', border: 0, clip: 'rect(0 0 0 0)'}}
            />
            <label className="field-label" htmlFor="auth-password" style={{fontSize: '0.85rem', color: 'var(--text-secondary)'}}>
              Password
            </label>
            <input
              id="auth-password"
              className="text-input"
              type="password"
              name="password"
              autoComplete="current-password"
              value={authPassword}
              onChange={(event) => onPasswordChange(event.target.value)}
              onInput={(event) => onPasswordChange(event.currentTarget.value)}
            />
            <button
              className="primary-button"
              type="submit"
              disabled={authLoading}
              style={{marginTop: '8px'}}
            >
              {authLoading ? "Checking..." : "Unlock"}
            </button>
          </form>
        )}

        {authError ? <p className="error-banner" style={{marginTop: '16px'}}>{authError}</p> : null}
      </div>
    </div>
  );
}

function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <p className="empty-title">{title}</p>
      <p className="muted-text">{description}</p>
    </div>
  );
}

function toArticleElementId(articleId: string): string {
  return `article-${encodeURIComponent(articleId)}`;
}

export default App;
