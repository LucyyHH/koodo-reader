import React from "react";
import "./booklist.css";
import BookCardItem from "../../../components/bookCardItem";
import BookCoverItem from "../../../components/bookCoverItem";
import BookListItem from "../../../components/bookListItem";
import BookModel from "../../../models/Book";
import { Trans } from "react-i18next";
import { BookListProps, BookListState } from "./interface";
import { withRouter } from "react-router-dom";
import ViewMode from "../../../components/viewMode";
import DatabaseService from "../../../utils/storage/databaseService";
import EmptyPage from "../../emptyPage";
import CoverUtil from "../../../utils/file/coverUtil";

class BookList extends React.Component<BookListProps, BookListState> {
  private scrollContainer: React.RefObject<HTMLUListElement>;
  private scrollRaf = 0;
  private metricsRaf = 0;
  private latestScrollTop = 0;
  constructor(props: BookListProps) {
    super(props);
    this.scrollContainer = React.createRef();
    this.state = {
      fullBooksData: [],
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
  componentDidMount() {
    this.setupScrollListener();
    this.scheduleMetricsUpdate();
    CoverUtil.migrateCoverStoreIfNeeded();
  }
  componentWillUnmount() {
    this.cleanupScrollListener();
    if (this.scrollRaf) {
      window.cancelAnimationFrame(this.scrollRaf);
      this.scrollRaf = 0;
    }
    if (this.metricsRaf) {
      window.cancelAnimationFrame(this.metricsRaf);
      this.metricsRaf = 0;
    }
  }
  async UNSAFE_componentWillReceiveProps(nextProps: Readonly<BookListProps>) {
    if (nextProps.deletedBooks !== this.props.deletedBooks) {
      let fullBooksData: BookModel[] = [];
      for (let i = 0; i < nextProps.deletedBooks.length; i++) {
        let book = nextProps.deletedBooks[i];
        let fullBook = await DatabaseService.getRecord(book.key, "books");
        if (fullBook) {
          fullBooksData.push(fullBook);
        }
      }
      this.setState({ fullBooksData }, () => {
        this.scheduleMetricsUpdate();
      });
    }
  }
  componentDidUpdate(prevProps: BookListProps) {
    if (prevProps.viewMode !== this.props.viewMode) {
      this.scheduleMetricsUpdate();
    }
  }
  isElementInViewport = (element) => {
    const rect = element.getBoundingClientRect();

    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <=
        (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
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

  //get the searched book according to the index
  handleIndexFilter = (items: any, arr: number[]) => {
    let itemArr: any[] = [];
    arr.forEach((item) => {
      items[item] && itemArr.push(items[item]);
    });

    return itemArr;
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
    });
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
      this.setState({
        itemWidth: width,
        itemHeight: height,
        itemMarginX: marginX,
        itemMarginY: marginY,
      });
    }
  };

  getVirtualWindow = (totalItems: number) => {
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

  renderBookList = () => {
    let books = this.state.fullBooksData;
    if (books.length === 0) return null;
    const virtualWindow = this.getVirtualWindow(books.length);
    const renderBooks = virtualWindow
      ? books.slice(virtualWindow.startIndex, virtualWindow.endIndex + 1)
      : books.slice(0, Math.min(books.length, 30));

    const items = renderBooks.map((item: BookModel, index: number) => {
      const realIndex = virtualWindow
        ? virtualWindow.startIndex + index
        : index;
      return this.props.viewMode === "list" ? (
        <BookListItem
          {...{
            key: item.key || realIndex,
            book: item,
          }}
        />
      ) : this.props.viewMode === "card" ? (
        <BookCardItem
          {...{
            key: item.key || realIndex,
            book: item,
            isSelected: this.props.selectedBooks.indexOf(item.key) > -1,
          }}
        />
      ) : (
        <BookCoverItem
          {...{
            key: item.key || realIndex,
            book: item,
            isSelected: this.props.selectedBooks.indexOf(item.key) > -1,
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

  render() {
    return (
      <>
        {this.state.fullBooksData.length > 0 ? (
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
                {this.renderBookList()}
              </ul>
            </div>
          </div>
        ) : (
          <EmptyPage />
        )}
        {this.state.fullBooksData.length > 0 ? (
          <div
            className="book-list-header"
            style={
              this.props.isCollapsed
                ? { width: "calc(100% - 70px)", left: "70px" }
                : {}
            }
          >
            <div></div>
            <div
              className="booklist-delete-container"
              onClick={() => {
                this.props.handleDeleteDialog(true);
              }}
              style={this.props.isCollapsed ? { left: "calc(50% - 60px)" } : {}}
            >
              <Trans>Delete all books</Trans>
            </div>
            <ViewMode />
          </div>
        ) : null}
      </>
    );
  }
}

export default withRouter(BookList as any);
