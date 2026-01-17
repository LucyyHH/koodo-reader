import React from "react";
import "./bookListItem.css";
import { BookItemProps, BookItemState } from "./interface";
import { Trans } from "react-i18next";
import { withRouter } from "react-router-dom";
import EmptyCover from "../emptyCover";
import BookUtil from "../../utils/file/bookUtil";
import ActionDialog from "../dialogs/actionDialog";
import { isElectron } from "react-device-detect";
import toast from "react-hot-toast";
import CoverUtil from "../../utils/file/coverUtil";
import { saveAs } from "file-saver";
import { ConfigService } from "../../assets/lib/kookit-extra-browser.min";
declare var window: any;
class BookListItem extends React.Component<BookItemProps, BookItemState> {
  private shouldLoadHeavyAssets = () => {
    return true;
  };
  shouldComponentUpdate(nextProps: BookItemProps, nextState: BookItemState) {
    if (nextState !== this.state) return true;
    if (nextProps.isSelected !== this.props.isSelected) return true;
    if (nextProps.isSelectBook !== this.props.isSelectBook) return true;
    if (nextProps.isOpenActionDialog !== this.props.isOpenActionDialog)
      return true;
    if (nextProps.currentBook.key !== this.props.currentBook.key) return true;
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
  private revokeCoverUrl = (cover?: string) => {
    if (cover && cover.startsWith("blob:")) {
      URL.revokeObjectURL(cover);
    }
  };
  constructor(props: BookItemProps) {
    super(props);
    this.state = {
      isDeleteDialog: false,
      isFavorite:
        ConfigService.getAllListConfig("favoriteBooks").indexOf(
          this.props.book.key
        ) > -1,
      direction: "horizontal",
      left: 0,
      top: 0,
      isHover: false,
      cover: "",
      isCoverExist: false,
      isBookOffline: true,
    };
  }
  async componentDidMount() {
    // 如果有预加载的封面，直接使用
    if (this.props.cachedCover !== undefined) {
      this.setState({
        cover: this.props.cachedCover,
        isCoverExist: this.props.cachedCoverExist || !!this.props.cachedCover,
      });
    } else {
      // 否则自己加载
      const cover = await CoverUtil.getCover(this.props.book);
      const isCoverExist = await CoverUtil.isCoverExist(this.props.book);
      this.setState({
        cover,
        isCoverExist: isCoverExist || !!cover,
      });
    }
    this.setState({
      isBookOffline: await BookUtil.isBookOffline(this.props.book.key),
    });
    let filePath = "";
    //open book when app start
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
  async UNSAFE_componentWillReceiveProps(nextProps: BookItemProps) {
    // 如果预加载的封面更新了，使用新的封面
    if (
      nextProps.cachedCover !== undefined &&
      nextProps.cachedCover !== this.props.cachedCover
    ) {
      const prevCover = this.state.cover;
      this.setState(
        {
          cover: nextProps.cachedCover,
          isCoverExist: nextProps.cachedCoverExist || !!nextProps.cachedCover,
        },
        () => {
          this.revokeCoverUrl(prevCover);
        }
      );
      return;
    }

    if (nextProps.book.key !== this.props.book.key) {
      const prevCover = this.state.cover;
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
          isBookOffline: await BookUtil.isBookOffline(nextProps.book.key),
        },
        () => {
          this.revokeCoverUrl(prevCover);
        }
      );
    }
  }
  componentWillUnmount() {
    this.revokeCoverUrl(this.state.cover);
  }
  handleDeleteBook = () => {
    this.props.handleDeleteDialog(true);
    this.props.handleReadingBook(this.props.book);
  };
  handleEditBook = () => {
    this.props.handleEditDialog(true);
    this.props.handleReadingBook(this.props.book);
  };
  handleAddShelf = () => {
    this.props.handleAddDialog(true);
    this.props.handleReadingBook(this.props.book);
  };
  handleLoveBook = () => {
    ConfigService.setListConfig(this.props.book.key, "favoriteBooks");
    this.setState({ isFavorite: true });
    toast.success(this.props.t("Addition successful"));
  };
  handleRestoreBook = () => {
    ConfigService.deleteListConfig(this.props.book.key, "deletedBooks");
    toast.success(this.props.t("Restore successful"));
    this.props.handleFetchBooks();
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
  handleExportBook() {
    BookUtil.fetchBook(
      this.props.book.key,
      this.props.book.format.toLowerCase(),
      true,
      this.props.book.path
    ).then((result: any) => {
      toast.success(this.props.t("Export successful"));
      saveAs(
        new Blob([result]),
        this.props.book.name + `.${this.props.book.format.toLocaleLowerCase()}`
      );
    });
  }
  handleMoreAction = (event: any) => {
    event.preventDefault();
    const e = event || window.event;
    let x = e.clientX;
    if (x > document.body.clientWidth - 300) {
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
  render() {
    const actionProps = { left: this.state.left, top: this.state.top };
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

    return (
      <>
        <div
          className="book-list-item-container"
          onContextMenu={(event) => {
            this.handleMoreAction(event);
          }}
        >
          {this.shouldLoadHeavyAssets() ? (
            !this.state.isCoverExist ||
            (this.props.book.format === "PDF" &&
              ConfigService.getReaderConfig("isDisablePDFCover") === "yes") ? (
              <div
                className="book-item-list-cover"
                onClick={() => {
                  this.handleJump();
                }}
                style={{ height: "65px" }}
                onMouseEnter={() => {
                  this.setState({ isHover: true });
                }}
                onMouseLeave={() => {
                  this.setState({ isHover: false });
                }}
              >
                <div className="book-item-image" style={{ height: "65px" }}>
                  <EmptyCover
                    {...{
                      format: this.props.book.format,
                      title: this.props.book.name,
                      scale: 0.43,
                    }}
                  />
                </div>
              </div>
            ) : (
              <div
                className="book-item-list-cover"
                onClick={() => {
                  this.handleJump();
                }}
                onMouseEnter={() => {
                  this.setState({ isHover: true });
                }}
                onMouseLeave={() => {
                  this.setState({ isHover: false });
                }}
              >
                <img
                  src={this.state.cover}
                  alt=""
                  className="book-item-image"
                  decoding="async"
                  style={{ width: "100%" }}
                  onLoad={(res: any) => {
                    if (
                      res.target.naturalHeight / res.target.naturalWidth >
                      74 / 47
                    ) {
                      this.setState({ direction: "horizontal" });
                    } else {
                      this.setState({ direction: "vertical" });
                    }
                  }}
                />
              </div>
            )
          ) : (
            <div
              className="book-item-list-cover"
              onClick={() => {
                this.handleJump();
              }}
              style={{ height: "65px" }}
              onMouseEnter={() => {
                this.setState({ isHover: true });
              }}
              onMouseLeave={() => {
                this.setState({ isHover: false });
              }}
            >
              <div className="book-item-image" style={{ height: "65px" }}>
                <EmptyCover
                  {...{
                    format: this.props.book.format,
                    title: this.props.book.name,
                    scale: 0.43,
                  }}
                />
              </div>
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
                  ? { left: "18px", bottom: "5px", opacity: 1 }
                  : { left: "18px", bottom: "5px", color: "#eee" }
              }
            ></span>
          ) : null}
          <p
            className="book-item-list-title"
            onClick={() => {
              this.handleJump();
            }}
          >
            <div className="book-item-list-subtitle">
              <div className="book-item-list-subtitle-text">
                {!this.state.isBookOffline && (
                  <span className="icon-cloud book-download-action"></span>
                )}
                {this.props.book.name}
              </div>
            </div>
            <>
              <p className="book-item-list-percentage">
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
              </p>
              <div className="book-item-list-author">
                <Trans>{this.props.book.author || "Unknown author"}</Trans>
              </div>
            </>
          </p>
        </div>
        {this.props.isOpenActionDialog &&
        this.props.book.key === this.props.currentBook.key ? (
          <div className="action-dialog-parent">
            <ActionDialog {...actionProps} />
          </div>
        ) : null}
      </>
    );
  }
}

export default withRouter(BookListItem as any);
