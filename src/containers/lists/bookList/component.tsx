import React from "react";
import "./booklist.css";
import BookCardItem from "../../../components/bookCardItem";
import BookListItem from "../../../components/bookListItem";
import BookCoverItem from "../../../components/bookCoverItem";
import BookModel from "../../../models/Book";
import { BookListProps, BookListState } from "./interface";
import { ConfigService } from "../../../assets/lib/kookit-extra-browser.min";
import { Redirect, withRouter } from "react-router-dom";
import ViewMode from "../../../components/viewMode";
import SelectBook from "../../../components/selectBook";
import { Trans } from "react-i18next";
import Book from "../../../models/Book";
import { isElectron } from "react-device-detect";
import DatabaseService from "../../../utils/storage/databaseService";
import CoverUtil from "../../../utils/file/coverUtil";
declare var window: any;
let currentBookMode = "home";

class BookList extends React.Component<BookListProps, BookListState> {
  private scrollContainer: React.RefObject<HTMLUListElement>;
  private visibilityChangeHandler: ((event: Event) => void) | null = null;
  private resizeHandler: (() => void) | null = null;
  private scrollRaf = 0;
  private metricsRaf = 0;
  private latestScrollTop = 0;
  private missingCoverKeys = new Set<string>();

  constructor(props: BookListProps) {
    super(props);
    this.scrollContainer = React.createRef();
    this.state = {
      favoriteBooks: Object.keys(
        ConfigService.getAllListConfig("favoriteBooks")
      ).length,
      isHideShelfBook:
        ConfigService.getReaderConfig("isHideShelfBook") === "yes",
      displayedBooksCount: 24,
      isLoadingMore: false,
      fullBooksData: [], // 存储从数据库加载的完整书籍数据
      coverCache: {}, // 预加载的封面缓存
      coverCacheVersion: 0,
      itemWidth: 0,
      itemHeight: 0,
      itemMarginX: 0,
      itemMarginY: 0,
      scrollTop: 0,
    };
  }
  UNSAFE_componentWillMount() {
    this.props.handleFetchBooks();
  }

  async componentDidMount() {
    if (!this.props.books || !this.props.books[0]) {
      return <Redirect to="manager/empty" />;
    }
    this.setState({
      displayedBooksCount: this.getBookCountPerPage(),
    });

    // 保存 resize 监听器引用
    this.resizeHandler = () => {
      //recount the book count per page when the window is resized
      this.props.handleFetchBooks();
      this.scheduleMetricsUpdate();
      this.updateDisplayedBooksCount();
    };
    window.addEventListener("resize", this.resizeHandler);

    // 设置滚动监听器
    this.setupScrollListener();

    // 保存 visibilitychange 监听器引用
    this.visibilityChangeHandler = async (event) => {
      if (document.visibilityState === "visible" && !isElectron) {
        await this.handleFinishReading();
      }
    };
    document.addEventListener("visibilitychange", this.visibilityChangeHandler);

    if (isElectron) {
      const { ipcRenderer } = window.require("electron");
      ipcRenderer.on("reading-finished", async (event: any, config: any) => {
        this.handleFinishReading();
      });
    }

    // 初始加载完整的书籍数据
    await CoverUtil.migrateCoverStoreIfNeeded();
    await this.loadFullBooksData();
    this.scheduleMetricsUpdate();
  }

  componentWillUnmount() {
    // 清理滚动监听器
    this.cleanupScrollListener();

    // 清理封面缓存中的 blob URL
    this.revokeCachedCoverUrls(this.state.coverCache);

    // 清理 resize 监听器
    if (this.resizeHandler) {
      window.removeEventListener("resize", this.resizeHandler);
      this.resizeHandler = null;
    }

    // 清理 visibilitychange 监听器
    if (this.visibilityChangeHandler) {
      document.removeEventListener(
        "visibilitychange",
        this.visibilityChangeHandler
      );
      this.visibilityChangeHandler = null;
    }

    // 清理 IPC 监听器
    if (isElectron) {
      const { ipcRenderer } = window.require("electron");
      ipcRenderer.removeAllListeners("reading-finished");
    }
    if (this.scrollRaf) {
      window.cancelAnimationFrame(this.scrollRaf);
      this.scrollRaf = 0;
    }
    if (this.metricsRaf) {
      window.cancelAnimationFrame(this.metricsRaf);
      this.metricsRaf = 0;
    }
  }

  componentDidUpdate(prevProps: BookListProps) {
    // 当书籍列表更新时，重置显示数量
    if (
      prevProps.books !== this.props.books ||
      prevProps.searchResults !== this.props.searchResults ||
      prevProps.isSearch !== this.props.isSearch ||
      prevProps.mode !== this.props.mode ||
      prevProps.shelfTitle !== this.props.shelfTitle
    ) {
      // 先释放旧缓存中的 blob URL，避免占用内存
      this.revokeCachedCoverUrls(this.state.coverCache);
      // 先清空旧数据并重置滚动位置，避免渲染旧数据
      this.setState(
        {
          displayedBooksCount: this.getBookCountPerPage(),
          isLoadingMore: false,
          scrollTop: 0,
          fullBooksData: [], // 清空旧数据，避免显示旧封面
          coverCache: {}, // 清空封面缓存
          coverCacheVersion: 0,
        },
        () => {
          // 滚动到顶部
          if (this.scrollContainer.current) {
            this.scrollContainer.current.scrollTop = 0;
          }
          this.props.handleLoadMore(false);
          // 状态重置完成后再加载新数据
          this.loadFullBooksData();
          this.scheduleMetricsUpdate();
        }
      );
    }
    if (prevProps.viewMode !== this.props.viewMode) {
      this.scheduleMetricsUpdate();
      this.updateDisplayedBooksCount();
    }
  }

  // 从数据库加载完整的书籍数据
  loadFullBooksData = async () => {
    const { books } = this.handleBooks();
    const displayedBooks = books.slice(0, this.state.displayedBooksCount);

    // 使用批量获取提高性能
    const keys = displayedBooks.map((book: any) => book.key);
    const fullBooksData = await DatabaseService.getRecordsByKeys(keys, "books");
    const sanitizedBooks = fullBooksData.map(this.sanitizeBookCover);

    this.setState(
      {
        fullBooksData: sanitizedBooks,
      },
      () => {
        this.scheduleMetricsUpdate();
        // 异步预加载封面，不阻塞渲染
        this.preloadCovers(sanitizedBooks);
      }
    );
  };

  // 预加载封面
  preloadCovers = async (books: BookModel[]) => {
    const coverCache: { [key: string]: { cover: string; isCoverExist: boolean } } = {};
    
    // 串行加载封面，避免并发问题
    for (const book of books) {
      try {
        const cover = await CoverUtil.getCover(book);
        const isCoverExist = await CoverUtil.isCoverExist(book);
        if (isCoverExist && !cover && !this.missingCoverKeys.has(book.key)) {
          this.missingCoverKeys.add(book.key);
          console.warn("[cover-debug] cover exists but empty url", {
            key: book.key,
            format: book.format,
            isElectron,
            isUseLocal: ConfigService.getReaderConfig("isUseLocal"),
          });
        }
        if (cover) {
          coverCache[book.key] = { cover, isCoverExist: true };
        } else if (!isCoverExist) {
          coverCache[book.key] = { cover: "", isCoverExist: false };
        }
      } catch (e) {
        if (!this.missingCoverKeys.has(book.key)) {
          this.missingCoverKeys.add(book.key);
          console.warn("[cover-debug] cover load failed", {
            key: book.key,
            format: book.format,
            error: e,
          });
        }
        coverCache[book.key] = { cover: "", isCoverExist: false };
      }
      
      // 每加载完一个封面就更新 state，让封面逐个显示
      this.setState(prevState => ({
        coverCache: { ...prevState.coverCache, ...coverCache },
        coverCacheVersion: prevState.coverCacheVersion + 1,
      }));
    }
  };
  private revokeCachedCoverUrls = (
    coverCache: { [key: string]: { cover: string; isCoverExist: boolean } }
  ) => {
    Object.values(coverCache).forEach((entry) => {
      if (entry.cover && entry.cover.startsWith("blob:")) {
        URL.revokeObjectURL(entry.cover);
      }
    });
  };
  sanitizeBookCover = (book: BookModel) => {
    if (
      !isElectron &&
      ConfigService.getReaderConfig("isUseLocal") !== "yes" &&
      book.cover &&
      book.cover.startsWith("data:image/")
    ) {
      return { ...book, cover: "" };
    }
    return book;
  };
  handleFinishReading = async () => {
    if (!this.scrollContainer.current) return;
    if (
      this.scrollContainer.current &&
      this.scrollContainer.current.scrollTop > 100
    ) {
      //ignore if the scroll is not at top
    } else {
      this.props.handleFetchBooks();
    }
  };

  setupScrollListener = () => {
    const scrollContainer = this.scrollContainer.current;
    if (scrollContainer) {
      scrollContainer.addEventListener("scroll", this.handleScroll);
    }
  };

  cleanupScrollListener = () => {
    const scrollContainer = this.scrollContainer.current;
    if (scrollContainer) {
      scrollContainer.removeEventListener("scroll", this.handleScroll);
    }
  };

  handleScroll = () => {
    const scrollContainer = this.scrollContainer.current;
    if (!scrollContainer) return;
    this.latestScrollTop = scrollContainer.scrollTop;
    if (this.scrollRaf) return;
    this.scrollRaf = window.requestAnimationFrame(() => {
      this.scrollRaf = 0;
      this.setState({ scrollTop: this.latestScrollTop });
      if (this.state.isLoadingMore) return;
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      if (scrollTop + clientHeight >= scrollHeight - 300) {
        this.loadMoreBooks();
      }
    });
  };

  loadMoreBooks = () => {
    const { books } = this.handleBooks();
    const { displayedBooksCount } = this.state;

    if (displayedBooksCount >= books.length) {
      return; // 已经显示所有图书
    }

    this.setState({ isLoadingMore: true });
    this.props.handleLoadMore(true);

    // 搜索模式下，数据已经是完整的，只需更新显示数量
    if (this.props.isSearch) {
      setTimeout(() => {
        const newDisplayedBooksCount = Math.min(
          displayedBooksCount + this.getBookCountPerPage(),
          books.length
        );
        this.setState(
          {
            displayedBooksCount: newDisplayedBooksCount,
            isLoadingMore: false,
          },
          () => {
            this.scheduleMetricsUpdate();
          }
        );
        this.props.handleLoadMore(false);
      }, 50);
      return;
    }

    // 非搜索模式，异步加载更多书籍数据
    setTimeout(async () => {
      const newDisplayedBooksCount = Math.min(
        displayedBooksCount + this.getBookCountPerPage(),
        books.length
      );

      // 使用批量获取加载新增的书籍数据
      const newBooks = books.slice(displayedBooksCount, newDisplayedBooksCount);
      const keys = newBooks.map((book: any) => book.key);
      const newFullBooksData = await DatabaseService.getRecordsByKeys(
        keys,
        "books"
      );

      this.setState(
        {
          displayedBooksCount: newDisplayedBooksCount,
          isLoadingMore: false,
          fullBooksData: [
            ...this.state.fullBooksData,
            ...newFullBooksData.map(this.sanitizeBookCover),
          ],
        },
        () => {
          this.scheduleMetricsUpdate();
        }
      );
      this.props.handleLoadMore(false);
    }, 100);
  };

  getItemSelector = () => {
    if (this.props.viewMode === "list") {
      return ".book-list-item-container";
    }
    if (this.props.viewMode === "card") {
      return ".book-list-item";
    }
    return ".book-list-cover-item";
  };

  scheduleMetricsUpdate = () => {
    if (this.metricsRaf) return;
    this.metricsRaf = window.requestAnimationFrame(() => {
      this.metricsRaf = 0;
      this.updateItemMetrics();
    });
  };

  updateItemMetrics = () => {
    const scrollContainer = this.scrollContainer.current;
    if (!scrollContainer) return;
    const selector = this.getItemSelector();
    const item = scrollContainer.querySelector(selector) as HTMLElement | null;
    if (!item) return;
    const style = window.getComputedStyle(item);
    const marginX =
      parseFloat(style.marginLeft || "0") + parseFloat(style.marginRight || "0");
    const marginY =
      parseFloat(style.marginTop || "0") + parseFloat(style.marginBottom || "0");
    const width = item.offsetWidth;
    const height = item.offsetHeight;
    if (!width || !height) return;
    if (
      width !== this.state.itemWidth ||
      height !== this.state.itemHeight ||
      marginX !== this.state.itemMarginX ||
      marginY !== this.state.itemMarginY
    ) {
      this.setState(
        {
          itemWidth: width,
          itemHeight: height,
          itemMarginX: marginX,
          itemMarginY: marginY,
        },
        () => {
          this.updateDisplayedBooksCount();
        }
      );
    }
  };

  getBookCountPerPage = () => {
    const container = document.querySelector(
      ".book-list-container"
    ) as HTMLElement;
    if (!container) return 24; // fallback
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    let { itemWidth, itemHeight, itemMarginX, itemMarginY } = this.state;
    if (!itemWidth || !itemHeight) {
      if (this.props.viewMode === "list") {
        itemWidth = containerWidth;
        itemHeight = 90;
        itemMarginX = 0;
        itemMarginY = 0;
      } else if (this.props.viewMode === "cover") {
        itemWidth = 400;
        itemHeight = 190;
        itemMarginX = 0;
        itemMarginY = 0;
      } else {
        itemWidth = 133;
        itemHeight = 201;
        itemMarginX = 0;
        itemMarginY = 0;
      }
    }
    const rowHeight = itemHeight + itemMarginY;
    const itemSpaceX = itemWidth + itemMarginX || 1;
    const columns =
      this.props.viewMode === "list"
        ? 1
        : Math.max(1, Math.floor(containerWidth / itemSpaceX));
    const rows = Math.max(1, Math.floor(containerHeight / rowHeight)) + 2;
    return columns * rows;
  };

  updateDisplayedBooksCount = () => {
    const targetCount = this.getBookCountPerPage();
    if (targetCount !== this.state.displayedBooksCount) {
      this.setState({ displayedBooksCount: targetCount });
    }
  };

  getVirtualWindow = (totalItems: number): {
    startRow: number;
    endRow: number;
    startIndex: number;
    endIndex: number;
    totalRows: number;
    rowHeight: number;
    itemsPerRow: number;
  } | null => {
    const scrollContainer = this.scrollContainer.current;
    if (!scrollContainer || totalItems === 0) return null;
    const { itemWidth, itemHeight, itemMarginX, itemMarginY } = this.state;
    if (!itemHeight) return null;
    const containerWidth = scrollContainer.clientWidth;
    const containerHeight = scrollContainer.clientHeight;
    const rowHeight = itemHeight + itemMarginY;
    const itemSpaceX = itemWidth + itemMarginX || 1;
    const itemsPerRow =
      this.props.viewMode === "list"
        ? 1
        : Math.max(1, Math.floor(containerWidth / itemSpaceX));
    const totalRows = Math.ceil(totalItems / itemsPerRow);
    const overscanRows = 2;
    const scrollTop = this.state.scrollTop;
    const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - overscanRows);
    const endRow = Math.min(
      totalRows - 1,
      Math.floor((scrollTop + containerHeight) / rowHeight) + overscanRows
    );
    const startIndex = startRow * itemsPerRow;
    const endIndex = Math.min(
      totalItems - 1,
      (endRow + 1) * itemsPerRow - 1
    );
    return {
      startRow,
      endRow,
      startIndex,
      endIndex,
      totalRows,
      rowHeight,
      itemsPerRow,
    };
  };

  handleKeyFilter = (items: any[], arr: string[]) => {
    let itemArr: any[] = [];
    arr.forEach((item) => {
      items.forEach((subItem: any) => {
        if (subItem.key === item) {
          itemArr.push(subItem);
        }
      });
    });
    return itemArr;
  };

  handleShelf(items: any, shelfTitle: string) {
    if (!shelfTitle) return items;
    let currentShelfTitle = shelfTitle;
    let currentShelfList = ConfigService.getMapConfig(
      currentShelfTitle,
      "shelfList"
    );
    let shelfItems = items.filter((item: { key: number }) => {
      return currentShelfList.indexOf(item.key) > -1;
    });
    return shelfItems;
  }

  //get the searched books according to the index
  handleIndexFilter = (items: any, arr: number[]) => {
    let itemArr: any[] = [];
    arr.forEach((item) => {
      items[item] && itemArr.push(items[item]);
    });
    return itemArr;
  };
  handleFilterShelfBook = (items: BookModel[]) => {
    return items.filter((item) => {
      return (
        ConfigService.getFromAllMapConfig(item.key, "shelfList").length === 0
      );
    });
  };
  renderBookList = (books: Book[], bookMode: string) => {
    if (books.length === 0 && !this.props.isSearch) {
      return <Redirect to="/manager/empty" />;
    }
    if (bookMode !== currentBookMode) {
      currentBookMode = bookMode;
    }

    // 搜索结果也进行分批显示
    const displayedBooks = this.props.isSearch
      ? books.slice(0, this.state.displayedBooksCount)
      : this.state.fullBooksData;
    if (displayedBooks.length === 0) return null;

    const virtualWindow = this.getVirtualWindow(displayedBooks.length);
    const renderBooks = virtualWindow
      ? displayedBooks.slice(
          virtualWindow.startIndex,
          virtualWindow.endIndex + 1
        )
      : displayedBooks.slice(0, Math.min(displayedBooks.length, 50));

    const items = renderBooks.map((item: BookModel, index: number) => {
      const resolvedBook = this.props.isSearch
        ? this.sanitizeBookCover(item)
        : item;
      const realIndex = virtualWindow
        ? virtualWindow.startIndex + index
        : index;
      const cachedCover = this.state.coverCache[resolvedBook.key];
      const coverCacheVersion = this.state.coverCacheVersion;
      return this.props.viewMode === "list" ? (
        <BookListItem
          {...{
            key: resolvedBook.key || realIndex,
            book: resolvedBook,
            isSelected: this.props.selectedBooks.indexOf(resolvedBook.key) > -1,
            cachedCover: cachedCover?.cover,
            cachedCoverExist: cachedCover?.isCoverExist,
            coverCacheVersion,
          }}
        />
      ) : this.props.viewMode === "card" ? (
        <BookCardItem
          {...{
            key: resolvedBook.key || realIndex,
            book: resolvedBook,
            isSelected: this.props.selectedBooks.indexOf(resolvedBook.key) > -1,
            cachedCover: cachedCover?.cover,
            cachedCoverExist: cachedCover?.isCoverExist,
            coverCacheVersion,
          }}
        />
      ) : (
        <BookCoverItem
          {...{
            key: resolvedBook.key || realIndex,
            book: resolvedBook,
            isSelected: this.props.selectedBooks.indexOf(resolvedBook.key) > -1,
            cachedCover: cachedCover?.cover,
            cachedCoverExist: cachedCover?.isCoverExist,
            coverCacheVersion,
          }}
        />
      );
    });

    if (!virtualWindow) {
      return items;
    }

    const topSpacerHeight = virtualWindow.startRow * virtualWindow.rowHeight;
    const bottomSpacerHeight =
      (virtualWindow.totalRows - virtualWindow.endRow - 1) *
      virtualWindow.rowHeight;

    return (
      <>
        <div style={{ height: topSpacerHeight, width: "100%", clear: "both" }} />
        {items}
        <div
          style={{ height: bottomSpacerHeight, width: "100%", clear: "both" }}
        />
      </>
    );
  };
  handleBooks = () => {
    let bookMode = this.props.isSearch
      ? "search"
      : this.props.shelfTitle
      ? "shelf"
      : this.props.mode === "favorite"
      ? "favorite"
      : this.state.isHideShelfBook
      ? "hide"
      : "home";
    let books =
      bookMode === "search"
        ? this.props.searchResults
        : bookMode === "shelf"
        ? this.handleShelf(this.props.books, this.props.shelfTitle)
        : bookMode === "favorite"
        ? this.handleKeyFilter(
            this.props.books,
            ConfigService.getAllListConfig("favoriteBooks")
          )
        : bookMode === "hide"
        ? this.handleFilterShelfBook(this.props.books)
        : this.props.books;
    return {
      books,
      bookMode,
    };
  };

  render() {
    if (
      (this.state.favoriteBooks === 0 && this.props.mode === "favorite") ||
      !this.props.books ||
      !this.props.books[0]
    ) {
      return <Redirect to="/manager/empty" />;
    }
    const { books, bookMode } = this.handleBooks();
    return (
      <>
        <div
          className="book-list-header"
          style={
            this.props.isCollapsed
              ? { width: "calc(100% - 70px)", left: "70px" }
              : {}
          }
        >
          <SelectBook />

          <div
            style={this.props.isSelectBook ? { display: "none" } : {}}
            className="book-list-header-right"
          >
            <div className="book-list-total-page">
              <Trans i18nKey="Total books" count={books.length}>
                {"Total " + books.length + " books"}
              </Trans>
            </div>
            <ViewMode />
          </div>
        </div>
        <div
          className="book-list-container-parent"
          style={
            this.props.isCollapsed
              ? { width: "calc(100vw - 70px)", left: "70px" }
              : {}
          }
        >
          <div className="book-list-container">
            <ul className="book-list-item-box" ref={this.scrollContainer}>
              {this.renderBookList(books, bookMode)}
            </ul>
          </div>
        </div>
      </>
    );
  }
}

export default withRouter(BookList as any);
