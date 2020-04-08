import { observable, action, configure, computed, toJS } from "mobx";
import { ValidationMessage } from "@jeltemx/mendix-react-widget-utils/lib/validation";
import { TreeColumnProps, getTreeTableColumns, TableRecord } from "../util/columns";
import { ColumnProps } from "antd/es/table";
// import arrayToTree, { Tree } from "array-to-tree";
import { RowObject } from "../util/rows";
import arrayToTree, { Tree } from "array-to-tree";
import { getObject } from "@jeltemx/mendix-react-widget-utils";

configure({ enforceActions: "observed" });

export interface TreeGuids {
    context: string | null;
    rows: string[];
    columns: string[];
}

export interface MockStore {
    rowTree: RowObject[];
    setSelected: (keys?: string[]) => void;
    setExpanded: (keys?: string[]) => void;
    lastLoadFromContext: number | null;
    selectedRows: string[];
    expandedKeys: string[];
    treeTableColumns: Array<ColumnProps<TableRecord>>;
    validationMessages: ValidationMessage[];
    removeValidationMessage: (id: string) => void;
    isLoading: boolean;
}

export interface NodeStoreConstructorOptions {
    contextObject?: mendix.lib.MxObject;
    columns: TreeColumnProps[];
    validColumns: boolean;
    selectFirstOnSingle: boolean;
    validationMessages: ValidationMessage[];

    childLoader: (guids: string[], parentKey: string) => Promise<void>;
    expanderFunction(record: TableRecord | RowObject, level: number): Promise<void>;
    rowSubscriptionHandler: (obj: mendix.lib.MxObject, row: RowObject) => void;
    resetColumns: (col: string) => void;
    reset: () => void;
    debug: (...args: unknown[]) => void;
}

// const arrayToTreeOpts = {
//     parentProperty: "parent",
//     customID: "guid"
// };

export class NodeStore {
    public debug: (...args: unknown[]) => void;
    public hasChildren = this._hasChildren.bind(this);

    @observable public contextObject: mendix.lib.MxObject | null;
    @observable public isLoading = false;
    @observable public validationMessages: ValidationMessage[] = [];
    @observable public columns: TreeColumnProps[] = [];
    @observable public rows: RowObject[] = [];
    @observable public selectedRows: string[] = [];
    @observable public expandedRows: string[] = [];
    @observable public validColumns = true;
    @observable public selectFirstOnSingle = false;
    @observable public lastLoadFromContext: number | null = null;
    @observable public subscriptionHandles: number[] = [];

    private childLoader: (guids: string[], parentKey: string) => Promise<void>;
    private expanderFunction: (record: TableRecord | RowObject, level: number) => Promise<void>;
    private rowSubscriptionHandler: (obj: mendix.lib.MxObject, row: RowObject) => void;
    private reset: () => void;
    private resetColumns: (col: string) => void;

    constructor(opts: NodeStoreConstructorOptions) {
        const {
            contextObject,
            columns,
            validColumns,
            selectFirstOnSingle,
            childLoader,
            expanderFunction,
            rowSubscriptionHandler,
            resetColumns,
            reset,
            debug
        } = opts;

        this.contextObject = contextObject || null;
        this.columns = columns;
        this.validColumns = validColumns;
        this.selectFirstOnSingle = selectFirstOnSingle;
        this.childLoader = childLoader;
        this.expanderFunction = expanderFunction;
        this.rowSubscriptionHandler = rowSubscriptionHandler;
        this.resetColumns = resetColumns;
        this.reset = reset;
        this.debug = debug || ((): void => {});
    }

    // **********************
    // ACTIONS
    // **********************

    @action
    setContext(obj?: mendix.lib.MxObject): void {
        this.debug("Store: setContext", obj);
        this.contextObject = obj || null;
    }

    @action
    setLoading(state: boolean): void {
        this.isLoading = state;
    }

    @action
    addValidationMessage(message: ValidationMessage): void {
        this.validationMessages.push(message);
    }

    @action
    removeValidationMessage(id: string): void {
        const messages = [...this.validationMessages];
        const found = messages.findIndex(m => m.id === id);
        if (found !== -1) {
            messages.splice(found, 1);
            this.validationMessages = messages;
        }
    }

    @action
    setColumns(columns: TreeColumnProps[]): void {
        this.columns = columns;
    }

    @action
    setValidColumns(state: boolean): void {
        this.validColumns = state;
    }

    @action
    setSelectFirstOnSingle(state: boolean): void {
        this.selectFirstOnSingle = state;
    }

    @action
    setLastLoadFromContext(): void {
        this.lastLoadFromContext = +new Date();
    }

    @action
    setRows(rowObjects: RowObject[], level?: number): void {
        this.debug("store: setRows", rowObjects, level);
        const currentRows: RowObject[] = level === -1 ? [] : [...this.rows];
        rowObjects.forEach(obj => {
            const objIndex = currentRows.findIndex(row => row.key === obj.key);
            if (objIndex === -1) {
                currentRows.push(obj);
                if (typeof level !== "undefined" && level > 0 && obj.key) {
                    this.expanderFunction(obj, level - 1);
                }
            } else {
                if (obj._mxReferences && obj._mxReferences.length > 0) {
                    // Are there reference that have not been loaded yet?
                    const unFoundRows = obj._mxReferences.filter(
                        o => currentRows.filter(c => c.key === o).length === 0
                    );
                    // Does this node already have nodes loaded?
                    const hasRows = currentRows.filter(row => row._parent && row._parent === obj.key).length > 0;
                    if (hasRows && unFoundRows.length > 0) {
                        // Node has children, but some references that have not been loaded yet. Load them all;
                        this.childLoader(unFoundRows, obj.key);
                    }
                }
                currentRows.splice(objIndex, 1, obj);
            }
        });
        this.rows = currentRows;
        this.resetSubscriptions();
        if (level === -1) {
            this.setLastLoadFromContext();
        }
    }

    @action
    removeRow(row: RowObject): void {
        const rows = [...this.rows];
        const index = rows.findIndex(rowObj => rowObj.key === row.key);

        if (index !== -1) {
            rows.splice(index, 1);
            const selected = [...this.selectedRows];
            const findSelected = selected.findIndex(val => val === row.key);
            if (findSelected !== -1) {
                selected.splice(findSelected, 1);
            }

            this.rows = rows;
            this.selectedRows = selected;
        }

        this.resetSubscriptions();
    }

    @action
    setExpanded(keys?: string[]): void {
        this.debug("store: setExpanded", keys);
        this.expandedRows = keys || [];
    }

    @action
    setSelected(keys?: string[]): void {
        this.debug("store: setSelected", keys);
        this.selectedRows = keys || [];
    }

    @action
    clearSubscriptions(): void {
        this.debug("store: clearSubscriptions");
        if (this.subscriptionHandles && this.subscriptionHandles.length > 0) {
            this.subscriptionHandles.forEach(window.mx.data.unsubscribe);
            this.subscriptionHandles = [];
        }
    }

    @action
    resetSubscriptions(): void {
        this.clearSubscriptions();
        this.debug("store: resetSubscriptions");

        const { subscribe } = window.mx.data;

        if (this.contextObject && this.contextObject.getGuid) {
            const guid = this.contextObject.getGuid();
            this.subscriptionHandles.push(
                subscribe({
                    callback: () => {
                        this.debug(`store: subcription fired context ${guid}`);
                        this.clearSubscriptions();
                        this.reset();
                    },
                    guid
                })
            );
        }

        if (this.rows && this.rows.length > 0) {
            this.rows.forEach(row => {
                this.subscriptionHandles.push(
                    subscribe({
                        guid: row.key,
                        callback: async () => {
                            this.debug(`store: subcription fired row ${row.key}`);
                            try {
                                const rowObj = await getObject(row.key);
                                // object is removed
                                if (rowObj === null) {
                                    this.removeRow(row);
                                } else {
                                    this.rowSubscriptionHandler(rowObj, row);
                                }
                            } catch (error) {
                                window.mx.ui.error(`Error while handling row with guid ${row.key}`);
                            }
                        }
                    })
                );
            });
        }

        if (this.tableGuids && this.tableGuids.columns && this.tableGuids.columns.length > 0) {
            this.tableGuids.columns.forEach(col => {
                this.subscriptionHandles.push(
                    subscribe({
                        guid: col,
                        callback: () => {
                            this.debug(`store: subcription fired col ${col}`);
                            this.resetColumns(col);
                        }
                    })
                );
            });
        }
    }

    // **********************
    // COMPUTED
    // **********************

    @computed
    get disabled(): boolean {
        const fatalCount = this.validationMessages.filter(m => m.fatal).length;
        return fatalCount > 0 || this.contextObject === null;
    }

    @computed
    get treeTableColumns(): Array<ColumnProps<TableRecord>> {
        return getTreeTableColumns(this.columns);
    }

    @computed
    get expandedKeys(): string[] {
        return toJS(this.expandedRows);
    }

    @computed
    get rowTree(): Tree<RowObject[]> {
        this.debug("store: rowTree");
        const arrayToTreeOpts = {
            parentProperty: "_parent",
            customID: "key"
        };
        const tree = arrayToTree(toJS(this.rows), arrayToTreeOpts);

        // When creating the tree, it cann be possible to get orphaned children (a node that has a parent id, but parent removed).
        // We filter these top level elements from the tree, as they are no longer relevant

        return tree.filter(treeEl => typeof treeEl._parent === "undefined" && !treeEl._parent);
    }

    @computed
    get tableGuids(): TreeGuids {
        const columns = this.columns.filter(col => col.guid !== null).map(col => col.guid) as string[];

        return {
            context: this.contextObject ? this.contextObject.getGuid() : null,
            rows: this.rows.map(row => row.key),
            columns
        };
    }

    private _hasChildren(row: RowObject): boolean {
        return this.rows.filter(findRow => findRow._parent && findRow._parent === row.key).length > 0;
    }
}
