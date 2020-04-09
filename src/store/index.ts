import { observable, action, configure, computed, toJS } from "mobx";
import { ColumnProps } from "antd/es/table";
import arrayToTree, { Tree } from "array-to-tree";
import { ValidationMessage, getObject } from "@jeltemx/mendix-react-widget-utils";
import { TreeColumnProps, getTreeTableColumns, TableRecord } from "../util/columns";
import { RowObject, TreeRowObject } from "./objects/row";

configure({ enforceActions: "observed" });

export interface TreeGuids {
    context: string | null;
    rows: string[];
    columns: string[];
}

export interface MockStore {
    rowTree: TreeRowObject[];
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
    convertMxObjectToRow: (mxObject: mendix.lib.MxObject, parentKey?: string | null) => Promise<TreeRowObject>;
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
    public rowChangeHandler = this._rowChangeHandler.bind(this);

    @observable public contextObject: mendix.lib.MxObject | null;
    @observable public isLoading = false;
    @observable public validationMessages: ValidationMessage[] = [];
    @observable public columns: TreeColumnProps[] = [];
    @observable public rows: TreeRowObject[] = [];
    @observable public rowObjects: RowObject[] = [];
    @observable public validColumns = true;
    @observable public selectFirstOnSingle = false;
    @observable public lastLoadFromContext: number | null = null;
    @observable public subscriptionHandles: number[] = [];

    private childLoader: (guids: string[], parentKey: string) => Promise<void>;
    private convertMxObjectToRow: (mxObject: mendix.lib.MxObject, parentKey?: string | null) => Promise<TreeRowObject>;
    private reset: () => void;
    private resetColumns: (col: string) => void;

    constructor({
        contextObject,
        columns,
        validColumns,
        selectFirstOnSingle,
        childLoader,
        convertMxObjectToRow,
        resetColumns,
        reset,
        debug
    }: NodeStoreConstructorOptions) {
        this.contextObject = contextObject || null;
        this.columns = columns;
        this.validColumns = validColumns;
        this.selectFirstOnSingle = selectFirstOnSingle;
        this.childLoader = childLoader;
        this.convertMxObjectToRow = convertMxObjectToRow;
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
    setRowObjects(mxObjects: mendix.lib.MxObject[], level?: number, parent?: string | null): void {
        this.debug("store: setRowObjects", mxObjects, level);
        const currentRows: RowObject[] = level === -1 ? [] : [...this.rowObjects];
        mxObjects.forEach(mxObject => {
            const objIndex = currentRows.findIndex(row => row.key === mxObject.getGuid());
            if (objIndex === -1) {
                currentRows.push(
                    new RowObject({
                        mxObject,
                        createTreeRowObject: this.convertMxObjectToRow,
                        parent,
                        changeHandler: this.rowChangeHandler()
                    })
                );
                // TODO
                // if (typeof level !== "undefined" && level > 0 && obj.key) {
                //     // this.expanderFunction(obj, level - 1);
                // }
            } else {
                const rowObj = currentRows[objIndex];
                const references = rowObj._keyValPairs._mxReferences;
                if (references && references.length > 0) {
                    // Are there reference that have not been loaded yet?
                    const unFoundRows = references.filter(o => currentRows.filter(c => c.key === o).length === 0);
                    // Does this node already have nodes loaded?
                    const hasRows = currentRows.filter(row => row._parent && row._parent === rowObj.key).length > 0;
                    if (hasRows && unFoundRows.length > 0) {
                        // Node has children, but some references that have not been loaded yet. Load them all;
                        this.childLoader(unFoundRows, rowObj.key);
                    }
                }
                rowObj.resetSubscription();
                rowObj.fixAttributes();
            }
        });
        this.rowObjects = currentRows;
    }

    @action
    removeRowObject(guid: string): void {
        const rows = [...this.rowObjects];
        const index = rows.findIndex(rowObj => rowObj.key === guid);

        if (index !== -1) {
            const row = rows[index];
            rows.splice(index, 1);
            row.clearSubscriptions();
            if (row.selected) {
                // TODO trigger selection change
            }
            this.rowObjects = rows;
        }

        this.resetSubscriptions();
    }

    @action
    setExpanded(keys?: string[]): void {
        this.debug("store: setExpanded", keys);
        const current = this.expandedKeys;
        const newKeys = keys || [];

        const toRemove = current.filter(x => !newKeys.includes(x));
        const toAdd = newKeys.filter(x => !current.includes(x));

        toRemove.forEach(id => {
            const obj = this.findRowObject(id);
            if (obj) {
                obj.setExpanded(false);
            }
        });

        toAdd.forEach(id => {
            const obj = this.findRowObject(id);
            if (obj) {
                obj.setExpanded(true);
            }
        });
    }

    @action
    setSelected(keys?: string[]): void {
        this.debug("store: setSelected", keys);
        const current = this.selectedRows;
        const newKeys = keys || [];

        const toRemove = current.filter(x => !newKeys.includes(x));
        const toAdd = newKeys.filter(x => !current.includes(x));

        toRemove.forEach(id => {
            const obj = this.findRowObject(id);
            if (obj) {
                obj.setSelected(false);
            }
        });

        toAdd.forEach(id => {
            const obj = this.findRowObject(id);
            if (obj) {
                obj.setSelected(true);
            }
        });
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
        return toJS(this.rowObjects.filter(r => r.expanded).map(r => r.key));
    }

    @computed
    get selectedRows(): string[] {
        return toJS(this.rowObjects.filter(r => r.selected).map(r => r.key));
    }

    @computed
    get rowTree(): Tree<TreeRowObject[]> {
        const arrayToTreeOpts = {
            parentProperty: "_parent",
            customID: "key"
        };
        const tree = arrayToTree(toJS(this.rowObjects.map(r => r.treeObject)), arrayToTreeOpts);

        // When creating the tree, it can be possible to get orphaned children (a node that has a parent id, but parent removed).
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

    public findRowObject(guid: string): RowObject | null {
        if (!this.rowObjects) {
            return null;
        }
        const found = this.rowObjects.find(e => e.key === guid);
        return found || null;
    }

    private _hasChildren(row: TreeRowObject): boolean {
        return this.rows.filter(findRow => findRow._parent && findRow._parent === row.key).length > 0;
    }

    private _rowChangeHandler(): (guid: string, removedCB: (removed: boolean) => void) => Promise<void> {
        return async (guid: string, removedCB: (removed: boolean) => void): Promise<void> => {
            const object = await getObject(guid);
            if (object) {
                const found = this.rowObjects.find(entry => entry._obj.getGuid() === object.getGuid());
                if (found) {
                    found.setMendixObject(object);
                    if (removedCB) {
                        removedCB(false);
                    }
                }
            } else {
                this.removeRowObject(guid);
                if (removedCB) {
                    removedCB(true);
                }
            }
        };
    }
}
