import { createCamelcaseId } from ".";
import { TreeviewColumnProps } from "../../typings/MxTreeTableProps";
import { ColumnProps } from "antd/es/table";

export interface TreeColumnProps {
    id: string;
    label: string;
    width: string | null;
    originalAttr: string;
    guid: string | null;
    className?: string | null;
}

export interface TableRecord {
    key: string;
    children?: string[];
    _mxReferences?: string[];
    _className?: string;
    [other: string]: any;
}

export const getColumns = (columns: TreeviewColumnProps[], isStatic = true): TreeColumnProps[] => {
    if (!isStatic) {
        return [];
    }
    const newColumns = columns.map(column => {
        const id = createCamelcaseId(column.columnAttr);
        const tableColumn: TreeColumnProps = {
            id,
            label: column.columnHeader,
            originalAttr: column.columnAttr,
            width: column.columnWidth && column.columnWidth !== "" ? column.columnWidth : null,
            guid: null,
            className: column.columnClassName ? column.columnClassName : null
        };
        return tableColumn;
    });
    return newColumns;
}

export const getTreeTableColumns =  (columns: TreeColumnProps[]): Array<ColumnProps<TableRecord>> => {
    return columns.map(col => {
        const treeColumn: ColumnProps<TableRecord> = {
            key: col.id,
            dataIndex: col.id,
            title: col.label
        };
        if (col.width && col.width !== null) {
            const parsed = parseInt(col.width, 10);
            treeColumn.width = !isNaN(parsed) && `${parsed}` === col.width ? parsed : col.width;
        }
        if (col.className) {
            treeColumn.className = col.className;
        }
        return treeColumn;
    });
}
