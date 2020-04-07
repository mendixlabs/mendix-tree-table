import { observable, action, configure, computed, toJS } from "mobx";
import { ValidationMessage } from "@jeltemx/mendix-react-widget-utils/lib/validation";
import { TreeColumnProps, getTreeTableColumns, TableRecord } from '../util/columns';
import { ColumnProps } from "antd/es/table";
// import arrayToTree, { Tree } from "array-to-tree";
import { RowObject } from '../util/rows';
import arrayToTree, { Tree } from "array-to-tree";

configure({ enforceActions: "observed" });

export interface TreeGuids {
    context: string | null;
    entries?: string[];
}

export interface NodeStoreConstructorOptions {
    contextObject?: mendix.lib.MxObject;
    columns: TreeColumnProps[];
    validColumns: boolean;
    selectFirstOnSingle: boolean;
    validationMessages: ValidationMessage[];

    childLoader: (guids: string[], parentKey: string) => Promise<void>;
    expanderFunction(record: TableRecord | RowObject, level: number): Promise<void>;
    debug: (...args: unknown[]) => void;
}

// const arrayToTreeOpts = {
//     parentProperty: "parent",
//     customID: "guid"
// };

export class NodeStore {
    public debug: (...args: unknown[]) => void;

    @observable public contextObject: mendix.lib.MxObject | null;
    @observable public isLoading = false;
    @observable public validationMessages: ValidationMessage[] = [];
    @observable public columns: TreeColumnProps[] = [];
    @observable public rows: RowObject[] = [];
    @observable public selectedRows: string[] = [];
    @observable public expandedRows: string[] = [];
    @observable public validColumns = true;
    @observable public selectFirstOnSingle = false;
    @observable public lastLoadFromContext: number | null;

    private childLoader: (guids: string[], parentKey: string) => Promise<void>;
    private expanderFunction: (record: TableRecord | RowObject, level: number) => Promise<void>;

    constructor(opts: NodeStoreConstructorOptions) {
        const {
            contextObject,
            columns,
            validColumns,
            selectFirstOnSingle,
            childLoader,
            expanderFunction,
            debug
        } = opts;

        this.contextObject = contextObject || null;
        this.columns = columns;
        this.validColumns = validColumns;
        this.selectFirstOnSingle = selectFirstOnSingle;
        this.lastLoadFromContext = null;
        this.childLoader = childLoader;
        this.expanderFunction = expanderFunction;
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
        this.lastLoadFromContext = +(new Date());
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
                    const hasRows = currentRows.filter(row => row._parent && row._parent === obj.key).length >
                    0;
                    if (hasRows && unFoundRows.length > 0) {
                        // Node has children, but some references that have not been loaded yet. Load them all;
                        this.childLoader(unFoundRows, obj.key);
                    }
                }
                currentRows.splice(objIndex, 1, obj);
            }
        });
        this.rows = currentRows;
        if (level === -1) {
            this.setLastLoadFromContext();
        }
    }

    @action
    setExpanded(keys: string[]) {
        this.expandedRows = keys;
    }

    @action
    setSelected(keys: string[]) {
        this.selectedRows = keys;
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
    get rowTree(): Tree<RowObject[]> {
        this.debug("store: rowTree")
        const arrayToTreeOpts = {
            parentProperty: "_parent",
            customID: "key"
        };
        const tree = arrayToTree(toJS(this.rows), arrayToTreeOpts);

        // When creating the tree, it cann be possible to get orphaned children (a node that has a parent id, but parent removed).
        // We filter these top level elements from the tree, as they are no longer relevant

        return tree.filter(treeEl => typeof treeEl._parent === "undefined" && !treeEl._parent);
    }
}
