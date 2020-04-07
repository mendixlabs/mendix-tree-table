import { CSSProperties } from "react";
import { INanoflow, OpenPageAs } from "@jeltemx/mendix-react-widget-utils";

export interface Nanoflow extends INanoflow {}

interface CommonProps {
    id: string;
    class: string;
    style?: CSSProperties;
    friendlyId?: string;
    tabIndex: number;
    mxform: mxui.lib.form._FormBase;
    mxObject?: mendix.lib.MxObject;
}

export type ClickOptions = "nothing" | "mf" | "nf" | "open";
export type DataSource = "xpath" | "mf" | "nf";
export type ActionButtonAction = "mf" | "nf";
export type OnChangeAction = "nothing" | "mf" | "nf";
export type ChildDataSource = "disabled" | "reference" | "microflow" | "nanoflow";
export type SelectionMode = "none" | "single" | "multi";
export type ColumnMethod = "static" | "microflow";

export interface TreeviewColumnProps {
    columnHeader: string;
    columnAttr: string;
    transformNanoflow?: Nanoflow;
    columnWidth?: string;
    columnClassName?: string;
}

export interface ActionButtonProps {
    selectABLabel: string;
    selectABClass: string;
    selectABHideOnNotApplicable: boolean;
    selectABAction: ActionButtonAction;
    selectABMicroflow: string;
    selectABNanoflow: Nanoflow;
}

export interface MxTreeTableContainerProps extends CommonProps {
    nodeEntity: string;
    dataSource: DataSource;
    constraint: string;
    getDataMf: string;
    getDataNf: Nanoflow;

    childMethod: ChildDataSource;
    childReference: string;
    childBoolean: string;
    getChildMf: string;
    getChildNf: Nanoflow;

    helperEntity: string;
    helperContextReference: string;
    helperNodeReference: string;

    columnList: TreeviewColumnProps[];
    columnHeaderEntity: string;
    columnHeaderLabelAttribute: string;
    columnHeaderAttrAttribute: string;
    columnHeaderClassAttribute: string;
    columnHeaderMicroflow: string;
    columnHeaderNanoflow: Nanoflow;
    columnMethod: ColumnMethod;

    onClickAction: ClickOptions;
    onClickMf: string;
    onClickNf: Nanoflow;
    onClickForm: string;
    onClickOpenPageAs: OpenPageAs;
    onDblClickAction: ClickOptions;
    onDblClickMf: string;
    onDblClickNf: Nanoflow;
    onDblClickForm: string;
    onDblClickOpenPageAs: OpenPageAs;

    uiShowHeader: boolean;
    uiRowClassAttr: string;
    uiRowIconAttr: string;
    uiIconPrefix: string;

    selectMode: SelectionMode;
    selectClickSelect: boolean;
    selectHideCheckboxes: boolean;
    selectSelectFirstOnSingle: boolean;
    selectOnChangeAction: OnChangeAction;
    selectOnChangeMicroflow: string;
    selectOnChangeNanoflow: Nanoflow;
    selectActionButtons: ActionButtonProps[];
}
