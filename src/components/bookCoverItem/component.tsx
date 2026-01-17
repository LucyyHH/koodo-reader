import React from "react";
import "./bookCoverItem.css";
import { BookCoverProps, BookCoverState } from "./interface";
import ActionDialog from "../dialogs/actionDialog";
import { withRouter } from "react-router-dom";
import { isElectron } from "react-device-detect";
import EmptyCover from "../emptyCover";
import { Trans } from "react-i18next";
import BookUtil from "../../utils/file/bookUtil";
import toast from "react-hot-toast";
import CoverUtil from "../../utils/file/coverUtil";
import { ConfigService } from "../../assets/lib/kookit-extra-browser.min";
declare var window: any;

class BookCoverItem extends React.Component<BookCoverProps, BookCoverState> {
  private shouldLoadHeavyAssets = () => {
    return true;
  };
  shouldComponentUpdate(nextProps: BookCoverProps, nextState: BookCoverState) {
    if (nextState !== this.state) return true;
    if (nextProps.isSelected !== this.props.isSelected) return true;
    if (nextProps.isSelectBook !== this.props.isSelectBook) return true;
    if (nextProps.isOpenActionDialog !== this.props.isOpenActionDialog)
      return true;
    if (nextProps.currentBook.key !== this.props.currentBook.key) return true;
    if (nextProps.coverCacheVersion !== this.props.coverCacheVersion) return true;
    if (nextProps.cachedCover !== this.props.cachedCover) return true;
    if (nextProps.cachedCoverExist !== this.props.cachedCoverExist) return true;
    const nextBook = nextProps.book;
    const prevBook = this.props.book;
    if (nextBook !== prevBook) return true;
    if (
      nextBook.key !== prevBook.key ||
      nextBook.name !== prevBook.name ||
      nextBook.author !== prevBook.author ||
      nextBook.publisher !== prevBook.publisher ||
      nextBook.description !== prevBook.description ||
      nextBook.format !== prevBook.format ||
      nextBook.size !== prevBook.size ||
      nextBook.page !== prevBook.page ||
      nextBook.path !== prevBook.path
    ) {
      return true;
    }
    return false;
  }
  private getDescriptionText = (description: string) => {
    if (!description) return "";
    const div = document.createElement("div");
    div.innerHTML = description;
    return div.textContent || div.innerText || "";
  };
  private revokeCoverUrl = (cover?: string) => {
    if (cover && cover.startsWith("blob:")) {
      URL.revokeObjectURL(cover);
    }
  };
  private revokeCoverUrlIfOwned = (
    cover?: string,
    isCoverFromCache?: boolean
  ) => {
    if (!isCoverFromCache) {
      this.revokeCoverUrl(cover);
    }
  };
  constructor(props: BookCoverProps) {
    super(props);
    this.state = {
      isFavorite:
        ConfigService.getAllListConfig("favoriteBooks").indexOf(
          this.props.book.key
        ) > -1,
      left: 0,
      top: 0,
      direction: "horizontal",
      desc: "",
      isHover: false,
      cover: "",
      isCoverExist: false,
      isCoverFromCache: false,
      isBookOffline: true,
    };
  }

  async componentDidMount() {
    // 如果有预加载的封面，直接使用
    if (this.props.cachedCover) {
      this.setState({
        cover: this.props.cachedCover,
        isCoverExist: this.props.cachedCoverExist || !!this.props.cachedCover,
        isCoverFromCache: true,
      });
    } else {
      // 否则自己加载
      const cover = await CoverUtil.getCover(this.props.book);
      const isCoverExist = await CoverUtil.isCoverExist(this.props.book);
      this.setState({
        cover,
        isCoverExist: isCoverExist || !!cover,
        isCoverFromCache: false,
      });
    }
    this.setState({
      desc: this.getDescriptionText(this.props.book.description),
      isBookOffline: await BookUtil.isBookOffline(this.props.book.key),
    });
    let filePath = "";
    // Get file path from electron
    if (isElectron) {
      const { ipcRenderer } = window.require("electron");
      filePath = ipcRenderer.sendSync("check-file-data");
    }

    if (
      ConfigService.getReaderConfig("isOpenBook") === "yes" &&
      ConfigService.getAllListConfig("recentBooks")[0] ===
        this.props.book.key &&
      !this.props.currentBook.key &&
      !filePath
    ) {
      this.props.handleReadingBook(this.props.book);
      BookUtil.redirectBook(this.props.book);
    }
  }
  async UNSAFE_componentWillReceiveProps(nextProps: BookCoverProps) {
    // 如果预加载的封面更新了，使用新的封面
    if (
      nextProps.cachedCover &&
      nextProps.cachedCover !== this.props.cachedCover
    ) {
      const prevCover = this.state.cover;
      const prevCoverFromCache = this.state.isCoverFromCache;
      this.setState(
        {
          cover: nextProps.cachedCover,
          isCoverExist: nextProps.cachedCoverExist || !!nextProps.cachedCover,
          isCoverFromCache: true,
        },
        () => {
          this.revokeCoverUrlIfOwned(prevCover, prevCoverFromCache);
        }
      );
      return;
    }

    if (nextProps.book.key !== this.props.book.key) {
      const prevCover = this.state.cover;
      const prevCoverFromCache = this.state.isCoverFromCache;
      let cover = await CoverUtil.getCover(nextProps.book);
      let isCoverExist = await CoverUtil.isCoverExist(nextProps.book);
      this.setState(
        {
          isFavorite:
            ConfigService.getAllListConfig("favoriteBooks").indexOf(
              nextProps.book.key
            ) > -1,
          cover,
          isCoverExist: isCoverExist || !!cover,
          isCoverFromCache: false,
          isBookOffline: await BookUtil.isBookOffline(nextProps.book.key),
          desc: this.getDescriptionText(nextProps.book.description),
        },
        () => {
          this.revokeCoverUrlIfOwned(prevCover, prevCoverFromCache);
        }
      );
    } else if (nextProps.book.description !== this.props.book.description) {
      this.setState({
        desc: this.getDescriptionText(nextProps.book.description),
      });
    }
  }
  componentWillUnmount() {
    this.revokeCoverUrlIfOwned(this.state.cover, this.state.isCoverFromCache);
  }
  handleMoreAction = (event: any) => {
    event.preventDefault();
    const e = event || window.event;
    let x = e.clientX;
    if (x > document.body.clientWidth - 300 && !this.props.isCollapsed) {
      x = x - 180;
    }
    this.setState(
      {
        left: x,
        top:
          document.body.clientHeight - e.clientY > 250
            ? e.clientY
            : e.clientY - 200,
      },
      () => {
        this.props.handleActionDialog(true);
        this.props.handleReadingBook(this.props.book);
      }
    );
  };
  handleDeleteBook = () => {
    this.props.handleReadingBook(this.props.book);
    this.props.handleDeleteDialog(true);
    this.props.handleActionDialog(false);
  };
  handleLoveBook = () => {
    ConfigService.setListConfig(this.props.book.key, "favoriteBooks");
    this.setState({ isFavorite: true });
    toast.success(this.props.t("Addition successful"));
  };
  handleJump = () => {
    if (this.props.isSelectBook) {
      this.props.handleSelectedBooks(
        this.props.isSelected
          ? this.props.selectedBooks.filter(
              (item) => item !== this.props.book.key
            )
          : [...this.props.selectedBooks, this.props.book.key]
      );
      return;
    }
    this.props.handleReadingBook(this.props.book);
    BookUtil.redirectBook(this.props.book);
  };
  render() {
    const resolvedCover =
      this.props.cachedCover
        ? this.props.cachedCover
        : this.state.cover;
    const resolvedIsCoverExist =
      (this.props.cachedCover
        ? this.props.cachedCoverExist
        : this.state.isCoverExist) || !!resolvedCover;
    let percentage = "0";

    if (
      ConfigService.getObjectConfig(
        this.props.book.key,
        "recordLocation",
        {}
      ) &&
      ConfigService.getObjectConfig(this.props.book.key, "recordLocation", {})
        .percentage
    ) {
      percentage = ConfigService.getObjectConfig(
        this.props.book.key,
        "recordLocation",
        {}
      ).percentage;
    }

    const actionProps = { left: this.state.left, top: this.state.top };
    const shouldShowEmptyCover =
      !resolvedIsCoverExist ||
      (this.props.book.format === "PDF" &&
        ConfigService.getReaderConfig("isDisablePDFCover") === "yes");
    return (
      <>
        <div
          className="book-list-cover-item"
          onContextMenu={(event) => {
            this.handleMoreAction(event);
          }}
        >
          <div className="book-cover-item-header">
            <div className="reading-progress-icon">
              <div style={{ position: "relative", left: "4px" }}>
                {percentage && !isNaN(parseFloat(percentage))
                  ? percentage === "0"
                    ? "New"
                    : percentage === "1"
                    ? "Done"
                    : (parseFloat(percentage) * 100).toFixed(2)
                  : "0"}
                {percentage &&
                  !isNaN(parseFloat(percentage)) &&
                  percentage !== "0" &&
                  percentage !== "1" && <span>%</span>}
              </div>
            </div>
            <span
              className="icon-more book-more-action"
              onClick={(event) => {
                this.handleMoreAction(event);
              }}
            ></span>
            {ConfigService.getAllListConfig("favoriteBooks").indexOf(
              this.props.book.key
            ) > -1 && <span className="icon-heart book-heart-action"></span>}
          </div>

          <div
            className="book-cover-item-cover"
            onClick={() => {
              this.handleJump();
            }}
            onMouseEnter={() => {
              this.setState({ isHover: true });
            }}
            onMouseLeave={() => {
              this.setState({ isHover: false });
            }}
            style={
              ConfigService.getReaderConfig("isDisableCrop") === "yes"
                ? {
                    height: "195px",
                    alignItems: "flex-start",
                    background: "rgba(255, 255,255, 0)",
                    boxShadow: "0px 0px 5px rgba(0, 0, 0, 0)",
                  }
                : {
                    height: "170px",
                    alignItems: "center",
                    overflow: "hidden",
                  }
            }
          >
            {this.shouldLoadHeavyAssets() ? (
              shouldShowEmptyCover ? (
                <div
                  className="book-item-image"
                  style={{ width: "120px", height: "170px" }}
                >
                  <EmptyCover
                    {...{
                      format: this.props.book.format,
                      title: this.props.book.name,
                      scale: 1.14,
                    }}
                  />
                </div>
              ) : (
                <img
                  src={resolvedCover}
                  alt=""
                  decoding="async"
                  style={
                    this.state.direction === "horizontal" ||
                    ConfigService.getReaderConfig("isDisableCrop") === "yes"
                      ? { width: "100%" }
                      : { height: "100%" }
                  }
                  className="book-item-image"
                  onLoad={(res: any) => {
                    if (
                      res.target.naturalHeight / res.target.naturalWidth >
                      170 / 120
                    ) {
                      this.setState({ direction: "horizontal" });
                    } else {
                      this.setState({ direction: "vertical" });
                    }
                  }}
                />
              )
            ) : (
              <div
                className="book-item-image"
                style={{ width: "120px", height: "170px" }}
              >
                <EmptyCover
                  {...{
                    format: this.props.book.format,
                    title: this.props.book.name,
                    scale: 1.14,
                  }}
                />
              </div>
            )}
            {this.props.isSelectBook || this.state.isHover ? (
              <span
                className="icon-message book-selected-icon"
                onMouseEnter={() => {
                  this.setState({ isHover: true });
                }}
                onClick={(event) => {
                  if (this.props.isSelectBook) {
                    this.props.handleSelectedBooks(
                      this.props.isSelected
                        ? this.props.selectedBooks.filter(
                            (item) => item !== this.props.book.key
                          )
                        : [...this.props.selectedBooks, this.props.book.key]
                    );
                  } else {
                    this.props.handleSelectBook(true);
                    this.props.handleSelectedBooks([this.props.book.key]);
                  }
                  this.setState({ isHover: false });
                  event?.stopPropagation();
                }}
                style={
                  this.props.isSelected
                    ? {
                        right: "272px",
                        top: "30px",
                        opacity: 1,
                      }
                    : {
                        right: "272px",
                        top: "30px",
                        color: "#eee",
                      }
                }
              ></span>
            ) : null}
          </div>

          <p className="book-cover-item-title">
            {!this.state.isBookOffline && (
              <span
                className="icon-cloud book-download-action"
                style={{ fontWeight: "bold" }}
              ></span>
            )}
            {this.props.book.name}
          </p>
          <>
            <p className="book-cover-item-author">
              <Trans>Author</Trans>:&nbsp;
              <Trans>{this.props.book.author || "Unknown author"}</Trans>
            </p>
            <p className="book-cover-item-author">
              <Trans>Publisher</Trans>:&nbsp;
              <Trans>{this.props.book.publisher}</Trans>
            </p>
            <div className="book-cover-item-desc">
              <Trans>Description</Trans>:&nbsp;
              <div className="book-cover-item-desc-detail">
                {this.state.desc ? this.state.desc : <Trans>Empty</Trans>}
              </div>
            </div>
          </>
        </div>
        {this.props.isOpenActionDialog &&
        this.props.book.key === this.props.currentBook.key ? (
          <ActionDialog {...actionProps} />
        ) : null}
      </>
    );
  }
}
export default withRouter(BookCoverItem as any);
