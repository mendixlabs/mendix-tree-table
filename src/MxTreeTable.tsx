import { Component, ReactNode, createElement } from "react";
import { hot } from "react-hot-loader/root";
import { findDOMNode } from "react-dom";
import {
    IAction,
    getObjectContextFromObjects,
    executeMicroflow,
    executeNanoFlow,
    openPage,
    fetchByXpath,
    getObjects,
    // createObject,
    // deleteObject,
    ValidationMessage,
    fetchAttr,
    getObject
} from "@jeltemx/mendix-react-widget-utils";

import { NodeStore, NodeStoreConstructorOptions } from "./store";
import { MxTreeTableContainerProps, Nanoflow, TreeviewColumnProps, ActionButtonProps } from "../typings/MxTreeTableProps";
import { ExtraMXValidateProps, validateProps } from "./util/validation";
import { getColumns, TreeColumnProps, TableRecord } from './util/columns';
import { createCamelcaseId } from "./util";
// import { TreeTable } from './components/TreeTable';
import { RowObject, getFormattedValue } from './util/rows';
import { defaults } from "lodash";
import { ButtonBarButtonProps, ButtonBar } from "./components/ButtonBar";
import { Alerts } from "./components/Alert";
import { TreeTable } from "./components/TreeTable";

export interface Action extends IAction {};
export type ActionReturn = string | number | boolean | mendix.lib.MxObject | mendix.lib.MxObject[] | void;
export interface TransformNanoflows {
    [key: string]: Nanoflow;
};

class MxTreeTable extends Component<MxTreeTableContainerProps> {
    private store: NodeStore;
    private widgetId?: string;

    private referenceAttr: string;
    private hasChildAttr: string;
    // private helperNodeReference: string;
    // private helperContextReference: string;
    // private helperContextEntity: string;
    private staticColumns: boolean;
    private columnPropsValid: boolean;

    private transformNanoflows: TransformNanoflows;

    private debug = this._debug.bind(this);
    private fetchData = this._fetchData.bind(this);
    private handleData = this._handleData.bind(this);
    private convertMxObjectToRow = this._convertMxObjectToRow.bind(this);
    private executeAction = this._executeAction.bind(this);
    private loadChildData = this._loadChildData.bind(this);
    private getObjectKeyPairs = this._getObjectKeyPairs.bind(this);
    private expanderFunction = this._expanderFunction.bind(this);
    private getFormattedOrTransformed = this._getFormattedOrTransformed.bind(this);
    private getColumnsFromDatasource = this._getColumnsFromDatasource.bind(this);
    private getButtons = this._getButtons.bind(this);

    constructor(props: MxTreeTableContainerProps) {
        super(props);

        // Set various properties based on props coming from runtime
        this.referenceAttr =
            props.childMethod === "reference" && "" !== props.childReference ? props.childReference.split("/")[0] : "";
        this.hasChildAttr =
            props.childMethod !== "disabled" &&
            props.childMethod !== "reference" &&
            "" === props.childReference &&
            "" !== props.childBoolean
                ? props.childBoolean
                : "";

        // this.helperNodeReference = props.helperNodeReference ? props.helperNodeReference.split("/")[0] : "";
        // this.helperContextReference = props.helperContextReference ? props.helperContextReference.split("/")[0] : "";
        // this.helperContextEntity = props.helperContextReference ? props.helperContextReference.split("/")[1] : "";

        this.staticColumns = props.columnMethod === "static";
        this.columnPropsValid =
            this.staticColumns ||
            (props.columnHeaderEntity !== "" &&
                props.columnHeaderLabelAttribute !== "" &&
                props.columnHeaderAttrAttribute !== "" &&
                props.columnMethod === "microflow" &&
                props.columnHeaderMicroflow !== "");

        // Keep a list of transform nanoflows for titles
        this.transformNanoflows = {};
        if (this.staticColumns) {
            this.setTransFormColumns(props.columnList);
        }

        // Validations
        const extraValidations = this.getMXValidations(props);
        const validationMessages = validateProps(props, extraValidations);

        // Create static columns (if applicable)
        const columns = getColumns(props.columnList, this.staticColumns);

        // Create store
        const storeOpts: NodeStoreConstructorOptions = {
            validationMessages,
            validColumns: !this.staticColumns,
            selectFirstOnSingle: this.props.selectSelectFirstOnSingle && this.props.selectMode === "single",
            columns,
            expanderFunction: this.expanderFunction,
            childLoader: this.loadChildData,
            debug: this.debug
        };

        this.store = new NodeStore(storeOpts);
    }

    // **********************
    // DEFAULT REACT METHODS
    // **********************

    componentDidUpdate(): void {
        if (this.widgetId) {
            const domNode = findDOMNode(this);
            // @ts-ignore
            domNode.setAttribute("widgetId", this.widgetId);
        }
    }

    componentWillReceiveProps(nextProps: MxTreeTableContainerProps): void {
        if (!this.widgetId) {
            const domNode = findDOMNode(this);
            // @ts-ignore
            this.widgetId = domNode.getAttribute("widgetId") || undefined;
        }

        this.store.setContext(nextProps.mxObject);

        if (nextProps.mxObject) {
            this.store.setLoading(true);
            if (!this.staticColumns && this.columnPropsValid) {
                this.getColumnsFromDatasource(nextProps.mxObject)
                    .then(() => this.fetchData(nextProps.mxObject));
            } else {
                this.fetchData(nextProps.mxObject);
            }
        } else {
            this.store.setLoading(false);
        }
    }

    render(): ReactNode {
        const {
            uiShowHeader,
            selectMode,
            selectActionButtons,
            selectClickSelect,
            selectHideCheckboxes,
            selectOnChangeAction
        } = this.props;
        const { validColumns, validationMessages, removeValidationMessage, isLoading, selectFirstOnSingle } = this.store;
        const fatalValidations = validationMessages.filter(m => m.fatal);

        const buttonBar = this.getButtons(selectActionButtons);

        let selectionMode = selectMode;
        if (
            selectMode !== "none" &&
            buttonBar === null &&
            !(selectClickSelect && selectMode === "single") &&
            selectOnChangeAction === "nothing"
        ) {
            selectionMode = "none";
        }

        if (!validColumns && fatalValidations) {
            return (
                <div className={"widget-treetable-alert"}>
                    <Alerts validationMessages={fatalValidations} remove={removeValidationMessage} />
                </div>
            )
        }

        return createElement(TreeTable, {
            store: this.store,
            className: this.props.class,
            expanderFunc: this.expanderFunction,
            // onClick: this.onClick,
            // onDblClick: this.onDblClick,
            showHeader: uiShowHeader,
            selectMode: selectionMode,
            // onSelect: this.onSelect,
            loading: isLoading,
            buttonBar,
            clickToSelect: selectClickSelect,
            hideSelectBoxes: selectHideCheckboxes,
            selectFirst: selectFirstOnSingle
        });
    }

    // **********************
    // COLUMNS
    // **********************

    private async _getColumnsFromDatasource(mxObject?: mendix.lib.MxObject): Promise<void> {
        if (!mxObject) {
            return;
        }

        const {
            nodeEntity,
            columnMethod,
            columnHeaderMicroflow,
            // columnHeaderNanoflow,
            columnHeaderAttrAttribute,
            columnHeaderLabelAttribute,
            columnHeaderClassAttribute
        } = this.props;

        const action: Action = {

        };

        if (columnMethod === "microflow" && columnHeaderMicroflow) {
            action.microflow = columnHeaderMicroflow;
        } else {
            // TODO: Alert that something is wrong;
            return;
        }

        const headerObjects = await this.executeAction(action, true, mxObject) as mendix.lib.MxObject[];

        if (headerObjects && headerObjects.length > 0) {
            const nodeMetaEntity = window.mx.meta.getEntity(nodeEntity);
            const columns: TreeColumnProps[] = [];

            headerObjects.forEach(obj => {
                const headerAttribute = obj.get(columnHeaderAttrAttribute);
                // TODO fix the MxMetaObject, should have this method
                // @ts-ignore
                if (typeof headerAttribute === "string" && headerAttribute && nodeMetaEntity.has(headerAttribute)) {
                    const headerProps: TreeColumnProps = {
                        id: createCamelcaseId(headerAttribute),
                        originalAttr: headerAttribute,
                        label: obj.get(columnHeaderLabelAttribute) as string,
                        guid: obj.getGuid(),
                        width: null
                    };
                    if (typeof columnHeaderClassAttribute === "string" && columnHeaderClassAttribute) {
                        headerProps.className = obj.get(columnHeaderClassAttribute) as string;
                    }
                    columns.push(headerProps);
                }
            });

            this.store.setColumns(columns);
            this.store.setValidColumns(true);
        } else {
            this.store.setValidColumns(false);
            this.store.addValidationMessage(new ValidationMessage("No dynamic columns loaded, not showing table"));
        }

        this.store.setSelectFirstOnSingle(this.props.selectSelectFirstOnSingle && this.props.selectMode === "single");
    }

    // **********************
    // DATA
    // **********************

    private async _fetchData(mxObject?: mendix.lib.MxObject): Promise<void> {
        try {
            let objects: mendix.lib.MxObject[] = [];
            if (this.props.dataSource === "xpath" && this.props.nodeEntity && mxObject) {
                objects = await fetchByXpath(mxObject, this.props.nodeEntity, this.props.constraint) as mendix.lib.MxObject[];
            } else if (this.props.dataSource === "mf" && this.props.getDataMf) {
                objects = (await this.executeAction(
                    { microflow: this.props.getDataMf },
                    false,
                    mxObject
                )) as mendix.lib.MxObject[];
            } else if (this.props.dataSource === "nf" && this.props.getDataNf && this.props.getDataNf.nanoflow) {
                objects = (await this.executeAction(
                    { nanoflow: this.props.getDataNf },
                    false,
                    mxObject
                )) as mendix.lib.MxObject[];
            } else {
                this.store.setLoading(false);
            }

            if (objects !== null) {
                this.handleData(objects, null, -1);
            } else {
                this.handleData([], null, -1);
            }

        } catch (error) {
            window.mx.ui.error("An error occurred while executing retrieving data: ", error);
        }
    }

    private async _handleData(objects: mendix.lib.MxObject[], parentKey?: string | null, level?: number): Promise<void> {
        this.debug("handleData", objects, parentKey, level);

        try {
            const rowObjects = await Promise.all(objects.map(obj => this.convertMxObjectToRow(obj, parentKey)));
            this.store.setRows(rowObjects, level);
            this.store.setLoading(false);

        } catch (error) {
            window.mx.ui.error("An error occurred while handling data: ", error);
        }
    }

    private async _loadChildData(guids: string[], parentKey: string): Promise<void> {
        try {
            const objects = await getObjects(guids);
            if (objects) {
                this.handleData(objects, parentKey);
            }
        } catch (error) {
            console.log(error);
        }

    }

    private async _convertMxObjectToRow(mxObject: mendix.lib.MxObject, parentKey?: string | null): Promise<RowObject> {
        const attributes = mxObject.getAttributes();
        const referenceObjects =
            this.referenceAttr !== "" && -1 < attributes.indexOf(this.referenceAttr)
                ? mxObject.getReferences(this.referenceAttr)
                : [];

        let childAttrValue: string | number | boolean | undefined;
        if (this.hasChildAttr) {
            childAttrValue = await fetchAttr(mxObject, this.hasChildAttr);
        }

        let appendIcon: string | null = null;

        if (this.props.uiRowIconAttr) {
            appendIcon = (await fetchAttr(mxObject, this.props.uiRowIconAttr)) as string | null;
        }

        const keyPairValues = await this.getObjectKeyPairs(mxObject, appendIcon);

        const retObj: RowObject = defaults(
            {
                key: mxObject.getGuid()
            },
            keyPairValues
        );

        if (this.props.uiRowClassAttr) {
            const className = (await fetchAttr(mxObject, this.props.uiRowClassAttr)) as
                | string
                | null;
            if (className) {
                retObj._className = className;
            }
        }

        if (appendIcon) {
            const prefix = this.props.uiIconPrefix || "glyphicon glyphicon-";
            retObj._icon = `${prefix}${appendIcon}`;
        }

        if (referenceObjects && 0 < referenceObjects.length) {
            retObj._mxReferences = referenceObjects;
            retObj.children = [];
        } else if (childAttrValue) {
            retObj._mxHasChildren = true;
            retObj.children = [];
        }

        if (typeof parentKey !== "undefined" && parentKey !== null) {
            retObj._parent = parentKey;
        }

        return retObj;
    }

    private _getObjectKeyPairs(
        obj: mendix.lib.MxObject,
        appendIcon: string | null
    ): Promise<{ [key: string]: string | number | boolean }> {
        const attributes = obj.getAttributes();
        const { columns } = this.store;
        return Promise.all(
            columns.map(async (col: TreeColumnProps, index: number) => {
                if (col.originalAttr && -1 < attributes.indexOf(col.originalAttr)) {
                    const key = col.id;
                    const formatted = await this.getFormattedOrTransformed(obj, col.originalAttr);
                    const retVal: { [key: string]: string | number | boolean | ReactNode } = {};
                    if (appendIcon && index === 0) {
                        const prefix = this.props.uiIconPrefix || "glyphicon glyphicon-";
                        retVal[key] = (
                            <div className="ant-table-cell-with-icon">
                                <i className={`ant-table-cell-icon ${prefix}${appendIcon}`} />
                                {formatted}
                            </div>
                        );
                    } else {
                        retVal[key] = formatted;
                    }
                    return retVal;
                } else {
                    return {};
                }
            })
        ).then(objects => {
            return defaults({}, ...objects);
        });
    }

    private _getFormattedOrTransformed(obj: mendix.lib.MxObject, attr: string): Promise<string | number | boolean> {
        if (this.transformNanoflows[attr] && typeof this.transformNanoflows[attr].nanoflow !== "undefined") {
            return this.executeAction({
                nanoflow: this.transformNanoflows[attr]
            }, true, obj) as Promise<string>;
        }
        const res = getFormattedValue(obj, attr);
        return Promise.resolve(res);
    }

    private async _expanderFunction(record: TableRecord | RowObject, level: number): Promise<void> {
        try {
            if (typeof record._mxReferences !== "undefined" && record._mxReferences.length > 0) {
                this.store.setLoading(true);
                const guids = record._mxReferences as string[];
                const mxRowObjects = await getObjects(guids);
                if (mxRowObjects) {
                    this.handleData(mxRowObjects, record.key, level);
                }
                this.store.setLoading(false);
            } else if (record._mxHasChildren && record.key) {
                const mxNodeObject = await getObject(record.key);
                if (!mxNodeObject) {
                    return;
                }
                const action: Action = {};

                if (this.props.childMethod === "microflow" && this.props.getChildMf) {
                    action.microflow = this.props.getChildMf;
                } else if (this.props.childMethod === "nanoflow" && this.props.getChildNf && this.props.getChildNf.nanoflow) {
                    action.nanoflow = this.props.getChildNf;
                }

                if (action.microflow || action.nanoflow) {
                    this.store.setLoading(true);
                    const mxObjects = await this.executeAction(action, true, mxNodeObject) as mendix.lib.MxObject[];
                    this.handleData(mxObjects, record.key, level);
                    this.store.setLoading(false);
                }
            }
        } catch (error) {
            mx.ui.error(`An error occurred while retrieving child items for ${record.key}: ${error}`);
            this.store.setLoading(false);
        }
    }

    // **********************
    // BUTTONS
    // **********************

    private _getButtons(actionButtons: ActionButtonProps[]): ReactNode {
        const selectedObjects = this.store.selectedRows;
        const filteredButtons = actionButtons
            .filter(
                button =>
                    button.selectABLabel &&
                    (button.selectABMicroflow || (button.selectABNanoflow && button.selectABNanoflow.nanoflow))
            )
            .map(button => {
                const { selectABAction, selectABMicroflow, selectABNanoflow } = button;

                const disabled = !(selectedObjects && selectedObjects.length > 0);

                const buttonProp: ButtonBarButtonProps = {
                    caption: button.selectABLabel,
                    disabled,
                    hidden: button.selectABHideOnNotApplicable && disabled,
                    onClick: () => {
                        const selectedObjects = this.store.selectedRows;

                        if (selectedObjects.length > 0) {
                            if (selectABAction === "mf" && selectABMicroflow) {
                                // this.selectionAction(selectedObjects, selectABMicroflow, null);
                            } else if (selectABAction === "nf" && selectABNanoflow) {
                                // this.selectionAction(selectedObjects, null, selectABNanoflow);
                            }
                        }
                    }
                };

                if (button.selectABClass) {
                    buttonProp.className = button.selectABClass;
                }

                return buttonProp;
            });
        if (filteredButtons.length === 0) {
            return null;
        }
        return createElement(ButtonBar, {
            className: "widget-treetable-buttonbar",
            buttons: filteredButtons
        });
    }

    // **********************
    // VALIDATIONS
    // **********************

    private getMXValidations(props: MxTreeTableContainerProps): ExtraMXValidateProps {
        const extraProps: ExtraMXValidateProps = {};
        const { helperEntity } = props;

        if (helperEntity !== "") {
            const entity = window.mx.meta.getEntity(helperEntity);
            extraProps.helperObjectPersistence = entity.isPersistable();
        }

        return extraProps;
    }

    // **********************
    // OTHER METHODS
    // **********************

    private setTransFormColumns(columns: TreeviewColumnProps[]): void {
        this.transformNanoflows = {};
        columns.forEach(column => {
            if (column.transformNanoflow) {
                this.transformNanoflows[column.columnAttr] = column.transformNanoflow;
            }
        });
    }

    private _executeAction(action: Action, showError = false, obj?: mendix.lib.MxObject): Promise<ActionReturn> {
        this.debug("executeAction", action, obj && obj.getGuid());
        const { mxform } = this.props;
        const context = getObjectContextFromObjects(obj, this.props.mxObject);

        if (action.microflow) {
            return executeMicroflow(action.microflow, context, mxform, showError);
        } else if (action.nanoflow) {
            return executeNanoFlow(action.nanoflow, context, mxform, showError);
        } else if (action.page) {
            return openPage(action.page, context, showError);
        }

        return Promise.reject(
            new Error(`No microflow/nanoflow/page defined for this action: ${JSON.stringify(action)}`)
        );
    }

    private _debug(...args: unknown[]): void {
        const id = this.props.friendlyId || this.widgetId;
        if (window.logger) {
            window.logger.debug(`${id}:`, ...args);
        }
    }
}

export default hot(MxTreeTable);
