import { observable, action, computed, flow, toJS } from "mobx";

export interface RowObjectOptions {
    mxObject: mendix.lib.MxObject;
    createTreeRowObject: (mxObject: mendix.lib.MxObject, parentKey?: string | null) => Promise<TreeRowObject>;

    isRoot?: boolean;
    parent?: string | null;
    changeHandler?: (guid?: string, removedCb?: (removed: boolean) => void) => void | Promise<void>;
}

export interface TreeRowObject {
    key: string;
    _parent?: string;
    _icon?: string;
    _mxReferences?: string[];
    children?: [];
    [other: string]: any;
}

export class RowObject {
    public _obj: mendix.lib.MxObject;
    public _subscriptions: number[] = [];

    public _changeHandler: (guid?: string, removedCb?: (removed: boolean) => void) => void;
    public _createTreeRowObject: (mxObject: mendix.lib.MxObject, parentKey?: string | null) => Promise<TreeRowObject>;

    @observable _parent: string | null;
    @observable _isRoot: boolean;
    @observable _expanded: boolean;
    @observable _selected: boolean;
    @observable _keyValPairs: TreeRowObject;

    fixAttributes = flow(function*(this: RowObject) {
        const treeRowObject = (yield this._createTreeRowObject(this._obj, this._parent)) as TreeRowObject;
        this._keyValPairs = treeRowObject;
    });

    constructor({
        mxObject,
        createTreeRowObject,
        isRoot = false,
        parent = null,
        changeHandler = (): void => {}
    }: RowObjectOptions) {
        this._obj = mxObject;
        this._parent = parent;
        this._isRoot = isRoot;
        this._expanded = false;
        this._selected = false;
        this._keyValPairs = { key: this._obj.getGuid() };

        this._changeHandler = changeHandler;
        this._createTreeRowObject = createTreeRowObject;

        this.resetSubscription();
        this.fixAttributes();
    }

    @action
    clearSubscriptions(): void {
        const { unsubscribe } = window.mx.data;
        this._subscriptions.forEach(subscription => unsubscribe(subscription));
        this._subscriptions = [];
    }

    @action
    resetSubscription(): void {
        const { subscribe } = window.mx.data;
        this.clearSubscriptions();
        if (this._obj) {
            const subscription = subscribe({
                guid: this._obj.getGuid(),
                callback: guid => {
                    if (window.logger) {
                        window.logger.debug(`TreeTable subscription fired row: ${guid}`);
                    }
                    this._changeHandler(`${guid}`, removed => {
                        if (removed) {
                            if (window.logger) {
                                window.logger.debug(`Removed row: ${guid}`);
                            }
                        } else {
                            this.fixAttributes();
                            // this.fixTitle();
                        }
                    });
                }
            });
            this._subscriptions.push(subscription);
        }
    }

    @action
    setRoot(state = false): void {
        this._isRoot = state;
    }

    @action
    setMendixObject(obj: mendix.lib.MxObject): void {
        this._obj = obj;
        this.fixAttributes();
    }

    @action
    setParent(state: string | null = null): void {
        this._parent = state;
    }

    @action
    setSelected(state = false): void {
        this._selected = state;
    }

    @action
    setExpanded(state = false): void {
        this._expanded = state;
    }

    @computed
    get key(): string {
        return this._obj.getGuid();
    }

    @computed
    get selected(): boolean {
        return this._selected;
    }

    @computed
    get expanded(): boolean {
        return this._expanded;
    }

    @computed
    get treeObject(): TreeRowObject {
        const keyVals = this._keyValPairs;
        keyVals.key = this.key;
        if (this._parent) {
            keyVals._parent = this._parent;
        }
        return toJS(keyVals);
    }
}
