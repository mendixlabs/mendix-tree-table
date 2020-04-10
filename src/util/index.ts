// @ts-ignore
import { camel } from "@thi.ng/strings";

export const createCamelcaseId = (str: string): string => {
    const camelCased = camel(str);
    if ("id" === camelCased) {
        return "idId";
    }
    if ("key" === camelCased) {
        return "keyId";
    }
    return camelCased;
};

type ReferencePart = "referenceAttr" | "entity";

export const getReferencePart = (reference = "", part: ReferencePart = "referenceAttr"): string => {
    const partNum = part === "referenceAttr" ? 0 : 1;
    const parts = reference.split("/");
    if (reference === "" || parts.length < partNum + 1) {
        return "";
    }
    return parts[partNum];
};
