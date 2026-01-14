import { RouteComponentProps } from "react-router";

export interface SidebarProps extends RouteComponentProps<any> {
  mode: string;
  isCollapsed: boolean;
  shelfTitle: string;
  isAuthed: boolean;
  isOpenSortShelfDialog: boolean;
  isSidebarOpen: boolean;
  handleMode: (mode: string) => void;
  handleSortShelfDialog: (isOpenSortShelfDialog: boolean) => void;
  handleSearch: (isSearch: boolean) => void;
  handleCollapse: (isCollapsed: boolean) => void;
  handleSortDisplay: (isSortDisplay: boolean) => void;
  handleSelectBook: (isSelectBook: boolean) => void;
  handleShelf: (shelfTitle: string) => void;
  handleSidebarOpen: (isSidebarOpen: boolean) => void;
  t: (title: string) => string;
}

export interface SidebarState {
  mode: string;
  hoverMode: string;
  hoverShelfTitle: string;
  isCollapsed: boolean;
  isCollpaseShelf: boolean;
  shelfTitle: string;
  newShelfName: string;
  isOpenDelete: boolean;
  isCreateShelf: boolean;
}
