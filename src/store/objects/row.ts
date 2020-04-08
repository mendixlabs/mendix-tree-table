import { observable, action, computed, flow } from "mobx";

export interface RowObjectOptions {
    mxObject: mendix.lib.MxObject;
    attrValueGetter: (obj: mendix.lib.MxObject, attr: string) => Promise<string | number | boolean>

    isRoot?: boolean;
    parent?: string;
    changeHandler?: (guid?: string, removedCb?: (removed: boolean) => void) => void | Promise<void>;
}

export class RowObject {
    public _obj: mendix.lib.MxObject;
    public _subscriptions: number[] = [];

    public _changeHandler: (guid?: string, removedCb?: (removed: boolean) => void) => void;
    public _attrValueGetter: (obj: mendix.lib.MxObject, attr: string) => Promise<string | number | boolean>;

    @observable _parent: string;
    @observable _isRoot: boolean;
    @observable _expanded: boolean;
    @observable _selected: boolean;
    @observable _keyValPairs: { [key: string]: string | number | boolean };

    fixAttributes = flow(function*(this: RowObject) {
        // TODO
    });

    constructor({
        mxObject,
        attrValueGetter,
        isRoot = false,
        parent = "",
        changeHandler = (): void => {}
    }: RowObjectOptions) {

        this._obj = mxObject;
        this._parent = parent;
        this._isRoot = isRoot;
        this._expanded = false;
        this._selected = false;
        this._keyValPairs = {};

        this._changeHandler = changeHandler;
        this._attrValueGetter = attrValueGetter;

        this.resetSubscription();
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
                            // this.setAttributes();
                            // this.fixTitle();
                        }
                    });
                }
            });
            this._subscriptions.push(subscription);
        }
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
}
