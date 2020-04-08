export interface TreeRowObject {
    key: string;
    _parent?: string;
    _icon?: string;
    _mxReferences?: string[];
    children?: [];
    [other: string]: any;
}

export const getFormattedValue = (obj: mendix.lib.MxObject, attr: string): string | number | boolean => {
    const type = obj.getAttributeType(attr);
    const ret = obj.get(attr);
    if (type === "Enum") {
        return obj.getEnumCaption(attr, ret as string);
    } else if (type === "Boolean") {
        return ret ? "True" : "False";
    } else if (type === "Date" || type === "DateTime") {
        return window.mx.parser.formatValue(ret, type.toLowerCase());
    }
    return ret.valueOf ? ret.valueOf() : ret;
};
